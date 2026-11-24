// Mail Defense: emails fall toward your inbox. Move with A/D, shoot with the right hand:
// H reply (star to reply later) · J delete (Trash) · K archive · L keep (stays in the inbox, marked read).
// Q or Esc finishes the run. You pick a pace; the emails keep falling faster until that pace's top speed,
// then hold there. One shot a second, always. Waves end with a boss (your noisiest sender) that hovers over
// you and shoots back. Two best scores per pace: points, and emails cleared. Nothing changes in Gmail until
// you review and apply.
const DF = { on: false };
const DF_ICON = { promo: '🏷️', update: '🔔', person: '👤', notes: '📝' };
const DF_COLOR = { promo: '#ff6b8b', update: '#4fb8ff', person: '#3ddc97', notes: '#c9a6ff' };
const SHOT = {
  reply: { color: '#ffd45e', glow: '#fff0a8' }, delete: { color: '#ff5d7a', glow: '#ff9aae' },
  archive: { color: '#4fb8ff', glow: '#a8dcff' }, keep: { color: '#3ddc97', glow: '#a6f5d2' },
};
const FIRE_KEYS = { h: 'reply', j: 'delete', k: 'archive', l: 'keep' };
const OP_LABEL = { delete: '🗑 Move to Trash', archive: '📥 Archive', reply: '★ Star to reply later', keep: '👁 Keep in inbox, mark read', deletePeople: '🗑 Move to Trash: emails that look like they are from people' };
// How well a shot fits an email: 2 perfect, 1 fine, 0 wrong. Who counts as a person is a guess, so a wrong
// guess must cost little: deleting a "person" scores 0 and goes to the review unticked, it never costs a life.
// Meeting notes are never deleted or archived: those shots do nothing.
const FIT = {
  promo: { delete: 2, archive: 1, keep: 0, reply: 0 },
  update: { delete: 1, archive: 2, keep: 1, reply: 0 },
  person: { delete: 0, archive: 1, keep: 2, reply: 2 },
  notes: { delete: 0, archive: 0, keep: 2, reply: 1 },
};
const CONTROLS = '<b>A D</b> move · <b>H</b> reply · <b>J</b> delete · <b>K</b> archive · <b>L</b> keep · <b>Q</b> finish · <b>M</b> sound';
const backLabel = () => S.backend.backLabel || 'Back to mail';
// Pace: [start, added per level, ceiling]. A level is LEVEL_SECONDS of play. Speed only ever goes up, then holds.
const PACES = {
  relaxed: { name: 'Relaxed', key: '1', desc: 'Slow start, gentle climb', speed: [22, 4, 70], gap: [3.0, 0.12, 1.7], bossFire: 2.6 },
  normal: { name: 'Normal', key: '2', desc: 'The standard run', speed: [28, 6, 105], gap: [2.6, 0.14, 1.25], bossFire: 2.0 },
  fast: { name: 'Fast', key: '3', desc: 'Starts quick, gets brutal', speed: [38, 8, 140], gap: [2.1, 0.14, 1.0], bossFire: 1.5 },
};
const LEVEL_SECONDS = 20;
const FIRE_EVERY = 1.0; // seconds between shots, the same at every speed
function paceNow() {
  const p = PACES[DF.pace], lv = DF.t / LEVEL_SECONDS;
  return { speed: Math.min(p.speed[2], p.speed[0] + p.speed[1] * lv), gap: Math.max(p.gap[2], p.gap[0] - p.gap[1] * lv), top: p.speed[0] + p.speed[1] * lv >= p.speed[2] };
}
function bestFor(pace) {
  const b = store.get('defenseBest.' + pace) || {};
  const old = store.get('defenseBest'); // single best from before paces existed counts as Normal
  return { score: b.score || (pace === 'normal' && typeof old === 'number' ? old : 0), cleared: b.cleared || 0 };
}

async function startDefense() {
  if (T.active || BK.on || BK.loading || DF.on || DF.loading) return;
  closeThread(false);
  $('#main').classList.add('hidden');
  const el = $('#defense');
  el.classList.remove('hidden');
  setHTML(el, `<div class="t-end"><div class="status t-loading">Loading the incoming wave…</div><div class="t-end-btns"><button id="dfBack">${backLabel()}</button></div></div>`);
  $('#dfBack').onclick = exitDefense;
  let items;
  DF.loading = true;
  try { items = await fetchBricks(); } catch (e) {
    if (!el.classList.contains('hidden')) { setHTML(el, `<div class="t-end"><p class="status">${esc(e.message)}</p><div class="t-end-btns"><button id="dfBack" class="primary">${backLabel()}</button></div></div>`); $('#dfBack').onclick = exitDefense; }
    return;
  }
  finally { DF.loading = false; }
  if (el.classList.contains('hidden')) return; // left while it was loading
  if (!items.length) {
    setHTML(el, '<div class="t-end"><h1>Nothing incoming 🎉</h1><div class="t-end-btns"><button id="dfBack" class="primary">' + backLabel() + '</button></div></div>');
    $('#dfBack').onclick = exitDefense;
    return;
  }
  defenseMenu(items.sort(() => Math.random() - 0.5));
}

