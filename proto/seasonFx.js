// Season effects on top of the meadow: weather falling around the camera (snow, leaves, petals),
// paw prints in the snow, and autumn leaf piles that burst when a dog runs into them. The piles
// are game obstacles (game.obstacles); the rules live in game.js, everything here is looks.
import * as THREE from 'three';
import { TRAIL_CELL, trailTex, trailMaterial } from './fx.js';
import { CONFIG } from '../src/config.js';

const { world: W } = CONFIG;
const TAU = Math.PI * 2;

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9 >>> 0; s ^= s >>> 13; return (s >>> 0) / 4294967296; };
}

// Weather looks per season: atlas cell, tints, size (world units), fall speed, sway, spin.
const WEATHER = {
  winter: { n: 170, cell: TRAIL_CELL.snow, cols: ['#a9c4e6', '#bcd3ee', '#97b6df'], size: [10, 16], fall: [35, 60], sway: 14, spin: 0.6 },
  autumn: { n: 46, cell: TRAIL_CELL.leaves, cols: ['#f08a3a', '#e45d2f', '#f2b544', '#c9782d'], size: [13, 18], fall: [40, 65], sway: 38, spin: 3 },
  spring: { n: 46, cell: TRAIL_CELL.petals, cols: ['#ffffff', '#fff2f7'], size: [9, 13], fall: [30, 50], sway: 30, spin: 2.5 },
};
const LEAF_COLS = ['#f08a3a', '#e45d2f', '#f2b544', '#d9472b', '#c9782d', '#e9a03b'];

// One Points batch on the shared atlas; particles are simulated here.
class Particles {
  constructor(scene, N) {
    const geo = new THREE.BufferGeometry();
    for (const [k, n] of [['position', 3], ['aSize', 1], ['aCell', 1], ['aAlpha', 1], ['aRot', 1], ['aColor', 3]]) {
      geo.setAttribute(k, new THREE.BufferAttribute(new Float32Array(N * n), n).setUsage(THREE.DynamicDrawUsage));
    }
    geo.setDrawRange(0, 0);
    this.pts = new THREE.Points(geo, trailMaterial(trailTex()));
    this.pts.frustumCulled = false; this.pts.renderOrder = 7;
    scene.add(this.pts);
    this.n = 0;
  }
  begin() { this.n = 0; }
  push(x, y, z, size, cell, alpha, rot, c) {
    const A = this.pts.geometry.attributes, i = this.n++;
    A.position.setXYZ(i, x, y, z); A.aSize.setX(i, size); A.aCell.setX(i, cell); A.aAlpha.setX(i, alpha);
    A.aRot.setX(i, rot); A.aColor.setXYZ(i, c.r, c.g, c.b);
  }
  end(px) {
    const g = this.pts.geometry;
    if (this.n) for (const a of Object.values(g.attributes)) a.needsUpdate = true;
    g.setDrawRange(0, this.n);
    this.pts.material.uniforms.uPx.value = px;
  }
  dispose() { this.pts.removeFromParent(); this.pts.geometry.dispose(); this.pts.material.dispose(); }
}

// Paw print: a pad and four toes, drawn white (the material tints it).
function pawTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#fff';
  x.beginPath(); x.ellipse(32, 40, 13, 11, 0, 0, TAU); x.fill();
  for (const [a, b, r] of [[16, 22, 6], [26, 14, 6.5], [38, 14, 6.5], [48, 22, 6]]) { x.beginPath(); x.ellipse(a, b, r * 0.9, r * 1.1, 0, 0, TAU); x.fill(); }
  const t = new THREE.CanvasTexture(c);
  return t;
}

