// Procedural maltipoo geometry. Head and body are smooth SDF shapes (smooth-union of
// ellipsoids) projected onto a shared icosphere once at load: one topology for every stage,
// so evolution is just morphing between neighbouring stage profiles. Curls are baked as a
// radial bump keyed to the sphere direction, so they stay in place while the dog grows.
// All sizes are in units of the collision radius R; the dog group is scaled by drawR.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/BufferGeometryUtils.js';

// Per-stage proportions, in units of the collision radius R.
export const PROFILES = [
  { hw: 1.12, bl: 1.50, bw: 0.92, sh: 0.56, mz: 0.20, ed: 0.50, leg: 0.21 },
  { hw: 1.06, bl: 1.60, bw: 0.91, sh: 0.65, mz: 0.23, ed: 0.55, leg: 0.19 },
  { hw: 0.97, bl: 1.72, bw: 0.86, sh: 0.78, mz: 0.28, ed: 0.61, leg: 0.175 },
  { hw: 0.89, bl: 1.83, bw: 0.83, sh: 0.91, mz: 0.33, ed: 0.67, leg: 0.165 },
  { hw: 0.84, bl: 1.92, bw: 0.85, sh: 1.02, mz: 0.37, ed: 0.72, leg: 0.16 },
  { hw: 0.85, bl: 1.95, bw: 0.92, sh: 1.04, mz: 0.38, ed: 0.74, leg: 0.165 },
];

const clamp01 = (x) => Math.min(1, Math.max(0, x));
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
function headSdf(P) {
  const h = P.hw;
  return unionOf([
    [[0, 0, 0], [h * 0.46, h * 0.44, h * 0.5]],                              // skull
    [[-h * 0.04, h * 0.27, 0], [h * 0.3, h * 0.24, h * 0.34]],              // fluffy top
    [[h * 0.16, -h * 0.13, h * 0.2], [h * 0.24, h * 0.21, h * 0.2]],        // cheeks
    [[h * 0.16, -h * 0.13, -h * 0.2], [h * 0.24, h * 0.21, h * 0.2]],
    [[h * 0.36 + P.mz * 0.5, -h * 0.12, 0], [P.mz * 0.6 + h * 0.12, h * 0.17, h * 0.2]], // muzzle
  ], h * 0.12);
}

// Body, origin at the body center.
function bodySdf(P) {
  const { bl, bw } = P;
  return unionOf([
    [[0, 0, 0], [bl * 0.5, bw * 0.42, bw * 0.46]],
    [[bl * 0.27, -bw * 0.02, 0], [bw * 0.47, bw * 0.47, bw * 0.47]],        // chest
    [[-bl * 0.29, bw * 0.02, 0], [bw * 0.44, bw * 0.43, bw * 0.44]],         // rump
  ], 0.18);
}

// Distance along dir from the origin to the SDF surface (origin must be inside).
function rayToSurface(sdf, dir, maxT = 3) {
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

// --- Curls: inverted Worley F1 gives round lumps ------------------------------------------
function hash(i, j, k, s) {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(k, 1274126177) ^ Math.imul(s, 461845907);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function curls(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  let f1 = 9;
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
    const i = xi + a, j = yi + b, k = zi + c;
    const dx = i + hash(i, j, k, 1) - x, dy = j + hash(i, j, k, 2) - y, dz = k + hash(i, j, k, 3) - z;
    f1 = Math.min(f1, dx * dx + dy * dy + dz * dz);
  }
  return 1 - smooth(0, 0.62, Math.sqrt(f1)); // 1 at a curl's top, 0 in the gaps
}

function sphereTopology(detail) {
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g);
  return g;
}

// Bakes one morphing part. shapeOf(P) -> sdf; fur(dir) -> {amp, shade} per direction.
function bakePart(detail, shapeOf, fur, curlFreq) {
  const geo = sphereTopology(detail);
  const n = geo.attributes.position.count;
  const dirs = [];
  for (let i = 0; i < n; i++) dirs.push(new THREE.Vector3().fromBufferAttribute(geo.attributes.position, i).normalize());

  const bumps = dirs.map((d) => curls(d.x * curlFreq + 17, d.y * curlFreq, d.z * curlFreq));
  const positions = [], normals = [];
  for (const P of PROFILES) {
    const sdf = shapeOf(P);
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const d = dirs[i], f = fur(d, P);
      const t = rayToSurface(sdf, d) + f.amp * (bumps[i] - 0.45);
      arr[i * 3] = d.x * t; arr[i * 3 + 1] = d.y * t; arr[i * 3 + 2] = d.z * t;
    }
    const tmp = new THREE.BufferGeometry();
    tmp.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    tmp.setIndex(geo.index);
    tmp.computeVertexNormals();
    positions.push(new THREE.BufferAttribute(arr, 3));
    normals.push(tmp.attributes.normal);
  }

  // Vertex shade: darker in the gaps between curls and under the belly, lighter muzzle.
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const d = dirs[i], f = fur(d, PROFILES[0]);
    let c = (0.86 + 0.14 * bumps[i]) * (0.9 + 0.1 * smooth(-0.9, 0.3, d.y)) * f.shade;
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = c;
  }

  geo.setAttribute('position', positions[0].clone());
  geo.setAttribute('normal', normals[0].clone());
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.morphAttributes.position = positions;
  geo.morphAttributes.normal = normals;
  geo.morphTargetsRelative = false;
  return geo;
}

