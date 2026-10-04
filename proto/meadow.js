// Toon meadow around the race field: painted ground (tone patches, path, pond), sparse low
// decor inside the field, fence on the world border, bushes and trees beyond it, 3D food.
// Decor is instanced; each frame only instances near the camera are copied into the buffers,
// so the GPU never sees the whole world.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/BufferGeometryUtils.js';
import { curls } from './dogModel.js';
import { toonMaterial, outlineMaterial } from './toon.js';
import { mapPuddles, seasonObstacles } from '../src/game.js';

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
function layout(W, H, theme) {
  const pond = ['whale','yorknew','greed'].includes(theme)?{x:W+9000,z:-9000,r:0}:{ x: W + 230, z: -170, r: 190 };
  // Two soft decorative paths (flat, walkable): an arc through the south-west corner and a
  // meandering one across the north-east towards the pond.
  const path = (x, z) => {
    if (theme === 'kyoto') return Math.min(Math.abs(x-W*.5),Math.abs(z-H*.5))/2.4;
    const dx = x, dz = z - H, a = Math.atan2(-dz, dx);
    const p1 = Math.abs(Math.hypot(dx, dz) - (620 + 40 * Math.sin(a * 5 + 1)));
    const u = x / W, p2 = Math.abs(z - H * (0.38 - 0.3 * u) - 45 * Math.sin(u * 9.0)) * 0.9;
    return Math.min(p1, x > W * 0.45 ? p2 : 1e9);
  };
  // Clearings: lighter, calmer patches of grass of different shapes (flat paint only).
  const clearings = [];
  const cr = rng(77);
  for (let i = 0; i < 7; i++) clearings.push({ x: W * (0.1 + 0.8 * cr()), z: H * (0.1 + 0.8 * cr()),
    rx: 110 + cr() * 140, rz: 80 + cr() * 110, a: cr() * TAU });
  return { pond, path, pathHalf: 24, clearings: theme === 'kyoto' ? [] : clearings };
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
    let cl = 0;
    for (const c of L.clearings) {
      const ca = Math.cos(c.a), sa = Math.sin(c.a), dx = x - c.x, dz = z - c.z;
      const e = Math.hypot((dx * ca + dz * sa) / c.rx, (-dx * sa + dz * ca) / c.rz) + 0.15 * n2(x / 40, z / 40);
      cl = Math.max(cl, 1 - smooth(0.8, 1.05, e));
    }
    data[k + 3] = cl * 255;
  }
  const map = new THREE.DataTexture(data, S, S);
  map.magFilter = map.minFilter = THREE.LinearFilter;
  map.wrapS = map.wrapT = THREE.RepeatWrapping; // the cloud shadows scroll over it
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

function groundMaterial(W, H, M, S) {
  const col = (c) => new THREE.Color(c), G = S.ground;
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: M.map }, uDetail: { value: M.detail }, uX0: { value: M.x0 }, uSpan: { value: M.span },
      uField: { value: new THREE.Vector2(W, H) }, uTime: { value: 0 },
      cDark: { value: col(G.dark) }, cMid: { value: col(G.mid) }, cLight: { value: col(G.light) },
      cClear: { value: col(G.clear) },
      cPath: { value: col(G.path) }, cPathEdge: { value: col(G.pathEdge) },
      cWater: { value: col(G.water) }, cWaterLight: { value: col(G.waterLight) }, cShore: { value: col(G.shore) },
      uAdventure:{value:S.hxh??0}, uPaving: { value: S.paved ? 1 : 0 }, uIce: { value: S.ice ? 1 : 0 }, uDetailK: { value: G.detail ?? 0.08 },
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
      uniform float uX0, uSpan, uTime, uIce, uDetailK, uPaving, uAdventure;
      uniform vec2 uField;
      uniform vec3 cClear, cDark, cMid, cLight, cPath, cPathEdge, cWater, cWaterLight, cShore;
      varying vec2 vW;
      void main() {
        vec4 m = texture2D(uMap, (vW - uX0) / uSpan);
        float t = m.r;
        // Three close tones with wide soft transitions: patches that don't compete with the dogs.
        vec3 c = mix(cDark, cMid, smoothstep(0.34, 0.48, t));
        c = mix(c, cLight, smoothstep(0.56, 0.7, t));
        c = mix(c, cClear, m.a); // clearings
        c += (texture2D(uDetail, vW / 150.0).r - 0.5) * uDetailK * (1.0 - 0.6 * m.a);
        // Beyond the fence: a touch darker and cooler, so the field reads as the stage.
        vec2 out2 = max(-vW, vW - uField);
        float outside = smoothstep(0.0, 40.0, max(out2.x, out2.y));
        c = mix(c, c * vec3(0.84, 0.9, 0.92), outside);
        // Shade along the inside of the fence, as if from the bushes behind it.
        vec2 in2 = min(vW, uField - vW);
        c *= mix(0.86, 1.0, smoothstep(0.0, 70.0, min(in2.x, in2.y))) + outside * 0.14 * (1.0 - smoothstep(0.0, 70.0, min(in2.x, in2.y)));
        // Soft cloud shadows drifting over the meadow.
        float cl = texture2D(uMap, (vW + vec2(uTime * 9.0, uTime * 4.0) - uX0) / (uSpan * 1.7) + 0.31).r;
        c *= 1.0 - 0.04 * smoothstep(0.45, 0.65, cl);
        // Path with a darker rim.
        float p = m.g * 60.0;
        c = mix(c, cPathEdge, (1.0 - smoothstep(24.0, 30.0, p)) * 0.55);
        c = mix(c, cPath, 1.0 - smoothstep(17.0, 23.0, p));
        // Kyoto is flat painted stone. These rings and lanes never enter collision data.
        if (uPaving > 0.5) {
          vec2 centre = vW - uField * 0.5;
          float radius = length(centre);
          float mainDistance = min(abs(centre.x), abs(centre.y));
          float diagonalDistance = min(abs(centre.x - centre.y), abs(centre.x + centre.y)) * 0.707107;
          float mainEdge = 1.0 - smoothstep(55.0, 59.0, mainDistance);
          float mainFill = 1.0 - smoothstep(44.0, 48.0, mainDistance);
          float diagonalEdge = 1.0 - smoothstep(16.0, 20.0, diagonalDistance);
          float diagonalFill = 1.0 - smoothstep(10.0, 14.0, diagonalDistance);
          vec3 paving = mix(cMid, cLight, smoothstep(0.35, 0.72, t));
          paving = mix(paving, cPathEdge, max(mainEdge, diagonalEdge) * 0.65);
          paving = mix(paving, cPath, max(mainFill, diagonalFill));

          // A 310-unit plaza intersects the starting ring, so its border is in the first view.
          float plaza = 1.0 - smoothstep(308.0, 313.0, radius);
          vec3 plazaStone = mix(cClear, cPath, smoothstep(145.0, 152.0, radius) * 0.42);
          float innerRing = 1.0 - smoothstep(3.0, 6.0, abs(radius - 148.0));
          float outerRing = 1.0 - smoothstep(5.0, 8.0, abs(radius - 294.0));
          plazaStone = mix(plazaStone, cPathEdge, max(innerRing * 0.38, outerRing * 0.65));
          paving = mix(paving, plazaStone, plaza);

          // Low-contrast joints and sparse moss; no raised clumps on the race line.
          float row = floor(vW.y / 28.0);
          vec2 tile = vec2((vW.x + mod(row, 2.0) * 22.0) / 44.0, vW.y / 28.0);
          vec2 tileEdge = min(fract(tile), 1.0 - fract(tile));
          float joint = 1.0 - smoothstep(0.022, 0.055, min(tileEdge.x, tileEdge.y));
          float mossPatch = smoothstep(0.57, 0.68, texture2D(uMap, (vW * 2.4 - uX0) / uSpan + 0.19).r);
          paving *= 1.0 - joint * 0.065;
          paving = mix(paving, vec3(0.18, 0.235, 0.14), joint * mossPatch * 0.28 * (1.0 - plaza * 0.8));
          paving = mix(paving, paving * vec3(0.84, 0.9, 0.92), outside);
          float fenceShade = 1.0 - smoothstep(0.0, 70.0, min(in2.x, in2.y));
          paving *= 1.0 - 0.14 * fenceShade * (1.0 - outside);
          c = paving * (1.0 - 0.025 * smoothstep(0.45, 0.65, cl));
        }

        // Round 2: map identity remains visible inside the normal follow-camera footprint.
        if(uAdventure>0.5){
          vec2 q=vW-uField*.5;
          if(uAdventure<1.5){
            float r=length(q),ring=min(abs(r-150.0),abs(r-295.0));
            float lane=min(ring,abs(q.x-42.0*sin(q.y*.012)));
            c=mix(c,cPathEdge,(1.0-smoothstep(22.0,27.0,lane))*.65);
            c=mix(c,cPath,(1.0-smoothstep(17.0,22.0,lane))*.98);
            vec2 wet=mod(q+vec2(125.0,90.0),vec2(310.0,240.0))-vec2(155.0,120.0);
            float pool=length(wet/vec2(43.0,26.0));
            c=mix(c,cPath,1.0-smoothstep(.95,1.20,pool));
            vec3 tide=mix(vec3(.15,.42,.49),vec3(.51,.78,.75),.40+.12*sin(wet.x*.13));
            float glint=(1.0-smoothstep(.08,.20,abs(sin(wet.y*.27+uTime*.6))))*(1.0-smoothstep(.2,.8,abs(wet.x/43.0)));
            tide=mix(tide,vec3(.82,.92,.86),glint*.62);
            c=mix(c,tide,(1.0-smoothstep(.86,1.0,pool))*.88);
          }else if(uAdventure<2.5){
            vec2 grid=vec2(q.x+q.y,q.x-q.y)/48.0;
            float checker=mod(floor(grid.x)+floor(grid.y),2.0);
            vec2 tile=fract(grid);float edge=min(min(tile.x,1.0-tile.x),min(tile.y,1.0-tile.y));
            c=mix(cMid,cLight,.26+.30*checker);c=mix(c,cPathEdge,(1.0-smoothstep(.015,.045,edge))*.22);
            float lane=min(abs(q.x),abs(q.y));
            c=mix(c,cPath,(1.0-smoothstep(49.0,54.0,lane))*.9);
            c=mix(c,vec3(.75,.70,.59),(1.0-smoothstep(2.0,4.0,abs(lane-43.0)))*.85);
            float dia=min(abs(q.x)+abs(q.y),(abs(q.x)+abs(q.y-uField.y*.12))*1.7);c=mix(c,mix(cMid,cPath,.55),1.0-smoothstep(155.0,160.0,dia));
            c=mix(c,cPath,(1.0-smoothstep(2.0,5.0,abs(dia-169.0)))*.95);
            vec2 motif=mod(q+42.0,84.0)-42.0;float gem=abs(motif.x)+abs(motif.y);
            c=mix(c,cPathEdge,(1.0-smoothstep(10.0,13.0,gem))*(1.0-smoothstep(140.0,152.0,dia))*.8);
          }else{
            float check=mod(floor(vW.x/64.0)+floor(vW.y/64.0),2.0);
            c=mix(cMid,cLight,.25+.18*check);
            vec2 cell=mod(q+vec2(165.0,220.0),vec2(330.0,440.0))-vec2(165.0,220.0);
            float card=max(abs(cell.x)/112.0,abs(cell.y)/164.0);
            float edge=1.0-smoothstep(.98,1.01,card),fill=1.0-smoothstep(.92,.95,card);
            c=mix(c,cPathEdge,edge*.52);c=mix(c,cPath,fill*.55);
            float diamond=abs(cell.x)/30.0+abs(cell.y)/43.0;
            c=mix(c,cPathEdge,(1.0-smoothstep(.95,1.02,diamond))*.28);
          }
        }

        // Pond: grass rim, water, light ripples.
        float d = m.b * 120.0 - 60.0;
        c = mix(c, cShore, 1.0 - smoothstep(6.0, 8.0, d));
        vec3 water = cWater;
        float rip = sin(vW.x * 0.05 + uTime * 0.8 * (1.0 - uIce)) * sin(vW.y * 0.06 - uTime * 0.6 * (1.0 - uIce));
        rip = mix(rip, sin((vW.x + vW.y) * 0.035) * 1.2, uIce); // ice: still diagonal glints
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

// Broad-leaf plant: leaves fanning out and up from the centre, darker at the base.
function leafPlantGeometry() {
  const parts = [], n = 6;
  for (let i = 0; i < n; i++) {
    const l = new THREE.CircleGeometry(0.5, 8);
    l.scale(1, 0.42, 1); l.translate(0.5, 0, 0);
    const pos = l.attributes.position, c = new Float32Array(pos.count * 3);
    for (let k = 0; k < pos.count; k++) { const sh = 0.7 + 0.45 * pos.getX(k); c[k * 3] = c[k * 3 + 1] = c[k * 3 + 2] = sh; }
    l.setAttribute('color', new THREE.BufferAttribute(c, 3));
    l.rotateX(-Math.PI / 2); l.rotateZ(0.5 + (i % 2) * 0.25); l.rotateY(i / n * TAU + (i % 2) * 0.4);
    parts.push(strip(l));
  }
  return mergeGeometries(parts);
}

// Lily pad: a disc with a notch, flat on the water.
function lilyGeometry() {
  const g = new THREE.CircleGeometry(1, 16, 0.35, TAU - 0.7); g.rotateX(-Math.PI / 2);
  return strip(colored(g, 1, 1, 1));
}

// Soft round shadow decal.
function shadowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 4, 32, 32, 31);
  g.addColorStop(0, 'rgba(0,0,0,0.42)'); g.addColorStop(0.6, 'rgba(0,0,0,0.28)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
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
    const sh = (0.8 + 0.2 * smooth(0.02, 0.45, b)) * (0.72 + 0.32 * smooth(-0.7, 0.7, v.y)); // darker underside
    c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = sh;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.setAttribute('outlineDir', new THREE.BufferAttribute(od, 3));
  g.computeVertexNormals();
  return g;
}

