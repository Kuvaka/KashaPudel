// Things on the field that change the race: spring puddles and summer mud (flat decals, one
// merged mesh per race), winter snowdrifts (instanced toon mounds) and the little piles dogs
// leave behind (one instanced toon mesh + outline). Autumn leaf piles are in seasonFx.js.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/BufferGeometryUtils.js';
import { toonMaterial, outlineMaterial } from './toon.js';
import { CONFIG } from '../src/config.js';

const TAU = Math.PI * 2;
const PO = CONFIG.poop;

// A soft-serve swirl: three squashed rings getting smaller, and a curled tip. Height ~1.5, radius 1.
function pileGeometry() {
  const parts = [];
  const tint = (g, k) => {
    const n = g.attributes.position.count, c = new Float32Array(n * 3), v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(g.attributes.position, i);
      const sh = k * (0.85 + 0.3 * Math.max(0, v.y - 0.1)); // a touch lighter towards the top
      c[i * 3] = 0.56 * sh; c[i * 3 + 1] = 0.36 * sh; c[i * 3 + 2] = 0.23 * sh;
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return g;
  };
  for (const [y, r, t] of [[0.32, 0.72, 0.36], [0.78, 0.5, 0.29], [1.14, 0.28, 0.22]]) {
    const g = new THREE.TorusGeometry(r, t, 10, 24);
    g.rotateX(Math.PI / 2); g.scale(1, 0.95, 1); g.translate(0, y, 0);
    parts.push(tint(g, 1));
    const cap = new THREE.SphereGeometry(r, 16, 8); cap.scale(1, 0.6, 1); cap.translate(0, y, 0); // fills the hole
    parts.push(tint(cap, 1));
  }
  const tip = new THREE.ConeGeometry(0.2, 0.42, 10); tip.rotateZ(-0.5); tip.translate(0.08, 1.48, 0);
  parts.push(tint(tip, 1.1));
  for (const g of parts) { g.deleteAttribute('uv'); }
  return mergeGeometries(parts.map((g) => g.index ? g.toNonIndexed() : g));
}

