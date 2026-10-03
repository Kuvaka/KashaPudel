import { CONFIG } from './config.js';
import { Game, FINISH_XP } from './game.js';
import { loadArt } from './art.js';
import { Renderer, refreshSafeArea } from './render.js';
import { Input } from './input.js';
import { unlock, sfx, isMuted, setMuted } from './audio.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const STEP = 1 / CONFIG.simHz;
const MEDALS = ['🥇', '🥈', '🥉'];

// ?3d: the 3D renderer (proto/render3d.js) behind the same interface, for testing in the game.
// If 3D can't start (old Safari, no WebGL), say so and fall back to the 2D game.
async function make3d() {
  try { return new (await import('../proto/render3d.js')).Renderer3D(canvas); }
  catch (e) { console.error(e); alert('3D не запустилось, открываю обычную версию.'); return null; }
}
const renderer = (new URLSearchParams(location.search).has('3d') && await make3d()) || new Renderer(canvas, await loadArt());
const input = new Input(canvas, $('dash'));
let screen = 'start';
let paused = false;
const pauseOverlay = document.createElement('div');
pauseOverlay.className = 'screen hidden';
pauseOverlay.innerHTML = '<div class="panel"><h2>Пауза</h2><button class="big">Продолжить</button></div>';
document.body.append(pauseOverlay);
pauseOverlay.querySelector('button').addEventListener('click', () => {
  unlock(); input.reset(); acc = 0; last = performance.now();
  paused = false; input.enabled = screen === null;
  pauseOverlay.classList.add('hidden');
});

const game = new Game({
  onEat(d, f) {
    if (!d.isPlayer) return;
    renderer.burst(f.x, f.y, f.type.id === 'bone' ? '#ffd23f' : '#c98a4b', f.type.xp > 1 ? 8 : 4, 90);
    if (f.type.xp > 1) renderer.floatText(f.x, f.y - 10, `+${f.type.xp}`, f.type.id === 'bone' ? '#ffd23f' : '#fff', 18);
    sfx.chomp(f.type.xp > 1);
  },
  onLevelUp(d) {
    if (!d.isPlayer) return;
    const st = CONFIG.stages[d.stage];
    renderer.burst(d.x, d.y, st.coat, 24, 260);
    renderer.floatText(d.x, d.y - d.r * 2, `${st.name}!`, '#ffe45c', Math.max(26, d.r * 0.9));
    sfx.levelUp();
  },
  onFinish(d) {
    if (!d.isPlayer) {
      if (screen === null) showToast(`${MEDALS[d.place - 1] || '🏁'} ${d.name} — ${d.place}-е место!`);
      return;
    }
    renderer.burst(d.x, d.y, '#ffd23f', 40, 320);
    sfx.win();
    setTimeout(showFinish, 1400);
  },
  onShove(att, vic) {
    if (screen !== null || (!att.isPlayer && !vic.isPlayer)) return;
    renderer.burst((att.x + vic.x) / 2, (att.y + vic.y) / 2, '#ffffff', 12, 200);
    sfx.boing();
    if (vic.isPlayer) showToast(`💥 ${att.name} толкает тебя!`);
  },
  onCountdown(n) {
    showCountdown(n ? String(n) : 'Вперёд!');
    sfx.beep(!n);
  },
});
window.__kf = { game, renderer, input }; // debug handle

let toastTimer = 0;
function showToast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2000);
}

function showCountdown(text) {
  const el = $('countdown');
  el.textContent = text;
  el.classList.remove('go');
  void el.offsetWidth; // restart the CSS animation
  el.classList.add('go');
}

function fmtTime(sec) {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function showFinish() {
  const p = game.player;
  $('fin-title').textContent = p.place === 1 ? 'Победа!' : 'Выросла!';
  $('gift-message').textContent = CONFIG.gift.message;
  $('gift-signature').textContent = CONFIG.gift.signature;
  $('fin-place').textContent = `${MEDALS[p.place - 1] || '🏁'} ${p.place}-е место из ${game.dogs.length}`;
  $('fin-stats').innerHTML = `Время: <b>${fmtTime(p.finished)}</b> · Печенья: <b>${p.eaten}</b>`;
  const top = game.leaderboard().filter((d) => d.finished).slice(0, 3);
  $('podium').innerHTML = [1, 0, 2].map((i) => top[i]
    ? `<div class="step s${i + 1} ${top[i].isPlayer ? 'me' : ''}"><span>${escapeHtml(top[i].name)}</span><b>${i + 1}</b></div>`
    : `<div class="step s${i + 1} empty"><span>…</span><b>${i + 1}</b></div>`).join('');
  show('finish');
}

function show(name) {
  screen = name;
  input.reset();
  paused = false; pauseOverlay.classList.add('hidden');
  for (const id of ['start', 'finish']) $(id).classList.toggle('hidden', id !== name);
  $('hud').classList.toggle('hidden', name !== null);
  input.enabled = name === null;
}

function begin() {
  document.activeElement?.blur();
  input.reset();
  clearTimeout(toastTimer); $('toast').classList.remove('show');
  renderer.particles.length = 0; renderer.texts.length = 0;
  acc = 0; last = performance.now();
  unlock();
  const name = $('name').value.trim().slice(0, 12);
  try { localStorage.setItem('kf_name', name); } catch {}
  game.start(name || CONFIG.gift.defaultName);
  renderer.snapCamera(game.player);
  show(null);
  showCountdown(String(CONFIG.race.countdownSec));
  sfx.beep(false);
}

let savedName = null;
try { savedName = localStorage.getItem('kf_name'); } catch {}
$('name').value = savedName || CONFIG.gift.defaultName;
$('play').addEventListener('click', begin);
$('again').addEventListener('click', begin);
$('name').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.repeat && screen === 'start') { e.preventDefault(); begin(); } });