// Cloud cluster for bushes and tree crowns, like the concept: a few big round puffs merged into
// one geometry, light on top and calm underneath (vertex colours; no outline).
function cloudGeometry(puffs, seed) {
  const parts = [];
  const v = new THREE.Vector3();
  let y0 = Infinity, y1 = -Infinity;
  for (const [x, y, z, rr] of puffs) { y0 = Math.min(y0, y - rr); y1 = Math.max(y1, y + rr); }
  puffs.forEach(([cx, cy, cz, rr], k) => {
    let g = new THREE.IcosahedronGeometry(1, 2);
    g.deleteAttribute('normal'); g.deleteAttribute('uv');
    g = mergeVertices(g);
    const pos = g.attributes.position, c = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).normalize();
      const b = curls(v.x * 1.3 + seed + k * 3.1, v.y * 1.3, v.z * 1.3);
      const n = v.y;
      v.multiplyScalar(rr * (1 + 0.05 * (b - 0.5))).add(tp.set(cx, cy, cz));
      pos.setXYZ(i, v.x, v.y, v.z);
      const h = (v.y - y0) / (y1 - y0);
      const sh = 0.74 + 0.3 * smooth(0.1, 0.9, h) + 0.05 * n;
      c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = sh;
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    g.computeVertexNormals();
    parts.push(g);
  });
  return mergeGeometries(parts);
}
const BUSH_PUFFS = [[0, 0.1, 0, 0.72], [0.62, -0.08, 0.18, 0.52], [-0.6, -0.06, -0.1, 0.56],
  [0.12, -0.04, 0.6, 0.48], [-0.12, 0, -0.58, 0.5], [0.08, 0.55, 0.04, 0.5]];
const CROWN_PUFFS = [[0, 0.05, 0, 0.7], [0.1, 0.62, 0.05, 0.52],
  ...[0, 1, 2, 3, 4].map((i) => { const a = i / 5 * TAU + 0.3; return [Math.cos(a) * 0.62, -0.18 + 0.12 * (i % 2), Math.sin(a) * 0.62, 0.5]; })];

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
function fenceGeometry(W, H, lanterns = false, fenceColor = '#ffffff') {
  const baseColor = new THREE.Color(fenceColor);
  const parts = [], step = 70, postH = 34;
  const add = (g, cx, cy, cz, color = baseColor) => {
    g = strip(g);
    const pos = g.attributes.position, od = new Float32Array(pos.count * 3), v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).sub(new THREE.Vector3(cx, cy, cz)).normalize().toArray(od, i * 3);
    }
    g.setAttribute('outlineDir', new THREE.BufferAttribute(od, 3));
    const sh = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) color.toArray(sh, i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(sh, 3));
    parts.push(g);
  };
  const side = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.round(len / step), a = Math.atan2(z1 - z0, x1 - x0);
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      const px = x0 + (x1 - x0) * t0, pz = z0 + (z1 - z0) * t0;
      const hasLantern = lanterns && i % 4 === 0;
      const height = hasLantern ? 56 : postH;
      const post = new THREE.BoxGeometry(9, height, 9);
      post.translate(px, height / 2, pz); add(post, px, height / 2, pz);
      if (hasLantern) {
        // Warm painted panels, not additional lights; merged into the existing fence batch.
        const lamp = new THREE.BoxGeometry(16, 18, 16);
        lamp.translate(px, 65, pz); add(lamp, px, 65, pz, new THREE.Color('#ffe3a9'));
        const cap = new THREE.BoxGeometry(22, 4, 22);
        cap.translate(px, 76, pz); add(cap, px, 76, pz);
        for (const dx of [-7, 7]) for (const dz of [-7, 7]) {
          const frame = new THREE.BoxGeometry(2, 19, 2);
          frame.translate(px + dx, 65, pz + dz); add(frame, px + dx, 65, pz + dz);
        }
      }
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
// --- Cookies: a few shapes, each tinted per instance -----------------------------------------
// Vertex attribute `part`: 0 keeps the vertex colour (sprinkles), 1 is dough (instanceColor),
// 2 is the topping (instanced `deco` colour: chips, icing, cream).
function piece(g, part, col = [1, 1, 1]) {
  g = strip(colored(g, ...col));
  g.setAttribute('part', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(part), 1));
  return g;
}
const v2 = (pts) => pts.map(([x, y]) => new THREE.Vector2(x, y));
const DISC = v2([[0, -0.2], [0.9, -0.2], [1, -0.1], [1, 0.06], [0.9, 0.18], [0.5, 0.24], [0, 0.25]]);
function finish(parts, lift) { const g = mergeGeometries(parts); g.translate(0, lift, 0); return g; }

