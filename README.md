# Google Workspace Games

Clear your Gmail by playing a game. The games run as **bookmarklets**: you drag a button to your bookmarks bar, open Gmail and click it. There's nothing to install and no sign-in.

**Play: https://atharva-729.github.io/google-workspace-games/**

| Game | What you do |
|---|---|
| 🛡️ **Mail Defense** | Your emails fall toward your inbox. Shoot each one before it lands: `H` reply, `J` delete, `K` archive, `L` keep. Move with `A`/`D`, finish with `Q`. Pick a pace (Relaxed, Normal, Fast): the emails speed up until its top speed, and you get one shot a second. Waves end with a boss, your noisiest sender, which hovers over you and shoots back. Each pace keeps two bests: points, and emails cleared. |
| 🧱 Promo Breakout | Next: your inbox as a brick wall. It already runs in the extension below. |

## How the bookmarklet works
- **Reading:** it reads the email rows Gmail has already drawn, switching through your inbox tabs (Promotions, Social, Updates, then back to your list). There are no API calls and no server.
- **People vs. the rest:** a sender counts as a person if:
  - you've written to them (read from your Sent list and kept in your browser for a day);
  - or they're in a thread you're part of;
  - or they use a personal mailbox (gmail.com, outlook.com, …) and aren't an automated address.

  Gmail's own tabs decide promotions and updates. Any other company counts as an update.
- **Applying:** nothing changes until you review the results and press **Apply changes**. The game then ticks those rows and presses Gmail's own Delete, Archive, Mark as read or Add star, one batch per tab. Before pressing anything, it checks that exactly those rows are ticked.
- **Inside Gmail's page:** Gmail enforces Trusted Types, so the game routes its HTML through its own policy and draws inside a shadow root.

Build after editing a game: `node bookmarklet/build.js`. This writes `docs/index.html`, the page the bookmarklets are dragged from.

## The Inbox Arcade extension
The games started in a Chrome extension. It's a full Gmail front end built on the official Gmail API, with three games: **Triage run** (each unread email is a card to decide), **Promo Breakout** and **Mail Defense**. See [DESIGN.md](DESIGN.md).

### Try the demo (1 minute, no Google setup)
1. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and pick this folder.
2. Click the extension's toolbar icon (pin it from the puzzle-piece menu), then **Try the demo**.
3. Press `g` for a Triage run, `b` for Breakout, `m` for Defense. `?` lists every shortcut.

Extension ID (fixed by the `key` in `manifest.json`): `dhldabamnapjmkegmaablegbdjlejigg`

### Connect your real Gmail (about 10 minutes, once)
1. Go to https://console.cloud.google.com and create a project (any name).
2. **APIs & Services → Library**: search for "Gmail API" and click **Enable**.
3. **Google Auth Platform** (also called "OAuth consent screen"):
   - **Branding**: app name "Inbox Arcade", plus your email as the support and developer contact.
   - **Audience**: User type **External**, publishing status **Testing**. Under **Test users**, add your own Gmail address.
   - **Data access**: add the scope `https://www.googleapis.com/auth/gmail.modify`.
4. **Clients → Create client**: application type **Web application**, with the authorised redirect URI `https://dhldabamnapjmkegmaablegbdjlejigg.chromiumapp.org/`. Copy the client ID.
5. Put that client ID in `config.js`.
6. In `chrome://extensions`, click the reload icon on Inbox Arcade. Open it and choose **Connect Gmail**.
7. Google warns "Google hasn't verified this app". Click **Continue**, since it's your own app. Then allow access.

Because the app stays in Testing, the grant expires after 7 days. When it does, click Connect again.

The extension paces its API calls and retries with backoff when Gmail asks it to slow down, so it stays under Gmail's per-user rate limit.

### Files
`manifest.json` · `background.js` (opens the tab) · `app.html/css/js` (mail client UI) · `triage.js`, `breakout.js`, `defense.js` (the games) · `compose.js` (reply box and undo-send) · `gmail.js` (Gmail API backend) · `demo.js` (sample-data backend) · `bookmarklet/` (Gmail-page wrapper and build) · `docs/` (the GitHub Pages site)

Test hook: open `app.html?demo&keys=gre` directly to replay keystrokes in demo mode.

---
A personal project. Not affiliated with or endorsed by Google. Gmail and Google Workspace are trademarks of Google LLC.
