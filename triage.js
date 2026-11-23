// Triage Run: your unread mail as a deck of cards. Decide each one: reply, read, archive, delete, star.
// Points depend on whether the decision fits the email: reply to people, bin the promos, file the updates.
const KINDS = {
  person: { label: '👤 Person', hint: 'A real person. Probably wants a reply.' },
  promo: { label: '🏷️ Promo', hint: 'Marketing or newsletter. Bin it or file it.' },
  update: { label: '🔔 Update', hint: 'Automated notice. Read it, then file it.' },
};
const TP = {
  person: { reply: 50, star: 15, read: 10, archive: 5, delete: 0 },
  promo: { reply: 0, star: 0, read: 5, archive: 15, delete: 25 },
  update: { reply: 10, star: 5, read: 15, archive: 20, delete: 10 },
};
const ACTIONS = [
  ['reply', 'r', 'Reply'], ['read', 'Space', 'Read, keep'], ['archive', 'e', 'Archive'],
  ['delete', 'd', 'Delete'], ['star', 's', 'Star'], ['later', 'l', 'Later'],
];
const T_COMBO_MS = 6000;
const DECK_MAX = 50;

const T = { active: false };

function classify(t) {
  if (t.category === 'promo') return 'promo';
  if (NOREPLY.test(t.fromEmail || '')) return t.listUnsub ? 'promo' : 'update';
  if (t.category === 'update') return 'update';
  if (t.listUnsub) return 'promo';
  return 'person';
}

function fullOf(c) {
  if (!c.full) c.full = S.backend.getThread(c.id).catch((e) => ({ error: e.message, messages: [] }));
  return c.full;
}

async function startTriage() {
  closeThread(false);
  Object.assign(T, {
    active: true, deck: [], i: 0, score: 0, combo: 1, maxCombo: 1, lastAt: 0, startAt: Date.now(), shownAt: Date.now(),
    stats: { reply: 0, read: 0, archive: 0, delete: 0, star: 0, later: 0 }, good: 0, decisions: 0,
    replied: [], binned: {}, composing: false, best: store.get('triageBest') || 0,
  });
  $('#main').classList.add('hidden');
  const tv = $('#triage');
  tv.classList.remove('hidden');
  tv.innerHTML = '<div class="status t-loading">Dealing your unread mail…</div>';
  try {
    const res = await S.backend.listThreads({ view: 'unread', max: DECK_MAX });
    T.deck = res.threads.map((t) => ({ ...t, kind: classify(t) }));
  } catch (e) { tv.innerHTML = `<div class="status">Error: ${esc(e.message)}</div>`; return; }
  if (!T.deck.length) {
    tv.innerHTML = '<div class="t-end"><h1>No unread mail 🎉</h1><p>Nothing to triage. Come back when the mail piles up.</p><button class="primary" id="tExit">Back to mail</button></div>';
    $('#tExit').onclick = exitTriage;
    return;
  }
  T.startAt = Date.now();
  renderCard();
}

function exitTriage() {
  T.active = false;
  $('#triage').classList.add('hidden');
  $('#triage').innerHTML = '';
  $('#main').classList.remove('hidden');
  loadList();
}

function sameSender(c) { return T.deck.slice(T.i + 1).filter((x) => x.fromEmail === c.fromEmail); }

