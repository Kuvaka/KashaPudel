// Wardrobe in 3D: what each item looks like and where it sits on the dog. An item is one merged
// toon mesh with vertex colours (one draw call, plus its outline), built once per look and
// shared by every dog. Coat colours and boots re-tint existing parts instead (no extra calls);
// trails are dash effects (fx.js).
//
// Mounts (set up by DogVisual):
//   head   — head group; x forward (nose), y up, z sideways; sizes in units of P.hw
//   back   — group on top of the body, y up; units of P.bw
//   tail   — group on top of the tail curl, y up; tail units (the tail mesh is scaled)
//   skin   — child of the body mesh, morphs with it (garments)
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/BufferGeometryUtils.js';
import { toonMaterial, coatMaterial } from './toon.js';
import { PROFILES, bodySdf, rayToSurface } from './dogModel.js';

// Placement knobs per kind, in units of P.hw (head) / P.bw (back) / 1 (tail): [x, y, z, rotX, rotY, rotZ, scale].
export const FIT = {
  bow: [0.04, 0.51, 0.32, 0.35, 0.25, 0.1, 0.29],
  daisy: [0.04, 0.5, 0.3, 0.5, 0.25, 0.15, 0.3],
  crown: [-0.05, 0.56, 0, 0, 0, -0.12, 0.19],
  beret: [-0.06, 0.55, 0, 0.1, 0, -0.25, 0.3],
  chef: [-0.08, 0.55, 0, 0, 0, -0.15, 0.27],
  party: [-0.02, 0.56, 0.06, 0.25, 0, -0.2, 0.32],
  tiara: [-0.02, 0.5, 0, 0, 0, -0.18, 0.36],
  collar: [-0.08, -0.42, 0, 0, 0, -0.3, 0.36],
  specs: [0.56, 0.02, 0, 0, 0, -0.05, 0.5], // lenses round the eyes (x 0.475, z ±0.21, r 0.13 hw)
  satchel: [-0.12, 0.03, 0, 0, 0, 0.1, 0.75],
  wings: [-0.08, 0.03, 0, 0, 0, 0.1, 0.95],
  tail: [0, 0, 0, 0, 0, 0, 0.22],
  pinwheel: [0, 0, 0, 0, 0, 0, 0.3],
  bunny: [-0.05, 0.05, 0, 0, 0, -0.1, 0.5],
  ushanka: [-0.06, 0.32, 0, 0, 0, -0.2, 0.42],
  clover: [-0.03, 0.47, 0, 0, 0, -0.15, 0.4],
  cupcake: [-0.04, 0.56, 0, 0, 0, -0.12, 0.16],
  moustache: [0.72, -0.22, 0, 0, 0, 0.1, 0.4],
  tailbow: [0, 0.12, 0, 0, 0, 0, 0.2],
  turtle: [-0.05, -0.12, 0, 0, 0, 0.05, 0.75],
  saddle: [0.05, -0.05, 0, 0, 0, 0.1, 0.7],
  picnic: [-0.05, 0, 0, 0, 0, 0.1, 0.72],
};
const fit = (k, P, unit = P.hw) => { const f = FIT[k]; return [[f[0] * unit, f[1] * unit, f[2] * unit], [f[3], f[4], f[5]], f[6] * unit]; };

const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), S = new THREE.Vector3();
const PI = Math.PI;

// One coloured part of an item: geometry moved into place (pos, rotation, scale). color is a flat
// colour, a function (x, y, z) → colour in the part's own space (patterns), or null to keep the
// colours the geometry already has (a merged sub-item).
function part(geo, color, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && !(k === 'color' && color === null)) g.deleteAttribute(k);
  if (typeof scale === 'number') scale = [scale, scale, scale];
  if (color !== null) {
    const c = new THREE.Color(), p = g.attributes.position, n = p.count, col = new Float32Array(n * 3);
    if (typeof color !== 'function') c.set(color);
    for (let i = 0; i < n; i++) {
      if (typeof color === 'function') c.set(color(p.getX(i), p.getY(i), p.getZ(i)));
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  g.applyMatrix4(M.compose(V.set(...pos), Q.setFromEuler(E.set(...rot)), S.set(...scale)));
  return g;
}
const merge = (parts) => { const g = mergeGeometries(parts); g.computeBoundingSphere(); return g; };

const sphere = new THREE.SphereGeometry(1, 16, 12), ball = new THREE.IcosahedronGeometry(1, 2);
const torus = (r = 1, t = 0.25, seg = 24) => new THREE.TorusGeometry(r, t, 8, seg);
const cone = new THREE.ConeGeometry(1, 1, 12), cyl = new THREE.CylinderGeometry(1, 1, 1, 18);
function extrude(draw, depth = 0.35, bevel = 0.12, curveSegments = 10, bevelSegments = 2) {
  const s = new THREE.Shape(); draw(s);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments, curveSegments });
  g.translate(0, 0, -depth / 2);
  return g;
}
const heart = extrude((s) => {
  s.moveTo(0, -1); s.bezierCurveTo(-0.6, -0.45, -1.15, -0.05, -0.95, 0.45);
  s.bezierCurveTo(-0.75, 0.95, -0.15, 0.95, 0, 0.5); s.bezierCurveTo(0.15, 0.95, 0.75, 0.95, 0.95, 0.45);
  s.bezierCurveTo(1.15, -0.05, 0.6, -0.45, 0, -1);
});
// Heart outline (a frame with a heart hole), for the glasses.
const heartCurve = (s, k) => {
  s.moveTo(0, -k); s.bezierCurveTo(-0.6 * k, -0.45 * k, -1.15 * k, -0.05 * k, -0.95 * k, 0.45 * k);
  s.bezierCurveTo(-0.75 * k, 0.95 * k, -0.15 * k, 0.95 * k, 0, 0.5 * k); s.bezierCurveTo(0.15 * k, 0.95 * k, 0.75 * k, 0.95 * k, 0.95 * k, 0.45 * k);
  s.bezierCurveTo(1.15 * k, -0.05 * k, 0.6 * k, -0.45 * k, 0, -k);
};
const heartRing = extrude((s) => { heartCurve(s, 1); const h = new THREE.Path(); heartCurve(h, 0.74); s.holes.push(h); }, 0.12, 0.05);
const leafHeart = extrude((s) => heartCurve(s, 1), 0.3, 0.1, 4, 1); // light: a wreath has 18 of them
const dome = new THREE.SphereGeometry(1, 40, 20, 0, PI * 2, 0, PI / 2);
const arc = (r, t, a = PI) => new THREE.TorusGeometry(r, t, 8, 28, a);
const box = (sx = 1, sy = 1, sz = 1) => new THREE.BoxGeometry(1, 1, 1, sx, sy, sz);
const shade = (c, k) => '#' + new THREE.Color(c).multiplyScalar(k).getHexString();
const triangle = extrude((s) => { s.moveTo(-1, 0.5); s.lineTo(1, 0.5); s.lineTo(0, -0.9); s.lineTo(-1, 0.5); }, 0.12, 0.08);

