// Effects: the anime-style dash (air shock ring left behind, ground ring, wind streaks along
// the body, dust puffs). Everything is pooled; nothing is allocated per frame.
import * as THREE from 'three';

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Air wave: a broken ring, sharp white front (~6% of the diameter thick), narrow pale cyan rim
// outside, faint haze inside. The gaps make it read as a burst of air, not a bubble.
const waveTex = () => canvasTex(256, 256, (x) => {
  const g = x.createRadialGradient(128, 128, 40, 128, 128, 112);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,0.1)');
  x.fillStyle = g; x.beginPath(); x.arc(128, 128, 112, 0, Math.PI * 2); x.fill();
  x.lineCap = 'round';
  const arcs = [[0.15, 1.55], [1.85, 3.0], [3.3, 4.75], [5.05, 6.0]];
  for (const [a0, a1] of arcs) {
    x.strokeStyle = 'rgba(190,238,255,0.9)'; x.lineWidth = 4;
    x.beginPath(); x.arc(128, 128, 122, a0 + 0.05, a1 - 0.05); x.stroke();
    x.strokeStyle = '#fff'; x.lineWidth = 13;
    x.beginPath(); x.arc(128, 128, 112, a0, a1); x.stroke();
  }
});
// Ground ring: full and soft, only a hint on the grass.
const ringTex = () => canvasTex(128, 128, (x) => {
  const g = x.createRadialGradient(64, 64, 40, 64, 64, 63);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.75, 'rgba(255,255,255,0.9)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
});
// Wind streak: thin, sharp head at the front, long fading tail.
const streakTex = () => canvasTex(128, 16, (x) => {
  const g = x.createLinearGradient(0, 0, 128, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.85, 'rgba(255,255,255,0.95)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.beginPath(); x.moveTo(0, 8); x.quadraticCurveTo(100, 2, 126, 8); x.quadraticCurveTo(100, 14, 0, 8); x.fill();
});
const puffTex = () => canvasTex(64, 64, (x) => {
  const g = x.createRadialGradient(32, 30, 4, 32, 32, 31);
  g.addColorStop(0, 'rgba(255,250,235,1)'); g.addColorStop(0.7, 'rgba(240,228,200,0.9)');
  g.addColorStop(1, 'rgba(240,228,200,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
});


// Dash trails bought in the wardrobe: one atlas, one Points batch for every kind.
// Cells: 0 crumb, 1 heart, 2 petal, 3 bubble, 4 star, 5 soft dot (tinted: rainbow), 6 leaf and
// 7 snowflake (both drawn light, tinted per particle; seasons use them too).
export const TRAIL_CELL = { crumbs: 0, hearts: 1, petals: 2, bubbles: 3, stars: 4, rainbow: 5, leaves: 6, snow: 7 };
const LEAFY = ['#f08a3c', '#e8603a', '#f5b942'].map((c) => new THREE.Color(c));
const SNOWY = ['#ffffff', '#dceaff'].map((c) => new THREE.Color(c));
const RAINBOW = ['#ff8fa3', '#ffc078', '#ffe066', '#9be38b', '#8cc8ff', '#c5a3ff'].map((c) => new THREE.Color(c));
let atlas = null;
export const trailTex = () => atlas ??= canvasTex(256, 128, (x) => {
  const cell = (i, draw) => { x.save(); x.translate((i % 4) * 64 + 32, Math.floor(i / 4) * 64 + 32); draw(); x.restore(); };
  const ink = '#6b3f2a';
  x.lineJoin = 'round';
  cell(0, () => { // cookie crumb
    x.fillStyle = '#e0a35c'; x.strokeStyle = ink; x.lineWidth = 3;
    x.beginPath(); x.moveTo(-18, -6); x.lineTo(-4, -20); x.lineTo(16, -12); x.lineTo(20, 8); x.lineTo(2, 20); x.lineTo(-16, 12); x.closePath(); x.fill(); x.stroke();
    x.fillStyle = ink; for (const [a, b] of [[-6, -4], [8, 4], [-2, 10]]) { x.beginPath(); x.arc(a, b, 3, 0, 7); x.fill(); }
  });
  cell(1, () => { // heart
    x.fillStyle = '#ff6f9f'; x.strokeStyle = '#ffffff'; x.lineWidth = 4;
    x.beginPath(); x.moveTo(0, 22); x.bezierCurveTo(-30, 2, -22, -24, 0, -10); x.bezierCurveTo(22, -24, 30, 2, 0, 22); x.fill(); x.stroke();
  });
  cell(2, () => { // petal
    x.fillStyle = '#ffb3d1'; x.strokeStyle = '#ff8fbd'; x.lineWidth = 3;
    x.beginPath(); x.ellipse(0, 0, 12, 24, 0.5, 0, 7); x.fill(); x.stroke();
  });
  cell(3, () => { // soap bubble
    const g = x.createRadialGradient(0, 0, 10, 0, 0, 26);
    g.addColorStop(0, 'rgba(200,240,255,0.15)'); g.addColorStop(0.85, 'rgba(170,220,255,0.55)'); g.addColorStop(1, 'rgba(255,190,240,0.9)');
    x.fillStyle = g; x.beginPath(); x.arc(0, 0, 26, 0, 7); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.95)'; x.beginPath(); x.ellipse(-9, -10, 7, 4, -0.7, 0, 7); x.fill();
  });
  cell(4, () => { // star
    x.fillStyle = '#ffd84a'; x.strokeStyle = '#ffffff'; x.lineWidth = 4;
    x.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 11 : 26; x.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    x.closePath(); x.fill(); x.stroke();
  });
  cell(5, () => { // soft dot
    const g = x.createRadialGradient(0, 0, 4, 0, 0, 30);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.6, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.beginPath(); x.arc(0, 0, 30, 0, 7); x.fill();
  });
  cell(6, () => { // leaf: pointed oval with a vein, light so the tint gives its colour
    x.rotate(0.6);
    x.fillStyle = '#ffffff'; x.strokeStyle = '#b9a58c'; x.lineWidth = 3;
    x.beginPath(); x.moveTo(0, -26); x.quadraticCurveTo(20, -4, 0, 24); x.quadraticCurveTo(-20, -4, 0, -26); x.fill(); x.stroke();
    x.beginPath(); x.moveTo(0, -18); x.lineTo(0, 28); x.stroke();
    for (const k of [-8, 2]) { x.beginPath(); x.moveTo(0, k); x.lineTo(8, k - 7); x.moveTo(0, k + 4); x.lineTo(-8, k - 3); x.stroke(); }
  });
  cell(7, () => { // snowflake: six round-tipped arms on a soft glow
    const g = x.createRadialGradient(0, 0, 2, 0, 0, 22);
    g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.beginPath(); x.arc(0, 0, 22, 0, 7); x.fill();
    x.strokeStyle = '#ffffff'; x.lineCap = 'round'; x.lineWidth = 4;
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3, c = Math.cos(a), sn = Math.sin(a);
      x.beginPath(); x.moveTo(0, 0); x.lineTo(c * 20, sn * 20);
      x.moveTo(c * 12, sn * 12); x.lineTo(c * 12 + Math.cos(a + 0.8) * 6, sn * 12 + Math.sin(a + 0.8) * 6);
      x.moveTo(c * 12, sn * 12); x.lineTo(c * 12 + Math.cos(a - 0.8) * 6, sn * 12 + Math.sin(a - 0.8) * 6);
      x.stroke();
    }
  });
});
const SPLASH = ['#d8f3ff', '#9fd8f5'];
export const trailMaterial = (map) => new THREE.ShaderMaterial({
  uniforms: { uMap: { value: map }, uPx: { value: 1 } },
  vertexShader: `
    attribute float aSize; attribute float aCell; attribute float aAlpha; attribute float aRot; attribute vec3 aColor;
    uniform float uPx;
    varying float vCell; varying float vAlpha; varying float vRot; varying vec3 vColor;
    void main() {
      vCell = aCell; vAlpha = aAlpha; vRot = aRot; vColor = aColor;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = aSize * uPx;
    }`,
  fragmentShader: `
    uniform sampler2D uMap;
    varying float vCell; varying float vAlpha; varying float vRot; varying vec3 vColor;
    void main() {
      vec2 p = gl_PointCoord - 0.5, c = vec2(cos(vRot), sin(vRot));
      p = vec2(c.x * p.x - c.y * p.y, c.y * p.x + c.x * p.y) + 0.5;
      if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) discard;
      vec2 cell = vec2(mod(vCell, 4.0), floor(vCell / 4.0));
      vec4 t = texture2D(uMap, vec2((cell.x + p.x) / 4.0, 1.0 - (cell.y + p.y) / 2.0));
      if (t.a * vAlpha < 0.01) discard;
      gl_FragColor = vec4(t.rgb * vColor, t.a * vAlpha);
      #include <colorspace_fragment>
    }`,
  transparent: true, depthWrite: false,
});

