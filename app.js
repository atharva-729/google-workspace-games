// Inbox Arcade: UI, keyboard, and the Inbox Zero game mode.
const $ = (s) => document.querySelector(s);
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem('ia.' + k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('ia.' + k, JSON.stringify(v)); } catch {} },
};
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const S = { backend: null, who: '', view: 'inbox', q: '', threads: [], total: 0, cursor: 0, open: null, undo: null, busy: false };

// ---------------------------------------------------------------- start
function clientIdMissing() {
  try { return typeof WEB_CLIENT_ID === 'undefined' || /^PASTE_/.test(WEB_CLIENT_ID); } catch { return true; }
}

function showLanding(msg) {
  $('#app').classList.add('hidden');
  $('#landing').classList.remove('hidden');
  $('#landingMsg').textContent = msg || (clientIdMissing() ? 'Live Gmail needs your OAuth client ID in manifest.json (see README). The demo works now.' : '');
}

async function enter(mode, interactive = true) {
  S.backend = mode === 'live' ? GmailMail : DemoMail;
  const who = await S.backend.connect(interactive);
  store.set('mode', mode);
  S.who = who;
  $('#who').textContent = who;
  $('#landing').classList.add('hidden');
  $('#app').classList.remove('hidden');
  await loadList();
}

async function start() {
  const params = new URLSearchParams(location.search);
  if (params.has('demo')) {
    await enter('demo');
    // test hook: ?demo&keys=gjee replays keystrokes 450ms apart
    for (const k of params.get('keys') || '') {
      await new Promise((r) => setTimeout(r, 450));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: k === '~' ? 'Escape' : k }));
    }
    return;
  }
  const mode = store.get('mode');
  if (mode === 'demo') return enter('demo');
  if (mode === 'live') {
    try { return await enter('live', false); } catch (e) { return showLanding('Sign in again: ' + e.message); }
  }
  showLanding();
}

$('#demoBtn').onclick = () => enter('demo');
$('#connectBtn').onclick = async () => {
  $('#landingMsg').textContent = 'Opening Google sign-in…';
  try { await enter('live', true); }
  catch (e) { showLanding('Could not connect: ' + e.message + (clientIdMissing() ? '\nThe client ID in manifest.json is still the placeholder.' : '')); }
};
$('#switchBtn').onclick = async () => { await S.backend.signOut(); store.set('mode', null); if (T.active) exitTriage(); showLanding(); };

// ---------------------------------------------------------------- list
async function loadList() {
  S.busy = true;
  $('#listStatus').textContent = 'Loading…';
  try {
    const res = await S.backend.listThreads({ view: S.view, q: S.q });
    S.threads = res.threads;
    S.total = res.total;
    S.cursor = Math.min(S.cursor, Math.max(0, S.threads.length - 1));
    $('#listStatus').textContent = '';
  } catch (e) {
    $('#listStatus').textContent = 'Error: ' + e.message;
  }
  S.busy = false;
  renderList();
}

function fmtDate(ms) {
  const d = new Date(ms), now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return d.toLocaleDateString();
}

function rowHtml(t, i) {
  return `<li class="row${t.unread ? ' unread' : ''}${i === S.cursor ? ' sel' : ''}" data-i="${i}">
    <button class="star${t.starred ? ' on' : ''}" data-act="star" title="Star (s)">★</button>
    <span class="from">${esc(t.from)}${t.count > 1 ? ` <small>${t.count}</small>` : ''}</span>
    <span class="text"><span class="subj">${esc(t.subject || '(no subject)')}</span><span class="snip"> — ${esc(t.snippet)}</span></span>
    <span class="date">${fmtDate(t.date)}</span>
    <span class="acts"><button data-act="archive" title="Archive (e)">Archive</button><button data-act="delete" title="Delete (d)">Delete</button><button data-act="read" title="Toggle read (u)">${t.unread ? 'Mark read' : 'Mark unread'}</button></span>
  </li>`;
}

function renderList() {
  document.querySelectorAll('.views button').forEach((b) => b.classList.toggle('active', b.dataset.view === S.view));
  $('#list').innerHTML = S.threads.map(rowHtml).join('');
  if (!S.threads.length && !S.busy) {
    $('#listStatus').innerHTML = S.view === 'inbox' ? '<div class="empty">🎉 Inbox zero. Nothing left to do.</div>' : '<div class="empty">Nothing here.</div>';
  }
}

function moveCursor(d) {
  if (!S.threads.length) return;
  S.cursor = Math.max(0, Math.min(S.threads.length - 1, S.cursor + d));
  renderList();
  const el = document.querySelector('.row.sel');
  if (el) el.scrollIntoView({ block: 'nearest' });
}

$('#list').addEventListener('click', (e) => {
  const row = e.target.closest('.row');
  if (!row) return;
  const i = Number(row.dataset.i);
  const act = e.target.closest('[data-act]');
  if (act) { e.stopPropagation(); S.cursor = i; doAction(act.dataset.act, i); }
  else openThread(i);
});

