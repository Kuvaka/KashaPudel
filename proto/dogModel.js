// Procedural maltipoo geometry. Head and body are smooth SDF shapes (smooth-union of
// ellipsoids) projected onto a shared icosphere once at load: one topology for every stage,
// so evolution is just morphing between neighbouring stage profiles. Curls are baked as a
// radial bump keyed to the sphere direction, so they stay in place while the dog grows.
// All sizes are in units of the collision radius R; the dog group is scaled by drawR.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/BufferGeometryUtils.js';
import { HEAD_LOCKS, BODY_LOCKS, lockField } from './locks.js';

// Per-stage proportions, in units of the collision radius R. Chibi like the 2D sprites:
// the puppy grows into its legs and muzzle, but the head stays big.
export const PROFILES = [
  { hw: 1.3, bl: 1.34, bw: 0.98, sh: 0.56, mz: 0.13, ed: 0.52, leg: 0.21 },
  { hw: 1.29, bl: 1.37, bw: 0.98, sh: 0.6, mz: 0.14, ed: 0.55, leg: 0.205 },
  { hw: 1.28, bl: 1.4, bw: 0.97, sh: 0.64, mz: 0.15, ed: 0.58, leg: 0.2 },
  { hw: 1.27, bl: 1.43, bw: 0.99, sh: 0.68, mz: 0.15, ed: 0.6, leg: 0.195 },
  { hw: 1.26, bl: 1.46, bw: 1.02, sh: 0.72, mz: 0.16, ed: 0.62, leg: 0.195 },
  { hw: 1.26, bl: 1.49, bw: 1.07, sh: 0.75, mz: 0.16, ed: 0.64, leg: 0.2 },
];

// Where the right eye sits on the head (direction from the skull centre): forward, low and
// close to the snout, like a dog; wide-set high eyes read as a squirrel.
export const EYE_DIR = [0.86, 0.02, 0.38];

const clamp01 =(x) => Math.min(1, Math.max(0, x));
const smooth = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };

// --- SDF primitives -------------------------------------------------------------------------
function sdEllipsoid(p, c, a) {
  const x = (p.x - c[0]) / a[0], y = (p.y - c[1]) / a[1], z = (p.z - c[2]) / a[2];
  return (Math.hypot(x, y, z) - 1) * Math.min(a[0], a[1], a[2]);
}
function smin(a, b, k) {
  const h = clamp01(0.5 + 0.5 * (b - a) / k);
  return b + (a - b) * h - k * h * (1 - h);
}
function unionOf(parts, k) {
  return (p) => {
    let d = Infinity;
    for (const [c, a] of parts) {
      const e = sdEllipsoid(p, c, a);
      d = d === Infinity ? e : smin(d, e, k);
    }
    return d;
  };
}

// Head, origin at the skull center; +x is where the nose points.
function headSdf(P, brows = true) {
  const h = P.hw;
  return unionOf([
    [[0, 0, 0], [h * 0.46, h * 0.44, h * 0.5]],                              // skull
    [[-h * 0.06, h * 0.16, 0], [h * 0.4, h * 0.3, h * 0.44]],              // round crown, no top-knot
    [[h * 0.14, -h * 0.12, h * 0.22], [h * 0.26, h * 0.24, h * 0.24]],        // cheeks
    [[h * 0.14, -h * 0.12, -h * 0.22], [h * 0.26, h * 0.24, h * 0.24]],
    // Muzzle: a real snout block sticking out of the face (a dog, not a rodent), wide moustache
    // puffs on both sides of it and a soft chin.
    [[h * 0.4 + P.mz * 0.6, -h * 0.13, 0], [P.mz * 0.7 + h * 0.16, h * 0.17, h * 0.21]],
    [[h * 0.42 + P.mz * 0.4, -h * 0.2, h * 0.16], [P.mz * 0.5 + h * 0.13, h * 0.17, h * 0.18]],
    [[h * 0.42 + P.mz * 0.4, -h * 0.2, -h * 0.16], [P.mz * 0.5 + h * 0.13, h * 0.17, h * 0.18]],
    // Soft brow tufts, part of the head: the upper lid line framing each eye.
    ...(brows ? [[[h * 0.35, h * 0.21, h * 0.2], [h * 0.1, h * 0.05, h * 0.11]],
      [[h * 0.35, h * 0.21, -h * 0.2], [h * 0.1, h * 0.05, h * 0.11]]] : []),
  ], h * 0.12);
}

