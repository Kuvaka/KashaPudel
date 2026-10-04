// Tiny synthesized sounds and music, no audio files. iOS Safari only allows audio after a
// user gesture, so unlock() is called from the Start button.
const MUSIC_VOL = 0.55;
let ac = null, master = null, sfxBus = null, musicBus = null, noiseBuf = null;
let lastChomp = 0;
let muted = false;
try { muted = localStorage.getItem('kf_muted') === '1'; } catch {}

export const isMuted = () => muted;
export function setMuted(m) {
  muted = m;
  try { localStorage.setItem('kf_muted', m ? '1' : '0'); } catch {}
  if (master) master.gain.setTargetAtTime(m ? 0 : 1, ac.currentTime, 0.02);
}

export function unlock() {
  if (!ac) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    ac = new Ctx();
    master = ac.createGain(); master.gain.value = muted ? 0 : 1;
    const comp = ac.createDynamicsCompressor(); // keeps barks + music + chomps from clipping
    comp.threshold.value = -14; comp.ratio.value = 4;
    const makeup = ac.createGain(); makeup.gain.value = 1.8; // phone speakers: loud but not clipped
    master.connect(comp).connect(makeup).connect(ac.destination);
    sfxBus = ac.createGain(); sfxBus.connect(master);
    musicBus = ac.createGain(); musicBus.gain.value = MUSIC_VOL; musicBus.connect(master);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const ch = noiseBuf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
  }
  if (ac.state === 'suspended' || ac.state === 'interrupted') ac.resume().catch(() => {});
}

const live = () => !muted && ac && ac.state === 'running';
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

function env(g, t, vol, dur, attack = 0.005) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}

function tone(freq, dur, type = 'sine', vol = 0.15, slide = 0, when = 0, out = sfxBus) {
  if (!live()) return;
  const t = ac.currentTime + when;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(out);
  o.start(t); o.stop(t + dur + 0.02);
}

// Filtered noise: crunches, whooshes, hats. f0→f1 sweeps the band.
function noise(t, dur, vol, f0, f1 = f0, q = 1, type = 'bandpass', out = sfxBus) {
  const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noiseBuf;
  f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  env(g, t, vol, dur, Math.min(0.02, dur * 0.3));
  s.connect(f).connect(g).connect(out);
  s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
}

// A cartoon "woof": a buzzy voice through two mouth formants that open and close (w-OO-f),
// plus a breathy onset. size 0 = tiny puppy yip, 1 = grown dog.
function woof(t, size, vol, pan = 0) {
  const k = 1 + (Math.random() - 0.5) * 0.12;          // every bark a little different
  const f0 = (640 - 330 * size) * k, dur = 0.1 + 0.07 * size, fs = (1.35 - 0.45 * size) * k;
  const o = ac.createOscillator(), g = ac.createGain(), out = ac.createGain();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(f0 * 1.15, t);
  o.frequency.linearRampToValueAtTime(f0 * 1.35, t + 0.025);
  o.frequency.exponentialRampToValueAtTime(f0 * 0.72, t + dur);
  env(g, t, 1, dur, 0.008);
  out.gain.value = vol;
  for (const [a, b, c, q, w] of [[380, 820, 520, 5, 1], [900, 1450, 1100, 6, 0.55]]) {
    const f = ac.createBiquadFilter(), fg = ac.createGain();
    f.type = 'bandpass'; f.Q.value = q;
    f.frequency.setValueAtTime(a * fs, t);
    f.frequency.linearRampToValueAtTime(b * fs, t + dur * 0.35);
    f.frequency.linearRampToValueAtTime(c * fs, t + dur);
    fg.gain.value = w * 2.6;
    g.connect(f).connect(fg).connect(out);
  }
  const soft = ac.createBiquadFilter(); // round off the buzz so it reads as a voice, not a kazoo
  soft.type = 'lowpass'; soft.frequency.value = 1900 * fs; soft.Q.value = 0.5;
  out.connect(soft);
  let node = soft;
  if (ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = pan; soft.connect(p); node = p; }
  node.connect(sfxBus);
  o.connect(g);
  o.start(t); o.stop(t + dur + 0.03);
  noise(t, 0.035, vol * 0.25, 1800 * fs, 1200 * fs, 1.5);
}