// Fluffy open unit cylinder for leg segments: radius 0.5, y from -0.5 to 0.5. Joints are
// covered by fluff balls, so the segment can be stretched along y without distorting caps.
function bakeLimb() {
  let g = new THREE.CylinderGeometry(0.5, 0.5, 1, 10, 3, true);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g);
  const pos = g.attributes.position, n = pos.count, col = new Float32Array(n * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i);
    const b = curls(v.x * 4 + 3, v.y * 3, v.z * 4), k = 1 + 0.08 * (b - 0.45);
    pos.setXYZ(i, v.x * k, v.y, v.z * k);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0.86 + 0.14 * b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

// Ball of curls (paws, tail pom-pom, ears), radius ~1.
function bakeFluffBall(detail, freq, amp) {
  const g = sphereTopology(detail);
  const pos = g.attributes.position, n = pos.count, col = new Float32Array(n * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const b = curls(v.x * freq + 5, v.y * freq, v.z * freq);
    v.multiplyScalar(1 + amp * (b - 0.45));
    pos.setXYZ(i, v.x, v.y, v.z);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0.84 + 0.16 * b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

function eyeTexture(dizzy) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  if (dizzy) {
    x.fillStyle = '#fff'; x.beginPath(); x.arc(64, 64, 62, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#2a1a10'; x.lineWidth = 9; x.lineCap = 'round'; x.beginPath();
    for (let i = 0; i <= 80; i++) {
      const a = (i / 80) * Math.PI * 5, r = 4 + (i / 80) * 52;
      i ? x.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r) : x.moveTo(64, 64);
    }
    x.stroke();
  } else {
    const g = x.createRadialGradient(56, 54, 6, 64, 64, 64);
    g.addColorStop(0, '#4a2c1c'); g.addColorStop(0.55, '#24140c'); g.addColorStop(1, '#0d0704');
    x.fillStyle = g; x.beginPath(); x.arc(64, 64, 62, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#fff'; x.beginPath(); x.arc(44, 40, 17, 0, Math.PI * 2); x.fill();
    x.globalAlpha = 0.8; x.beginPath(); x.arc(82, 84, 7, 0, Math.PI * 2); x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.center.set(0.5, 0.5);
  return t;
}

// Per-profile anchor points used by the rig (root-local unless noted), blended like morphs.
export function anchorsOf(P) {
  const bodyY = P.sh + P.bw * 0.28;
  const head = new THREE.Vector3(P.bl * 0.5 + P.hw * 0.04, bodyY + P.bw * 0.4 + P.hw * 0.14, 0);
  const sdf = headSdf(P), dir = new THREE.Vector3();
  const onHead = (x, y, z, out = 0) => { dir.set(x, y, z).normalize(); return dir.clone().multiplyScalar(rayToSurface(sdf, dir) + out); };
  return {
    bodyY,
    head,
    shoulder: [P.bl * 0.28, P.sh, P.bw * 0.27],     // z mirrored for left/right
    hip: [-P.bl * 0.3, P.sh * 0.98, P.bw * 0.27],
    tail: [-P.bl * 0.5, P.bw * 0.32],               // body-local x, y
    eye: onHead(0.72, 0.16, 0.44, -0.01),           // head-local, right eye (z mirrored)
    nose: onHead(1, -0.18, 0, -0.02),
    ear: onHead(-0.15, 0.55, 0.8, -0.02).toArray(), // head-local attach on the skull side
  };
}

// Built once and shared by every dog.
export function buildDogAssets() {
  const t0 = performance.now();
  const head = bakePart(16, headSdf, (d, P) => {
    const face = smooth(0.55, 0.9, d.x) * smooth(-0.6, 0.1, d.y); // short fur on the muzzle
    return { amp: 0.035 * P.hw * (1 - 0.8 * face), shade: 1 + 0.1 * face };
  }, 4.5);
  const body = bakePart(14, bodySdf, (d) => ({ amp: 0.035, shade: 1 + 0.06 * smooth(-0.2, -0.8, d.y) }), 4);
  const limb = bakeLimb();
  const ball = bakeFluffBall(5, 2.6, 0.1);
  const ear = bakeFluffBall(6, 2.4, 0.12);
  const anchors = PROFILES.map(anchorsOf);
  return {
    head, body, limb, ball, ear, anchors,
    eyeGeo: new THREE.CircleGeometry(1, 24),
    noseGeo: new THREE.SphereGeometry(1, 16, 12),
    eyeTex: eyeTexture(false), dizzyTex: eyeTexture(true),
    bakeMs: performance.now() - t0,
  };
}