const easeOut = (x) => 1 - (1 - x) ** 3;
const WHITE = new THREE.Color(1, 1, 1);
const UP = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const tv = new THREE.Vector3(), tx = new THREE.Vector3(), ty = new THREE.Vector3(), tz = new THREE.Vector3();
const tm = new THREE.Matrix4();

export class FX {
  constructor(scene) {
    this.scene = scene;
    // Rings: vertical "air" rings and flat ground rings share one pool of meshes.
    const tex = { wave: waveTex(), ground: ringTex() }, plane = new THREE.PlaneGeometry(2, 2);
    this.rings = Array.from({ length: 12 }, () => {
      const m = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false,
        side: THREE.DoubleSide }));
      m.visible = false; m.renderOrder = 5; scene.add(m);
      return { m, t: 0, life: 0, r0: 0, r1: 0, a: 0, ey: 1 };
    });
    this.tex = tex;
    // Streaks: one instanced batch.
    this.maxStreaks = 64;
    this.streakMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: streakTex(), transparent: true, depthWrite: false, side: THREE.DoubleSide }),
      this.maxStreaks);
    this.streakMesh.frustumCulled = false; this.streakMesh.renderOrder = 6; this.streakMesh.count = 0;
    this.streakMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.streakMesh);
    this.streaks = Array.from({ length: this.maxStreaks }, () => ({ p: new THREE.Vector3(), d: new THREE.Vector3(), t: 1, life: 1, len: 1, w: 1 }));
    this.si = 0;
    // Dust puffs: sprites.
    const pt = puffTex();
    this.puffs = Array.from({ length: 24 }, () => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: pt, transparent: true, depthWrite: false }));
      s.visible = false; s.renderOrder = 4; scene.add(s);
      return { s, t: 0, life: 0, r: 1, v: new THREE.Vector3() };
    });
    this.pi = 0; this.ri = 0;
    // Trails: pooled particles in one Points draw.
    const N = this.maxTrail = 240, geo = new THREE.BufferGeometry();
    for (const [k, n] of [['position', 3], ['aSize', 1], ['aCell', 1], ['aAlpha', 1], ['aRot', 1], ['aColor', 3]]) {
      geo.setAttribute(k, new THREE.BufferAttribute(new Float32Array(N * n), n).setUsage(THREE.DynamicDrawUsage));
    }
    geo.setDrawRange(0, 0);
    this.trailPts = new THREE.Points(geo, trailMaterial(trailTex()));
    this.trailPts.frustumCulled = false; this.trailPts.renderOrder = 6;
    scene.add(this.trailPts);
    this.parts = Array.from({ length: N }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), t: 1, life: 1,
      size: 1, cell: 0, rot: 0, vr: 0, g: 0, c: new THREE.Color() }));
    this.ti = 0; this.rbi = 0;
  }

  // `count` new trail particles of `kind` behind a dashing dog.
  trail(kind, pos, dir, R, count) {
    const cell = TRAIL_CELL[kind] ?? 5, rb = kind === 'rainbow';
    tx.set(-dir.z, 0, dir.x);
    for (let i = 0; i < count; i++) {
      const band = rb ? 6 : 1, jit = (Math.random() - 0.5) * R * 0.5;
      for (let j = 0; j < band; j++) {
        const T = this.parts[this.ti++ % this.maxTrail];
        T.p.copy(pos).addScaledVector(dir, -R * 0.7).addScaledVector(tx, rb ? 0 : jit);
        T.p.y = rb ? R * (1.25 - j * 0.13) : R * (0.4 + Math.random() * 0.9);
        T.v.copy(dir).multiplyScalar(-R * (rb ? 0.2 : 0.8)).addScaledVector(tx, rb ? 0 : jit * 0.8);
        T.v.y = rb ? 0 : R * (kind === 'bubbles' ? 0.9 : kind === 'crumbs' ? 1.2 : 0.5);
        T.g = kind === 'crumbs' ? R * 5 : kind === 'petals' || kind === 'leaves' ? R * 0.6 : kind === 'snow' ? R * 0.3 : 0;
        // Short-lived, and crumbs vanish before they land: nothing on the grass may look like food.
        T.t = 0; T.life = rb ? 0.5 : kind === 'crumbs' ? 0.35 + Math.random() * 0.1 : 0.5 + Math.random() * 0.3;
        T.size = R * (rb ? 0.3 : kind === 'crumbs' ? 0.2 + Math.random() * 0.08 : 0.3 + Math.random() * 0.15);
        T.cell = cell; T.rot = Math.random() * 6.28; T.vr = rb || kind === 'bubbles' ? 0 : (Math.random() - 0.5) * 8;
        T.c.copy(rb ? RAINBOW[j] : kind === 'leaves' ? LEAFY[i % 3] : kind === 'snow' ? SNOWY[i % 2] : WHITE);
      }
    }
  }

  // Water drops thrown up where a dog runs into a puddle, and a ring on the water.
  splash(pos, R, big, vx = 0, vz = 0, cols = SPLASH) {
    const n = big ? 22 : 9, v = Math.hypot(vx, vz) || 1;
    for (let i = 0; i < n; i++) {
      const T = this.parts[this.ti++ % this.maxTrail], a = Math.random() * Math.PI * 2, s = R * (1 + Math.random() * (big ? 2.4 : 1.4));
      T.p.copy(pos).add(tv.set(Math.cos(a) * R * 0.5, R * 0.15, Math.sin(a) * R * 0.5));
      T.v.set(Math.cos(a) * s * 0.6 + vx / v * R * 0.8, s * (1.2 + Math.random()), Math.sin(a) * s * 0.6 + vz / v * R * 0.8);
      T.g = R * 9; T.t = 0; T.life = 0.35 + Math.random() * 0.2;
      T.size = R * (0.12 + Math.random() * 0.1); T.cell = TRAIL_CELL.bubbles; T.rot = 0; T.vr = 0;
      T.c.set(cols[Math.random() < 0.5 ? 0 : 1]);
    }
    tv.copy(pos); tv.y = 0.8;
    this.ring(tv, UP, R * 0.4, R * (big ? 2.6 : 1.6), big ? 0.5 : 0.35, 0.7, this.tex.ground);
  }

  ring(pos, normal, r0, r1, life, alpha, tex, ey = 1) {
    const R = this.rings[this.ri++ % this.rings.length];
    R.m.position.copy(pos); R.m.quaternion.setFromUnitVectors(Z, normal);
    R.m.rotateZ(Math.random() * Math.PI * 2); // gaps land somewhere new each time
    if (R.m.material.map !== tex) { R.m.material.map = tex; R.m.material.needsUpdate = true; }
    Object.assign(R, { t: 0, life, r0, r1, a: alpha, ey });
    R.m.visible = true;
  }

  // Dash start at world `pos` (feet), heading `dir` (unit, horizontal), dog radius `R`.
  dashBurst(pos, dir, R, chestY) {
    // Anime air wave: one broken ellipse standing across the path, left where the dash began.
    tv.copy(pos).addScaledVector(dir, R * 0.2); tv.y = chestY;
    this.ring(tv, dir, R * 0.6, R * 1.6, 0.19, 1, this.tex.wave, 0.8);
    // A faint ring on the grass.
    tv.copy(pos); tv.y = 0.6;
    this.ring(tv, UP, R * 0.6, R * 2.2, 0.25, 0.2, this.tex.ground);
    // Two or three long trails along the dash.
    this.dashWind(pos, dir, R, 3, 1.2, 1.8);
    // A little dust kicked up behind, not enough to hide the paws.
    for (let i = 0; i < 3; i++) {
      const P = this.puffs[this.pi++ % this.puffs.length];
      const a = Math.atan2(dir.z, dir.x) + Math.PI + (Math.random() - 0.5) * 1.4;
      P.s.position.set(pos.x + Math.cos(a) * R * 0.5, R * 0.2, pos.z + Math.sin(a) * R * 0.5);
      P.v.set(Math.cos(a) * R * 2, R * (0.6 + 0.6 * Math.random()), Math.sin(a) * R * 2);
      Object.assign(P, { t: 0, life: 0.35 + Math.random() * 0.15, r: R * (0.3 + Math.random() * 0.2) });
      P.s.visible = true;
    }
  }

  // `count` new wind streaks along the body (the caller spreads them over the dash).
  dashWind(pos, dir, R, count, len0 = 0.9, len1 = 1.4) {
    for (let i = 0; i < count; i++) {
      const S = this.streaks[this.si++ % this.maxStreaks];
      const side = (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 0.6);
      tx.set(-dir.z, 0, dir.x); // dog's right
      S.p.copy(pos).addScaledVector(tx, side * R).addScaledVector(dir, R * (Math.random() * 1.2 - 0.2));
      S.p.y = R * (0.25 + Math.random() * 1.3);
      S.d.copy(dir);
      Object.assign(S, { t: 0, life: 0.18 + Math.random() * 0.1, len: R * (len0 + Math.random() * (len1 - len0)), w: R * (0.04 + Math.random() * 0.03) });
    }
  }

  update(dt, camera, pxPerUnit = 1) {
    this.updateTrail(dt, pxPerUnit);
    for (const R of this.rings) {
      if (!R.m.visible) continue;
      R.t += dt;
      const k = R.t / R.life;
      if (k >= 1) { R.m.visible = false; continue; }
      const sc = R.r0 + (R.r1 - R.r0) * easeOut(k);
      R.m.scale.set(sc, sc * R.ey, 1);
      R.m.material.opacity = R.a * (1 - k * k);
    }
    // Streaks face the camera, long axis along their direction.
    camera.getWorldDirection(tz).negate();
    let n = 0;
    for (const S of this.streaks) {
      if (S.t >= S.life) continue;
      S.t += dt;
      const k = Math.min(1, S.t / S.life);
      tx.copy(S.d);
      ty.crossVectors(tz, tx).normalize();
      const nz = tv.crossVectors(tx, ty);
      tm.makeBasis(tx, ty, nz);
      tm.scale(tv.set(S.len * (0.6 + 0.4 * k), S.w * (1 - k), 1));
      tm.setPosition(S.p);
      this.streakMesh.setMatrixAt(n++, tm);
    }
    this.streakMesh.count = n;
    this.streakMesh.instanceMatrix.needsUpdate = true;
    for (const P of this.puffs) {
      if (!P.s.visible) continue;
      P.t += dt;
      const k = P.t / P.life;
      if (k >= 1) { P.s.visible = false; continue; }
      P.s.position.addScaledVector(P.v, dt);
      P.v.multiplyScalar(Math.exp(-5 * dt));
      P.s.scale.setScalar(P.r * (0.6 + 0.9 * easeOut(k)));
      P.s.material.opacity = 0.9 * (1 - k);
    }
  }

  // Fitting room treadmill: the dog runs in place, so the effects slide back instead.
  drift(dx, dz) {
    for (const T of this.parts) if (T.t < T.life) { T.p.x += dx; T.p.z += dz; }
    for (const S of this.streaks) if (S.t < S.life) { S.p.x += dx; S.p.z += dz; }
    for (const P of this.puffs) if (P.s.visible) { P.s.position.x += dx; P.s.position.z += dz; }
    for (const R of this.rings) if (R.m.visible) { R.m.position.x += dx; R.m.position.z += dz; }
  }

  updateTrail(dt, pxPerUnit) {
    const g = this.trailPts.geometry, A = g.attributes;
    let n = 0;
    for (const T of this.parts) {
      if (T.t >= T.life) continue;
      T.t += dt;
      const k = T.t / T.life;
      if (k >= 1) continue;
      T.v.y -= T.g * dt; T.p.addScaledVector(T.v, dt); T.rot += T.vr * dt;
      A.position.setXYZ(n, T.p.x, Math.max(T.p.y, T.size * 0.3), T.p.z);
      A.aSize.setX(n, T.size * (k < 0.15 ? k / 0.15 : 1));
      A.aCell.setX(n, T.cell); A.aRot.setX(n, T.rot);
      A.aAlpha.setX(n, k < 0.6 ? 1 : (1 - k) / 0.4);
      A.aColor.setXYZ(n, T.c.r, T.c.g, T.c.b);
      n++;
    }
    if (n) for (const a of Object.values(A)) a.needsUpdate = true;
    g.setDrawRange(0, n);
    this.trailPts.material.uniforms.uPx.value = pxPerUnit;
  }
}
