// Demo backend: sample threads in memory. Same interface as GmailMail.
const DemoMail = (() => {
  const H = 3600e3, D = 24 * H;
  // [from, email, subject, body, hoursAgo, labels, extra replies [from, email, body, hoursAgo]]
  const SEED = [
    ['Maya Fernandes', 'maya@example.com', 'Saturday hike: still on?', 'Hey! Weather looks clear for Saturday. Meet at the trailhead at 7:30? I will bring snacks if you bring the good coffee.', 0.4, ['UNREAD'], [['You', 'me@example.com', 'Yes! 7:30 works. Coffee is on me.', 0.3], ['Maya Fernandes', 'maya@example.com', 'Perfect. See you there 🥾', 0.2]]],
    ['Cloud Builds', 'noreply@builds.example.com', 'Build #4812 passed on main', '<p>✅ <b>main</b> built in 3m 12s.</p><p>42 tests passed, 0 failed.</p>', 1.1, ['UNREAD']],
    ['Riverside Library', 'notices@library.example.org', 'Your hold is ready for pickup', '<p>Good news! <i>The Left Hand of Darkness</i> is ready at the front desk.</p><p>Please collect it within 7 days.</p>', 2, ['UNREAD']],
    ['Arjun Mehta', 'arjun@example.com', 'Notes from Thursday', 'Attached my notes. The short version: we ship the beta on the 4th, and I owe you a review of the onboarding flow.', 3.5, []],
    ['SkyHop Airways', 'trips@skyhop.example.com', 'Your boarding pass: BLR → GOI', '<h2 style="margin:0">Flight SH 221</h2><p>Departs <b>06:45</b>, gate opens 06:05. Seat 14C.</p><p style="color:#888">Have a lovely trip!</p>', 5, ['UNREAD', 'STARRED']],
    ['The Weekly Byte', 'hello@weeklybyte.example.com', 'Issue 87: tiny web apps that last', '<h1 style="font-family:Georgia">Tiny web apps that last</h1><p>This week: why boring tech wins, a 40-line static site generator, and three CSS tricks you will actually use.</p><p><a href="https://example.com">Read online</a></p>', 8, []],
    ['Grandma', 'nani@example.com', 'Recipe you asked for', 'Here it is, beta. Two cups rice, soak for one hour. Do not skip the soaking! Call me on Sunday.', 12, ['UNREAD', 'STARRED']],
    ['Bank Alerts', 'alerts@bank.example.com', 'Statement for November is ready', 'Your November statement is ready to view in the app. This is an automated message.', 20, []],
    ['Leo Park', 'leo@example.com', 'Board game night → Friday?', 'We finally have enough people for the big game. Friday 8pm at mine? Bring chips.', 26, ['UNREAD'], [['Sana Q', 'sana@example.com', 'I am in! Can I bring my cousin?', 25], ['Leo Park', 'leo@example.com', 'The more the merrier.', 24]]],
    ['Code Hosting', 'notifications@code.example.com', '[inbox-arcade] New issue: dark mode flicker', '<p><b>@sample-user</b> opened an issue:</p><blockquote>When switching tabs the list flickers white for a frame.</blockquote>', 30, ['UNREAD']],
    ['Plant Shop', 'orders@plants.example.com', 'Your monstera has shipped 🌿', 'Tracking number: PL-99812. Expected delivery: Wednesday.', 40, []],
    ['Coach Dev', 'dev@gym.example.com', 'Week 3 plan', 'Mon: legs. Wed: push. Fri: pull. Sleep 8 hours, and yes, that is part of the plan.', 52, ['STARRED']],
    ['Meetup', 'events@meetup.example.com', 'New event: Browser games night', '<p>Show what you built! Lightning demos, 5 minutes each. Pizza provided.</p>', 70, ['UNREAD']],
    ['Nadia Rahman', 'nadia@example.com', 'Photos from the wedding', 'Finally uploaded them all, 312 photos. You look great in about 4 of them 😄', 3 * 24, []],
    ['Utilities', 'billing@power.example.com', 'Your bill is due in 5 days', 'Amount due: ₹1,284. Pay in the app to avoid a late fee.', 4 * 24, ['UNREAD']],
    ['Course Platform', 'learn@course.example.com', 'You are 80% through "Intro to Shaders"', 'Two lessons left. Keep the streak going!', 5 * 24, []],
    ['Old Friend', 'sam@example.com', 'long time!!', 'Saw your games project online. That boss fight is brutal. Coffee when I am back in town?', 6 * 24, ['UNREAD', 'STARRED']],
    ['Newsletter', 'digest@news.example.com', 'Your weekly digest', 'Top stories you may have missed this week.', 8 * 24, []],
  ];

  let db = [];
  function reset() {
    const now = Date.now();
    db = SEED.map(([from, email, subject, body, h, labels, replies = []], i) => ({
      id: 'demo' + i,
      subject,
      labels: new Set(['INBOX', ...labels]),
      messages: [[from, email, body, h], ...replies.map(([f, e, b, rh]) => [f, e, b, rh])]
        .map(([f, e, b, hh]) => ({ from: f, fromEmail: e, to: 'me@example.com', date: now - (hh < 1 ? hh * H : hh * H), html: /^\s*</.test(b) ? b : null, text: /^\s*</.test(b) ? null : b })),
    }));
    // the first message in a thread is the oldest
    db.forEach((t) => t.messages.sort((a, b) => a.date - b.date));
  }
  reset();

  const strip = (s) => (s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  function summary(t) {
    const last = t.messages[t.messages.length - 1];
    return {
      id: t.id, from: last.from, fromEmail: last.fromEmail, subject: t.subject,
      snippet: strip(last.html || last.text).slice(0, 140), date: last.date, count: t.messages.length,
      unread: t.labels.has('UNREAD'), starred: t.labels.has('STARRED'), inInbox: t.labels.has('INBOX'),
    };
  }
  const tick = (v) => new Promise((res) => setTimeout(() => res(v), 120));

  return {
    live: false,
    reset,
    async connect() { return 'Demo mode · sample emails'; },
    async signOut() {},
    async listThreads({ view, q }) {
      let list = db;
      if (view === 'inbox') list = db.filter((t) => t.labels.has('INBOX'));
      else if (view === 'starred') list = db.filter((t) => t.labels.has('STARRED'));
      else {
        const needle = (q || '').toLowerCase();
        list = db.filter((t) => (t.subject + ' ' + t.messages.map((m) => m.from + ' ' + m.fromEmail + ' ' + strip(m.html || m.text)).join(' ')).toLowerCase().includes(needle));
      }
      const threads = list.map(summary).sort((a, b) => b.date - a.date);
      return tick({ threads, total: threads.length, nextPageToken: null });
    },
    async getThread(id) {
      const t = db.find((x) => x.id === id);
      return tick({ subject: t.subject, messages: t.messages.map((m) => ({ ...m })) });
    },
    async modify(id, add = [], remove = []) {
      const t = db.find((x) => x.id === id);
      add.forEach((l) => t.labels.add(l));
      remove.forEach((l) => t.labels.delete(l));
      return tick({ id });
    },
  };
})();
