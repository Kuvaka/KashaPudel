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
import { LOCK_UNIFORMS } from './toon.js';

const { world: W, dog: D, camera: CAM, food: F } = CONFIG;
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
    for (const m of this.food.lineMats) { m.uniforms.uRes.value.copy(V.res); m.uniforms.uPx.value = px; }
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
    this.syncVisuals(game);
    for (const d of game.dogs) {
      const x = d.px + (d.x - d.px) * alpha, y = d.py + (d.y - d.py) * alpha;
      this.visuals.get(d).update(d, x, y, Math.max(dt, 1e-6), this.time);
    }
    this.updateFood(game, dt);
    this.updateCamera(game.player, dt, vw, vh);
    this.fx.update(dt, this.camera);
    this.renderer.info.reset();
    this.renderer.render(this.scene, this.camera);
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

  draw(game, alpha, dt, stick, hud = true) {
    this.world.frame(game, alpha, dt, this.vw, this.vh);
    const { ctx } = this, cam = this.world.camera;
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
