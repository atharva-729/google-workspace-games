# Inbox Arcade: design (v1)

**Question:** can a browser extension replace a big site's front end and keep its real data underneath, and can triage become a game?
**Answer v1 tries to give:** a working Gmail client in a Chrome tab, built on the official Gmail API, with an "Inbox Zero" game mode.

## Architecture
- **Chrome extension, Manifest V3, plain HTML/CSS/JS, no build step.**
- Clicking the toolbar button opens `app.html` in a full tab. That page is the whole client.
- **Two backends, one interface** (`connect`, `listThreads`, `getThread`, `modify`):
  - `gmail.js`: the official Gmail REST API. The token comes from `chrome.identity.launchWebAuthFlow` with a Web application OAuth client (any Chromium browser). Scope: `gmail.modify` (read, label, archive; it cannot delete permanently or send).
  - `demo.js`: ~18 sample threads held in memory, so the client can be shown with no Google setup.
- A fixed `key` in `manifest.json` keeps the extension ID stable, since the OAuth client is tied to that ID.
- Gmail API calls: `threads.list` (inbox, starred, or a search query), `threads.get` (metadata for the list, full for reading), `threads.modify` (archive = remove `INBOX`, star = `STARRED`, read/unread = `UNREAD`), and `labels.get INBOX` for the true inbox count.

## Screens
1. **Start:** "Connect Gmail" or "Try the demo". It remembers your choice.
2. **List:** a top bar (Inbox / Starred, search, Game mode toggle, account). Each row shows star, sender, subject + snippet and date, with archive and read buttons on hover. Unread rows are bold.
3. **Thread:** every message, with the HTML body inside a sandboxed iframe (no scripts run). Actions: archive, star, mark unread.
4. **Help overlay** (`?`) and an **undo toast** after each archive.

## Keyboard (all actions work without the mouse)
`j`/`k` move · `Enter`/`o` open · `Esc` back · `e` archive · `s` star · `u` toggle read · `z` undo · `/` search · `g` game mode · `?` help

## Inbox Zero game mode (`g`)
- **A HUD bar** shows score, combo multiplier with a draining timer, threads cleared, a clock, progress to inbox zero, and your best score.
- **Points:** archive 10, star 5, mark read 3, times the combo. The combo goes up while you keep acting within 4 seconds (max x8) and resets after a pause.
- **No farming:** each thread scores each kind of action only once per game, so toggling a star repeatedly earns nothing.
- **Pages:** clearing the 25 threads on screen gives a +50 "page cleared" bonus and loads the next batch. When the inbox is really empty, a win screen shows score, time and best combo, with confetti. The best score is saved.
- Archiving is safe: mail stays in All Mail, and `z` undoes.

## Out of scope for v1
Compose/reply (needs the `gmail.send` scope), the labels sidebar, attachments, pagination outside game mode, the undocumented-endpoint route, and a Discourse version.

## Known limits
- The Google app stays in **Testing**: the sign-in screen warns "unverified app", only listed test users can sign in, and the grant expires after 7 days.
- Remote images in emails load (as in most clients), which means senders' tracking pixels fire.