function roundCookie() { // chocolate chip
  const parts = [piece(new THREE.LatheGeometry(DISC, 14), 1)], r = rng(11);
  for (let i = 0; i < 6; i++) {
    const a = i / 5 * TAU + r() * 0.6, d = i === 5 ? 0.12 : 0.58;
    const chip = new THREE.SphereGeometry(0.16, 5, 3); chip.scale(1, 0.55, 1);
    chip.translate(Math.cos(a) * d, 0.24 - (i === 5 ? 0 : 0.03), Math.sin(a) * d);
    parts.push(piece(chip, 2));
  }
  return finish(parts, 0.2);
}
const SPRINKLES = [[1, 0.55, 0.7], [0.45, 0.75, 1], [1, 0.88, 0.35], [0.6, 0.9, 0.55], [1, 1, 1]];
function icedCookie() { // sugar cookie: icing cap and sprinkles
  const parts = [piece(new THREE.LatheGeometry(v2([[0, -0.18], [0.92, -0.18], [1, -0.08], [1, 0.05], [0.92, 0.14], [0, 0.17]]), 14), 1),
    piece(new THREE.LatheGeometry(v2([[0.8, 0.11], [0.84, 0.15], [0.8, 0.21], [0.62, 0.26], [0, 0.27]]), 14), 2)];
  const r = rng(23);
  for (let i = 0; i < 11; i++) {
    const a = r() * TAU, d = Math.sqrt(r()) * 0.62;
    const s = new THREE.CylinderGeometry(0.04, 0.04, 0.22, 4);
    s.rotateZ(Math.PI / 2).rotateY(r() * TAU).translate(Math.cos(a) * d, 0.28, Math.sin(a) * d);
    parts.push(piece(s, 0, SPRINKLES[i % SPRINKLES.length]));
  }
  return finish(parts, 0.18);
}
// Flat shape extruded upwards with a soft bevel (shape y becomes world -z).
function slab(shape, depth, bevel) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 8 });
  return g.rotateX(-Math.PI / 2);
}
function heartShape(k) {
  const s = new THREE.Shape(), p = (x, y) => [x * k, (y - 0.1) * k];
  s.moveTo(...p(0, -0.95));
  s.bezierCurveTo(...p(-0.35, -0.6), ...p(-1.05, -0.2), ...p(-0.95, 0.35));
  s.bezierCurveTo(...p(-0.85, 0.9), ...p(-0.2, 0.95), ...p(0, 0.5));
  s.bezierCurveTo(...p(0.2, 0.95), ...p(0.85, 0.9), ...p(0.95, 0.35));
  s.bezierCurveTo(...p(1.05, -0.2), ...p(0.35, -0.6), ...p(0, -0.95));
  return s;
}
function heartCookie() { // with an icing heart on top
  const icing = slab(heartShape(0.72), 0.02, 0.05); icing.translate(0, 0.3, 0);
  return finish([piece(slab(heartShape(1), 0.22, 0.09), 1), piece(icing, 2)], 0.09);
}
function starCookie() { // rounded star with sugar pearls
  const s = new THREE.Shape(), n = 5, ro = 1.08, ri = 0.45;
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU + Math.PI / 2, b = a + Math.PI / n, c = a - 0.12, d = a + 0.12;
    const P = (r, t) => [Math.cos(t) * r, Math.sin(t) * r];
    if (i === 0) s.moveTo(...P(ro * 0.9, c));
    s.quadraticCurveTo(...P(ro * 1.08, a), ...P(ro * 0.9, d));
    s.quadraticCurveTo(...P(ri * 0.92, b), ...P(ro * 0.9, b + Math.PI / n - 0.12));
  }
  const parts = [piece(slab(s, 0.2, 0.08), 1)];
  for (let i = 0; i <= n; i++) {
    const a = i / n * TAU + Math.PI / 2, d = i === n ? 0 : 0.6;
    const pearl = new THREE.SphereGeometry(i === n ? 0.17 : 0.09, 6, 4);
    pearl.translate(Math.cos(a) * d, 0.29, -Math.sin(a) * d);
    parts.push(piece(pearl, 2));
  }
  return finish(parts, 0.08);
}
function sandwichCookie() { // two thin discs with a cream filling
  const half = v2([[0, -0.1], [0.92, -0.1], [1, -0.04], [1, 0.04], [0.92, 0.1], [0, 0.11]]);
  const lo = new THREE.LatheGeometry(half, 14), hi = new THREE.LatheGeometry(half, 14);
  lo.translate(0, 0, 0); hi.translate(0, 0.3, 0);
  const cream = new THREE.CylinderGeometry(0.9, 0.9, 0.16, 14, 1, true); cream.translate(0, 0.15, 0);
  return finish([piece(lo, 1), piece(hi, 1), piece(cream, 2)], 0.1);
}
function boneGeometry() {
  const parts = [strip(colored(new THREE.CylinderGeometry(0.22, 0.22, 1.3, 10).rotateZ(Math.PI / 2), 1, 1, 1))];
  for (const x of [-0.68, 0.68]) for (const z of [-0.2, 0.2]) {
    const k = new THREE.SphereGeometry(0.28, 10, 7); k.translate(x, 0, z); parts.push(strip(colored(k, 1, 1, 1)));
  }
  const g = mergeGeometries(parts); g.translate(0, 0.28, 0);
  return g;
}

// Map food: small, merged, indexed models. Surface detail is deliberately broad.
function mealPart(g,role=1,color='#ffffff',pos=[0,0,0],scale=[1,1,1],rot=[0,0,0]){
 const c=new THREE.Color(color);g.scale(...scale);g.rotateX(rot[0]);g.rotateY(rot[1]);g.rotateZ(rot[2]);g.translate(...pos);
 const p=piece(g,role,[c.r,c.g,c.b]);g.dispose();return p;
}
const mealBall=(role,c,p,s,segments=8)=>mealPart(new THREE.SphereGeometry(1,segments,4),role,c,p,s);
const mealBox=(role,c,p,s,rot=[0,0,0])=>mealPart(new THREE.BoxGeometry(1,1,1),role,c,p,s,rot);
function mealSlab(pts,h=.18,b=.035){
 const s=new THREE.Shape();pts.forEach(([x,y],i)=>i?s.lineTo(x,y):s.moveTo(x,y));s.closePath();
 return new THREE.ExtrudeGeometry(s,{depth:h,steps:1,bevelEnabled:b>0,bevelSize:b,bevelThickness:b,bevelSegments:1,curveSegments:1}).rotateX(-Math.PI/2);
}
function mealTube(pts,r=.065,n=8){return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p=>new THREE.Vector3(...p))),n,r,3,false);}
function mealDisc(r,y,role,color='#ffffff',n=10){return mealPart(new THREE.CircleGeometry(r,n),role,color,[0,y,0],[1,1,1],[-Math.PI/2,0,0]);}
function mealPlate(role=0,c='#eee5ce'){
 return mealPart(new THREE.LatheGeometry(v2([[0,0],[.77,0],[1,.12],[.96,.20],[.73,.09],[0,.09]]),10),role,c);
}
function mealFinish(parts){
 const raw=mergeGeometries(parts),g=mergeVertices(raw,1e-5);raw.dispose();parts.forEach(p=>p.dispose());
 const p=g.attributes.position;let radius=0,minY=Infinity;
 for(let i=0;i<p.count;i++){radius=Math.max(radius,Math.hypot(p.getX(i),p.getZ(i)));minY=Math.min(minY,p.getY(i));}
 // Unit footprint; updateFood applies the existing type radius and visual-size multiplier.
 g.translate(0,-minY+.025,0);g.scale(1/radius,1/radius,1/radius);g.computeBoundingBox();g.computeBoundingSphere();
 return g;
}
function nigiriFood(){
 const p=[mealBall(1,'#ffffff',[0,.24,0],[.94,.25,.52]),mealBall(2,'#ffffff',[0,.49,0],[.98,.15,.54])];
 for(const x of [-.30,.29])p.push(mealBox(0,'#ffe6ca',[x,.632,0],[.13,.012,.76],[0,.3,0]));
 return mealFinish(p);
}
function makiFood(){
 return mealFinish([mealPart(new THREE.CylinderGeometry(.76,.73,.64,10),1,'#ffffff',[0,.32,0]),mealDisc(.62,.65,0,'#fff3d9'),mealBox(2,'#ffffff',[0,.67,0],[.48,.05,.48])]);
}
function onigiriFood(){
 const p=[mealPart(mealSlab([[-.82,-.49],[-.72,-.68],[.72,-.68],[.82,-.49],[.16,.85],[-.16,.85]],.35,.05),1)];
 p.push(mealBox(2,'#ffffff',[0,.425,.38],[.55,.035,.58]),mealBox(2,'#ffffff',[0,.20,.744],[.55,.40,.035]));return mealFinish(p);
}
function ramenFood(){
 const p=[mealPart(new THREE.LatheGeometry(v2([[0,0],[.52,0],[.85,.46],[.85,.55],[.72,.51]]),10),1),mealDisc(.73,.49,2)];
 p.push(mealPart(new THREE.TorusGeometry(.39,.065,3,10,Math.PI*1.75),0,'#fff0b9',[-.08,.54,0],[1,1,1],[Math.PI/2,0,.4]));
 p.push(mealPart(new THREE.CircleGeometry(1,10),0,'#fff9e6',[.27,.64,.15],[.31,.37,1],[-Math.PI/2,0,0]),mealPart(new THREE.CircleGeometry(1,8),0,'#e7b649',[.27,.655,.15],[.15,.18,1],[-Math.PI/2,0,0]));
 return mealFinish(p);
}
function wokFood(){
 const p=[mealPart(new THREE.CylinderGeometry(.98,.73,.60,4,1),1,'#ffffff',[0,.30,0],[1,1,1],[0,Math.PI/4,0]),mealBox(2,'#ffffff',[0,.61,0],[1.16,.025,1.16])];
 p.push(mealPart(mealTube([[-.45,.66,-.32],[.34,.66,-.15],[-.30,.66,.12],[.30,.66,.38]],.085,8),0,'#fff1bd'));
 for(const z of [-.22,.15])p.push(mealBox(0,'#ac8251',[0,.77,z],[1.45,.08,.085],[0,-.23,0]));
 p.push(mealBox(0,'#7b9956',[-.37,.69,.34],[.25,.12,.27]));return mealFinish(p);
}
function taiyakiFood(){
 const p=[mealBall(1,'#ffffff',[.16,.28,0],[.71,.25,.50])];
 p.push(mealPart(mealSlab([[-.95,-.44],[-.95,.44],[-.35,0]],.17,.025),1,'#ffffff',[0,.16,0]));
 p.push(mealPart(mealSlab([[-.07,0],[.25,.20],[-.16,.30]],.035,.015),2,'#ffffff',[0,.53,0]));
 p.push(mealBall(0,'#66402b',[.48,.51,.13],[.07,.035,.07],5));return mealFinish(p);
}
function pizzaSliceFood(){
 const tri=[[-.84,-.60],[.84,-.60],[0,.94]],p=[mealPart(mealSlab(tri,.16,.045),1)];
 p.push(mealPart(mealSlab(tri,.025,.02),2,'#ffffff',[0,.21,0],[.81,1,.81]));
 p.push(mealPart(new THREE.CylinderGeometry(.13,.13,1.62,8),1,'#ffffff',[0,.22,.56],[1,1,1],[0,0,Math.PI/2]));
 p.push(mealPart(mealSlab([[-.31,-.25],[.33,-.29],[.02,.37]],.015,.025),0,'#fff0b7',[0,.26,0]));return mealFinish(p);
}
function ravioliFood(){
 const pts=[[-.64,-.67],[-.23,-.76],[.23,-.67],[.65,-.73],[.73,-.23],[.66,.23],[.70,.66],[.24,.75],[-.23,.67],[-.65,.73],[-.73,.24],[-.66,-.23]];
 return mealFinish([mealPart(mealSlab(pts,.10,.035),1),mealBall(2,'#ffffff',[0,.17,0],[.51,.20,.51])]);
}
function cantucciFood(){
 const p=[mealBall(1,'#ffffff',[0,.20,0],[1,.24,.43])];
 for(const x of [-.34,.31])p.push(mealBall(2,'#ffffff',[x,.425,0],[.15,.025,.22],5));return mealFinish(p);
}
function spaghettiFood(){
 const p=[mealPlate(0,'#f3e9d3')];
 for(const [x,z,r]of [[-.20,-.14,.37],[.23,-.1,.35],[0,.23,.35]])p.push(mealPart(new THREE.TorusGeometry(r,.095,3,8),1,'#ffffff',[x,.19,z],[1,1,1],[Math.PI/2,0,0]));
 p.push(mealBall(2,'#ffffff',[.16,.32,.03],[.30,.17,.29],6),mealPart(mealSlab([[0,-.18],[.17,0],[0,.22],[-.1,0]],.02,0),0,'#67884d',[-.23,.34,0]));return mealFinish(p);
}
function gelatoFood(){
 const p=[mealPart(new THREE.ConeGeometry(.40,1.04,8),1,'#ffffff',[-.43,.28,0],[1,1,1],[0,0,Math.PI/2]),mealBall(2,'#ffffff',[.36,.35,0],[.55,.41,.50]),mealBall(0,'#eab2c6',[.38,.69,0],[.33,.14,.29],6)];
 return mealFinish(p);
}
function pizzaWholeFood(){
 const p=[mealPart(new THREE.LatheGeometry(v2([[0,0],[.91,0],[1,.12],[.94,.26],[.78,.21],[0,.21]]),12),1),mealDisc(.79,.235,2, '#ffffff',12)];
 for(const [x,z]of [[-.30,-.25],[.31,-.12],[0,.33]]){p.push(mealBall(0,'#fff0b7',[x,.255,z],[.23,.035,.20],6));}
 p.push(mealPart(mealSlab([[0,-.15],[.17,0],[0,.18],[-.1,0]],.02,0),0,'#6b8b4e',[.22,.30,.24]));return mealFinish(p);
}
const MEAL_GEOMETRIES={nigiri:nigiriFood,maki:makiFood,onigiri:onigiriFood,ramen:ramenFood,wok:wokFood,taiyaki:taiyakiFood,pizza_slice:pizzaSliceFood,ravioli:ravioliFood,cantucci:cantucciFood,spaghetti:spaghettiFood,gelato:gelatoFood,pizza_whole:pizzaWholeFood};

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