function defenseMenu(items) {
  const el = $('#defense'), last = store.get('defensePace') || 'normal';
  DF.menu = { items, last };
  setHTML(el, `<div class="t-end df-menu"><h1>🛡️ Mail Defense</h1>
    <p class="dim">${items.length} emails incoming. Pick a pace: it keeps getting faster, then holds at its top speed.</p>
    <div class="df-levels">${Object.entries(PACES).map(([id, p]) => { const b = bestFor(id); return `<button class="df-level${id === last ? ' last' : ''}" data-pace="${id}"><b><kbd>${p.key}</kbd> ${p.name}</b><small>${p.desc}</small><small>Best: ${b.score} pts · ${b.cleared} cleared</small></button>`; }).join('')}</div>
    <p class="dim">${CONTROLS} · one shot a second · <b>Enter</b> plays your last pace</p>
    <div class="t-end-btns"><button id="dfBack">${backLabel()}</button></div></div>${SFX.button()}`);
  SFX.bind(el);
  el.querySelectorAll('[data-pace]').forEach((b) => (b.onclick = () => pickPace(b.dataset.pace)));
  $('#dfBack').onclick = exitDefense;
}
function pickPace(pace) {
  const m = DF.menu;
  if (!m) return;
  DF.menu = null;
  store.set('defensePace', pace);
  setupDefense(m.items, pace);
}
// keys on the pace menu: 1 2 3, or Enter for the last pace
function defenseMenuKey(e) {
  if (!DF.menu) return false;
  const p = Object.keys(PACES).find((id) => PACES[id].key === e.key);
  if (p) { pickPace(p); return true; }
  if (e.key === 'Enter') { pickPace(DF.menu.last); return true; }
  if (e.key === 'm' || e.key === 'M') { SFX.toggle(); return true; }
  return false;
}

function exitDefense() {
  DF.on = false;
  SFX.music(null);
  DF.menu = null;
  cancelAnimationFrame(DF.raf);
  $('#defense').classList.add('hidden');
  setHTML($('#defense'), '');
  $('#main').classList.remove('hidden');
  loadList();
}

function setupDefense(queue, pace) {
  const el = $('#defense');
  const W = Math.min(940, window.innerWidth - 40), H = Math.min(640, window.innerHeight - 170);
  setHTML(el, `
    <div class="bk-hud df-hud"><div class="stat"><b id="dfScore">0</b><span>score</span></div>
      <div class="stat"><b id="dfCleared">0</b><span>cleared</span></div>
      <div class="stat combo"><b id="dfCombo">x1</b><span>combo</span></div>
      <div class="stat"><b id="dfLives"></b><span>lives</span></div>
      <div class="stat"><b id="dfWave">1</b><span>wave</span></div>
      <div class="stat"><b id="dfLeft">0</b><span>incoming</span></div>
      <div class="bk-ticker" id="dfTicker">${CONTROLS}</div>
      <button class="t-quit" id="dfQuit" title="Q or Esc">Finish</button><button class="t-quit" id="dfLeave">${backLabel()}</button></div>
    <canvas id="dfCanvas"></canvas>${SFX.button()}`);
  SFX.bind(el);
  const cv = $('#dfCanvas'), dpr = window.devicePixelRatio || 1;
  cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
  const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
  Object.assign(DF, {
    on: true, ended: false, ctx, W, H, pace, queue: queue.slice(), cards: [], shots: [], bolts: [], done: [],
    lives: 5, score: 0, cleared: 0, combo: 1, maxCombo: 1, right: 0, wrong: 0, missed: 0, bossesBeaten: 0,
    t: 0, wave: 1, waveLeft: 0, spawnT: 1.2, breakT: 0, boss: null, banner: null, topSpeed: false,
    tripleT: 0, cool: 0, queued: null, keys: {}, paused: false, over: false,
    fx: [], pops: [], shake: 0, flash: 0, stars: Array.from({ length: 60 }, () => ({ x: Math.random() * W, y: Math.random() * H, s: Math.random() * 1.5 + 0.3 })),
    cardW: Math.min(220, W / 3.6), cardH: 50, lineY: H - 70, turret: { x: W / 2, glow: '#ffd45e' },
    best: bestFor(pace), last: performance.now(),
  });
  startWave(1);
  SFX.music('defense');
  $('#dfQuit').onclick = () => endDefense(false);
  $('#dfLeave').onclick = exitDefense;
  dfHud();
  DF.raf = requestAnimationFrame(dfStep);
}

