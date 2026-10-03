// One dog on screen. Reads the game's dog state (never writes it) and keeps its own animation
// state: heading, gait phase, planted feet, springs, blinking.
// Root-local frame: +x = nose direction, +y = up, +z = dog's right. Units = collision radius R
// (the root is scaled by drawR), except planted feet which are kept in world space.
import * as THREE from 'three';
import { PROFILES } from './dogModel.js';
import { CONFIG } from '../src/config.js';
import { stunPhase } from '../src/game.js';
import { coatMaterial, outlineMaterial, outline } from './toon.js';

const STAGES = CONFIG.stages, LAST = STAGES.length - 1;
// Colours sampled from the 2D sprites (assets/dog_stage*.png): coat, light muzzle/chest, ears.
const PALETTE = [
  { coat: '#f4dfbd', light: '#fdf6e6', ear: '#e6c393' },
  { coat: '#f2cd9c', light: '#fdebc8', ear: '#dca66a' },
  { coat: '#e0904f', light: '#f9c48a', ear: '#c26e38' },
  { coat: '#9a5d3a', light: '#f1d3b0', ear: '#74422a' },
  { coat: '#cdc2bb', light: '#f7ecdd', ear: '#b5a69d' },
  { coat: '#f2c789', light: '#fcebc0', ear: '#dca15e' },
];
const COATS = PALETTE.map((p) => p.coat), EARS = PALETTE.map((p) => p.ear), LIGHTS = PALETTE.map((p) => p.light);
const SOCKS = [false, false, false, true, true, false]; // fully light paws (brown, grey); others half

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const frac = (x) => x - Math.floor(x);
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const easeOutBack = (x) => 1 + 2.7 * (x - 1) ** 3 + 1.7 * (x - 1) ** 2;

// FL, FR, HL, HR. Phase offsets for trot and for the bouncy bound used at speed.
const LEGS = [
  { front: true, side: -1, trot: 0, bound: 0 },
  { front: true, side: 1, trot: 0.5, bound: 0.08 },
  { front: false, side: -1, trot: 0.5, bound: 0.5 },
  { front: false, side: 1, trot: 0, bound: 0.58 },
];

const tmpM = new THREE.Matrix4();
const fxDir = new THREE.Vector3(), fxPos = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0), FWD_Z = new THREE.Vector3(0, 0, 1);
const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3(), tmpD = new THREE.Vector3();

function mixProfile(a, b, t) {
  const o = {};
  for (const k in a) o[k] = lerp(a[k], b[k], t);
  return o;
}

function swirlTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  x.lineCap = 'round';
  for (const [w, col] of [[16, '#3a2618'], [8, '#ffffff']]) {
    x.strokeStyle = col; x.lineWidth = w; x.beginPath();
    for (let i = 0; i <= 90; i++) {
      const a = (i / 90) * Math.PI * 4, r = (i / 90) * 52;
      i ? x.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r) : x.moveTo(64, 64);
    }
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function blobTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 4, 32, 32, 32);
  g.addColorStop(0, 'rgba(20,45,10,0.55)'); g.addColorStop(0.6, 'rgba(20,45,10,0.3)'); g.addColorStop(1, 'rgba(20,45,10,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

let shared = null;
function sharedMaterials(assets) {
  if (shared) return shared;
  shared = {
    eye: new THREE.MeshBasicMaterial({ map: assets.eyeTex }),
    // Glossy bead eye: a real dark dome, the highlight comes from the light, not painted.
    eyeBall: new THREE.MeshPhongMaterial({ color: 0x2a1408, shininess: 120, specular: 0xffffff, emissive: 0x120804 }),
    dizzy: new THREE.MeshBasicMaterial({ map: assets.dizzyTex }),
    nose: new THREE.MeshPhongMaterial({ color: 0x3a2014, shininess: 60, specular: 0x8a6a5a }),
    shadow: new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false }),
    swirl: new THREE.SpriteMaterial({ map: swirlTexture(), depthTest: false }),
    playerRing: new THREE.MeshBasicMaterial({ color: 0xffe45c, transparent: true, opacity: 0.9, depthWrite: false }),
    immuneRing: new THREE.MeshBasicMaterial({ color: 0xb4f5ff, transparent: true, opacity: 0.8, depthWrite: false }),
    gold: new THREE.MeshPhongMaterial({ color: 0xffc83a, shininess: 90, specular: 0xffffff }),
    plane: new THREE.PlaneGeometry(1, 1),
    ring: new THREE.RingGeometry(0.86, 1, 40),
  };
  return shared;
}