// Puddles of one race merged into one mesh. aEdge: 0 in the middle, 1 at the water's edge,
// 1.18 at the outer end of the muddy rim. aLocal: position in puddle radii (for the glints).
function puddleGeometry(puddles) {
  const pos = [], edge = [], loc = [];
  const N = 40;
  for (const p of puddles) {
    const rad = (a) => p.r * (1 + 0.1 * Math.sin(3 * a + p.seed * 9) + 0.06 * Math.sin(5 * a + p.seed * 17));
    const ring = (k) => Array.from({ length: N }, (_, i) => {
      const a = i / N * TAU, r = rad(a) * k;
      return [p.x + Math.cos(a + p.rot) * r, p.y + Math.sin(a + p.rot) * r * 0.82, Math.cos(a) * k, Math.sin(a) * k];
    });
    const inner = ring(1), outer = ring(1.18);
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      // Fan: centre, edge i, edge j.
      for (const [q, e] of [[[p.x, p.y, 0, 0], 0], [inner[j], 1], [inner[i], 1]]) { pos.push(q[0], 0.5, q[1]); edge.push(e); loc.push(q[2], q[3]); }
      // Rim quad: inner i, inner j, outer j / inner i, outer j, outer i.
      for (const [q, e] of [[inner[i], 1], [inner[j], 1], [outer[j], 1.18], [inner[i], 1], [outer[j], 1.18], [outer[i], 1.18]]) {
        pos.push(q[0], 0.5, q[1]); edge.push(e); loc.push(q[2], q[3]);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aEdge', new THREE.Float32BufferAttribute(edge, 1));
  g.setAttribute('aLocal', new THREE.Float32BufferAttribute(loc, 2));
  return g;
}

// A snowdrift: a soft main mound with two smaller lumps, white on top, blue in the shade.
function driftGeometry() {
  const parts = [];
  for (const [x, z, r, h] of [[0, 0, 1, 0.62], [0.6, 0.32, 0.55, 0.45], [-0.5, -0.38, 0.5, 0.38]]) {
    const g = new THREE.SphereGeometry(r, 18, 9, 0, TAU, 0, Math.PI / 2);
    g.scale(1, h / r, 1); g.translate(x, 0, z);
    const n = g.attributes.position.count, c = new Float32Array(n * 3), v = new THREE.Vector3();
    const lo = new THREE.Color('#86a6d4'), hi = new THREE.Color('#fbfdff'), t = new THREE.Color();
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(g.attributes.position, i);
      // Lit from the upper left: the far / lower side goes blue.
      const lit = Math.min(1, Math.max(0, 0.2 + v.y / 0.55 * 0.7 + (-(v.x - x) * 0.35 + (v.z - z) * 0.2) / r));
      t.copy(lo).lerp(hi, lit);
      c[i * 3] = t.r; c[i * 3 + 1] = t.g; c[i * 3 + 2] = t.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    g.deleteAttribute('uv');
    parts.push(g.index ? g.toNonIndexed() : g);
  }
  return mergeGeometries(parts);
}

const WATER = { deep: '#5aa9d6', light: '#bfe9fb', rim: '#6f7f3a', glint: 1 };
const MUD = { deep: '#5e3f22', light: '#8b6440', rim: '#7b6034', glint: 0.35 };

function puddleMaterial(L = WATER) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: {
      uTime: { value: 0 }, uGlint: { value: L.glint },
      cDeep: { value: new THREE.Color(L.deep) }, cLight: { value: new THREE.Color(L.light) },
      cMud: { value: new THREE.Color(L.rim) },
    },
    vertexShader: `
      attribute float aEdge; attribute vec2 aLocal;
      varying float vEdge; varying vec2 vLocal; varying vec2 vW;
      void main() {
        vEdge = aEdge; vLocal = aLocal; vW = position.xz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform float uTime, uGlint; uniform vec3 cDeep, cLight, cMud;
      varying float vEdge; varying vec2 vLocal; varying vec2 vW;
      void main() {
        // Water: lighter towards the edge, two sky glints, slow ripples.
        vec3 c = mix(cDeep, cLight, smoothstep(0.55, 1.0, vEdge) * 0.55);
        float rip = sin(length(vLocal) * 18.0 - uTime * 2.0) * 0.5 + 0.5;
        c = mix(c, cLight, rip * 0.12 * (1.0 - vEdge));
        vec2 g = vLocal - vec2(-0.25, -0.3);
        c = mix(c, vec3(1.0), (1.0 - smoothstep(0.08, 0.12, length(g * vec2(1.0, 2.2)))) * 0.85 * uGlint);
        c = mix(c, vec3(1.0), (1.0 - smoothstep(0.04, 0.06, length((vLocal - vec2(0.05, -0.42)) * vec2(1.0, 2.2)))) * 0.7 * uGlint);
        // Dark line at the water's edge, then a soft wet-mud rim fading into the grass.
        float line = smoothstep(0.93, 0.99, vEdge) * (1.0 - smoothstep(1.0, 1.04, vEdge));
        c = mix(c, vec3(0.2, 0.32, 0.4), line * 0.6);
        float rim = step(1.0, vEdge);
        c = mix(c, cMud, rim);
        float a = mix(0.92, 0.55 * (1.0 - smoothstep(1.02, 1.18, vEdge)), rim);
        gl_FragColor = vec4(c, a);
        #include <colorspace_fragment>
      }`,
  });
}

