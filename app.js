// Inbox Arcade: UI, keyboard, and the Inbox Zero game mode.
const $ = (s) => document.querySelector(s);
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem('ia.' + k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('ia.' + k, JSON.stringify(v)); } catch {} },
};
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const S = { backend: null, view: 'inbox', q: '', threads: [], total: 0, cursor: 0, open: null, undo: null, busy: false };
const POINTS = { archive: 10, star: 5, read: 3 };
const COMBO_MS = 4000;
const G = { on: false, score: 0, combo: 1, maxCombo: 1, lastAt: 0, cleared: 0, startAt: 0, startTotal: 0, scored: new Set(), best: store.get('best') || 0 };

// ---------------------------------------------------------------- start
function clientIdMissing() {
  try { return /^PASTE_/.test(chrome.runtime.getManifest().oauth2.client_id); } catch { return true; }
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
  $('#who').textContent = who;
  $('#landing').classList.add('hidden');
  $('#app').classList.remove('hidden');
  await loadList();
}

async function start() {
  const params = new URLSearchParams(location.search);
  if (params.has('demo')) {
    await enter('demo');
    // test hook: ?demo&keys=gjee replays keystrokes 150ms apart
    for (const k of params.get('keys') || '') {
      await new Promise((r) => setTimeout(r, 150));
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
$('#switchBtn').onclick = async () => { await S.backend.signOut(); store.set('mode', null); if (G.on) toggleGame(); showLanding(); };

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
  hud();
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
    <span class="acts"><button data-act="archive" title="Archive (e)">Archive</button><button data-act="read" title="Toggle read (u)">${t.unread ? 'Mark read' : 'Mark unread'}</button></span>
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
  const anchor = S.open ? $('#threadView .thread-head') : rowEl(i);
  if (kind === 'archive') {
    if (!t.inInbox && S.view !== 'inbox') return toast('Already archived');
    award(t, 'archive', anchor);
    t.inInbox = false;
    if (S.view === 'inbox') {
      const el = rowEl(i);
      if (el && !S.open) { el.classList.add('leaving'); await new Promise((r) => setTimeout(r, 170)); }
      S.threads.splice(i, 1);
      S.total = Math.max(0, S.total - 1);
      S.cursor = Math.min(i, Math.max(0, S.threads.length - 1));
    }
    if (S.open) closeThread(false);
    renderList(); hud();
    S.undo = { t, i };
    toast('Archived', 'Undo', undoArchive);
    try { await S.backend.modify(t.id, [], ['INBOX']); }
    catch (e) { toast('Archive failed: ' + e.message); await loadList(); return; }
    if (S.view === 'inbox' && !S.threads.length) onPageCleared();
  } else if (kind === 'star') {
    t.starred = !t.starred;
    if (t.starred) award(t, 'star', anchor);
    afterChange(t);
    sync(t, t.starred ? ['STARRED'] : [], t.starred ? [] : ['STARRED']);
  } else if (kind === 'read') {
    t.unread = !t.unread;
    if (!t.unread) award(t, 'read', anchor);
    afterChange(t);
    sync(t, t.unread ? ['UNREAD'] : [], t.unread ? [] : ['UNREAD']);
    if (t.unread && S.open) closeThread();
  }
}

function afterChange(t) {
  if (S.open && S.open.id === t.id) renderThreadHead();
  renderList();
}
async function sync(t, add, remove) {
  try { await S.backend.modify(t.id, add, remove); }
  catch (e) { toast('Update failed: ' + e.message); loadList(); }
}

async function undoArchive() {
  const u = S.undo;
  if (!u) return;
  S.undo = null;
  hideToast();
  u.t.inInbox = true;
  if (S.view === 'inbox') { S.threads.splice(Math.min(u.i, S.threads.length), 0, u.t); S.total++; S.cursor = u.i; renderList(); hud(); }
  try { await S.backend.modify(u.t.id, ['INBOX'], []); } catch (e) { toast('Undo failed: ' + e.message); loadList(); }
}

async function onPageCleared() {
  await loadList();
  if (S.threads.length) {
    if (G.on) { G.score += 50; floatText($('#hud'), 'Page cleared! +50'); hud(); }
  } else if (G.on) win();
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
  try { full = await S.backend.getThread(t.id); }
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
  if (t.unread) { t.unread = false; renderThreadHead(); sync(t, [], ['UNREAD']); }
}

function renderThreadHead() {
  const t = S.open;
  const head = $('#threadView .thread-head');
  if (!t || !head) return;
  head.innerHTML = `<button data-act="back">← Back <small>Esc</small></button>
    <button data-act="archive">Archive <small>e</small></button>
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

// ---------------------------------------------------------------- game mode
function toggleGame() {
  G.on = !G.on;
  $('#gameToggle').classList.toggle('on', G.on);
  $('#gameToggle').textContent = G.on ? '■ Stop game' : '▶ Game mode';
  $('#hud').classList.toggle('hidden', !G.on);
  if (G.on) {
    Object.assign(G, { score: 0, combo: 1, maxCombo: 1, lastAt: 0, cleared: 0, startAt: Date.now(), scored: new Set() });
    if (S.view !== 'inbox') setView('inbox');
    G.startTotal = S.total;
    toast('Game on: clear your inbox! e archive · s star · u read');
  }
  hud();
}
$('#gameToggle').onclick = toggleGame;

function award(t, kind, anchor) {
  if (!G.on) return;
  const key = t.id + ':' + kind;
  if (G.scored.has(key)) return;
  G.scored.add(key);
  const now = Date.now();
  G.combo = now - G.lastAt < COMBO_MS ? Math.min(G.combo + 1, 8) : 1;
  G.maxCombo = Math.max(G.maxCombo, G.combo);
  G.lastAt = now;
  const pts = POINTS[kind] * G.combo;
  G.score += pts;
  if (kind === 'archive') G.cleared++;
  floatText(anchor, '+' + pts + (G.combo > 1 ? '  x' + G.combo : ''));
  const c = $('.stat.combo'); c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop');
  hud();
}

function hud() {
  if (!G.on) return;
  $('#score').textContent = G.score;
  $('#cleared').textContent = G.cleared;
  $('#best').textContent = Math.max(G.best, G.score);
  const left = S.view === 'inbox' ? S.total : null;
  const all = Math.max(G.startTotal, G.cleared + (left || 0)) || 1;
  $('#progressFill').style.width = (100 * G.cleared / all).toFixed(1) + '%';
  $('#progressText').textContent = left == null ? 'Inbox progress' : `${left} left to Inbox Zero`;
}

setInterval(() => {
  if (!G.on) return;
  const s = Math.floor((Date.now() - G.startAt) / 1000);
  $('#clock').textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  const rest = Math.max(0, 1 - (Date.now() - G.lastAt) / COMBO_MS);
  if (rest === 0 && G.combo > 1) G.combo = 1;
  $('#combo').textContent = 'x' + G.combo;
  $('#comboBar').style.width = (G.lastAt ? rest * 100 : 0) + '%';
}, 100);

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

function win() {
  const secs = Math.floor((Date.now() - G.startAt) / 1000);
  const newBest = G.score > G.best;
  if (newBest) { G.best = G.score; store.set('best', G.best); }
  $('#win').innerHTML = `<div class="panel win">
    <h1>Inbox Zero!</h1>
    <div class="big">${G.score}</div>
    <div>${newBest ? '🏆 New best score' : 'Best: ' + G.best}</div>
    <div class="stats"><div><b>${G.cleared}</b>cleared</div><div><b>${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}</b>time</div><div><b>x${G.maxCombo}</b>best combo</div></div>
    ${S.backend.live ? '' : '<button id="again" class="primary">Play again</button> '}<button id="closeWin">Close</button>
  </div>`;
  $('#win').classList.remove('hidden');
  confetti();
  $('#closeWin').onclick = () => { $('#win').classList.add('hidden'); if (G.on) toggleGame(); };
  const again = $('#again');
  if (again) again.onclick = async () => { $('#win').classList.add('hidden'); DemoMail.reset(); await loadList(); G.on = false; toggleGame(); };
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
    z: () => undoArchive(),
    '/': () => $('#search').focus(),
    g: () => toggleGame(),
    r: () => loadList(),
    '?': () => $('#help').classList.remove('hidden'),
  };
  if (map[k]) { e.preventDefault(); map[k](); }
});

start();