// Charms hang in front of the collar ring (ring in the xz plane, radius 1, front = +x).
const charms = {
  heart: (c) => [part(heart, c, [1.06, -0.32, 0], [0, PI / 2, 0], [0.26, 0.26, 0.3])],
  bell: (c) => [part(sphere, c, [1.08, -0.3, 0], [0, 0, 0], 0.24)],
  bowtie: (c) => [
    part(cone, c, [1.05, -0.05, -0.32], [PI / 2, 0, 0], [0.26, 0.5, 0.18]),
    part(cone, c, [1.05, -0.05, 0.32], [-PI / 2, 0, 0], [0.26, 0.5, 0.18]),
    part(sphere, c, [1.08, -0.05, 0], [0, 0, 0], 0.16)],
};
const ring = (color, t = 0.16) => part(torus(1, t, 28), color, [0, 0, 0], [PI / 2, 0, 0]);

// --- Garments: a smooth shell over the body that morphs with it ----------------------------------
// A side picture on a garment: (x, y) of the direction seen from the side.
const nearSeg = (x, y, ax, ay, bx, by, w) => {
  const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - ax - dx * t, y - ay - dy * t) < w;
};
const inEll = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1;
function deer(x, y) { // cream deer head with antlers, about 0.5 across
  const cx = -0.05, cy = 0.08;
  if (inEll(x, y, cx, cy, 0.13, 0.15) || inEll(x, y, cx, cy - 0.12, 0.08, 0.08)) return true;
  for (const s of [-1, 1]) {
    if (inEll(x, y, cx + s * 0.14, cy + 0.07, 0.07, 0.035)) return true; // ears
    if (nearSeg(x, y, cx + s * 0.05, cy + 0.11, cx + s * 0.12, cy + 0.33, 0.035)) return true;
    if (nearSeg(x, y, cx + s * 0.09, cy + 0.22, cx + s * 0.2, cy + 0.27, 0.03)) return true;
  }
  return false;
}
function pawPrint(x, y, cx, cy) {
  if (inEll(x, y, cx, cy, 0.12, 0.1)) return true;
  return [[-0.13, 0.11], [-0.05, 0.17], [0.05, 0.17], [0.13, 0.11]].some(([a, b]) => inEll(x, y, cx + a, cy + b, 0.045, 0.055));
}
const capeButton = [new THREE.Vector3(0.66, 0.42, 0.62).normalize(), new THREE.Vector3(0.66, 0.42, -0.62).normalize()];
// Directions d from the body centre (x forward, y up, z side). mask(d) keeps a vertex, paint(d)
// colours it, gap(d) is the distance from the bare body surface in units of P.bw (it has to clear
// the fur locks, ~0.04).
const scallop = (d, n, a) => a * Math.sin(Math.atan2(d.z, d.x) * n);
const fib = Array.from({ length: 46 }, (_, i) => { // even dots for polka patterns
  const y = 1 - (i + 0.5) / 46 * 2, r = Math.sqrt(1 - y * y), a = i * PI * (3 - Math.sqrt(5));
  return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
});
const nearDot = (d, R) => fib.some((p) => p.distanceToSquared(d) < R * R);
const CUTS = {
  dress: {
    mask: (d) => d.y > -0.4 + scallop(d, 12, 0.05) && d.x < 0.66 && d.x > -0.8,
    gap: (d) => 0.07 + 0.16 * Math.max(0, Math.min(1, (0.05 - d.y) / 0.4)) ** 1.5, // skirt flares out
    paint: (d, L) => nearDot(d, 0.12) ? L.dots : L.color,
  },
  cape: {
    mask: (d) => d.y > -0.02 + scallop(d, 8, 0.05) && d.x < 0.72 && d.x > -0.88,
    gap: (d) => 0.08 + 0.05 * Math.max(0, 0.3 - d.y),
    paint: (d, L) => d.y < 0.1 + scallop(d, 8, 0.05) || d.x > 0.62 ? L.trim : L.color,
  },
  bee: { // broad stripes, plain cuffs at both ends
    mask: (d) => d.y > -0.52 && (d.x < 0.62 || d.y < 0.12) && d.x > -0.76,
    gap: (d) => 0.085 + (d.x > 0.52 || d.x < -0.65 ? 0.025 : 0),
    paint: (d, L) => d.x > 0.52 || d.x < -0.65 ? L.color : Math.floor((d.x + 1.17) * 3.0) % 2 ? L.stripe : L.color,
  },
  knit: {
    mask: (d) => d.y > -0.62 && d.x < 0.64 && d.x > -0.74,
    gap: (d) => 0.07 + (d.x > 0.52 || d.x < -0.64 ? 0.03 : 0),
    paint: (d, L) => {
      if (d.x > 0.52 || d.x < -0.64) return Math.floor((Math.atan2(d.z, d.y) + 4) * 7) % 2 ? L.trim : shade(L.trim, 0.92); // ribbed cuffs
      if (Math.abs(d.z) > 0.45 && deer(d.x, d.y)) return L.trim;
      return L.color;
    },
  },
  frog: { // the eyes are separate lobes, see frogHood
    mask: (d) => d.y > -0.56 && (d.x < 0.63 || d.y < 0.12) && d.x > -0.74,
    gap: () => 0.085,
    paint: (d, L) => {
      if (d.x > 0.52 && d.x < 0.63) return shade(L.color, 0.85);
      return d.y < -0.12 || d.x > 0.7 ? L.belly : L.color;
    },
  },
  hero: {
    mask: (d) => d.y > 0.04 - 0.34 * Math.max(0, -d.x - 0.2) + scallop(d, 2, 0.04) && d.x < 0.72 && d.x > -0.96,
    gap: (d) => 0.08 + 0.2 * Math.max(0, -d.x - 0.25),
    paint: (d, L) => {
      if (capeButton.some((b) => b.distanceTo(d) < 0.1)) return L.button;
      if (d.x > 0.62) return shade(L.color, 0.85);
      if (Math.abs(d.z) > 0.45 && pawPrint(d.x, d.y, -0.25, 0.32)) return L.emblem;
      return L.color;
    },
  },
  blanket: {
    mask: (d) => d.y > 0.22 + scallop(d, 10, 0.04) && Math.abs(d.x) < 0.66,
    gap: () => 0.07,
    paint: (d, L) => {
      if (d.y < 0.33 + scallop(d, 10, 0.04) || Math.abs(d.x) > 0.58) return L.trim;
      const p = V.set(0, 0.62, d.z > 0 ? 0.78 : -0.78).normalize();
      if (p.distanceTo(d) < 0.2) return p.distanceTo(d) < 0.05 || nearDot(d, 0.03) ? '#6b3f2a' : L.pocket;
      return L.color;
    },
  },
};

