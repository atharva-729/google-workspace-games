// Promo Breakout: your inbox as a brick wall. Promotions and updates break. People (and meeting notes) are
// steel bricks, scattered at random through the wall: they never break, and their mail is never touched.
// Pick a pace: the ball keeps speeding up until that pace's top speed, then holds there. Clear a wall and the
// next one is built from the rest of your mail, so every email gets a brick. Two bests per pace: points, and
// emails cleared. Q or Esc finishes. Nothing changes in Gmail until you review and apply.
const BK = { on: false };
const BK_COLORS = { promo: ['#ff6b8b', '#ff8f5e', '#ff5ec4', '#d66bff', '#ff7a7a'], update: ['#4fb8ff', '#45d6d0', '#6b9bff'] };
const BK_DROPS = { multi: '⚪', wide: '↔', sweep: '🧹' };
const BK_OP = { delete: '🗑 Trash', archive: '📥 Archive' };
// Ball speed: [start, added per level, ceiling] in px/s. A level is BK_LEVEL_SECONDS with the ball in play.
const BK_PACES = {
  relaxed: { name: 'Relaxed', key: '1', desc: 'Slow ball, wide paddle, 5 lives', speed: [300, 18, 480], paddle: 130, lives: 5 },
  normal: { name: 'Normal', key: '2', desc: 'The standard game, 3 lives', speed: [370, 22, 590], paddle: 110, lives: 3 },
  fast: { name: 'Fast', key: '3', desc: 'Quick ball, small paddle, 3 lives', speed: [450, 26, 720], paddle: 95, lives: 3 },
};
const BK_LEVEL_SECONDS = 20;
const WALL_SIZE = 45; // breakable bricks per wall
const BK_CONTROLS = '<b>A D</b> or mouse move · <b>Space</b> launch · <b>P</b> pause · <b>Q</b> finish · 👤 steel = people';
const bkBack = () => S.backend.backLabel || 'Back to mail';

function bkHash(s) { let h = 7; for (const c of s || '') h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); }
function bkSpeedNow() {
  const p = BK_PACES[BK.pace], raw = p.speed[0] + (p.speed[1] * BK.t) / BK_LEVEL_SECONDS;
  return { speed: Math.min(p.speed[2], raw), top: raw >= p.speed[2] };
}
function bkBestFor(pace) {
  const b = store.get('breakoutBest.' + pace) || {};
  const old = store.get('breakoutBest'); // single best from before paces existed counts as Normal
  return { score: b.score || (pace === 'normal' && typeof old === 'number' ? old : 0), cleared: b.cleared || 0 };
}
const isSteel = (t) => t.kind === 'person' || t.kind === 'notes';
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

async function startBreakout() {
  if (T.active || BK.on || BK.loading || DF.on || DF.loading) return;
  closeThread(false);
  $('#main').classList.add('hidden');
  const el = $('#breakout');
  el.classList.remove('hidden');
  const back = (html) => { setHTML(el, `<div class="t-end">${html}<div class="t-end-btns"><button id="bkBack">${bkBack()}</button></div></div>`); $('#bkBack').onclick = exitBreakout; };
  back('<div class="status t-loading">Building the wall from your inbox…</div>');
  let items;
  BK.loading = true;
  try { items = await fetchBricks(); } catch (e) { if (!el.classList.contains('hidden')) back(`<p class="status">${esc(e.message)}</p>`); return; }
  finally { BK.loading = false; }
  if (el.classList.contains('hidden')) return; // left while it was loading
  if (!items.some((t) => !isSteel(t))) { back('<h1>Nothing to smash 🎉</h1><p class="dim">Everything on screen is from people.</p>'); return; }
  breakoutMenu(items);
}

