// The games as bookmarklets: the page side, shared by every game. build.js wraps this file, then the game's own
// file (../defense.js or ../breakout.js) and a small GAME adapter, in one function, so nothing leaks into Gmail's page. Gmail enforces Trusted Types, so HTML goes
// through our own policy, and the game lives in a shadow root.
// Reading: the rows Gmail draws for each inbox tab (no sign-in, no API calls).
// Applying: tick the rows' checkboxes and press Gmail's own toolbar buttons, one batch per tab and action.
if (document.getElementById('inbox-arcade')) return;
if (location.hostname !== 'mail.google.com' && !window.__iaAnyHost) { alert('Open Gmail (mail.google.com) first, then click this bookmark.'); return; }

let policy = null;
if (window.trustedTypes) {
  try { policy = trustedTypes.createPolicy('inbox-arcade', { createHTML: (s) => s }); }
  catch { policy = trustedTypes.createPolicy('inbox-arcade-' + Date.now(), { createHTML: (s) => s }); }
}
// Every string that reaches setHTML is a template whose mail data went through esc().
function setHTML(el, html) { el.innerHTML = policy ? policy.createHTML(html) : html; }
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem('inboxArcade.' + k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('inboxArcade.' + k, JSON.stringify(v)); } catch {} },
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- overlay
const host = document.createElement('div');
host.id = 'inbox-arcade';
host.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:#11131a';
const root = host.attachShadow({ mode: 'open' });
const wrap = document.createElement('div');
wrap.className = 'ia-root';
setHTML(wrap, '<i class="ia-check"></i><div id="main" class="hidden"></div><section id="defense"></section><section id="breakout"></section>');
root.appendChild(wrap);
document.body.appendChild(host);
const $ = (s) => root.querySelector(s);

// Styles: a constructed stylesheet first; if Gmail's rules stop it, a <style> carrying the page's own nonce.
(() => {
  const ok = () => getComputedStyle($('.ia-check')).getPropertyValue('--ia-ok').trim() === '1';
  try { const sheet = new CSSStyleSheet(); sheet.replaceSync(IA_CSS); root.adoptedStyleSheets = [sheet]; } catch {}
  if (!ok()) {
    const st = document.createElement('style');
    const n = document.querySelector('style[nonce], script[nonce]');
    if (n && n.nonce) st.nonce = n.nonce;
    st.textContent = IA_CSS;
    root.appendChild(st);
  }
  console.info('[Inbox Arcade] styles:', ok() ? 'ok' : 'blocked');
})();

function closeArcade() {
  GAME.stop();
  ['keydown', 'keyup', 'keypress'].forEach((t) => window.removeEventListener(t, onKey, true));
  host.remove();
}

// While the game is open, keys belong to it: Gmail's own shortcuts (s = star, f = forward, …) must not fire.
function onKey(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  e.stopImmediatePropagation();
  if (e.type === 'keypress') return;
  const down = e.type === 'keydown';
  if (GAME.key(e, down)) e.preventDefault();
  else if (down && (e.key === 'Escape' || e.key.toLowerCase() === 'q') && !applying) closeArcade();
}
['keydown', 'keyup', 'keypress'].forEach((t) => window.addEventListener(t, onKey, true));

// ---- what the games expect from the extension's app (the other game's state comes with GAME)
const T = { active: false };
function closeThread() {}
function loadList() { closeArcade(); } // "back to mail" = close the overlay
function confetti() {}

// ---- Gmail's page
const visibleRows = () => [...document.querySelectorAll('tr.zA')].filter((r) => r.getClientRects().length);
const threadId = (row) => { const x = row.querySelector('[data-legacy-thread-id]'); return x ? x.getAttribute('data-legacy-thread-id') : ''; };
const shown = (el) => el && el.getClientRects().length > 0;
function press(el) {
  const b = el.getBoundingClientRect();
  const o = { bubbles: true, cancelable: true, view: window, button: 0, clientX: b.left + b.width / 2, clientY: b.top + b.height / 2 };
  for (const t of ['mouseover', 'mousedown', 'mouseup', 'click']) el.dispatchEvent(new MouseEvent(t, o));
}