export function buildHazards(scene) {
  // Piles.
  const pileMat = toonMaterial('#ffffff'); pileMat.vertexColors = true;
  const lineN = outlineMaterial(false);
  const geo = pileGeometry();
  const piles = new THREE.InstancedMesh(geo, pileMat, PO.max);
  const pileLine = new THREE.InstancedMesh(geo, lineN, PO.max);
  pileLine.instanceMatrix = piles.instanceMatrix;
  for (const m of [piles, pileLine]) { m.frustumCulled = false; m.count = 0; scene.add(m); }
  piles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // A glint dot on each pile so it reads as a cartoon prop, not dirt.
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p3 = new THREE.Vector3(), s3 = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);

  // Puddles and mud: rebuilt when a new race has a different layout.
  const pudMat = puddleMaterial(), mudMat = puddleMaterial(MUD);
  let pudMesh = null, pudOf = null, mudMesh = null, mudOf = null;
  const flat = (mesh, list, mat) => {
    if (mesh) { scene.remove(mesh); mesh.geometry.dispose(); }
    if (!list.length) return null;
    const m = new THREE.Mesh(puddleGeometry(list), mat);
    m.renderOrder = -1; m.frustumCulled = false;
    scene.add(m);
    return m;
  };

  // Snowdrifts.
  const driftMat = toonMaterial('#ffffff'); driftMat.vertexColors = true;
  const driftLine = outlineMaterial(false), dgeo = driftGeometry(), DMAX = 48;
  const drifts = new THREE.InstancedMesh(dgeo, driftMat, DMAX), driftOut = new THREE.InstancedMesh(dgeo, driftLine, DMAX);
  driftOut.instanceMatrix = drifts.instanceMatrix;
  drifts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (const m of [drifts, driftOut]) { m.frustumCulled = false; m.count = 0; scene.add(m); }
  const shown = new WeakMap(); // drift -> 0..1, grows back after it was knocked flat

  return {
    lineMats: [lineN, driftLine],
    update(game, t, dt = 0) {
      if (game.puddles !== pudOf) { pudOf = game.puddles; pudMesh = flat(pudMesh, pudOf ?? [], pudMat); }
      const muds = (game.obstacles ?? []).filter((o) => o.kind === 'mud');
      const mudKey = muds.length ? game.season : null;
      if (mudKey !== mudOf) { mudOf = mudKey; mudMesh = flat(mudMesh, muds, mudMat); }
      pudMat.uniforms.uTime.value = t; mudMat.uniforms.uTime.value = t * 0.3;

      let nd = 0;
      for (const o of game.obstacles ?? []) {
        if (o.kind !== 'drift') continue;
        let k = shown.get(o) ?? 1;
        k = o.gone > 0 ? 0 : Math.min(1, k + dt * 0.8);
        shown.set(o, k);
        if (k <= 0 || nd >= DMAX) continue;
        const e = k * k * (3 - 2 * k);
        p3.set(o.x, 0, o.y); q.setFromAxisAngle(UP, o.rot); s3.set(o.r * e, o.r * e * e * 1.1, o.r * e);
        drifts.setMatrixAt(nd++, m4.compose(p3, q, s3));
      }
      drifts.count = driftOut.count = nd;
      drifts.visible = driftOut.visible = nd > 0;
      drifts.instanceMatrix.needsUpdate = true;

      const list = game.poops ?? [];
      let n = 0;
      for (const p of list) {
        // Pops in with a little bounce, sinks away at the end of its life.
        const a = p.age, k = a < 0.3 ? 1 + 0.25 * Math.sin(a / 0.3 * Math.PI) * (1 - a / 0.3) - (1 - a / 0.3) * 0.6 : 1;
        const out = Math.max(0, Math.min(1, (PO.lifeSec - a) / 0.6));
        const r = PO.r * 1.25 * Math.max(0.05, k) * out;
        p3.set(p.x, 0, p.y); q.setFromAxisAngle(UP, p.rot); s3.set(r, r * (1 + 0.04 * Math.sin(t * 5 + p.rot * 3)), r);
        piles.setMatrixAt(n++, m4.compose(p3, q, s3));
      }
      piles.count = pileLine.count = n;
      piles.visible = pileLine.visible = n > 0; // no empty draw calls
      piles.instanceMatrix.needsUpdate = true;
    },
  };
}