function breakoutMenu(items) {
  const el = $('#breakout'), last = store.get('breakoutPace') || 'normal';
  const n = items.filter((t) => !isSteel(t)).length, walls = Math.ceil(n / WALL_SIZE);
  BK.menu = { items, last };
  setHTML(el, `<div class="t-end df-menu"><h1>🧱 Promo Breakout</h1>
    <p class="dim">${n} emails to smash${walls > 1 ? ` across ${walls} walls` : ''}. People are steel bricks: they never break.
    Pick a pace: the ball keeps getting faster, then holds at its top speed.</p>
    <div class="df-levels">${Object.entries(BK_PACES).map(([id, p]) => { const b = bkBestFor(id); return `<button class="df-level${id === last ? ' last' : ''}" data-pace="${id}"><b><kbd>${p.key}</kbd> ${p.name}</b><small>${p.desc}</small><small>Best: ${b.score} pts · ${b.cleared} cleared</small></button>`; }).join('')}</div>
    <p class="dim">${BK_CONTROLS} · <b>Enter</b> plays your last pace</p>
    <div class="t-end-btns"><button id="bkBack">${bkBack()}</button></div></div>`);
  el.querySelectorAll('[data-pace]').forEach((b) => (b.onclick = () => pickBkPace(b.dataset.pace)));
  $('#bkBack').onclick = exitBreakout;
}
function pickBkPace(pace) {
  const m = BK.menu;
  if (!m) return;
  BK.menu = null;
  store.set('breakoutPace', pace);
  setupBreakout(m.items, pace);
}
// keys on the pace menu: 1 2 3, or Enter for the last pace
function breakoutMenuKey(e) {
  if (!BK.menu) return false;
  const p = Object.keys(BK_PACES).find((id) => BK_PACES[id].key === e.key);
  if (p) { pickBkPace(p); return true; }
  if (e.key === 'Enter') { pickBkPace(BK.menu.last); return true; }
  return false;
}

function exitBreakout() {
  BK.on = false;
  BK.menu = null;
  cancelAnimationFrame(BK.raf);
  $('#breakout').classList.add('hidden');
  setHTML($('#breakout'), '');
  $('#main').classList.remove('hidden');
  loadList();
}

function setupBreakout(items, pace) {
  const el = $('#breakout'), P = BK_PACES[pace];
  const W = Math.min(940, window.innerWidth - 40), H = Math.min(600, window.innerHeight - 170);
  setHTML(el, `
    <div class="bk-hud"><div class="stat"><b id="bkScore">0</b><span>score</span></div>
      <div class="stat"><b id="bkCleared">0</b><span>cleared</span></div>
      <div class="stat"><b id="bkLives"></b><span>lives</span></div>
      <div class="stat"><b id="bkWall">1</b><span>wall</span></div>
      <div class="stat"><b id="bkLeft">0</b><span>left</span></div>
      <div class="bk-ticker" id="bkTicker">${BK_CONTROLS}</div>
      <button class="t-quit" id="bkQuit" title="Q or Esc">Finish</button><button class="t-quit" id="bkLeave">${bkBack()}</button></div>
    <canvas id="bkCanvas"></canvas>`);
  const cv = $('#bkCanvas'), dpr = window.devicePixelRatio || 1;
  cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
  const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
  // every breakable email, grouped by sender so a sender's bricks sit together; walls are cut from this pool
  const pool = items.filter((t) => !isSteel(t)).sort((a, b) => (a.from || '').localeCompare(b.from || '') || String(a.id).localeCompare(String(b.id)));
  Object.assign(BK, {
    on: true, ended: false, applying: false, ctx, cv, W, H, pace, pool, people: shuffle(items.filter(isSteel)), peopleAt: 0,
    walls: Math.ceil(pool.length / WALL_SIZE), wallNo: 0, bricks: [], broken: [], score: 0, lives: P.lives, chain: 0,
    paused: false, over: false, t: 0, clearT: 0, topSpeed: false, banner: null,
    paddle: { x: W / 2 - P.paddle / 2, w: P.paddle, y: H - 26, h: 12 }, balls: [], drops: [], parts: [], pops: [],
    wideT: 0, keys: {}, last: performance.now(), best: bkBestFor(pace),
  });
  nextWall();
  cv.addEventListener('mousemove', (e) => { const r = cv.getBoundingClientRect(); BK.paddle.x = Math.max(0, Math.min(W - BK.paddle.w, e.clientX - r.left - BK.paddle.w / 2)); });
  cv.addEventListener('click', launch);
  $('#bkQuit').onclick = () => endBreakout(false);
  $('#bkLeave').onclick = exitBreakout;
  bkHud();
  BK.raf = requestAnimationFrame(bkStep);
}

