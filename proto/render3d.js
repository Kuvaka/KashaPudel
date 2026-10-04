// 3D view of the race. World3D draws the meadow, food and dogs with WebGL; Renderer3D wraps it
// in the same interface as the 2D Renderer (src/render.js), so the real game (src/main.js, ?3d)
// can switch renderers. The game's own canvas stays on top as a transparent 2D overlay for what
// is flat anyway: names, floating text, sparks, the minimap and the stick.
import * as THREE from 'three';
import { CONFIG } from '../src/config.js';
import { Renderer as Renderer2D } from '../src/render.js';
import { buildDogAssets } from './dogModel.js';
import { DogVisual } from './dogVisual.js';
import { buildMeadow, buildFood } from './meadow.js';
import { FX } from './fx.js';
import { buildHazards } from './hazards.js';
import { buildSeasonFx } from './seasonFx.js';
import { LOCK_UNIFORMS } from './toon.js';

const { world: W, dog: D, camera: CAM, food: F, stages: STAGES } = CONFIG;
const PITCH = 52 * Math.PI / 180;
const easeOutBack = (x) => 1 + 2.70158 * (x - 1) ** 3 + 1.70158 * (x - 1) ** 2;
const fm = new THREE.Matrix4(), fq = new THREE.Quaternion(), fp = new THREE.Vector3(), fs = new THREE.Vector3();
const FY = new THREE.Vector3(0, 1, 0);

export class World3D {
  constructor(canvas) {
    const renderer = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(1.5, devicePixelRatio));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.info.autoReset = false;

    const scene = this.scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#fff6e6', '#7a9a50', 2.3));
    const sun = new THREE.DirectionalLight('#fff0d0', 2.0);
    sun.position.set(-0.5, 1, 0.7);
    scene.add(sun);

    // Toon meadow (ground, decor, fence, trees) and 3D food.
    this.meadow = buildMeadow(scene, W.w, W.h);
    this.maxFood = F.count + 64;
    this.food = buildFood(scene, this.maxFood);
    this.fx = DogVisual.fx = new FX(scene);
    this.hazards = buildHazards(scene);
    this.seasonFx = buildSeasonFx(scene, 'summer');
    this.dogsAt = [];