function waveSize(n) { return 7 + n * 3; }
function startWave(n) {
  DF.wave = n;
  DF.waveLeft = Math.min(waveSize(n), DF.queue.length);
  DF.breakT = 2.2;
  DF.banner = { text: `Wave ${n}`, sub: n === 1 ? 'H reply · J delete · K archive · L keep' : 'faster now…', life: 2.2 };
  SFX.play('wave');
}

function dfHud() {
  $('#dfScore').textContent = DF.score;
  $('#dfCleared').textContent = DF.cleared;
  $('#dfCombo').textContent = 'x' + DF.combo;
  $('#dfLives').textContent = '❤'.repeat(Math.max(0, DF.lives)) || '—';
  $('#dfWave').textContent = DF.wave;
  $('#dfLeft').textContent = DF.queue.length + DF.cards.length + (DF.boss ? DF.boss.items.length : 0);
}

function dfSpawn() {
  const t = DF.queue.shift();
  if (!t) return;
  const w = DF.cardW;
  let x = 10 + Math.random() * (DF.W - w - 20);
  for (let i = 0; i < 6 && DF.cards.some((c) => c.y < DF.cardH + 20 && Math.abs(c.x - x) < w + 10); i++) x = 10 + Math.random() * (DF.W - w - 20);
  DF.cards.push({ t, x, y: -DF.cardH, w, h: DF.cardH, phase: Math.random() * 6, drift: (Math.random() - 0.5) * 30 });
  DF.waveLeft--;
}

function spawnBoss() {
  // the sender with the most emails still waiting (not people) becomes the boss
  const counts = {};
  DF.queue.forEach((t) => { if (t.kind === 'promo' || t.kind === 'update') counts[t.fromEmail] = (counts[t.fromEmail] || 0) + 1; });
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (!top || top[1] < 2) return false;
  const items = DF.queue.filter((t) => t.fromEmail === top[0]);
  DF.queue = DF.queue.filter((t) => t.fromEmail !== top[0]);
  const hp = Math.min(4 + DF.wave, 10);
  DF.boss = { items, name: items[0].from, kind: items[0].kind, hp, max: hp, x: DF.W / 2 - 130, y: -90, w: 260, h: 70, hitT: 0, fireT: 1.6 };
  DF.banner = { text: `BOSS: ${items[0].from}`, sub: `${items.length} emails · it shoots back: dodge, then J delete or K archive`, life: 2.2 };
  SFX.play('power');
  return true;
}

function fire(kind) {
  if (DF.over || DF.paused) return;
  if (DF.cool > 0) { DF.queued = kind; return; } // fires the moment the launcher is ready
  DF.cool = FIRE_EVERY;
  DF.queued = null;
  const x = DF.turret.x, y = DF.H - 40;
  const spread = DF.tripleT > 0 ? [-0.18, 0, 0.18] : [0];
  spread.forEach((a) => DF.shots.push({ kind, x, y, vx: Math.sin(a) * 760, vy: -Math.cos(a) * 760 }));
  DF.turret.glow = SHOT[kind].color;
  SFX.play(kind);
}

function addCombo() {
  DF.combo = Math.min(DF.combo + 1, 12);
  DF.maxCombo = Math.max(DF.maxCombo, DF.combo);
  const cheer = { 3: 'NICE!', 6: 'GREAT!', 9: 'ON FIRE! 🔥', 12: 'UNSTOPPABLE!' }[DF.combo];
  if (cheer) DF.pops.push({ x: DF.W / 2, y: DF.H / 2, text: cheer, life: 1.1, color: '#ffd45e', big: true });
  if (DF.combo === 5) {
    if (DF.lives < 5) { DF.lives++; DF.banner = { text: 'Extra life! ❤', sub: 'combo x5', life: 1.2 }; }
    else { DF.score += 100; DF.banner = { text: '+100', sub: 'combo x5 with full lives', life: 1.2 }; }
    SFX.play('power');
  }
  if (DF.combo === 10) { DF.tripleT = 8; DF.banner = { text: 'Triple shot!', sub: 'combo x10', life: 1.2 }; SFX.play('power'); }
}

