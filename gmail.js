// Live backend: the official Gmail REST API, authorised through chrome.identity.launchWebAuthFlow.
// Same interface as DemoMail: connect, listThreads, getThread, modify.
const GmailMail = (() => {
  const API = 'https://gmail.googleapis.com/gmail/v1/users/me';
  const PAGE = 25;
  let token = null;

  // Sign-in: a Google pop-up via chrome.identity.launchWebAuthFlow and a "Web application" OAuth client
  // (works in any Chromium browser, Chrome profile signed in or not). Tokens last ~1 hour; renewal is silent.
  const SCOPE = 'https://www.googleapis.com/auth/gmail.modify';
  const TOK_KEY = 'ia.token';

  function cached() {
    try { const t = JSON.parse(localStorage.getItem(TOK_KEY)); return t && t.exp > Date.now() + 60e3 ? t.value : null; } catch { return null; }
  }
  function clearCached() { try { localStorage.removeItem(TOK_KEY); } catch {} }

  function getToken(interactive) {
    return new Promise((resolve, reject) => {
      if (!(window.chrome && chrome.identity)) return reject(new Error('Open this page from the extension (chrome.identity is missing).'));
      if (typeof WEB_CLIENT_ID === 'undefined' || /^PASTE_/.test(WEB_CLIENT_ID)) return reject(new Error('Add your Web application client ID to config.js (see README).'));
      const c = cached();
      if (c) return resolve(c);
      const params = new URLSearchParams({
        client_id: WEB_CLIENT_ID,
        response_type: 'token',
        redirect_uri: chrome.identity.getRedirectURL(),
        scope: SCOPE,
        include_granted_scopes: 'true',
      });
      if (!interactive) params.set('prompt', 'none');
      const hint = localStorage.getItem('ia.email');
      if (hint) params.set('login_hint', JSON.parse(hint));
      chrome.identity.launchWebAuthFlow({ url: 'https://accounts.google.com/o/oauth2/v2/auth?' + params, interactive }, (redirect) => {
        const err = chrome.runtime.lastError;
        if (err || !redirect) return reject(new Error((err && err.message) || 'Sign-in was cancelled'));
        const h = new URLSearchParams(new URL(redirect).hash.slice(1));
        if (h.get('error')) return reject(new Error('Google said: ' + h.get('error')));
        const value = h.get('access_token');
        if (!value) return reject(new Error('No access token in the reply'));
        try { localStorage.setItem(TOK_KEY, JSON.stringify({ value, exp: Date.now() + Number(h.get('expires_in') || 3600) * 1000 })); } catch {}
        resolve(value);
      });
    });
  }

  // Rate limit. Gmail allows 15,000 quota units per user per minute (250 a second on average) and checks it
  // over short windows, so a burst of parallel threads.get calls (10 units each) gets a 403/429
  // "Quota exceeded" even when the minute's total is far below the limit. Spend at most BUDGET units a second.
  const BUDGET = 150;
  const spent = []; // [timestamp, units]
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
  const cost = (path) => (path.startsWith('/messages/send') ? 100 : path === '/profile' || path.startsWith('/labels/') ? 1 : 10);
  async function throttle(units) {
    for (;;) {
      const now = Date.now();
      while (spent.length && now - spent[0][0] >= 1000) spent.shift();
      if (!spent.length || spent.reduce((a, x) => a + x[1], 0) + units <= BUDGET) { spent.push([now, units]); return; }
      await sleep(spent[0][0] + 1000 - now + 5);
    }
  }

  async function api(path, opts = {}, attempt = 0, authRetry = true) {
    if (!token) token = await getToken(false).catch(() => getToken(true));
    await throttle(cost(path));
    const r = await fetch(API + path, {
      ...opts,
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    });
    if (r.ok) return r.json();
    if (r.status === 401 && authRetry) {
      clearCached();
      token = null;
      return api(path, opts, attempt, false);
    }
    const text = await r.text();
    const limited = r.status === 429 || (r.status === 403 && /rateLimitExceeded|quota exceeded/i.test(text));
    if (limited && attempt < 5) {
      const wait = Math.min(16000, 1000 * 2 ** attempt) + Math.random() * 400; // 1, 2, 4, 8, 16 s
      window.dispatchEvent(new CustomEvent('gmail-wait', { detail: wait }));
      await sleep(wait);
      return api(path, opts, attempt + 1, authRetry);
    }
    if (limited) throw new Error('Gmail is rate-limiting this app. Wait a minute, then try again.');
    throw new Error('Gmail API ' + r.status + ': ' + text.slice(0, 200));
  }

  // Thread summaries, reused while the thread's historyId is unchanged (any new message or label change bumps it).
  const summaries = new Map();

  async function mapLimit(items, n, fn) {
    const out = new Array(items.length);
    let i = 0;
    const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
    });
    await Promise.all(workers);
    return out;
  }

  const header = (msg, name) => {
    const h = ((msg.payload && msg.payload.headers) || []).find((x) => x.name.toLowerCase() === name.toLowerCase());
    return h ? h.value : '';
  };

  function parseFrom(v) {
    const m = v.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>/);
    if (m) return { name: m[1].trim() || m[2], email: m[2] };
    return { name: v.trim(), email: v.trim() };
  }

  const decodeEntities = (s) => new DOMParser().parseFromString(s || '', 'text/html').documentElement.textContent;

  function summary(t) {
    const msgs = t.messages || [];
    const first = msgs[0], last = msgs[msgs.length - 1];
    const labels = new Set(msgs.flatMap((m) => m.labelIds || []));
    const from = parseFrom(header(last, 'From'));
    const unsub = msgs.map((m) => header(m, 'List-Unsubscribe')).find(Boolean) || '';
    const cat = labels.has('CATEGORY_PROMOTIONS') ? 'promo'
      : (labels.has('CATEGORY_UPDATES') || labels.has('CATEGORY_SOCIAL') || labels.has('CATEGORY_FORUMS')) ? 'update' : 'personal';
    return {
      category: cat,
      listUnsub: (unsub.match(/<(https?:[^>]+)>/) || [])[1] || (unsub ? 'yes' : ''),
      id: t.id,
      from: from.name,
      fromEmail: from.email,
      subject: header(first, 'Subject'),
      snippet: decodeEntities(last.snippet),
      date: Number(last.internalDate),
      count: msgs.length,
      unread: labels.has('UNREAD'),
      starred: labels.has('STARRED'),
      inInbox: labels.has('INBOX'),
    };
  }

  function b64(data) {
    const bin = atob(data.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  }

  function findBody(part) {
    let html = null, text = null;
    (function walk(p) {
      if (!p) return;
      if (p.mimeType === 'text/html' && p.body && p.body.data && !html) html = b64(p.body.data);
      else if (p.mimeType === 'text/plain' && p.body && p.body.data && !text) text = b64(p.body.data);
      (p.parts || []).forEach(walk);
    })(part);
    return html ? { html } : { text: text || '' };
  }

  return {
    live: true,
    async connect(interactive = true) {
      token = await getToken(false).catch((e) => (interactive ? getToken(true) : Promise.reject(e)));
      const p = await api('/profile');
      try { localStorage.setItem('ia.email', JSON.stringify(p.emailAddress)); } catch {}
      return p.emailAddress;
    },
    async signOut() {
      if (token) fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(token), { method: 'POST' }).catch(() => {});
      clearCached();
      token = null;
    },
    async listThreads({ view, q, pageToken, max }) {
      const params = new URLSearchParams({ maxResults: String(max || PAGE) });
      if (view === 'search') params.set('q', q);
      else if (view === 'unread') params.set('q', 'is:unread in:inbox');
      else params.set('labelIds', view === 'starred' ? 'STARRED' : 'INBOX');
      if (pageToken) params.set('pageToken', pageToken);
      const [res, inbox] = await Promise.all([
        api('/threads?' + params),
        view === 'inbox' ? api('/labels/INBOX') : null,
      ]);
      const list = res.threads || [];
      const threads = await mapLimit(list, 4, async ({ id, historyId }) => {
        const hit = summaries.get(id);
        if (hit && hit.historyId === historyId) return { ...hit.s };
        const s = summary(await api('/threads/' + id + '?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=List-Unsubscribe'));
        summaries.set(id, { historyId, s });
        return { ...s };
      });
      return {
        threads,
        total: inbox ? inbox.threadsTotal : res.resultSizeEstimate || list.length,
        nextPageToken: res.nextPageToken || null,
      };
    },
    async getThread(id) {
      const t = await api('/threads/' + id + '?format=full');
      return {
        subject: header(t.messages[0], 'Subject'),
        messages: t.messages.map((m) => {
          const f = parseFrom(header(m, 'From'));
          return {
            from: f.name, fromEmail: f.email, fromRaw: header(m, 'From'), replyTo: header(m, 'Reply-To'),
            to: header(m, 'To'), messageId: header(m, 'Message-ID') || header(m, 'Message-Id'),
            references: header(m, 'References'), date: Number(m.internalDate), ...findBody(m.payload),
          };
        }),
      };
    },
    trash(id) { return api('/threads/' + id + '/trash', { method: 'POST' }); },
    untrash(id) { return api('/threads/' + id + '/untrash', { method: 'POST' }); },
    // r: { threadId, to, subject, inReplyTo, references, body }
    send(r) {
      const enc = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
      const lines = [
        'To: ' + r.to,
        'Subject: =?UTF-8?B?' + enc(r.subject) + '?=',
        r.inReplyTo ? 'In-Reply-To: ' + r.inReplyTo : '',
        r.inReplyTo ? 'References: ' + ((r.references ? r.references + ' ' : '') + r.inReplyTo) : '',
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset="UTF-8"',
        'Content-Transfer-Encoding: base64',
      ].filter(Boolean);
      const CRLF = String.fromCharCode(13, 10);
      const raw = lines.join(CRLF) + CRLF + CRLF + enc(r.body).replace(/.{76}/g, '$&' + CRLF);
      const b64url = btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      return api('/messages/send', { method: 'POST', body: JSON.stringify({ raw: b64url, threadId: r.threadId }) });
    },
    modify(id, add = [], remove = []) {
      return api('/threads/' + id + '/modify', {
        method: 'POST',
        body: JSON.stringify({ addLabelIds: add, removeLabelIds: remove }),
      });
    },
  };
})();
