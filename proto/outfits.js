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
  bow: [0.04, 0.5, 0.3, 0.5, 0.25, 0.15, 0.32],
  daisy: [0.04, 0.5, 0.3, 0.5, 0.25, 0.15, 0.3],
  crown: [-0.05, 0.56, 0, 0, 0, -0.12, 0.19],
  beret: [-0.06, 0.55, 0, 0.1, 0, -0.25, 0.3],
  chef: [-0.08, 0.55, 0, 0, 0, -0.15, 0.27],
  party: [-0.02, 0.56, 0.06, 0.25, 0, -0.2, 0.32],
  tiara: [-0.02, 0.5, 0, 0, 0, -0.18, 0.36],
  collar: [-0.08, -0.42, 0, 0, 0, -0.3, 0.36],
  specs: [0.56, 0.02, 0, 0, 0, -0.05, 0.5], // lenses round the eyes (x 0.475, z ±0.21, r 0.13 hw)
  satchel: [0.32, -0.02, 0, 0, 0, 0.2, 0.62],
  wings: [0.3, 0.02, 0, 0, 0, 0.15, 0.8],
  tail: [0, 0, 0, 0, 0, 0, 0.22],
  pinwheel: [0, 0, 0, 0, 0, 0, 0.3],
};
const fit = (k, P, unit = P.hw) => { const f = FIT[k]; return [[f[0] * unit, f[1] * unit, f[2] * unit], [f[3], f[4], f[5]], f[6] * unit]; };

const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), S = new THREE.Vector3();
const PI = Math.PI;

// One coloured part of an item: geometry moved into place (pos, rotation, scale), flat colour.
function part(geo, color, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  if (typeof scale === 'number') scale = [scale, scale, scale];
  g.applyMatrix4(M.compose(V.set(...pos), Q.setFromEuler(E.set(...rot)), S.set(...scale)));
  const c = new THREE.Color(color), n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
const merge = (parts) => { const g = mergeGeometries(parts); g.computeBoundingSphere(); return g; };

const sphere = new THREE.SphereGeometry(1, 16, 12), ball = new THREE.IcosahedronGeometry(1, 2);
const torus = (r = 1, t = 0.25, seg = 24) => new THREE.TorusGeometry(r, t, 8, seg);
const cone = new THREE.ConeGeometry(1, 1, 12), cyl = new THREE.CylinderGeometry(1, 1, 1, 18);
function extrude(draw, depth = 0.35, bevel = 0.12) {
  const s = new THREE.Shape(); draw(s);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 10 });
  g.translate(0, 0, -depth / 2);
  return g;
}
const heart = extrude((s) => {
  s.moveTo(0, -1); s.bezierCurveTo(-0.6, -0.45, -1.15, -0.05, -0.95, 0.45);
  s.bezierCurveTo(-0.75, 0.95, -0.15, 0.95, 0, 0.5); s.bezierCurveTo(0.15, 0.95, 0.75, 0.95, 0.95, 0.45);
  s.bezierCurveTo(1.15, -0.05, 0.6, -0.45, 0, -1);
});
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
  bee: {
    mask: (d) => d.y > -0.6 && d.x < 0.6 && d.x > -0.72,
    gap: () => 0.07,
    paint: (d, L) => Math.floor((d.x + 1.17) * 3.6) % 2 ? L.stripe : L.color,
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

// --- Builders: look params → { mount, geo, place(P) → [pos, rot, scale], spin? } -----------------
const BUILD = {
  // Bow on the top of the head, a little to one side, like a hair clip.
  bow({ color = '#ff7eb6', knot = color, dots = null }) {
    const parts = [
      part(cone, color, [-0.62, 0, 0], [0, 0, PI / 2], [0.55, 0.85, 0.32]),
      part(cone, color, [0.62, 0, 0], [0, 0, -PI / 2], [0.55, 0.85, 0.32]),
      part(sphere, knot, [0, 0, 0], [0, 0, 0], [0.3, 0.3, 0.26]),
    ];
    if (dots) for (const sx of [-1, 1]) parts.push(part(sphere, dots, [sx * 0.62, 0.12, 0.27], [0, 0, 0], [0.11, 0.11, 0.05]));
    return { mount: 'head', geo: merge(parts), place: (P) => fit('bow', P) };
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
  // Cookie backpack lying on the back, with pink straps round the body.
  satchel({ cookie = '#d9a05b', chips = '#6b3f2a', strap = '#ff7fae' }) {
    const parts = [part(cyl, cookie, [0, 0.1, 0], [0, 0, 0], [0.42, 0.16, 0.42])];
    for (const [x, z] of [[0.15, 0.1], [-0.18, 0.12], [0.02, -0.2], [-0.12, -0.05], [0.22, -0.15]]) parts.push(part(sphere, chips, [x, 0.19, z], [0, 0, 0], [0.06, 0.03, 0.06]));
    parts.push(part(torus(0.5, 0.04, 32), strap, [0.12, -0.42, 0], [0, PI / 2, 0], [1, 0.95, 1]));
    return { mount: 'back', geo: merge(parts), place: (P) => fit('satchel', P, P.bw) };
  },
  // Fairy wings: two pairs of petal wings on the back.
  wings({ color = '#e6dcff', edge = '#ffc4e1' }) {
    const parts = [];
    for (const s of [-1, 1]) {
      parts.push(part(sphere, color, [-0.12, 0.38, s * 0.42], [s * 0.7, 0.35, 0.55], [0.5, 0.05, 0.3]));
      parts.push(part(sphere, edge, [-0.32, 0.18, s * 0.34], [s * 0.45, 0.2, -0.2], [0.32, 0.045, 0.2]));
    }
    parts.push(part(sphere, edge, [-0.12, 0.08, 0], [0, 0, 0], 0.08));
    return { mount: 'back', flap: true, geo: merge(parts), place: (P) => fit('wings', P, P.bw) };
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
  propeller(look) { return BUILD.pinwheel({ blades: [look.blades ?? '#5ab0ff', look.blades ?? '#5ab0ff'] }); },
  garment,
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
  const key = look.coat + look.light + look.ear;
  if (palettes.has(key)) return palettes.get(key);
  const light = new THREE.Color(look.light), c = new THREE.Color(), e = new THREE.Color();
  const pal = [0.4, 0.3, 0.2, 0.1, 0.04, 0].map((k) => ({
    coat: '#' + c.set(look.coat).lerp(light, k).getHexString(),
    light: look.light,
    ear: '#' + e.set(look.ear).lerp(light, k * 0.6).getHexString(),
  }));
  palettes.set(key, pal);
  return pal;
}