document.querySelectorAll('.views button').forEach((b) => (b.onclick = () => setView(b.dataset.view)));
function setView(v) { S.view = v; S.q = ''; $('#search').value = ''; S.cursor = 0; closeThread(false); loadList(); }

$('#searchForm').onsubmit = (e) => {
  e.preventDefault();
  const q = $('#search').value.trim();
  $('#search').blur();
  if (!q) return setView('inbox');
  S.view = 'search'; S.q = q; S.cursor = 0; closeThread(false); loadList();
};

// ---------------------------------------------------------------- actions
function rowEl(i) { return document.querySelector(`.row[data-i="${i}"]`); }

async function doAction(kind, i = S.cursor) {
  const t = S.threads[i];
  if (!t) return;
  if (kind === 'reply') return openReply();
  if (kind === 'archive' || kind === 'delete') {
    if (kind === 'archive' && !t.inInbox && S.view !== 'inbox') return toast('Already archived');
    const removeRow = kind === 'delete' || S.view === 'inbox';
    if (removeRow) {
      const el = rowEl(i);
      if (el && !S.open) { el.classList.add('leaving'); await new Promise((r) => setTimeout(r, 170)); }
      S.threads.splice(i, 1);
      S.total = Math.max(0, S.total - 1);
      S.cursor = Math.min(i, Math.max(0, S.threads.length - 1));
    }
    if (kind === 'archive') t.inInbox = false;
    if (S.open) closeThread(false);
    renderList();
    S.undo = { run: async () => {
      if (removeRow) { S.threads.splice(Math.min(i, S.threads.length), 0, t); S.total++; S.cursor = i; }
      if (kind === 'archive') t.inInbox = true;
      renderList();
      try { kind === 'delete' ? await S.backend.untrash(t.id) : await S.backend.modify(t.id, ['INBOX'], []); }
      catch (e) { toast('Undo failed: ' + e.message); loadList(); }
    } };
    toast(kind === 'delete' ? 'Moved to Trash' : 'Archived', 'Undo', runUndo);
    try { kind === 'delete' ? await S.backend.trash(t.id) : await S.backend.modify(t.id, [], ['INBOX']); }
    catch (e) { toast(kind + ' failed: ' + e.message); await loadList(); }
  } else if (kind === 'star') {
    t.starred = !t.starred;
    afterChange(t);
    sync(t, t.starred ? ['STARRED'] : [], t.starred ? [] : ['STARRED']);
  } else if (kind === 'read') {
    t.unread = !t.unread;
    afterChange(t);
    sync(t, t.unread ? ['UNREAD'] : [], t.unread ? [] : ['UNREAD']);
    if (t.unread && S.open) closeThread();
  }
}

function runUndo() { const u = S.undo; S.undo = null; if (u) { hideToast(); u.run(); } }

function afterChange(t) {
  if (S.open && S.open.id === t.id) renderThreadHead();
  renderList();
}
async function sync(t, add, remove) {
  try { await S.backend.modify(t.id, add, remove); }
  catch (e) { toast('Update failed: ' + e.message); loadList(); }
}

// reply from the thread view (r)
async function openReply(initial) {
  const t = S.open;
  if (!t || !S.openFull) return toast('Open an email to reply');
  const tgt = Compose.target(S.openFull, S.who);
  if (tgt.noReply) toast('Heads up: that looks like a no-reply address');
  const box = $('#replyBox');
  Compose.mount(box, tgt, {
    initial,
    onCancel: () => { box.innerHTML = ''; },
    onSend: (text) => {
      box.innerHTML = '';
      queueSend(t.id, tgt, text, (body) => { if (S.open === t) openReply(body); });
    },
  });
  box.scrollIntoView({ block: 'nearest' });
}