function renderCard() {
  const c = T.deck[T.i];
  if (!c) return endTriage();
  T.shownAt = Date.now();
  T.composing = false;
  const k = KINDS[c.kind];
  const more = sameSender(c);
  const done = T.i, total = T.deck.length;
  $('#triage').innerHTML = `
    <div class="t-hud">
      <div class="stat"><b>${T.score}</b><span>score</span></div>
      <div class="stat combo"><b id="tCombo">x${T.combo}</b><span>combo</span><i><em id="tComboBar"></em></i></div>
      <div class="progress"><div style="width:${(100 * done / total).toFixed(1)}%"></div><span>${done} / ${total} decided</span></div>
      <div class="stat"><b id="tClock">0:00</b><span>time</span></div>
      <div class="stat"><b>${Math.max(T.best, T.score)}</b><span>best</span></div>
      <button class="t-quit" id="tQuit" title="Finish now (Esc)">Finish</button>
    </div>
    <div class="t-stage">
      <article class="t-card kind-${c.kind}" id="tCard">
        <div class="t-card-top"><span class="chip">${k.label}</span><span class="date">${fmtDate(c.date)}</span></div>
        <div class="t-from"><b>${esc(c.from)}</b> <span>&lt;${esc(c.fromEmail)}&gt;</span>${c.count > 1 ? ` <small>· ${c.count} messages</small>` : ''}${c.starred ? ' <span class="star on">★</span>' : ''}</div>
        <h2>${esc(c.subject || '(no subject)')}</h2>
        <div class="t-body" id="tBody"><div class="status">${esc(c.snippet)}</div></div>
        <div id="tCompose"></div>
      </article>
      <div class="t-actions" id="tActions">
        ${ACTIONS.map(([a, key, label]) => {
          const off = a === 'reply' && NOREPLY.test(c.fromEmail || '') ? ' disabled title="No-reply address"' : '';
          return `<button data-a="${a}"${off}><kbd>${key}</kbd>${label}</button>`;
        }).join('')}
      </div>
      ${more.length ? `<div class="t-sweep">🧹 <b>${more.length + 1}</b> unread from ${esc(c.from)}. Sweep them all: <button data-sweep="delete"><kbd>Shift+D</kbd> delete all</button> <button data-sweep="archive"><kbd>Shift+E</kbd> archive all</button></div>` : ''}
    </div>`;
  $('#tQuit').onclick = endTriage;
  $('#tActions').onclick = (e) => { const b = e.target.closest('[data-a]'); if (b && !b.disabled) triageAct(b.dataset.a); };
  document.querySelectorAll('[data-sweep]').forEach((b) => (b.onclick = () => sweep(b.dataset.sweep)));
  tickTriage();
  // body: show the latest message, and prefetch the next two cards
  fullOf(c).then((full) => {
    if (T.deck[T.i] !== c) return;
    const body = $('#tBody');
    if (full.error) { body.innerHTML = `<div class="status">Could not load: ${esc(full.error)}</div>`; return; }
    const m = full.messages[full.messages.length - 1];
    body.innerHTML = '';
    body.appendChild(bodyFrame(m));
  });
  T.deck.slice(T.i + 1, T.i + 3).forEach(fullOf);
}

