// Toon meadow around the race field: painted ground (tone patches, path, pond), sparse low
// decor inside the field, fence on the world border, bushes and trees beyond it, 3D food.
// Decor is instanced; each frame only instances near the camera are copied into the buffers,
// so the GPU never sees the whole world.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/BufferGeometryUtils.js';
import { curls } from './dogModel.js';
import { toonMaterial, outlineMaterial } from './toon.js';

const TAU = Math.PI * 2;
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

// Deterministic random, so the map is the same every run.
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9 >>> 0; s ^= s >>> 13; return (s >>> 0) / 4294967296; };
}

// Smooth value noise for the ground tones.
function valueNoise(seed) {
  const r = rng(seed), N = 64, g = new Float32Array(N * N);
  for (let i = 0; i < g.length; i++) g[i] = r();
  const at = (i, j) => g[((j % N + N) % N) * N + ((i % N + N) % N)];
  return (x, y) => {
    const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * sx, b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * sx;
    return a + (b - a) * sy;
  };
}

// --- Layout ------------------------------------------------------------------------------------
// The field is [0, W] x [0, H]; the camera looks "north" (towards -z). Pond and large props are
// beyond the fence so no dog ever walks through them.
function layout(W, H) {
  const pond = { x: W + 230, z: -170, r: 190 };
  // Decorative path: a wobbly arc through the south-west corner (flat, walkable).
  const path = (x, z) => {
    const dx = x, dz = z - H, a = Math.atan2(-dz, dx);
    return Math.abs(Math.hypot(dx, dz) - (620 + 40 * Math.sin(a * 5 + 1))) ;
  };
  return { pond, path, pathHalf: 20 };
}

// --- Ground ------------------------------------------------------------------------------------
const MARGIN = 900; // painted ground beyond the field

function groundMaps(W, H, L) {
  const S = 512, x0 = -MARGIN, span = Math.max(W, H) + MARGIN * 2;
  const data = new Uint8Array(S * S * 4), n1 = valueNoise(7), n2 = valueNoise(19);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const x = x0 + (i + 0.5) / S * span, z = x0 + (j + 0.5) / S * span;
    const tone = 0.65 * n1(x / 190, z / 190) + 0.35 * n2(x / 70, z / 70);
    const pathD = L.path(x, z), pondD = Math.hypot(x - L.pond.x, (z - L.pond.z) * 1.25) - L.pond.r;
    const k = (j * S + i) * 4;
    data[k] = tone * 255;
    data[k + 1] = Math.min(255, pathD / 60 * 255);
    data[k + 2] = Math.min(255, Math.max(0, pondD + 60) / 120 * 255);
    data[k + 3] = 255;
  }
  const map = new THREE.DataTexture(data, S, S);
  map.magFilter = map.minFilter = THREE.LinearFilter;
  map.needsUpdate = true;

  // Fine grass strokes, neutral grey = no change.
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), r = rng(3);
  g.fillStyle = 'rgb(128,128,128)'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 160; i++) {
    g.fillStyle = r() < 0.55 ? 'rgba(70,70,70,.35)' : 'rgba(210,210,210,.35)';
    const px = r() * 256, py = r() * 256, a = r() - 0.5;
    for (const [ox, oy] of [[0, 0], [256, 0], [-256, 0], [0, 256], [0, -256]]) {
      g.beginPath(); g.ellipse(px + ox, py + oy, 1.3, 4.5, a, 0, TAU); g.fill();
    }
  }
  const detail = new THREE.CanvasTexture(c);
  detail.wrapS = detail.wrapT = THREE.RepeatWrapping;
  detail.colorSpace = THREE.NoColorSpace;
  return { map, detail, x0, span };
}