const muteBtn = $('mute');
const syncMute = () => { muteBtn.textContent = isMuted() ? '🔇' : '🔊'; };
muteBtn.addEventListener('click', () => { setMuted(!isMuted()); if (!isMuted()) unlock(); syncMute(); });
syncMute();

// In the background iOS throttles timers; on return, don't fast-forward the race and
// don't keep a stick or dash "held" from before.
function suspendRace() {
  input.reset(); acc = 0; last = performance.now();
  if (screen === null && !game.player.finished) {
    paused = true; input.enabled = false;
    pauseOverlay.classList.remove('hidden');
  }
}
document.addEventListener('visibilitychange', () => { if (document.hidden) suspendRace(); });
window.addEventListener('blur', suspendRace);

function onResize() { refreshSafeArea(); renderer.resize(); }
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', () => setTimeout(onResize, 200));
document.addEventListener('gesturestart', (e) => e.preventDefault());
refreshSafeArea();

// HUD
const hudStage = $('stage-name'), hudBar = $('xp-fill'), hudBoard = $('board'), hudTime = $('race-time');
const dashBtn = $('dash');
let boardTimer = 0, dashWasReady = true;
function updateHud(dt) {
  const p = game.player;
  const cd = p.dashCd / CONFIG.dash.cooldownSec;
  dashBtn.style.setProperty('--cd', cd.toFixed(3));
  if (cd === 0 && !dashWasReady) {
    dashBtn.classList.remove('ready'); void dashBtn.offsetWidth; dashBtn.classList.add('ready');
  }
  dashWasReady = cd === 0;
  hudStage.textContent = CONFIG.stages[p.stage].name;
  hudBar.style.width = `${Math.min(100, (p.xp / FINISH_XP) * 100).toFixed(1)}%`;
  hudTime.textContent = fmtTime(p.finished || game.time);
  boardTimer -= dt;
  if (boardTimer > 0) return;
  boardTimer = 0.4;
  const board = game.leaderboard();
  const rank = board.indexOf(p) + 1;
  const row = (d, i) => {
    const mark = d.place ? (MEDALS[d.place - 1] || '🏁') : `${Math.floor(Math.min(1, d.xp / FINISH_XP) * 100)}%`;
    return `<li class="${d.isPlayer ? 'me' : ''}"><span>${i + 1}. ${escapeHtml(d.name)}</span><b>${mark}</b></li>`;
  };
  const rows = board.slice(0, 5).map(row);
  if (rank > 5) rows.push(row(p, rank - 1));
  hudBoard.innerHTML = rows.join('');
}
function escapeHtml(s) { return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// Fixed-step simulation, interpolated rendering (smooth on 120 Hz ProMotion).
let last = performance.now(), acc = 0;
game.start('');
game.countdown = 0; // menu backdrop: bots already roam
renderer.snapCamera(game.player);
show('start');

function frame(now) {
  if (document.hidden || paused) {
    last = now; acc = 0;
    // Keep the frozen field drawn behind the pause card (a rotation clears the canvas).
    if (paused) renderer.draw(game, 1, 0, null, true);
    requestAnimationFrame(frame); return;
  }
  const dt = Math.min(4 * STEP, Math.max(0, (now - last) / 1000));
  last = now;
  if (input.enabled && game.racing) {
    const i = input.read(renderer.vw, renderer.vh);
    // The 3D camera looks down at an angle: screen directions become ground directions.
    const [dx, dy] = renderer.screenDirToWorld ? renderer.screenDirToWorld(i.dirX, i.dirY) : [i.dirX, i.dirY];
    game.setPlayerInput(dx, dy, i.mag, i.dash);
  } else {
    game.setPlayerInput(0, 0, 0, false);
  }
  acc += dt;
  while (acc >= STEP) { game.step(STEP); acc -= STEP; }
  renderer.draw(game, acc / STEP, dt, input.enabled ? input.stickVisual() : null, screen === null);
  if (screen === null) updateHud(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
