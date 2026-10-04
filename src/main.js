import { CONFIG } from './config.js';
import { Game, FINISH_XP } from './game.js';
import { loadArt } from './art.js';
import { Renderer, refreshSafeArea } from './render.js';
import { Input } from './input.js';
import { unlock, sfx, music, isMuted, setMuted } from './audio.js';
import { Wallet } from './wallet.js';
import { Wardrobe, outfitOf, botOutfit, itemById } from './wardrobe.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const STEP = 1 / CONFIG.simHz;
const MEDALS = ['🥇', '🥈', '🥉'];
const sizeOf = (d) => d.stage / (CONFIG.stages.length - 1); // 0 = puppy voice, 1 = grown dog

// The 3D renderer (proto/render3d.js) is the default, behind the same interface as the 2D one.
// ?2d forces the 2D game; if 3D can't start (old Safari, no WebGL) the 2D game takes over quietly.
async function make3d() {
  try { return new (await import('../proto/render3d.js')).Renderer3D(canvas); }
  catch (e) { console.error(e); return null; }
}
const renderer = (!new URLSearchParams(location.search).has('2d') && await make3d()) || new Renderer(canvas, await loadArt());
const input = new Input(canvas, $('dash'));
const WR = CONFIG.wardrobe;
const wallet = new Wallet(WR.starterGift);
let screen = 'start';
let runId = null, finResult = null; // the paid race and what its finish brought
let paused = false;
const pauseOverlay = document.createElement('div');
pauseOverlay.className = 'screen hidden';
pauseOverlay.innerHTML = '<div class="panel"><h2>Пауза</h2><button class="big">Продолжить</button></div>';
document.body.append(pauseOverlay);
pauseOverlay.querySelector('button').addEventListener('click', () => {
  unlock(); input.reset(); acc = 0; last = performance.now();
  paused = false; input.enabled = screen === null;
  if (musicWasOn) { music.resume(); musicWasOn = false; }
  pauseOverlay.classList.add('hidden');
});

const game = new Game({
  onEat(d, f) {
    if (!d.isPlayer) return;
    if (runId) wallet.credit(runId, d.eaten); // saved as you go: closing the game mid-race keeps them
    renderer.burst(f.x, f.y, f.type.id === 'bone' ? '#ffd23f' : '#c98a4b', f.type.xp > 1 ? 8 : 4, 90);
    if (f.type.xp > 1) renderer.floatText(f.x, f.y - 10, `+${f.type.xp}`, f.type.id === 'bone' ? '#ffd23f' : '#fff', 18);
    sfx.chomp(f.type.xp > 1);
  },
  onLevelUp(d) {
    if (!d.isPlayer) return;
    const st = CONFIG.stages[d.stage];
    renderer.burst(d.x, d.y, st.coat, 24, 260);
    renderer.floatText(d.x, d.y - d.r * 2, `${st.name}!`, '#ffe45c', Math.max(26, d.r * 0.9));
    sfx.levelUp(sizeOf(d));
  },
  onFinish(d) {
    if (!d.isPlayer) {
      if (screen === null) { showToast(`${MEDALS[d.place - 1] || '🏁'} ${d.name} — ${d.place}-е место!`); sfx.rivalDone(); }
      return;
    }
    renderer.burst(d.x, d.y, '#ffd23f', 40, 320);
    if (runId) { const id = runId; runId = null; finResult = wallet.finish(id, d.eaten, WR.finishBonus); }
    music.stop(0.5);
    sfx.win(sizeOf(d));
    setTimeout(showFinish, 1400);
  },
  onShove(att, vic) {
    if (screen !== null || (!att.isPlayer && !vic.isPlayer)) return;
    renderer.burst((att.x + vic.x) / 2, (att.y + vic.y) / 2, '#ffffff', 12, 200);
    sfx.boing(vic.isPlayer);
    if (att.isPlayer) sfx.bark(sizeOf(att), 0.4);
    if (vic.isPlayer) showToast(`💥 ${att.name} толкает тебя!`);
  },
  onCountdown(n) {
    showCountdown(n ? String(n) : 'Вперёд!');
    sfx.beep(!n);
    if (!n) { music.start(); sfx.bark(sizeOf(game.player), 0.5, 0, 2); }
  },
  // Dash: a whoosh and often a happy bark; rivals bark too when they're near you on screen.
  onDash(d) {
    if (screen !== null) return;
    if (d.isPlayer) { sfx.whoosh(); if (Math.random() < 0.6) sfx.bark(sizeOf(d), 0.5); return; }
    const p = game.player, dx = d.x - p.x, dist = Math.hypot(dx, d.y - p.y), now = performance.now();
    if (dist > 700 || now - lastRivalBark < 900) return;
    lastRivalBark = now;
    sfx.bark(sizeOf(d), 0.4 * (1 - dist / 800), Math.max(-0.8, Math.min(0.8, dx / 500)));
  },
});
window.__kf = { game, renderer, input, wallet }; // debug handle

