// Promo Breakout: your inbox as a brick wall. Promos and updates break; mail from people is steel.
// Nothing changes in Gmail during play. At the end you review what you smashed and choose what to apply.
const BK = { on: false };
const BK_COLORS = { promo: ['#ff6b8b', '#ff8f5e', '#ff5ec4', '#d66bff', '#ff7a7a'], update: ['#4fb8ff', '#45d6d0', '#6b9bff'] };
const BK_DROPS = { multi: '⚪', wide: '↔', sweep: '🧹' };

function bkHash(s) { let h = 7; for (const c of s || '') h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); }

// One load at a time: a second click while the first load is still running reuses it instead of doubling the API calls.
let bricksLoad = null;
function fetchBricks() {
  return bricksLoad || (bricksLoad = loadBricks().finally(() => { bricksLoad = null; }));
}

async function loadBricks() {
  const be = S.backend;
  if (!be.live) { const r = await be.listThreads({ view: 'inbox' }); return r.threads.map((t) => ({ ...t, kind: classify(t) })); }
  const out = [], seen = new Set();
  for (const [q, max, kind] of [['in:inbox category:promotions', 40, 'promo'], ['in:inbox category:updates', 14, 'update'], ['in:inbox category:primary is:unread', 8, null]]) {
    const r = await be.listThreads({ view: 'search', q, max });
    r.threads.forEach((t) => { if (!seen.has(t.id)) { seen.add(t.id); out.push({ ...t, kind: kind || classify(t) }); } });
  }
  return out;
}

async function startBreakout() {
  if (T.active || BK.on || BK.loading || DF.on || DF.loading) return;
  closeThread(false);
  $('#main').classList.add('hidden');
  const el = $('#breakout');
  el.classList.remove('hidden');
  el.innerHTML = '<div class="status t-loading">Building the wall from your inbox…</div>';
  let items;
  BK.loading = true;
  try { items = await fetchBricks(); } catch (e) { el.innerHTML = `<div class="status">Error: ${esc(e.message)}</div>`; return; }
  finally { BK.loading = false; }
  if (el.classList.contains('hidden')) return; // left while it was loading
  if (!items.some((t) => t.kind !== 'person')) {
    el.innerHTML = '<div class="t-end"><h1>No promos to smash 🎉</h1><div class="t-end-btns"><button id="bkBack" class="primary">Back to mail</button></div></div>';
    $('#bkBack').onclick = exitBreakout;
    return;
  }
  setupBreakout(items);
}

function exitBreakout() {
  BK.on = false;
  cancelAnimationFrame(BK.raf);
  $('#breakout').classList.add('hidden');
  $('#breakout').innerHTML = '';
  $('#main').classList.remove('hidden');
  loadList();
}

function setupBreakout(items) {
  const el = $('#breakout');
  const W = Math.min(940, window.innerWidth - 40), H = Math.min(600, window.innerHeight - 170);
  el.innerHTML = `
    <div class="bk-hud"><div class="stat"><b id="bkScore">0</b><span>score</span></div>
      <div class="stat"><b id="bkLives">❤❤❤</b><span>lives</span></div>
      <div class="stat"><b id="bkLeft">0</b><span>left</span></div>
      <div class="bk-ticker" id="bkTicker">Space to launch · ← → or mouse to move · 👤 steel bricks are people: they don't break</div>
      <button class="t-quit" id="bkQuit">Finish</button></div>
    <canvas id="bkCanvas"></canvas>`;
  const cv = $('#bkCanvas'), dpr = window.devicePixelRatio || 1;
  cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
  const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);

  // layout: breakable bricks grouped by sender, people spread through the wall as steel
  const breakable = items.filter((t) => t.kind !== 'person').sort((a, b) => (a.from || '').localeCompare(b.from || '')).slice(0, 64);
  const people = items.filter((t) => t.kind === 'person').slice(0, 8);
  const list = breakable.slice();
  people.forEach((p, k) => list.splice(Math.round(((k + 1) * list.length) / (people.length + 1)) + k, 0, p));
  const cols = list.length > 40 ? 9 : 8, gap = 6, mx = 16, top = 16, bh = 26;
  const bw = (W - 2 * mx - (cols - 1) * gap) / cols;
  const bricks = list.map((t, i) => {
    const pal = BK_COLORS[t.kind] || ['#999'];
    return { x: mx + (i % cols) * (bw + gap), y: top + Math.floor(i / cols) * (bh + gap), w: bw, h: bh, t,
      steel: t.kind === 'person', alive: true, flash: 0, color: t.kind === 'person' ? '#6b7385' : pal[bkHash(t.fromEmail) % pal.length] };
  });

  Object.assign(BK, {
    on: true, ctx, cv, W, H, bricks, broken: [], score: 0, lives: 3, chain: 0, paused: false, over: false,
    paddle: { x: W / 2 - 55, w: 110, y: H - 26, h: 12 }, balls: [], drops: [], parts: [], pops: [],
    wideT: 0, speed: 400, keys: {}, last: performance.now(), best: store.get('breakoutBest') || 0,
  });
  newBall();
  cv.addEventListener('mousemove', (e) => { const r = cv.getBoundingClientRect(); BK.paddle.x = Math.max(0, Math.min(W - BK.paddle.w, e.clientX - r.left - BK.paddle.w / 2)); });
  cv.addEventListener('click', launch);
  $('#bkQuit').onclick = () => endBreakout(false);
  bkHud();
  BK.raf = requestAnimationFrame(bkStep);
}