function hitCard(card, shot) {
  const k = card.t.kind, cx = card.x + card.w / 2, cy = card.y + card.h / 2;
  const fit = FIT[k][shot];
  DF.cards = DF.cards.filter((c) => c !== card);
  if (k === 'notes' && (shot === 'delete' || shot === 'archive')) {
    // meeting notes stay in the inbox: nothing is recorded, so nothing can be applied
    DF.combo = 1; DF.wrong++;
    DF.done.push({ t: card.t, op: null });
    DF.pops.push({ x: cx, y: cy - 8, text: 'Meeting notes stay +0', life: 1, color: '#c9a6ff' });
    $('#dfTicker').textContent = `📝 Meeting notes are never deleted or archived. L keeps them, H stars them.`;
    SFX.play('bad');
    return;
  }
  if (k === 'person' && shot === 'delete') {
    // probably a person: no points, and it waits unticked in the review in case the guess was wrong
    DF.combo = 1; DF.wrong++; DF.cleared++;
    DF.done.push({ t: card.t, op: 'deletePeople' });
    burst(cx, cy, SHOT.delete.color, 8);
    DF.pops.push({ x: cx, y: cy - 8, text: 'Looks like a person +0', life: 1, color: '#c9c9d9' });
    $('#dfTicker').textContent = `👤 ${card.t.from} looks like a person. It goes to the review unticked: tick it there to really delete.`;
    SFX.play('bad');
    return;
  }
  let pts;
  if (fit === 2) { addCombo(); DF.right++; pts = 10 * DF.combo; SFX.play('good'); }
  else if (fit === 1) { DF.right++; pts = 5; SFX.play(shot); }
  else { DF.combo = 1; DF.wrong++; pts = 1; SFX.play('bad'); }
  DF.score += pts;
  DF.cleared++;
  DF.done.push({ t: card.t, op: shot });
  burst(cx, cy, SHOT[shot].color, fit === 2 ? 22 : 10);
  const word = fit === 2 ? 'Perfect' : fit === 1 ? 'OK' : shot === 'reply' ? 'Nobody to reply to' : 'Kept junk';
  DF.pops.push({ x: cx, y: cy - 8, text: `${word} +${pts}${DF.combo > 1 ? ' x' + DF.combo : ''}`, life: 0.9, color: fit === 2 ? '#ffd45e' : '#c9c9d9' });
  $('#dfTicker').textContent = `${OP_LABEL[shot].split(' ')[0]} ${card.t.from}: ${card.t.subject || '(no subject)'}`;
}

function hitBoss(shot, x, y) {
  const b = DF.boss;
  if (shot === 'keep' || shot === 'reply') { DF.pops.push({ x, y, text: "Can't keep a spammer! J or K", life: 0.8, color: '#c9c9d9' }); SFX.play('bad'); return; }
  b.hp--; b.hitT = 0.12; b.lastShot = shot; DF.score += 5 * DF.combo;
  burst(x, y, '#ff5d7a', 8); SFX.play('boss');
  if (b.hp <= 0) {
    const n = b.items.length, pts = 60 * n;
    DF.score += pts; DF.bossesBeaten++; DF.cleared += n;
    b.items.forEach((t) => DF.done.push({ t, op: b.lastShot })); // the finishing shot decides: delete or archive
    for (let i = 0; i < 4; i++) burst(b.x + Math.random() * b.w, b.y + Math.random() * b.h, ['#ff5d7a', '#ffd45e', '#d66bff'][i % 3], 26);
    DF.shake = 0.6; DF.flash = 0.25;
    DF.pops.push({ x: DF.W / 2, y: b.y + 40, text: `${b.name} defeated! ${n} emails +${pts}`, life: 1.8, color: '#ffd45e', big: true });
    $('#dfTicker').textContent = `💥 Beat ${b.name}: all ${n} of their emails → ${OP_LABEL[b.lastShot]}`;
    SFX.play('bossdie');
    DF.boss = null;
    addCombo();
  }
}

function loseLife(x, y, text) {
  DF.lives--; DF.combo = 1; DF.shake = 0.35; DF.flash = 0.15;
  DF.pops.push({ x, y, text, life: 1.3, color: '#ff6b8b' });
  SFX.play('hurt');
  if (DF.lives <= 0) { DF.over = true; setTimeout(() => endDefense(false), 900); }
}

function burst(x, y, color, n) {
  for (let i = 0; i < n; i++) DF.fx.push({ x, y, vx: (Math.random() - 0.5) * 420, vy: (Math.random() - 0.65) * 360, life: 0.7, c: color });
}

function dfStep(now) {
  if (!DF.on) return;
  const dt = Math.max(0, Math.min(0.033, (now - DF.last) / 1000));
  DF.last = now;
  if (!DF.paused && !DF.over) dfUpdate(dt);
  dfDraw();
  if (DF.on) dfHud();
  DF.raf = requestAnimationFrame(dfStep);
}

