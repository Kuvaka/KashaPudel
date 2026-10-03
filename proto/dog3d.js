// 3D maltipoo prototype: the real Game drives one dog (or the whole race), DogVisual draws it.
import * as THREE from 'three';
import { CONFIG } from '../src/config.js';
import { Game, stageOf } from '../src/game.js';
import { Input } from '../src/input.js';
import { DogVisual } from './dogVisual.js';
import { World3D } from './render3d.js';

const { shove: SH } = CONFIG;
const $ = (id) => document.getElementById(id);
const canvas = $('c');

// Meadow, food, dogs and cameras live in World3D (shared with the game's ?3d renderer).
const world = new World3D(canvas);
const { renderer, scene, meadow, food, assets, bakeMs, camera, visuals } = world;

const game = new Game({});
const input = new Input(canvas, $('dash'));
input.enabled = true;
let mode = 'manual', paused = false, timeScale = 1, stress = false;

function startSolo() {
  stress = false;
  game.start('Катя');
  game.dogs = [game.player];
  game.countdown = 0;
  syncVisuals();
}
function startStress() {
  stress = true;
  game.start('Катя');
  game.countdown = 0.01;
  syncVisuals();
}
const syncVisuals = () => world.syncVisuals(game);

function setGrowth(xp) {
  const p = game.player;
  p.xp = xp; p.stage = stageOf(xp); p.finished = 0;
}

// Scripted input for repeatable checks.
let scriptT = 0;
function playerInput(dt) {
  scriptT += dt;
  if (mode === 'manual') {
    const i = input.read(innerWidth, innerHeight), w = Math.sin(52 * Math.PI / 180), l = Math.hypot(i.dirX, i.dirY / w);
    return l > 1e-6 ? { ...i, dirX: i.dirX / l, dirY: i.dirY / w / l } : i; // screen -> ground under the 52° camera
  }
  if (mode === 'idle') return { dirX: 0, dirY: 0, mag: 0, dash: false };
  if (mode === 'circle') { const a = scriptT * 0.9; return { dirX: Math.cos(a), dirY: Math.sin(a), mag: 1, dash: false }; }
  // zigzag: hard 140° turns every 1.1 s, makes the dog skid
  const a = Math.floor(scriptT / 1.1) % 2 ? 0.35 : Math.PI - 0.35;
  return { dirX: Math.cos(a), dirY: Math.sin(a), mag: 1, dash: false };
}

let dashReq = false;
const STEP = 1 / 60;
let acc = 0;
function stepGame(dt) {
  acc += dt;
  let n = 0;
  while (acc >= STEP && n < 4) {
    const inp = playerInput(STEP);
    game.setPlayerInput(inp.dirX, inp.dirY, inp.mag, inp.dash || dashReq);
    game.step(STEP);
    if (game.player.dashT > 0) dashReq = false;
    acc -= STEP; n++;
  }
  if (n === 4) acc = 0;
  // Solo dog never finishes: keep the slider in charge of its growth.
  if (!stress) { const g = +$('grow').value; if (game.player.xp !== g) setGrowth(g); }
}

const stats = { fps: 0, ms: 0, frames: 0, acc: 0, msAcc: 0 };
function frame(dt) {
  const c0 = performance.now();
  dt = Math.min(dt, 0.1);
  const gdt = paused ? 0 : dt * timeScale;
  stepGame(gdt);
  world.frame(game, acc / STEP, gdt, innerWidth, innerHeight);
  const ms = performance.now() - c0;

  stats.frames++; stats.acc += dt; stats.msAcc += ms;
  if (stats.acc >= 0.5) {
    stats.fps = stats.frames / stats.acc; stats.ms = stats.msAcc / stats.frames;
    stats.frames = 0; stats.acc = 0; stats.msAcc = 0;
  }
  const p = game.player, info = renderer.info.render;
  $('stats').textContent =
    `FPS ${stats.fps.toFixed(0)}  кадр ${stats.ms.toFixed(1)} мс\n` +
    `draw calls ${info.calls}  треугольники ${(info.triangles / 1000).toFixed(1)}k\n` +
    `запекание ${bakeMs.toFixed(0)} мс  собак ${game.dogs.length}\n` +
    `стадия ${p.stage + 1}  xp ${p.xp.toFixed(0)}  R ${p.drawR.toFixed(1)}\n` +
    `скорость ${Math.hypot(p.vx, p.vy).toFixed(0)}  занос ${p.skid.toFixed(0)}  оглуш ${p.stun.toFixed(2)}`;
}

function resize() { world.resize(innerWidth, innerHeight); }
addEventListener('resize', resize);
resize();

let last = performance.now();
function loop(now) {
  if (!window.__hold) frame((now - last) / 1000);
  last = now;
  requestAnimationFrame(loop);
}

// --- UI ---------------------------------------------------------------------------------------
const pick = (box, attr, fn) => box.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  for (const o of box.querySelectorAll('button')) o.classList.toggle('on', o === b);
  fn(b.dataset[attr]);
});
pick($('modes'), 'mode', (m) => { mode = m; scriptT = 0; });
pick($('cams'), 'cam', (c) => { world.cam.mode = c; world.cam.view = 0; });
$('grow').addEventListener('input', (e) => { $('growV').textContent = e.target.value; });
$('dashB').onclick = () => { dashReq = true; };
$('stunB').onclick = () => {
  const p = game.player;
  p.stun = p.stunMax = SH.stunSec; p.immune = p.stun + SH.immuneSec;
  const a = Math.random() * Math.PI * 2; p.vx += Math.cos(a) * SH.power; p.vy += Math.sin(a) * SH.power;
};
$('pauseB').onclick = (e) => { paused = !paused; e.target.classList.toggle('on', paused); };
$('slowB').onclick = (e) => { timeScale = timeScale === 1 ? 0.25 : 1; e.target.classList.toggle('on', timeScale !== 1); };
$('stressB').onclick = (e) => {
  if (stress) startSolo(); else startStress();
  e.target.classList.toggle('on', stress);
  e.target.textContent = stress ? 'Одна собака' : '9 собак (гонка)';
};