function groundMaterial(W, H, M) {
  const col = (c) => new THREE.Color(c);
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: M.map }, uDetail: { value: M.detail }, uX0: { value: M.x0 }, uSpan: { value: M.span },
      uField: { value: new THREE.Vector2(W, H) }, uTime: { value: 0 },
      cDark: { value: col('#78b044') }, cMid: { value: col('#82ba4b') }, cLight: { value: col('#8ec455') },
      cPath: { value: col('#dcb98a') }, cPathEdge: { value: col('#b99063') },
      cWater: { value: col('#5fb2d6') }, cWaterLight: { value: col('#93d3ec') }, cShore: { value: col('#4f8c35') },
    },
    vertexShader: `
      varying vec2 vW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `
      uniform sampler2D uMap, uDetail;
      uniform float uX0, uSpan, uTime;
      uniform vec2 uField;
      uniform vec3 cDark, cMid, cLight, cPath, cPathEdge, cWater, cWaterLight, cShore;
      varying vec2 vW;
      void main() {
        vec4 m = texture2D(uMap, (vW - uX0) / uSpan);
        float t = m.r;
        // Two crisp tone steps: big painted patches instead of a checker.
        vec3 c = mix(cDark, cMid, smoothstep(0.40, 0.42, t));
        c = mix(c, cLight, smoothstep(0.62, 0.64, t));
        c += (texture2D(uDetail, vW / 150.0).r - 0.5) * 0.12;
        // Beyond the fence: a touch darker and cooler, so the field reads as the stage.
        vec2 out2 = max(-vW, vW - uField);
        float outside = smoothstep(0.0, 40.0, max(out2.x, out2.y));
        c = mix(c, c * vec3(0.84, 0.9, 0.92), outside);
        // Path with a darker rim.
        float p = m.g * 60.0;
        c = mix(c, cPathEdge, 1.0 - smoothstep(22.0, 24.0, p));
        c = mix(c, cPath, 1.0 - smoothstep(18.0, 20.0, p));
        // Pond: grass rim, water, light ripples.
        float d = m.b * 120.0 - 60.0;
        c = mix(c, cShore, 1.0 - smoothstep(6.0, 8.0, d));
        vec3 water = cWater;
        float rip = sin(vW.x * 0.05 + uTime * 0.8) * sin(vW.y * 0.06 - uTime * 0.6);
        water = mix(water, cWaterLight, smoothstep(0.55, 0.6, rip) * 0.6);
        water = mix(water, cWaterLight, smoothstep(-16.0, -4.0, d) * 0.5); // shallow rim
        c = mix(c, water, 1.0 - smoothstep(-1.0, 1.0, d));
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

// --- Decor geometry ----------------------------------------------------------------------------
function colored(g, r, gr, b) {
  const n = g.attributes.position.count, c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { c[i * 3] = r; c[i * 3 + 1] = gr; c[i * 3 + 2] = b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
function strip(g) { // non-indexed, only position/normal/color, so geometries merge cleanly
  g = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
  return g;
}

// Tuft: a few curved blades fanning out, base darker than the tips. y in [0, 1].
function tuftGeometry() {
  const parts = [];
  const blades = [[-0.5, 0.75, -0.35], [-0.15, 1, -0.1], [0.2, 0.9, 0.15], [0.5, 0.65, 0.4]];
  for (const [x, h, lean] of blades) {
    const g = new THREE.BufferGeometry();
    const w = 0.22;
    const pos = [x - w, 0, 0, x + w, 0, 0, x + lean * 0.6, h, 0];
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute([0.85, 0.85, 0.85, 0.85, 0.85, 0.85, 1.25, 1.25, 1.25], 3));
    g.computeVertexNormals();
    for (const a of [0, Math.PI / 2]) { const c = g.clone(); c.rotateY(a + x); parts.push(c); }
  }
  return mergeGeometries(parts);
}

// Flower: five round petals around a yellow middle, facing up; petals take the instance colour.
function flowerGeometry() {
  const parts = [];
  for (let i = 0; i < 5; i++) {
    const p = new THREE.CircleGeometry(0.42, 7);
    p.rotateX(-Math.PI / 2); p.translate(Math.cos(i / 5 * TAU) * 0.5, 0, Math.sin(i / 5 * TAU) * 0.5);
    parts.push(strip(colored(p, 1, 1, 1)));
  }
  const mid = new THREE.CircleGeometry(0.32, 8); mid.rotateX(-Math.PI / 2); mid.translate(0, 0.04, 0);
  parts.push(strip(colored(mid, 1, 0.78, 0.2)));
  // Two leaves under the bloom.
  for (const a of [0.6, 3.6]) {
    const l = new THREE.CircleGeometry(0.4, 6); l.scale(1.6, 0.7, 1); l.rotateX(-Math.PI / 2);
    l.translate(0.75, -0.12, 0); l.rotateY(a);
    parts.push(strip(colored(l, 0.42, 0.68, 0.3)));
  }
  const g = mergeGeometries(parts); g.translate(0, 0.25, 0);
  return g;
}

// Lumpy blob for stones, bushes and tree crowns (radius ~1).
function blobGeometry(detail, freq, amp, seed) {
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g);
  const pos = g.attributes.position, n = pos.count, v = new THREE.Vector3(), c = new Float32Array(n * 3);
  const od = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const b = curls(v.x * freq + seed, v.y * freq, v.z * freq);
    v.toArray(od, i * 3);
    const k = 1 + amp * (b - 0.5);
    pos.setXYZ(i, v.x * k, v.y * k, v.z * k);
    const sh = (0.75 + 0.25 * smooth(0.02, 0.45, b)) * (0.85 + 0.15 * smooth(-0.6, 0.6, v.y));
    c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = sh;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.setAttribute('outlineDir', new THREE.BufferAttribute(od, 3));
  g.computeVertexNormals();
  return g;
}

// Mushroom: red cap with white dots on a cream stem. Origin at the stem foot, height ~1.
function mushroomGeometry() {
  const cap = new THREE.SphereGeometry(0.55, 14, 7, 0, TAU, 0, Math.PI / 2);
  cap.scale(1, 0.75, 1); cap.translate(0, 0.55, 0);
  const pos = cap.attributes.position, n = pos.count, c = new Float32Array(n * 3), v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i);
    const dot = curls(v.x * 5 + 3, v.y * 5, v.z * 5) > 0.82 && v.y > 0.62;
    if (dot) { c[i * 3] = 1; c[i * 3 + 1] = 0.97; c[i * 3 + 2] = 0.9; } else { c[i * 3] = 0.86; c[i * 3 + 1] = 0.3; c[i * 3 + 2] = 0.24; }
  }
  cap.setAttribute('color', new THREE.BufferAttribute(c, 3));
  const under = new THREE.CircleGeometry(0.55, 14); under.rotateX(Math.PI / 2); under.translate(0, 0.55, 0);
  const stem = new THREE.CylinderGeometry(0.17, 0.22, 0.6, 9, 1, true); stem.translate(0, 0.28, 0);
  return mergeGeometries([strip(cap), strip(colored(under, 0.93, 0.85, 0.7)), strip(colored(stem, 1, 0.95, 0.85))]);
}

