import { CONFIG } from './config.js';
import { SPRITE_R } from './art.js';

const { world: W, camera: CAM, dog: D } = CONFIG;
const POP_SEC = 0.35; // new food grows from nothing with a little overshoot
const easeOutBack = (x) => 1 + 2.7 * (x - 1) ** 3 + 1.7 * (x - 1) ** 2;
let visualSeed = 0x91e10da5;
function visualRandom() {
  visualSeed ^= visualSeed << 13; visualSeed ^= visualSeed >>> 17; visualSeed ^= visualSeed << 5;
  return (visualSeed >>> 0) / 4294967296;
}

export class Renderer {
  constructor(canvas, art) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.art = art;
    this.cam = { x: W.w / 2, y: W.h / 2, scale: 1 };
    this.particles = [];
    this.texts = [];
    this.resize();
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, CONFIG.maxDpr);
    this.vw = window.innerWidth; this.vh = window.innerHeight;
    this.canvas.width = Math.round(this.vw * this.dpr);
    this.canvas.height = Math.round(this.vh * this.dpr);
    this.grassPattern = this.ctx.createPattern(this.art.grass, 'repeat');
  }

  targetScale(r) {
    const view = CAM.viewAtBase * Math.pow(r / D.baseRadius, CAM.zoomExp);
    return Math.min(this.vw, this.vh) / view * (this.vw > this.vh ? CAM.landscapeZoom : 1);
  }

  snapCamera(p) {
    this.cam.x = p.x; this.cam.y = p.y; this.cam.scale = this.targetScale(p.r);
  }

  burst(x, y, color, n = 6, speed = 120) {
    for (let i = 0; i < n; i++) {
      const a = visualRandom() * Math.PI * 2, s = speed * (0.4 + visualRandom());
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5, max: 0.5, color, size: 3 + visualRandom() * 3 });
    }
  }

  floatText(x, y, text, color = '#fff', size = 20) {
    this.texts.push({ x, y, text, color, size, life: 1, max: 1 });
  }

  draw(game, alpha, dt, stick, hud = true) {
    const { ctx, cam } = this;
    const p = game.player;
    const pr = lerp(p.px, p.x, alpha), pyr = lerp(p.py, p.y, alpha);
    const k = 1 - Math.exp(-CAM.follow * dt);
    cam.x += (pr - cam.x) * k; cam.y += (pyr - cam.y) * k;
    cam.scale += (this.targetScale(p.drawR) - cam.scale) * (1 - Math.exp(-2 * dt));
    if (!(cam.scale > 0)) cam.scale = this.targetScale(p.drawR); // snapped before the canvas had a size

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#4f8a35';
    ctx.fillRect(0, 0, this.vw, this.vh);

    ctx.save();
    ctx.translate(this.vw / 2, this.vh / 2);
    ctx.scale(cam.scale, cam.scale);
    ctx.translate(-cam.x, -cam.y);

    // Field
    ctx.fillStyle = this.grassPattern;
    ctx.fillRect(0, 0, W.w, W.h);
    ctx.lineWidth = 18; ctx.strokeStyle = '#5c9a3c'; ctx.lineJoin = 'round';
    ctx.strokeRect(-9, -9, W.w + 18, W.h + 18);
    ctx.lineWidth = 6; ctx.strokeStyle = '#3d6e27';
    ctx.strokeRect(-20, -20, W.w + 40, W.h + 40);

    const left = cam.x - this.vw / 2 / cam.scale - 60, right = cam.x + this.vw / 2 / cam.scale + 60;
    const top = cam.y - this.vh / 2 / cam.scale - 60, bottom = cam.y + this.vh / 2 / cam.scale + 60;
    const visible = (x, y) => x > left && x < right && y > top && y < bottom;

    // Food
    const t = game.time;
    for (const f of game.food) {
      f.pop += dt;
      if (f.pop <= 0 || !visible(f.x, f.y)) continue;
      const img = this.art.food[f.type.id];
      const grow = f.pop < POP_SEC ? easeOutBack(f.pop / POP_SEC) : 1;
      const s = f.type.r * 2.6 * grow * (1 + 0.06 * Math.sin(t * 3 + f.rot * 5));
      const h = s * img.height / img.width;
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(f.type.id === 'bone' ? -0.3 + Math.sin(t * 2 + f.rot) * 0.2 : f.rot * 0.15 - 0.45);
      ctx.drawImage(img, -s / 2, -h / 2, s, h);
      ctx.restore();
    }

    // Dogs, back to front
    const dogs = game.dogs.filter((d) => visible(d.x, d.y)).sort((a, b) => a.y - b.y);
    for (const d of dogs) this.drawDog(d, alpha, t, dt);
    for (const d of dogs) this.drawName(d, alpha);

    // Particles and floating text (world space)
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const q = this.particles[i];
      q.life -= dt;
      if (q.life <= 0) { this.particles.splice(i, 1); continue; }
      q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= Math.pow(0.92, dt * 60); q.vy *= Math.pow(0.92, dt * 60);
      ctx.globalAlpha = q.life / q.max;
      ctx.fillStyle = q.color;
      ctx.beginPath(); ctx.arc(q.x, q.y, q.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const q = this.texts[i];
      q.life -= dt;
      if (q.life <= 0) { this.texts.splice(i, 1); continue; }
      q.y -= 40 * dt;
      ctx.globalAlpha = Math.min(1, q.life / q.max * 2);
      ctx.font = `900 ${q.size}px system-ui, sans-serif`;
      ctx.lineWidth = q.size * 0.22; ctx.strokeStyle = '#3a2618';
      ctx.strokeText(q.text, q.x, q.y); ctx.fillStyle = q.color; ctx.fillText(q.text, q.x, q.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    if (hud) this.drawMinimap(game);
    if (stick) this.drawStick(stick);
  }

  drawDog(d, alpha, t, dt) {
    const { ctx } = this;
    const x = lerp(d.px, d.x, alpha), y = lerp(d.py, d.y, alpha);
    const speed = Math.hypot(d.vx, d.vy);
    const run = Math.min(1, speed / 150);
    const bob = Math.abs(Math.sin(t * 14 + d.wander)) * run;
    const r = d.drawR;
    const popS = d.pop > 0 ? 1 + Math.sin((0.6 - d.pop) / 0.6 * Math.PI) * 0.25 : 1;
    const breathe = 1 + Math.sin(t * 3 + d.wander) * 0.02 * (1 - run);

    // Shadow
    ctx.fillStyle = 'rgba(30,60,20,0.28)';
    ctx.beginPath(); ctx.ellipse(x, y + r * 0.75, r * 1.05, r * 0.38, 0, 0, Math.PI * 2); ctx.fill();
    if (d.isPlayer) {
      ctx.strokeStyle = 'rgba(255,228,92,0.9)'; ctx.lineWidth = Math.max(2.5, r * 0.08);
      ctx.beginPath(); ctx.ellipse(x, y + r * 0.75, r * 1.2, r * 0.46, 0, 0, Math.PI * 2); ctx.stroke();
    }

    if (d.immune > 0 && !d.stun) {
      ctx.strokeStyle = 'rgba(180,245,255,0.8)'; ctx.lineWidth = Math.max(2, r * 0.08);
      ctx.beginPath(); ctx.ellipse(x, y + r * 0.75, r * 1.3, r * 0.55, 0, 0, Math.PI * 2); ctx.stroke();
    }
    const sprite = this.art.dogs[d.stage];
    const dizzy = d.stun > 0 ? Math.sin(t * 30) * 0.3 * Math.min(1, d.stun * 3) : 0;
    ctx.save();
    ctx.translate(x, y - bob * r * 0.18);
    ctx.rotate(d.face * Math.max(-0.25, Math.min(0.25, d.vy / 900)) + dizzy);
    ctx.scale(d.face * popS * breathe, popS / breathe);
    if (sprite.png) {
      const w = r * 2.9, h = w * sprite.img.height / sprite.img.width;
      ctx.drawImage(sprite.img, -w / 2, -h / 2 - r * 0.05, w, h);
    } else {
      const s = sprite.img.width * (r / SPRITE_R);
      ctx.drawImage(sprite.img, -s / 2, -s / 2, s, s);
    }
    ctx.restore();

    if (d.stun > 0) {
      // Little stars circling over the head.
      ctx.fillStyle = '#ffe45c'; ctx.strokeStyle = '#3a2618'; ctx.lineWidth = 1.5;
      ctx.font = `900 ${Math.max(12, r * 0.45)}px system-ui, sans-serif`; ctx.textAlign = 'center';
      for (let k = 0; k < 3; k++) {
        const a = t * 8 + k * 2.1;
        const sx = x + Math.cos(a) * r * 0.7, sy = y - r * 1.05 + Math.sin(a) * r * 0.22;
        ctx.strokeText('★', sx, sy); ctx.fillText('★', sx, sy);
      }
    }

    if (d.dashT > 0 && speed > 200 && visualRandom() < Math.min(1, 30 * dt)) {
      this.particles.push({ x: x - d.face * r, y: y + r * 0.6, vx: -d.vx * 0.2, vy: -20, life: 0.4, max: 0.4, color: 'rgba(255,255,255,0.8)', size: r * 0.18 });
    }
  }

  drawName(d, alpha) {
    const { ctx } = this;
    const x = lerp(d.px, d.x, alpha), y = lerp(d.py, d.y, alpha);
    const size = Math.max(13, d.drawR * 0.42) ;
    ctx.font = `800 ${size}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = size * 0.25; ctx.strokeStyle = 'rgba(40,25,15,0.85)'; ctx.lineJoin = 'round';
    const ty = y - d.drawR * 1.55;
    ctx.strokeText(d.name, x, ty);
    ctx.fillStyle = d.isPlayer ? '#ffe45c' : '#ffffff';
    ctx.fillText(d.name, x, ty);
  }

  drawMinimap(game) {
    const { ctx } = this;
    const size = Math.min(110, Math.min(this.vw, this.vh) * 0.26);
    const pad = 12;
    const x0 = pad + safe('left'), y0 = this.vh - size - pad - safe('bottom');
    ctx.fillStyle = 'rgba(30,70,25,0.55)';
    roundRect(ctx, x0, y0, size, size, 12); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2; ctx.stroke();
    const sx = size / W.w, sy = size / W.h;
    for (const d of game.dogs) {
      ctx.fillStyle = d.isPlayer ? '#ffe45c' : (d.finished ? '#ffb020' : '#ffffff');
      const rr = d.isPlayer ? 4 : 2.5;
      ctx.beginPath(); ctx.arc(x0 + d.x * sx, y0 + d.y * sy, rr, 0, Math.PI * 2); ctx.fill();
    }
  }

  drawStick(s) {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(s.ox, s.oy, s.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath(); ctx.arc(s.kx, s.ky, s.r * 0.42, 0, Math.PI * 2); ctx.fill();
  }
}

function lerp(a, b, t) { return a + (b - a) * t; }

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// Safe-area insets (iPhone notch / home indicator), read from CSS custom properties.
const safeCache = {};
export function refreshSafeArea() {
  const cs = getComputedStyle(document.documentElement);
  for (const side of ['top', 'right', 'bottom', 'left']) safeCache[side] = parseFloat(cs.getPropertyValue(`--sa-${side}`)) || 0;
}
function safe(side) { return safeCache[side] || 0; }