function makeCrown(mat) {
  const g = new THREE.Group();
  const band = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.45, 20, 1, true), mat);
  mat.side = THREE.DoubleSide;
  g.add(band);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.6, 8), mat);
    spike.position.set(Math.cos(a) * 0.9, 0.5, Math.sin(a) * 0.9);
    g.add(spike);
  }
  return g;
}

export class DogVisual {
  // Set by the renderer every frame: drawing-buffer size, device px per world unit, DPR.
  static view = { res: new THREE.Vector2(1, 1), pxPerUnit: 1, dpr: 1 };
  static fx = null; // effects pool (fx.js), set by the renderer

  constructor(assets, scene, isPlayer) {
    this.assets = assets;
    const M = sharedMaterials(assets);
    this.mat = coatMaterial(COATS[0], LIGHTS[0]);
    this.earMat = coatMaterial(EARS[0]);
    this.pawMat = coatMaterial(COATS[0]);
    this.lineMat = outlineMaterial();
    this.lineMatR = outlineMaterial(true);
    this.color = new THREE.Color(); this.color2 = new THREE.Color();

    // root: physical position and heading (shadow, rings). pose: hop and tumble on top of it.
    const root = this.root = new THREE.Group();
    scene.add(root);
    const pose = this.pose = new THREE.Group();
    root.add(pose);

    this.shadow = new THREE.Mesh(M.plane, M.shadow);
    this.shadow.rotation.x = -Math.PI / 2; this.shadow.position.y = 0.01; this.shadow.renderOrder = -1;
    root.add(this.shadow);
    if (isPlayer) {
      this.ring = new THREE.Mesh(M.ring, M.playerRing);
      this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = 0.02;
      root.add(this.ring);
    }
    this.immuneRing = new THREE.Mesh(M.ring, M.immuneRing);
    this.immuneRing.rotation.x = -Math.PI / 2; this.immuneRing.position.y = 0.03;
    root.add(this.immuneRing);

    this.body = new THREE.Group(); pose.add(this.body);
    this.bodyMesh = new THREE.Mesh(assets.body, this.mat); this.body.add(this.bodyMesh);
    this.tail = new THREE.Group(); this.body.add(this.tail);
    this.tailMesh = new THREE.Mesh(assets.tail, this.mat); this.tail.add(this.tailMesh);

    this.head = new THREE.Group(); pose.add(this.head);
    this.headMesh = new THREE.Mesh(assets.head, this.mat); this.head.add(this.headMesh);
    // Eyes: glossy beads; the flat disc is only used for the dizzy swirl.
    this.eyes = [-1, 1].map(() => {
      const b = new THREE.Mesh(assets.eyeBall, M.eyeBall), e = new THREE.Mesh(assets.eyeGeo, M.dizzy);
      this.head.add(b, e);
      return { b, e };
    });
    this.brows = [-1, 1].map(() => { const m = new THREE.Mesh(assets.ball, this.mat); this.head.add(m); return m; });
    this.nose = new THREE.Mesh(assets.noseGeo, M.nose); this.head.add(this.nose);
    this.ears = [-1, 1].map((side) => {
      const pivot = new THREE.Group(), m = new THREE.Mesh(assets.ear, this.earMat);
      pivot.add(m); this.head.add(pivot);
      return { side, pivot, mesh: m, a: 0, v: 0 };
    });
    this.crown = makeCrown(M.gold); this.crown.visible = false; this.head.add(this.crown);

    this.swirl = new THREE.Sprite(M.swirl); this.swirl.visible = false; this.swirl.renderOrder = 10;
    pose.add(this.swirl);

    this.legs = LEGS.map((L) => {
      const upper = new THREE.Mesh(assets.limb, this.mat), lower = new THREE.Mesh(assets.limb, this.mat);
      const knee = new THREE.Mesh(assets.ball, this.mat), paw = new THREE.Mesh(assets.ball, this.pawMat);
      pose.add(upper, lower, knee, paw);
      return { ...L, upper, lower, knee, paw, foot: new THREE.Vector3(), from: new THREE.Vector3(),
        swing: false, t: 0, quick: null, over: 0 };
    });

    this.mouth = new THREE.Mesh(M.plane, new THREE.MeshBasicMaterial({ map: assets.mouthClosed, transparent: true,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    this.head.add(this.mouth);
    // Dark outline around every furry part, like the sprites.
    for (const m of [this.bodyMesh, this.headMesh, this.tailMesh, ...this.ears.map((e) => e.mesh),
      ...this.legs.flatMap((L) => [L.upper, L.lower, L.knee, L.paw])]) outline(m, this.lineMat, this.lineMatR);

    this.yaw = 0; this.yawRate = 0; this.phase = 0; this.speed = 0; this.gait = 0;
    this.blinkT = 2 + Math.random() * 3; this.blink = 0;
    this.seed = Math.random() * 100;
    this.inited = false; this.wasStunned = false;
  }

  shoulderOf(a0, a1, w) { return a0.shoulder.map((v, i) => lerp(v, a1.shoulder[i], w)); }
  hipOf(a0, a1, w) { return a0.hip.map((v, i) => lerp(v, a1.hip[i], w)); }

  dispose() {
    this.root.removeFromParent();
    for (const m of [this.mat, this.earMat, this.pawMat, this.lineMat, this.lineMatR, this.mouth.material]) m.dispose();
  }

  // x, y: interpolated game position; d: the game dog.
  update(d, x, y, dt, t) {
    const A = this.assets, s = d.drawR;
    // --- Evolution: blend the two neighbouring stage profiles -------------------------------
    const st = d.stage, next = Math.min(st + 1, LAST);
    const u = st === LAST ? 0 : clamp((d.xp - STAGES[st].xp) / (STAGES[next].xp - STAGES[st].xp), 0, 1);
    const w = smooth(u);
    const P = mixProfile(PROFILES[st], PROFILES[next], w);
    const a0 = A.anchors[st], a1 = A.anchors[next];
    for (const m of [this.bodyMesh, this.headMesh]) {
      m.morphTargetInfluences.fill(0);
      m.morphTargetInfluences[st] += 1 - w;
      m.morphTargetInfluences[next] += w;
    }
    // Keep the stage's own coat for most of the interval, then turn into the next one.
    const cu = smooth((u - 0.7) / 0.3);
    this.mat.color.set(COATS[st]).lerp(this.color2.set(COATS[next]), cu);
    this.mat.userData.patch.value.set(LIGHTS[st]).lerp(this.color2.set(LIGHTS[next]), cu);
    this.earMat.color.set(EARS[st]).lerp(this.color2.set(EARS[next]), cu);
    this.pawMat.color.copy(this.mat.color).lerp(this.mat.userData.patch.value, SOCKS[cu < 0.5 ? st : next] ? 1 : 0.6);
    // Constant-looking line: ~3% of the dog's on-screen size, in device pixels.
    const V = DogVisual.view;
    for (const lm of [this.lineMat, this.lineMatR]) {
      lm.uniforms.uRes.value.copy(V.res);
      lm.uniforms.uPx.value = clamp(0.04 * s * V.pxPerUnit, 1.3 * V.dpr, 2.2 * V.dpr);
    }

    // --- Heading: face where the dog wants to go; while sliding, velocity lags behind ------
    const v = Math.hypot(d.vx, d.vy);
    let want = this.yaw;
    if (!d.stun && d.mag > 0.1) want = Math.atan2(-d.dirY, d.dirX);
    else if (v > 0.6 * s) want = Math.atan2(-d.vy, d.vx);
    const turnMax = (d.stun ? 0 : 9) * dt;
    const dy = clamp(wrapAngle(want - this.yaw), -turnMax, turnMax);
    this.yaw = wrapAngle(this.yaw + dy);
    this.yawRate = lerp(this.yawRate, dy / Math.max(dt, 1e-4), 1 - Math.exp(-10 * dt));

    const root = this.root;
    root.position.set(x, 0, y);
    root.rotation.set(0, this.yaw, 0);
    root.scale.setScalar(s);

    this.speed = lerp(this.speed, v, 1 - Math.exp(-12 * dt));
    const norm = this.speed / (11 * s); // 1 = a puppy's normal top speed
    const moving = this.speed > 0.3 * s;
    this.gait = lerp(this.gait, smooth((norm - 0.55) / 0.5) * (moving ? 1 : 0) + (d.dashT > 0 ? 0.6 : 0), 1 - Math.exp(-5 * dt));
    const g = clamp(this.gait, 0, 1);

    // Stride: longer at speed; cadence capped so short puppy legs don't blur.
    // Cadence: the natural stride, but never a stance longer than the leg can reach (short
    // puppy legs patter faster, grown dogs lope). Capped so the legs don't blur.
    const duty = lerp(0.62, 0.26, smooth(norm));
    const reach = 1.15 * (P.sh - P.leg * 0.95) * 1.12 * s;
    const stride = P.sh * (1.7 + 1.5 * Math.min(1, norm)) * s;
    const freq = moving ? Math.min(8, Math.max(this.speed / stride, this.speed * duty / reach)) : 0;
    this.phase += freq * dt;
    const ph = this.phase;

    // --- Knock-down phases ------------------------------------------------------------------
    const down = d.stun > 0 ? stunPhase(d) : null;

    // --- Body pose ----------------------------------------------------------------------------
    const amp = P.sh * (0.05 * (1 - g) + 0.13 * g) * Math.min(1, norm * 1.5);
    // Lowest in mid-stance, highest in the flight between front and hind pairs; in a bound the
    // chest dips while the front paws are down and the rump while the hind ones are.
    const cF = duty / 2 + 0.04 * g;
    const bob = amp * (0.5 - 0.5 * Math.cos(4 * Math.PI * (ph - cF)));
    let bodyY = a0.bodyY + (a1.bodyY - a0.bodyY) * w + bob;
    let pitch = -g * Math.cos(2 * Math.PI * (ph - cF)) * 0.12 * Math.min(1, norm);
    let roll = clamp(-this.yawRate * norm * 0.06, -0.3, 0.3);
    let rootLift = 0, rootRoll = 0;
    if (!down && d.skid > 90) pitch -= Math.min(0.2, (d.skid - 90) / 500); // lean back while skidding
    const breathe = moving ? 0 : Math.sin(t * 2.4 + this.seed) * 0.012;

    // Knock-down storyboard: tumble -> dazed sit -> crouch, hop, land.
    const sitY = P.bw * 0.43 + P.bl * 0.14, sitPitch = 0.5;
    let squash = 0; this.daze = 0;
    if (down && !this.wasStunned) {
      // Roll away from the hit: sign of the sideways velocity in the dog's frame.
      const lz = Math.sin(this.yaw) * d.vx + Math.cos(this.yaw) * d.vy; // velocity along root +z
      this.rollSign = lz >= 0 ? 1 : -1; // +x roll tips the back towards +z
    }
    if (down) {
      const k = down.k, rs = this.rollSign ?? -1;
      if (down.phase === 'fall') {
        squash = 0.12 * smooth(k / 0.15) * (1 - smooth((k - 0.15) / 0.2));
        rootRoll = rs * Math.PI * 2 * smooth((k - 0.1) / 0.65);
        const settle = smooth((k - 0.7) / 0.3);
        this.daze = smooth((k - 0.5) / 0.5);
        bodyY = lerp(bodyY, sitY, settle); pitch = sitPitch * settle; roll = 0;
        // Keep the head and back above the grass while upside down.
        const upExt = P.bw * 0.45 + P.hw * 0.7;
        rootLift = Math.max(0, -Math.cos(rootRoll)) * Math.max(0, upExt - bodyY) + Math.sin(Math.PI * smooth(k / 0.75)) * 0.12;
        squash += 0.1 * smooth((k - 0.85) / 0.15) * (1 - k) * 6;
      } else if (down.phase === 'sit') {
        const amp = smooth(k / 0.15) * (1 - smooth((k - 0.85) / 0.15));
        this.daze = Math.max(0.25, amp);
        bodyY = sitY; pitch = sitPitch + Math.sin(t * 3) * 0.04 * amp + (1 - smooth(k / 0.15)) * 0.06;
        roll = Math.sin(t * 2.2) * 0.06 * amp;
      } else {
        const rise = smooth((k - 0.2) / 0.4);
        bodyY = lerp(sitY, bodyY, rise) - P.sh * 0.12 * Math.sin(Math.PI * clamp(k / 0.3, 0, 1));
        pitch = lerp(sitPitch, 0, smooth((k - 0.15) / 0.45)); roll = 0;
        rootLift = 0.2 * Math.sin(Math.PI * clamp((k - 0.35) / 0.5, 0, 1));
        squash = 0.1 * Math.sin(Math.PI * clamp((k - 0.85) / 0.15, 0, 1));
        this.daze = 1 - smooth(k / 0.25);
      }
    }
    // Tumble around the body's own centre, not around a point on the ground.
    const cy = bodyY;
    this.pose.position.set(0, rootLift + cy, 0);
    this.pose.rotation.set(rootRoll, 0, 0);
    this.pose.updateMatrix();
    this.pose.matrix.multiply(tmpM.makeTranslation(0, -cy, 0));
    this.pose.matrixAutoUpdate = false;

    this.body.position.set(0, bodyY + breathe, 0);
    this.body.rotation.set(roll, 0, pitch);
    this.body.updateMatrix();
    // Pelvis drop: if a planted paw can't be reached from where the bob put the body, lower
    // the body a little instead of lifting the paw off the grass.
    if (!down && moving && this.inited) {
      const pawR = P.leg * 0.95, maxL = (P.sh - pawR) * 1.12 * 1.15 * 0.98;
      const sh = this.shoulderOf(a0, a1, w), hp = this.hipOf(a0, a1, w), by0 = a0.bodyY + (a1.bodyY - a0.bodyY) * w;
      let drop = 0;
      root.updateMatrixWorld(true);
      for (const L of this.legs) {
        if (L.swing) continue;
        const j = L.front ? sh : hp;
        const joint = tmpA.set(j[0], j[1] - by0, j[2] * L.side).applyMatrix4(this.body.matrix);
        const f = root.worldToLocal(tmpB.copy(L.foot));
        const h = Math.hypot(f.x - joint.x, f.z - joint.z);
        if (h < maxL) drop = Math.max(drop, joint.y - f.y - Math.sqrt(maxL * maxL - h * h));
      }
      drop = clamp(drop, 0, P.sh * 0.15);
      if (drop > 0) { this.body.position.y -= drop; this.body.updateMatrix(); }
    }
    this.bodyMesh.scale.set(1 + squash, 1 + breathe - squash, 1 + squash);

    const tl = [lerp(a0.tail[0], a1.tail[0], w), lerp(a0.tail[1], a1.tail[1], w)];
    this.tail.position.set(tl[0], tl[1], 0);
    const wag = Math.sin(t * (12 + 8 * Math.min(1, norm)) + this.seed) * (0.35 + 0.35 * Math.min(1, norm)) * (down ? 0.3 : 1);
    // Curl plane leans ~37° to the side, so the spiral reads from the high game camera too.
    this.tail.rotation.set(-0.6 + wag, 0, 0.12, 'YXZ');
    // Big plume curling up over the rump, like the sprites.
    this.tailMesh.scale.setScalar(P.bw * 0.82);

    // --- Head ---------------------------------------------------------------------------------
    const hb = tmpA.set(lerp(a0.head.x, a1.head.x, w), lerp(a0.head.y, a1.head.y, w) - (a0.bodyY + (a1.bodyY - a0.bodyY) * w), 0);
    this.head.position.copy(hb.applyMatrix4(this.body.matrix));
    let hYaw = clamp(this.yawRate * 0.08, -0.4, 0.4), hPitch = -pitch * 0.6, hRoll = -roll * 0.5;
    if (!moving && !down) { // idle: look around, cute head tilt
      hYaw += Math.sin(t * 0.7 + this.seed) * 0.3;
      hRoll += Math.sin(t * 0.45 + this.seed * 2) * 0.14;
      hPitch += Math.sin(t * 0.9 + this.seed) * 0.05;
    }
    if (down && down.phase === 'sit') { hYaw = Math.sin(t * 4) * 0.3 * this.daze; hRoll = Math.cos(t * 4) * 0.22 * this.daze; hPitch = -0.15; }
    this.head.rotation.set(hRoll, hYaw, hPitch, 'YXZ');

    // Eyes, nose, crown follow the head morph.
    const eyeA = tmpB.copy(a0.eye).lerp(a1.eye, w);
    const eyeR = P.hw * lerp(0.135, 0.12, (st + w) / LAST);
    const browA = tmpD.copy(a0.brow).lerp(a1.brow, w);
    this.blinkT -= dt;
    if (this.blinkT < 0) { this.blink = 0.13; this.blinkT = 2 + Math.random() * 4; }
    this.blink = Math.max(0, this.blink - dt);
    const dizzy = !!down && this.daze > 0.3;
    for (let i = 0; i < 2; i++) {
      const { b, e } = this.eyes[i], side = i ? 1 : -1;
      // Bead half sunk into the face; a blink squashes it into a dark lid line.
      tmpC.set(eyeA.x, eyeA.y, eyeA.z * side).normalize();
      b.position.set(eyeA.x, eyeA.y, eyeA.z * side).addScaledVector(tmpC, eyeR * 0.05);
      b.quaternion.setFromUnitVectors(FWD_Z, tmpC);
      b.scale.set(eyeR * 0.95, eyeR * 1.1 * (this.blink > 0 ? 0.15 : 1), eyeR * 0.75);
      b.visible = !dizzy;
      e.visible = dizzy;
      if (dizzy) {
        e.position.copy(b.position).addScaledVector(tmpC, eyeR * 0.6);
        e.quaternion.setFromUnitVectors(FWD_Z, tmpC);
        e.scale.set(eyeR * 1.2, eyeR * 1.2, 1);
        e.rotateZ(t * 9 * side + this.seed);
      }
      // Fluffy brow tuft over each eye: frames it like the curls in the concept.
      this.brows[i].position.set(browA.x, browA.y, browA.z * side);
      this.brows[i].scale.set(P.hw * 0.11, P.hw * 0.08, P.hw * 0.12);
    }
    this.nose.position.copy(a0.nose).lerp(a1.nose, w);
    this.nose.scale.set(P.hw * 0.1, P.hw * 0.08, P.hw * 0.12);
    // Mouth decal on the chin, facing out of the muzzle; open while running or panting.
    const mo = tmpB.copy(a0.mouth).lerp(a1.mouth, w);
    this.mouth.position.copy(mo);
    this.mouth.quaternion.setFromUnitVectors(FWD_Z, tmpC.set(1, -0.55, 0).normalize());
    this.mouth.scale.set(P.hw * 0.36, P.hw * 0.27, 1);
    // Hysteresis, so the mouth doesn't flicker around the speed threshold.
    this.panting = this.speed > (this.panting ? 0.2 : 0.45) * s;
    this.still = this.panting ? 0 : (this.still ?? 0) + dt;
    // Happy open mouth like the concept art; a calm smile only after a while standing still.
    this.mouth.material.map = (this.panting || !!down || this.still < 4) && !dizzy ? A.mouthOpen : A.mouthClosed;
    this.crown.visible = !!d.finished;
    this.crown.position.set(-P.hw * 0.05, P.hw * 0.52, 0);
    this.crown.scale.setScalar(P.hw * 0.17);

    // Ears: springs pushed by bobbing and turning.
    const eAt = [lerp(a0.ear[0], a1.ear[0], w), lerp(a0.ear[1], a1.ear[1], w), lerp(a0.ear[2], a1.ear[2], w)];
    const bobVel = (bob - (this.prevBob ?? bob)) / Math.max(dt, 1e-4); this.prevBob = bob;
    for (const ear of this.ears) {
      const force = -bobVel * 0.9 + this.yawRate * ear.side * 0.25 * Math.min(1, norm) + (d.dashT > 0 ? -2 : 0);
      ear.v += (force - 70 * ear.a - 9 * ear.v) * dt;
      ear.a = clamp(ear.a + ear.v * dt, -0.9, 0.9);
      ear.pivot.position.set(eAt[0], eAt[1], eAt[2] * ear.side);
      // Floppy ear hanging from the top of the skull side, splayed outwards; springs flap it.
      ear.pivot.rotation.set(-ear.side * (0.32 + Math.max(0, ear.a) * 0.45), 0, -0.15 + ear.a * 0.6 + (dizzy ? 0.3 : 0));
      ear.mesh.position.set(0, 0, ear.side * P.hw * 0.06);
      ear.mesh.scale.set(P.hw * 0.9, P.ed * 1.65, P.hw * 0.75);
    }

    // --- Legs ---------------------------------------------------------------------------------
    root.updateMatrixWorld(true);
    const pawR = P.leg * 0.95;
    const chain = (P.sh - pawR) * 1.12, seg = chain / 2;
    const shoulder = this.shoulderOf(a0, a1, w), hip = this.hipOf(a0, a1, w);
    const bodyY0 = a0.bodyY + (a1.bodyY - a0.bodyY) * w;
    const vel = tmpC.set(d.vx, 0, d.vy);

    if (!this.inited || (this.wasStunned && !down)) {
      for (const L of this.legs) {
        const j = L.front ? shoulder : hip;
        L.foot.set(j[0], pawR, j[2] * L.side).applyMatrix4(root.matrixWorld); L.foot.y = pawR * s;
        L.swing = false;
      }
      this.inited = true;
    }
    this.wasStunned = !!down;
    if (moving !== this.wasMoving) for (const L of this.legs) { L.swing = false; L.quick = null; L.foot.y = P.leg * 0.95 * s; }
    this.wasMoving = moving;

    let swinging = this.legs.filter((L) => L.swing).length;
    for (const L of this.legs) {
      const j = L.front ? shoulder : hip;
      // Joint in root-local space (moves with body pitch/roll/bob).
      const joint = new THREE.Vector3(j[0], j[1] - bodyY0, j[2] * L.side).applyMatrix4(this.body.matrix);
      let footLocal;

      if (down) {
        // Pose-driven: feet follow the body, no planting.
        let tx, ty, tz = j[2] * L.side * 1.15;
        if (down.phase === 'fall') { tx = joint.x; ty = joint.y - seg * 1.2; }
        else if (L.front) { tx = j[0] + 0.05; ty = pawR; }
        else { tx = j[0] + P.bl * 0.38; ty = pawR; tz = j[2] * L.side * 1.4; }
        if (down.phase === 'up') {
          const k = smooth(down.k);
          tx = lerp(tx, j[0], k); tz = lerp(tz, j[2] * L.side, k);
          ty = lerp(ty, pawR, k);
        }
        footLocal = new THREE.Vector3(tx, ty, tz);
      } else {
        const home = new THREE.Vector3(j[0] + (L.front ? 0.03 : -0.03), pawR, j[2] * L.side * 1.02).applyMatrix4(root.matrixWorld);
        home.y = pawR * s;
        if (!moving) {
          // Standing: step any foot that is far from home back under the body, one at a time.
          if (L.swing) {
            L.t += dt / 0.14;
            const k = smooth(L.t);
            L.foot.lerpVectors(L.from, home, k); L.foot.y = pawR * s + Math.sin(Math.PI * Math.min(1, L.t)) * P.sh * 0.25 * s;
            if (L.t >= 1) { L.swing = false; L.foot.copy(home); swinging--; }
          } else if (swinging === 0 && L.foot.distanceTo(home) > 0.12 * s) {
            L.swing = true; L.t = 0; L.from.copy(L.foot); swinging++;
          }
        } else {
          const lp = frac(ph + lerp(L.trot, L.bound, g));
          const target = home.clone().addScaledVector(vel, (duty / Math.max(freq, 0.5)) * 0.5);
          if (L.quick != null) {
            // Early re-step: a sharp turn left this paw behind, hop it to the new spot.
            L.quick += dt / 0.1;
            const k = Math.min(1, L.quick);
            L.foot.lerpVectors(L.from, target, smooth(k));
            L.foot.y = pawR * s + Math.sin(Math.PI * k) * P.sh * 0.2 * s;
            L.swing = true;
            if (L.quick >= 1) { L.quick = null; L.swing = false; L.foot.y = pawR * s; }
          } else if (lp < duty) {
            if (L.swing) { L.swing = false; L.foot.y = pawR * s; }
            if (d.skid > 90) L.foot.lerp(home, 1 - Math.exp(-7 * dt)); // feet skate during a skid
            if (Math.hypot(L.foot.x - home.x, L.foot.z - home.z) > reach || L.over > 0.02) { L.quick = 0; L.from.copy(L.foot); }
          } else {
            if (!L.swing) { L.swing = true; L.from.copy(L.foot); }
            const T = (lp - duty) / (1 - duty);
            L.foot.lerpVectors(L.from, target, smooth(T));
            L.foot.y = pawR * s + Math.sin(Math.PI * T) * P.sh * (0.22 + 0.18 * Math.min(1, norm)) * s;
          }
        }
        footLocal = root.worldToLocal(L.foot.clone());
      }

      // Two-bone IK in root-local units. Elbows point back, knees (stifles) forward.
      const toF = tmpA.subVectors(footLocal, joint);
      let dist = toF.length();
      // Fluffy legs may stretch a little rather than lift a planted paw off the grass.
      const sg = clamp(dist / 2 / 0.999, seg, seg * 1.15), maxD = sg * 2 * 0.999;
      L.over = Math.max(0, dist - maxD); // overreach: next frame re-steps this paw
      if (dist > maxD) { toF.multiplyScalar(maxD / dist); dist = maxD; footLocal.copy(joint).add(toF); }
      const dir = toF.clone().divideScalar(Math.max(dist, 1e-5));
      const pole = tmpB.set(L.front ? -1 : 1, 0, 0);
      pole.addScaledVector(dir, -pole.dot(dir)).normalize();
      const cosA = clamp(dist / (2 * sg), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
      const knee = joint.clone().addScaledVector(dir, sg * cosA).addScaledVector(pole, sg * sinA);

      placeSegment(L.upper, joint, knee, P.leg * 1.4);
      placeSegment(L.lower, knee, footLocal, P.leg * 1.12);
      L.knee.position.copy(knee); L.knee.scale.setScalar(P.leg * 1.15); // covers the joint: no seam
      L.paw.position.copy(footLocal); L.paw.scale.set(pawR * 1.25, pawR, pawR * 1.05);
    }

    // --- Ground decals and effects -------------------------------------------------------------
    this.shadow.scale.set(P.bl * 1.25, P.bw * 1.5, 1);
    this.shadow.position.y = 0.01;
    this.shadow.material.opacity = 1;
    if (this.ring) { this.ring.scale.setScalar(P.bl * 0.62); }
    this.immuneRing.visible = d.immune > 0 && !d.stun;
    this.immuneRing.scale.setScalar(P.bl * 0.72); 

    this.swirl.visible = !!down && this.daze > 0.02;
    if (this.swirl.visible) {
      const appear = this.daze;
      this.swirl.position.set(this.head.position.x, this.head.position.y + P.hw * 0.85, 0);
      this.swirl.scale.setScalar(P.hw * 0.9 * appear);
      this.swirl.material.rotation = t * 7;
    }

    // Dash effects: air wave and dust when it starts, wind streaks while it lasts.
    const fx = DogVisual.fx, dashing = d.dashT > 0, vl = Math.hypot(d.vx, d.vy);
    if (fx && vl > 1) {
      fxDir.set(d.vx / vl, 0, d.vy / vl); fxPos.set(x, 0, y);
      if (dashing && !this.wasDash) fx.dashBurst(fxPos, fxDir, s, (P.sh + P.bw * 0.45) * s);
      if (dashing) {
        this.windAcc = (this.windAcc ?? 0) + dt * 60;
        const n = Math.floor(this.windAcc); this.windAcc -= n;
        fx.dashWind(fxPos, fxDir, s, n);
      }
    }
    this.wasDash = dashing;
  }
}

function placeSegment(mesh, a, b, thick) {
  const d = b.clone().sub(a), len = d.length();
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(UP, d.divideScalar(Math.max(len, 1e-5)));
  mesh.scale.set(thick * 2, len, thick * 2);
}
