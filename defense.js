// Mail Defense: emails fall toward your inbox line. Hit the right key on the lowest one before it lands.
// d delete (promos) · e archive (updates) · r save for reply (people) · Space read & keep.
// Nothing changes in Gmail during play; you review and apply at the end.
const DF = { on: false };
const DF_KEYS = { d: 'delete', '#': 'delete', e: 'archive', r: 'reply', ' ': 'read' };
const DF_RIGHT = { promo: 'delete', update: 'archive', person: 'reply' };
const DF_OK = { promo: ['archive'], update: ['read', 'delete'], person: ['read'] };
const DF_ICON = { promo: '🏷️', update: '🔔', person: '👤' };
const DF_COLOR = { promo: '#ff6b8b', update: '#4fb8ff', person: '#3ddc97' };
const DF_FX = { delete: ['🗑', '#ff6b8b'], archive: ['📥', '#4fb8ff'], reply: ['↩', '#3ddc97'], read: ['👁', '#c9c9d9'] };

async function startDefense() {
  if (T.active || BK.on || DF.on) return;
  closeThread(false);
  $('#main').classList.add('hidden');
  const el = $('#defense');
  el.classList.remove('hidden');
  el.innerHTML = '<div class="status t-loading">Loading the incoming wave…</div>';
  let items;
  try { items = await fetchBricks(); } catch (e) { el.innerHTML = `<div class="status">Error: ${esc(e.message)}</div>`; return; }
  if (!items.length) {
    el.innerHTML = '<div class="t-end"><h1>Nothing incoming 🎉</h1><div class="t-end-btns"><button id="dfBack" class="primary">Back to mail</button></div></div>';
    $('#dfBack').onclick = exitDefense;
    return;
  }
  setupDefense(items.sort(() => Math.random() - 0.5));
}

function exitDefense() {
  DF.on = false;
  cancelAnimationFrame(DF.raf);
  $('#defense').classList.add('hidden');
  $('#defense').innerHTML = '';
  $('#main').classList.remove('hidden');
  loadList();
}

function setupDefense(queue) {
  const el = $('#defense');
  const W = Math.min(940, window.innerWidth - 40), H = Math.min(620, window.innerHeight - 170);
  el.innerHTML = `
    <div class="bk-hud df-hud"><div class="stat"><b id="dfScore">0</b><span>score</span></div>
      <div class="stat combo"><b id="dfCombo">x1</b><span>combo</span></div>
      <div class="stat"><b id="dfLives">❤❤❤</b><span>lives</span></div>
      <div class="stat"><b id="dfLeft">0</b><span>incoming</span></div>
      <div class="bk-ticker" id="dfTicker">Hit the right key on the <b>glowing</b> email: <b>d</b> promo · <b>e</b> update · <b>r</b> person</div>
      <button class="t-quit" id="dfQuit">Finish</button></div>
    <canvas id="dfCanvas"></canvas>`;
  const cv = $('#dfCanvas'), dpr = window.devicePixelRatio || 1;
  cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
  const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
  Object.assign(DF, {
    on: true, ended: false, ctx, W, H, queue: queue.slice(0, 80), cards: [], done: [], lives: 3, score: 0, combo: 1, maxCombo: 1,
    right: 0, wrong: 0, missed: 0, t: 0, spawnT: 0.4, paused: false, over: false, fx: [], pops: [], laser: null, shake: 0,
    lanes: 3, cardH: 58, lineY: H - 64, best: store.get('defenseBest') || 0, last: performance.now(),
  });
  DF.cardW = (W - 40 - (DF.lanes - 1) * 14) / DF.lanes;
  $('#dfQuit').onclick = () => endDefense(false);
  dfHud();
  DF.raf = requestAnimationFrame(dfStep);
}

function dfHud() {
  $('#dfScore').textContent = DF.score;
  $('#dfCombo').textContent = 'x' + DF.combo;
  $('#dfLives').textContent = '❤'.repeat(Math.max(0, DF.lives)) || '—';
  $('#dfLeft').textContent = DF.queue.length + DF.cards.length;
}

function dfTarget() { return DF.cards.reduce((a, c) => (!a || c.y > a.y ? c : a), null); }

function dfSpawn() {
  const t = DF.queue.shift();
  if (!t) return;
  const free = [...Array(DF.lanes).keys()].filter((l) => !DF.cards.some((c) => c.lane === l && c.y < DF.cardH + 12));
  if (!free.length) { DF.queue.unshift(t); return; }
  const lane = free[Math.floor(Math.random() * free.length)];
  DF.cards.push({ t, lane, x: 20 + lane * (DF.cardW + 14), y: -DF.cardH });
}

