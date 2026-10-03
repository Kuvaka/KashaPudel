// Procedural maltipoo geometry. Head and body are smooth SDF shapes (smooth-union of
// ellipsoids) projected onto a shared icosphere once at load: one topology for every stage,
// so evolution is just morphing between neighbouring stage profiles. Curls are baked as a
// radial bump keyed to the sphere direction, so they stay in place while the dog grows.
// All sizes are in units of the collision radius R; the dog group is scaled by drawR.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/BufferGeometryUtils.js';

// Per-stage proportions, in units of the collision radius R. Chibi like the 2D sprites:
// the puppy grows into its legs and muzzle, but the head stays big.
export const PROFILES = [
  { hw: 1.2, bl: 1.45, bw: 0.98, sh: 0.56, mz: 0.16, ed: 0.52, leg: 0.21 },
  { hw: 1.18, bl: 1.49, bw: 0.98, sh: 0.6, mz: 0.18, ed: 0.55, leg: 0.205 },
  { hw: 1.15, bl: 1.54, bw: 0.97, sh: 0.64, mz: 0.2, ed: 0.58, leg: 0.2 },
  { hw: 1.12, bl: 1.59, bw: 0.99, sh: 0.68, mz: 0.22, ed: 0.6, leg: 0.195 },
  { hw: 1.09, bl: 1.64, bw: 1.02, sh: 0.72, mz: 0.23, ed: 0.62, leg: 0.195 },
  { hw: 1.1, bl: 1.68, bw: 1.07, sh: 0.75, mz: 0.24, ed: 0.64, leg: 0.2 },
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
    [[-h * 0.06, h * 0.16, 0], [h * 0.4, h * 0.3, h * 0.44]],              // round crown, no top-knot
    [[h * 0.14, -h * 0.12, h * 0.22], [h * 0.26, h * 0.24, h * 0.24]],        // cheeks
    [[h * 0.14, -h * 0.12, -h * 0.22], [h * 0.26, h * 0.24, h * 0.24]],
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
      const t = rayToSurface(sdf, d) + f.amp * (bumps[i] - 0.5);
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
  const col = new Float32Array(n * 3), patch = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const d = dirs[i], f = fur(d, PROFILES[0]);
    const c = (0.84 + 0.16 * smooth(0.02, 0.45, bumps[i])) * f.shade;
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = c;
    patch[i] = f.patch ?? 0;
  }

  geo.setAttribute('position', positions[0].clone());
  geo.setAttribute('normal', normals[0].clone());
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('furPatch', new THREE.BufferAttribute(patch, 1));
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
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0.84 + 0.16 * smooth(0.02, 0.45, b);
    d.toArray(od, i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('outlineDir', new THREE.BufferAttribute(od, 3));
  g.computeVertexNormals();
  return g;
}

// Floppy ear, hanging from the origin down to y ~ -1; flat in z; wavy lobes widening to the tip.
function earSdf() {
  const f = 0.55; // thickness
  return unionOf([
    [[0, -0.14, 0], [0.2, 0.2, 0.2 * f]],
    [[0.02, -0.38, 0], [0.25, 0.22, 0.25 * f]],
    [[-0.02, -0.62, 0], [0.28, 0.22, 0.28 * f]],
    [[-0.13, -0.84, 0], [0.17, 0.17, 0.17 * f]],
    [[0.13, -0.86, 0], [0.17, 0.17, 0.17 * f]],
    [[0, -0.9, 0], [0.18, 0.15, 0.18 * f]],
  ], 0.08);
}