    const t0 = performance.now();
    this.assets = buildDogAssets();
    this.bakeMs = performance.now() - t0;

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 5000);
    // mode: 'game' (52° follow cam), 'close' and 'side' (prototype checks).
    this.cam = { mode: 'game', view: 0, x: W.w / 2, z: W.h / 2 };
    this.visuals = new Map();
    this.time = 0;
  }

  resize(vw, vh) { this.renderer.setSize(vw, vh, false); }

  // Season of the map: the meadow is rebuilt (a fraction of a second), only when it changes.
  setSeason(id) {
    if (this.meadow.season === id) return;
    this.meadow.dispose();
    this.meadow = buildMeadow(this.scene, W.w, W.h, id);
    this.seasonFx.dispose();
    this.seasonFx = buildSeasonFx(this.scene, id);
    this.syncView();
  }

  syncVisuals(game) {
    for (const [d, v] of this.visuals) if (!game.dogs.includes(d)) { v.dispose(); this.visuals.delete(d); }
    for (const d of game.dogs) if (!this.visuals.has(d)) this.visuals.set(d, new DogVisual(this.assets, this.scene, d.isPlayer));
  }

  viewFor(r, vw, vh) { return CAM.viewAtBase * Math.pow(r / D.baseRadius, CAM.zoomExp) / (vw > vh ? CAM.landscapeZoom : 1); }

  snapCamera(p, vw, vh) { this.cam.x = p.x; this.cam.z = p.y; this.cam.view = this.viewFor(p.drawR, vw, vh); }

  updateCamera(p, dt, vw, vh) {
    const { camera, cam } = this, aspect = vw / vh, v = this.visuals.get(p);
    cam.x += (p.x - cam.x) * (1 - Math.exp(-CAM.follow * dt));
    cam.z += (p.y - cam.z) * (1 - Math.exp(-CAM.follow * dt));
    let view = this.viewFor(p.drawR, vw, vh), pitch = PITCH, az = 0;
    if (cam.mode === 'close') { view = p.drawR * 3.6; pitch = 25 * Math.PI / 180; az = v ? v.yaw + Math.PI / 2 - 0.7 : 0; }
    if (cam.mode === 'side') { view = p.drawR * 4.2; pitch = 4 * Math.PI / 180; az = v ? v.yaw : 0; }
    cam.view = cam.view ? cam.view + (view - cam.view) * (1 - Math.exp(-3 * dt)) : view;
    const game = cam.mode === 'game';
    const tx = game ? cam.x : p.x, tz = game ? cam.z : p.y, ty = game ? 0 : p.drawR * 0.9;
    const dist = 1500;
    // az = 0 looks "north" (towards -z), like the 2D screen.
    camera.position.set(tx + Math.sin(az) * Math.cos(pitch) * dist, ty + Math.sin(pitch) * dist, tz + Math.cos(az) * Math.cos(pitch) * dist);
    camera.lookAt(tx, ty, tz);
    camera.userData.target = { x: tx, z: tz };
    const short = cam.view / 2;
    if (aspect >= 1) { camera.top = short; camera.bottom = -short; camera.left = -short * aspect; camera.right = short * aspect; }
    else { camera.left = -short; camera.right = short; camera.top = short / aspect; camera.bottom = -short / aspect; }
    camera.near = 1; camera.far = 4000;
    camera.updateProjectionMatrix();
    this.syncView();
  }

  syncView() {
    // Outline width needs the drawing-buffer size and the camera's px per world unit.
    const { camera } = this, V = DogVisual.view;
    this.renderer.getDrawingBufferSize(V.res);
    V.pxPerUnit = V.res.y / (camera.top - camera.bottom);
    V.dpr = this.renderer.getPixelRatio();
    LOCK_UNIFORMS.uHalfWidthPx.value = 0.8 * V.dpr; // 1.6 CSS px ink arcs in the fur
    const px = V.dpr * 1.5;
    this.meadow.setRes(V.res, px);
    for (const m of [...this.food.lineMats, ...this.hazards.lineMats]) { m.uniforms.uRes.value.copy(V.res); m.uniforms.uPx.value = px; }
    const hx = (camera.right - camera.left) / 2, hz = (camera.top - camera.bottom) / 2 / Math.sin(PITCH);
    const c = camera.userData.target ?? { x: W.w / 2, z: W.h / 2 };
    this.meadow.update(this.time, c.x, c.z, hx, hz);
  }

  updateFood(game, dt) {
    const { food, camera } = this;
    food.begin();
    // Only food near the camera goes to the GPU.
    const c = camera.userData.target ?? { x: 0, z: 0 }, hx = (camera.right - camera.left) / 2 + 40;
    const hz = (camera.top - camera.bottom) / 2 / Math.sin(PITCH) + 40;
    let i = 0;
    for (const f of game.food) {
      f.pop += dt;
      if (Math.abs(f.x - c.x) > hx || Math.abs(f.y - c.z) > hz) continue;
      if (i++ >= this.maxFood) break;
      const k = f.pop <= 0 ? 0 : f.pop >= 0.35 ? 1 : easeOutBack(f.pop / 0.35);
      const id = f.type?.id ?? 'basic', r = (f.type?.r ?? 8) * food.size(id, f.rot) * Math.max(0, k);
      fp.set(f.x, 0, f.y); fq.setFromAxisAngle(FY, f.rot); fs.set(r, r, r);
      food.add(id, f.rot, fm.compose(fp, fq, fs));
    }
    food.end();
  }

  // One frame: dogs at the interpolated positions (alpha between sim steps), food, camera.
  frame(game, alpha, dt, vw, vh) {
    this.time += dt;
    if (this.studio?.active) { this.studio.frame(dt, vw, vh); return; }
    this.syncVisuals(game);
    const at = this.dogsAt; at.length = 0;
    for (const d of game.dogs) {
      const x = d.px + (d.x - d.px) * alpha, y = d.py + (d.y - d.py) * alpha;
      this.visuals.get(d).update(d, x, y, Math.max(dt, 1e-6), this.time);
      at.push([d, x, y]);
    }
    this.updateFood(game, dt);
    this.hazards.update(game, this.time, dt);
    this.updateCamera(game.player, dt, vw, vh);
    const { camera } = this, c = camera.userData.target;
    this.seasonFx.update(game, dt, this.time, c.x, c.z, (camera.right - camera.left) / 2,
      (camera.top - camera.bottom) / 2 / Math.sin(PITCH), DogVisual.view.pxPerUnit, at);
    this.fx.update(dt, this.camera, DogVisual.view.pxPerUnit);
    this.renderer.info.reset();
    this.renderer.render(this.scene, this.camera);
  }
}

