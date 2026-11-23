// Mail Defense: emails fall toward your inbox. Move with A/D, shoot with the right hand:
// H reply (star to reply later) · J delete (Trash) · K archive · L keep (stays in the inbox, marked read).
// Q or Esc finishes the run. Waves end with a boss: your noisiest sender. Nothing changes in Gmail until
// you review and apply.
const DF = { on: false };
const DF_ICON = { promo: '🏷️', update: '🔔', person: '👤' };
const DF_COLOR = { promo: '#ff6b8b', update: '#4fb8ff', person: '#3ddc97' };
const SHOT = {
  reply: { color: '#ffd45e', glow: '#fff0a8' }, delete: { color: '#ff5d7a', glow: '#ff9aae' },
  archive: { color: '#4fb8ff', glow: '#a8dcff' }, keep: { color: '#3ddc97', glow: '#a6f5d2' },
};
const FIRE_KEYS = { h: 'reply', j: 'delete', k: 'archive', l: 'keep' };
const OP_LABEL = { delete: '🗑 Move to Trash', archive: '📥 Archive', reply: '★ Star to reply later', keep: '👁 Keep in inbox, mark read' };
// How well a shot fits an email: 2 perfect, 1 fine, 0 wrong, -1 refused (deleting a person costs a life).
const FIT = {
  promo: { delete: 2, archive: 1, keep: 0, reply: 0 },
  update: { delete: 1, archive: 2, keep: 1, reply: 0 },
  person: { delete: -1, archive: 1, keep: 2, reply: 2 },
};
const CONTROLS = '<b>A D</b> move · <b>H</b> reply · <b>J</b> delete · <b>K</b> archive · <b>L</b> keep · <b>Q</b> finish';
const backLabel = () => S.backend.backLabel || 'Back to mail';

// ---------------------------------------------------------------- sound (tiny WebAudio blips)
const SFX = {
  ctx: null,
  play(type) {
    try {
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const c = this.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain();
      const P = {
        delete: ['square', 520, 260, 0.07, 0.04], archive: ['square', 380, 300, 0.07, 0.035],
        keep: ['triangle', 420, 700, 0.08, 0.05], reply: ['triangle', 560, 1000, 0.09, 0.05],
        good: ['triangle', 660, 1320, 0.12, 0.07], bad: ['sawtooth', 180, 90, 0.25, 0.06],
        hurt: ['sawtooth', 140, 60, 0.35, 0.08], boss: ['square', 200, 120, 0.1, 0.05],
        bossdie: ['sawtooth', 300, 40, 0.7, 0.09], power: ['triangle', 440, 1760, 0.35, 0.07], wave: ['sine', 330, 660, 0.4, 0.06],
      }[type];
      if (!P) return;
      o.type = P[0]; o.frequency.setValueAtTime(P[1], t); o.frequency.exponentialRampToValueAtTime(P[2], t + P[3]);
      g.gain.setValueAtTime(P[4], t); g.gain.exponentialRampToValueAtTime(0.0001, t + P[3]);
      o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + P[3] + 0.02);
    } catch {}
  },
};

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
  setupDefense(items.sort(() => Math.random() - 0.5));
}

function exitDefense() {
  DF.on = false;
  cancelAnimationFrame(DF.raf);
  $('#defense').classList.add('hidden');
  setHTML($('#defense'), '');
  $('#main').classList.remove('hidden');
  loadList();
}

function setupDefense(queue) {
  const el = $('#defense');
  const W = Math.min(940, window.innerWidth - 40), H = Math.min(640, window.innerHeight - 170);
  setHTML(el, `
    <div class="bk-hud df-hud"><div class="stat"><b id="dfScore">0</b><span>score</span></div>
      <div class="stat combo"><b id="dfCombo">x1</b><span>combo</span></div>
      <div class="stat"><b id="dfLives"></b><span>lives</span></div>
      <div class="stat"><b id="dfWave">1</b><span>wave</span></div>
      <div class="stat"><b id="dfLeft">0</b><span>incoming</span></div>
      <div class="bk-ticker" id="dfTicker">${CONTROLS}</div>
      <button class="t-quit" id="dfQuit" title="Q or Esc">Finish</button><button class="t-quit" id="dfLeave">${backLabel()}</button></div>
    <canvas id="dfCanvas"></canvas>`);
  const cv = $('#dfCanvas'), dpr = window.devicePixelRatio || 1;
  cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
  const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
  Object.assign(DF, {
    on: true, ended: false, ctx, W, H, queue: queue.slice(0, 90), cards: [], shots: [], done: [],
    lives: 5, score: 0, combo: 1, maxCombo: 1, right: 0, wrong: 0, missed: 0, bossesBeaten: 0,
    t: 0, wave: 1, waveLeft: 0, spawnT: 1.2, breakT: 0, boss: null, banner: null,
    slowT: 0, tripleT: 0, cool: 0, keys: {}, paused: false, over: false,
    fx: [], pops: [], shake: 0, flash: 0, stars: Array.from({ length: 60 }, () => ({ x: Math.random() * W, y: Math.random() * H, s: Math.random() * 1.5 + 0.3 })),
    cardW: Math.min(220, W / 3.6), cardH: 50, lineY: H - 70, turret: { x: W / 2, glow: '#ffd45e' },
    best: store.get('defenseBest') || 0, last: performance.now(),
  });
  startWave(1);
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
  DF.queue.forEach((t) => { if (t.kind !== 'person') counts[t.fromEmail] = (counts[t.fromEmail] || 0) + 1; });
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (!top || top[1] < 2) return false;
  const items = DF.queue.filter((t) => t.fromEmail === top[0]);
  DF.queue = DF.queue.filter((t) => t.fromEmail !== top[0]);
  const hp = Math.min(items.length, 8) + 3 + DF.wave;
  DF.boss = { items, name: items[0].from, kind: items[0].kind, hp, max: hp, x: DF.W / 2 - 130, y: -90, w: 260, h: 70, dir: 1, hitT: 0 };
  DF.banner = { text: `BOSS: ${items[0].from}`, sub: `${items.length} emails · J delete or K archive`, life: 2.2 };
  SFX.play('power');
  return true;
}