// Body, origin at the body center.
export function bodySdf(P) {
  const { bl, bw } = P;
  return unionOf([
    [[0, 0, 0], [bl * 0.5, bw * 0.42, bw * 0.46]],
    [[bl * 0.27, -bw * 0.02, 0], [bw * 0.47, bw * 0.47, bw * 0.47]],        // chest
    [[-bl * 0.29, bw * 0.02, 0], [bw * 0.44, bw * 0.43, bw * 0.44]],         // rump
  ], 0.18);
}

// Distance along dir from the origin to the SDF surface (origin must be inside).
export function rayToSurface(sdf, dir, maxT = 3) {
  const p = new THREE.Vector3();
  let lo = 0, hi = 0.02;
  while (hi < maxT) {
    p.copy(dir).multiplyScalar(hi);
    if (sdf(p) > 0) break;
    lo = hi; hi += 0.02;
  }
  for (let i = 0; i < 14; i++) {
    const m = (lo + hi) / 2;
    p.copy(dir).multiplyScalar(m);
    if (sdf(p) > 0) hi = m; else lo = m;
  }
  return (lo + hi) / 2;
}

// --- Curls: Worley cells, puffy lobes with narrow creases (F2 - F1) ------------------------
function hash(i, j, k, s) {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(k, 1274126177) ^ Math.imul(s, 461845907);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function curls(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  let f1 = 9, f2 = 9;
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
    const i = xi + a, j = yi + b, k = zi + c;
    const dx = i + hash(i, j, k, 1) - x, dy = j + hash(i, j, k, 2) - y, dz = k + hash(i, j, k, 3) - z;
    const q = dx * dx + dy * dy + dz * dz;
    if (q < f1) { f2 = f1; f1 = q; } else if (q < f2) f2 = q;
  }
  const e = Math.sqrt(f2) - Math.sqrt(f1); // 0 on the border between two curls
  return smooth(0, 0.6, e);                // rounded lobe: 1 in its middle, 0 in the crease
}

function sphereTopology(detail) {
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g);
  return g;
}

// Bakes one morphing part. shapeOf(P) -> sdf; fur(dir) -> {amp, shade} per direction.
function bakePart(detail, shapeOf, fur, curlFreq, locksDef = null, lockSet = 0) {
  const geo = sphereTopology(detail);
  const n = geo.attributes.position.count;
  const dirs = [];
  for (let i = 0; i < n; i++) dirs.push(new THREE.Vector3().fromBufferAttribute(geo.attributes.position, i).normalize());

  const bumps = dirs.map((d) => curls(d.x * curlFreq + 17, d.y * curlFreq, d.z * curlFreq));
  // Big locks: a dozen or two soft lobes that show in the silhouette, like the concept's tufts.
  const locks = dirs.map((d) => locksDef ? lockField(locksDef, d) : 1);
  const positions = [], normals = [];
  for (const P of PROFILES) {
    const sdf = shapeOf(P);
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const d = dirs[i], f = fur(d, P);
      const t = rayToSurface(sdf, d) + f.amp * (bumps[i] - 0.5) + (f.lock ?? 0) * (locks[i] - 0.5);
      arr[i * 3] = d.x * t; arr[i * 3 + 1] = d.y * t; arr[i * 3 + 2] = d.z * t;
    }
    const tmp = new THREE.BufferGeometry();
    tmp.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    tmp.setIndex(geo.index);
    tmp.computeVertexNormals();
    positions.push(new THREE.BufferAttribute(arr, 3));
    normals.push(tmp.attributes.normal);
  }

  // Vertex shade: darker in the creases between curl lobes. `patch`: light muzzle / chest.
  const col = new Float32Array(n * 3), patch = new Float32Array(n), lockInfo = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const d = dirs[i], f = fur(d, PROFILES[0]);
    const crease = locksDef ? 0.06 * (1 - smooth(0.02, 0.4, locks[i])) + 0.03 * (1 - smooth(0.02, 0.45, bumps[i]))
      : 0.07 * (1 - smooth(0.02, 0.45, bumps[i]));
    const c = (1 - crease * (f.crease ?? 1)) * f.shade;
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = c;
    patch[i] = f.patch ?? 0;
    lockInfo[i * 2] = lockSet; lockInfo[i * 2 + 1] = f.ink ?? 1; // which lock list; ink allowed here
  }

  geo.setAttribute('position', positions[0].clone());
  geo.setAttribute('normal', normals[0].clone());
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('furPatch', new THREE.BufferAttribute(patch, 1));
  geo.setAttribute('lockInfo', new THREE.BufferAttribute(lockInfo, 2));
  const od = new Float32Array(n * 3);
  dirs.forEach((d, i) => d.toArray(od, i * 3));
  geo.setAttribute('outlineDir', new THREE.BufferAttribute(od, 3));
  geo.morphAttributes.position = positions;
  geo.morphAttributes.normal = normals;
  geo.morphTargetsRelative = false;
  return geo;
}

