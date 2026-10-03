// Tiny synthesized sounds. iOS Safari only allows audio after a user gesture, so unlock()
// is called from the Start button.
let ac = null;
let lastChomp = 0;

export function unlock() {
  if (!ac) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    ac = new Ctx();
  }
  if (ac.state === 'suspended') ac.resume();
}

function tone(freq, dur, type = 'sine', vol = 0.15, slide = 0, when = 0) {
  if (!ac || ac.state !== 'running') return;
  const t = ac.currentTime + when;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(ac.destination);
  o.start(t); o.stop(t + dur + 0.02);
}

export const sfx = {
  chomp(big) {
    const now = performance.now();
    if (now - lastChomp < 45) return;
    lastChomp = now;
    tone(big ? 520 : 700 + Math.random() * 120, 0.08, 'triangle', 0.12, -250);
  },
  levelUp() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'square', 0.07, 0, i * 0.08)); },
  boing() { tone(220, 0.25, 'sine', 0.18, 300); tone(140, 0.12, 'triangle', 0.1, -60); },
  beep(go) { tone(go ? 880 : 440, go ? 0.35 : 0.15, 'square', 0.08); },
  win() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.1, 0, i * 0.11)); },
};