const STUDIO_SEASON = {
  summer: ['#cfeab4', '#8fcf62', '#9fd873'],
  autumn: ['#f1e0b8', '#c9a24e', '#d8b765'],
  winter: ['#e2edf7', '#f4f8fc', '#e9f0f8'],
  spring: ['#d9f0cc', '#9edb78', '#b1e38c'],
};
const STUDIO_GAME = { dogs: [], obstacles: [] };

// Fitting room: one dog on a little lawn, its own scene and camera in the same WebGL context.
// Not part of the race: a stand-in dog object drives the same DogVisual, the game is frozen.
// rect: the CSS-px box the dog should fill (the part of the screen above the wardrobe panel).
export class Studio {
  constructor(world) {
    this.world = world;
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color('#cfeab4');
    scene.add(new THREE.HemisphereLight('#fff6e6', '#7a9a50', 2.3));
    const sun = new THREE.DirectionalLight('#fff0d0', 2.0);
    sun.position.set(-0.5, 1, 0.7);
    scene.add(sun);
    this.lawnCanvas = document.createElement('canvas'); this.lawnCanvas.width = this.lawnCanvas.height = 128;
    const tex = this.lawnTex = new THREE.CanvasTexture(this.lawnCanvas); tex.colorSpace = THREE.SRGBColorSpace;
    this.lawn = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    this.lawn.rotation.x = -Math.PI / 2; this.lawn.renderOrder = -2;
    scene.add(this.lawn);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 5000);
    this.dog = { stage: 0, xp: 0, drawR: STAGES[0].r, vx: 0, vy: 0, dirX: 0, dirY: 0, mag: 0,
      dashT: 0, stun: 0, stunMax: 0, immune: 0, skid: 0, finished: 0 };
    this.visual = new DogVisual(world.assets, scene, false);
    this.fx = new FX(scene); // its own dash effects, so trails can be tried on
    this.active = false;
    this.yaw = 0;          // dog heading; dragging turns it
    this.run = false;      // trot in place to see clothes move
    this.rect = { x: 0, y: 0, w: 1, h: 1 };
    this.time = 0;
    this.setSeason('summer');
  }

  // The fitting room takes the colours (and the weather) of the chosen map.
  setSeason(id) {
    if (this.season === id) return;
    this.season = id;
    const [bg, c0, c1] = STUDIO_SEASON[id] ?? STUDIO_SEASON.summer;
    this.scene.background = new THREE.Color(bg);
    const g = this.lawnCanvas.getContext('2d'), grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    const b = new THREE.Color(bg);
    grad.addColorStop(0, c0); grad.addColorStop(0.7, c1); grad.addColorStop(1, `rgba(${b.r * 255 | 0},${b.g * 255 | 0},${b.b * 255 | 0},0)`);
    g.clearRect(0, 0, 128, 128); g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
    this.lawnTex.needsUpdate = true;
    this.weather?.dispose();
    this.weather = buildSeasonFx(this.scene, id, { weatherOnly: true });
  }

  setStage(st) {
    const d = this.dog;
    d.stage = st; d.xp = STAGES[st].xp; d.drawR = STAGES[st].r;
  }

  frame(dt, vw, vh) {
    this.time += dt;
    const d = this.dog, v = this.visual, s = d.drawR;
    // Running: trot in place and dash every couple of seconds (to show off trails).
    if (this.run) { this.dashClock = ((this.dashClock ?? 0) + dt) % 2.2; d.dashT = this.dashClock < 0.45 ? 0.45 - this.dashClock : 0; }
    else d.dashT = 0;
    const sp = this.run ? D.baseSpeed * Math.pow(s / D.baseRadius, D.speedExp) * (d.dashT ? 1.6 : 0.8) : 0;
    d.vx = Math.cos(this.yaw) * sp; d.vy = -Math.sin(this.yaw) * sp;
    if (!this.run) { v.yaw = this.yaw; v.yawRate = 0; }
    const fx = DogVisual.fx; DogVisual.fx = this.fx; // effects go to the studio scene
    v.update(d, 0, 0, Math.max(dt, 1e-6), this.time);
    DogVisual.fx = fx;
    this.fx.drift(-d.vx * dt, -d.vy * dt);
    this.lawn.scale.setScalar(s * 2.6);

    // 3/4 view from the front-left, slightly above; the dog centred in rect.
    const r = this.rect, cam = this.camera, az = Math.PI / 2 - 0.7, pitch = 16 * Math.PI / 180, ty = s * 1.0;
    cam.position.set(Math.sin(az) * Math.cos(pitch) * 1500, ty + Math.sin(pitch) * 1500, Math.cos(az) * Math.cos(pitch) * 1500);
    cam.lookAt(0, ty, 0);
    const H = s * 3.3 * vh / Math.max(1, r.h), Wd = H * vw / vh;
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    cam.left = -cx / vw * Wd; cam.right = cam.left + Wd;
    cam.top = cy / vh * H; cam.bottom = cam.top - H;
    cam.updateProjectionMatrix();

    const V = DogVisual.view, R = this.world.renderer;
    R.getDrawingBufferSize(V.res);
    V.pxPerUnit = V.res.y / H; V.dpr = R.getPixelRatio();
    LOCK_UNIFORMS.uHalfWidthPx.value = 0.8 * V.dpr;
    this.fx.update(dt, cam, V.pxPerUnit);
    this.weather.top = s * 3.4; this.weather.margin = s * 0.5;
    this.weather.update(STUDIO_GAME, dt, this.time, 0, 0, s * 2.5, s * 1.5, V.pxPerUnit * 0.5, []);
    R.info.reset();
    R.render(this.scene, cam);
  }
}

