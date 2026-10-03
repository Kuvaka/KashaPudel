// Procedural placeholder art, cached in offscreen canvases. When PNG art exists in assets/,
// it replaces the placeholder (see loadArt).
import { CONFIG } from './config.js';

const INK = '#3a2618';
export const SPRITE_R = 64;           // body radius inside a dog sprite, px
export const SPRITE_SIZE = SPRITE_R * 4;

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function seeded(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

// Draws a group of circles as one fluffy blob: outline pass, then fill pass.
function blob(ctx, circles, fill, ink, lw) {
  ctx.fillStyle = ink;
  for (const [x, y, r] of circles) { ctx.beginPath(); ctx.arc(x, y, r + lw, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = fill;
  for (const [x, y, r] of circles) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
}

function fluffRing(cx, cy, rx, ry, n, puff) {
  const out = [[cx, cy, Math.min(rx, ry)]];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push([cx + Math.cos(a) * (rx - puff * 0.6), cy + Math.sin(a) * (ry - puff * 0.6), puff]);
  }
  return out;
}

// Maltipoo in 3/4 top-down view, facing right. Origin = sprite center = body center.
function drawDog(stage) {
  const st = CONFIG.stages[stage];
  const c = canvas(SPRITE_SIZE);
  const ctx = c.getContext('2d');
  const R = SPRITE_R, lw = R * 0.07;
  ctx.translate(SPRITE_SIZE / 2, SPRITE_SIZE / 2);
  // Older dogs: longer body, smaller head ratio.
  const age = stage / (CONFIG.stages.length - 1);
  const headR = R * (0.66 - 0.12 * age);
  const bodyRx = R * (0.9 + 0.15 * age), bodyRy = R * 0.68;

  // Tail
  blob(ctx, fluffRing(-bodyRx * 0.95, -R * 0.35, R * 0.28, R * 0.28, 6, R * 0.12), st.coat, INK, lw);
  // Far legs
  blob(ctx, [[-R * 0.45, R * 0.55, R * 0.17], [R * 0.4, R * 0.55, R * 0.17]], st.shade, INK, lw);
  // Body
  blob(ctx, fluffRing(0, R * 0.05, bodyRx, bodyRy, 14, R * 0.2), st.coat, INK, lw);
  ctx.fillStyle = st.shade;
  ctx.globalAlpha = 0.5;
  ctx.beginPath(); ctx.ellipse(0, R * 0.32, bodyRx * 0.8, bodyRy * 0.38, 0, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
  // Near legs
  blob(ctx, [[-R * 0.3, R * 0.68, R * 0.18], [R * 0.55, R * 0.66, R * 0.18]], st.coat, INK, lw);

  // Head
  const hx = bodyRx * 0.62, hy = -R * 0.38;
  // Far ear
  blob(ctx, fluffRing(hx - headR * 0.55, hy + headR * 0.15, headR * 0.32, headR * 0.5, 7, headR * 0.16), st.ear, INK, lw);
  blob(ctx, fluffRing(hx, hy, headR, headR * 0.92, 12, headR * 0.24), st.coat, INK, lw);
  // Near ear
  blob(ctx, fluffRing(hx - headR * 0.1, hy + headR * 0.35, headR * 0.34, headR * 0.55, 7, headR * 0.17), st.ear, INK, lw);
  // Snout
  const sx = hx + headR * 0.62, sy = hy + headR * 0.22;
  blob(ctx, [[sx, sy, headR * 0.34]], '#fff6ea', INK, lw * 0.8);
  // Nose
  ctx.fillStyle = '#1d1410';
  ctx.beginPath(); ctx.ellipse(sx + headR * 0.26, sy - headR * 0.08, headR * 0.13, headR * 0.1, 0, 0, Math.PI * 2); ctx.fill();
  // Eyes
  for (const [ex, ey, er] of [[hx + headR * 0.18, hy - headR * 0.12, 0.15], [hx + headR * 0.58, hy - headR * 0.2, 0.12]]) {
    ctx.fillStyle = '#1d1410';
    ctx.beginPath(); ctx.arc(ex, ey, headR * er, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(ex + headR * 0.04, ey - headR * 0.05, headR * er * 0.38, 0, Math.PI * 2); ctx.fill();
  }
  // Cheek
  ctx.fillStyle = 'rgba(255,120,120,0.35)';
  ctx.beginPath(); ctx.arc(hx + headR * 0.28, hy + headR * 0.3, headR * 0.14, 0, Math.PI * 2); ctx.fill();

  if (stage === CONFIG.stages.length - 1) drawCrown(ctx, hx - headR * 0.1, hy - headR * 0.95, headR * 0.55);
  return c;
}

function drawCrown(ctx, x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(-s, s * 0.4);
  ctx.lineTo(-s, -s * 0.3); ctx.lineTo(-s * 0.5, s * 0.05); ctx.lineTo(0, -s * 0.55);
  ctx.lineTo(s * 0.5, s * 0.05); ctx.lineTo(s, -s * 0.3); ctx.lineTo(s, s * 0.4);
  ctx.closePath();
  ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = INK; ctx.lineWidth = s * 0.14; ctx.lineJoin = 'round';
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ff4d6d';
  ctx.beginPath(); ctx.arc(0, s * 0.1, s * 0.16, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawCookie(type) {
  const s = 64, c = canvas(s), ctx = c.getContext('2d');
  const rnd = seeded(type.id.length * 977);
  ctx.translate(s / 2, s / 2);
  const R = s * 0.4;
  if (type.id === 'bone') {
    ctx.rotate(-0.5);
    ctx.fillStyle = '#ffcf3a'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
    ctx.beginPath();
    for (const [x, y] of [[-R * 0.8, -R * 0.28], [-R * 0.8, R * 0.28], [R * 0.8, -R * 0.28], [R * 0.8, R * 0.28]]) {
      ctx.moveTo(x + R * 0.26, y); ctx.arc(x, y, R * 0.26, 0, Math.PI * 2);
    }
    ctx.rect(-R * 0.8, -R * 0.2, R * 1.6, R * 0.4);
    ctx.stroke(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(-R * 0.5, -R * 0.12, R * 0.9, R * 0.08);
    return c;
  }
  const choco = type.id === 'choco';
  ctx.fillStyle = choco ? '#6b3b1f' : '#e6a85a'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * Math.PI * 2, rr = R * (0.94 + rnd() * 0.08);
    i ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = choco ? '#f6e7d0' : '#5a3016';
  for (let i = 0; i < 6; i++) {
    const a = rnd() * Math.PI * 2, d = rnd() * R * 0.6;
    ctx.beginPath(); ctx.arc(Math.cos(a) * d, Math.sin(a) * d, R * 0.13, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath(); ctx.ellipse(-R * 0.3, -R * 0.35, R * 0.35, R * 0.15, -0.6, 0, Math.PI * 2); ctx.fill();
  return c;
}

function drawGrass() {
  const s = 256, c = canvas(s), ctx = c.getContext('2d');
  const rnd = seeded(12345);
  ctx.fillStyle = '#86c95a'; ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,60,0,0.05)';
    ctx.beginPath(); ctx.arc(rnd() * s, rnd() * s, 10 + rnd() * 30, 0, Math.PI * 2); ctx.fill();
  }
  ctx.lineWidth = 2; ctx.lineCap = 'round';
  for (let i = 0; i < 140; i++) {
    const x = rnd() * s, y = rnd() * s, h = 5 + rnd() * 7;
    ctx.strokeStyle = rnd() < 0.6 ? '#6fb347' : '#a3dc72';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (rnd() - 0.5) * 5, y - h); ctx.stroke();
  }
  const petals = ['#ffffff', '#ffe26a', '#ffb3c7'];
  for (let i = 0; i < 6; i++) {
    const x = 12 + rnd() * (s - 24), y = 12 + rnd() * (s - 24);
    ctx.fillStyle = petals[i % 3];
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      ctx.beginPath(); ctx.arc(x + Math.cos(a) * 3.5, y + Math.sin(a) * 3.5, 2.8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#ffb02e';
    ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill();
  }
  return c;
}

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export async function loadArt() {
  const art = {
    dogs: CONFIG.stages.map((_, i) => ({ img: drawDog(i), png: false })),
    food: Object.fromEntries(CONFIG.food.types.map((t) => [t.id, drawCookie(t)])),
    grass: drawGrass(),
  };
  // Optional PNG art (generated separately) overrides the placeholders.
  const pngs = await Promise.all([
    ...CONFIG.stages.map((_, i) => loadImage(`assets/dog_stage${i + 1}.png`)),
    ...CONFIG.food.types.map((t) => loadImage(`assets/food_${t.id}.png`)),
    loadImage('assets/grass_tile.jpg'),
  ]);
  CONFIG.stages.forEach((_, i) => { if (pngs[i]) art.dogs[i] = { img: pngs[i], png: true }; });
  CONFIG.food.types.forEach((t, i) => { const p = pngs[CONFIG.stages.length + i]; if (p) art.food[t.id] = p; });
  if (pngs[pngs.length - 1]) art.grass = pngs[pngs.length - 1];
  return art;
}
