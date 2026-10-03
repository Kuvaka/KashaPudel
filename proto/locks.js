// Big fur locks: one explicit list of lock centres per part (unit sphere directions), shared by
// the CPU bake (silhouette bumps, crease shade) and the coat shader (ink arcs inside each lock),
// so the painted lines always sit on the baked lumps.
import * as THREE from 'three';

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9 >>> 0; s ^= s >>> 13; return (s >>> 0) / 4294967296; };
}

// Fibonacci sphere with a little jitter; comb = down and back along the surface, turned per lock.
function makeLocks(n, seed, inkShare) {
  const r = rng(seed), seeds = [], guides = [], ink = [];
  const comb = new THREE.Vector3(), axis = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const y = 1 - 2 * (i + 0.5) / n, rad = Math.sqrt(1 - y * y), a = i * 2.39996 + r() * 0.5;
    const p = new THREE.Vector3(Math.cos(a) * rad, y, Math.sin(a) * rad);
    p.add(new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).multiplyScalar(0.18)).normalize();
    comb.set(-0.35, -1, 0).addScaledVector(p, -p.dot(comb.set(-0.35, -1, 0)));
    if (comb.lengthSq() < 1e-4) comb.set(-1, 0, 0).addScaledVector(p, -p.x);
    comb.normalize().applyAxisAngle(axis.copy(p), (r() - 0.5) * 0.7);
    seeds.push(p); guides.push(comb.clone()); ink.push(r() < inkShare ? 1 : 0);
  }
  return { seeds, guides, ink };
}

export const HEAD_LOCKS = makeLocks(20, 7, 0.75);
export const BODY_LOCKS = makeLocks(26, 19, 0.75);

// Lock field at a direction: 1 in the middle of a lock, 0 on the border between two.
export function lockField(locks, d) {
  let f1 = 9, f2 = 9;
  for (const s of locks.seeds) {
    const q = d.distanceToSquared(s);
    if (q < f1) { f2 = f1; f1 = q; } else if (q < f2) f2 = q;
  }
  const e = Math.sqrt(f2) - Math.sqrt(f1), t = Math.min(1, Math.max(0, e / 0.45));
  return t * t * (3 - 2 * t);
}