// Build the next wall: up to WALL_SIZE emails from the pool, plus people as steel bricks at random spots.
function nextWall() {
  const W = BK.W, list = BK.pool.splice(0, WALL_SIZE);
  BK.wallNo++;
  const nSteel = BK.people.length ? Math.min(10, Math.max(2, Math.round(list.length * 0.15))) : 0;
  const steel = [];
  for (let i = 0; i < nSteel; i++) steel.push(BK.people[BK.peopleAt++ % BK.people.length]);
  const total = list.length + steel.length, cols = total > 40 ? 9 : 8;
  // random spots for the steel, avoiding a layout where a brick is boxed in by steel on its left, right and
  // underside (the ball could never reach it)
  let slot;
  for (let tries = 0; tries < 30; tries++) {
    slot = new Array(total).fill(false);
    shuffle([...Array(total).keys()]).slice(0, steel.length).forEach((i) => (slot[i] = true));
    const boxed = (i) => {
      const c = i % cols, s = (j, ok) => !ok || j >= total || slot[j];
      return s(i - 1, c > 0) && s(i + 1, c < cols - 1) && i + cols < total && slot[i + cols];
    };
    if (!slot.some((v, i) => !v && boxed(i))) break;
  }
  let a = 0, b = 0;
  const order = slot.map((v) => (v ? steel[b++] : list[a++]));
  const gap = 6, mx = 16, top = 16, bh = 26, bw = (W - 2 * mx - (cols - 1) * gap) / cols;
  BK.bricks = order.map((t, i) => {
    const pal = BK_COLORS[t.kind] || ['#999'];
    return { x: mx + (i % cols) * (bw + gap), y: top + Math.floor(i / cols) * (bh + gap), w: bw, h: bh, t,
      steel: isSteel(t), alive: true, flash: 0, color: pal[bkHash(t.fromEmail) % pal.length] };
  });
  BK.drops = [];
  newBall();
  if (BK.wallNo > 1) { BK.banner = { text: `Wall ${BK.wallNo} of ${BK.walls}`, sub: 'Space to launch', life: 2 }; }
}

function newBall() { BK.balls = [{ x: 0, y: 0, vx: 0, vy: 0, r: 7, stuck: true }]; BK.chain = 0; }
function launch() {
  const v = bkSpeedNow().speed;
  BK.balls.forEach((b) => { if (b.stuck) { b.stuck = false; b.vx = v * 0.35; b.vy = -v * 0.94; } });
}
function aliveBreakable() { return BK.bricks.filter((b) => b.alive && !b.steel); }
function leftTotal() { return aliveBreakable().length + BK.pool.length; }

function bkHud() {
  $('#bkScore').textContent = BK.score;
  $('#bkCleared').textContent = BK.broken.length;
  $('#bkLives').textContent = BK.lives > 5 ? '❤×' + BK.lives : '❤'.repeat(Math.max(0, BK.lives)) || '—';
  $('#bkWall').textContent = BK.walls > 1 ? `${BK.wallNo}/${BK.walls}` : '1';
  $('#bkLeft').textContent = leftTotal();
}

function breakBrick(b, quiet) {
  b.alive = false;
  BK.broken.push(b.t);
  BK.chain++;
  const pts = 10 * Math.min(BK.chain, 8);
  BK.score += pts;
  for (let i = 0; i < 12; i++) BK.parts.push({ x: b.x + b.w / 2, y: b.y + b.h / 2, vx: (Math.random() - 0.5) * 320, vy: (Math.random() - 0.7) * 260, life: 0.7, c: b.color });
  if (!quiet) {
    BK.pops.push({ x: b.x + b.w / 2, y: b.y, text: '+' + pts + (BK.chain > 1 ? ' x' + Math.min(BK.chain, 8) : ''), life: 0.8 });
    $('#bkTicker').textContent = `💥 ${b.t.from}: ${b.t.subject || '(no subject)'}`;
    if (Math.random() < 0.16) { const types = Object.keys(BK_DROPS); BK.drops.push({ x: b.x + b.w / 2, y: b.y + b.h, type: types[Math.floor(Math.random() * types.length)], from: b.t.fromEmail }); }
  }
  bkHud();
  if (!aliveBreakable().length && !BK.clearT) BK.clearT = 0.4; // next wall (or the end) in 0.4 s of play
}
function wallCleared() {
  if (BK.pool.length) { BK.score += 100; BK.pops.push({ x: BK.W / 2, y: BK.H / 2, text: 'Wall cleared! +100', life: 1.4 }); nextWall(); bkHud(); }
  else { BK.over = true; endBreakout(true); }
}