function dfAct(action) {
  const c = dfTarget();
  if (!c || DF.over || DF.paused) return;
  const k = c.t.kind;
  const tx = c.x + DF.cardW / 2, ty = c.y + DF.cardH / 2;
  DF.laser = { x: tx, y: ty, life: 0.12, color: DF_FX[action][1] };
  if (k === 'person' && action === 'delete') {
    // never let a person's email be deleted: it costs a life and the card is kept for later
    DF.lives--; DF.combo = 1; DF.wrong++; DF.shake = 0.3;
    DF.cards = DF.cards.filter((x) => x !== c);
    DF.done.push({ t: c.t, action: 'keep' });
    DF.pops.push({ x: tx, y: ty, text: 'That was a person! −❤', life: 1.2, color: '#ff6b8b' });
    $('#dfTicker').textContent = `😬 ${c.t.from} is a person. Kept it: you can reply later.`;
    dfHud();
    if (DF.lives <= 0) { DF.over = true; setTimeout(() => endDefense(false), 700); }
    return;
  }
  let pts, label;
  if (DF_RIGHT[k] === action) { DF.combo = Math.min(DF.combo + 1, 10); DF.right++; pts = 10 * DF.combo; label = 'Perfect'; }
  else if (DF_OK[k].includes(action)) { DF.combo = 1; pts = 5; label = 'OK'; }
  else { DF.combo = 1; DF.wrong++; pts = 0; label = 'Hmm'; }
  DF.maxCombo = Math.max(DF.maxCombo, DF.combo);
  DF.score += pts;
  DF.cards = DF.cards.filter((x) => x !== c);
  DF.done.push({ t: c.t, action });
  for (let i = 0; i < 14; i++) DF.fx.push({ x: tx, y: ty, vx: (Math.random() - 0.5) * 360, vy: (Math.random() - 0.6) * 300, life: 0.6, c: DF_FX[action][1] });
  DF.pops.push({ x: tx, y: ty - 10, text: `${DF_FX[action][0]} ${label} +${pts}${DF.combo > 1 ? ' x' + DF.combo : ''}`, life: 0.9, color: pts >= 10 ? '#ffd45e' : '#c9c9d9' });
  $('#dfTicker').textContent = `${DF_FX[action][0]} ${c.t.from}: ${c.t.subject || '(no subject)'}`;
  dfHud();
  if (!DF.queue.length && !DF.cards.length) setTimeout(() => endDefense(true), 500);
}

function dfStep(now) {
  if (!DF.on) return;
  const dt = Math.max(0, Math.min(0.033, (now - DF.last) / 1000));
  DF.last = now;
  if (!DF.paused && !DF.over) dfUpdate(dt);
  dfDraw();
  DF.raf = requestAnimationFrame(dfStep);
}

function dfUpdate(dt) {
  DF.t += dt;
  const speed = 46 + DF.t * 1.8;               // px/s, ramps up
  const every = Math.max(0.7, 1.9 - DF.t * 0.025); // seconds between spawns
  DF.spawnT -= dt;
  if (DF.spawnT <= 0 && DF.queue.length) { dfSpawn(); DF.spawnT = every; }
  if (!DF.cards.length && DF.queue.length && DF.spawnT > 0.3) DF.spawnT = 0.3; // never leave the screen empty
  for (const c of DF.cards) c.y += speed * dt;
  const landed = DF.cards.filter((c) => c.y + DF.cardH >= DF.lineY);
  if (landed.length) {
    DF.cards = DF.cards.filter((c) => !landed.includes(c));
    landed.forEach((c) => {
      DF.lives--; DF.missed++; DF.combo = 1; DF.shake = 0.3;
      DF.done.push({ t: c.t, action: 'keep' });
      DF.pops.push({ x: c.x + DF.cardW / 2, y: DF.lineY - 20, text: 'Landed! −❤', life: 1, color: '#ff6b8b' });
    });
    dfHud();
    if (DF.lives <= 0) { DF.over = true; setTimeout(() => endDefense(false), 700); }
    else if (!DF.queue.length && !DF.cards.length) setTimeout(() => endDefense(true), 500);
  }
  DF.fx.forEach((p) => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 500 * dt; p.life -= dt; });
  DF.fx = DF.fx.filter((p) => p.life > 0);
  DF.pops.forEach((p) => { p.y -= 36 * dt; p.life -= dt; });
  DF.pops = DF.pops.filter((p) => p.life > 0);
  if (DF.laser) { DF.laser.life -= dt; if (DF.laser.life <= 0) DF.laser = null; }
  DF.shake = Math.max(0, DF.shake - dt);
}