export const sfx = {
  chomp(big) {
    const now = performance.now();
    if (now - lastChomp < 45 || !live()) return;
    lastChomp = now;
    const t = ac.currentTime;
    noise(t, 0.05, 0.22, 2600, 1500, 2);                 // crunch
    tone(big ? 520 : 700 + (0.5 + 0.5 * Math.sin(now * 0.01)) * 120, 0.08, 'triangle', 0.1, -250);
    if (big) { noise(t + 0.09, 0.05, 0.18, 2200, 1300, 2); tone(780, 0.1, 'triangle', 0.08, 300, 0.09); }
  },
  levelUp(size) {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'square', 0.06, 0, i * 0.08));
    if (live()) { woof(ac.currentTime + 0.38, size, 0.5); woof(ac.currentTime + 0.56, size, 0.45); }
  },
  // A gentle bump: rubber boing, and a cartoon slide whistle when it's you who tumbles.
  boing(me) {
    tone(220, 0.25, 'sine', 0.18, 300); tone(140, 0.12, 'triangle', 0.1, -60);
    if (me) tone(1300, 0.45, 'sine', 0.07, -850, 0.06);
  },
  beep(go) { tone(go ? 880 : 440, go ? 0.35 : 0.15, 'square', 0.07); },
  // Player bark (dash, start) or a rival nearby: quieter and panned by where it is.
  bark(size, vol = 0.55, pan = 0, n = 1) {
    if (!live()) return;
    for (let i = 0; i < n; i++) woof(ac.currentTime + i * (0.16 + 0.05 * size), size, vol * (1 - i * 0.12), pan);
  },
  // A soft cartoon 'plop' for a pile, a wet splash for puddles, 'yuck!' when a dog runs over a pile.
  plop() { tone(320, 0.12, 'sine', 0.14, -200); tone(180, 0.1, 'sine', 0.08, -60, 0.05); },
  splash(big) { if (live()) { noise(ac.currentTime, big ? 0.35 : 0.2, big ? 0.16 : 0.08, 900, 2400, 0.8); tone(520, 0.08, 'sine', 0.04, 300, 0.02); } },
  yuck(me) {
    tone(260, 0.22, 'sawtooth', 0.05, -90); tone(200, 0.3, 'triangle', 0.08, -70, 0.12);
    if (me) tone(700, 0.4, 'sine', 0.05, -400, 0.2);
  },
  whoosh() { if (live()) noise(ac.currentTime, 0.28, 0.16, 500, 2600, 1.2); },
  ready() { tone(1320, 0.12, 'sine', 0.05); tone(1760, 0.14, 'sine', 0.04, 0, 0.06); },
  rivalDone() { tone(988, 0.18, 'triangle', 0.05); tone(1319, 0.25, 'triangle', 0.04, 0, 0.1); },
  win(size) {
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.1, 0, i * 0.11));
    if (live()) for (let i = 0; i < 3; i++) woof(ac.currentTime + 0.75 + i * 0.2, size, 0.5);
  },
};

