// Demo backend: sample threads in memory. Same interface as GmailMail.
const DemoMail = (() => {
  const H = 3600e3;
  // [from, email, category, subject, body, hoursAgo, labels, replies [from, email, body, hoursAgo], unsubscribe?]
  const SEED = [
    ['Maya Fernandes', 'maya@example.com', 'personal', 'Saturday hike: still on?', 'Hey! Weather looks clear for Saturday. Meet at the trailhead at 7:30? I can bring snacks if you bring the good coffee.', 0.4, ['UNREAD']],
    ['ShopMart', 'deals@shopmart.example.com', 'promo', '⚡ 48-hour flash sale: 60% off headphones', '<h2>FLASH SALE</h2><p>Up to <b>60% off</b> headphones, speakers and more. Ends in 48 hours!</p><p><a href="#">Shop now</a></p>', 0.8, ['UNREAD'], [], true],
    ['Cloud Builds', 'noreply@builds.example.com', 'update', 'Build #4812 passed on main', '<p>✅ <b>main</b> built in 3m 12s.</p><p>42 tests passed, 0 failed.</p>', 1.1, ['UNREAD']],
    ['Arjun Mehta', 'arjun@example.com', 'personal', 'Can you review the onboarding doc by Friday?', 'Hi! I put together the onboarding doc for the beta. Could you give it a read and leave comments by Friday? Mainly want a sanity check on steps 3 and 4.', 1.6, ['UNREAD']],
    ['Riverside Library', 'notices@library.example.org', 'update', 'Your hold is ready for pickup', '<p>Good news! <i>The Left Hand of Darkness</i> is ready at the front desk.</p><p>Please collect it within 7 days.</p>', 2, ['UNREAD']],
    ['ShopMart', 'deals@shopmart.example.com', 'promo', 'You left something in your cart 👀', '<p>Your cart misses you. Complete your order and get free shipping today.</p>', 3, ['UNREAD'], [], true],
    ['SkyHop Airways', 'trips@skyhop.example.com', 'update', 'Your boarding pass: BLR → GOI', '<h2 style="margin:0">Flight SH 221</h2><p>Departs <b>06:45</b>, gate opens 06:05. Seat 14C.</p>', 5, ['UNREAD']],
    ['Leo Park', 'leo@example.com', 'personal', 'Board game night → Friday?', 'We finally have enough people for the big game. Friday 8pm at mine? Bring chips.', 6, ['UNREAD'], [['Sana Q', 'sana@example.com', 'I am in! Can I bring my cousin?', 5.5], ['Leo Park', 'leo@example.com', 'The more the merrier. You coming?', 5]]],
    ['The Weekly Byte', 'hello@weeklybyte.example.com', 'promo', 'Issue 87: tiny web apps that last', '<h1 style="font-family:Georgia">Tiny web apps that last</h1><p>This week: why boring tech wins, a 40-line static site generator, and three CSS tricks you will actually use.</p>', 8, ['UNREAD'], [], true],
    ['Grandma', 'nani@example.com', 'personal', 'Recipe you asked for', 'Here it is, beta. Two cups rice, soak for one hour. Do not skip the soaking! Will you call me on Sunday?', 12, ['UNREAD']],
    ['Bank Alerts', 'alerts@bank.example.com', 'update', 'Statement for November is ready', 'Your November statement is ready to view in the app. This is an automated message.', 20, ['UNREAD']],
    ['ShopMart', 'deals@shopmart.example.com', 'promo', 'New arrivals picked for you', '<p>Fresh drops in electronics, home and fitness. Members get early access.</p>', 22, ['UNREAD'], [], true],
    ['Code Hosting', 'notifications@code.example.com', 'update', '[inbox-arcade] New issue: dark mode flicker', '<p><b>@sample-user</b> opened an issue:</p><blockquote>When switching tabs the list flickers white for a frame.</blockquote>', 30, ['UNREAD']],
    ['Priya Nair', 'priya@example.com', 'personal', 'Quick question about the trip budget', 'Hey, are we splitting the villa 4 ways or 5? I need to tell the host by tonight. Also, did you book the train back?', 34, ['UNREAD']],
    ['Plant Shop', 'orders@plants.example.com', 'update', 'Your monstera has shipped 🌿', 'Tracking number: PL-99812. Expected delivery: Wednesday.', 40, ['UNREAD']],
    ['FitClub', 'offers@fitclub.example.com', 'promo', 'Come back! 3 months for the price of 1', '<p>We miss you at FitClub. Rejoin this week and get 3 months for the price of 1.</p>', 46, ['UNREAD'], [], true],
    ['Meetup', 'events@meetup.example.com', 'update', 'New event: Browser games night', '<p>Show what you built! Lightning demos, 5 minutes each. Pizza provided.</p>', 70, ['UNREAD'], [], true],
    ['The Weekly Byte', 'hello@weeklybyte.example.com', 'promo', 'Issue 86: the case for plain JavaScript', '<p>No build step, no problem. Plus: reader projects of the month.</p>', 7 * 24, ['UNREAD'], [], true],
    ['Old Friend', 'sam@example.com', 'personal', 'long time!!', 'Saw your games project online. That boss fight is brutal. Coffee when I am back in town next week?', 6 * 24, ['UNREAD', 'STARRED']],
    ['Utilities', 'billing@power.example.com', 'update', 'Your bill is due in 5 days', 'Amount due: ₹1,284. Pay in the app to avoid a late fee.', 4 * 24, ['UNREAD']],
    ['FitClub', 'offers@fitclub.example.com', 'promo', 'Last chance: your offer expires tonight', '<p>Final reminder: 3 months for the price of 1 ends at midnight.</p>', 5 * 24, ['UNREAD'], [], true],
    ['Nadia Rahman', 'nadia@example.com', 'personal', 'Photos from the wedding', 'Finally uploaded them all, 312 photos. You look great in about 4 of them 😄', 3 * 24, []],
    ['Coach Dev', 'dev@gym.example.com', 'personal', 'Week 3 plan', 'Mon: legs. Wed: push. Fri: pull. Sleep 8 hours, and yes, that is part of the plan.', 52, ['STARRED']],
    ['Newsletter', 'digest@news.example.com', 'promo', 'Your weekly digest', 'Top stories you may have missed this week.', 8 * 24, [], [], true],
  ];

  let db = [];
  function reset() {
    const now = Date.now();
    db = SEED.map(([from, email, category, subject, body, h, labels, replies = [], unsub], i) => ({
      id: 'demo' + i,
      subject, category,
      listUnsub: unsub ? 'https://' + email.split('@')[1] + '/unsubscribe' : '',
      labels: new Set(['INBOX', ...labels]),
      messages: [[from, email, body, h], ...replies]
        .map(([f, e, b, hh]) => ({
          from: f, fromEmail: e, fromRaw: f + ' <' + e + '>', to: 'me@example.com', date: now - hh * H,
          messageId: '<' + Math.random().toString(36).slice(2) + '@example.com>', references: '',
          html: /^\s*</.test(b) ? b : null, text: /^\s*</.test(b) ? null : b,
        }))
        .sort((a, b) => a.date - b.date),
    }));
  }
  reset();

  const strip = (s) => (s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  function summary(t) {
    const last = t.messages[t.messages.length - 1];
    return {
      id: t.id, from: last.from, fromEmail: last.fromEmail, subject: t.subject, category: t.category, listUnsub: t.listUnsub,
      snippet: strip(last.html || last.text).slice(0, 140), date: last.date, count: t.messages.length,
      unread: t.labels.has('UNREAD'), starred: t.labels.has('STARRED'), inInbox: t.labels.has('INBOX'),
    };
  }
  const tick = (v) => new Promise((res) => setTimeout(() => res(v), 120));
  const find = (id) => db.find((x) => x.id === id);

  return {
    live: false,
    reset,
    async connect() { return 'Demo mode · sample emails'; },
    async signOut() {},
    async listThreads({ view, q }) {
      let list = db.filter((t) => !t.labels.has('TRASH'));
      if (view === 'inbox') list = list.filter((t) => t.labels.has('INBOX'));
      else if (view === 'unread') list = list.filter((t) => t.labels.has('INBOX') && t.labels.has('UNREAD'));
      else if (view === 'starred') list = list.filter((t) => t.labels.has('STARRED'));
      else {
        const needle = (q || '').toLowerCase();
        list = list.filter((t) => (t.subject + ' ' + t.messages.map((m) => m.from + ' ' + m.fromEmail + ' ' + strip(m.html || m.text)).join(' ')).toLowerCase().includes(needle));
      }
      const threads = list.map(summary).sort((a, b) => b.date - a.date);
      return tick({ threads, total: threads.length, nextPageToken: null });
    },
    async getThread(id) {
      const t = find(id);
      return tick({ subject: t.subject, messages: t.messages.map((m) => ({ ...m })) });
    },
    async modify(id, add = [], remove = []) {
      const t = find(id);
      add.forEach((l) => t.labels.add(l));
      remove.forEach((l) => t.labels.delete(l));
      return tick({ id });
    },
    async trash(id) { find(id).labels.add('TRASH'); return tick({ id }); },
    async untrash(id) { find(id).labels.delete('TRASH'); return tick({ id }); },
    async send(r) {
      const t = find(r.threadId);
      if (t) t.messages.push({ from: 'You', fromEmail: 'me@example.com', fromRaw: 'me@example.com', to: r.to, date: Date.now(), text: r.body, messageId: '', references: '' });
      return tick({ id: 'sent' });
    },
  };
})();