// Fence along the field border: posts and two rails, merged. outlineDir = direction from each
// piece's own centre, so the hull of a box stays closed.
function fenceGeometry(W, H) {
  const parts = [], step = 70, postH = 34;
  const add = (g, cx, cy, cz) => {
    g = strip(g);
    const pos = g.attributes.position, od = new Float32Array(pos.count * 3), v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).sub(new THREE.Vector3(cx, cy, cz)).normalize().toArray(od, i * 3);
    }
    g.setAttribute('outlineDir', new THREE.BufferAttribute(od, 3));
    const sh = new Float32Array(pos.count * 3).fill(1);
    g.setAttribute('color', new THREE.BufferAttribute(sh, 3));
    parts.push(g);
  };
  const side = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.round(len / step), a = Math.atan2(z1 - z0, x1 - x0);
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      const px = x0 + (x1 - x0) * t0, pz = z0 + (z1 - z0) * t0;
      const post = new THREE.BoxGeometry(9, postH, 9); post.translate(px, postH / 2, pz); add(post, px, postH / 2, pz);
      for (const y of [postH * 0.45, postH * 0.82]) {
        const mx = x0 + (x1 - x0) * (t0 + t1) / 2, mz = z0 + (z1 - z0) * (t0 + t1) / 2;
        const rail = new THREE.BoxGeometry(len / n, 5, 4); rail.rotateY(-a); rail.translate(mx, y, mz); add(rail, mx, y, mz);
      }
    }
  };
  const o = 12; // just outside the field
  side(-o, -o, W + o, -o); side(W + o, -o, W + o, H + o); side(W + o, H + o, -o, H + o); side(-o, H + o, -o, -o);
  return mergeGeometries(parts);
}

