// 3D maltipoo prototype: the real Game drives one dog (or the whole race), DogVisual draws it.
import * as THREE from 'three';
import { CONFIG } from '../src/config.js';
import { Game, stageOf } from '../src/game.js';
import { Input } from '../src/input.js';
import { buildDogAssets } from './dogModel.js';
import { DogVisual } from './dogVisual.js';
import { buildMeadow, buildFood } from './meadow.js';
import { FX } from './fx.js';

const { world: W, dog: D, camera: CAM, shove: SH, food: F } = CONFIG;
const $ = (id) => document.getElementById(id);
const canvas = $('c');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(1.5, devicePixelRatio));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.info.autoReset = false;

const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight('#fff6e6', '#7a9a50', 2.3));
const sun = new THREE.DirectionalLight('#fff0d0', 2.0);
sun.position.set(-0.5, 1, 0.7);
scene.add(sun);

// Toon meadow (ground, decor, fence, trees) and 3D food.
const meadow = buildMeadow(scene, W.w, W.h);
const MAX_FOOD = F.count + 64;
const food = buildFood(scene, MAX_FOOD);
const fx = DogVisual.fx = new FX(scene);
const easeOutBack = (x) => 1 + 2.70158 * (x - 1) ** 3 + 1.70158 * (x - 1) ** 2;
const fm = new THREE.Matrix4(), fq = new THREE.Quaternion(), fp = new THREE.Vector3(), fs = new THREE.Vector3(), FY = new THREE.Vector3(0, 1, 0);

const t0 = performance.now();
const assets = buildDogAssets();
const bakeMs = performance.now() - t0;

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 5000);
let camMode = 'game', camView = 0, camX = W.w / 2, camZ = W.h / 2;

const game = new Game({});
const input = new Input(canvas, $('dash'));
input.enabled = true;
let mode = 'manual', paused = false, timeScale = 1, stress = false;
const visuals = new Map();

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
function syncVisuals() {
  for (const [d, v] of visuals) if (!game.dogs.includes(d)) { v.dispose(); visuals.delete(d); }
  for (const d of game.dogs) if (!visuals.has(d)) visuals.set(d, new DogVisual(assets, scene, d.isPlayer));
}

function setGrowth(xp) {
  const p = game.player;
  p.xp = xp; p.stage = stageOf(xp); p.finished = 0;
}

// Scripted input for repeatable checks.
let scriptT = 0;
function playerInput(dt) {
  scriptT += dt;
  if (mode === 'manual') return input.read(innerWidth, innerHeight);
  if (mode === 'idle') return { dirX: 0, dirY: 0, mag: 0, dash: false };
  if (mode === 'circle') { const a = scriptT * 0.9; return { dirX: Math.cos(a), dirY: Math.sin(a), mag: 1, dash: false }; }
  // zigzag: hard 140° turns every 1.1 s, makes the dog skid
  const a = Math.floor(scriptT / 1.1) % 2 ? 0.35 : Math.PI - 0.35;
  return { dirX: Math.cos(a), dirY: Math.sin(a), mag: 1, dash: false };
}

let dashReq = false;
const STEP = 1 / 60;
let acc = 0, time = 0;
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

function syncView() {
  // Outline width needs the drawing-buffer size and the camera's px per world unit.
  const V = DogVisual.view;
  renderer.getDrawingBufferSize(V.res);
  V.pxPerUnit = V.res.y / (camera.top - camera.bottom);
  V.dpr = renderer.getPixelRatio();
  const px = V.dpr * 1.5;
  meadow.setRes(V.res, px);
  for (const m of food.lineMats) { m.uniforms.uRes.value.copy(V.res); m.uniforms.uPx.value = px; }
  const hx = (camera.right - camera.left) / 2, hz = (camera.top - camera.bottom) / 2 / Math.sin(52 * Math.PI / 180);
  const c = camera.userData.target ?? { x: W.w / 2, z: W.h / 2 };
  meadow.update(time, c.x, c.z, hx, hz);
}