class PawPrints {
  constructor(scene, N = 900, life = 10) {
    this.N = N; this.life = life; this.i = 0;
    const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
    this.born = new THREE.InstancedBufferAttribute(new Float32Array(N).fill(-1e9), 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aBorn', this.born);
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uMap: { value: pawTexture() }, uTime: { value: 0 }, uLife: { value: life }, uColor: { value: new THREE.Color('#7f9cc4') } },
      vertexShader: `
        attribute float aBorn; uniform float uTime, uLife; varying vec2 vUv; varying float vA;
        void main() {
          vUv = uv;
          float age = uTime - aBorn;
          vA = age < 0.0 ? 0.0 : 1.0 - smoothstep(uLife * 0.5, uLife, age);
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform sampler2D uMap; uniform vec3 uColor; varying vec2 vUv; varying float vA;
        void main() {
          float a = texture2D(uMap, vUv).a * vA * 0.6;
          if (a < 0.01) discard;
          gl_FragColor = vec4(uColor, a);
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, N);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = -1;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const m = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < N; i++) this.mesh.setMatrixAt(i, m);
    scene.add(this.mesh);
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.p = new THREE.Vector3(); this.s = new THREE.Vector3();
    this.dogs = new WeakMap();
  }
  // A print every ~half a body length, left and right in turn.
  track(d, x, y, t) {
    let st = this.dogs.get(d);
    if (!st) { st = { x, y, side: 1 }; this.dogs.set(d, st); }
    const dx = x - st.x, dy = y - st.y, dist = Math.hypot(dx, dy), stride = d.drawR * 0.5;
    if (dist > stride * 4) { st.x = x; st.y = y; return; } // teleport (new race)
    if (dist < stride || d.stun > 0) return;
    const ux = dx / dist, uy = dy / dist;
    st.x = x; st.y = y; st.side = -st.side;
    const off = d.drawR * 0.24 * st.side, size = d.drawR * 0.62;
    this.p.set(x - uy * off, 0.45, y + ux * off);
    this.q.setFromAxisAngle(UPV, Math.atan2(ux, uy) + Math.PI);
    this.s.set(size, 1, size);
    const i = this.i++ % this.N;
    this.mesh.setMatrixAt(i, this.m.compose(this.p, this.q, this.s));
    this.born.setX(i, t);
    this.dirty = true;
  }
  update(t) {
    this.mat.uniforms.uTime.value = t;
    if (this.dirty) { this.mesh.instanceMatrix.needsUpdate = true; this.born.needsUpdate = true; this.dirty = false; }
  }
  dispose() { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.mat.dispose(); this.mat.uniforms.uMap.value.dispose(); }
}
const UPV = new THREE.Vector3(0, 1, 0);

// Leaf pile: a low dome of litter covered with leaves in autumn colours (vertex colours), radius ~1.
function pileGeometry() {
  const r = rng(5), pos = [], col = [];
  const c = new THREE.Color(), H = 0.42, R0 = 0.9;
  const tri = (a, b, d, cc) => { pos.push(...a, ...b, ...d); for (let k = 0; k < 3; k++) col.push(cc.r, cc.g, cc.b); };
  // A low dome of dark leaf litter underneath, so the pile reads as a soft heap, not loose shards.
  const base = new THREE.Color('#a8532a'), dome = (x, z) => H * Math.sqrt(Math.max(0, 1 - (x * x + z * z) / (R0 * R0)));
  const N = 18;
  for (let i = 0; i < N; i++) {
    const a0 = i / N * TAU, a1 = (i + 1) / N * TAU;
    for (const [k0, k1] of [[0, 0.55], [0.55, 1]]) {
      const p = (k, a) => { const x = Math.cos(a) * R0 * k, z = Math.sin(a) * R0 * k; return [x, dome(x, z) * 0.92, z]; };
      c.copy(base).multiplyScalar(0.8 + 0.3 * (1 - k1));
      tri(p(k0, a0), p(k1, a1), p(k1, a0), c);
      if (k0 > 0) tri(p(k0, a0), p(k0, a1), p(k1, a1), c);
    }
  }
  // Small round-ish leaves lying on the dome.
  for (let i = 0; i < 34; i++) {
    const a = r() * TAU, d = Math.sqrt(r()) * 0.82, cx = Math.cos(a) * d * R0, cz = Math.sin(a) * d * R0;
    const cy = dome(cx, cz) + 0.02 + r() * 0.03;
    const rot = r() * TAU, L = 0.17 + r() * 0.08, Wd = L * 0.62, tilt = (r() - 0.5) * 0.4;
    c.set(LEAF_COLS[Math.floor(r() * LEAF_COLS.length)]).multiplyScalar(0.9 + 0.2 * (cy / H));
    const pt = (u, v) => {
      const x = Math.cos(rot) * u - Math.sin(rot) * v, z = Math.sin(rot) * u + Math.cos(rot) * v;
      return [cx + x, cy + u * tilt, cz + z];
    };
    // A six-point leaf: tip, two shoulders, stem end, two hips.
    const q = [pt(L, 0), pt(L * 0.35, Wd), pt(-L * 0.45, Wd * 0.8), pt(-L, 0), pt(-L * 0.45, -Wd * 0.8), pt(L * 0.35, -Wd)];
    for (let k = 1; k < 5; k++) tri(q[0], q[k], q[k + 1], c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

// Leaf piles are game obstacles (game.obstacles, kind 'leaves'): a dog running into one
// scatters it (burst), it comes back with a little grow when the game says so.
class LeafPiles {
  constructor(scene) {
    this.mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
    this.mesh = new THREE.InstancedMesh(pileGeometry(), this.mat, 64);
    this.mesh.frustumCulled = false; this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.vis = new WeakMap(); // obstacle -> shown size 0..1
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.p = new THREE.Vector3(); this.s = new THREE.Vector3();
  }
  update(game, dt, burst) {
    let n = 0;
    for (const o of game.obstacles ?? []) {
      if (o.kind !== 'leaves') continue;
      let k = this.vis.get(o) ?? 1;
      if (o.gone > 0) { if (k > 0) burst(o); k = 0; } else k = Math.min(1, k + dt);
      this.vis.set(o, k);
      if (k <= 0 || n >= 64) continue;
      const e = k * k * (3 - 2 * k);
      this.p.set(o.x, 0.3, o.y); this.q.setFromAxisAngle(UPV, o.rot); this.s.set(o.r * e, o.r * e * e, o.r * e);
      this.mesh.setMatrixAt(n++, this.m.compose(this.p, this.q, this.s));
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  dispose() { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.mat.dispose(); }
}

// weatherOnly: just the falling weather (the wardrobe's fitting room).
export function buildSeasonFx(scene, season, { weatherOnly = false } = {}) {
  const look = WEATHER[season];
  const parts = look || season === 'autumn' ? new Particles(scene, (look?.n ?? 0) + 160) : null;
  const prints = season === 'winter' && !weatherOnly ? new PawPrints(scene) : null;
  const piles = season === 'autumn' && !weatherOnly ? new LeafPiles(scene) : null;
  const r = Math.random;
  const flakes = look ? Array.from({ length: look.n }, () => ({ x: 0, y: -1, z: 0, vy: 0, ph: r() * TAU, size: 0, rot: r() * TAU, vr: 0, c: new THREE.Color() })) : [];
  const bits = []; // leaves thrown out of a pile
  const tc = new THREE.Color();

  const respawn = (f, cx, cz, hx, hz, top) => {
    f.x = cx + (r() * 2 - 1) * hx; f.z = cz + (r() * 2 - 1) * hz; f.y = top ? api.top * (0.65 + r() * 0.35) : r() * api.top;
    f.vy = look.fall[0] + r() * (look.fall[1] - look.fall[0]);
    f.size = look.size[0] + r() * (look.size[1] - look.size[0]);
    f.vr = (r() - 0.5) * look.spin * 2;
    f.c.set(look.cols[Math.floor(r() * look.cols.length)]);
  };

  const burst = (P) => {
    for (let i = 0; i < 28 && bits.length < 160; i++) {
      const a = r() * TAU, s = 90 + r() * 150;
      bits.push({ x: P.x + Math.cos(a) * P.r * 0.4, y: 4, z: P.y + Math.sin(a) * P.r * 0.4,
        vx: Math.cos(a) * s, vy: 150 + r() * 160, vz: Math.sin(a) * s,
        t: 0, life: 1.2 + r() * 0.6, size: 14 + r() * 7, rot: r() * TAU, vr: (r() - 0.5) * 10,
        c: new THREE.Color(LEAF_COLS[Math.floor(r() * LEAF_COLS.length)]) });
    }
  };

  const api = {
    top: 400, margin: 320, // weather starts this high and this far outside the view (world units)
    season,
    // cx, cz, hx, hz: the camera's ground centre and half extents; px: screen px per unit.
    update(game, dt, t, cx, cz, hx, hz, px, dogsAt) {
      if (prints) {
        for (const [d, x, y] of dogsAt) if (!d.finished || Math.hypot(d.vx, d.vy) > 20) prints.track(d, x, y, t);
        prints.update(t);
      }
      if (piles) piles.update(game, dt, burst);
      if (!parts || !Number.isFinite(cx + cz + hx + hz + dt)) return;
      parts.begin();
      // Weather fills the view plus a margin; flakes that leave it come back on the other side.
      const mx = hx + api.margin * 0.25, mz = hz + api.margin;
      for (const f of flakes) {
        if (!(f.y >= 0) || !Number.isFinite(f.x + f.z)) respawn(f, cx, cz, mx, mz, f.size > 0);
        f.y -= f.vy * dt; f.ph += dt * 1.3; f.rot += f.vr * dt;
        f.x += Math.sin(f.ph) * look.sway * dt;
        if (f.x < cx - mx) f.x += 2 * mx; else if (f.x > cx + mx) f.x -= 2 * mx;
        if (f.z < cz - mz) f.z += 2 * mz; else if (f.z > cz + mz) f.z -= 2 * mz;
        const fade = Math.min(1, f.y / 30);
        parts.push(f.x, f.y, f.z, f.size, look.cell, fade, f.rot, f.c);
      }
      for (let i = bits.length - 1; i >= 0; i--) {
        const b = bits[i];
        b.t += dt;
        if (b.t >= b.life) { bits[i] = bits[bits.length - 1]; bits.pop(); continue; }
        b.vy = Math.max(b.vy - 360 * dt, -45); b.vx *= Math.exp(-1.6 * dt); b.vz *= Math.exp(-1.6 * dt); b.vx += Math.sin(b.t * 7 + b.rot) * 60 * dt;
        b.x += b.vx * dt; b.y = Math.max(2, b.y + b.vy * dt); b.z += b.vz * dt; b.rot += b.vr * dt;
        const k = b.t / b.life;
        parts.push(b.x, b.y, b.z, b.size, TRAIL_CELL.leaves, k < 0.7 ? 1 : (1 - k) / 0.3, b.rot, b.c);
      }
      parts.end(px);
    },
    dispose() { parts?.dispose(); prints?.dispose(); piles?.dispose(); },
  };
  return api;
}