// 3D food. Cookie: rounded disc with chocolate chips in its geometry. Bone: shaft + four knobs.
function cookieGeometry() {
  const pts = [[0, -0.2], [0.9, -0.2], [1, -0.1], [1, 0.06], [0.9, 0.18], [0.5, 0.24], [0, 0.25]].map(([x, y]) => new THREE.Vector2(x, y));
  const disc = strip(colored(new THREE.LatheGeometry(pts, 14), 1, 1, 1));
  const parts = [disc], r = rng(11);
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * TAU + r() * 0.6, d = i === 4 ? 0 : 0.55;
    const chip = new THREE.SphereGeometry(0.17, 5, 3); chip.scale(1, 0.55, 1);
    chip.translate(i === 4 ? 0.05 : Math.cos(a) * d, 0.24, i === 4 ? -0.08 : Math.sin(a) * d);
    parts.push(strip(colored(chip, 0.32, 0.18, 0.12)));
  }
  const g = mergeGeometries(parts); g.translate(0, 0.2, 0);
  return g;
}
function boneGeometry() {
  const parts = [strip(colored(new THREE.CylinderGeometry(0.22, 0.22, 1.3, 10).rotateZ(Math.PI / 2), 1, 1, 1))];
  for (const x of [-0.68, 0.68]) for (const z of [-0.2, 0.2]) {
    const k = new THREE.SphereGeometry(0.28, 10, 7); k.translate(x, 0, z); parts.push(strip(colored(k, 1, 1, 1)));
  }
  const g = mergeGeometries(parts); g.translate(0, 0.28, 0);
  return g;
}

// --- Instanced scatter with camera culling ----------------------------------------------------
class Scatter {
  constructor(scene, geo, mat, items, lineMat = null) {
    this.items = items; // [{x, z, m: Matrix4, c: Color, r: reach}]
    this.mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, items.length));
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (items.some((it) => it.c)) this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(items.length * 3 || 3), 3);
    scene.add(this.mesh);
    if (lineMat) {
      this.line = new THREE.InstancedMesh(geo, lineMat, Math.max(1, items.length));
      this.line.instanceMatrix = this.mesh.instanceMatrix;
      this.line.frustumCulled = false;
      scene.add(this.line);
    }
    this.mesh.count = 0;
    if (this.line) this.line.count = 0;
  }
  cull(x0, z0, x1, z1) {
    let n = 0;
    for (const it of this.items) {
      if (it.x + it.r < x0 || it.x - it.r > x1 || it.z + it.r < z0 || it.z - it.r > z1) continue;
      this.mesh.setMatrixAt(n, it.m);
      if (it.c) this.mesh.setColorAt(n, it.c);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    if (this.line) this.line.count = n;
  }
}

const tm = new THREE.Matrix4(), tq = new THREE.Quaternion(), tp = new THREE.Vector3(), ts = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
function place(x, y, z, yaw, sx, sy = sx, sz = sx) {
  tp.set(x, y, z); tq.setFromAxisAngle(UP, yaw); ts.set(sx, sy, sz);
  return new THREE.Matrix4().compose(tp, tq, ts);
}