// ---------------------------------------------------------------- thread view
async function openThread(i) {
  const t = S.threads[i];
  if (!t) return;
  S.cursor = i; S.open = t;
  $('#listView').classList.add('hidden');
  const tv = $('#threadView');
  tv.classList.remove('hidden');
  tv.innerHTML = '<div class="thread-head"></div><div class="status">Loading…</div>';
  renderThreadHead();
  window.scrollTo(0, 0);
  let full;
  S.openFull = null;
  try { full = await S.backend.getThread(t.id); S.openFull = full; }
  catch (e) { tv.querySelector('.status').textContent = 'Error: ' + e.message; return; }
  if (S.open !== t) return;
  tv.querySelector('.status').remove();
  full.messages.forEach((m) => {
    const card = document.createElement('article');
    card.className = 'msg-card';
    card.innerHTML = `<header><b>${esc(m.from)}</b><span>&lt;${esc(m.fromEmail)}&gt;</span><time>${esc(new Date(m.date).toLocaleString())}</time></header>`;
    const fr = document.createElement('iframe');
    fr.setAttribute('sandbox', 'allow-same-origin allow-popups allow-popups-to-escape-sandbox');
    const body = m.html != null ? m.html : `<pre style="white-space:pre-wrap;font:14px/1.5 system-ui,sans-serif;margin:0">${esc(m.text)}</pre>`;
    fr.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>body{margin:14px;font:14px/1.5 system-ui,sans-serif;color:#1c2030;overflow-wrap:anywhere}img{max-width:100%;height:auto}</style></head><body>${body}</body></html>`;
    fr.onload = () => { try { fr.style.height = fr.contentDocument.documentElement.scrollHeight + 'px'; } catch {} };
    card.appendChild(fr);
    tv.appendChild(card);
  });
  const rb = document.createElement('div'); rb.id = 'replyBox'; tv.appendChild(rb);
  if (t.unread) { t.unread = false; renderThreadHead(); sync(t, [], ['UNREAD']); }
}

function renderThreadHead() {
  const t = S.open;
  const head = $('#threadView .thread-head');
  if (!t || !head) return;
  head.innerHTML = `<button data-act="back">← Back <small>Esc</small></button>
    <button data-act="reply" class="primary">Reply <small>r</small></button>
    <button data-act="archive">Archive <small>e</small></button>
    <button data-act="delete">Delete <small>d</small></button>
    <button data-act="star">${t.starred ? '★ Starred' : '☆ Star'} <small>s</small></button>
    <button data-act="read">${t.unread ? 'Mark read' : 'Mark unread'} <small>u</small></button>
    <h1>${esc(t.subject || '(no subject)')}</h1>`;
  head.onclick = (e) => {
    const a = e.target.closest('[data-act]');
    if (!a) return;
    if (a.dataset.act === 'back') closeThread();
    else doAction(a.dataset.act, S.threads.indexOf(t));
  };
}

function closeThread(render = true) {
  if (!S.open) return;
  S.open = null;
  $('#threadView').classList.add('hidden');
  $('#threadView').innerHTML = '';
  $('#listView').classList.remove('hidden');
  if (render) { renderList(); const el = document.querySelector('.row.sel'); if (el) el.scrollIntoView({ block: 'nearest' }); }
}

// ---------------------------------------------------------------- effects
$('#gameToggle').onclick = startTriage;
function floatText(anchor, text) {
  const r = (anchor || $('#list')).getBoundingClientRect();
  const f = document.createElement('div');
  f.className = 'float';
  f.textContent = text;
  f.style.left = (r.left + r.width / 2 - 30) + 'px';
  f.style.top = (r.top + 4) + 'px';
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 950);
}

function confetti() {
  const colors = ['#ffd45e', '#3ddc97', '#8b8bff', '#ff6b8b', '#5bc0ff'];
  for (let i = 0; i < 90; i++) {
    const c = document.createElement('div');
    c.className = 'confetti';
    c.style.left = Math.random() * 100 + 'vw';
    c.style.background = colors[i % colors.length];
    c.style.animationDuration = 1.6 + Math.random() * 1.8 + 's';
    c.style.animationDelay = Math.random() * 0.6 + 's';
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 4200);
  }
}

// ---------------------------------------------------------------- toast, help, keys
let toastTimer = null;
function toast(text, btn, fn) {
  const el = $('#toast');
  el.innerHTML = esc(text) + (btn ? ` <button>${esc(btn)} (z)</button>` : '');
  if (btn) el.querySelector('button').onclick = fn;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, 4000);
}
function hideToast() { $('#toast').classList.add('hidden'); }

$('#helpBtn').onclick = () => $('#help').classList.remove('hidden');
$('#help .close').onclick = () => $('#help').classList.add('hidden');

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.matches && e.target.matches('input, textarea')) { if (e.key === 'Escape') e.target.blur(); return; }
  if ($('#app').classList.contains('hidden')) return;
  if (!$('#triage').classList.contains('hidden')) {
    if (T.active) { if (triageKey(e)) e.preventDefault(); }
    else if (e.key === 'Escape' || e.key === 'Enter') exitTriage();
    return;
  }
  if (!$('#help').classList.contains('hidden') || !$('#win').classList.contains('hidden')) {
    if (e.key === 'Escape' || e.key === 'Enter') { $('#help').classList.add('hidden'); $('#win').classList.add('hidden'); }
    return;
  }
  const k = e.key;
  const inThread = !!S.open;
  const map = {
    j: () => (inThread ? openThread(Math.min(S.cursor + 1, S.threads.length - 1)) : moveCursor(1)),
    k: () => (inThread ? openThread(Math.max(S.cursor - 1, 0)) : moveCursor(-1)),
    ArrowDown: () => !inThread && moveCursor(1),
    ArrowUp: () => !inThread && moveCursor(-1),
    Enter: () => !inThread && openThread(S.cursor),
    o: () => !inThread && openThread(S.cursor),
    Escape: () => closeThread(),
    e: () => doAction('archive'),
    s: () => doAction('star'),
    u: () => doAction('read'),
    z: () => runUndo(),
    d: () => doAction('delete'),
    '#': () => doAction('delete'),
    r: () => (inThread ? openReply() : loadList()),
    '/': () => $('#search').focus(),
    g: () => startTriage(),
    '?': () => $('#help').classList.remove('hidden'),
  };
  if (map[k]) { e.preventDefault(); map[k](); }
});

start();