// Open a Gmail view (e.g. #category/promotions) and wait until its rows are drawn. False if they never came:
// then the rows on screen still belong to the previous view, and must not be read as this one.
async function go(hash) {
  if (location.hash === hash && visibleRows().length) return true;
  const before = new Set(visibleRows());
  location.hash = hash;
  for (let i = 0; i < 30; i++) {
    await sleep(100);
    const now = visibleRows();
    if (now.length && now.some((r) => !before.has(r))) { await sleep(150); return true; }
  }
  return false;
}

// ---- who is a person?
// Checked in this order, first match wins:
// 1. Meeting notes from Gemini are 'notes': never deleted or archived, whatever tab Gmail put them in.
// 2. Gmail's inbox tab (Promotions, Social, Updates), when tabs are on.
// 3. Team and role senders are updates, even from your own company: HR, IT, announcements, communications,
//    helpdesks, payroll, HR/IT tools (Darwinbox, Workday, ServiceNow, …), noreply and the like. Found by words
//    in the address or the display name.
// 4. People: someone you have written to, or a thread you're part of.
// 5. Probably people: a personal mailbox (gmail.com, outlook.com, …), or a colleague on your own domain whose
//    display name looks like a person's name. (Calling a team a person costs little; the other way round can
//    lose a real person's email, so when unsure it's a person.)
// Everything else is an update.
const ME = ((document.title.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/) || [''])[0]).toLowerCase();
const MY_DOMAIN = ME.split('@')[1] || '';
const PERSONAL = /^(gmail|googlemail|outlook|hotmail|live|msn|yahoo|ymail|icloud|me|mac|aol|proton|protonmail|pm|rediffmail|zoho|yandex|gmx|mail|fastmail|hey)\.[a-z.]+$/i;
const AUTOMATED = /^(no[-_.]?reply|do[-_.]?not[-_.]?reply|notifications?|notify|alerts?|news(letters?)?|info|hello|hi|team|support|help|updates?|accounts?|security|billing|mailer|e?mail|marketing|offers?|deals?|promo(tions)?|sales?|shop|store|orders?|receipts?|service|contact|admin|bounces?|digest|feedback|community|events?|jobs|careers|social|invite|members?|reply|messages?|verify|welcome)([-_.+\d]|$)/i;
const BULK_DOMAIN = /^(e|em|email|mail|mailer|news|info|mkt|marketing|notify|notifications?|bounce|reply|send|comms)\d*\./i;
const PROMO_HINT = /^(news(letters?)?|marketing|offers?|deals?|promo(tions)?|sales?|shop|store)([-_.+\d]|$)/i;

async function sentTo() {
  const c = store.get('sentTo');
  if (c && Date.now() - c.at < 24 * 3600e3) return new Set(c.list);
  if (!(await go('#sent'))) return new Set();
  const list = [...new Set(visibleRows().flatMap((r) => [...r.querySelectorAll('span[email]')].map((s) => s.getAttribute('email').toLowerCase())))].filter((e) => e !== ME);
  store.set('sentTo', { at: Date.now(), list });
  return new Set(list);
}