function dfUpdate(dt) {
  DF.t += dt;
  const pace = paceNow();
  if (pace.top && !DF.topSpeed) { DF.topSpeed = true; DF.banner = { text: 'Top speed!', sub: 'it stays this fast now', life: 1.8 }; SFX.play('power'); }
  DF.tripleT = Math.max(0, DF.tripleT - dt);
  DF.cool = Math.max(0, DF.cool - dt);
  if (DF.cool <= 0 && DF.queued) fire(DF.queued);
  // turret
  if (DF.keys.a || DF.keys.arrowleft) DF.turret.x -= 560 * dt;
  if (DF.keys.d || DF.keys.arrowright) DF.turret.x += 560 * dt;
  DF.turret.x = Math.max(28, Math.min(DF.W - 28, DF.turret.x));
  // waves
  if (DF.breakT > 0) DF.breakT -= dt;
  else if (DF.waveLeft > 0) {
    DF.spawnT -= dt;
    if (DF.spawnT <= 0) { dfSpawn(); DF.spawnT = pace.gap * (0.85 + Math.random() * 0.3); }
  } else if (!DF.cards.length && !DF.boss) {
    if (!DF.bossDone && spawnBoss()) DF.bossDone = true;
    else if (DF.queue.length) { DF.bossDone = false; startWave(DF.wave + 1); }
    else if (!DF.cards.length) { DF.over = true; setTimeout(() => endDefense(true), 700); }
  }
  // cards
  const speed = pace.speed;
  for (const c of DF.cards) {
    c.y += speed * dt;
    c.phase += dt;
    c.x = Math.max(6, Math.min(DF.W - c.w - 6, c.x + Math.sin(c.phase * 1.3) * c.drift * dt));
  }
  const landed = DF.cards.filter((c) => c.y + c.h >= DF.lineY);
  if (landed.length) {
    DF.cards = DF.cards.filter((c) => !landed.includes(c));
    landed.forEach((c) => { DF.missed++; DF.done.push({ t: c.t, op: null }); loseLife(c.x + c.w / 2, DF.lineY - 20, 'Landed! −❤'); });
  }
  // boss
  const b = DF.boss;
  if (b) {
    b.hitT = Math.max(0, b.hitT - dt);
    if (b.y < 30) b.y += 90 * dt; // flies in, then hovers
    // follows the launcher, a bit slower than you can move, so you can slip out from under it
    const step = Math.min(420, 120 + 14 * DF.wave) * dt, want = DF.turret.x - b.w / 2;
    b.x = Math.max(6, Math.min(DF.W - b.w - 6, b.x + Math.max(-step, Math.min(step, want - b.x))));
    b.fireT -= dt;
    if (b.fireT <= 0 && b.y >= 30) {
      b.fireT = PACES[DF.pace].bossFire * (0.8 + Math.random() * 0.4);
      const sx = b.x + b.w / 2, sy = b.y + b.h, tx = DF.turret.x, ty = DF.H - 28;
      const d = Math.hypot(tx - sx, ty - sy), v = Math.min(520, 240 + 14 * DF.wave);
      DF.bolts.push({ x: sx, y: sy, vx: ((tx - sx) / d) * v, vy: ((ty - sy) / d) * v });
      SFX.play('boss');
    }
  }
  // the boss's shots: aimed at where you are, so keep moving
  for (const o of DF.bolts) {
    o.x += o.vx * dt; o.y += o.vy * dt;
    if (Math.abs(o.x - DF.turret.x) < 30 && o.y > DF.H - 52 && o.y < DF.H - 10) {
      o.dead = true;
      burst(o.x, o.y, '#ff5d7a', 14);
      loseLife(o.x, DF.H - 64, 'Hit by the boss! −❤');
    }
  }
  DF.bolts = DF.bolts.filter((o) => !o.dead && o.y < DF.H + 20 && o.x > -20 && o.x < DF.W + 20);
  // shots
  for (const s of DF.shots) {
    s.x += s.vx * dt; s.y += s.vy * dt;
    if (DF.boss && s.x > DF.boss.x && s.x < DF.boss.x + DF.boss.w && s.y > DF.boss.y && s.y < DF.boss.y + DF.boss.h) { s.dead = true; hitBoss(s.kind, s.x, s.y); continue; }
    const hit = DF.cards.find((c) => s.x > c.x && s.x < c.x + c.w && s.y > c.y && s.y < c.y + c.h);
    if (hit) { s.dead = true; hitCard(hit, s.kind); }
  }
  DF.shots = DF.shots.filter((s) => !s.dead && s.y > -20 && s.x > -20 && s.x < DF.W + 20);
  // effects
  DF.fx.forEach((p) => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 520 * dt; p.life -= dt; });
  DF.fx = DF.fx.filter((p) => p.life > 0);
  DF.pops.forEach((p) => { p.y -= (p.big ? 18 : 36) * dt; p.life -= dt; });
  DF.pops = DF.pops.filter((p) => p.life > 0);
  if (DF.banner) { DF.banner.life -= dt; if (DF.banner.life <= 0) DF.banner = null; }
  DF.stars.forEach((s) => { s.y += s.s * speed * 0.6 * dt; if (s.y > DF.H) { s.y = 0; s.x = Math.random() * DF.W; } });
  DF.shake = Math.max(0, DF.shake - dt); DF.flash = Math.max(0, DF.flash - dt);
}