function bodyFrame(m) {
  const fr = document.createElement('iframe');
  fr.setAttribute('sandbox', 'allow-same-origin allow-popups allow-popups-to-escape-sandbox');
  const body = m.html != null ? m.html : `<pre style="white-space:pre-wrap;font:15px/1.55 system-ui,sans-serif;margin:0">${esc(m.text)}</pre>`;
  fr.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>body{margin:16px;font:15px/1.55 system-ui,sans-serif;color:#1c2030;overflow-wrap:anywhere}img{max-width:100%;height:auto}</style></head><body>${body}</body></html>`;
  return fr;
}

function scoreDecision(c, a, extra = 0) {
  const now = Date.now();
  T.combo = (a === 'reply' || now - T.lastAt < T_COMBO_MS) && T.lastAt ? Math.min(T.combo + 1, 8) : 1;
  T.maxCombo = Math.max(T.maxCombo, T.combo);
  T.lastAt = now;
  const base = TP[c.kind][a];
  const pts = (base + extra) * T.combo;
  T.score += pts;
  T.decisions++;
  if (base >= 15) T.good++;
  const verdict = c.kind === 'person' && a === 'delete' ? 'Ouch, that was a person' : base >= 20 ? 'Good call' : base >= 10 ? 'OK' : 'Meh';
  return { pts, verdict };
}

const OPS = {
  read: (id) => S.backend.modify(id, [], ['UNREAD']),
  archive: (id) => S.backend.modify(id, [], ['INBOX', 'UNREAD']),
  delete: (id) => S.backend.trash(id),
};
const UNDO_OPS = {
  read: (id) => S.backend.modify(id, ['UNREAD'], []),
  archive: (id) => S.backend.modify(id, ['INBOX', 'UNREAD'], []),
  delete: (id) => S.backend.untrash(id).then(() => S.backend.modify(id, ['UNREAD'], [])),
};

async function triageAct(a) {
  const c = T.deck[T.i];
  if (!c || T.composing || T.flying) return;
  if (a === 'reply') return openTriageReply(c);
  if (a === 'star') {
    if (c.starred) return;
    c.starred = true;
    S.backend.modify(c.id, ['STARRED'], []).catch((e) => toast('Star failed: ' + e.message));
    const r = scoreDecision(c, 'star'); T.stats.star++;
    T.decisions--; // starring doesn't finish the card
    floatText($('#tCard'), `★ +${r.pts}`);
    const top = $('#tCard .t-from'); if (top && !top.querySelector('.star')) top.insertAdjacentHTML('beforeend', ' <span class="star on">★</span>');
    return;
  }
  if (a === 'later') {
    T.stats.later++;
    if (!c.later) { c.later = true; T.deck.push(c); }
    T.deck.splice(T.i, 1);
    T.i = Math.min(T.i, T.deck.length);
    return fly('later', renderCard);
  }
  const before = { score: T.score, combo: T.combo, lastAt: T.lastAt, good: T.good, decisions: T.decisions };
  const r = scoreDecision(c, a);
  T.stats[a]++;
  if (a === 'delete') T.binned[c.fromEmail] = { name: c.from, n: ((T.binned[c.fromEmail] || {}).n || 0) + 1, unsub: c.listUnsub };
  floatText($('#tCard'), `${r.verdict}  +${r.pts}${T.combo > 1 ? '  x' + T.combo : ''}`);
  OPS[a](c.id).catch((e) => toast(a + ' failed: ' + e.message));
  const idx = T.i;
  S.undo = {
    run: () => {
      Object.assign(T, before); T.stats[a]--; T.i = idx;
      if (a === 'delete' && T.binned[c.fromEmail]) T.binned[c.fromEmail].n--;
      UNDO_OPS[a](c.id).catch((e) => toast('Undo failed: ' + e.message));
      renderCard();
      toast('Undone');
    },
  };
  toast({ read: 'Marked read', archive: 'Archived', delete: 'Moved to Trash' }[a], 'Undo', () => { const u = S.undo; S.undo = null; if (u) u.run(); });
  T.i++;
  fly(a, renderCard);
}

function fly(a, then) {
  const card = $('#tCard');
  if (!card) return then();
  T.flying = true;
  card.classList.add('fly-' + a);
  setTimeout(() => { T.flying = false; then(); }, 230);
}

async function openTriageReply(c, initial) {
  if (NOREPLY.test(c.fromEmail || '')) return toast('That’s a no-reply address');
  T.composing = true;
  $('#tActions').classList.add('dim');
  const full = await fullOf(c);
  if (full.error) { T.composing = false; return toast('Could not load thread: ' + full.error); }
  const tgt = Compose.target(full, S.who);
  Compose.mount($('#tCompose'), tgt, {
    initial,
    onCancel: () => { T.composing = false; $('#tCompose').innerHTML = ''; $('#tActions').classList.remove('dim'); },
    onSend: (text) => {
      const quick = Date.now() - T.shownAt < 45000 ? 25 : 0;
      const before = { score: T.score, combo: T.combo, lastAt: T.lastAt, good: T.good, decisions: T.decisions };
      const r = scoreDecision(c, 'reply', quick);
      T.stats.reply++;
      T.replied.push(c.from);
      floatText($('#tCard'), `Replied!${quick ? ' Quick draw' : ''}  +${r.pts}${T.combo > 1 ? '  x' + T.combo : ''}`);
      const idx = T.i;
      T.i++;
      T.composing = false;
      fly('reply', renderCard);
      queueSend(c.id, tgt, text, (body) => {
        Object.assign(T, before); T.stats.reply--; T.replied.pop(); T.i = idx;
        renderCard();
        openTriageReply(c, body);
      });
      // a sent reply also marks the thread read (after the undo window)
      const timer = S.undo && S.undo.timer;
      setTimeout(() => { if (!(S.undo && S.undo.timer === timer)) OPS.read(c.id).catch(() => {}); }, 5200);
    },
  });
}

async function sweep(a) {
  const c = T.deck[T.i];
  if (!c || T.composing) return;
  const group = [c, ...sameSender(c)];
  const ids = new Set(group.map((x) => x.id));
  let total = 0;
  group.forEach((x) => {
    const r = scoreDecision(x, a);
    total += Math.round(r.pts / 2);
    T.score -= r.pts - Math.round(r.pts / 2); // sweeps score half: fast, but less skill
    T.stats[a]++;
    OPS[a](x.id).catch(() => {});
  });
  if (a === 'delete') T.binned[c.fromEmail] = { name: c.from, n: ((T.binned[c.fromEmail] || {}).n || 0) + group.length, unsub: c.listUnsub };
  T.deck = T.deck.filter((x, j) => j < T.i || !ids.has(x.id));
  T.deck.splice(T.i, 0); // cursor stays: the next card slides in
  floatText($('#tCard'), `🧹 Swept ${group.length}  +${total}`);
  toast(`${group.length} from ${c.from} ${a === 'delete' ? 'moved to Trash' : 'archived'}`);
  S.undo = null;
  fly(a, renderCard);
}

function tickTriage() {
  if (!T.active) return;
  const s = Math.floor((Date.now() - T.startAt) / 1000);
  const clock = $('#tClock');
  if (!clock) return;
  clock.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  const rest = T.lastAt ? Math.max(0, 1 - (Date.now() - T.lastAt) / T_COMBO_MS) : 0;
  if (rest === 0 && T.combo > 1 && !T.composing) T.combo = 1;
  $('#tCombo').textContent = 'x' + T.combo;
  $('#tComboBar').style.width = (T.composing ? 100 : rest * 100) + '%';
}
setInterval(tickTriage, 100);

function endTriage() {
  if (!T.active) return;
  const secs = Math.floor((Date.now() - T.startAt) / 1000);
  const newBest = T.score > T.best;
  if (newBest) { T.best = T.score; store.set('triageBest', T.score); }
  const acc = T.decisions ? Math.round((100 * T.good) / T.decisions) : 0;
  const binned = Object.values(T.binned).filter((b) => b.n >= 2 || b.unsub).sort((x, y) => y.n - x.n).slice(0, 6);
  const st = T.stats;
  $('#triage').innerHTML = `<div class="t-end">
    <h1>${T.i >= T.deck.length ? 'Unread: zero 🎉' : 'Run finished'}</h1>
    <div class="big">${T.score}</div>
    <div class="dim">${newBest ? '🏆 New best score' : 'Best: ' + T.best}</div>
    <div class="t-stats">
      <div><b>${T.decisions}</b>decided</div><div><b>${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}</b>time</div>
      <div><b>${acc}%</b>good calls</div><div><b>x${T.maxCombo}</b>best combo</div>
    </div>
    <div class="t-break">↩ ${st.reply} replied · 👁 ${st.read} read · 📥 ${st.archive} archived · 🗑 ${st.delete} deleted · ★ ${st.star} starred</div>
    ${T.replied.length ? `<p><b>You replied to:</b> ${T.replied.map(esc).join(', ')}</p>` : ''}
    ${binned.length ? `<div class="t-unsub"><b>Unsubscribe candidates</b> (senders you keep binning)<ul>${binned.map((b) => `<li>${esc(b.name)} <span class="dim">· ${b.n} deleted</span> ${/^https?:/.test(b.unsub) ? `<a href="${esc(b.unsub)}" target="_blank" rel="noopener">Unsubscribe ↗</a>` : ''}</li>`).join('')}</ul></div>` : ''}
    <div class="t-end-btns">${S.backend.live ? '' : '<button id="tAgain" class="primary">Play again</button>'}<button id="tBack">Back to mail</button></div>
  </div>`;
  if (T.i >= T.deck.length && T.decisions) confetti();
  T.active = false;
  $('#tBack').onclick = exitTriage;
  const again = $('#tAgain');
  if (again) again.onclick = () => { DemoMail.reset(); startTriage(); };
}

function triageKey(e) {
  if (T.composing) return false;
  const k = e.key;
  const map = { r: 'reply', ' ': 'read', e: 'archive', d: 'delete', '#': 'delete', s: 'star', l: 'later' };
  if (e.shiftKey && (k === 'D' || k === 'E')) { sweep(k === 'D' ? 'delete' : 'archive'); return true; }
  if (map[k]) { triageAct(map[k]); return true; }
  if (k === 'z' && S.undo) { const u = S.undo; S.undo = null; u.run(); return true; }
  if (k === 'Escape') { endTriage(); return true; }
  return false;
}