const isNotes = (t) => /^gemini-notes@/i.test(t.fromEmail) || (/\bgemini\b/i.test(t.from) && /\bnotes?\b/i.test(t.from + ' ' + t.subject));
// one whole piece of the address, split at . _ - + (so "it.announcements@" and "hr@" match, "smith@" doesn't)
const ROLE_TOKEN = /^(hr|it|itsupport|ithelp|ithelpdesk|helpdesk|servicedesk|support|announce|announcements?|communications?|comms|corpcomms?|internalcomms|newsletters?|payroll|benefits|facilities|admin|administration|all|allstaff|everyone|staff|people|peopleops|talent|recruitment|recruiting|careers|training|learning|compliance|legal|finance|accounts|security|events?|operations|office|team|portal|notifications?|alerts?|digest|updates?|calendar|noreply|donotreply)$/i;
const ROLE_NAME = /\b(human resources|announcements?|communications?|comms|help ?desk|service ?desk|support|payroll|benefits|facilities|administration|newsletters?|notifications?|team|office of|operations|recruitment|talent acquisition|learning|training|compliance|no-?reply|digest|portal)\b/i;
const ROLE_ACRONYM = /(^|[^A-Za-z])(IT|HR|L&D)([^A-Za-z]|$)/; // capitals only
const TOOLS = /\b(darwinbox|workday|myworkday|successfactors|sapsf|servicenow|service-now|keka|greythr|bamboohr|freshservice|freshdesk|zendesk|atlassian|docusign)\b/i;
const isRole = (t, local, domain) => local.split(/[-_.+]/).some((w) => ROLE_TOKEN.test(w)) ||
  ROLE_NAME.test(t.from) || ROLE_ACRONYM.test(t.from) || TOOLS.test(t.from) || TOOLS.test(domain);
const looksLikeName = (s) => /^[\p{L}][\p{L}'’.-]*(\s+[\p{L}][\p{L}'’.-]*){1,3}$/u.test((s || '').trim());

function kindOf(t, people) {
  if (isNotes(t)) return 'notes';
  if (t.category) return t.category;
  const e = t.fromEmail.toLowerCase(), [local = '', domain = ''] = e.split('@');
  if (isRole(t, local, domain) || AUTOMATED.test(local) || BULK_DOMAIN.test(domain)) return PROMO_HINT.test(local) ? 'promo' : 'update';
  if (people.has(e) || t.withMe) return 'person';
  const colleague = MY_DOMAIN && domain === MY_DOMAIN && !PERSONAL.test(MY_DOMAIN) && looksLikeName(t.from);
  if (PERSONAL.test(domain) || colleague) return 'person';
  return 'update';
}

function readRows(view, category) {
  return visibleRows().map((row) => {
    const idEl = row.querySelector('[data-legacy-thread-id]');
    const fromEl = row.querySelector('span[email]');
    const t = {
      id: threadId(row), view, category,
      from: fromEl ? fromEl.getAttribute('name') || fromEl.textContent : '?',
      fromEmail: fromEl ? fromEl.getAttribute('email') || '' : '',
      subject: ((row.querySelector('.bog') || idEl || {}).textContent || '').trim(),
      snippet: ((row.querySelector('.y2') || {}).textContent || '').replace(/^\s*-\s*/, '').trim(),
      unread: row.classList.contains('zE'),
      withMe: !!ME && [...row.querySelectorAll('span[email]')].some((s) => s.getAttribute('email').toLowerCase() === ME),
    };
    return t;
  });
}

// Mail: the list you have open, plus the Promotions, Social and Updates tabs when you're on the inbox.
const START = location.hash || '#inbox';
async function fetchBricks() {
  const say = (s) => { const x = $('.t-loading'); if (x) x.textContent = s; };
  if (!visibleRows().length) throw new Error('No email list on screen. Open your inbox (or a tab, label or search) in Gmail, then click the bookmark again.');
  const tabs = /^#inbox$/.test(START) && [...document.querySelectorAll('[role="tab"]')].some(shown);
  say('Checking who you write to…');
  const people = await sentTo();
  const out = [];
  if (tabs) {
    for (const [hash, cat, label] of [['#category/promotions', 'promo', 'Promotions'], ['#category/social', 'update', 'Social'], ['#category/updates', 'update', 'Updates']]) {
      say(`Reading ${label}…`);
      if (await go(hash)) out.push(...readRows(hash, cat));
    }
  }
  if (!(await go(START))) throw new Error('Gmail did not switch back to your list. Close this and click the bookmark again.');
  const startCat = /category\/promotions/.test(START) ? 'promo' : /category\/(social|updates|forums)/.test(START) ? 'update' : null;
  out.push(...readRows(START, startCat));
  const seen = new Set();
return out.filter((t) => t.id && !seen.has(t.id) && seen.add(t.id)).map((t) => ({ ...t, kind: kindOf(t, people) }));
}