function garment(look) {
  const cut = CUTS[look.cut];
  let src = new THREE.IcosahedronGeometry(1, 34);
  src.deleteAttribute('normal'); src.deleteAttribute('uv');
  src = mergeVertices(src);
  const sp = src.attributes.position, si = src.index.array;
  const dirs = [], keep = [];
  for (let i = 0; i < sp.count; i++) { const d = new THREE.Vector3().fromBufferAttribute(sp, i).normalize(); dirs.push(d); keep.push(cut.mask(d)); }
  // Triangles with all three corners kept, vertices renumbered.
  const map = new Int32Array(sp.count).fill(-1), used = [], idx = [];
  for (let t = 0; t < si.length; t += 3) {
    if (!(keep[si[t]] && keep[si[t + 1]] && keep[si[t + 2]])) continue;
    for (let k = 0; k < 3; k++) { const v = si[t + k]; if (map[v] < 0) { map[v] = used.length; used.push(v); } idx.push(map[v]); }
  }
  const n = used.length, positions = [], normals = [];
  for (const P of PROFILES) {
    const sdf = bodySdf(P), arr = new Float32Array(n * 3);
    used.forEach((v, i) => {
      const d = dirs[v], r = rayToSurface(sdf, d) + cut.gap(d) * P.bw;
      arr[i * 3] = d.x * r; arr[i * 3 + 1] = d.y * r; arr[i * 3 + 2] = d.z * r;
    });
    const tmp = new THREE.BufferGeometry();
    tmp.setAttribute('position', new THREE.BufferAttribute(arr, 3)); tmp.setIndex(idx); tmp.computeVertexNormals();
    positions.push(tmp.attributes.position); normals.push(tmp.attributes.normal);
  }
  const col = new Float32Array(n * 3), c = new THREE.Color();
  used.forEach((v, i) => { c.set(cut.paint(dirs[v], look)); col.set([c.r, c.g, c.b], i * 3); });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', positions[0].clone()); g.setAttribute('normal', normals[0].clone());
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.morphAttributes.position = positions; g.morphAttributes.normal = normals; g.morphTargetsRelative = false;
  g.computeBoundingSphere(); g.boundingSphere.radius *= 1.3;
  return { mount: 'skin', geo: g };
}

// Frog hood: two bulging eyes on top of the suit, baked into the same six morph targets.
function frogHood(look) {
  const res = garment(look);
  const forms = PROFILES.map((P) => {
    const p = [], b = P.bw;
    for (const side of [-1, 1]) {
      const c = [-P.bl * 0.22, b * 0.68, side * b * 0.31];
      p.push(orb(look.color, c, [b * 0.22, b * 0.24, b * 0.22]));
      p.push(orb(look.eye, [c[0] + b * 0.1, c[1] + b * 0.035, c[2] + side * b * 0.145], [b * 0.145, b * 0.175, b * 0.095], [0, side * 0.4, 0]));
      p.push(orb(look.pupil, [c[0] + b * 0.16, c[1] + b * 0.035, c[2] + side * b * 0.198], [b * 0.073, b * 0.098, b * 0.05], [0, side * 0.4, 0]));
      p.push(dot('#ffffff', [c[0] + b * 0.178, c[1] + b * 0.088, c[2] + side * b * 0.224], b * 0.024));
    }
    return tight(p);
  });
  const eyes = forms[0].clone();
  eyes.morphTargetsRelative = false;
  eyes.morphAttributes.position = forms.map((g) => g.attributes.position.clone());
  eyes.morphAttributes.normal = forms.map((g) => g.attributes.normal.clone());
  const g = mergeGeometries([res.geo, eyes]);
  g.computeBoundingBox(); g.computeBoundingSphere(); g.boundingSphere.radius *= 1.3;
  res.geo.dispose(); eyes.dispose(); forms.forEach((f) => f.dispose());
  return { mount: 'skin', geo: g };
}

// Low-poly pieces for the redrawn bow, satchel and wings.
const orbGeo = new THREE.SphereGeometry(1, 12, 8), dotGeo = new THREE.SphereGeometry(1, 8, 6);
const orb = (c, pos, scale = 1, rot = [0, 0, 0]) => part(orbGeo, c, pos, rot, scale);
const dot = (c, pos, scale = 1) => part(dotGeo, c, pos, [0, 0, 0], scale);
const hoop = (r = 1, t = 0.08, n = 24) => new THREE.TorusGeometry(r, t, 6, n);
const flat = (draw, depth = 0.12, bevel = 0.06) => extrude(draw, depth, bevel, 6, 2);
const tube = (pts, r = 0.04, n = 16) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(...q))), n, r, 5, false);
// Merge and weld shared vertices (fewer vertices, same look).
function tight(parts) {
  const raw = merge(parts), g = mergeVertices(raw, 1e-5);
  raw.dispose(); for (const q of parts) q.dispose();
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}
// Two straps round the body for backpacks.
const straps = (color) => [-0.28, 0.3].map((x) => part(hoop(0.6, 0.055, 20), color, [x, -0.28, 0], [0, PI / 2, 0], [1, 0.83, 1]));