function fire(kind) {
  if (DF.cool > 0 || DF.over || DF.paused) return;
  DF.cool = 0.2;
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
  if (DF.combo === 5) { DF.slowT = 6; DF.banner = { text: 'Slow-mo!', sub: 'combo x5', life: 1.2 }; SFX.play('power'); }
  if (DF.combo === 10) { DF.tripleT = 8; DF.banner = { text: 'Triple shot!', sub: 'combo x10', life: 1.2 }; SFX.play('power'); }
}

function hitCard(card, shot) {
  const k = card.t.kind, cx = card.x + card.w / 2, cy = card.y + card.h / 2;
  const fit = FIT[k][shot];
  DF.cards = DF.cards.filter((c) => c !== card);
  if (fit < 0) {
    // never delete a person: costs a life, the email is left untouched
    loseLife(cx, cy, `${card.t.from} is a person! −❤`);
    DF.wrong++;
    DF.done.push({ t: card.t, op: null });
    $('#dfTicker').textContent = `😬 Don't delete people. ${card.t.from}'s email is left as it was.`;
    return;
  }
  let pts;
  if (fit === 2) { addCombo(); DF.right++; pts = 10 * DF.combo; SFX.play('good'); }
  else if (fit === 1) { DF.right++; pts = 5; SFX.play(shot); }
  else { DF.combo = 1; DF.wrong++; pts = 1; SFX.play('bad'); }
  DF.score += pts;
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
    DF.score += pts; DF.bossesBeaten++;
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
  const slow = DF.slowT > 0 ? 0.45 : 1;
  DF.slowT = Math.max(0, DF.slowT - dt); DF.tripleT = Math.max(0, DF.tripleT - dt);
  DF.cool = Math.max(0, DF.cool - dt);
  // turret
  if (DF.keys.a || DF.keys.arrowleft) DF.turret.x -= 560 * dt;
  if (DF.keys.d || DF.keys.arrowright) DF.turret.x += 560 * dt;
  DF.turret.x = Math.max(28, Math.min(DF.W - 28, DF.turret.x));
  for (const [key, shot] of Object.entries(FIRE_KEYS)) if (DF.keys[key]) fire(shot);
  // waves
  if (DF.breakT > 0) DF.breakT -= dt;
  else if (DF.waveLeft > 0) {
    DF.spawnT -= dt;
    if (DF.spawnT <= 0) { dfSpawn(); DF.spawnT = Math.max(1.0, 2.6 - DF.wave * 0.22) * (0.8 + Math.random() * 0.4); }
  } else if (!DF.cards.length && !DF.boss) {
    if (!DF.bossDone && spawnBoss()) DF.bossDone = true;
    else if (DF.queue.length) { DF.bossDone = false; startWave(DF.wave + 1); }
    else if (!DF.cards.length) { DF.over = true; setTimeout(() => endDefense(true), 700); }
  }
  // cards
  const speed = (24 + DF.wave * 7) * slow;
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
    if (b.y < 40) b.y += 60 * dt;
    else b.y += (5 + DF.wave) * slow * dt;
    b.x += b.dir * (90 + DF.wave * 12) * slow * dt;
    if (b.x < 10 || b.x + b.w > DF.W - 10) b.dir *= -1;
    if (b.y + b.h >= DF.lineY) {
      // boss reached the inbox: two lives, and its emails stay untouched
      b.items.forEach((t) => DF.done.push({ t, op: null }));
      DF.boss = null; DF.missed++;
      loseLife(DF.W / 2, DF.lineY - 30, 'The boss got through! −❤');
      if (DF.lives > 0) loseLife(DF.W / 2, DF.lineY - 60, '−❤');
    }
  }
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
  DF.stars.forEach((s) => { s.y += s.s * 18 * dt * (DF.slowT > 0 ? 0.4 : 1); if (s.y > DF.H) { s.y = 0; s.x = Math.random() * DF.W; } });
  DF.shake = Math.max(0, DF.shake - dt); DF.flash = Math.max(0, DF.flash - dt);
}