function catchDrop(d) {
  if (d.type === 'multi') {
    const extra = [];
    BK.balls.filter((b) => !b.stuck).forEach((b) => [-0.5, 0.5].forEach((a) => {
      const c = Math.cos(a), s = Math.sin(a);
      extra.push({ ...b, vx: b.vx * c - b.vy * s, vy: b.vx * s + b.vy * c });
    }));
    BK.balls.push(...extra);
    BK.pops.push({ x: d.x, y: BK.paddle.y - 10, text: 'Multi-ball!', life: 1 });
  } else if (d.type === 'wide') {
    BK.wideT = 10;
    BK.pops.push({ x: d.x, y: BK.paddle.y - 10, text: 'Wide paddle!', life: 1 });
  } else {
    // sweep: every remaining brick from the sender whose brick dropped this
    let group = BK.bricks.filter((b) => b.alive && !b.steel && b.t.fromEmail === d.from);
    if (!group.length) {
      const counts = {};
      aliveBreakable().forEach((b) => (counts[b.t.fromEmail] = (counts[b.t.fromEmail] || 0) + 1));
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      group = top ? BK.bricks.filter((b) => b.alive && !b.steel && b.t.fromEmail === top[0]) : [];
    }
    if (group.length) {
      group.forEach((b) => breakBrick(b, true));
      BK.pops.push({ x: BK.W / 2, y: BK.H / 2, text: `🧹 Swept ${group[0].t.from} ×${group.length}`, life: 1.4 });
      $('#bkTicker').textContent = `🧹 Swept everything from ${group[0].t.from}`;
    }
  }
}

function bkStep(now) {
  if (!BK.on) return;
  const dt = Math.max(0, Math.min(0.033, (now - BK.last) / 1000));
  BK.last = now;
  if (!BK.paused && !BK.over) bkUpdate(dt);
  bkDraw();
  BK.raf = requestAnimationFrame(bkStep);
}

function bkUpdate(dt) {
  const P = BK.paddle, W = BK.W, H = BK.H;
  if (BK.clearT) { BK.clearT -= dt; if (BK.clearT <= 0) { BK.clearT = 0; wallCleared(); if (!BK.on) return; } }
  const inPlay = BK.balls.some((b) => !b.stuck);
  if (inPlay) BK.t += dt; // the ball only speeds up while it's moving
  const { speed, top } = bkSpeedNow();
  if (top && !BK.topSpeed) { BK.topSpeed = true; BK.banner = { text: 'Top speed!', sub: 'it stays this fast now', life: 1.8 }; }
  BK.wideT = Math.max(0, BK.wideT - dt);
  const baseW = BK_PACES[BK.pace].paddle, targetW = BK.wideT > 0 ? baseW + 60 : baseW;
  if (P.w !== targetW) { P.x += (P.w - targetW) / 2; P.w = targetW; }
  if (BK.keys.left) P.x -= 720 * dt;
  if (BK.keys.right) P.x += 720 * dt;
  P.x = Math.max(0, Math.min(W - P.w, P.x));

  for (const b of BK.balls) {
    if (b.stuck) { b.x = P.x + P.w / 2; b.y = P.y - b.r - 1; continue; }
    // every ball moves at the current speed, which only goes up; never let it go nearly flat
    const v = Math.hypot(b.vx, b.vy) || 1;
    b.vx *= speed / v; b.vy *= speed / v;
    if (Math.abs(b.vy) < speed * 0.3) { b.vy = Math.sign(b.vy || -1) * speed * 0.3; b.vx = Math.sign(b.vx || 1) * Math.sqrt(speed * speed - b.vy * b.vy); }
    const steps = Math.max(1, Math.ceil((speed * dt) / 4));
    for (let s = 0; s < steps; s++) {
      b.x += (b.vx * dt) / steps; b.y += (b.vy * dt) / steps;
      if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx); }
      if (b.x > W - b.r) { b.x = W - b.r; b.vx = -Math.abs(b.vx); }
      if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy); }
      // paddle
      if (b.vy > 0 && b.y + b.r >= P.y && b.y + b.r <= P.y + P.h + 8 && b.x >= P.x - b.r && b.x <= P.x + P.w + b.r) {
        const hit = Math.max(-1, Math.min(1, (b.x - (P.x + P.w / 2)) / (P.w / 2)));
        const ang = hit * 1.05;
        b.vx = speed * Math.sin(ang); b.vy = -speed * Math.cos(ang);
        b.y = P.y - b.r;
        BK.chain = 0;
      }
      // bricks
      for (const k of BK.bricks) {
        if (!k.alive) continue;
        const nx = Math.max(k.x, Math.min(b.x, k.x + k.w)), ny = Math.max(k.y, Math.min(b.y, k.y + k.h));
        const dx = b.x - nx, dy = b.y - ny;
        if (dx * dx + dy * dy > b.r * b.r) continue;
        const ox = (b.x - (k.x + k.w / 2)) / (k.w / 2), oy = (b.y - (k.y + k.h / 2)) / (k.h / 2);
        if (Math.abs(ox) > Math.abs(oy)) { b.vx = Math.sign(ox || 1) * Math.abs(b.vx); b.x = ox > 0 ? k.x + k.w + b.r : k.x - b.r; }
        else { b.vy = Math.sign(oy || 1) * Math.abs(b.vy); b.y = oy > 0 ? k.y + k.h + b.r : k.y - b.r; }
        if (k.steel) { k.flash = 0.25; $('#bkTicker').textContent = k.t.kind === 'notes' ? `📝 Meeting notes: steel. They stay in your inbox.` : `👤 ${k.t.from} is a person: steel. Their email stays as it is.`; }
        else breakBrick(k);
        break;
      }
    }
  }
  const before = BK.balls.length;
  BK.balls = BK.balls.filter((b) => b.y < H + 20);
  if (before && !BK.balls.length) {
    BK.lives--;
    bkHud();
    if (BK.lives <= 0) { BK.over = true; setTimeout(() => endBreakout(false), 600); }
    else newBall();
  }
  for (const d of BK.drops) {
    d.y += 170 * dt;
    if (d.y >= P.y && d.y <= P.y + P.h + 10 && d.x >= P.x && d.x <= P.x + P.w) { d.done = true; catchDrop(d); }
  }
  BK.drops = BK.drops.filter((d) => !d.done && d.y < H + 20);
  BK.parts.forEach((p) => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 600 * dt; p.life -= dt; });
  BK.parts = BK.parts.filter((p) => p.life > 0);
  BK.pops.forEach((p) => { p.y -= 40 * dt; p.life -= dt; });
  BK.pops = BK.pops.filter((p) => p.life > 0);
  BK.bricks.forEach((k) => (k.flash = Math.max(0, k.flash - dt)));
  if (BK.banner) { BK.banner.life -= dt; if (BK.banner.life <= 0) BK.banner = null; }
}

