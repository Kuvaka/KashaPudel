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

// Shock ring: soft inside, bright white band with a pale cyan rim.
const ringTex = () => canvasTex(128, 128, (x) => {
  const g = x.createRadialGradient(64, 64, 20, 64, 64, 63);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  g.addColorStop(0.8, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.9, 'rgba(200,240,255,0.9)');
  g.addColorStop(1, 'rgba(200,240,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
});
// Wind streak: thin, tapered at both ends, brightest near the front.
const streakTex = () => canvasTex(128, 16, (x) => {
  const g = x.createLinearGradient(0, 0, 128, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.7, 'rgba(255,255,255,0.95)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.beginPath(); x.ellipse(64, 8, 63, 5, 0, 0, Math.PI * 2); x.fill();
});
const puffTex = () => canvasTex(64, 64, (x) => {
  const g = x.createRadialGradient(32, 30, 4, 32, 32, 31);
  g.addColorStop(0, 'rgba(255,250,235,1)'); g.addColorStop(0.7, 'rgba(240,228,200,0.9)');
  g.addColorStop(1, 'rgba(240,228,200,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
});

const easeOut = (x) => 1 - (1 - x) ** 3;
const UP = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const tv = new THREE.Vector3(), tx = new THREE.Vector3(), ty = new THREE.Vector3(), tz = new THREE.Vector3();
const tm = new THREE.Matrix4();

export class FX {
  constructor(scene) {
    this.scene = scene;
    // Rings: vertical "air" rings and flat ground rings share one pool of meshes.
    const rt = ringTex(), plane = new THREE.PlaneGeometry(2, 2);
    this.rings = Array.from({ length: 12 }, () => {
      const m = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: rt, transparent: true, depthWrite: false,
        side: THREE.DoubleSide }));
      m.visible = false; m.renderOrder = 5; scene.add(m);
      return { m, t: 0, life: 0, r0: 0, r1: 0, a: 0 };
    });
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
  }

  ring(pos, normal, r0, r1, life, alpha) {
    const R = this.rings[this.ri++ % this.rings.length];
    R.m.position.copy(pos); R.m.quaternion.setFromUnitVectors(Z, normal);
    Object.assign(R, { t: 0, life, r0, r1, a: alpha });
    R.m.visible = true;
  }

  // Dash start at world `pos` (feet), heading `dir` (unit, horizontal), dog radius `R`.
  dashBurst(pos, dir, R, chestY) {
    // Anime air wave: two rings standing across the path, left where the dash began.
    tv.copy(pos).addScaledVector(dir, R * 0.2); tv.y = chestY;
    this.ring(tv, dir, R * 0.7, R * 2.2, 0.38, 0.95);
    tv.addScaledVector(dir, -R * 0.5);
    this.ring(tv, dir, R * 0.5, R * 1.6, 0.3, 0.7);
    // Flat ring on the grass.
    tv.copy(pos); tv.y = 0.6;
    this.ring(tv, UP, R * 0.6, R * 2.6, 0.42, 0.75);
    // Dust kicked up behind.
    for (let i = 0; i < 6; i++) {
      const P = this.puffs[this.pi++ % this.puffs.length];
      const a = Math.atan2(dir.z, dir.x) + Math.PI + (Math.random() - 0.5) * 1.8;
      P.s.position.set(pos.x + Math.cos(a) * R * 0.5, R * 0.2, pos.z + Math.sin(a) * R * 0.5);
      P.v.set(Math.cos(a) * R * 2.2, R * (0.8 + Math.random()), Math.sin(a) * R * 2.2);
      Object.assign(P, { t: 0, life: 0.45 + Math.random() * 0.2, r: R * (0.35 + Math.random() * 0.25) });
      P.s.visible = true;
    }
  }

  // `count` new wind streaks along the body (the caller spreads them over the dash).
  dashWind(pos, dir, R, count) {
    for (let i = 0; i < count; i++) {
      const S = this.streaks[this.si++ % this.maxStreaks];
      const side = (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 0.6);
      tx.set(-dir.z, 0, dir.x); // dog's right
      S.p.copy(pos).addScaledVector(tx, side * R).addScaledVector(dir, R * (Math.random() * 1.2 - 0.2));
      S.p.y = R * (0.25 + Math.random() * 1.3);
      S.d.copy(dir);
      Object.assign(S, { t: 0, life: 0.18 + Math.random() * 0.12, len: R * (0.9 + Math.random() * 0.9), w: R * (0.05 + Math.random() * 0.04) });
    }
  }

  update(dt, camera) {
    for (const R of this.rings) {
      if (!R.m.visible) continue;
      R.t += dt;
      const k = R.t / R.life;
      if (k >= 1) { R.m.visible = false; continue; }
      R.m.scale.setScalar(R.r0 + (R.r1 - R.r0) * easeOut(k));
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
}
