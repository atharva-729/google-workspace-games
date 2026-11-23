// Live backend: the official Gmail REST API, authorised through chrome.identity.
// Same interface as DemoMail: connect, listThreads, getThread, modify.
const GmailMail = (() => {
  const API = 'https://gmail.googleapis.com/gmail/v1/users/me';
  const PAGE = 25;
  let token = null;

  function getToken(interactive) {
    return new Promise((resolve, reject) => {
      if (!(window.chrome && chrome.identity)) return reject(new Error('Open this page from the extension (chrome.identity is missing).'));
      chrome.identity.getAuthToken({ interactive }, (res) => {
        const err = chrome.runtime.lastError;
        const t = res && (typeof res === 'string' ? res : res.token);
        if (err || !t) return reject(new Error((err && err.message) || 'No token returned'));
        resolve(t);
      });
    });
  }

  async function api(path, opts = {}, retry = 1) {
    if (!token) token = await getToken(true);
    const r = await fetch(API + path, {
      ...opts,
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    });
    if (r.status === 401 && retry) {
      await new Promise((res) => chrome.identity.removeCachedAuthToken({ token }, res));
      token = null;
      return api(path, opts, 0);
    }
    if (r.status === 429 && retry) {
      await new Promise((res) => setTimeout(res, 1200));
      return api(path, opts, 0);
    }
    if (!r.ok) throw new Error('Gmail API ' + r.status + ': ' + (await r.text()).slice(0, 200));
    return r.json();
  }

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
    return {
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
      token = await getToken(interactive);
      const p = await api('/profile');
      return p.emailAddress;
    },
    async signOut() {
      if (token) await new Promise((res) => chrome.identity.removeCachedAuthToken({ token }, res));
      token = null;
    },
    async listThreads({ view, q, pageToken }) {
      const params = new URLSearchParams({ maxResults: String(PAGE) });
      if (view === 'search') params.set('q', q);
      else params.set('labelIds', view === 'starred' ? 'STARRED' : 'INBOX');
      if (pageToken) params.set('pageToken', pageToken);
      const [res, inbox] = await Promise.all([
        api('/threads?' + params),
        view === 'inbox' ? api('/labels/INBOX') : null,
      ]);
      const ids = (res.threads || []).map((t) => t.id);
      const full = await mapLimit(ids, 6, (id) =>
        api('/threads/' + id + '?format=metadata&metadataHeaders=From&metadataHeaders=Subject'));
      return {
        threads: full.map(summary),
        total: inbox ? inbox.threadsTotal : res.resultSizeEstimate || ids.length,
        nextPageToken: res.nextPageToken || null,
      };
    },
    async getThread(id) {
      const t = await api('/threads/' + id + '?format=full');
      return {
        subject: header(t.messages[0], 'Subject'),
        messages: t.messages.map((m) => {
          const f = parseFrom(header(m, 'From'));
          return { from: f.name, fromEmail: f.email, to: header(m, 'To'), date: Number(m.internalDate), ...findBody(m.payload) };
        }),
      };
    },
    modify(id, add = [], remove = []) {
      return api('/threads/' + id + '/modify', {
        method: 'POST',
        body: JSON.stringify({ addLabelIds: add, removeLabelIds: remove }),
      });
    },
  };
})();