// --- Builders: look params → { mount, geo, place(P) → [pos, rot, scale], spin? } -----------------
const BUILD = {
  // Bow on the top of the head, a little to one side, like a hair clip: soft loops, folds, short tails.
  bow({ color = '#ff7eb6', knot = color, dots = null }) {
    const parts = [];
    for (const k of [-1, 1]) {
      const loop = flat((q) => {
        q.moveTo(k * 0.12, 0); q.bezierCurveTo(k * 0.42, 0.25, k * 0.76, 0.65, k * 0.96, 0.5);
        q.bezierCurveTo(k * 1.18, 0.22, k * 1.12, -0.48, k * 0.88, -0.47); q.bezierCurveTo(k * 0.65, -0.46, k * 0.35, -0.2, k * 0.12, 0);
      }, 0.2, 0.09);
      parts.push(part(loop, color));
      parts.push(part(tube([[k * 0.22, 0.01, 0.24], [k * 0.45, 0.1, 0.27], [k * 0.72, 0.12, 0.27]], 0.025, 8), shade(color, 0.8))); // fold
      parts.push(part(flat((q) => {
        q.moveTo(k * 0.18, -0.12); q.lineTo(k * 0.48, -0.14); q.quadraticCurveTo(k * 0.65, -0.5, k * 0.68, -0.95);
        q.lineTo(k * 0.43, -0.8); q.lineTo(k * 0.2, -0.95); q.closePath();
      }, 0.08, 0.035), color));
      if (dots) parts.push(dot(dots, [k * 0.82, 0.26, 0.27], [0.09, 0.09, 0.025]));
    }
    parts.push(orb(knot, [0, 0, 0.1], [0.25, 0.3, 0.24]));
    return { mount: 'head', geo: tight(parts), place: (P) => fit('bow', P) };
  },
  // Daisy behind the ear: white petals round a yellow middle, facing sideways.
  daisy({ petal = '#ffffff', middle = '#ffcf3a' }) {
    const parts = [part(sphere, middle, [0, 0, 0.08], [0, 0, 0], [0.32, 0.32, 0.16])];
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * PI * 2;
      parts.push(part(sphere, petal, [Math.cos(a) * 0.62, Math.sin(a) * 0.62, 0], [0, 0, a], [0.42, 0.17, 0.08]));
    }
    return { mount: 'head', geo: merge(parts), place: (P) => fit('daisy', P) };
  },
  // Tiara / crown: a band with points and gems.
  crown({ color = '#ffd34d', gem = '#ff5c8a', points = 5, tall = 0.6 }) {
    const parts = [part(new THREE.CylinderGeometry(1, 1, 0.4, 24, 1, true), color)];
    for (let i = 0; i < points; i++) {
      const a = (i / points) * PI * 2;
      parts.push(part(cone, color, [Math.cos(a) * 0.92, 0.2 + tall / 2, Math.sin(a) * 0.92], [0, 0, 0], [0.24, tall, 0.24]));
      parts.push(part(sphere, gem, [Math.cos(a) * 1.0, 0, Math.sin(a) * 1.0], [0, 0, 0], 0.13));
    }
    return { mount: 'head', geo: merge(parts), place: (P) => fit('crown', P) };
  },
  // Anniversary tiara: a front arc of gold with three points and a heart in the middle.
  tiara({ color = '#ffd34d', gem = '#ff4f86', pearl = '#fff4fa' }) {
    const parts = [part(new THREE.CylinderGeometry(1, 1, 0.2, 28, 1, true, PI / 2 - 1.25, 2.5), color)];
    for (const [a, h] of [[0, 0.95], [-0.62, 0.55], [0.62, 0.55], [-1.05, 0.3], [1.05, 0.3]]) {
      const x = Math.cos(a), z = -Math.sin(a);
      parts.push(part(cone, color, [x * 0.99, 0.1 + h / 2, z * 0.99], [0, 0, 0], [0.13 + 0.06 * h, h, 0.13 + 0.06 * h]));
      if (a) parts.push(part(sphere, pearl, [x * 1.04, 0.02, z * 1.04], [0, 0, 0], 0.1));
    }
    parts.push(part(heart, gem, [1.08, 0.38, 0], [0, PI / 2, 0], [0.24, 0.24, 0.22]));
    return { mount: 'head', geo: merge(parts), place: (P) => fit('tiara', P) };
  },
  // Beret: a soft flat cap tipped to one side, with a little stalk.
  beret({ color = '#8fe3c4' }) {
    const dark = new THREE.Color(color).multiplyScalar(0.8);
    return { mount: 'head', geo: merge([
      part(sphere, color, [0, 0.2, 0], [0, 0, 0], [1.05, 0.38, 1.05]),
      part(torus(0.82, 0.12), dark, [0, 0.05, 0], [PI / 2, 0, 0]),
      part(cyl, dark, [0, 0.62, 0], [0, 0, 0.3], [0.08, 0.25, 0.08]),
    ]), place: (P) => fit('beret', P) };
  },
  // Chef's toque: a band and three puffs on top.
  chef({ color = '#ffffff', band = color }) {
    const shade = '#eef0f5', parts = [part(cyl, color, [0, 0.3, 0], [0, 0, 0], [0.82, 0.6, 0.82]), part(torus(0.84, 0.1), band, [0, 0.12, 0], [PI / 2, 0, 0])];
    for (const [x, z, r] of [[-0.3, -0.3, 0.6], [0.3, -0.25, 0.58], [0, 0.32, 0.62], [0.05, 0, 0.66]]) parts.push(part(sphere, shade, [x, 1.0, z], [0, 0, 0], r));
    return { mount: 'head', geo: merge(parts), place: (P) => fit('chef', P) };
  },
  // Party hat: a cone with two bright rings and a pompom on the tip.
  party({ color = '#7ec8ff', ring2 = '#ffd34d', top = '#ff6fae' }) {
    return { mount: 'head', geo: merge([
      part(cone, color, [0, 0.8, 0], [0, 0, 0], [0.62, 1.6, 0.62]),
      part(torus(0.47, 0.07), ring2, [0, 0.4, 0], [PI / 2, 0, 0]),
      part(torus(0.27, 0.07), top, [0, 0.95, 0], [PI / 2, 0, 0]),
      part(ball, top, [0, 1.62, 0], [0, 0, 0], 0.24),
    ]), place: (P) => fit('party', P) };
  },
  // Round glasses in front of the eyes.
  specs({ color = '#6b3f2a' }) {
    const parts = [];
    for (const z of [-0.42, 0.42]) {
      parts.push(part(torus(0.3, 0.055), color, [0, 0, z], [0, PI / 2, 0]));
      parts.push(part(cyl, color, [-0.3, 0.02, z * 1.55], [0, 0, PI / 2], [0.035, 0.6, 0.035])); // arms
    }
    parts.push(part(cyl, color, [0.03, 0.06, 0], [PI / 2, 0, 0], [0.045, 0.24, 0.045]));
    return { mount: 'head', geo: merge(parts), place: (P) => fit('specs', P) };
  },
  // Collar ring round the neck with a charm hanging in front.
  collar({ color = '#e64980', charm = 'heart', charmColor = '#ffd34d' }) {
    return { mount: 'head', geo: merge([ring(color), ...(charms[charm]?.(charmColor) ?? [])]), place: (P) => fit('collar', P) };
  },
  // Bandana: a thin band with a dotted triangle over the chest.
  bandana({ color = '#ff5d5d', dots = '#ffffff' }) {
    const parts = [ring(color, 0.12), part(triangle, color, [1.0, -0.3, 0], [0, PI / 2, 0], [0.62, 0.62, 1])];
    for (const [y, z] of [[-0.12, -0.32], [-0.1, 0.32], [-0.35, 0], [-0.55, -0.12], [-0.08, 0]]) parts.push(part(sphere, dots, [1.09, y, z], [0, 0, 0], [0.03, 0.06, 0.06]));
    return { mount: 'head', geo: merge(parts), place: (P) => fit('collar', P) };
  },
  // Sailor collar: navy band, square flap on the back with a white stripe, red knot in front.
  sailor({ color = '#2f4fa8', stripe = '#ffffff', knot = '#ff4f5e' }) {
    return { mount: 'head', geo: merge([
      ring(color, 0.15),
      part(new THREE.BoxGeometry(1, 1, 1), color, [-0.95, -0.25, 0], [0, 0, -1.0], [0.08, 0.95, 1.5]),
      part(new THREE.BoxGeometry(1, 1, 1), stripe, [-0.99, -0.25, 0], [0, 0, -1.0], [0.04, 0.75, 1.25]),
      part(new THREE.BoxGeometry(1, 1, 1), color, [-1.01, -0.25, 0], [0, 0, -1.0], [0.04, 0.6, 1.05]),
      part(sphere, knot, [1.08, -0.1, 0], [0, 0, 0], 0.18),
      part(cone, knot, [1.08, -0.42, -0.12], [0, 0, PI], [0.12, 0.4, 0.06]),
      part(cone, knot, [1.08, -0.42, 0.12], [0, 0, PI], [0.12, 0.4, 0.06]),
    ]), place: (P) => fit('collar', P) };
  },
  // Flower ruff: big petals all round the neck.
  bloom({ a = '#ffb3d1', b = '#ffd9a8', middle = '#fff2a8' }) {
    const parts = [ring(middle, 0.14)];
    for (let i = 0; i < 7; i++) {
      const t = i / 7 * PI * 2, x = Math.cos(t), z = Math.sin(t);
      parts.push(part(sphere, i % 2 ? a : b, [x * 1.12, -0.05, z * 1.12], [0, -t, -0.35], [0.42, 0.12, 0.34]));
    }
    return { mount: 'head', geo: merge(parts), place: (P) => fit('collar', P) };
  },
  // Cookie backpack tilted on the back, on two brown straps.
  satchel({ cookie = '#d9a05b', chips = '#6b3f2a', strap = '#a76e42' }) {
    const cake = [orb(shade(cookie, 0.78), [0, 0, 0], [0.64, 0.15, 0.55]), orb(cookie, [0, 0.12, 0], [0.61, 0.14, 0.52])];
    for (const [x, z] of [[-0.28, -0.15], [0.22, -0.2], [0.05, 0.2], [-0.3, 0.2], [0.3, 0.1]]) cake.push(orb(chips, [x, 0.245, z], [0.09, 0.035, 0.075]));
    const parts = [...straps(strap), part(tight(cake), null, [0, 0.38, 0], [0, 0, -0.65])];
    parts.push(part(hoop(0.1, 0.025, 12), '#e5b365', [0.33, -0.2, 0.57])); // buckle
    return { mount: 'back', geo: tight(parts), place: (P) => fit('satchel', P, P.bw) };
  },
  // Fairy wings: two pairs of rounded petal wings on the back.
  wings({ color = '#e6dcff', edge = '#ffc4e1' }) {
    const petal = flat((q) => {
      q.moveTo(0, -0.2); q.bezierCurveTo(-0.35, 0.1, -0.47, 0.85, -0.08, 1.02); q.bezierCurveTo(0.38, 1.05, 0.43, 0.33, 0, -0.2);
    }, 0.05, 0.05);
    const parts = [];
    for (const k of [-1, 1]) {
      parts.push(part(petal, color, [-0.06, 0.05, k * 0.1], [k * 0.62, 0, -0.23], [0.75, 0.8, 1]));
      parts.push(part(petal, edge, [-0.3, 0.04, k * 0.13], [k * 0.68, 0, 0.5], [0.66, 0.6, 1]));
    }
    parts.push(orb(edge, [-0.05, 0.02, 0], 0.1));
    return { mount: 'back', flap: true, geo: tight(parts), place: (P) => fit('wings', P, P.bw) };
  },
  // Fluffy pompom on the tail.
  pompom({ color = '#ff8fc8' }) {
    return { mount: 'tail', geo: merge([part(ball, color, [0, 0.5, 0])]), place: (P) => fit('tail', P, 1) };
  },
  // Rubber duck riding the tail.
  duck({ color = '#ffd84a', beak = '#ff9a3c', eye = '#3a2418' }) {
    return { mount: 'tail', geo: merge([
      part(sphere, color, [0, 0.62, 0], [0, 0, 0], [1.0, 0.72, 0.8]),
      part(sphere, color, [-0.75, 0.9, 0], [0, 0, 0.6], [0.35, 0.18, 0.3]), // tail flick
      part(sphere, color, [0.45, 1.4, 0], [0, 0, 0], 0.55),
      part(sphere, beak, [0.98, 1.32, 0], [0, 0, 0], [0.3, 0.12, 0.26]),
      part(sphere, eye, [0.78, 1.55, -0.3], [0, 0, 0], 0.08),
      part(sphere, eye, [0.78, 1.55, 0.3], [0, 0, 0], 0.08),
    ]), place: (P) => fit('tail', P, 1) };
  },
  // Pinwheel: three wide bright blades spinning on a stick; faster when running.
  pinwheel({ stick = '#ffffff', blades = ['#ff6f9f', '#5ab0ff', '#ffd34d'] }) {
    const parts = [part(cyl, stick, [0, 0.4, 0], [0, 0, 0], [0.1, 0.8, 0.1]), part(sphere, '#ffd34d', [0, 0.85, 0], [0, 0, 0], 0.18)];
    blades.forEach((c, i) => { const a = i / blades.length * PI * 2; parts.push(part(sphere, c, [Math.cos(a) * 0.62, 0.85, Math.sin(a) * 0.62], [0.35, -a, 0], [0.62, 0.06, 0.32])); });
    return { mount: 'tail', spin: true, geo: merge(parts), place: (P) => fit('pinwheel', P, 1) };
  },
  // Bunny ears on a hairband over the head.
  bunny({ band = '#9fe0c8', fur = '#fffaf5', inner = '#ffb3c7' }) {
    const parts = [part(arc(1, 0.09), band, [0, 0, 0], [0, PI / 2, 0])];
    for (const s of [-1, 1]) {
      parts.push(part(sphere, fur, [0, 1.3, s * 0.4], [s * 0.2, 0, 0], [0.13, 0.58, 0.26]));
      parts.push(part(sphere, inner, [0.08, 1.28, s * 0.4], [s * 0.2, 0, 0], [0.07, 0.42, 0.15]));
    }
    return { mount: 'head', geo: merge(parts), place: (P) => fit('bunny', P) };
  },
  // Ushanka: a low dome, a fur brim and fold, ear flaps, one pompom.
  ushanka({ color = '#8fb8ec', fur = '#fff6ea' }) {
    const parts = [part(dome, color, [0, 0, 0], [0, 0, 0], [1, 0.75, 1]), part(torus(1, 0.2, 32), fur, [0, 0.02, 0], [PI / 2, 0, 0])];
    for (const s of [-1, 1]) parts.push(part(sphere, fur, [-0.05, -0.4, s * 0.98], [s * 0.15, 0, 0], [0.4, 0.52, 0.17]));
    parts.push(part(sphere, fur, [0.95, 0.15, 0], [0, 0, -0.3], [0.2, 0.34, 0.8]));
    parts.push(part(ball, fur, [-0.1, 0.85, 0], [0, 0, 0], 0.28));
    return { mount: 'head', geo: merge(parts), place: (P) => fit('ushanka', P) };
  },
  // Clover wreath: a thin green ring with trefoils facing out.
  clover({ vine = '#4f9a42', leaf = '#6cc35a' }) {
    const tre = merge([0, 1, 2].map((k) => { const f = k * PI * 2 / 3; return part(leafHeart, leaf, [Math.sin(f) * 0.32, Math.cos(f) * 0.32, 0], [0, 0, -f], [0.32, 0.32, 0.3]); })
      .concat([part(sphere, vine, [0, 0, 0.05], [0, 0, 0], 0.1)]));
    const parts = [part(torus(1, 0.06, 32), vine, [0, 0, 0], [PI / 2, 0, 0])];
    for (const a of [-1.7, -0.85, 0, 0.85, 1.7, PI]) parts.push(part(tre, null, [Math.cos(a) * 1.02, 0.08, -Math.sin(a) * 1.02], [0, a + PI / 2, 0], 0.62));
    return { mount: 'head', geo: merge(parts), place: (P) => fit('clover', P) };
  },
  // Cupcake crown: a little cup with cream puffs and a cherry (small, not a tower).
  cupcake({ cup = '#f2b84b', cream = '#ffa3c4', cherry = '#ff4f6a' }) {
    const parts = [part(new THREE.CylinderGeometry(1, 0.72, 0.8, 14), (x, y, z) => Math.floor((Math.atan2(z, x) + 4) * 14 / (PI * 2)) % 2 ? cup : shade(cup, 0.88), [0, 0.4, 0]),
      part(torus(0.96, 0.1), shade(cup, 0.85), [0, 0.8, 0], [PI / 2, 0, 0])];
    for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2; parts.push(part(ball, cream, [Math.cos(a) * 0.72, 0.98, Math.sin(a) * 0.72], [0, 0, 0], 0.42)); }
    parts.push(part(ball, cream, [0, 1.2, 0], [0, 0, 0], 0.62), part(ball, cherry, [0, 1.9, 0], [0, 0, 0], 0.3));
    parts.push(part(cyl, '#5a8a3a', [0.08, 2.25, 0], [0, 0, -0.4], [0.05, 0.32, 0.05]));
    return { mount: 'head', geo: merge(parts), place: (P) => fit('cupcake', P) };
  },
  // Tartan scarf: a thick checked ring and one end hanging on the chest side.
  scarf({ color = '#d9483b', check = '#f6d6a8' }) {
    const ringCol = (x, y, z) => Math.floor((Math.atan2(y, x) + 4) * 2.6) % 3 === 0 || Math.abs(z) < 0.08 ? check : color;
    const endCol = (x, y) => Math.floor((y + 0.5) * 5) % 3 === 0 || Math.abs(x) < 0.1 ? check : color;
    const parts = [part(new THREE.TorusGeometry(1, 0.4, 10, 60), ringCol, [0, 0, 0], [PI / 2, 0, 0])];
    parts.push(part(box(4, 10, 1), endCol, [0.8, -0.75, 0.66], [0.2, -0.6, 0.15], [0.7, 1.3, 0.18]));
    for (let i = 0; i < 4; i++) parts.push(part(cyl, check, [0.86 + (i - 1.5) * 0.14, -1.5, 0.58 + (i - 1.5) * 0.11], [0.2, -0.6, 0.15], [0.045, 0.22, 0.045]));
    return { mount: 'head', geo: merge(parts), place: (P) => fit('collar', P) };
  },
  // Ruff: five big soft folds round the front, a small bow tie in the middle.
  ruff({ color = '#fff6e6', edge = '#ead7b6', bow = '#ff6f6f' }) {
    const parts = [ring(edge, 0.12)];
    for (const t of [-1.25, -0.62, 0, 0.62, 1.25]) {
      const x = Math.cos(t), z = Math.sin(t);
      parts.push(part(sphere, (px) => px > 0.6 ? edge : color, [x * 1.1, -0.12, z * 1.1], [0, -t, -0.45], [0.46, 0.13, 0.36]));
    }
    parts.push(...charms.bowtie(bow));
    return { mount: 'head', geo: merge(parts), place: (P) => fit('collar', P) };
  },
  // Ribbon with a bell: a mint band, a big bow and a golden bell with a slit.
  ribbon({ color = '#9fe6c8', bell = '#f2c14e', slit = '#6b3f2a' }) {
    return { mount: 'head', geo: merge([
      ring(color, 0.12),
      part(cone, color, [1.05, 0.05, -0.42], [PI / 2, 0, 0], [0.34, 0.66, 0.2]),
      part(cone, color, [1.05, 0.05, 0.42], [-PI / 2, 0, 0], [0.34, 0.66, 0.2]),
      part(sphere, color, [1.1, 0.05, 0], [0, 0, 0], 0.18),
      part(sphere, (x, y) => Math.abs(y + 0.2) < 0.12 && y < 0 ? slit : bell, [1.16, -0.38, 0], [0, 0, 0], 0.3),
      part(sphere, shade(bell, 0.8), [1.16, -0.1, 0], [0, 0, 0], 0.08),
    ]), place: (P) => fit('collar', P) };
  },
  // Heart-shaped frames, no dark lenses.
  hearts({ color = '#ff6f86' }) {
    const parts = [];
    for (const z of [-0.42, 0.42]) {
      parts.push(part(heartRing, color, [0, 0.02, z], [0, PI / 2, 0], [0.3, 0.3, 0.4]));
      parts.push(part(cyl, color, [-0.3, 0.06, z * 1.62], [0, 0, PI / 2], [0.035, 0.6, 0.035]));
    }
    parts.push(part(cyl, color, [0.03, 0.12, 0], [PI / 2, 0, 0], [0.045, 0.22, 0.045]));
    return { mount: 'head', geo: merge(parts), place: (P) => fit('specs', P) };
  },
  // Brush moustache: two soft lobes above the mouth corners, tips curling up.
  moustache({ color = '#7a4a30' }) {
    const parts = [];
    for (const s of [-1, 1]) {
      parts.push(part(sphere, color, [0, 0, s * 0.27], [-0.35 * s, 0, 0], [0.13, 0.14, 0.32]));
      parts.push(part(sphere, color, [-0.02, 0.14, s * 0.56], [-0.9 * s, 0, 0], [0.09, 0.09, 0.15]));
    }
    return { mount: 'head', geo: merge(parts), place: (P) => fit('moustache', P) };
  },
  // A small bow on the tail curl.
  tailbow(look) {
    const b = BUILD.bow(look);
    return { mount: 'tail', geo: b.geo, place: (P) => fit('tailbow', P, 1) };
  },
  // Carrot on the tail: a ribbed cone and three leaves (nothing that looks edible on the grass).
  carrot({ color = '#ff8a3d', leaf = '#7cc77a' }) {
    const parts = [part(cone, (x, y) => Math.floor((y + 0.5) * 7) % 2 ? color : shade(color, 0.9), [0.1, 1.0, 0], [0, 0, -0.35], [0.36, 1.3, 0.36])];
    for (const a of [-0.9, 0, 0.9]) parts.push(part(sphere, leaf, [-0.15 + Math.sin(a) * 0.15, 0.32, Math.cos(a) * 0.22], [a * 0.5, 0, 0.9], [0.32, 0.1, 0.16]));
    return { mount: 'tail', geo: merge(parts), place: (P) => fit('tail', P, 1) };
  },
  // Little lantern: frame, warm glass, a cap and a handle; no real light.
  lantern({ frame = '#7fae8f', glass = '#fff1a8' }) {
    const parts = [
      part(cyl, frame, [0, 0.42, 0], [0, 0, 0], [0.55, 0.14, 0.55]),
      part(cyl, (x, y) => Math.abs(y) < 0.3 ? glass : '#ffe066', [0, 0.88, 0], [0, 0, 0], [0.45, 0.8, 0.45]),
      part(cone, frame, [0, 1.48, 0], [0, 0, 0], [0.62, 0.4, 0.62]),
      part(torus(0.2, 0.05, 16), frame, [0, 1.8, 0]),
    ];
    for (let i = 0; i < 4; i++) { const a = i / 4 * PI * 2 + PI / 4; parts.push(part(cyl, frame, [Math.cos(a) * 0.46, 0.88, Math.sin(a) * 0.46], [0, 0, 0], [0.05, 0.82, 0.05])); }
    return { mount: 'tail', geo: merge(parts), place: (P) => fit('tail', P, 1) };
  },
  // Turtle backpack: a low shell of big plates on a cream rim, strap round the chest.
  turtle({ shell = '#7cc79a', plate = '#a3dcb6', rim = '#fff1d6' }) {
    const plates = (x, y, z) => {
      const a = (Math.atan2(z, x) + PI) / (PI * 2);
      if (y > 0.84) return plate;
      if (Math.abs(y - 0.84) < 0.07 || Math.abs(y - 0.42) < 0.06) return shell;
      const n = y > 0.42 ? 6 : 10, f = (a * n) % 1;
      return f < 0.08 || f > 0.92 ? shell : plate;
    };
    return { mount: 'back', geo: merge([
      part(dome, plates, [0, 0, 0], [0, 0, 0], [1, 0.48, 0.85]),
      part(torus(1, 0.09, 40), rim, [0, 0, 0], [PI / 2, 0, 0], [1, 0.85, 1]),
      part(torus(0.62, 0.06, 32), shell, [0.55, -0.5, 0], [0, PI / 2, 0]),
      part(cyl, rim, [0.55, -0.35, 0.62], [PI / 2, 0, 0], [0.1, 0.05, 0.1]),
    ]), place: (P) => fit('turtle', P, P.bw) };
  },
  // Lilac saddle with a little plush bunny riding it (never above the dog's head).
  saddle({ pad = '#c3a6f0', fur = '#fffaf2', inner = '#ffb3c7', eye = '#3a2418' }) {
    const parts = [
      part(sphere, pad, [0, 0.04, 0], [0, 0, 0], [0.62, 0.15, 0.56]),
      part(torus(0.62, 0.06, 32), pad, [0.45, -0.5, 0], [0, PI / 2, 0]),
      part(cyl, shade(pad, 1.15), [0.45, -0.32, 0.62], [PI / 2, 0, 0], [0.1, 0.05, 0.1]),
      part(sphere, fur, [0.15, 0.36, 0], [0, 0, 0], [0.26, 0.28, 0.25]),
      part(sphere, fur, [0.28, 0.74, 0], [0, 0, 0], 0.23),
      part(sphere, fur, [-0.12, 0.2, 0], [0, 0, 0], 0.1),
    ];
    for (const s of [-1, 1]) {
      const r = s > 0 ? [0.25, 0, 0.1] : [-0.9, 0, 0.4]; // one ear up, one flopped
      parts.push(part(sphere, fur, [0.22, 1.0, s * 0.12], r, [0.07, 0.3, 0.1]));
      parts.push(part(sphere, inner, [0.26, 1.0, s * 0.12], r, [0.035, 0.22, 0.06]));
      parts.push(part(sphere, eye, [0.48, 0.78, s * 0.09], [0, 0, 0], 0.035));
      parts.push(part(sphere, inner, [0.46, 0.68, s * 0.15], [0, 0, 0], [0.02, 0.04, 0.05]));
      parts.push(part(sphere, fur, [0.36, 0.2, s * 0.14], [0, 0, 0], [0.12, 0.07, 0.08]));
    }
    return { mount: 'back', geo: merge(parts), place: (P) => fit('saddle', P, P.bw) };
  },
  // Picnic basket: woven box, gingham lid, low handle, chest strap.
  picnic({ wicker = '#d9a05b', lid = '#bfe8cf', check = '#ffffff', strap = '#8a5a3c' }) {
    const weave = (x, y, z) => (Math.floor((y + 0.5) * 4) + Math.floor((x + z + 2) * 5)) % 2 ? wicker : shade(wicker, 0.82);
    const gingham = (x, y, z) => { const a = Math.floor((x + 1) * 6) % 2, b = Math.floor((z + 1) * 6) % 2; return a && b ? shade(lid, 0.85) : a || b ? lid : check; };
    return { mount: 'back', geo: merge([
      part(box(8, 4, 6), weave, [0, 0.28, 0], [0, 0, 0], [0.84, 0.5, 0.62]),
      part(box(8, 1, 6), gingham, [0, 0.58, 0], [0, 0, 0], [0.92, 0.12, 0.7]),
      part(arc(0.3, 0.04), strap, [0, 0.64, 0]),
      part(box(), strap, [0.46, 0.4, 0], [0, 0, 0], [0.04, 0.14, 0.12]),
      part(torus(0.62, 0.06, 32), strap, [0.5, -0.45, 0], [0, PI / 2, 0]),
    ]), place: (P) => fit('picnic', P, P.bw) };
  },
  // Shoes replace the paw (unit paw: radius 1, sole at y = -1, x forward); DogVisual puts one on each foot.
  shoes({ style, color, sole = '#ffffff', trim = '#ffffff' }) {
    let parts;
    if (style === 'sneakers') {
      parts = [part(sphere, color, [0.05, -0.05, 0], [0, 0, 0], [1.12, 0.85, 1.08]),
        part(sphere, sole, [0.05, -0.72, 0], [0, 0, 0], [1.2, 0.34, 1.14]),
        part(sphere, sole, [0.88, -0.4, 0], [0, 0, 0], [0.34, 0.36, 0.64])];
      for (const [x, y] of [[0.2, 0.76], [0.52, 0.66]]) parts.push(part(cyl, trim, [x, y, 0], [PI / 2, 0, 0], [0.08, 1.1, 0.08]));
    } else if (style === 'felt') {
      parts = [part(sphere, color, [0.05, -0.05, 0], [0, 0, 0], [1.1, 0.95, 1.06]),
        part(torus(0.8, 0.24), sole, [0, 0.7, 0], [PI / 2, 0, 0]),
        part(heart, trim, [1.12, 0.02, 0], [0, PI / 2, 0], [0.26, 0.26, 0.12])];
    } else { // flippers: a dome and a short flat fin, at most a quarter of the dog's size longer
      parts = [part(sphere, color, [0, -0.1, 0], [0, 0, 0], [1.05, 0.85, 1.0]),
        part(sphere, color, [0.7, -0.88, 0], [0, 0, 0], [1.0, 0.1, 0.95])];
      for (const z of [-0.55, 0, 0.55]) {
        parts.push(part(sphere, color, [1.55, -0.88, z], [0, 0, 0], [0.22, 0.1, 0.3]));
        parts.push(part(cyl, trim, [1.0, -0.8, z * 0.9], [0, 0, PI / 2], [0.05, 0.9, 0.05]));
      }
    }
    return { mount: 'paw', geo: merge(parts) };
  },
  propeller(look) { return BUILD.pinwheel({ blades: [look.blades ?? '#5ab0ff', look.blades ?? '#5ab0ff'] }); },
  garment: (look) => look.cut === 'frog' ? frogHood(look) : garment(look),
};

