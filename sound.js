// Sound for the games: short WebAudio blips and a looping background tune, all made in code (no audio files).
// Muted by default, since people play at work. The big button at the side of the game, or M, turns it on or
// off, and the choice is remembered.
const SFX_BANK = {
  // [wave, start Hz, end Hz, seconds, volume]
  delete: ['square', 520, 260, 0.07, 0.04], archive: ['square', 380, 300, 0.07, 0.035],
  keep: ['triangle', 420, 700, 0.08, 0.05], reply: ['triangle', 560, 1000, 0.09, 0.05],
  good: ['triangle', 660, 1320, 0.12, 0.07], bad: ['sawtooth', 180, 90, 0.25, 0.06],
  hurt: ['sawtooth', 140, 60, 0.35, 0.08], boss: ['square', 200, 120, 0.1, 0.05],
  bossdie: ['sawtooth', 300, 40, 0.7, 0.09], power: ['triangle', 440, 1760, 0.35, 0.07], wave: ['sine', 330, 660, 0.4, 0.06],
  paddle: ['triangle', 260, 320, 0.06, 0.06], brick: ['square', 640, 960, 0.06, 0.035], steel: ['triangle', 1500, 1300, 0.12, 0.05],
  launch: ['triangle', 380, 760, 0.12, 0.05],
};

// A tune is a loop of eighth notes: per chord, a bass pattern (semitones above the root) and a lead pattern
// (which chord note). null is a rest. Notes are MIDI numbers.
function makeSong(bpm, chords, bassPat, leadPat, leadWave) {
  const bass = [], lead = [];
  chords.forEach(([root, notes]) => {
    bassPat.forEach((o) => bass.push(o == null ? 0 : root + o));
    leadPat.forEach((i) => lead.push(i == null ? 0 : notes[i]));
  });
  return { bpm, bass, lead, leadWave };
}
const SONGS = {
  defense: makeSong(140, [[45, [69, 72, 76]], [41, [65, 69, 72]], [43, [67, 71, 74]], [40, [64, 68, 71]]], [0, null, 12, 0, null, 0, 12, 7], [0, null, 1, null, 2, null, 1, 2], 'square'),
  breakout: makeSong(124, [[48, [72, 76, 79]], [45, [69, 72, 76]], [41, [69, 72, 77]], [43, [67, 71, 74]]], [0, null, 7, null, 12, null, 7, null], [0, 1, 2, 1, 0, 1, 2, 1], 'triangle'),
};

const SFX = {
  ctx: null, song: null, timer: null, step: 0, next: 0, btns: [],
  muted() { return store.get('soundOn') !== true; },
  audio() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },
  tone(wave, f1, f2, dur, vol, at) {
    const c = this.audio(), t = at || c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = wave; o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
  },
  play(name) {
    if (this.muted() || !SFX_BANK[name]) return;
    try { this.tone(...SFX_BANK[name]); } catch {}
  },
  // music('defense' | 'breakout') starts that tune (if sound is on); music(null) stops it
  music(name) { this.song = name ? SONGS[name] : null; this.sync(); },
  sync() {
    const want = this.song && !this.muted();
    if (want && !this.timer) {
      try {
        const c = this.audio();
        this.next = c.currentTime + 0.05; this.step = 0;
        this.timer = setInterval(() => this.schedule(), 60);
      } catch {}
    } else if (!want && this.timer) { clearInterval(this.timer); this.timer = null; }
  },
  schedule() {
    const s = this.song, c = this.ctx;
    if (!s || !c) return;
    const len = 60 / s.bpm / 2, hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
    if (this.next < c.currentTime) this.next = c.currentTime + 0.05; // the tab was in the background
    while (this.next < c.currentTime + 0.25) {
      const i = this.step % s.bass.length;
      if (s.bass[i]) this.tone('triangle', hz(s.bass[i]), hz(s.bass[i]), len * 0.9, 0.07, this.next);
      if (s.lead[i]) this.tone(s.leadWave, hz(s.lead[i]), hz(s.lead[i]), len * 0.6, s.leadWave === 'square' ? 0.018 : 0.03, this.next);
      this.next += len; this.step++;
    }
  },
  toggle() {
    store.set('soundOn', this.muted());
    if (!this.muted()) this.play('good');
    this.sync();
    this.btns = this.btns.filter((b) => b.isConnected);
    this.btns.forEach((b) => this.label(b));
  },
  label(b) { setHTML(b, this.muted() ? '🔇<small>Sound off</small><small>M</small>' : '🔊<small>Sound on</small><small>M</small>'); },
  // the big mute button: put soundButton() in a screen's HTML, then bindSound(that screen)
  button() { return '<button class="snd-btn" data-snd title="Sound on / off (M)"></button>'; },
  bind(el) { el.querySelectorAll('[data-snd]').forEach((b) => { this.label(b); b.onclick = () => { this.toggle(); b.blur(); }; this.btns.push(b); }); },
};