let toastTimer = 0, lastRivalBark = 0, musicWasOn = false;
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
  const bank = $('fin-bank');
  bank.textContent = '';
  Promise.resolve(finResult).then((r) => {
    bank.textContent = r ? `🍪 +${r.eaten} и +${r.bonus} за финиш · в копилке ${r.cookies}` : `🍪 В копилке ${wallet.cookies}`;
  });
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
  if (name === 'start' || name === 'finish') syncBank();
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
  music.stop(0.2); musicWasOn = false;
  const name = $('name').value.trim().slice(0, 12);
  try { localStorage.setItem('kf_name', name); } catch {}
  game.start(name || CONFIG.gift.defaultName);
  runId = wallet.startRun(); finResult = null;
  dressDogs();
  renderer.snapCamera(game.player);
  show(null);
  showCountdown(String(CONFIG.race.countdownSec));
  sfx.beep(false);
}

// The player wears what was bought; a few rivals get one small thing each, new every race.
function dressDogs() {
  game.player.outfit = outfitOf(wallet.p.worn);
  const bots = game.dogs.filter((d) => !d.isPlayer).sort(() => Math.random() - 0.5);
  bots.forEach((d, i) => { d.outfit = i < WR.dressedBots ? botOutfit() : null; });
}

// Cookie bank on the menus, and the dream being saved up for.
function syncBank() {
  for (const el of document.querySelectorAll('.cookies')) el.textContent = wallet.cookies;
  const wish = itemById(wallet.wish), lack = wish ? wish.price - wallet.cookies : 0;
  for (const id of ['start-wish', 'fin-wish']) {
    const el = $(id); if (!el) continue;
    el.textContent = wish ? (lack > 0 ? `⭐ До «${wish.name}»: ещё ${lack} 🍪` : `⭐ Хватает на «${wish.name}»!`) : '';
  }
}
wallet.on(syncBank);

const wardrobe = new Wardrobe({ wallet, renderer, onClose() {
  game.player.outfit = outfitOf(wallet.p.worn);
  show(wardrobeFrom);
} });
let wardrobeFrom = 'start';
function openWardrobe() {
  unlock();
  wardrobeFrom = screen;
  show('wardrobe');
  wardrobe.open();
}
$('to-wardrobe').addEventListener('click', openWardrobe);
$('fin-wardrobe').addEventListener('click', openWardrobe);

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
    if (music.playing) { music.pause(); musicWasOn = true; }
    pauseOverlay.classList.remove('hidden');
  }
}
document.addEventListener('visibilitychange', () => { if (document.hidden) suspendRace(); });
window.addEventListener('blur', suspendRace);

function onResize() { refreshSafeArea(); renderer.resize(); wardrobe.layout(); }
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
    if (!p.finished) sfx.ready();
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
dressDogs();
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
  if (screen === 'wardrobe') acc = 0; // the field waits while you dress up
  while (acc >= STEP) { game.step(STEP); acc -= STEP; }
  renderer.draw(game, acc / STEP, dt, input.enabled ? input.stickVisual() : null, screen === null);
  if (screen === null) updateHud(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