function dfDraw() {
  const c = DF.ctx, W = DF.W, H = DF.H;
  c.save();
  if (DF.shake > 0) c.translate((Math.random() - 0.5) * 14 * DF.shake, (Math.random() - 0.5) * 14 * DF.shake);
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0d1222'); g.addColorStop(1, '#1d1033');
  c.fillStyle = g; c.fillRect(-12, -12, W + 24, H + 24);
  c.fillStyle = 'rgba(200,220,255,.5)';
  DF.stars.forEach((s) => c.fillRect(s.x, s.y, s.s, s.s * 2));
  // inbox line + danger glow
  const dg = c.createLinearGradient(0, DF.lineY - 110, 0, DF.lineY);
  dg.addColorStop(0, 'rgba(255,80,110,0)'); dg.addColorStop(1, 'rgba(255,80,110,.2)');
  c.fillStyle = dg; c.fillRect(0, DF.lineY - 110, W, 110);
  c.strokeStyle = '#ff6b8b'; c.lineWidth = 2; c.setLineDash([8, 6]);
  c.beginPath(); c.moveTo(0, DF.lineY); c.lineTo(W, DF.lineY); c.stroke(); c.setLineDash([]);
  c.fillStyle = 'rgba(255,107,139,.85)'; c.font = '700 11px system-ui'; c.textAlign = 'left'; c.textBaseline = 'middle';
  c.fillText('YOUR INBOX', 10, DF.lineY + 14);
  // boss
  const b = DF.boss;
  if (b) {
    c.shadowColor = '#ff5d7a'; c.shadowBlur = 30;
    c.fillStyle = b.hitT > 0 ? '#ffffff' : '#3a1630';
    c.beginPath(); c.roundRect(b.x, b.y, b.w, b.h, 16); c.fill(); c.shadowBlur = 0;
    c.strokeStyle = '#ff5d7a'; c.lineWidth = 3; c.stroke();
    c.textAlign = 'center'; c.fillStyle = '#fff'; c.font = '800 16px system-ui';
    c.fillText(`📣 ${b.name}`, b.x + b.w / 2, b.y + 24);
    c.font = '12px system-ui'; c.fillStyle = '#ffb3c1';
    c.fillText(`${b.items.length} emails · J delete · K archive`, b.x + b.w / 2, b.y + 43);
    c.fillStyle = 'rgba(255,255,255,.15)'; c.fillRect(b.x + 16, b.y + b.h - 14, b.w - 32, 6);
    c.fillStyle = '#ff5d7a'; c.fillRect(b.x + 16, b.y + b.h - 14, (b.w - 32) * (b.hp / b.max), 6);
  }
  // cards
  for (const card of DF.cards) {
    const k = card.t.kind, x = card.x, y = card.y, w = card.w, h = card.h;
    const danger = Math.max(0, (y + h - (DF.lineY - 160)) / 160);
    c.shadowColor = DF_COLOR[k]; c.shadowBlur = 8 + danger * 18;
    c.fillStyle = '#1e2338'; c.beginPath(); c.roundRect(x, y, w, h, 10); c.fill(); c.shadowBlur = 0;
    c.fillStyle = DF_COLOR[k]; c.beginPath(); c.roundRect(x, y, 6, h, [10, 0, 0, 10]); c.fill();
    if (danger > 0) { c.strokeStyle = `rgba(255,107,139,${danger})`; c.lineWidth = 2; c.beginPath(); c.roundRect(x, y, w, h, 10); c.stroke(); }
    c.save(); c.beginPath(); c.rect(x + 12, y, w - 44, h); c.clip();
    c.textAlign = 'left'; c.fillStyle = '#fff'; c.font = '700 13px "Segoe UI", system-ui, sans-serif'; c.fillText(card.t.from || '?', x + 14, y + 17);
    c.fillStyle = '#a9b0c4'; c.font = '12px "Segoe UI", system-ui, sans-serif'; c.fillText(card.t.subject || '(no subject)', x + 14, y + 35);
    c.restore();
    c.font = '18px system-ui'; c.textAlign = 'center'; c.fillText(DF_ICON[k], x + w - 18, y + h / 2);
  }
  // shots
  for (const s of DF.shots) {
    c.shadowColor = SHOT[s.kind].glow; c.shadowBlur = 14; c.strokeStyle = SHOT[s.kind].color; c.lineWidth = s.kind === 'keep' || s.kind === 'reply' ? 6 : 4; c.lineCap = 'round';
    c.beginPath(); c.moveTo(s.x, s.y); c.lineTo(s.x - s.vx * 0.025, s.y - s.vy * 0.025); c.stroke();
  }
  c.shadowBlur = 0;
  // boss shots
  for (const o of DF.bolts) {
    c.shadowColor = '#ff5d7a'; c.shadowBlur = 16; c.fillStyle = '#ffb3c1';
    c.beginPath(); c.arc(o.x, o.y, 6, 0, Math.PI * 2); c.fill();
  }
  c.shadowBlur = 0;
  // turret
  const tx = DF.turret.x, ty = H - 32;
  c.shadowColor = DF.turret.glow; c.shadowBlur = 18; c.fillStyle = '#ffd45e';
  c.beginPath(); c.roundRect(tx - 28, ty, 56, 16, 8); c.fill();
  c.beginPath(); c.roundRect(tx - 6, ty - 16, 12, 20, 4); c.fill(); c.shadowBlur = 0;
  c.fillStyle = DF.turret.glow; c.beginPath(); c.arc(tx, ty - 16, 4, 0, Math.PI * 2); c.fill();
  // reload bar: one shot a second
  c.fillStyle = 'rgba(255,255,255,.14)'; c.fillRect(tx - 24, ty + 21, 48, 4);
  c.fillStyle = DF.cool > 0 ? '#8a8fb0' : '#3ddc97'; c.fillRect(tx - 24, ty + 21, 48 * (1 - DF.cool / FIRE_EVERY), 4);
  if (DF.tripleT > 0) { c.fillStyle = '#ffd45e'; c.font = '700 11px system-ui'; c.textAlign = 'center'; c.fillText(`TRIPLE ${Math.ceil(DF.tripleT)}s`, tx, ty + 36); }
  // fx
  for (const p of DF.fx) { c.globalAlpha = Math.max(0, p.life / 0.7); c.fillStyle = p.c; c.fillRect(p.x - 2, p.y - 2, 4, 4); }
  c.globalAlpha = 1; c.textAlign = 'center';
  for (const p of DF.pops) { c.globalAlpha = Math.min(1, p.life * 2); c.fillStyle = p.color; c.font = p.big ? '900 30px system-ui' : '800 15px system-ui'; c.fillText(p.text, p.x, p.y); }
  c.globalAlpha = 1;
  if (DF.banner) {
    c.globalAlpha = Math.min(1, DF.banner.life * 2);
    c.fillStyle = '#fff'; c.font = '900 42px system-ui'; c.fillText(DF.banner.text, W / 2, H * 0.36);
    c.fillStyle = '#c9c9ff'; c.font = '600 16px system-ui'; c.fillText(DF.banner.sub, W / 2, H * 0.36 + 34);
    c.globalAlpha = 1;
  }
  c.restore();
  if (DF.flash > 0) { c.fillStyle = `rgba(255,90,120,${DF.flash})`; c.fillRect(0, 0, W, H); }
  if (DF.paused) { c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(0, 0, W, H); c.fillStyle = '#fff'; c.font = '700 28px system-ui'; c.textAlign = 'center'; c.fillText('Paused · P to resume', W / 2, H / 2); }
}