function dfDraw() {
  const c = DF.ctx, W = DF.W, H = DF.H;
  c.save();
  if (DF.shake > 0) c.translate((Math.random() - 0.5) * 10 * DF.shake, (Math.random() - 0.5) * 10 * DF.shake);
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0f1424'); g.addColorStop(1, '#1a1030');
  c.fillStyle = g; c.fillRect(-10, -10, W + 20, H + 20);
  // lane guides
  c.strokeStyle = 'rgba(255,255,255,.04)'; c.lineWidth = 1;
  for (let l = 1; l < DF.lanes; l++) { const x = 20 + l * (DF.cardW + 14) - 7; c.beginPath(); c.moveTo(x, 0); c.lineTo(x, DF.lineY); c.stroke(); }
  // danger glow + inbox line
  const dg = c.createLinearGradient(0, DF.lineY - 90, 0, DF.lineY);
  dg.addColorStop(0, 'rgba(255,80,110,0)'); dg.addColorStop(1, 'rgba(255,80,110,.18)');
  c.fillStyle = dg; c.fillRect(0, DF.lineY - 90, W, 90);
  c.strokeStyle = '#ff6b8b'; c.lineWidth = 2; c.setLineDash([8, 6]);
  c.beginPath(); c.moveTo(0, DF.lineY); c.lineTo(W, DF.lineY); c.stroke(); c.setLineDash([]);
  c.fillStyle = 'rgba(255,107,139,.8)'; c.font = '600 11px system-ui'; c.textAlign = 'left'; c.fillText('YOUR INBOX', 10, DF.lineY + 14);
  // turret
  const tx = W / 2, ty = H - 22;
  c.fillStyle = '#ffd45e'; c.beginPath(); c.roundRect(tx - 26, ty - 8, 52, 16, 8); c.fill();
  c.beginPath(); c.arc(tx, ty - 8, 10, Math.PI, 0); c.fill();
  // cards
  const target = dfTarget();
  c.textBaseline = 'middle';
  for (const card of DF.cards) {
    const isT = card === target, x = card.x, y = card.y, w = DF.cardW, h = DF.cardH, k = card.t.kind;
    if (isT) { c.shadowColor = DF_COLOR[k]; c.shadowBlur = 22; }
    c.fillStyle = isT ? '#262b45' : '#1c2033';
    c.beginPath(); c.roundRect(x, y, w, h, 10); c.fill();
    c.shadowBlur = 0;
    c.fillStyle = DF_COLOR[k]; c.beginPath(); c.roundRect(x, y, 6, h, [10, 0, 0, 10]); c.fill();
    if (isT) { c.strokeStyle = DF_COLOR[k]; c.lineWidth = 2; c.beginPath(); c.roundRect(x, y, w, h, 10); c.stroke(); }
    c.save(); c.beginPath(); c.rect(x + 12, y, w - 48, h); c.clip();
    c.textAlign = 'left';
    c.fillStyle = '#fff'; c.font = '700 13px "Segoe UI", system-ui, sans-serif'; c.fillText(card.t.from || '?', x + 14, y + 19);
    c.fillStyle = '#a9b0c4'; c.font = '12px "Segoe UI", system-ui, sans-serif'; c.fillText(card.t.subject || '(no subject)', x + 14, y + 39);
    c.restore();
    c.font = '18px system-ui'; c.textAlign = 'center'; c.fillText(DF_ICON[k], x + w - 20, y + h / 2);
  }
  // laser
  if (DF.laser) {
    c.strokeStyle = DF.laser.color; c.lineWidth = 4; c.globalAlpha = DF.laser.life / 0.12;
    c.beginPath(); c.moveTo(tx, ty - 16); c.lineTo(DF.laser.x, DF.laser.y); c.stroke(); c.globalAlpha = 1;
  }
  for (const p of DF.fx) { c.globalAlpha = Math.max(0, p.life / 0.6); c.fillStyle = p.c; c.fillRect(p.x - 2, p.y - 2, 4, 4); }
  c.globalAlpha = 1;
  c.textAlign = 'center';
  for (const p of DF.pops) { c.globalAlpha = Math.min(1, p.life * 2); c.fillStyle = p.color; c.font = '800 15px system-ui'; c.fillText(p.text, p.x, p.y); }
  c.globalAlpha = 1;
  c.restore();
  if (DF.paused) { c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(0, 0, W, H); c.fillStyle = '#fff'; c.font = '700 28px system-ui'; c.textAlign = 'center'; c.fillText('Paused · P to resume', W / 2, H / 2); }
}

