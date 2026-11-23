// Turns each bookmarklet into a javascript: link and writes docs/index.html, the GitHub Pages site you drag them from.
// Games reuse the extension's own game file: a page-side wrapper + ../defense.js + the extension's CSS,
// bundled into one function. Run: node bookmarklet/build.js
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');

// Light minify: drop full-line comments and indentation. Keeps the bookmark small; no tools needed.
const squeeze = (js) => js.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('//')).join('\n');

// The extension's stylesheet, adapted to a shadow root, plus overlay rules.
const gameCss = () => read('../app.css').replace(/:root/g, ':host') + `
.ia-root { position: absolute; inset: 0; overflow: auto; background: var(--bg); color: var(--text); font: 14px/1.45 "Segoe UI", system-ui, sans-serif; padding-top: 12px; }
.ia-check { --ia-ok: 1; position: absolute; }
.bk-hud { top: 0; }`;

const BOOKMARKLETS = [
  {
    name: '🛡️ Mail Defense', id: 'defense',
    image: 'defense.png', alt: 'Mail Defense: emails fall toward your inbox while you shoot them from the bottom',
    what: 'Your emails fall toward your inbox. Shoot each one with the right decision before it lands. Waves end with a boss: your noisiest sender. It reads your inbox tabs first, which takes a few seconds.',
    controls: [['<kbd>A</kbd> <kbd>D</kbd>', 'move (or the arrow keys)'], ['<kbd>H</kbd>', 'reply: stars it so you reply later'], ['<kbd>J</kbd>', 'delete'], ['<kbd>K</kbd>', 'archive'], ['<kbd>L</kbd>', 'keep: stays in the inbox, marked read'], ['<kbd>Q</kbd> / <kbd>Esc</kbd>', 'finish and review'], ['<kbd>P</kbd>', 'pause']],
    code: () => `(() => {\nconst IA_CSS = ${JSON.stringify(gameCss())};\n${read('defense-page.js')}\n${read('../defense.js')}\n` +
      `if (window.__iaAnyHost) window.__iaTest = { DF, dfUpdate, dfAuto, dfDraw, endDefense };\nstartDefense();\n})();`,
  },
];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const items = BOOKMARKLETS.map((b) => {
  const code = squeeze(b.code());
  fs.writeFileSync(path.join(__dirname, 'dist', b.id + '.js'), code); // for tests
  const href = 'javascript:' + encodeURIComponent(code + '\nvoid 0;');
  return { ...b, href, kb: (href.length / 1024).toFixed(0) };
});

const REPO = 'https://github.com/atharva-729/google-workspace-games';
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Google Workspace Games</title>
<meta name="description" content="Clear your Gmail by playing a game. Drag a button to your bookmarks bar, open Gmail, click it. No install, no sign-in.">
<style>
  :root { --bg: #f6f6fb; --fg: #1a1b2e; --dim: #5d6078; --card: #ffffff; --line: #e3e5f0; --accent: #5b5bf0; --hi: #fff1c2; --hi-fg: #5a4300; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #0f1020; --fg: #eceefa; --dim: #a0a3c0; --card: #1a1c33; --line: #2b2e4a; --accent: #9a9aff; --hi: #3a3214; --hi-fg: #ffe08a; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.6 system-ui, "Segoe UI", sans-serif; }
  main { max-width: 760px; margin: 0 auto; padding: 40px 16px 64px; overflow-wrap: anywhere; }
  h1 { font-size: 28px; line-height: 1.25; margin: 0 0 8px; }
  h2 { font-size: 19px; margin: 40px 0 10px; }
  p, li { color: var(--dim); }
  .lead { font-size: 17px; color: var(--fg); margin: 0 0 20px; }
  mark { background: var(--hi); color: var(--hi-fg); padding: 0 4px; border-radius: 4px; }
  .game { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 18px; margin: 20px 0; }
  .game img { width: 100%; height: auto; aspect-ratio: 1100 / 590; object-fit: cover; object-position: top; border-radius: 10px; display: block; margin-bottom: 14px; }
  .drag { display: inline-block; padding: 10px 20px; border-radius: 999px; background: var(--accent); color: #fff; font-weight: 650; text-decoration: none; cursor: grab; }
  .drag:active { cursor: grabbing; }
  .size { margin-left: 10px; color: var(--dim); font-size: 14px; }
  .steps { padding-left: 20px; }
  .steps li { margin: 4px 0; }
  table { border-collapse: collapse; width: 100%; font-size: 15px; }
  td { padding: 6px 8px; border-top: 1px solid var(--line); color: var(--dim); }
  td:first-child { width: 120px; white-space: nowrap; }
  kbd { display: inline-block; min-width: 22px; padding: 1px 6px; border: 1px solid var(--line); border-bottom-width: 2px; border-radius: 5px; background: var(--bg); color: var(--fg); font: 600 13px ui-monospace, Consolas, monospace; text-align: center; }
  .soon { color: var(--dim); font-size: 15px; }
  footer { margin-top: 48px; font-size: 14px; color: var(--dim); }
  a { color: var(--accent); }
</style></head>
<body><main>
<h1>Google Workspace Games</h1>
<p class="lead">Clear your Gmail by playing a game. <mark>No install, no sign-in:</mark> drag a button to your bookmarks bar, open Gmail, and click it.</p>
<ol class="steps">
  <li>Show your bookmarks bar: <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>B</kbd> (<kbd>⌘</kbd> + <kbd>Shift</kbd> + <kbd>B</kbd> on a Mac).</li>
  <li>Drag a game button below onto the bar.</li>
  <li>Open your Gmail inbox and click the bookmark.</li>
</ol>

${items.map((b) => `<section class="game">
  ${b.image ? `<img src="${b.image}" alt="${esc(b.alt)}" width="1100" height="590">` : ''}
  <a class="drag" href="${esc(b.href)}" onclick="alert('Drag this button onto your bookmarks bar, then click it while Gmail is open.');return false">${b.name}</a><span class="size">${b.kb} KB</span>
  <p>${b.what}</p>
  ${b.controls ? `<table>${b.controls.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>` : ''}
</section>`).join('\n')}
<p class="soon">Next: Promo Breakout, where your inbox is a brick wall.</p>

<h2>Is it safe?</h2>
<ul>
  <li><mark>Nothing changes until you press Apply.</mark> At the end you see every decision, grouped, and can untick any group.</li>
  <li>Apply uses Gmail's own buttons (Delete, Archive, Mark as read, Add star) on exactly the emails you chose. Deleted mail stays in Trash for 30 days, and archived mail stays in All Mail.</li>
  <li>The game runs only in your Gmail tab. It reads the emails Gmail has already shown you. It has no server and sends your mail nowhere. Your best score and a list of people you write to (used to tell people from companies) are kept in your own browser.</li>
  <li>The code is open: <a href="${REPO}">${REPO.replace('https://', '')}</a>.</li>
</ul>

<h2>Good to know</h2>
<ul>
  <li><b>Updating a game:</b> delete the old bookmark and drag the new one.</li>
  <li>It works in Chrome, Edge and other Chromium browsers, on Gmail in English with inbox tabs (Primary, Promotions, Social, Updates) on or off.</li>
  <li>It needs a list of emails on screen. If you're reading an email, go back to the inbox first.</li>
</ul>

<footer>A personal project. Not affiliated with or endorsed by Google. Gmail and Google Workspace are trademarks of Google LLC.</footer>
</main></body></html>
`;
fs.mkdirSync(path.join(__dirname, '..', 'docs'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '..', 'docs', 'index.html'), html);
items.forEach((b) => console.log(`${b.id}: ${b.kb} KB`));