function endDefense(won) {
  if (!DF.on || DF.ended) return;
  DF.ended = true; DF.on = false;
  cancelAnimationFrame(DF.raf);
  SFX.music(null);
  const best = DF.best, newScore = DF.score > best.score, newCleared = DF.cleared > best.cleared;
  if (newScore || newCleared) store.set('defenseBest.' + DF.pace, { score: Math.max(best.score, DF.score), cleared: Math.max(best.cleared, DF.cleared) });
  const groups = { delete: [], archive: [], reply: [], keep: [], deletePeople: [] };
  DF.done.forEach((d) => { if (d.op) groups[d.op].push(d.t); });
  const rows = Object.entries(groups).filter(([, l]) => l.length);
  const shots = DF.right + DF.wrong;
  const acc = shots ? Math.round((100 * DF.right) / shots) : 0;
  const el = $('#defense');
  setHTML(el, `<div class="t-end bk-review">
    <h1>${won ? 'Inbox defended! 🛡️' : DF.lives <= 0 ? 'Your inbox was overrun' : 'Run finished'}</h1>
    <div class="big">${DF.score}</div>
    <div class="dim">${PACES[DF.pace].name} pace · ${newScore ? '🏆 New best score' : 'Best score ' + best.score}</div>
    <div class="df-cleared"><b>${DF.cleared}</b> emails cleared · ${newCleared ? '🏆 New best' : 'best ' + best.cleared}</div>
    <div class="t-stats"><div><b>${DF.wave}</b>wave</div><div><b>${acc}%</b>perfect calls</div><div><b>x${DF.maxCombo}</b>best combo</div><div><b>${DF.bossesBeaten}</b>bosses beaten</div><div><b>${DF.missed}</b>landed</div></div>
    ${rows.length ? `<p id="dfIntro"><b>Nothing in your Gmail has changed yet.</b> Untick anything you don't want, then apply.${groups.deletePeople.length ? ' Deleted emails that look like they are from people start unticked: open the group to check them.' : ''}</p>
    <div class="df-groups">${rows.map(([op, list]) => `<details class="df-group"><summary><input type="checkbox" data-op="${op}"${op === 'deletePeople' ? '' : ' checked'}> <b>${OP_LABEL[op]}</b> · ${list.length} email${list.length > 1 ? 's' : ''}</summary>
      <ul>${list.map((t) => `<li><b>${esc(t.from)}</b> <span class="dim">${esc(t.subject || '(no subject)')}</span></li>`).join('')}</ul></details>`).join('')}</div>
    <div class="t-end-btns"><button id="dfApply" class="primary">Apply changes</button><button id="dfAgain">Play again</button><button id="dfDiscard">${backLabel()}</button></div>
    <p id="dfStatus" class="dim"></p>`
    : `<p class="dim">No decisions to apply.</p><div class="t-end-btns"><button id="dfAgain" class="primary">Play again</button><button id="dfDiscard">${backLabel()}</button></div>`}
  </div>`);
  if (won) confetti();
  $('#dfDiscard').onclick = exitDefense;
  $('#dfAgain').onclick = () => { DF.on = false; startDefense(); };
  el.querySelectorAll('summary input').forEach((x) => x.addEventListener('click', (e) => e.stopPropagation()));
  const apply = $('#dfApply');
  if (apply) apply.onclick = async () => {
    const chosen = [...el.querySelectorAll('summary input')].filter((x) => x.checked).map((x) => x.dataset.op);
    DF.applying = true;
    const btns = [...el.querySelectorAll('.t-end-btns button')];
    btns.forEach((b) => (b.disabled = true));
    el.querySelectorAll('summary input').forEach((x) => (x.disabled = true));
    const jobs = chosen.flatMap((op) => groups[op].map((t) => [t, op === 'deletePeople' ? 'delete' : op]));
    const say = (s) => { $('#dfStatus').textContent = s; };
    let failed = 0, note = 'Starred ones are waiting for your reply.';
    if (S.backend.applyAll) {
      // bookmarklet: one batch per Gmail view and action, pressing Gmail's own buttons
      const r = await S.backend.applyAll(jobs, say);
      failed = r.failed;
      note = r.note || '';
    } else {
      const RUN = {
        delete: (id) => S.backend.trash(id),
        archive: (id) => S.backend.modify(id, [], ['INBOX', 'UNREAD']),
        reply: (id) => S.backend.modify(id, ['STARRED'], []),
        keep: (id) => S.backend.modify(id, [], ['UNREAD']),
      };
      let done = 0;
      for (const [t, op] of jobs) {
        try { await RUN[op](t.id); } catch { failed++; }
        say(`Applying… ${++done} / ${jobs.length}`);
      }
    }
    say(`Done ✓ ${jobs.length - failed} emails updated${failed ? `, ${failed} not changed` : ''}. ${note}`);
    DF.applying = false;
    $('#dfIntro').textContent = 'Applied to your Gmail.';
    btns.forEach((b) => (b.disabled = b === apply));
    apply.textContent = 'Applied ✓';
  };
}

