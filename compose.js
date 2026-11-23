// Reply composer shared by the mail view and the triage game, plus a 5-second undo-send queue.
const NOREPLY = /(no[-_.]?reply|do[-_.]?not[-_.]?reply|notifications?@|alerts?@|mailer-daemon|^digest@|^offers@|^deals@)/i;

const Compose = {
  // Pick the message to answer (the latest one not sent by me) and build the reply headers.
  target(full, myEmail) {
    const msgs = full.messages;
    const m = [...msgs].reverse().find((x) => x.fromEmail && x.fromEmail.toLowerCase() !== (myEmail || '').toLowerCase()) || msgs[msgs.length - 1];
    const subj = full.subject || '';
    return {
      to: m.replyTo || m.fromRaw || m.fromEmail,
      toName: m.from,
      toEmail: m.fromEmail,
      subject: /^re:/i.test(subj) ? subj : 'Re: ' + subj,
      inReplyTo: m.messageId,
      references: m.references,
      noReply: NOREPLY.test(m.fromEmail || ''),
      quoted: m.text || (m.html || '').replace(/<[^>]+>/g, ' '),
    };
  },

  // Quick replies that fit the message: questions get yes/no, everything gets thanks / will-reply.
  quick(text) {
    const t = (text || '').toLowerCase();
    const out = [];
    if (/\?/.test(t)) out.push('Yes, that works for me!', 'Sorry, I can’t make it this time.');
    if (/\b(review|take a look|have a look|check|comments?|feedback|by (monday|tuesday|wednesday|thursday|friday))\b/.test(t)) out.push('On it, I’ll send comments by tomorrow.');
    if (/meet|coffee|call|hike|night|dinner|lunch|friday|saturday|sunday|weekend/.test(t)) out.push('Count me in! See you there.');
    out.push('Thanks so much!', 'Got it, I’ll get back to you soon.');
    return [...new Set(out)].slice(0, 5);
  },

  // Render a composer into el. opts: { initial, onSend(text), onCancel() }
  mount(el, tgt, opts) {
    el.innerHTML = `<div class="composer">
      <div class="c-to">Reply to <b>${esc(tgt.toName)}</b> <span>&lt;${esc(tgt.toEmail)}&gt;</span></div>
      <div class="chips">${Compose.quick(tgt.quoted).map((q, i) => `<button type="button" data-q="${esc(q)}"><kbd>Alt+${i + 1}</kbd> ${esc(q)}</button>`).join('')}</div>
      <textarea rows="4" placeholder="Write your reply…"></textarea>
      <div class="c-actions"><button class="primary send">Send <kbd>Ctrl+Enter</kbd></button><button class="cancel">Cancel <kbd>Esc</kbd></button>
      <span class="c-note">${S.backend.live ? 'Sends from your Gmail. 5 seconds to undo.' : 'Demo: nothing is really sent.'}</span></div>
    </div>`;
    const ta = el.querySelector('textarea');
    ta.value = opts.initial || '';
    const chips = [...el.querySelectorAll('.chips button')];
    const addChip = (b) => { ta.value = ta.value.trim() ? ta.value.trimEnd() + ' ' + b.dataset.q : b.dataset.q; ta.focus(); };
    chips.forEach((b) => (b.onclick = () => addChip(b)));
    const send = () => { const v = ta.value.trim(); if (v) opts.onSend(v); else ta.focus(); };
    el.querySelector('.send').onclick = send;
    el.querySelector('.cancel').onclick = opts.onCancel;
    ta.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); }
      else if (e.key === 'Escape') { e.preventDefault(); opts.onCancel(); }
      else if (e.altKey && /^[1-5]$/.test(e.key) && chips[e.key - 1]) { e.preventDefault(); addChip(chips[e.key - 1]); }
    });
    setTimeout(() => ta.focus(), 0);
  },
};

// Send after 5 seconds unless undone. Returns nothing; S.undo is set so z (or the toast button) cancels.
function queueSend(threadId, tgt, body, onUndo) {
  const payload = { threadId, to: tgt.to, subject: tgt.subject, inReplyTo: tgt.inReplyTo, references: tgt.references, body };
  const timer = setTimeout(async () => {
    if (S.undo && S.undo.timer === timer) S.undo = null;
    try { await S.backend.send(payload); toast('Reply sent to ' + tgt.toName + ' ✓'); }
    catch (e) { toast('Send failed: ' + e.message); }
  }, 5000);
  S.undo = { timer, run: () => { clearTimeout(timer); onUndo(body); toast('Send cancelled'); } };
  toast('Sending to ' + tgt.toName + '…', 'Undo', () => { const u = S.undo; S.undo = null; if (u) u.run(); });
}