function bkDraw() {
  const c = BK.ctx, W = BK.W, H = BK.H, P = BK.paddle;
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#171a2e'); g.addColorStop(1, '#0d0f1a');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.textBaseline = 'middle';
  for (const k of BK.bricks) {
    if (!k.alive) continue;
    if (k.steel) {
      const sg = c.createLinearGradient(0, k.y, 0, k.y + k.h);
      sg.addColorStop(0, '#aab2c2'); sg.addColorStop(0.5, '#6d7588'); sg.addColorStop(1, '#4a5162');
      c.fillStyle = k.flash > 0 ? '#ffffff' : sg;
    } else c.fillStyle = k.flash > 0 ? '#ffffff' : k.color;
    c.beginPath(); c.roundRect(k.x, k.y, k.w, k.h, k.steel ? 3 : 6); c.fill();
    if (k.steel) {
      c.strokeStyle = '#d8dde8'; c.lineWidth = 1.5; c.stroke();
      c.fillStyle = '#2f3542';
      [[4, 4], [k.w - 4, 4], [4, k.h - 4], [k.w - 4, k.h - 4]].forEach(([x, y]) => { c.beginPath(); c.arc(k.x + x, k.y + y, 1.6, 0, Math.PI * 2); c.fill(); });
    }
    c.save(); c.beginPath(); c.rect(k.x + 7, k.y, k.w - 14, k.h); c.clip();
    c.fillStyle = k.steel ? '#ffffff' : 'rgba(255,255,255,.95)';
    c.font = '600 11px "Segoe UI", system-ui, sans-serif';
    c.textAlign = 'left';
    c.fillText((k.steel ? (k.t.kind === 'notes' ? '📝 ' : '👤 ') : '') + (k.t.from || '?'), k.x + 8, k.y + k.h / 2 + 1);
    c.restore();
  }
  for (const d of BK.drops) {
    c.fillStyle = '#ffd45e'; c.beginPath(); c.arc(d.x, d.y, 11, 0, Math.PI * 2); c.fill();
    c.font = '13px system-ui'; c.textAlign = 'center'; c.fillStyle = '#1b1300'; c.fillText(BK_DROPS[d.type], d.x, d.y + 1);
  }
  for (const p of BK.parts) { c.globalAlpha = Math.max(0, p.life / 0.7); c.fillStyle = p.c; c.fillRect(p.x - 2, p.y - 2, 4, 4); }
  c.globalAlpha = 1;
  c.fillStyle = BK.wideT > 0 ? '#3ddc97' : '#ffd45e';
  c.beginPath(); c.roundRect(P.x, P.y, P.w, P.h, 6); c.fill();
  for (const b of BK.balls) {
    c.shadowColor = '#fff'; c.shadowBlur = 12; c.fillStyle = '#fff';
    c.beginPath(); c.arc(b.x, b.y, b.r, 0, Math.PI * 2); c.fill();
    c.shadowBlur = 0;
  }
  c.textAlign = 'center';
  if (BK.balls.some((b) => b.stuck) && !BK.banner) { c.fillStyle = 'rgba(255,255,255,.6)'; c.font = '600 14px system-ui'; c.fillText('Space or click to launch', W / 2, P.y - 40); }
  for (const p of BK.pops) { c.globalAlpha = Math.min(1, p.life * 2); c.fillStyle = '#ffd45e'; c.font = '800 15px system-ui'; c.fillText(p.text, p.x, p.y); }
  c.globalAlpha = 1;
  if (BK.banner) {
    c.globalAlpha = Math.min(1, BK.banner.life * 2);
    c.fillStyle = '#fff'; c.font = '900 38px system-ui'; c.fillText(BK.banner.text, W / 2, H * 0.62);
    c.fillStyle = '#c9c9ff'; c.font = '600 16px system-ui'; c.fillText(BK.banner.sub, W / 2, H * 0.62 + 32);
    c.globalAlpha = 1;
  }
  if (BK.paused) { c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(0, 0, W, H); c.fillStyle = '#fff'; c.font = '700 28px system-ui'; c.fillText('Paused · P to resume', W / 2, H / 2); }
}