// Music: a bouncy two-part loop (A: C Am F G…, B: F G Em Am…) at 132 bpm — oom-pah bass,
// off-beat chord stabs, a blippy square-wave tune and soft drums. Scheduled ahead on the
// audio clock so frame hitches don't make it stumble.
const _ = null;
const SONG = [
  // [bass root, chord, 8 melody eighths]
  [48, [60, 64, 67], [72, _, 76, 79, 81, 79, 76, _]],
  [45, [57, 60, 64], [76, _, 72, 76, 74, _, 72, _]],
  [41, [57, 60, 65], [69, 72, 77, _, 76, 74, 72, _]],
  [43, [55, 59, 62], [74, _, 71, 74, 79, _, _, _]],
  [48, [60, 64, 67], [79, 76, 79, 84, 81, 79, 76, _]],
  [45, [57, 60, 64], [76, 74, 72, 76, 81, _, 79, _]],
  [41, [57, 60, 65], [77, 76, 74, 72, 74, _, 71, _]],
  [48, [60, 64, 67], [72, _, 79, _, 72, _, _, _]],
  [41, [57, 60, 65], [81, _, 79, 77, 76, _, 77, _]],
  [43, [55, 59, 62], [79, _, 74, _, 71, 74, 79, _]],
  [40, [55, 59, 64], [79, 76, 71, 76, 79, _, 83, _]],
  [45, [57, 60, 64], [81, _, _, 76, 72, _, 76, _]],
  [41, [57, 60, 65], [77, 81, 84, _, 81, 77, 76, _]],
  [43, [55, 59, 62], [74, 79, 83, _, 79, 74, 71, _]],
  [48, [60, 64, 67], [72, 76, 79, 84, 79, 76, 72, _]],
  [43, [55, 59, 62], [74, _, 71, _, 67, _, _, _]],
];
const EIGHTH = 60 / 132 / 2;

function note(m, t, dur, type, vol, filt = 0, blip = false) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  const f = mtof(m);
  o.frequency.setValueAtTime(blip ? f * 1.06 : f, t);
  if (blip) o.frequency.exponentialRampToValueAtTime(f, t + 0.025);
  env(g, t, vol, dur, 0.006);
  let src = o;
  if (filt) { const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = filt; o.connect(lp); src = lp; }
  src.connect(g).connect(musicBus);
  o.start(t); o.stop(t + dur + 0.02);
}

function kick(t) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.frequency.setValueAtTime(160, t);
  o.frequency.exponentialRampToValueAtTime(50, t + 0.12);
  env(g, t, 0.25, 0.14, 0.003);
  o.connect(g).connect(musicBus);
  o.start(t); o.stop(t + 0.16);
}

let musicTimer = 0, step = 0, nextT = 0;
function schedule() {
  if (!ac) return;
  while (nextT < ac.currentTime + 0.25) {
    const bar = SONG[Math.floor(step / 8) % SONG.length], s = step % 8, t = nextT;
    const [root, chord, mel] = bar;
    if (!live()) { step++; nextT += EIGHTH; continue; } // muted: keep time, make no nodes
    if (s === 0 || s === 4) { note(s ? root + 7 : root, t, 0.2, 'triangle', 0.32); kick(t); }
    if (s === 2 || s === 6) for (const m of chord) note(m, t, 0.11, 'square', 0.025, 1800);
    if (s % 2 === 1) noise(t, 0.03, s === 3 || s === 7 ? 0.05 : 0.03, 8000, 8000, 0.7, 'highpass', musicBus);
    const m = mel[s];
    if (m !== null) {
      let hold = 1;
      while (s + hold < 8 && mel[s + hold] === null && hold < 2) hold++;
      note(m, t, EIGHTH * hold * 0.85, 'square', 0.06, 2600, true);
      note(m + 12, t, EIGHTH * 0.5, 'sine', 0.025);    // a little sparkle on top
    }
    step++; nextT += EIGHTH;
  }
}

export const music = {
  start() {
    if (!ac) return;
    this.stop(0);
    musicBus.gain.cancelScheduledValues(ac.currentTime);
    musicBus.gain.setValueAtTime(MUSIC_VOL, ac.currentTime);
    step = 0; nextT = ac.currentTime + 0.05;
    schedule();
    musicTimer = setInterval(schedule, 60);
  },
  // Fade out (seconds), e.g. under the win jingle.
  stop(fade = 0.6) {
    clearInterval(musicTimer); musicTimer = 0;
    if (!ac || !fade) return;
    musicBus.gain.setTargetAtTime(0, ac.currentTime, fade / 3);
  },
  pause() { clearInterval(musicTimer); musicTimer = 0; },
  resume() {
    if (!ac || musicTimer) return;
    nextT = ac.currentTime + 0.05;
    musicTimer = setInterval(schedule, 60);
  },
  get playing() { return !!musicTimer; },
};
