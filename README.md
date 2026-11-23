# Inbox Arcade

A new front end for Gmail as a Chrome extension, built on the official Gmail API, with a **Triage run** game: your unread mail as a deck of cards, where you reply, read, archive, delete or star each one and score points for decisions that fit the email. See [DESIGN.md](DESIGN.md).

## Try the demo (1 minute, no Google setup)
1. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and pick this folder.
2. Click the extension's toolbar icon (pin it from the puzzle-piece menu), then **Try the demo**.
3. Press `g` (or click **Triage run**). Each card needs a decision: `r` reply, `Space` read and keep, `e` archive, `d` delete, `s` star, `l` later, `Shift+D`/`Shift+E` to sweep everything from one sender, `z` to undo. `?` lists every shortcut.

Extension ID (fixed by the `key` in `manifest.json`): `dhldabamnapjmkegmaablegbdjlejigg`

## Connect your real Gmail (about 10 minutes, once)
Use a Chrome profile that is signed into the Google account you want to use. `getAuthToken` uses that profile's account.

1. Go to https://console.cloud.google.com and create a project (any name).
2. **APIs & Services → Library**: search for "Gmail API" and click **Enable**.
3. **Google Auth Platform** (also called "OAuth consent screen"):
   - **Branding**: app name "Inbox Arcade", plus your email as the support and developer contact.
   - **Audience**: User type **External**, publishing status **Testing**. Under **Test users**, add your own Gmail address.
   - **Data access**: add the scope `https://www.googleapis.com/auth/gmail.modify`.
4. **Clients → Create client**: application type **Chrome Extension**, Item ID `dhldabamnapjmkegmaablegbdjlejigg`. Copy the client ID.
5. In `manifest.json`, replace `PASTE_YOUR_CLIENT_ID.apps.googleusercontent.com` with that client ID.
6. In `chrome://extensions`, click the reload icon on Inbox Arcade. Open it and choose **Connect Gmail**.
7. Google warns "Google hasn't verified this app". Click **Continue**, since it's your own app. Then allow access.

Because the app stays in Testing, the grant expires after 7 days. When it does, click Connect again.

## Files
`manifest.json` · `background.js` (opens the tab) · `app.html/css/js` (mail client UI) · `triage.js` (the game) · `compose.js` (reply box and undo-send) · `gmail.js` (Gmail API backend) · `demo.js` (sample-data backend)

Test hook: open `app.html?demo&keys=gre` directly to replay keystrokes in demo mode.