function endBreakout(won) {
  if (!BK.on || BK.ended) return;
  BK.ended = true;
  BK.on = false;
  cancelAnimationFrame(BK.raf);
  const best = BK.best, cleared = BK.broken.length, newScore = BK.score > best.score, newCleared = cleared > best.cleared;
  if (newScore || newCleared) store.set('breakoutBest.' + BK.pace, { score: Math.max(best.score, BK.score), cleared: Math.max(best.cleared, cleared) });
  // group what was smashed by sender; promotions go to Trash, the rest to Archive (you can switch either)
  const groups = {};
  BK.broken.forEach((t) => {
    const g = (groups[t.fromEmail] = groups[t.fromEmail] || { name: t.from, email: t.fromEmail, op: t.kind === 'promo' ? 'delete' : 'archive', list: [] });
    g.list.push(t);
  });
  const rows = Object.values(groups).sort((a, b) => b.list.length - a.list.length);
  const el = $('#breakout');
  setHTML(el, `<div class="t-end bk-review">
    <h1>${won ? 'Every wall cleared! 🎉' : BK.lives <= 0 ? 'Game over' : 'Game finished'}</h1>
    <div class="big">${BK.score}</div>
    <div class="dim">${BK_PACES[BK.pace].name} pace · ${newScore ? '🏆 New best score' : 'Best score ' + best.score}</div>
    <div class="df-cleared"><b>${cleared}</b> emails cleared · ${newCleared ? '🏆 New best' : 'best ' + best.cleared}</div>
    ${rows.length ? `<p id="bkIntro"><b>Nothing in your Gmail has changed yet.</b> Untick anything you want to keep, switch Trash or Archive, then apply.</p>
    <table class="bk-table"><thead><tr><th></th><th>Sender</th><th>Emails</th><th>Action</th></tr></thead><tbody>
    ${rows.map((g, i) => `<tr><td><input type="checkbox" data-i="${i}" checked></td><td><b>${esc(g.name)}</b><br><span class="dim">${esc(g.email)}</span></td>
      <td><details><summary>${g.list.length}</summary><ul>${g.list.map((t) => `<li class="dim">${esc(t.subject || '(no subject)')}</li>`).join('')}</ul></details></td>
      <td><select data-i="${i}">${Object.entries(BK_OP).map(([op, label]) => `<option value="${op}"${op === g.op ? ' selected' : ''}>${label}</option>`).join('')}</select></td></tr>`).join('')}
    </tbody></table>
    <div class="t-end-btns"><button id="bkApply" class="primary">Apply changes</button><button id="bkAgain">Play again</button><button id="bkDiscard">${bkBack()}</button></div>
    <p id="bkStatus" class="dim"></p>`
    : `<p class="dim">You didn't smash anything this time.</p><div class="t-end-btns"><button id="bkAgain" class="primary">Play again</button><button id="bkDiscard">${bkBack()}</button></div>`}
  </div>`);
  if (won) confetti();
  $('#bkDiscard').onclick = exitBreakout;
  $('#bkAgain').onclick = () => { BK.on = false; startBreakout(); };
  const apply = $('#bkApply');
  if (!apply) return;
  const chosen = () => {
    el.querySelectorAll('select[data-i]').forEach((s) => (rows[s.dataset.i].op = s.value));
    return [...el.querySelectorAll('input[type=checkbox]')].filter((x) => x.checked).map((x) => rows[x.dataset.i]);
  };
  const label = () => {
    const sel = chosen(), n = (op) => sel.filter((g) => g.op === op).reduce((s, g) => s + g.list.length, 0);
    apply.textContent = `Apply: trash ${n('delete')}, archive ${n('archive')}`;
    apply.disabled = !sel.length;
  };
  el.querySelectorAll('input[type=checkbox], select').forEach((x) => (x.onchange = label));
  label();
  apply.onclick = async () => {
    const jobs = chosen().flatMap((g) => g.list.map((t) => [t, g.op]));
    BK.applying = true;
    const btns = [...el.querySelectorAll('.t-end-btns button')];
    btns.forEach((b) => (b.disabled = true));
    el.querySelectorAll('input, select').forEach((x) => (x.disabled = true));
    const say = (s) => { $('#bkStatus').textContent = s; };
    let failed = 0, note = 'Trashed mail stays in Trash for 30 days.';
    if (S.backend.applyAll) {
      // bookmarklet: one batch per Gmail view and action, pressing Gmail's own buttons
      const r = await S.backend.applyAll(jobs, say);
      failed = r.failed;
      note = r.note || '';
    } else {
      let done = 0;
      for (const [t, op] of jobs) {
        try { op === 'delete' ? await S.backend.trash(t.id) : await S.backend.modify(t.id, [], ['INBOX']); } catch { failed++; }
        say(`Applying… ${++done} / ${jobs.length}`);
      }
    }
    say(`Done ✓ ${jobs.length - failed} emails cleaned up${failed ? `, ${failed} not changed` : ''}. ${note}`);
    BK.applying = false;
    $('#bkIntro').textContent = 'Applied to your Gmail.';
    btns.forEach((b) => (b.disabled = b === apply));
    apply.textContent = 'Applied ✓';
  };
}

// keys: A/D (or arrows) move · Space launch · P pause · Q/Esc finish and review
function breakoutKey(e, down = true) {
  const k = e.key.toLowerCase();
  if (k === 'arrowleft' || k === 'a') { BK.keys.left = down; return true; }
  if (k === 'arrowright' || k === 'd') { BK.keys.right = down; return true; }
  if (!down) return false;
  if (k === ' ') { launch(); return true; }
  if (k === 'p') { BK.paused = !BK.paused; return true; }
  if (k === 'q' || k === 'escape') { endBreakout(false); return true; }
  return false;
}
window.addEventListener('keyup', (e) => { if (BK.on && breakoutKey(e, false)) e.preventDefault(); });
window.addEventListener('blur', () => { BK.keys = {}; });

// test autoplayer: keep the paddle under the lowest falling ball, launch when it's waiting
function bkAuto() {
  if (BK.balls.some((b) => b.stuck)) { launch(); return; }
  const b = BK.balls.filter((x) => x.vy > 0).sort((x, y) => y.y - x.y)[0] || BK.balls[0];
  if (b) BK.paddle.x = Math.max(0, Math.min(BK.W - BK.paddle.w, b.x - BK.paddle.w / 2 + ((b.x * 7) % 30) - 15));
}
