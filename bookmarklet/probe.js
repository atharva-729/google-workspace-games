// Inbox Arcade probe 2: checks how a bookmarklet game could apply its results inside Gmail's own page.
// Read-only, apart from one optional test (a button) that stars the first email and un-stars it again.
// It reports counts, yes/no answers and Gmail's button names: no subjects, no addresses.
(async () => {
  const ID = 'ia-probe';
  const old = document.getElementById(ID);
  if (old) old.remove();
  if (location.hostname !== 'mail.google.com' && !window.__iaProbeAnyHost) { alert('Open Gmail (mail.google.com) first, then click this bookmark.'); return; }
  const t0 = performance.now();
  const R = { probe: 2 };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const visibleRows = () => [...document.querySelectorAll('tr.zA')].filter((r) => r.getClientRects().length);
  const name = (el) => (el.getAttribute('aria-label') || el.getAttribute('data-tooltip') || el.textContent || '').trim().slice(0, 40);
  const press = (el) => {
    const b = el.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, view: window, button: 0, clientX: b.left + b.width / 2, clientY: b.top + b.height / 2 };
    for (const t of ['mouseover', 'mousedown', 'mouseup', 'click']) el.dispatchEvent(new MouseEvent(t, o));
  };
  const safe = async (key, fn) => {
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('no answer in 5 s')), 5000));
    try { R[key] = await Promise.race([fn(), timeout]); } catch (e) { R[key] = 'ERROR ' + (e && e.name) + ': ' + String(e && e.message).slice(0, 120); }
  };

  // ---- panel in a shadow root with a constructed stylesheet (the styling route the game uses)
  const host = document.createElement('div');
  host.id = ID;
  host.style.cssText = 'position:fixed;top:16px;right:16px;z-index:2147483647';
  const root = host.attachShadow({ mode: 'open' });
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  try {
    const sh = new CSSStyleSheet();
    sh.replaceSync(`.box{width:440px;max-height:85vh;overflow:auto;background:#14162b;color:#eef;font:13px/1.5 system-ui,sans-serif;border-radius:12px;padding:14px 16px;box-shadow:0 12px 40px rgba(0,0,0,.5)}
      .h{font-weight:700;font-size:15px;margin-bottom:6px} .s{opacity:.8} .t{width:7px}
      pre{white-space:pre-wrap;word-break:break-word;background:#0c0d1c;border-radius:8px;padding:10px;margin:10px 0;max-height:45vh;overflow:auto;font:11px/1.4 ui-monospace,Consolas,monospace}
      button{cursor:pointer;border:0;border-radius:8px;padding:7px 12px;font:600 13px system-ui;background:#8b8bff;color:#101;margin-right:6px}`);
    root.adoptedStyleSheets = [sh];
  } catch (e) { R.shadowStyles = 'ERROR ' + e.message; }
  const box = el('div', 'box');
  box.appendChild(el('div', 'h', 'Inbox Arcade probe 2'));
  const status = el('div', 's', 'Checking…');
  box.appendChild(status);
  const tEl = el('div', 't');
  box.appendChild(tEl);
  root.appendChild(box);
  document.body.appendChild(host);
  if (!R.shadowStyles) R.shadowStyles = getComputedStyle(tEl).width === '7px' ? 'works' : 'blocked';
  tEl.remove();

  // ---- 1. feeds, parsed with a regex (DOMParser is blocked)
  const u = (location.pathname.match(/\/mail\/u\/(\d+)/) || [0, '0'])[1];
  const feedIds = {};
  R.feeds = {};
  for (const [k, label] of [['inbox', ''], ['promotions', '^smartlabel_promo'], ['updates', '^smartlabel_notification']]) {
    await safe('_f', async () => {
      const t = performance.now();
      const r = await fetch(`/mail/u/${u}/feed/atom/${encodeURIComponent(label)}`, { credentials: 'include' });
      const txt = await r.text();
      feedIds[k] = new Set((txt.match(/message_id=[0-9a-f]+/g) || []).map((m) => m.slice(11)));
      return { status: r.status, ms: Math.round(performance.now() - t), fullcount: Number((txt.match(/<fullcount>(\d+)/) || [])[1]), ids: feedIds[k].size };
    });
    R.feeds[k] = R._f;
  }
  delete R._f;

  // ---- 2. row fields the game reads
  const rows = visibleRows();
  const lastIds = rows.map((r) => (r.querySelector('[data-legacy-last-message-id]') || { getAttribute: () => '' }).getAttribute('data-legacy-last-message-id'));
  R.rows = {
    view: location.hash.split('/')[0] || '(none)',
    visible: rows.length,
    withSubject: rows.filter((r) => r.querySelector('.bog')).length,
    withSnippet: rows.filter((r) => r.querySelector('.y2')).length,
    withLastMsgId: lastIds.filter(Boolean).length,
    withCheckbox: rows.filter((r) => r.querySelector('[role="checkbox"]')).length,
    withStar: rows.filter((r) => r.querySelector('.T-KT')).length,
    inPromoFeed: lastIds.filter((id) => feedIds.promotions && feedIds.promotions.has(id)).length,
    inUpdatesFeed: lastIds.filter((id) => feedIds.updates && feedIds.updates.has(id)).length,
  };
  R.inboxTabs = [...document.querySelectorAll('[role="tab"]')].filter((t) => t.getClientRects().length).map(name).slice(0, 8);
  R.tokens = { GM_ACTION_TOKEN: typeof window.GM_ACTION_TOKEN, ik: Array.isArray(window.GLOBALS) && /^[0-9a-f]{8,12}$/.test(String(window.GLOBALS[9])), atCookie: /GMAIL_AT=/.test(document.cookie) };

  // ---- 3. switching Gmail views from code (to read the Promotions / Updates tabs), then back
  const start = location.hash || '#inbox';
  R.nav = {};
  for (const h of ['#category/promotions', '#category/updates', start]) {
    status.textContent = 'Checking: opening ' + h + ' …';
    const before = new Set(visibleRows());
    const t = performance.now();
    location.hash = h;
    let now = [];
    for (let i = 0; i < 40; i++) { await sleep(100); now = visibleRows(); if (now.length && now.some((r) => !before.has(r))) break; }
    R.nav[h === start ? 'back:' + h : h] = { rows: now.length, newRows: now.filter((r) => !before.has(r)).length, unread: now.filter((r) => r.classList.contains('zE')).length, ms: Math.round(performance.now() - t) };
  }
  await sleep(300);

  // ---- 4. selecting a row from code, and the toolbar that appears (archive, delete, labels…), then unselect
  await safe('select', async () => {
    const row = visibleRows()[0];
    const cb = row && row.querySelector('[role="checkbox"]');
    if (!cb) return 'no checkbox found';
    press(cb);
    await sleep(500);
    const out = { checkedAfterClick: cb.getAttribute('aria-checked') };
    const bar = [...document.querySelectorAll('[gh="tm"] [role="button"], [gh="mtb"] [role="button"]')].filter((b) => b.getClientRects().length);
    out.toolbar = bar.map((b) => ({ act: b.getAttribute('act'), name: name(b) })).filter((b) => b.name).slice(0, 20);
    const lb = bar.find((b) => /label/i.test(name(b)));
    if (lb) {
      press(lb);
      await sleep(600);
      const menu = [...document.querySelectorAll('[role="menu"]')].find((m) => m.getClientRects().length);
      out.labelsMenu = menu ? { checkboxes: menu.querySelectorAll('[role="menuitemcheckbox"]').length, input: !!menu.querySelector('input'), items: menu.querySelectorAll('[role="menuitem"]').length } : 'did not open';
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
      (document.activeElement || document.body).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
      await sleep(300);
      out.labelsMenuClosed = ![...document.querySelectorAll('[role="menu"]')].some((m) => m.getClientRects().length);
    }
    press(cb);
    await sleep(400);
    out.checkedAfterSecondClick = cb.getAttribute('aria-checked');
    return out;
  });

  R.ms = Math.round(performance.now() - t0);

  // ---- results
  const pre = el('pre', null, '');
  const show = () => { pre.textContent = JSON.stringify(R, null, 1); console.log('[Inbox Arcade probe 2]', R); };
  show();
  status.textContent = `Done in ${R.ms} ms. Nothing in your mail was changed. Optional: run the star test, then copy the results.`;
  const row = el('div');
  const btn = (label, fn) => { const b = el('button', null, label); b.onclick = fn; row.appendChild(b); return b; };
  const star = btn('Star test (stars + un-stars 1st email)', async () => {
    star.disabled = true;
    await safe('starTest', async () => {
      const s = visibleRows()[0] && visibleRows()[0].querySelector('.T-KT');
      if (!s) return 'no star found';
      const state = () => ({ cls: s.className.split(/\s+/).filter((c) => c.startsWith('T-KT')).join(' '), aria: s.getAttribute('aria-label') });
      const out = { before: state() };
      press(s); await sleep(1200); out.afterFirst = state();
      press(s); await sleep(1200); out.afterSecond = state();
      return out;
    });
    show();
    star.textContent = 'Star test done';
  });
  const copy = btn('Copy results', async () => {
    try { await navigator.clipboard.writeText(pre.textContent); copy.textContent = 'Copied ✓'; }
    catch { const s = getSelection(), r = document.createRange(); r.selectNodeContents(pre); s.removeAllRanges(); s.addRange(r); copy.textContent = 'Selected: Ctrl+C'; }
  });
  btn('Close', () => host.remove());
  box.appendChild(pre);
  box.appendChild(row);
})();