function newBall() { BK.balls = [{ x: 0, y: 0, vx: 0, vy: 0, r: 7, stuck: true }]; BK.chain = 0; }
function launch() {
  BK.balls.forEach((b) => { if (b.stuck) { b.stuck = false; b.vx = BK.speed * 0.35; b.vy = -BK.speed * 0.94; } });
}
function aliveBreakable() { return BK.bricks.filter((b) => b.alive && !b.steel); }

function bkHud() {
  $('#bkScore').textContent = BK.score;
  $('#bkLives').textContent = '❤'.repeat(Math.max(0, BK.lives)) || '—';
  $('#bkLeft').textContent = aliveBreakable().length;
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
  BK.speed = Math.min(620, 400 + BK.broken.length * 4);
  bkHud();
  if (!aliveBreakable().length) setTimeout(() => endBreakout(true), 400);
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
  BK.wideT = Math.max(0, BK.wideT - dt);
  const targetW = BK.wideT > 0 ? 170 : 110;
  if (P.w !== targetW) { P.x += (P.w - targetW) / 2; P.w = targetW; }
  if (BK.keys.left) P.x -= 720 * dt;
  if (BK.keys.right) P.x += 720 * dt;
  P.x = Math.max(0, Math.min(W - P.w, P.x));

  for (const b of BK.balls) {
    if (b.stuck) { b.x = P.x + P.w / 2; b.y = P.y - b.r - 1; continue; }
    const steps = Math.max(1, Math.ceil((Math.hypot(b.vx, b.vy) * dt) / 4));
    for (let s = 0; s < steps; s++) {
      b.x += (b.vx * dt) / steps; b.y += (b.vy * dt) / steps;
      if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx); }
      if (b.x > W - b.r) { b.x = W - b.r; b.vx = -Math.abs(b.vx); }
      if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy); }
      // paddle
      if (b.vy > 0 && b.y + b.r >= P.y && b.y + b.r <= P.y + P.h + 8 && b.x >= P.x - b.r && b.x <= P.x + P.w + b.r) {
        const hit = Math.max(-1, Math.min(1, (b.x - (P.x + P.w / 2)) / (P.w / 2)));
        const ang = hit * 1.05;
        b.vx = BK.speed * Math.sin(ang); b.vy = -BK.speed * Math.cos(ang);
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
        if (k.steel) { k.flash = 0.25; $('#bkTicker').textContent = `👤 ${k.t.from} is a person. Steel brick: reply in Triage run instead.`; }
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
}