// Lineup (?lineup): one standing dog per stage, side by side, for silhouette checks.
const lineup = [];
if (location.search.includes('lineup')) {
  CONFIG.stages.forEach((st, i) => {
    const d = { x: 0, y: 0, vx: 0, vy: 0, dirX: 1, dirY: 0, mag: 0, xp: st.xp, stage: i, drawR: st.r, r: st.r,
      stun: 0, stunMax: 0, immune: 0, skid: 0, dashT: 0, finished: 0, isPlayer: false };
    lineup.push({ d, v: new DogVisual(assets, scene, false) });
  });
}
function drawLineup(t, view = 'side') {
  // Portrait: stages 1, 4, 6 at one size, turned 3/4 towards the camera, like the concept sheet.
  if (view === 'portrait') for (const [i, { d, v }] of lineup.entries()) {
    v.root.visible = [0, 3, 5].includes(i);
    d.r = v.root.visible ? 30 : 0; d.drawR = 30; d.mag = 0.2; d.dirX = 0.5; d.dirY = 0.87;
  }
  // &bg=plain is the concept comparison: one fixed pose every time (standing, mouth open, eyes
  // open, the same head turn), so two captures differ only by the model.
  const plain = location.search.includes('bg=plain');
  if (plain) { t = 1.3; for (const [i, { d, v }] of lineup.entries()) { d.mag = 0; v.seed = 2 + i * 0.37; v.blinkT = 99; v.blink = 0; v.still = 0; v.yaw = Math.atan2(-0.87, 0.5); v.yawRate = 0; } }
  let x = 0;
  for (const { d, v } of lineup) { x += d.r * 1.6; d.x = x; d.y = 0; x += d.r * 1.6; }
  for (const { d, v } of lineup) v.update(d, d.x, d.y, 1 / 60, t);
  const cx = x / 2, w = x * 1.05, aspect = innerWidth / innerHeight;
  const pitch = (view === 'game' ? 52 : view === 'front' ? 10 : view === 'portrait' ? 28 : 6) * Math.PI / 180;
  camera.position.set(cx, 40 + Math.sin(pitch) * 1500, Math.cos(pitch) * 1500);
  camera.lookAt(cx, 40, 0);
  camera.userData.target = { x: cx, z: 0 };
  camera.left = -w / 2; camera.right = w / 2; camera.top = w / 2 / aspect; camera.bottom = -w / 2 / aspect;
  camera.updateProjectionMatrix();
  world.syncView();
  meadow.ground.visible = true; food.visible = false;
  // &bg=plain: only the dogs on the concept sheet's flat grey-green, for side-by-side reviews.
  if (plain) {
    const keep = new Set(lineup.map(({ v }) => v.root));
    for (const o of scene.children) if (!o.isLight && !keep.has(o)) o.visible = false;
    scene.background = new THREE.Color('#969b8a'); scene.fog = null;
  }
  renderer.render(scene, camera);
}

startSolo();
if (lineup.length) { for (const v of visuals.values()) v.root.visible = false; window.__lineup = drawLineup;
  const lv = new URLSearchParams(location.search).get('view') || 'side';
  const lloop = (now) => { drawLineup(now / 1000, lv); requestAnimationFrame(lloop); };
  requestAnimationFrame(lloop); }
else requestAnimationFrame(loop);
// Hooks for stepping without rAF (browser pane) and for measurements.
window.__p = { game, visuals, renderer, scene, camera, frame, assets, bakeMs, DogVisual, THREE,
  set mode(m) { mode = m; scriptT = 0; }, set cam(c) { world.cam.mode = c; world.cam.view = 0; },
  setGrowth: (xp) => { $('grow').value = xp; $('growV').textContent = xp; },
  // Foot contact check: stance paws' gap to the grass and slide per frame, in R.
  measure(n = 120) {
    const d = game.player, v = visuals.get(d), w = new THREE.Vector3();
    let slip = 0, lo = 9, hi = -9;
    const was = v.legs.map((L) => L.swing), prev = v.legs.map((L) => L.foot.clone());
    for (let i = 0; i < n; i++) {
      frame(1 / 60);
      v.legs.forEach((L, j) => {
        if (!L.swing && !was[j]) {
          L.paw.getWorldPosition(w);
          const g = (w.y - L.paw.scale.y * d.drawR) / d.drawR;
          lo = Math.min(lo, g); hi = Math.max(hi, g);
          slip = Math.max(slip, Math.hypot(L.foot.x - prev[j].x, L.foot.z - prev[j].z) / d.drawR);
        }
        prev[j].copy(L.foot); was[j] = L.swing;
      });
    }
    return { gapMin: +lo.toFixed(3), gapMax: +hi.toFixed(3), slip: +slip.toFixed(3), speed: Math.hypot(d.vx, d.vy) | 0 };
  } };