// Drop-in for the 2D Renderer: main.js calls the same methods.
export class Renderer3D {
  constructor(overlay) {
    const gl = document.createElement('canvas');
    gl.id = 'game3d';
    gl.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;height:100dvh;display:block;pointer-events:none';
    overlay.before(gl);
    overlay.style.background = 'transparent';
    this.world = new World3D(gl);
    this.canvas = overlay;
    this.ctx = overlay.getContext('2d');
    this.particles = [];
    this.texts = [];
    this.v = new THREE.Vector3();
    this.resize();
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, CONFIG.maxDpr);
    this.vw = window.innerWidth; this.vh = window.innerHeight;
    this.canvas.width = Math.round(this.vw * this.dpr);
    this.canvas.height = Math.round(this.vh * this.dpr);
    this.world.resize(this.vw, this.vh);
  }

  snapCamera(p) { this.world.snapCamera(p, this.vw, this.vh); }
  setSeason(id) { this.world.setSeason(id); }
  splash(d, pud, boost) { this.world.fx.splash(new THREE.Vector3(d.x, 0, d.y), d.r, boost, d.vx, d.vy); }
  // A dog ran into a drift (snow puff) or mud (brown drops); leaf piles burst in seasonFx.
  bump(d, o, v) {
    const C = { drift: ['#ffffff', '#e3eefa'], mud: ['#6b4a2a', '#8d6a43'] }[o.kind];
    if (C) this.world.fx.splash(new THREE.Vector3(o.kind === 'drift' ? o.x : d.x, 0, o.kind === 'drift' ? o.y : d.y), o.kind === 'drift' ? o.r * 0.8 : d.r, true, d.vx, d.vy, C);
  }

  // Stick or keys point on the screen; the ground is foreshortened by the 52° pitch.
  screenDirToWorld(x, y) {
    const wy = y / Math.sin(PITCH), l = Math.hypot(x, wy);
    return l > 1e-6 ? [x / l, wy / l] : [0, 0];
  }

  burst(x, y, color, n = 6, speed = 120) { Renderer2D.prototype.burst.call(this, x, y, color, n, speed); }
  floatText(x, y, text, color = '#fff', size = 20) { this.texts.push({ x, y, h: 0, text, color, size, life: 1, max: 1 }); }

  // World point (x on the ground, height h, y = world z) to CSS px.
  toScreen(x, h, y) {
    const v = this.v.set(x, h, y).project(this.world.camera);
    return [(v.x + 1) / 2 * this.vw, (1 - v.y) / 2 * this.vh];
  }

  // The fitting room (created on first use) takes over the WebGL canvas while open.
  get studio() { return this.world.studio ??= new Studio(this.world); }

  draw(game, alpha, dt, stick, hud = true) {
    this.world.frame(game, alpha, dt, this.vw, this.vh);
    const { ctx } = this, cam = this.world.camera;
    if (this.world.studio?.active) {
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      return;
    }
    const ppu = this.vh / (cam.top - cam.bottom); // CSS px per world unit
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.vw, this.vh);

    // Names over the heads.
    ctx.textAlign = 'center'; ctx.lineJoin = 'round';
    for (const d of game.dogs) {
      const x = d.px + (d.x - d.px) * alpha, y = d.py + (d.y - d.py) * alpha;
      const [sx, sy] = this.toScreen(x, d.drawR * (d.stun > 0 ? 3.4 : 2.9), y);
      if (sx < -80 || sx > this.vw + 80 || sy < -40 || sy > this.vh + 40) continue;
      const size = Math.max(13, d.drawR * 0.42 * ppu);
      ctx.font = `800 ${size}px system-ui, sans-serif`;
      ctx.lineWidth = size * 0.25; ctx.strokeStyle = 'rgba(40,25,15,0.85)';
      ctx.strokeText(d.name, sx, sy);
      ctx.fillStyle = d.isPlayer ? '#ffe45c' : '#ffffff';
      ctx.fillText(d.name, sx, sy);
    }

    // Sparks a little above the grass, floating text rising from the spot.
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const q = this.particles[i];
      q.life -= dt;
      if (q.life <= 0) { this.particles.splice(i, 1); continue; }
      q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= Math.pow(0.92, dt * 60); q.vy *= Math.pow(0.92, dt * 60);
      const [sx, sy] = this.toScreen(q.x, 12, q.y);
      ctx.globalAlpha = q.life / q.max;
      ctx.fillStyle = q.color;
      ctx.beginPath(); ctx.arc(sx, sy, q.size * ppu, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const q = this.texts[i];
      q.life -= dt;
      if (q.life <= 0) { this.texts.splice(i, 1); continue; }
      q.h += 40 * dt;
      const [sx, sy] = this.toScreen(q.x, 30 + q.h, q.y);
      const size = q.size * ppu;
      ctx.globalAlpha = Math.min(1, q.life / q.max * 2);
      ctx.font = `900 ${size}px system-ui, sans-serif`;
      ctx.lineWidth = size * 0.22; ctx.strokeStyle = '#3a2618';
      ctx.strokeText(q.text, sx, sy); ctx.fillStyle = q.color; ctx.fillText(q.text, sx, sy);
    }
    ctx.globalAlpha = 1;

    if (hud) Renderer2D.prototype.drawMinimap.call(this, game);
    if (stick) Renderer2D.prototype.drawStick.call(this, stick);
  }
}