function dfDraw() {
  const c = DF.ctx, W = DF.W, H = DF.H;
  c.save();
  if (DF.shake > 0) c.translate((Math.random() - 0.5) * 14 * DF.shake, (Math.random() - 0.5) * 14 * DF.shake);
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, DF.slowT > 0 ? '#101a33' : '#0d1222'); g.addColorStop(1, '#1d1033');
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
  // turret
  const tx = DF.turret.x, ty = H - 32;
  c.shadowColor = DF.turret.glow; c.shadowBlur = 18; c.fillStyle = '#ffd45e';
  c.beginPath(); c.roundRect(tx - 28, ty, 56, 16, 8); c.fill();
  c.beginPath(); c.roundRect(tx - 6, ty - 16, 12, 20, 4); c.fill(); c.shadowBlur = 0;
  c.fillStyle = DF.turret.glow; c.beginPath(); c.arc(tx, ty - 16, 4, 0, Math.PI * 2); c.fill();
  if (DF.tripleT > 0) { c.fillStyle = '#ffd45e'; c.font = '700 11px system-ui'; c.textAlign = 'center'; c.fillText(`TRIPLE ${Math.ceil(DF.tripleT)}s`, tx, ty + 30); }
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
  if (DF.slowT > 0) { c.fillStyle = 'rgba(120,170,255,.08)'; c.fillRect(0, 0, W, H); }
  c.restore();
  if (DF.flash > 0) { c.fillStyle = `rgba(255,90,120,${DF.flash})`; c.fillRect(0, 0, W, H); }
  if (DF.paused) { c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(0, 0, W, H); c.fillStyle = '#fff'; c.font = '700 28px system-ui'; c.textAlign = 'center'; c.fillText('Paused · P to resume', W / 2, H / 2); }
}

function endDefense(won) {
  if (!DF.on || DF.ended) return;
  DF.ended = true; DF.on = false;
  cancelAnimationFrame(DF.raf);
  const newBest = DF.score > DF.best;
  if (newBest) store.set('defenseBest', DF.score);
  const groups = { delete: [], archive: [], reply: [], keep: [] };
  DF.done.forEach((d) => { if (d.op) groups[d.op].push(d.t); });
  const rows = Object.entries(groups).filter(([, l]) => l.length);
  const shots = DF.right + DF.wrong;
  const acc = shots ? Math.round((100 * DF.right) / shots) : 0;
  const el = $('#defense');
  setHTML(el, `<div class="t-end bk-review">
    <h1>${won ? 'Inbox defended! 🛡️' : DF.lives <= 0 ? 'Your inbox was overrun' : 'Run finished'}</h1>
    <div class="big">${DF.score}</div>
    <div class="dim">${newBest ? '🏆 New best score' : 'Best: ' + Math.max(DF.best, DF.score)}</div>
    <div class="t-stats"><div><b>${DF.wave}</b>wave</div><div><b>${acc}%</b>perfect calls</div><div><b>x${DF.maxCombo}</b>best combo</div><div><b>${DF.bossesBeaten}</b>bosses beaten</div><div><b>${DF.missed}</b>landed</div></div>
    ${rows.length ? `<p id="dfIntro"><b>Nothing in your Gmail has changed yet.</b> Untick anything you don't want, then apply.</p>
    <div class="df-groups">${rows.map(([op, list]) => `<details class="df-group"><summary><input type="checkbox" data-op="${op}" checked> <b>${OP_LABEL[op]}</b> · ${list.length} email${list.length > 1 ? 's' : ''}</summary>
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
    const jobs = chosen.flatMap((op) => groups[op].map((t) => [t, op]));
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

// keys: A/D (or arrows) move · H reply · J delete · K archive · L keep (held = auto-fire) · P pause · Q/Esc finish
function defenseKey(e, down = true) {
  const k = e.key.toLowerCase();
  if (k === 'a' || k === 'd' || k === 'arrowleft' || k === 'arrowright') { DF.keys[k] = down; return true; }
  if (FIRE_KEYS[k]) { if (down && !DF.keys[k]) fire(FIRE_KEYS[k]); DF.keys[k] = down; return true; }
  if (!down) return false;
  if (k === 'p') { DF.paused = !DF.paused; return true; }
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
  DF.keys.h = DF.keys.j = DF.keys.k = DF.keys.l = false;
  if (Math.abs(aim - DF.turret.x) < 30) {
    if (tgt && tgt.y > 60) DF.keys[{ promo: 'j', update: 'k', person: (tgt.t.subject || '').length % 2 ? 'h' : 'l' }[tgt.t.kind]] = true;
    else if (!tgt && DF.boss) DF.keys.j = true;
  }
}