// --- Meadow ------------------------------------------------------------------------------------
export function buildMeadow(scene, W, H) {
  const L = layout(W, H), r = rng(2024);
  const inField = (x, z, pad = 0) => x > pad && x < W - pad && z > pad && z < H - pad;
  const onPath = (x, z, pad) => L.path(x, z) < L.pathHalf + pad;
  const inPond = (x, z, pad) => Math.hypot(x - L.pond.x, (z - L.pond.z) * 1.25) < L.pond.r + pad;

  scene.background = new THREE.Color('#4f7f33');
  const lineMats = [], lineR = outlineMaterial(true), lineN = outlineMaterial(false);
  lineMats.push(lineR, lineN);

  // Ground.
  const GM = groundMaps(W, H, L);
  const groundMat = groundMaterial(W, H, GM);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(GM.span, GM.span), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.position.set(GM.x0 + GM.span / 2, 0, GM.x0 + GM.span / 2);
  ground.renderOrder = -2;
  scene.add(ground);

  // Tufts: sparse, so the play area stays calm (~10 per screen).
  const tuftMat = new THREE.MeshBasicMaterial({ color: '#ffffff', vertexColors: true, side: THREE.DoubleSide });
  const swayT = { value: 0 };
  tuftMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = swayT;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec2 ip = instanceMatrix[3].xz;
        transformed.x += sin(uTime * 1.7 + ip.x * 0.013 + ip.y * 0.021) * 0.18 * position.y * position.y;`);
  };
  const tufts = [], tuftCols = ['#6aa83c', '#76b343', '#5f9d36'];
  for (let i = 0; i < 420; i++) {
    const x = -300 + r() * (W + 600), z = -300 + r() * (H + 600);
    if (onPath(x, z, 8) || inPond(x, z, 10)) continue;
    const cl = 1 + Math.floor(r() * 3);
    for (let k = 0; k < cl; k++) {
      const px = x + (r() - 0.5) * 30, pz = z + (r() - 0.5) * 30, s = 10 + r() * 7;
      tufts.push({ x: px, z: pz, r: s, m: place(px, 0, pz, r() * TAU, s * 1.1, s, s * 1.1), c: new THREE.Color(tuftCols[Math.floor(r() * 3)]) });
    }
  }
  const tuftS = new Scatter(scene, tuftGeometry(), tuftMat, tufts);

  // Flowers: small groups, pastel so cookies stay the brightest thing.
  const flowerMat = new THREE.MeshBasicMaterial({ color: '#ffffff', vertexColors: true });
  const flowers = [], flowerCols = ['#ffffff', '#ffd6e4', '#ffe6a8', '#e7dcff'];
  for (let i = 0; i < 150; i++) {
    const x = -250 + r() * (W + 500), z = -250 + r() * (H + 500);
    if (onPath(x, z, 14) || inPond(x, z, 20)) continue;
    const col = new THREE.Color(flowerCols[Math.floor(r() * flowerCols.length)]), n = 3 + Math.floor(r() * 4);
    for (let k = 0; k < n; k++) {
      const px = x + (r() - 0.5) * 50, pz = z + (r() - 0.5) * 40, s = 4 + r() * 1.8;
      flowers.push({ x: px, z: pz, r: s, m: place(px, 0, pz, r() * TAU, s), c: col });
    }
  }
  const flowerS = new Scatter(scene, flowerGeometry(), flowerMat, flowers);

  // Stones and mushrooms: mostly along the fence and beyond it.
  const stoneMat = toonMaterial('#ffffff'); stoneMat.vertexColors = true;
  const stones = [], edgeSpot = (spread) => {
    const t = r() * 4, u = r(), d = (r() - 0.35) * spread;
    if (t < 1) return [u * W, -d]; if (t < 2) return [W + d, u * H]; if (t < 3) return [u * W, H + d]; return [-d, u * H];
  };
  for (let i = 0; i < 90; i++) {
    const [x, z] = edgeSpot(260);
    if (inPond(x, z, 20) || onPath(x, z, 14)) continue;
    const s = 8 + r() * 14, g = 0.62 + r() * 0.1;
    stones.push({ x, z, r: s * 1.3, m: place(x, s * 0.2, z, r() * TAU, s * (1 + r() * 0.4), s * 0.6, s), c: new THREE.Color(g, g, g * 0.96) });
  }
  for (let i = 0; i < 14; i++) { // a few pebbles inside the field
    const x = 100 + r() * (W - 200), z = 100 + r() * (H - 200);
    if (onPath(x, z, 14)) continue;
    const s = 5 + r() * 4, g = 0.66 + r() * 0.08;
    stones.push({ x, z, r: s, m: place(x, s * 0.2, z, r() * TAU, s * 1.2, s * 0.55, s), c: new THREE.Color(g, g, g * 0.96) });
  }
  const stoneS = new Scatter(scene, blobGeometry(1, 1.6, 0.25, 4), stoneMat, stones, lineR);

  const mushMat = toonMaterial('#ffffff'); mushMat.vertexColors = true;
  const mush = [];
  for (let i = 0; i < 40; i++) {
    const [x, z] = edgeSpot(200);
    if (inPond(x, z, 20) || onPath(x, z, 14)) continue;
    const n = 1 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) {
      const px = x + (r() - 0.5) * 26, pz = z + (r() - 0.5) * 26, s = 9 + r() * 6;
      mush.push({ x: px, z: pz, r: s, m: place(px, 0, pz, r() * TAU, s) });
    }
  }
  const mushS = new Scatter(scene, mushroomGeometry(), mushMat, mush, lineN);

  // Fence: one merged mesh + its hull.
  const fenceMat = toonMaterial('#b07a45'); fenceMat.vertexColors = true;
  const fenceGeo = fenceGeometry(W, H);
  const fence = new THREE.Mesh(fenceGeo, fenceMat); scene.add(fence);
  const fenceLine = new THREE.Mesh(fenceGeo, lineR); scene.add(fenceLine);

  // Bushes hugging the fence from outside, trees further out (cooler, to recede).
  const bushMat = toonMaterial('#ffffff'); bushMat.vertexColors = true;
  const bushes = [], bushCols = ['#5f9e3c', '#6aa944', '#558f36'];
  const ring = (dist, count, fn) => {
    const per = 2 * (W + H);
    for (let i = 0; i < count; i++) {
      const u = (i + r() * 0.6) / count * per, d = dist + r() * 60;
      let x, z;
      if (u < W) { x = u; z = -d; } else if (u < W + H) { x = W + d; z = u - W; }
      else if (u < 2 * W + H) { x = 2 * W + H - u; z = H + d; } else { x = -d; z = per - u; }
      if (inPond(x, z, 40)) continue;
      fn(x, z);
    }
  };
  ring(45, 130, (x, z) => {
    const s = 26 + r() * 22;
    bushes.push({ x, z, r: s * 1.3, m: place(x, s * 0.45, z, r() * TAU, s * 1.25, s * 0.9, s * 1.1), c: new THREE.Color(bushCols[Math.floor(r() * 3)]) });
  });
  const bushS = new Scatter(scene, blobGeometry(3, 2.2, 0.3, 8), bushMat, bushes, lineR);

  const trees = [], trunks = [], crownCols = ['#5c9a44', '#53903f', '#64a24a'];
  ring(150, 70, (x, z) => {
    if (z > H) z += 90; // south trees stand further out: they lean into the view
    const s = 50 + r() * 26, h = s * 1.1;
    trees.push({ x, z, r: s * 1.3, m: place(x, h + s * 0.55, z, r() * TAU, s, s * 0.9, s), c: new THREE.Color(crownCols[Math.floor(r() * 3)]) });
    trunks.push({ x, z, r: s, m: place(x, h * 0.5 + s * 0.2, z, 0, s * 0.18, h + s * 0.4, s * 0.18) });
  });
  const crownS = new Scatter(scene, blobGeometry(3, 1.5, 0.24, 13), bushMat, trees, lineR);
  const trunkS = new Scatter(scene, new THREE.CylinderGeometry(0.6, 0.85, 1, 8, 1, true), toonMaterial('#8a5a35'), trunks);

  const scatters = [tuftS, flowerS, stoneS, mushS, bushS, crownS, trunkS];
  let lastCull = null;

  return {
    lineMats: [...lineMats],
    ground,
    // View: camera centre on the ground and half extents (world units).
    update(t, cx, cz, hx, hz) {
      swayT.value = t; groundMat.uniforms.uTime.value = t;
      // Re-cull when the camera has moved a bit; margin covers the gap.
      const key = `${Math.round(cx / 40)},${Math.round(cz / 40)},${Math.round(hx / 40)},${Math.round(hz / 40)}`;
      if (key === lastCull) return;
      lastCull = key;
      const m = 120, tall = 260; // trees stand up into the view from the south
      for (const s of scatters) s.cull(cx - hx - m, cz - hz - m, cx + hx + m, cz + hz + m + tall);
    },
    setRes(res, px) { for (const m of lineMats) { m.uniforms.uRes.value.copy(res); m.uniforms.uPx.value = px; } },
  };
}

// --- Food --------------------------------------------------------------------------------------
export function buildFood(scene, max) {
  const lineN = outlineMaterial(false);
  const mk = (geo, color) => {
    const mat = toonMaterial(color); mat.vertexColors = true;
    const mesh = new THREE.InstancedMesh(geo, mat, max);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3).fill(1), 3);
    mesh.frustumCulled = false;
    const line = new THREE.InstancedMesh(geo, lineN, max);
    line.instanceMatrix = mesh.instanceMatrix; line.frustumCulled = false;
    scene.add(mesh, line);
    return { mesh, line, n: 0 };
  };
  const cookies = mk(cookieGeometry(), '#ffffff'), bones = mk(boneGeometry(), '#f7f0e0');
  const COL = { basic: new THREE.Color('#e6a95e'), choco: new THREE.Color('#9a5a34') };
  return {
    lineMats: [lineN],
    begin() { cookies.n = bones.n = 0; },
    add(type, m) {
      const b = type === 'bone' ? bones : cookies;
      b.mesh.setMatrixAt(b.n, m);
      if (b === cookies) b.mesh.setColorAt(b.n, COL[type] ?? COL.basic);
      b.n++;
    },
    end() {
      for (const b of [cookies, bones]) {
        b.mesh.count = b.line.count = b.n;
        b.mesh.instanceMatrix.needsUpdate = true;
        b.mesh.instanceColor.needsUpdate = true;
      }
    },
    set visible(v) { for (const b of [cookies, bones]) b.mesh.visible = b.line.visible = v; },
  };
}