const looks = new Map();
let itemMat = null;
export function itemMaterial() { return itemMat ??= Object.assign(toonMaterial('#ffffff'), { vertexColors: true }); }

// look: { kind, ...params } from the catalog. Cached by id.
export function buildLook(id, look) {
  if (looks.has(id)) return looks.get(id);
  const b = BUILD[look.kind];
  const res = b ? b(look) : null;
  looks.set(id, res);
  return res;
}

// Boots and coat colours are tints, not meshes: materials shared per colour.
const tintMats = new Map();
export function bootMaterial(color) {
  if (!tintMats.has(color)) tintMats.set(color, coatMaterial(color));
  return tintMats.get(color);
}

// A bought coat colour for all six stages: the puppy a paler version, the grown dog the full one.
const palettes = new Map();
export function coatPalette(look) {
  const key = look.coat + look.light + look.ear + (look.spots ?? '');
  if (palettes.has(key)) return palettes.get(key);
  const light = new THREE.Color(look.light), c = new THREE.Color(), e = new THREE.Color();
  const pal = [0.4, 0.3, 0.2, 0.1, 0.04, 0].map((k) => ({
    coat: '#' + c.set(look.coat).lerp(light, k).getHexString(),
    light: look.light,
    ear: '#' + e.set(look.ear).lerp(light, k * 0.6).getHexString(),
  }));
  if (look.spots) pal.spots = look.spots.map((s) => new THREE.Color(s)); // marble: patches on the body
  palettes.set(key, pal);
  return pal;
}