// ---- applying results with Gmail's own buttons
let applying = false;
const toolbarButton = (act) => [...document.querySelectorAll(`[gh="tm"] [act="${act}"]`)].find(shown);
const checkbox = (row) => row.querySelector('[role="checkbox"]');
const checked = (row) => { const c = checkbox(row); return c && c.getAttribute('aria-checked') === 'true'; };
async function clearSelection() { for (const r of visibleRows()) if (checked(r)) press(checkbox(r)); await sleep(150); }

async function starSelected() {
  const more = [...document.querySelectorAll('[gh="tm"] [role="button"]')].find((b) => shown(b) && /more/i.test(b.getAttribute('aria-label') || b.getAttribute('data-tooltip') || ''));
  if (!more) return false;
  press(more);
  await sleep(400);
  const item = [...document.querySelectorAll('[role="menuitem"]')].find((m) => shown(m) && /^add star$/i.test(m.textContent.trim()));
  if (!item) { press(more); return false; }
  press(item);
  return true;
}

const PageMail = {
  live: true,
  backLabel: 'Back to Gmail',
  async applyAll(jobs, say) {
    applying = true;
    const ACT = { delete: '10', archive: '7', keep: '1' }; // keep = Mark as read
    const VERB = { delete: 'Moving to Trash', archive: 'Archiving', keep: 'Marking read', reply: 'Starring' };
    let failed = 0, starFailed = 0;
    const views = [...new Set(jobs.map(([t]) => t.view))];
    try {
      for (const view of views) {
        if (!(await go(view))) { failed += jobs.filter(([t]) => t.view === view).length; continue; }
        for (const op of ['delete', 'archive', 'reply', 'keep']) {
          const want = new Set(jobs.filter(([t, o]) => t.view === view && o === op).map(([t]) => t.id));
          if (!want.size) continue;
          await clearSelection();
          let rows = visibleRows().filter((r) => want.has(threadId(r)));
          if (op === 'keep') rows = rows.filter((r) => r.classList.contains('zE')); // already read: nothing to do
          failed += op === 'keep' ? 0 : want.size - rows.length; // gone from this view since you played
          if (!rows.length) continue;
          say(`${VERB[op]} ${rows.length}…`);
          rows.forEach((r) => press(checkbox(r)));
          await sleep(250);
          // safety: exactly our rows are ticked, or we press nothing
          const ticked = visibleRows().filter(checked);
          if (ticked.length !== rows.length || !ticked.every((r) => want.has(threadId(r)))) { failed += rows.length; await clearSelection(); continue; }
          if (op === 'reply') {
            if (!(await starSelected())) starFailed += rows.length;
          } else {
            const btn = toolbarButton(ACT[op]);
            if (!btn || /spam/i.test(btn.getAttribute('aria-label') || btn.getAttribute('data-tooltip') || '')) { failed += rows.length; await clearSelection(); continue; }
            press(btn);
          }
          for (let i = 0; i < 25 && rows.some((r) => r.isConnected && shown(r) && checked(r)); i++) await sleep(120);
          await sleep(300);
        }
      }
      await clearSelection();
    } finally {
      await go(START);
      applying = false;
    }
    return {
      failed: failed + starFailed,
      note: (starFailed ? `${starFailed} people's emails could not be starred, so they stay in your inbox as they were. ` : '') +
        'Gmail kept everything: Trash empties itself after 30 days, and archived mail is in All Mail.',
    };
  },
};
const S = { backend: PageMail };