function updateCamera(dt) {
  const p = game.player, vw = innerWidth, vh = innerHeight, aspect = vw / vh;
  const v = visuals.get(p);
  camX += (p.x - camX) * (1 - Math.exp(-CAM.follow * dt));
  camZ += (p.y - camZ) * (1 - Math.exp(-CAM.follow * dt));
  let view = CAM.viewAtBase * Math.pow(p.drawR / D.baseRadius, CAM.zoomExp) / (vw > vh ? CAM.landscapeZoom : 1);
  let pitch = 52 * Math.PI / 180, az = 0;
  if (camMode === 'close') { view = p.drawR * 3.6; pitch = 25 * Math.PI / 180; az = v ? v.yaw + Math.PI / 2 - 0.7 : 0; }
  if (camMode === 'side') { view = p.drawR * 4.2; pitch = 4 * Math.PI / 180; az = v ? v.yaw : 0; }
  camView = camView ? camView + (view - camView) * (1 - Math.exp(-3 * dt)) : view;
  const tx = camMode === 'game' ? camX : p.x, tz = camMode === 'game' ? camZ : p.y;
  const ty = camMode === 'game' ? 0 : p.drawR * 0.9;
  const dist = 1500;
  // az = 0 looks "north" (towards -z), like the 2D screen.
  camera.position.set(tx + Math.sin(az) * Math.cos(pitch) * dist, ty + Math.sin(pitch) * dist, tz + Math.cos(az) * Math.cos(pitch) * dist);
  camera.lookAt(tx, ty, tz);
  camera.userData.target = { x: tx, z: tz };
  const short = camView / 2;
  if (aspect >= 1) { camera.top = short; camera.bottom = -short; camera.left = -short * aspect; camera.right = short * aspect; }
  else { camera.left = -short; camera.right = short; camera.top = short / aspect; camera.bottom = -short / aspect; }
  camera.near = 1; camera.far = 4000;
  camera.updateProjectionMatrix();
  syncView();
}

function updateFood(dt) {
  food.begin();
  // Only food near the camera goes to the GPU.
  const c = camera.userData.target ?? { x: 0, z: 0 }, hx = (camera.right - camera.left) / 2 + 40;
  const hz = (camera.top - camera.bottom) / 2 / Math.sin(52 * Math.PI / 180) + 40;
  let i = 0;
  for (const f of game.food) {
    f.pop += dt;
    if (Math.abs(f.x - c.x) > hx || Math.abs(f.y - c.z) > hz) continue;
    if (i++ >= MAX_FOOD) break;
    const k = f.pop <= 0 ? 0 : f.pop >= 0.35 ? 1 : easeOutBack(f.pop / 0.35);
    const id = f.type?.id ?? 'basic', r = (f.type?.r ?? 8) * food.size(id, f.rot) * Math.max(0, k);
    fp.set(f.x, 0, f.y); fq.setFromAxisAngle(FY, f.rot); fs.set(r, r, r);
    food.add(id, f.rot, fm.compose(fp, fq, fs));
  }
  food.end();
}

const stats = { fps: 0, ms: 0, frames: 0, acc: 0, msAcc: 0 };
function frame(dt) {
  const c0 = performance.now();
  dt = Math.min(dt, 0.1);
  const gdt = paused ? 0 : dt * timeScale;
  time += gdt;
  stepGame(gdt);
  syncVisuals();
  const alpha = acc / STEP;
  for (const d of game.dogs) {
    const x = d.px + (d.x - d.px) * alpha, y = d.py + (d.y - d.py) * alpha;
    visuals.get(d).update(d, x, y, Math.max(gdt, 1e-6), time);
  }
  updateFood(gdt);
  updateCamera(dt);
  fx.update(gdt, camera);
  renderer.info.reset();
  renderer.render(scene, camera);
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

function resize() { renderer.setSize(innerWidth, innerHeight, false); }
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
pick($('cams'), 'cam', (c) => { camMode = c; camView = 0; });
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
  syncView();
  meadow.ground.visible = true; food.visible = false;
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
  set mode(m) { mode = m; scriptT = 0; }, set cam(c) { camMode = c; camView = 0; },
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
