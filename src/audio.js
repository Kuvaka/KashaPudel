// Tiny synthesized sounds and music, no audio files. iOS Safari only allows audio after a
// user gesture, so unlock() is called from buttons and from every touch on the page.
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
  if (m) keeper?.pause();
}

// iOS silences Web Audio while the ringer switch is off, unless a media element is playing:
// a looping silent <audio> runs alongside (the "unmute" trick). Paused when the game is muted,
// so the phone's own music can come back.
let keeper = null;
function keepAlive() {
  if (!keeper) {
    // 0.2 s of silence as a WAV: 44-byte header + 1600 unsigned 8-bit samples at 8 kHz.
    const n = 1600, b = new Uint8Array(44 + n), v = new DataView(b.buffer);
    const str = (o, t) => { for (let i = 0; i < t.length; i++) b[o + i] = t.charCodeAt(i); };
    str(0, 'RIFF'); v.setUint32(4, 36 + n, true); str(8, 'WAVEfmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
    str(36, 'data'); v.setUint32(40, n, true); b.fill(128, 44);
    keeper = new Audio(URL.createObjectURL(new Blob([b], { type: 'audio/wav' })));
    keeper.loop = true; keeper.setAttribute('playsinline', '');
  }
  if (keeper.paused) keeper.play().catch(() => {});
}

// Called from every user gesture: creates the context the first time, wakes it after iOS
// interruptions (calls, Siri, switching apps) and starts the keeper.
export function unlock() {
  if (ac && ac.state === 'closed') ac = null;
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
  if (ac.state !== 'running') ac.resume().catch(() => {});
  if (!muted) keepAlive();
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

// Original composition "Утро экспедиции". 16 bars, D major, A/A'/B/B'.
// Each row: bass MIDI, arpeggio chord MIDI, eight lead eighth notes (null = rest).
export const HX_SCORE=[
 [38,[62,66,69],[74,78,81,78,76,74,69,73]],
 [45,[61,64,69],[76,null,73,76,81,80,76,73]],
 [47,[62,66,71],[74,78,83,81,78,74,76,78]],
 [43,[62,67,71],[79,78,74,71,74,78,76,null]],
 [40,[64,67,71],[76,79,83,79,78,76,71,74]],
 [45,[61,64,69],[73,76,81,83,81,76,73,null]],
 [43,[62,67,71],[74,79,78,74,71,74,78,79]],
 [45,[61,64,69],[81,76,73,69,73,76,78,81]],
 [38,[62,66,69],[78,81,86,null,85,81,78,76]],
 [43,[62,67,71],[79,83,86,83,81,79,78,74]],
 [47,[62,66,71],[78,83,85,86,85,83,81,78]],
 [45,[61,64,69],[81,85,88,null,86,85,81,76]],
 [40,[64,67,71],[83,79,76,79,83,86,83,79]],
 [43,[62,67,71],[86,83,79,78,79,83,81,79]],
 [45,[61,64,69],[85,81,76,73,76,81,83,85]],
 [38,[62,66,69],[86,null,81,78,74,null,69,73]],
];
export const SONGS={
 whale:{bpm:156,duty:.25,bass:'triangle',transpose:0,score:HX_SCORE},
 yorknew:{bpm:152,duty:.50,bass:'sawtooth',transpose:-2,score:HX_SCORE},
 greed:{bpm:160,duty:.25,bass:'triangle',transpose:2,score:HX_SCORE},
};
const hxWaves=new WeakMap(),hxNoise=new WeakMap();
function hxPulse(ctx,duty){let bank=hxWaves.get(ctx);if(!bank)hxWaves.set(ctx,bank=new Map());if(bank.has(duty))return bank.get(duty);const re=new Float32Array(65),im=new Float32Array(65);for(let n=1;n<65;n++){re[n]=2*Math.sin(2*Math.PI*n*duty)/(n*Math.PI);im[n]=2*(1-Math.cos(2*Math.PI*n*duty))/(n*Math.PI);}const w=ctx.createPeriodicWave(re,im);bank.set(duty,w);return w;}
function hxNoiseBuffer(ctx){let b=hxNoise.get(ctx);if(b)return b;b=ctx.createBuffer(1,ctx.sampleRate,ctx.sampleRate);const a=b.getChannelData(0);let z=39127;for(let i=0;i<a.length;i++){z=(Math.imul(z,1664525)+1013904223)>>>0;a[i]=z/2147483648-1;}hxNoise.set(ctx,b);return b;}
function hxTone(ctx,out,m,t,dur,voice,vol,duty=.5,vibrato=false){
 const o=ctx.createOscillator(),g=ctx.createGain();if(voice==='pulse')o.setPeriodicWave(hxPulse(ctx,duty));else o.type=voice;
 o.frequency.setValueAtTime(mtof(m),t);g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(vol,t+.002);g.gain.setValueAtTime(vol*.8,t+dur*.70);g.gain.exponentialRampToValueAtTime(.0001,t+dur);
 let lfo=null,depth=null;if(vibrato){lfo=ctx.createOscillator();depth=ctx.createGain();lfo.type='triangle';lfo.frequency.value=7.5;depth.gain.setValueAtTime(0,t);depth.gain.linearRampToValueAtTime(15,t+.045);lfo.connect(depth).connect(o.detune);lfo.start(t);lfo.stop(t+dur+.01);}
 o.connect(g).connect(out);o.start(t);o.stop(t+dur+.01);o.onended=()=>{o.disconnect();g.disconnect();lfo?.disconnect();depth?.disconnect();};
}
function hxDrum(ctx,out,t,kind,step){
 const s=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain();s.buffer=hxNoiseBuffer(ctx);
 const dur=kind==='kick'?.12:kind==='snare'?.085:.025;
 f.type=kind==='hat'?'highpass':'bandpass';f.Q.value=kind==='kick'?2.2:.7;
 f.frequency.setValueAtTime(kind==='kick'?190:kind==='snare'?2100:7200,t);
 if(kind==='kick')f.frequency.exponentialRampToValueAtTime(55,t+dur);
 env(g,t,kind==='kick'?.34:kind==='snare'?.17:.047,dur,.001);
 s.connect(f).connect(g).connect(out);s.start(t,(step*7919%31000)/48000);s.stop(t+dur+.01);s.onended=()=>{s.disconnect();f.disconnect();g.disconnect();};
}
// Pure scheduler shared by live playback and OfflineAudioContext WAV validation.
export function scheduleChipStep(ctx,out,song,step,t){
 const e=60/song.bpm/2,s=step%8,[root,chord,mel]=song.score[Math.floor(step/8)%song.score.length],tr=song.transpose;
 hxTone(ctx,out,root+(s%4===3?7:0)+tr,t,e*.62,song.bass,.115);
 for(let j=0;j<2;j++){const n=(step*2+j)%4,m=chord[[0,1,2,1][n]]+(n===3?12:0);hxTone(ctx,out,m+tr,t+j*e/2,e*.39,'square',.024);}
 const m=mel[s];if(m!==null){const hold=s<7&&mel[s+1]===null?1.82:.88;hxTone(ctx,out,m+tr,t,e*hold,'pulse',.075,song.duty,true);}
 if(s===0||s===4||s===7&&Math.floor(step/8)%4===3)hxDrum(ctx,out,t,'kick',step);
 if(s===2||s===6)hxDrum(ctx,out,t,'snare',step);
 hxDrum(ctx,out,t,'hat',step);if(s%2===1)hxDrum(ctx,out,t+e/2,'hat',step+1);
}

let activeSong=null;
let musicTimer = 0, step = 0, nextT = 0;
function schedule() {
  if (!ac) return;
  if(nextT<ac.currentTime-.25)nextT=ac.currentTime+.02;
  while (nextT < ac.currentTime + 0.25) {
    if(activeSong){if(live())scheduleChipStep(ac,musicBus,activeSong,step,nextT);step++;nextT+=60/activeSong.bpm/2;continue;}
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
  start(id) {
    if (!ac) return;
    this.stop(0);
    musicBus.disconnect();musicBus=ac.createGain();musicBus.connect(master);
    activeSong=SONGS[id]??null;
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