function bkDraw() {
  const c = BK.ctx, W = BK.W, H = BK.H, P = BK.paddle;
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#171a2e'); g.addColorStop(1, '#0d0f1a');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.textBaseline = 'middle';
  for (const k of BK.bricks) {
    if (!k.alive) continue;
    c.fillStyle = k.flash > 0 ? '#ffffff' : k.color;
    c.beginPath(); c.roundRect(k.x, k.y, k.w, k.h, 6); c.fill();
    if (k.steel) { c.strokeStyle = '#b8c0d0'; c.lineWidth = 2; c.stroke(); }
    c.save(); c.beginPath(); c.rect(k.x + 5, k.y, k.w - 10, k.h); c.clip();
    c.fillStyle = k.steel ? '#e6e9f0' : 'rgba(255,255,255,.95)';
    c.font = '600 11px "Segoe UI", system-ui, sans-serif';
    c.textAlign = 'left';
    c.fillText((k.steel ? '👤 ' : '') + (k.t.from || '?'), k.x + 6, k.y + k.h / 2 + 1);
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
  for (const p of BK.pops) { c.globalAlpha = Math.min(1, p.life * 2); c.fillStyle = '#ffd45e'; c.font = '800 15px system-ui'; c.fillText(p.text, p.x, p.y); }
  c.globalAlpha = 1;
  if (BK.paused) { c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(0, 0, W, H); c.fillStyle = '#fff'; c.font = '700 28px system-ui'; c.fillText('Paused · P to resume', W / 2, H / 2); }
}

function endBreakout(won) {
  if (!BK.on || BK.ended) return;
  BK.ended = true;
  BK.on = false;
  cancelAnimationFrame(BK.raf);
  const newBest = BK.score > BK.best;
  if (newBest) store.set('breakoutBest', BK.score);
  // group what was smashed by sender
  const groups = {};
  BK.broken.forEach((t) => {
    const g = (groups[t.fromEmail] = groups[t.fromEmail] || { name: t.from, kind: t.kind, ids: [], unsub: t.listUnsub });
    g.ids.push(t.id);
  });
  const rows = Object.entries(groups).sort((a, b) => b[1].ids.length - a[1].ids.length);
  const el = $('#breakout');
  el.innerHTML = `<div class="t-end bk-review">
    <h1>${won ? 'Wall cleared! 🎉' : 'Game over'}</h1>
    <div class="big">${BK.score}</div>
    <div class="dim">${newBest ? '🏆 New best score' : 'Best: ' + Math.max(BK.best, BK.score)}</div>
    ${rows.length ? `<p>You smashed <b>${BK.broken.length}</b> emails. <b>Nothing in your Gmail has changed yet.</b> Untick anything you want to keep, then apply.</p>
    <table class="bk-table"><thead><tr><th></th><th>Sender</th><th>Emails</th><th>Action</th><th></th></tr></thead><tbody>
    ${rows.map(([email, g], i) => `<tr><td><input type="checkbox" data-i="${i}" checked></td><td><b>${esc(g.name)}</b><br><span class="dim">${esc(email)}</span></td><td>${g.ids.length}</td>
      <td>${g.kind === 'promo' ? '🗑 Trash' : '📥 Archive'}</td><td>${/^https?:/.test(g.unsub) ? `<a href="${esc(g.unsub)}" target="_blank" rel="noopener">Unsubscribe ↗</a>` : ''}</td></tr>`).join('')}
    </tbody></table>
    <div class="t-end-btns"><button id="bkApply" class="primary">Apply</button><button id="bkDiscard">Discard, change nothing</button><button id="bkAgain">Play again</button></div>
    <p id="bkStatus" class="dim"></p>`
    : `<p class="dim">You didn't smash anything this time.</p><div class="t-end-btns"><button id="bkAgain" class="primary">Play again</button><button id="bkDiscard">Back to mail</button></div>`}
  </div>`;
  if (won) confetti();
  const applyLabel = () => {
    const sel = [...el.querySelectorAll('input[type=checkbox]')].filter((x) => x.checked).map((x) => rows[x.dataset.i][1]);
    const tr = sel.filter((g) => g.kind === 'promo').reduce((n, g) => n + g.ids.length, 0);
    const ar = sel.filter((g) => g.kind !== 'promo').reduce((n, g) => n + g.ids.length, 0);
    const b = $('#bkApply');
    if (b) { b.textContent = `Apply: trash ${tr}, archive ${ar}`; b.disabled = !(tr + ar); }
    return sel;
  };
  el.querySelectorAll('input[type=checkbox]').forEach((x) => (x.onchange = applyLabel));
  applyLabel();
  $('#bkDiscard').onclick = exitBreakout;
  $('#bkAgain').onclick = () => { BK.ended = false; BK.on = false; startBreakout(); };
  const apply = $('#bkApply');
  if (apply) apply.onclick = async () => {
    const sel = applyLabel();
    apply.disabled = true;
    el.querySelectorAll('input[type=checkbox]').forEach((x) => (x.disabled = true));
    const jobs = sel.flatMap((g) => g.ids.map((id) => [id, g.kind === 'promo' ? 'trash' : 'archive']));
    let done = 0, failed = 0;
    for (const [id, op] of jobs) {
      try { op === 'trash' ? await S.backend.trash(id) : await S.backend.modify(id, [], ['INBOX']); }
      catch { failed++; }
      done++;
      $('#bkStatus').textContent = `Applying… ${done} / ${jobs.length}`;
    }
    $('#bkStatus').textContent = `Done ✓ ${jobs.length - failed} emails cleaned up${failed ? `, ${failed} failed` : ''}. Trashed mail stays in Trash for 30 days.`;
    apply.textContent = 'Applied';
  };
}

function breakoutKey(e, down) {
  const k = e.key;
  if (k === 'ArrowLeft' || k === 'a') { BK.keys.left = down; return true; }
  if (k === 'ArrowRight' || k === 'd') { BK.keys.right = down; return true; }
  if (!down) return false;
  if (k === ' ') { launch(); return true; }
  if (k === 'p' || k === 'P') { BK.paused = !BK.paused; return true; }
  if (k === 'Escape') { endBreakout(false); return true; }
  return false;
}
window.addEventListener('keyup', (e) => { if (BK.on && breakoutKey(e, false)) e.preventDefault(); });