// --- Seasons -----------------------------------------------------------------------------------
// One world, four paint jobs. Counts are multipliers of the summer amounts.
export const SEASONS = {
  summer: {
    sky: '#4f7f33', tufts: 1, flowers: 1, blossoms: 0.5, shadow: '#1d3a10', fence: '#b07a45', trunk: '#8a5a35',
    ground: { dark: '#789f48', mid: '#7fa74c', light: '#87ae53', clear: '#90b55c', path: '#dcb98a', pathEdge: '#b99063',
      water: '#5fb2d6', waterLight: '#93d3ec', shore: '#4f8c35' },
    tuft: ['#6aa83c', '#76b343', '#5f9d36'], flower: ['#ffffff', '#ffd6e4', '#ffe6a8', '#e7dcff'],
    leaf: ['#4f8a34', '#5a9639', '#468030'], bush: ['#4c8a34', '#56953a', '#43802f'], blossom: ['#ffffff', '#ffffff', '#ffb35c'],
    crown: ['#4f8c3c', '#478338', '#579442'], far: ['#5d8762', '#58805f', '#638c66'], lily: ['#5f9e3f', '#6aa947'],
    stoneTint: '#ffffff', stoneMix: 0,
  },
  autumn: {
    sky: '#7a6a35', tufts: 0.8, flowers: 0.25, blossoms: 0.15, shadow: '#3a2410', fence: '#9c6a3c', trunk: '#6e4529',
    ground: { dark: '#9a9a4c', mid: '#a49f50', light: '#aea657', clear: '#b9ad62', path: '#d9b183', pathEdge: '#a8794f',
      water: '#5a9fbf', waterLight: '#8cc6dc', shore: '#7d7f3a' },
    tuft: ['#a7a446', '#b59a42', '#8f9a3e'], flower: ['#ffd27a', '#ffb070', '#fff0c8'],
    leaf: ['#b0832f', '#c46a2c', '#8c8a34'], bush: ['#c4662c', '#d68b35', '#a85a2a', '#8f8f3a'], blossom: ['#ffd25a', '#e8542f'],
    crown: ['#e0782c', '#d2542a', '#e9a63a', '#c9b23f'], far: ['#a07a52', '#8f7656', '#a58a5e'], lily: ['#8c9a3c', '#a5953e'],
    stoneTint: '#c9a070', stoneMix: 0.15,
  },
  winter: {
    sky: '#9db7cf', tufts: 0.25, flowers: 0, blossoms: 0.6, shadow: '#5b7598', fence: '#a87a52', trunk: '#7a5236', ice: true,
    ground: { dark: '#dfe9f4', mid: '#e8f0f8', light: '#f2f7fc', clear: '#f8fbff', path: '#cfdcea', pathEdge: '#b6c8dc',
      water: '#b9dcef', waterLight: '#e6f4fb', shore: '#d0e1ee', detail: 0.04 },
    tuft: ['#9fb98a', '#b3c79e'], flower: ['#ffffff'],
    leaf: ['#5f8a6a', '#6a9474'], bush: ['#eef4fa', '#e2ecf6', '#f6f9fc'], blossom: ['#e8463c', '#d63a3a'], // holly berries
    crown: ['#eef4fa', '#e4edf6', '#f7fafd'], far: ['#c8d6e4', '#bccbdb', '#d2deea'], lily: ['#ffffff'],
    stoneTint: '#eef4fa', stoneMix: 0.45,
  },
  spring: {
    sky: '#5c9440', tufts: 1.1, flowers: 1.8, blossoms: 0.9, shadow: '#1d3a10', fence: '#b98a55', trunk: '#8a5a35',
    ground: { dark: '#7fb24c', mid: '#88ba52', light: '#92c25a', clear: '#9fcb66', path: '#e0c294', pathEdge: '#bd9768',
      water: '#62bce0', waterLight: '#9edcf2', shore: '#5c9a3a' },
    tuft: ['#79c043', '#86c94c', '#6cb33c'], flower: ['#ffffff', '#ffc2d8', '#fff09a', '#d9ccff', '#ffd1a8'],
    leaf: ['#5aa03a', '#66ab40', '#4f9434'], bush: ['#5ea23c', '#6aae44', '#559a36'], blossom: ['#ffd0e2', '#ffffff', '#ffb3cf'],
    crown: ['#f7c1d6', '#f3aac6', '#fbd6e4', '#65a845'], far: ['#7aa572', '#e3b9cb', '#86ad7c'], lily: ['#6ab348', '#79bd52'],
    stoneTint: '#ffffff', stoneMix: 0,
  },
};
Object.assign(SEASONS, {
  sakura: {
    sky: '#b99ab7', groundPetals: 900, petal: ['#ffc4d8', '#f7a9c6', '#ffdbe7'],
    tufts: 0.55, flowers: 0.22, blossoms: 1, shadow: '#5a4a6a',
    fence: '#92716a', trunk: '#75524d', shadowStretch: 1.5,
    // The ground shader is unlit; its evening palette must accompany the light rig.
    ground: {
      dark: '#717965', mid: '#7e846a', light: '#8c9072', clear: '#999779',
      path: '#c5a497', pathEdge: '#99818f', water: '#687d9a', waterLight: '#d8b5cf',
      shore: '#788275', detail: 0.045,
    },
    tuft: ['#728865', '#819778'], flower: ['#ecd1db', '#dac4de'],
    leaf: ['#748d69', '#849973'], bush: ['#b67d99', '#c893ad', '#bcb39a'],
    blossom: ['#ffd1e2', '#ffb4d0', '#f5d7e6'], crown: ['#d991b1', '#e8acc6', '#f2c3d5'],
    far: ['#bb91aa', '#cba3b8', '#baa2b5'], lily: ['#839886'], stoneTint: '#bdaab8', stoneMix: 0.25,
    // Neutral fill preserves white coats; the directional light supplies the warm sunset.
    hemi: ['#f1e4ec', '#625575', 1.55], sun: ['#ffcea9', 1.5, [-1, 0.55, 0.4]],
  },
  kyoto: {
    sky: '#9294ac', architecture: 'kyoto', paved: true, groundPetals: 350,
    petal: ['#f2bfd2', '#e8a9c3'], tufts: 0, flowers: 0, blossoms: 0.12,
    shadow: '#545663', fence: '#736b66', trunk: '#75605c',
    ground: {
      dark: '#a8a4a0', mid: '#b0aca6', light: '#b9b5ad', clear: '#c4bcae',
      path: '#c6c0b4', pathEdge: '#77767b', water: '#748e9b', waterLight: '#c0cbd6',
      shore: '#aaa499', detail: 0.015,
    },
    tuft: ['#718775'], flower: ['#d7b6c5'], leaf: ['#72816c'], bush: ['#6f806b', '#83927c'],
    blossom: ['#e6bdcf'], crown: ['#8f9f8c'], far: ['#8b9392'], lily: ['#82948b'],
    stoneTint: '#aaa4a0', stoneMix: 0.6,
    hemi: ['#f3efff', '#77777f', 2.15], sun: ['#ffe9d1', 1.4, [-0.8, 0.7, 0.45]],
  },

 italy: {
  sky:'#92b7ce',architecture:'italy',tufts:.55,flowers:.3,blossoms:.55,shadow:'#66653e',fence:'#b29065',trunk:'#85714f',shadowStretch:.85,
  ground:{dark:'#939555',mid:'#9da061',light:'#a8ab70',clear:'#b2b67e',path:'#c59878',pathEdge:'#aa7f63',water:'#64adae',waterLight:'#ade0d5',shore:'#8d975f',detail:.045},
  tuft:['#899752','#9aaa62'],flower:['#a59abe','#b3a4ca'],leaf:['#7b8e50','#899b59'],bush:['#73884f','#81985c'],blossom:['#e3c865','#b3a1c7'],crown:['#65865e','#71936c'],far:['#8aa18a','#809b87'],lily:['#83a16c'],stoneTint:'#c6b58e',stoneMix:.25,
  hemi:['#fff8ec','#899572',2.3],sun:['#fff2d8',2.05,[-.45,1.2,.6]],
 },
});
Object.assign(SEASONS,{
 whale:{...SEASONS.summer,hxh:1,sky:'#a7dbe2',ground:{...SEASONS.summer.ground,dark:'#77a85e',mid:'#81b86a',light:'#91c579',path:'#e1cfa1',pathEdge:'#bbaa83'},tufts:.65,flowers:.3,blossoms:.25,fence:'#ac9870'},
 yorknew:{...SEASONS.kyoto,hxh:2,paved:false,groundPetals:0,architecture:null,sky:'#33415f',ground:{...SEASONS.kyoto.ground,dark:'#8895a7',mid:'#919dac',light:'#9da8b6',clear:'#a5afbd',path:'#c2b5a0',pathEdge:'#58647d'},fence:'#5b6473',hemi:['#e5edff','#737e97',2.05],sun:['#ffe2b3',1.5,[-.4,.9,.6]]},
 greed:{...SEASONS.summer,hxh:3,sky:'#b6c8e1',ground:{...SEASONS.summer.ground,dark:'#80a58a',mid:'#8eb499',light:'#aac6a4',path:'#eee2bc',pathEdge:'#8c7f9a'},tufts:.18,flowers:0,blossoms:0,fence:'#858a9a',crown:['#72a391'],far:['#9dafb7']},
});
// Reuse light objects in both scenes; unknown IDs restore the original summer rig.
export function applyMapLight(hemi,sun,id){
 const S=SEASONS[id]??SEASONS.summer,h=S.hemi??['#fff6e6','#7a9a50',2.3],d=S.sun??['#fff0d0',2,[-.5,1,.7]];
 hemi.color.set(h[0]);hemi.groundColor.set(h[1]);hemi.intensity=h[2];sun.color.set(d[0]);sun.intensity=d[1];sun.position.set(...d[2]);
}