function endDefense(won) {
  if (!DF.on || DF.ended) return;
  DF.ended = true; DF.on = false;
  cancelAnimationFrame(DF.raf);
  const newBest = DF.score > DF.best;
  if (newBest) store.set('defenseBest', DF.score);
  const groups = { delete: [], archive: [], reply: [], read: [] };
  DF.done.forEach((d) => { if (groups[d.action]) groups[d.action].push(d.t); });
  const META = {
    delete: ['🗑 Move to Trash', 'trash'], archive: ['📥 Archive', 'archive'],
    reply: ['★ Star to reply later', 'star'], read: ['👁 Mark as read', 'read'],
  };
  const rows = Object.entries(groups).filter(([, l]) => l.length);
  const acted = rows.reduce((n, [, l]) => n + l.length, 0);
  const acc = DF.right + DF.wrong ? Math.round((100 * DF.right) / (DF.done.length || 1)) : 0;
  const el = $('#defense');
  el.innerHTML = `<div class="t-end bk-review">
    <h1>${won ? 'Inbox defended! 🛡️' : DF.lives <= 0 ? 'Your inbox was overrun' : 'Run finished'}</h1>
    <div class="big">${DF.score}</div>
    <div class="dim">${newBest ? '🏆 New best score' : 'Best: ' + Math.max(DF.best, DF.score)}</div>
    <div class="t-stats"><div><b>${DF.done.length}</b>handled</div><div><b>${acc}%</b>perfect calls</div><div><b>x${DF.maxCombo}</b>best combo</div><div><b>${DF.missed}</b>landed</div></div>
    ${acted ? `<p><b>Nothing in your Gmail has changed yet.</b> Untick anything you don't want, then apply.</p>
    <div class="df-groups">${rows.map(([a, list]) => `<details class="df-group"><summary><input type="checkbox" data-a="${a}" checked> <b>${META[a][0]}</b> · ${list.length} email${list.length > 1 ? 's' : ''}</summary>
      <ul>${list.map((t) => `<li><b>${esc(t.from)}</b> <span class="dim">${esc(t.subject || '(no subject)')}</span></li>`).join('')}</ul></details>`).join('')}</div>
    <div class="t-end-btns"><button id="dfApply" class="primary">Apply</button><button id="dfDiscard">Discard, change nothing</button><button id="dfAgain">Play again</button></div>
    <p id="dfStatus" class="dim"></p>`
    : `<p class="dim">No decisions to apply.</p><div class="t-end-btns"><button id="dfAgain" class="primary">Play again</button><button id="dfDiscard">Back to mail</button></div>`}
  </div>`;
  if (won) confetti();
  $('#dfDiscard').onclick = exitDefense;
  $('#dfAgain').onclick = () => { DF.on = false; startDefense(); };
  el.querySelectorAll('summary input').forEach((x) => x.addEventListener('click', (e) => e.stopPropagation()));
  const apply = $('#dfApply');
  if (apply) apply.onclick = async () => {
    const chosen = [...el.querySelectorAll('summary input')].filter((x) => x.checked).map((x) => x.dataset.a);
    apply.disabled = true;
    el.querySelectorAll('summary input').forEach((x) => (x.disabled = true));
    const jobs = chosen.flatMap((a) => groups[a].map((t) => [t.id, a]));
    const OPS_DF = {
      delete: (id) => S.backend.trash(id),
      archive: (id) => S.backend.modify(id, [], ['INBOX', 'UNREAD']),
      reply: (id) => S.backend.modify(id, ['STARRED'], []),
      read: (id) => S.backend.modify(id, [], ['UNREAD']),
    };
    let done = 0, failed = 0;
    for (const [id, a] of jobs) {
      try { await OPS_DF[a](id); } catch { failed++; }
      $('#dfStatus').textContent = `Applying… ${++done} / ${jobs.length}`;
    }
    $('#dfStatus').textContent = `Done ✓ ${jobs.length - failed} emails updated${failed ? `, ${failed} failed` : ''}. Starred ones are waiting for your reply.`;
    apply.textContent = 'Applied';
  };
}

function defenseKey(e) {
  const k = e.key;
  if (DF_KEYS[k]) { dfAct(DF_KEYS[k]); return true; }
  if (k === 'p' || k === 'P') { DF.paused = !DF.paused; return true; }
  if (k === 'Escape') { endDefense(false); return true; }
  return false;
}