// Curled plume tail in its own frame: base at the origin, rising along +y, arching forward (+x)
// over the back and rolling ~1.15 turns inwards, so the curl's hole reads like the "@" in the
// concept art. A swept tube: thick in the arch, tapering to a rounded tip.
function bakeTailTube() {
  const SEG = 72, RAD = 12, CAP = 4;
  const C = [0.12, 0.55], th0 = Math.atan2(-C[1], -C[0]), turn = 414 * Math.PI / 180;
  const rho0 = Math.hypot(C[0], C[1]);
  const curve = (t) => {
    const th = th0 - turn * t, rho = rho0 * (1 - 0.75 * t);
    return new THREE.Vector3(C[0] + Math.cos(th) * rho, C[1] + Math.sin(th) * rho, 0.06 * Math.sin(Math.PI * t));
  };
  const radius = (t) => t < 0.32 ? 0.17 + 0.15 * smooth(0, 0.32, t) : 0.32 - 0.21 * smooth(0.32, 1, t);
  const pos = [], col = [], od = [], idx = [];
  const Z = new THREE.Vector3(0, 0, 1), T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3();
  const v = new THREE.Vector3(), nrm = new THREE.Vector3();
  const ring = (P, r) => {
    for (let j = 0; j < RAD; j++) {
      const ph = j / RAD * Math.PI * 2;
      nrm.copy(N).multiplyScalar(Math.cos(ph)).addScaledVector(B, Math.sin(ph));
      v.copy(P).addScaledVector(nrm, r);
      const bmp = curls(v.x * 4 + 7, v.y * 4, v.z * 4);
      v.copy(P).addScaledVector(nrm, r * (1 + 0.12 * (bmp - 0.5)));
      pos.push(v.x, v.y, v.z);
      const sh = 0.84 + 0.16 * smooth(0.02, 0.45, bmp);
      col.push(sh, sh, sh);
      od.push(v.x * 1.2 + nrm.x * 0.3, v.y * 1.2 + nrm.y * 0.3, v.z * 1.2 + nrm.z * 0.3); // curl-stroke coords
    }
  };
  const frame = (t) => {
    T.copy(curve(Math.min(1, t + 1e-3))).sub(curve(Math.max(0, t - 1e-3))).normalize();
    N.crossVectors(Z, T).normalize(); B.crossVectors(T, N);
  };
  for (let i = 0; i <= SEG; i++) { const t = i / SEG; frame(t); ring(curve(t), radius(t)); }
  // Rounded tip: a few shrinking rings pushed along the tangent.
  frame(1);
  const tip = curve(1), rt = radius(1);
  for (let k = 1; k <= CAP; k++) {
    const a = k / CAP * Math.PI / 2;
    ring(tip.clone().addScaledVector(T, Math.sin(a) * rt), Math.max(1e-3, Math.cos(a) * rt));
  }
  const rings = SEG + 1 + CAP;
  for (let i = 0; i < rings - 1; i++) for (let j = 0; j < RAD; j++) {
    const a = i * RAD + j, b = i * RAD + (j + 1) % RAD, c = a + RAD, d = b + RAD;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('outlineDir', new THREE.Float32BufferAttribute(od, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.userData.radialOutline = false; // smooth tube: outline along the normal
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

// Mouth decal under the nose: a little "w" smile, open with a pink tongue while running.
function mouthTexture(open) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 96;
  const x = c.getContext('2d');
  x.lineCap = 'round'; x.lineJoin = 'round';
  if (open) {
    x.fillStyle = '#5a2418';
    x.beginPath(); x.moveTo(30, 26); x.quadraticCurveTo(64, 34, 98, 26); x.quadraticCurveTo(92, 84, 64, 86);
    x.quadraticCurveTo(36, 84, 30, 26); x.fill();
    x.fillStyle = '#f2788a';
    x.beginPath(); x.ellipse(64, 70, 22, 16, 0, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#c8506a'; x.lineWidth = 3; x.beginPath(); x.moveTo(64, 60); x.lineTo(64, 78); x.stroke();
  }
  x.strokeStyle = '#4a2a18'; x.lineWidth = 7;
  x.beginPath(); x.moveTo(64, 8); x.lineTo(64, 24);
  x.moveTo(22, 20); x.quadraticCurveTo(42, 38, 64, 24); x.quadraticCurveTo(86, 38, 106, 20); x.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
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
    eye: onHead(0.8, 0.04, 0.5, 0.0),               // head-local, right eye (z mirrored)
    nose: onHead(1, -0.18, 0, -0.02),
    mouth: onHead(1, -0.42, 0, 0.004),
    ear: onHead(-0.05, 0.7, 0.72, -0.03).toArray(), // head-local attach high on the skull side
  };
}

// Built once and shared by every dog.
export function buildDogAssets() {
  const t0 = performance.now();
  // Curl lobes: few and big, so the toon light turns each into a flat "cloud" like the sprite.
  const head = bakePart(18, headSdf, (d, P) => {
    const face = smooth(0.4, 0.75, d.x) * smooth(-0.7, 0.35, d.y); // smooth face: eyes, muzzle
    const patch = smooth(0.42, 0.8, d.x) * smooth(0.12, -0.2, d.y);
    return { amp: 0.06 * P.hw * (1 - 0.9 * face), shade: 1, patch };
  }, 3.2);
  const body = bakePart(16, bodySdf, (d) => ({ amp: 0.07, shade: 1,
    patch: smooth(0.35, 0.8, d.x) * smooth(0.25, -0.25, d.y) }), 2.9);
  const limb = bakeLimb();
  const ball = bakeFluffBall(5, 2.2, 0.16);
  const ear = bakeBlob(earSdf(), [0, -0.5, 0], 5, 3.2, 0.08);
  const tail = bakeTailTube();
  for (const g of [limb, ball, ear, tail]) g.setAttribute('furPatch', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count), 1));
  const anchors = PROFILES.map(anchorsOf);
  return {
    head, body, limb, ball, ear, tail, anchors,
    eyeGeo: new THREE.CircleGeometry(1, 24),
    noseGeo: new THREE.SphereGeometry(1, 16, 12),
    eyeTex: eyeTexture(false), dizzyTex: eyeTexture(true),
    mouthOpen: mouthTexture(true), mouthClosed: mouthTexture(false),
    bakeMs: performance.now() - t0,
  };
}