for (const S of Object.values(SEASONS)) S.stoneTint = new THREE.Color(S.stoneTint);
for (const [id, S] of Object.entries(SEASONS)) S.id = id;
export const SEASON_IDS = Object.keys(SEASONS);

// Low-poly, vertex-coloured travel props. All hard scenery stays beyond the fence.
function travelPart(g,color,pos=[0,0,0],scale=[1,1,1],rot=0){
 const c=new THREE.Color(color);g=strip(colored(g,c.r,c.g,c.b));g.scale(...scale);g.rotateZ(rot);g.translate(...pos);return g;
}
function travelMerge(parts){const g=mergeGeometries(parts);const out=mergeVertices(g);g.dispose();parts.forEach(p=>p.dispose());out.computeBoundingSphere();return out;}
function travelBox(color,p,s,rot=0){return travelPart(new THREE.BoxGeometry(1,1,1),color,p,s,rot);}
function houseGeometry(style){
 const jp=style==='kyoto',wall=jp?'#c8beb0':'#dfbd86',roof=jp?'#505763':'#b5765d',wood=jp?'#63504a':'#65816c',parts=[];
 parts.push(travelBox(wall,[0,.44,0],[1.55,.88,.92]));
 if(jp){
  for(const side of [-1,1])parts.push(travelBox(roof,[side*.43,1.01,0],[1.03,.10,1.20],-side*.32));
  parts.push(travelBox(wood,[0,.91,.49],[1.65,.09,.09]));
  parts.push(travelBox('#414752',[0,1.22,0],[.09,.08,1.24]));
  const awning=new THREE.BoxGeometry(1.68,.055,.30);awning.rotateX(.20);parts.push(travelPart(awning,roof,[0,.77,.58]));
  for(const z of [-.5,-.25,0,.25,.5])for(const side of [-1,1])parts.push(travelBox('#606672',[side*.43,1.067,z],[1.03,.017,.017],-side*.32));
  for(const x of [-.69,0,.69])parts.push(travelBox(wood,[x,.44,.49],[.07,.88,.075]));
 }else{
  const r=new THREE.CylinderGeometry(0,1,1,4,1);r.rotateY(Math.PI/4);
  parts.push(travelPart(r,roof,[0,1.08,0],[1.38,.50,.93]));
  parts.push(travelBox(wall,[.50,1.19,-.22],[.16,.40,.18]));
 }
 for(const x of [-.43,.43]){
  // Baked amber, deliberately NOT described as emissive or a light source.
  parts.push(travelBox(jp?'#dbb887':'#71917e',[x,.55,.474],[.32,.35,.035]));
  if(jp)for(const dx of [-.10,0,.10])parts.push(travelBox(wood,[x+dx,.55,.50],[.022,.37,.018]));
  else for(const dx of [-.20,.20])parts.push(travelBox(wood,[x+dx,.55,.493],[.075,.38,.05]));
 }
 if(jp)for(const x of [-.43,.43])parts.push(travelBox(wood,[x,.55,.51],[.34,.018,.022]));
 parts.push(travelBox(wood,[0,.23,.48],[.26,.46,.055]));
 if(!jp){const arc=new THREE.CylinderGeometry(.135,.135,.06,12,1,false,0,Math.PI);arc.rotateX(Math.PI/2);parts.push(travelPart(arc,wood,[0,.46,.48]));}
 return travelMerge(parts);
}
function toriiGeometry(){
 const p=[],red='#ad534a',cap='#534944';
 for(const x of [-.55,.55]){p.push(travelPart(new THREE.CylinderGeometry(.07,.09,1.1,8),red,[x,.55,0]));p.push(travelBox(cap,[x,.07,0],[.2,.14,.23]));}
 p.push(travelBox(red,[0,.85,0],[1.4,.1,.12]),travelBox(red,[0,1.11,0],[1.65,.12,.17]),travelBox(cap,[0,1.19,0],[1.75,.08,.21]));
 return travelMerge(p);
}
function lanternGeometry(){
 const p=[travelBox('#85858a',[0,.05,0],[.5,.1,.5]),travelBox('#989698',[0,.32,0],[.16,.5,.16]),travelBox('#a5a19e',[0,.64,0],[.38,.28,.38]),travelBox('#ddbc84',[0,.65,.195],[.21,.16,.012])];
 const roof=new THREE.CylinderGeometry(.06,.40,.2,4);roof.rotateY(Math.PI/4);p.push(travelPart(roof,'#7a7c84',[0,.87,0]));return travelMerge(p);
}
function cypressGeometry(){
 const p=[travelPart(new THREE.CylinderGeometry(.07,.10,.55,7),'#827058',[0,.27,0])];
 for(const [y,w,h]of [[.65,.25,.48],[1.05,.25,.55],[1.44,.20,.45],[1.73,.12,.30]])p.push(travelPart(new THREE.SphereGeometry(1,10,7),'#416c54',[0,y,0],[w,h,w*.85]));
 return travelMerge(p);
}
// Tall scenery stays outside three edges; the south is clear at the low race camera.
function buildHxhDecor(root,S,W,H,lineMat){
 const PI=Math.PI,parts=[],shadows=[],white=new THREE.Color('#ffffff');
 const add=(g,x,z,k=1,yaw=0)=>{if(!g.index){const old=g;g=mergeVertices(g);old.dispose();}g.scale(k,k,k);g.rotateY(yaw);g.translate(x,0,z);parts.push(g);shadows.push({x,z,r:80*k,m:place(x,.03,z,0,80*k,1,65*k),c:white});};
 const b=(c,p,s)=>travelBox(c,p,s);
 function roof(w,d,h,c){return travelPart(new THREE.ConeGeometry(1,1,4),c,[0,h,0],[w,.45*w,d]);}
 function lighthouse(){const p=[travelPart(new THREE.CylinderGeometry(.40,.61,3.15,16),'#efe8d0',[0,1.57,0]),travelPart(new THREE.CylinderGeometry(.425,.44,.30,16),'#b7564f',[0,2.34,0]),b('#476c80',[0,3.25,0],[.76,.55,.76]),b('#ffe1a4',[0,3.26,.394],[.52,.34,.022]),travelPart(new THREE.ConeGeometry(.48,.38,16),'#b9554e',[0,3.69,0]),b('#567b87',[0,.28,.56],[.29,.56,.07])];return travelMerge(p);}
 function house(){const p=[b('#e5d5ae',[0,.52,0],[1.45,1.04,.95]),roof(1.2,.85,1.29,'#b65348'),b('#526b68',[0,.30,.50],[.28,.6,.06])];for(const x of [-.48,.48])p.push(b('#a9d9df',[x,.61,.50],[.31,.36,.06]));return travelMerge(p);}
 function tower(n){const p=[b(n%2?'#59647a':'#69738a',[0,2.10,0],[1.23,4.20,.94]),b('#35445f',[0,4.24,0],[1.39,.16,1.08])];for(let j=0;j<6;j++){p.push(b('#46516c',[0,.50+j*.61,0],[1.3,.065,1.01]));for(const x of [-.37,0,.37])for(const z of [-.49,.49]){p.push(b('#e4be83',[x,.76+j*.61,z],[.21,.33,.035]));p.push(b('#455169',[x,.76+j*.61,z*1.05],[.025,.35,.025]));}}p.push(b('#253b54',[0,.25,.50],[.33,.48,.04]));p.push(b('#d5bd96',[.55,1.12,.53],[.30,.73,.06]),b('#574567',[.55,1.12,.57],[.19,.16,.024]));return travelMerge(p);}
 function card(n){const p=[b('#526c68',[0,.82,0],[1.12,1.64,.12]),b('#f4edcc',[0,.82,.072],[.97,1.48,.027]),b('#aa94ba',[0,.82,.097],[.67,.89,.027]),travelPart(new THREE.OctahedronGeometry(.32),'#67bca7',[0,.82,.17],[.75,1,.25])];const segments=[[0,.16,.13,.023],[.075,.08,.023,.13],[.075,-.08,.023,.13],[0,-.16,.13,.023],[-.075,-.08,.023,.13],[-.075,.08,.023,.13],[0,0,.13,.023]],digits=[[0,1,2,3,4,5],[1,2],[0,1,6,4,3],[0,1,6,2,3],[5,6,1,2],[0,5,6,2,3],[0,5,6,4,3,2],[0,1,2],[0,1,2,3,4,5,6],[0,1,2,3,5,6]];for(const d of digits[n%10]){const[x,y,w,h]=segments[d];p.push(b('#405b64',[-.32+x,1.38+y,.102],[w,h,.015]));}return travelMerge(p);}
 function crystal(){const p=[];for(const [x,y,z,k,c]of [[0,.5,0,1,'#b8a0d9'],[.35,.28,.15,.6,'#83c7ba'],[-.24,.20,.12,.45,'#779fc8']])p.push(travelPart(new THREE.OctahedronGeometry(1),c,[x,y,z],[.29*k,.78*k,.30*k]));return travelMerge(p);}
 function castle(){const p=[b('#dfd9c4',[0,.52,0],[2.2,1.04,.8])];for(const x of [-1,0,1]){p.push(travelPart(new THREE.CylinderGeometry(.28,.32,1.8,10),'#ddd2c6',[x,.90,0]));p.push(travelPart(new THREE.ConeGeometry(.43,.74,10),'#817cba',[x,2.14,0]));p.push(b('#a1c6d3',[x,1.14,.31],[.13,.29,.035]));}p.push(b('#717992',[0,.31,.43],[.40,.62,.05]));return travelMerge(p);}
 if(S.id==='whale'){
  add(lighthouse().scale(.70,.31,.70),W*.69,-38,95);add(house().scale(1,.78,1),W*.31,-48,115);
  // Low painted-like props are passable; they add no gameplay collision.
  for(const rad of [150,295])for(let i=0;i<22;i++){const a=i*Math.PI*2/22+.016*Math.sin(i*7),x=W*.5+Math.cos(a)*(rad+12),z=H*.5+Math.sin(a)*(rad+12),p=[];for(let j=0;j<5;j++){const t=-.85+j*.425;p.push(travelPart(new THREE.SphereGeometry(1,8,5),j%2?'#e8caa5':'#f6dec1',[Math.sin(t)*3,1.1,Math.cos(t)*3],[1.7,1,5],0).rotateY(t));}add(travelMerge(p),x,z);}
  for(const[x,z]of [[W*.5-120,H*.5+160],[W*.5+120,H*.5+270]])add(travelPart(new THREE.SphereGeometry(1,8,4),'#909b98',[0,1.5,0],[26,2.2,17]),x,z);
  // Distinctive big leaves form only a low western border; no trees in the sea.
  for(let i=0;i<12;i++){const p=[];for(let j=0;j<4;j++)p.push(travelPart(new THREE.SphereGeometry(1,10,6),'#4d965f',[Math.cos(j*1.6)*.23,.40,Math.sin(j*1.6)*.23],[.20,.10,.60],j*.8));add(travelMerge(p),-70,110+i*(H-220)/11,80);}
 }else if(S.id==='yorknew'){
  for(let i=0;i<13;i++)add(tower(i),70+i*(W-140)/12,-75,86+(i%3)*8);
  for(let i=0;i<9;i++){add(tower(i),-75,80+i*(H-160)/8,86,PI/2);add(tower(i+1),W+75,80+i*(H-160)/8,86,-PI/2);}
 }else{
  for(let i=0;i<9;i++){add(card(i),120+i*(W-240)/8,-80,82+(i%3)*7,.12*Math.sin(i));if(i%2===0)add(crystal(),220+i*(W-400)/9,-76,85);}
  for(let i=0;i<8;i++){add(card(i+2),-90,100+i*(H-200)/7,85,PI/2);add(crystal(),W+90,100+i*(H-200)/7,95);}
  add(castle(),W*.5,-330,125);
 }
 const mat=toonMaterial('#ffffff');mat.vertexColors=true;
 const clock={value:0};if(S.id==='yorknew')mat.onBeforeCompile=shader=>{shader.uniforms.hxClock=clock;shader.fragmentShader='uniform float hxClock;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\n if(vColor.r>0.65 && vColor.g>0.40 && vColor.b<0.4) diffuseColor.rgb *= 0.94+0.06*sin(hxClock*1.6+gl_FragCoord.x*.013);');shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\n if(vColor.r>.65&&vColor.g>.40&&vColor.b<.4)totalEmissiveRadiance+=vec3(.9,.55,.16)*.6;');};
 const sc=new Scatter(root,travelMerge(parts),mat,[{x:W/2,z:H/2,r:Math.max(W,H),m:new THREE.Matrix4(),c:white}],lineMat);
 let sea=null;
 if(S.id==='whale'){
  const g=new THREE.BufferGeometry(),p=[];const rect=(x0,z0,x1,z1)=>p.push(x0,0,z0,x1,0,z0,x1,0,z1,x0,0,z0,x1,0,z1,x0,0,z1);rect(-1000,-1000,W+1000,-24);rect(W+24,-24,W+1000,H+1000);rect(-1000,-24,-24,H+1000);rect(-24,H+24,W+24,H+1000);g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
  sea=new THREE.ShaderMaterial({side:THREE.DoubleSide,uniforms:{uTime:clock,c:{value:new THREE.Color('#55adc5')},light:{value:new THREE.Color('#b4e9e6')}},vertexShader:'varying vec2 w;void main(){w=position.xz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'uniform float uTime;uniform vec3 c,light;varying vec2 w;void main(){float wave=sin(w.y*.025+sin(w.x*.011)*1.4+uTime*.8);float glint=smoothstep(.91,.99,wave)*smoothstep(.1,.8,sin(w.x*.03+uTime*.3));gl_FragColor=vec4(mix(c,light,glint*.60),1.0);\n#include <colorspace_fragment>\n}'});
  const water=new THREE.Mesh(g,sea);water.position.y=.12;water.renderOrder=-1;root.add(water);
 }
 return {scatters:[sc],shadows:[],update:t=>{clock.value=t;}};
}

function buildTravelDecor(root,S,W,H,lineMat){
 if(S.hxh)return buildHxhDecor(root,S,W,H,lineMat);
 if(!S.architecture)return {scatters:[],shadows:[]};
 const jp=S.architecture==='kyoto',houses=[],props=[],shadows=[],white=new THREE.Color('#ffffff');
 const add=(list,x,z,yaw,s,sx=1)=>list.push({x,z,r:s*1.3,m:place(x,0,z,yaw,s*sx,s,s),c:white});
 if(jp){
  // Three edges only: no tall southern foreground wall hides dogs at the low camera angle.
  for(let i=0;i<11;i++){const x=120+i*(W-240)/10;add(houses,x,-190,0,90,i%3===0?1.12:.95);}
  for(let i=0;i<8;i++){const z=120+i*(H-240)/7;add(houses,-190,z,Math.PI/2,90);add(houses,W+190,z,-Math.PI/2,90);}
  const chunks=[];
  const baked=(g,p,k)=>{g.scale(k,k,k);g.translate(...p);return g;};
  chunks.push(baked(toriiGeometry(),[W*.5,0,-75],65));
  for(const x of [W*.5-125,W*.5+125])chunks.push(baked(lanternGeometry(),[x,0,-55],35));
  const g=travelMerge(chunks),mat=toonMaterial('#ffffff');mat.vertexColors=true;
  const shrine=new Scatter(root,g,mat,[{x:W*.5,z:-75,r:180,m:new THREE.Matrix4()}],lineMat);
  const hm=toonMaterial('#ffffff');hm.vertexColors=true;
  const hs=new Scatter(root,houseGeometry('kyoto'),hm,houses,lineMat);
  return {scatters:[hs,shrine],shadows:houses};
 }
 for(const [x,z,yaw]of [[W*.25,-200,0],[W*.76,-205,0],[-210,H*.58,Math.PI/2]])add(houses,x,z,yaw,130);
 for(let i=0;i<22;i++){const x=70+i*(W-140)/21;add(props,x,-100,0,60+(i%3)*7);}
 for(let i=0;i<12;i++){const z=90+i*(H-180)/11;add(props,-95,z,0,60);add(props,W+95,z,0,60);}
 const hm=toonMaterial('#ffffff');hm.vertexColors=true;const tm=toonMaterial('#ffffff');tm.vertexColors=true;
 return {scatters:[new Scatter(root,houseGeometry('italy'),hm,houses,lineMat),new Scatter(root,cypressGeometry(),tm,props)],shadows:[...houses,...props]};
}

// --- Meadow ------------------------------------------------------------------------------------
export function buildMeadow(scene, W, H, season = 'summer') {
  const S = SEASONS[season] ?? SEASONS.summer;
  const L = layout(W, H, S.id), r = rng(2024);
  const root = new THREE.Group(); root.name = 'meadow';
  scene.add(root);
  const C = (list) => new THREE.Color(list[Math.floor(r() * list.length)]);
  const inField = (x, z, pad = 0) => x > pad && x < W - pad && z > pad && z < H - pad;
  const puds = [...mapPuddles(S.id), ...seasonObstacles(S.id)];
  const wet = (x, z, pad) => puds.some((p) => Math.hypot(x - p.x, z - p.y) < p.r * 1.3 + pad);
  const whalePath=(x,z,pad)=>{const qx=x-W*.5,qz=z-H*.5,r=Math.hypot(qx,qz),wx=((qx+125)%310+310)%310-155,wz=((qz+90)%240+240)%240-120;return Math.min(Math.abs(r-150),Math.abs(r-295),Math.abs(qx-42*Math.sin(qz*.012)))<27+pad||Math.hypot(wx/(43+pad),wz/(26+pad))<1.2;};
  const onPath = (x, z, pad) => (S.id==='whale'&&whalePath(x,z,pad)) || S.id==='yorknew' || L.path(x, z) < L.pathHalf + pad || (puds.length > 0 && wet(x, z, pad));
  const inPond = (x, z, pad) => S.id==='whale'&&(x>W+24-pad||z<-24+pad||x<-24+pad||z>H+24-pad) || Math.hypot(x - L.pond.x, (z - L.pond.z) * 1.25) < L.pond.r + pad;

  scene.background = new THREE.Color(S.sky);
  const lineMats = [], lineR = outlineMaterial(true), lineN = outlineMaterial(false);
  lineMats.push(lineR, lineN);

  // Ground.
  const GM = groundMaps(W, H, L);
  const groundMat = groundMaterial(W, H, GM, S);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(GM.span, GM.span), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.position.set(GM.x0 + GM.span / 2, 0, GM.x0 + GM.span / 2);
  ground.renderOrder = -2;
  root.add(ground);

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
  const tufts = [], tuftCols = S.tuft;
  for (let i = 0; i < 420 * S.tufts; i++) {
    const x = -300 + r() * (W + 600), z = -300 + r() * (H + 600);
    if (onPath(x, z, 8) || inPond(x, z, 10)) continue;
    const cl = 1 + Math.floor(r() * 3);
    for (let k = 0; k < cl; k++) {
      const px = x + (r() - 0.5) * 30, pz = z + (r() - 0.5) * 30, s = 10 + r() * 7;
      tufts.push({ x: px, z: pz, r: s, m: place(px, 0, pz, r() * TAU, s * 1.1, s, s * 1.1), c: C(tuftCols) });
    }
  }
  const tuftS = new Scatter(root, tuftGeometry(), tuftMat, tufts);

  // Flowers: small groups, pastel so cookies stay the brightest thing.
  const flowerMat = new THREE.MeshBasicMaterial({ color: '#ffffff', vertexColors: true });
  const flowers = [], flowerCols = S.flower;
  for (let i = 0; i < 150 * S.flowers; i++) {
    const x = -250 + r() * (W + 500), z = -250 + r() * (H + 500);
    if (onPath(x, z, 14) || inPond(x, z, 20)) continue;
    const col = new THREE.Color(flowerCols[Math.floor(r() * flowerCols.length)]), n = 3 + Math.floor(r() * 4);
    for (let k = 0; k < n; k++) {
      const px = x + (r() - 0.5) * 50, pz = z + (r() - 0.5) * 40, s = 4 + r() * 1.8;
      flowers.push({ x: px, z: pz, r: s, m: place(px, 0, pz, r() * TAU, s), c: col });
    }
  }

  // Broad-leaf plants: a few in the field, more along the fence.
  const leafMat = new THREE.MeshBasicMaterial({ color: '#ffffff', vertexColors: true, side: THREE.DoubleSide });
  const leaves = [], leafCols = S.leaf;
  const addLeaf = (x, z, s) => leaves.push({ x, z, r: s, m: place(x, 0.5, z, r() * TAU, s), c: C(leafCols) });
  for (let i = 0; i < 70; i++) {
    const x = 60 + r() * (W - 120), z = 60 + r() * (H - 120);
    if (S.id !== 'kyoto' && S.id !== 'yorknew' && S.id !== 'greed' && !onPath(x, z, 16)) addLeaf(x, z, 13 + r() * 8);
  }

  // Stones and mushrooms: mostly along the fence and beyond it.
  const stoneMat = toonMaterial('#ffffff'); stoneMat.vertexColors = true;
  const stones = [], edgeSpot = (spread) => {
    const t = r() * 4, u = r(), d = (r() - 0.35) * spread;
    if (t < 1) return [u * W, -d]; if (t < 2) return [W + d, u * H]; if (t < 3) return [u * W, H + d]; return [-d, u * H];
  };
  for (let i = 0; i < 60; i++) {
    const [x, z] = edgeSpot(160);
    if (!inPond(x, z, 20) && !onPath(x, z, 14)) addLeaf(x, z, 15 + r() * 10);
  }
  for (let i = 0; i < 90; i++) {
    const [x, z] = edgeSpot(260);
    if (inPond(x, z, 20) || onPath(x, z, 14)) continue;
    const s = 6 + r() * 10, g = 0.4 + r() * 0.08; // no outline: darker, warm grey, so they sit in the grass
    stones.push({ x, z, r: s * 1.3, m: place(x, s * 0.2, z, r() * TAU, s * (1 + r() * 0.4), s * 0.6, s), c: new THREE.Color(g, g * 0.98, g * 0.9).lerp(S.stoneTint, S.stoneMix) });
  }
  for (let i = 0; i < ((S.id === 'kyoto'||S.id === 'yorknew'||S.id === 'greed') ? 0 : 14); i++) { // a few pebbles inside the field
    const x = 100 + r() * (W - 200), z = 100 + r() * (H - 200);
    if (onPath(x, z, 14)) continue;
    const s = 5 + r() * 4, g = 0.42 + r() * 0.06;
    stones.push({ x, z, r: s, m: place(x, s * 0.2, z, r() * TAU, s * 1.2, s * 0.55, s), c: new THREE.Color(g, g * 0.98, g * 0.9).lerp(S.stoneTint, S.stoneMix) });
  }
  const stoneS = new Scatter(root, blobGeometry(1, 1.6, 0.25, 4), stoneMat, stones);

  const mushMat = toonMaterial('#ffffff'); mushMat.vertexColors = true;
  const mush = [];
  for (let i = 0; i < (S.architecture ? 0 : 40); i++) {
    const [x, z] = edgeSpot(200);
    if (inPond(x, z, 20) || onPath(x, z, 14)) continue;
    const n = 1 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) {
      const px = x + (r() - 0.5) * 26, pz = z + (r() - 0.5) * 26, s = 9 + r() * 6;
      mush.push({ x: px, z: pz, r: s, m: place(px, 0, pz, r() * TAU, s) });
    }
  }
  const mushS = new Scatter(root, mushroomGeometry(), mushMat, mush);

  // Fence: one merged mesh + its hull.
  const lanterns = S.id === 'kyoto'||S.id === 'yorknew';
  const fenceMat = toonMaterial(lanterns ? '#ffffff' : S.fence); fenceMat.vertexColors = true;
  if(S.id==='yorknew'){const compile=fenceMat.onBeforeCompile;fenceMat.onBeforeCompile=function(shader,renderer){compile.call(this,shader,renderer);shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\n if(vColor.r>.8&&vColor.g>.5&&vColor.b<.65)totalEmissiveRadiance+=vec3(1.,.68,.22)*.8;');};}
  const fenceGeo = fenceGeometry(W, H, lanterns, lanterns ? S.fence : '#ffffff');
  const fence = new THREE.Mesh(fenceGeo, fenceMat); root.add(fence);
  const fenceLine = new THREE.Mesh(fenceGeo, lineR); root.add(fenceLine);

  // Bushes hugging the fence from outside, trees further out (cooler, to recede).
  const bushMat = toonMaterial('#ffffff'); bushMat.vertexColors = true;
  const bushes = [], bushCols = S.bush;
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
  // Bushes in groups of 3-5 with gaps between them, sizes and heights varying.
  const perim = 2 * (W + H);
  const along = (u, d) => {
    u = ((u % perim) + perim) % perim;
    if (u < W) return [u, -d]; if (u < W + H) return [W + d, u - W];
    if (u < 2 * W + H) return [2 * W + H - u, H + d]; return [-d, perim - u];
  };
  for (let u = 0; u < ((S.id === 'kyoto'||S.id === 'yorknew'||S.id === 'greed') ? 0 : perim);) {
    const n = 3 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++, u += 34 + r() * 18) {
      const [x, z] = along(u, 40 + r() * 45);
      if (inPond(x, z, 40)) continue;
      const s = 24 + r() * 24, sy = s * (0.75 + r() * 0.45);
      bushes.push({ x, z, r: s * 1.3, m: place(x, sy * 0.55, z, r() * TAU, s * 1.15, sy, s * 1.05), c: C(bushCols) });
      if (r() < S.blossoms) { // a few blossoms on top
        const col = C(S.blossom), nb = 2 + Math.floor(r() * 4);
        for (let q = 0; q < nb; q++) {
          const a = r() * TAU, rr = r() * 0.7, px = x + Math.cos(a) * rr * s * 1.05, pz = z + Math.sin(a) * rr * s;
          flowers.push({ x: px, z: pz, r: 6, m: place(px, sy * 0.55 + sy * 0.95 * Math.sqrt(1 - rr * rr), pz, r() * TAU, 4.5), c: col });
        }
      }
    }
    u += 70 + r() * 90; // gap
  }
  const bushS = new Scatter(root, cloudGeometry(BUSH_PUFFS, 8), bushMat, bushes);

  const trees = [], trunks = [], crownCols = S.crown;
  ring(150, (S.id === 'kyoto'||S.id === 'yorknew'||S.id === 'greed') ? 0 : S.id === 'italy' ? 24 : 70, (x, z) => {
    if (z > H) z += 90; // south trees stand further out: they lean into the view
    const s = 50 + r() * 26, h = s * (0.8 + r() * 0.7); // crowns at different heights
    trees.push({ x, z, r: s * 1.3, m: place(x, h + s * 0.55, z, r() * TAU, s, s * (S.id === 'italy' ? 0.36 : 0.9), s), c: C(crownCols) });
    trunks.push({ x, z, r: s, m: place(x, h * 0.5 + s * 0.2, z, 0, s * 0.18, h + s * 0.4, s * 0.18) });
  });
  // Far row: bigger, lighter and less saturated (aerial haze), so the forest recedes.
  const farCols = S.far;
  ring(330, (S.id === 'kyoto'||S.id === 'yorknew'||S.id === 'greed') ? 0 : S.id === 'italy' ? 20 : 60, (x, z) => {
    if (z > H) z += 120;
    const s = 70 + r() * 30, h = s * 1.0;
    trees.push({ x, z, r: s * 1.3, m: place(x, h + s * 0.55, z, r() * TAU, s, s * (S.id === 'italy' ? 0.36 : 0.9), s), c: C(farCols) });
    trunks.push({ x, z, r: s, m: place(x, h * 0.5 + s * 0.2, z, 0, s * 0.18, h + s * 0.4, s * 0.18) });
  });
  const crownS = new Scatter(root, cloudGeometry(CROWN_PUFFS, 13), bushMat, trees);
  const flowerS = new Scatter(root, flowerGeometry(), flowerMat, flowers);
  const leafS = new Scatter(root, leafPlantGeometry(), leafMat, leaves);

  // Lily pads on the pond.
  const lilies = [];
  for (let i = 0; i < (S.ice||S.hxh ? 0 : 9); i++) { // none on ice
    const a = r() * TAU, d = r() * L.pond.r * 0.7, x = L.pond.x + Math.cos(a) * d, z = L.pond.z + Math.sin(a) * d * 0.8, s = 12 + r() * 9;
    lilies.push({ x, z, r: s, m: place(x, 0.8, z, r() * TAU, s), c: C(S.lily) });
    if (r() < 0.4 * S.flowers) flowers.push({ x, z, r: 6, m: place(x + 3, 1.6, z - 2, r() * TAU, 5), c: new THREE.Color('#ffd0e0') });
  }
  // Fallen petals on the ground (flat pink ovals), where the map asks for them.
  for (let i = 0; i < (S.groundPetals ?? 0); i++) {
    const x = -200 + r() * (W + 400), z = -200 + r() * (H + 400);
    if (inPond(x, z, 10)) continue;
    const s = 4 + r() * 3.5;
    lilies.push({ x, z, r: s, m: place(x, 0.6, z, r() * TAU, s, 1, s * 0.62), c: C(S.petal) });
  }
  const lilyS = new Scatter(root, lilyGeometry(), new THREE.MeshBasicMaterial({ color: '#ffffff' }), lilies);

  const travel=buildTravelDecor(root,S,W,H,lineN);
  // Soft contact shadows under everything that stands on the grass.
  const shadows = [];
  const shadowOf = (list, k, ky = 1) => {
    for (const it of list) {
      tp.setFromMatrixScale(it.m);
      const sx = tp.x * k * (S.shadowStretch ?? 1), sz = tp.z * k * ky;
      shadows.push({ x: it.x + sx * 0.15, z: it.z + sz * 0.2, r: Math.max(sx, sz), m: place(it.x + sx * 0.15, 0.35, it.z + sz * 0.2, 0, sx * 2, 1, sz * 2) });
    }
  };
  shadowOf(travel.shadows, .8); shadowOf(stones, 1.25); shadowOf(bushes, 1.3); shadowOf(trees, 1.2); shadowOf(mush, 0.7); shadowOf(leaves, 0.8);
  const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, color: S.shadow });
  const shadowGeo = new THREE.PlaneGeometry(1, 1); shadowGeo.rotateX(-Math.PI / 2);
  const shadowS = new Scatter(root, shadowGeo, shadowMat, shadows);
  shadowS.mesh.renderOrder = -1;
  const trunkS = new Scatter(root, new THREE.CylinderGeometry(0.6, 0.85, 1, 8, 1, true), toonMaterial(S.trunk), trunks);

  const scatters = [tuftS, flowerS, leafS, stoneS, mushS, bushS, crownS, trunkS, lilyS, shadowS, ...travel.scatters];
  let lastCull = null;

  return {
    season: S.id,
    weatherSources: trees.map(it=>({x:it.x,z:it.z,y:it.m.elements[13],r:it.r})),
    lineMats: [...lineMats],
    ground,
    root,
    // Free the GPU side when the season changes (the world is rebuilt).
    dispose() {
      scene.remove(root);
      const seen = new Set();
      root.traverse((o) => {
        for (const x of [o.geometry, ...[].concat(o.material ?? [])]) {
          if (!x || seen.has(x)) continue; seen.add(x);
          for (const v of Object.values(x.uniforms ?? {})) v.value?.isTexture && v.value.dispose();
          x.map?.dispose(); x.dispose();
        }
      });
    },
    // View: camera centre on the ground and half extents (world units).
    update(t, cx, cz, hx, hz) {
      swayT.value = t; groundMat.uniforms.uTime.value = t; travel.update?.(t);
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
// Looks per food type: shape, dough and topping colours. Choco stays dark (it is worth more).
const FOOD_LOOKS = {
  basic: [
    ['round', '#e6a95e', '#52301e'], ['round', '#efc27f', '#7a4526'],
    ['iced', '#efc27f', '#ffb3c6'], ['iced', '#e6a95e', '#fff4e6'],
    ['heart', '#e9b067', '#ff8fa8'], ['heart', '#efc27f', '#fff4e6'],
    ['star', '#f0c682', '#ffe07a'], ['star', '#c98445', '#fff8ee'],
    ['sandwich', '#e6a95e', '#fff3dd'], ['sandwich', '#efc27f', '#ffc2d1'],
  ],
  choco: [['round', '#7b4528', '#fff1dc'], ['sandwich', '#5a3322', '#fff7ea'], ['heart', '#7b4528', '#ff9fb5'], ['star', '#6b3b22', '#fff1dc']],
};
for (const k in FOOD_LOOKS) FOOD_LOOKS[k] = FOOD_LOOKS[k].map(([shape, dough, deco]) => ({ shape, dough: new THREE.Color(dough), deco: new THREE.Color(deco) }));
const mealLook=([shape,dough,deco])=>({shape,dough:new THREE.Color(dough),deco:new THREE.Color(deco)});
const JAPAN_FOOD={id:'japan',basic:[['nigiri','#fff1d5','#e88d72'],['maki','#34483c','#8aa85a'],['onigiri','#fff1d5','#34483c']].map(mealLook),choco:[['ramen','#53678b','#d6ad64'],['wok','#cc716d','#bc8b59']].map(mealLook),bone:mealLook(['taiyaki','#d89c53','#edbf75'])};
const ITALY_FOOD={id:'italy',basic:[['pizza_slice','#e0b16e','#c96352'],['ravioli','#e8c876','#f3d991'],['cantucci','#c89c61','#fff0c8']].map(mealLook),choco:[['spaghetti','#e9c472','#c95e50'],['gelato','#cba16d','#acc393']].map(mealLook),bone:mealLook(['pizza_whole','#dfb164','#c76150'])};
export const FOOD_SETS={default:{id:'cookies',...FOOD_LOOKS,bone:null},sakura:JAPAN_FOOD,kyoto:JAPAN_FOOD,italy:ITALY_FOOD};
export const foodSetFor=world=>FOOD_SETS[world]??FOOD_SETS.default;

const SIZE = { basic: [0.9, 1.08], choco: [0.95, 1.1], bone: [1, 1] }; // choco always reads bigger than basic
const frac = (x) => x - Math.floor(x);

export function buildFood(scene, max, world = 'summer') {
  const set = foodSetFor(world), themed = set !== FOOD_SETS.default;
  const lineN = outlineMaterial(false);
  const foodMat = toonMaterial('#ffffff'); foodMat.vertexColors = true;
  foodMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float part;\nattribute vec3 deco;')
      .replace('#include <color_vertex>', '#ifdef USE_COLOR_ALPHA\nvColor = vec4(1.0);\n#endif\n' +
        'vColor.rgb = color.rgb * (part < 0.5 ? vec3(1.0) : part < 1.5 ? instanceColor : deco);');
  };
  foodMat.customProgramCacheKey = () => 'food';
  const mk = (geo, mat) => {
    const mesh = new THREE.InstancedMesh(geo, mat, max);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3).fill(1), 3);
    mesh.frustumCulled = false;
    const line = new THREE.InstancedMesh(geo, lineN, max);
    line.instanceMatrix = mesh.instanceMatrix; line.frustumCulled = false;
    mesh.count = line.count = 0; mesh.visible = line.visible = false;
    scene.add(mesh, line);
    return { mesh, line, n: 0 };
  };
  const shapes = {};
  const geometries = themed ? Object.fromEntries([...new Set([...set.basic,...set.choco].map(L=>L.shape))].map(k=>[k,MEAL_GEOMETRIES[k]()])) : {round:roundCookie(),iced:icedCookie(),heart:heartCookie(),star:starCookie(),sandwich:sandwichCookie()};
  for (const [k, geo] of Object.entries(geometries)) {
    geo.setAttribute('deco', new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage));
    shapes[k] = mk(geo, foodMat);
  }
  const boneMat = themed ? foodMat : toonMaterial('#f7f0e0'); boneMat.vertexColors = true;
  const boneGeo = themed ? MEAL_GEOMETRIES[set.bone.shape]() : boneGeometry();
  if(themed) boneGeo.setAttribute('deco',new THREE.InstancedBufferAttribute(new Float32Array(max*3),3).setUsage(THREE.DynamicDrawUsage));
  const bones = mk(boneGeo,boneMat), all = [...Object.values(shapes),bones];
  let disposed = false;
  for(const [k,b] of [...Object.entries(shapes),[themed?set.bone.shape:'bone',bones]]){b.mesh.name='food:'+k;b.line.name='food-outline:'+k;}
  // Variant and size come from the food's random spin angle: stable for its whole life.
  const look = (type, rot) => { const L = set[type] ?? set.basic; return L[Math.floor(frac(Math.sin(rot * 91.17) * 43758.55) * L.length)]; };
  return {
    lineMats: [lineN],
    setId:set.id,
    dispose(){
      if(disposed)return;disposed=true;
      for(const b of all){scene.remove(b.mesh,b.line);b.mesh.geometry.dispose();b.mesh.dispose();b.line.dispose();}
      for(const m of new Set([foodMat,boneMat,lineN]))m.dispose();
      // Toon gradientMap belongs to the shared renderer module; never dispose it here.
    },
    size(type, rot) { const [a, b] = SIZE[type] ?? SIZE.basic; return a + (b - a) * frac(Math.sin(rot * 57.31) * 24634.63); },
    begin() { for (const b of all) b.n = 0; },
    add(type, rot, m) {
      if (type === 'bone') {
        if(bones.n>=max)return;
        bones.mesh.setMatrixAt(bones.n,m);
        if(themed){bones.mesh.setColorAt(bones.n,set.bone.dough);set.bone.deco.toArray(bones.mesh.geometry.attributes.deco.array,bones.n*3);}
        bones.n++;return;
      }
      const L = look(type, rot), b = shapes[L.shape];
      if(b.n>=max)return;
      b.mesh.setMatrixAt(b.n, m);
      b.mesh.setColorAt(b.n, L.dough);
      L.deco.toArray(b.mesh.geometry.attributes.deco.array, b.n * 3);
      b.n++;
    },
    end() {
      for (const b of all) {
        b.mesh.count = b.line.count = b.n;
        b.mesh.visible = b.line.visible = this.shown && b.n > 0; // empty instanced meshes still cost a draw call
        b.mesh.instanceMatrix.needsUpdate = true;
        b.mesh.instanceColor.needsUpdate = true;
        const d = b.mesh.geometry.attributes.deco;
        if (d) d.needsUpdate = true;
      }
    },
    shown: true,
    set visible(v) { this.shown = v; for (const b of all) b.mesh.visible = b.line.visible = v && b.n > 0; },
  };
}