// keys: A/D (or arrows) move · H reply · J delete · K archive · L keep · P pause · Q/Esc finish.
// One bullet per key press: holding a key (or the OS repeating it) fires nothing more. A press while the
// launcher reloads fires once, as soon as it's ready.
function defenseKey(e, down = true) {
  const k = e.key.toLowerCase();
  if (k === 'a' || k === 'd' || k === 'arrowleft' || k === 'arrowright') { DF.keys[k] = down; return true; }
  if (FIRE_KEYS[k]) { if (down && !DF.keys[k]) fire(FIRE_KEYS[k]); DF.keys[k] = down; return true; }
  if (!down) return false;
  if (k === 'p') { DF.paused = !DF.paused; SFX.music(DF.paused ? null : 'defense'); return true; }
  if (k === 'm') { SFX.toggle(); return true; }
  if (k === 'q' || k === 'escape') { endDefense(false); return true; }
  return false;
}
window.addEventListener('keyup', (e) => { if (DF.on) defenseKey(e, false); });
window.addEventListener('blur', () => { DF.keys = {}; });

// test autoplayer: steer under the lowest card (or the boss) and fire the right shot
function dfAuto() {
  const tgt = DF.cards.reduce((a, c) => (!a || c.y > a.y ? c : a), null);
  const aim = tgt ? tgt.x + tgt.w / 2 : DF.boss ? DF.boss.x + DF.boss.w / 2 : DF.W / 2;
  DF.keys.a = aim < DF.turret.x - 8; DF.keys.d = aim > DF.turret.x + 8;
  if (Math.abs(aim - DF.turret.x) < 30 && DF.cool <= 0 && !DF.queued) {
    if (tgt && tgt.y > 60) fire({ promo: 'delete', update: 'archive', person: (tgt.t.subject || '').length % 2 ? 'reply' : 'keep', notes: 'keep' }[tgt.t.kind]);
    else if (!tgt && DF.boss) fire('delete');
  }
}