// Fluffy unit leg segment: radius 0.5, y from -0.5 to 0.5, ends rounded off. Joints are covered
// by fluff balls, so the segment can be stretched along y.
function bakeLimb() {
  // Rounded "pill": a superellipse profile, so a stretched segment keeps soft ends, no flat caps.
  const pts = [];
  for (let i = 0; i <= 8; i++) {
    const y = -0.5 + i / 8;
    pts.push(new THREE.Vector2(0.5 * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(2 * y), 4)), 0.25) + 1e-3, y));
  }
  let g = new THREE.LatheGeometry(pts, 10);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g);
  const pos = g.attributes.position, n = pos.count, col = new Float32Array(n * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i);
    const b = curls(v.x * 4 + 3, v.y * 3, v.z * 4), k = 1 + 0.06 * (b - 0.45);
    pos.setXYZ(i, v.x * k, v.y, v.z * k);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0.9 + 0.1 * b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

// Static lobed part (ear, tail plume): an SDF projected radially from `center`, with curls.
function bakeBlob(sdf, center, detail, freq, amp) {
  const g = sphereTopology(detail);
  const pos = g.attributes.position, n = pos.count, col = new Float32Array(n * 3), od = new Float32Array(n * 3);
  const d = new THREE.Vector3(), c = new THREE.Vector3(...center);
  const local = (p) => sdf(p.clone().add(c));
  for (let i = 0; i < n; i++) {
    d.fromBufferAttribute(pos, i).normalize();
    const b = curls(d.x * freq + 9, d.y * freq, d.z * freq);
    const t = rayToSurface(local, d) * (1 + amp * (b - 0.5));
    pos.setXYZ(i, c.x + d.x * t, c.y + d.y * t, c.z + d.z * t);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0.93 + 0.07 * smooth(0.02, 0.45, b);
    d.toArray(od, i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('outlineDir', new THREE.BufferAttribute(od, 3));
  g.computeVertexNormals();
  return g;
}

// Floppy ear, hanging from the origin down to y ~ -1; flat in z; wavy lobes widening to the tip.
function earSdf() {
  // Six big curly clumps in pairs (root, middle, bottom), the bottom ones widest and thickest.
  return unionOf([
    [[0.05, -0.12, 0], [0.17, 0.16, 0.09]],
    [[-0.1, -0.2, 0], [0.16, 0.16, 0.09]],
    [[0.1, -0.44, 0.01], [0.18, 0.19, 0.13]],
    [[-0.11, -0.47, 0], [0.18, 0.19, 0.13]],
    [[0.12, -0.76, 0], [0.19, 0.2, 0.16]],
    [[-0.12, -0.79, 0.01], [0.18, 0.19, 0.16]],
  ], 0.06);
}

// Curled plume tail in its own frame (units ~R): base at the origin, a short riser straight up
// out of the rump, then a ~300° curl arching forward (+x) over the back and rolling inwards.
// Under a full turn, so the coil never covers itself and the hole stays open like the "@" in the
// concept art. A swept tube: fullest in the arch, tapering to a capped tip.
function bakeTailTube() {
  const SEG = 72, RAD = 16, CAP = 4;
  const RISE = 0.26, rho0 = 0.3, rho1 = 0.15, turn = 300 * Math.PI / 180, split = 0.2;
  const C = [rho0, RISE]; // curl centre: the riser top sits on its left, heading up
  const curve = (t) => {
    if (t < split) { // riser: leans a little back, then straight up into the curl
      const u = t / split;
      return new THREE.Vector3(-0.04 * Math.sin(Math.PI * u) ** 2, RISE * u, 0);
    }
    const u = (t - split) / (1 - split), th = Math.PI - turn * u, rho = rho0 + (rho1 - rho0) * smooth(0, 1, u);
    return new THREE.Vector3(C[0] + Math.cos(th) * rho, C[1] + Math.sin(th) * rho, 0.04 * Math.sin(Math.PI * u));
  };
  const radius = (t) => t < 0.35 ? 0.13 + 0.09 * smooth(0, 0.35, t) : 0.22 - 0.13 * smooth(0.35, 1, t);
  // Plume: big locks on the outside of the curl, a slimmer inner side keeps the hole open.
  const outward = (P) => P.y < RISE * 0.6 ? new THREE.Vector3(-1, 0, 0) : new THREE.Vector3(P.x - C[0], P.y - C[1], 0).normalize();
  const lockAt = (t) => Math.pow(Math.abs(Math.sin(Math.PI * t * 7)), 0.6) * (1 - 0.5 * t);
  const pos = [], col = [], od = [], idx = [];
  const Z = new THREE.Vector3(0, 0, 1), T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3();
  const v = new THREE.Vector3(), nrm = new THREE.Vector3();
  const ring = (P, r, t) => {
    const out = outward(P), lk = lockAt(t);
    for (let j = 0; j < RAD; j++) {
      const ph = j / RAD * Math.PI * 2;
      nrm.copy(N).multiplyScalar(Math.cos(ph)).addScaledVector(B, Math.sin(ph) * 1.2); // fuller across the curl plane
      v.copy(P).addScaledVector(nrm, r);
      const bmp = curls(v.x * 4 + 7, v.y * 4, v.z * 4), o = nrm.dot(out) / nrm.length();
      const side = o > 0 ? 1 + 0.45 * lk * Math.pow(o, 1.5) : 1 + 0.25 * o;
      v.copy(P).addScaledVector(nrm, r * side * (1 + 0.08 * (bmp - 0.5)));
      pos.push(v.x, v.y, v.z);
      const sh = 0.93 + 0.07 * smooth(0.02, 0.45, bmp);
      col.push(sh, sh, sh);
      od.push(v.x * 1.2 + nrm.x * 0.3, v.y * 1.2 + nrm.y * 0.3, v.z * 1.2 + nrm.z * 0.3); // curl-stroke coords
    }
  };
  const frame = (t) => {
    T.copy(curve(Math.min(1, t + 1e-3))).sub(curve(Math.max(0, t - 1e-3))).normalize();
    N.crossVectors(Z, T).normalize(); B.crossVectors(T, N);
  };
  for (let i = 0; i <= SEG; i++) { const t = i / SEG; frame(t); ring(curve(t), radius(t), t); }
  // Rounded tip: a few shrinking rings pushed along the tangent.
  frame(1);
  const tip = curve(1), rt = radius(1);
  for (let k = 1; k <= CAP; k++) {
    const a = k / CAP * Math.PI / 2;
    ring(tip.clone().addScaledVector(T, Math.sin(a) * rt), Math.max(1e-3, Math.cos(a) * rt), 1);
  }
  const rings = SEG + 1 + CAP;
  for (let i = 0; i < rings - 1; i++) for (let j = 0; j < RAD; j++) {
    const a = i * RAD + j, b = i * RAD + (j + 1) % RAD, c = a + RAD, d = b + RAD;
    idx.push(a, b, c, b, d, c);
  }
  // Closed ends: a fan to one vertex at the tip and one at the (hidden) root.
  const cap = (centre, first, flip) => {
    const k = pos.length / 3;
    pos.push(centre.x, centre.y, centre.z); col.push(0.93, 0.93, 0.93); od.push(centre.x * 1.2, centre.y * 1.2, centre.z * 1.2);
    for (let j = 0; j < RAD; j++) {
      const a = first + j, b = first + (j + 1) % RAD;
      flip ? idx.push(a, k, b) : idx.push(a, b, k);
    }
  };
  cap(tip.clone().addScaledVector(T, rt), (rings - 1) * RAD, false);
  frame(0);
  cap(curve(0).addScaledVector(T, -radius(0) * 0.5), 0, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('outlineDir', new THREE.Float32BufferAttribute(od, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.userData.radialOutline = false; // smooth tube: outline along the normal
  // Wardrobe mount for tail items: on top of the arch, the part of the curl always in view
  // (the real tip rolls inwards and hides in the plume).
  let top = 0;
  for (let i = 1; i <= 100; i++) if (curve(i / 100).y > curve(top / 100).y) top = i;
  g.userData.tip = curve(top / 100).add(new THREE.Vector3(0, radius(top / 100) * 1.25, 0));
  g.userData.tipDir = new THREE.Vector3(0, 1, 0);
  return g;
}

// Ball of curls (paws, knees), radius ~1.
function bakeFluffBall(detail, freq, amp) {
  const g = sphereTopology(detail);
  const pos = g.attributes.position, n = pos.count, col = new Float32Array(n * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const b = curls(v.x * freq + 5, v.y * freq, v.z * freq);
    v.multiplyScalar(1 + amp * (b - 0.45));
    pos.setXYZ(i, v.x, v.y, v.z);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0.8 + 0.2 * smooth(0.1, 0.6, b);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const od = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) v.fromBufferAttribute(pos, i).normalize().toArray(od, i * 3);
  g.setAttribute('outlineDir', new THREE.BufferAttribute(od, 3));
  return g;
}

function eyeTexture(dizzy) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  const disc = (r, col) => { x.fillStyle = col; x.beginPath(); x.arc(64, 64, r, 0, Math.PI * 2); x.fill(); };
  disc(63, '#4a2a18'); // outline ring, same brown as the body outline
  if (dizzy) {
    disc(55, '#fff');
    x.strokeStyle = '#3a2416'; x.lineWidth = 8; x.lineCap = 'round'; x.beginPath();
    for (let i = 0; i <= 80; i++) {
      const a = (i / 80) * Math.PI * 5, r = 3 + (i / 80) * 46;
      i ? x.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r) : x.moveTo(64, 64);
    }
    x.stroke();
  } else {
    // Concept-art eye: dark glossy brown, warmer at the bottom, big soft highlight up-left and
    // a small one down-right. Thin dark rim only.
    disc(62, '#24120a');
    const g = x.createRadialGradient(64, 96, 6, 64, 70, 60);
    g.addColorStop(0, '#9a5e34'); g.addColorStop(0.45, '#5a321c'); g.addColorStop(1, '#2a160c');
    x.fillStyle = g; x.beginPath(); x.arc(64, 64, 57, 0, Math.PI * 2); x.fill();
    x.fillStyle = 'rgba(20,8,3,0.55)'; x.beginPath(); x.arc(64, 60, 30, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#fff'; x.beginPath(); x.ellipse(46, 40, 15, 13, -0.5, 0, Math.PI * 2); x.fill();
    x.globalAlpha = 0.85; x.beginPath(); x.arc(84, 84, 7, 0, Math.PI * 2); x.fill();
    x.globalAlpha = 0.35; x.beginPath(); x.arc(30, 64, 4, 0, Math.PI * 2); x.fill();
    x.globalAlpha = 1;
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.center.set(0.5, 0.5);
  return t;
}

// Mouth decal under the nose: a wide open "D" with the corners turned up while running, a
// little "w" smile when calm. The tongue itself is a small 3D mesh.
// Canvas 128x96 covers MOUTH_W x MOUTH_H on the muzzle.
export const MOUTH_W = 0.5, MOUTH_H = 0.375; // x hw
function mouthTexture(open) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 96;
  const x = c.getContext('2d');
  x.lineCap = 'round'; x.lineJoin = 'round';
  x.strokeStyle = '#4a2a18';
  if (open) {
    x.beginPath(); x.moveTo(20, 22); x.quadraticCurveTo(42, 34, 64, 28); x.quadraticCurveTo(86, 34, 108, 22);
    x.bezierCurveTo(106, 66, 88, 82, 64, 82); x.bezierCurveTo(40, 82, 22, 66, 20, 22); x.closePath();
    x.fillStyle = '#5a2418'; x.fill();
    x.save(); x.clip();
    x.fillStyle = '#b8505e'; x.beginPath(); x.ellipse(64, 74, 30, 16, 0, 0, Math.PI * 2); x.fill();
    x.restore();
    x.lineWidth = 5; x.stroke();
    x.lineWidth = 6; x.beginPath(); x.moveTo(64, 6); x.lineTo(64, 28); x.stroke();
  } else {
    x.lineWidth = 7;
    x.beginPath(); x.moveTo(64, 8); x.lineTo(64, 30);
    x.moveTo(24, 24); x.quadraticCurveTo(44, 44, 64, 30); x.quadraticCurveTo(84, 44, 104, 24); x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Mouth patch that hugs the muzzle: a grid projected onto each stage's head surface along the
// mouth normal, a hair above it, morphing with the head. Head-local; centre = mouth anchor.
export const MOUTH_N = [1, 0.15, 0];
function bakeMouth() {
  const NX = 14, NY = 10;
  // U x V = n, so the front faces look out of the muzzle.
  const n = new THREE.Vector3(...MOUTH_N).normalize(), U = new THREE.Vector3(0, 0, -1);
  const V = new THREE.Vector3().crossVectors(n, U).normalize();
  const geo = new THREE.PlaneGeometry(1, 1, NX, NY);
  const uv = geo.attributes.position, count = uv.count;
  const targets = PROFILES.map((P) => {
    const sdf = headSdf(P), c = anchorsOf(P).mouth.clone().addScaledVector(V, P.hw * 0.03);
    const arr = new Float32Array(count * 3), p = new THREE.Vector3(), q = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      p.copy(c).addScaledVector(U, uv.getX(i) * MOUTH_W * P.hw).addScaledVector(V, uv.getY(i) * MOUTH_H * P.hw);
      // March in from outside along -n to the surface, then lift it a hair off.
      let t = -0.3 * P.hw, hit = false;
      for (let k = 0; k < 60 && !hit; k++, t += 0.01 * P.hw) { q.copy(p).addScaledVector(n, -t); if (sdf(q) < 0) hit = true; }
      if (hit) {
        let lo = t - 0.02 * P.hw, hi = t;
        for (let k = 0; k < 12; k++) { const m = (lo + hi) / 2; q.copy(p).addScaledVector(n, -m); if (sdf(q) < 0) hi = m; else lo = m; }
        p.addScaledVector(n, -lo + 0.005 * P.hw);
      }
      p.toArray(arr, i * 3);
    }
    return new THREE.BufferAttribute(arr, 3);
  });
  geo.setAttribute('position', targets[0].clone());
  geo.deleteAttribute('normal');
  geo.morphAttributes.position = targets;
  geo.morphTargetsRelative = false;
  return geo;
}

function sdfNormal(sdf, p, e = 1e-3) {
  const q = new THREE.Vector3(), d = (x, y, z) => sdf(q.set(p.x + x, p.y + y, p.z + z));
  return new THREE.Vector3(d(e, 0, 0) - d(-e, 0, 0), d(0, e, 0) - d(0, -e, 0), d(0, 0, e) - d(0, 0, -e)).normalize();
}

// Eye axis: halfway between the face normal and the radial direction, tipped up at most ~9°.
// The eye sits on the upper slope of the cheeks, where the pure normal looks ~45° up at the sky.
function eyeAxis(sdf, p) {
  const n = sdfNormal(sdf, p).add(p.clone().normalize()).normalize();
  n.y = Math.min(n.y, 0.15);
  return n.normalize();
}

// Per-profile anchor points used by the rig (root-local unless noted), blended like morphs.
export function anchorsOf(P) {
  const bodyY = P.sh + P.bw * 0.28;
  const head = new THREE.Vector3(P.bl * 0.5, bodyY + P.bw * 0.4 + P.hw * 0.14, 0);
  const sdf = headSdf(P), dir = new THREE.Vector3();
  const onHead = (x, y, z, out = 0) => { dir.set(x, y, z).normalize(); return dir.clone().multiplyScalar(rayToSurface(sdf, dir) + out); };
  return {
    bodyY,
    head,
    shoulder: [P.bl * 0.28, P.sh, P.bw * 0.27],     // z mirrored for left/right
    hip: [-P.bl * 0.3, P.sh * 0.98, P.bw * 0.27],
    tail: [-P.bl * 0.5, P.bw * 0.32],               // body-local x, y
    eye: onHead(EYE_DIR[0], EYE_DIR[1], EYE_DIR[2], 0), // head-local, right eye (z mirrored)
    nose: onHead(1, -0.17, 0, -0.01),
    mouth: onHead(1, -0.36, 0, 0.004),
    eyeN: eyeAxis(headSdf(P, false), onHead(EYE_DIR[0], EYE_DIR[1], EYE_DIR[2], 0)),
    ear: onHead(-0.05, 0.7, 0.72, -0.03).toArray(), // head-local attach high on the skull side
  };
}

// Built once and shared by every dog.
export function buildDogAssets() {
  const t0 = performance.now();
  // Curl lobes: few and big, so the toon light turns each into a flat "cloud" like the sprite.
  // Curly face like the concept: only small smooth sockets around the eyes and the nose tip.
  const eyeDir = new THREE.Vector3(...EYE_DIR).normalize(), noseDir = new THREE.Vector3(1, -0.17, 0).normalize();
  const mouthDir = new THREE.Vector3(1, -0.36, 0).normalize();
  const head = bakePart(18, headSdf, (d, P) => {
    const eye = smooth(0.93, 0.985, Math.max(d.dot(eyeDir), d.x * eyeDir.x + d.y * eyeDir.y - d.z * eyeDir.z));
    const nose = smooth(0.95, 0.99, d.dot(noseDir));
    // Light markings like the concept: moustache pads, a narrow blaze between the eyes that
    // widens on the forehead and joins the muzzle. Crisp edges, not a smudge.
    const pads = smooth(0.6, 0.68, d.x) * smooth(0.03, -0.05, d.y);
    const half = 0.08 + 0.1 * smooth(0.15, 0.55, d.y);
    const blaze = smooth(half + 0.04, half, Math.abs(d.z)) * smooth(0.3, 0.38, d.x) * smooth(0.7, 0.62, d.y);
    const patch = Math.max(pads, blaze);
    const calm = 1 - 0.9 * Math.max(eye, nose);
    const mouth = smooth(0.9, 0.97, d.dot(mouthDir));
    // Smooth skin under the mouth patch: it is projected onto the bare SDF, fur would bury it.
    const lip = 1 - smooth(0.84, 0.91, d.dot(mouthDir));
    return { amp: 0.015 * P.hw * calm * lip, lock: 0.07 * P.hw * calm * (1 - 0.5 * pads) * lip, shade: 1, patch,
      crease: calm, ink: calm * (1 - mouth) * (1 - pads) }; // calm face around eyes, nose, mouth
  }, 3.2, HEAD_LOCKS, 1);
  const body = bakePart(16, bodySdf, (d, P) => ({ amp: 0.015, lock: 0.08 * P.bw, shade: 1,
    patch: smooth(0.45, 0.58, d.x) * smooth(0.15, 0.02, d.y) }), 2.9, BODY_LOCKS, 2);
  const limb = bakeLimb();
  const ball = bakeFluffBall(5, 2.2, 0.16);
  const paw = bakeFluffBall(5, 2.2, 0.04); // soft round mitts, not spiky pom-poms
  const ear = bakeBlob(earSdf(), [0, -0.5, 0], 8, 3.2, 0.04);
  const tail = bakeTailTube();
  for (const g of [limb, ball, paw, ear, tail]) {
    g.setAttribute('furPatch', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count), 1));
    g.setAttribute('lockInfo', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  }
  const anchors = PROFILES.map(anchorsOf);
  return {
    head, body, limb, ball, paw, ear, tail, anchors, mouth: bakeMouth(),
    eyeGeo: new THREE.CircleGeometry(1, 24),
    eyeBall: new THREE.SphereGeometry(1, 20, 14),
    noseGeo: new THREE.SphereGeometry(1, 16, 12),
    eyeTex: eyeTexture(false), dizzyTex: eyeTexture(true),
    mouthOpen: mouthTexture(true), mouthClosed: mouthTexture(false),
    bakeMs: performance.now() - t0,
  };
}
