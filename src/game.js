import { CONFIG } from './config.js';

// Race: every dog starts as a puppy at the same moment; the first to grow into the last
// stage wins. Nobody gets eaten and growth is never lost: dogs compete for cookies and can
// shove each other away from them.
const { world: W, dog: D, stages: STAGES, food: F, bots: B, dash: DASH, race: RACE, shove: SH, puddles: PD, poop: PO, difficulty: DIFF, obstacles: OB } = CONFIG;
const LAST = STAGES.length - 1;
export const FINISH_XP = STAGES[LAST].xp;

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Spring puddles have a fixed layout (same every race, so the meadow's grass can leave them
// clear and the player learns where they are): spread over the field, off the start ring.
let PUDDLES = null;
export function springPuddles() {
  if (PUDDLES) return PUDDLES;
  let s = 9127;
  const rnd = () => { s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9 >>> 0; s ^= s >>> 13; return (s >>> 0) / 4294967296; };
  const r2 = (a, b) => a + rnd() * (b - a);
  const out = [], mid = Math.min(W.w, W.h) * RACE.startRing;
  for (let tries = 0; out.length < PD.count && tries < 2000; tries++) {
    const r = r2(PD.rMin, PD.rMax), x = r2(r + 60, W.w - r - 60), y = r2(r + 60, W.h - r - 60);
    if (Math.hypot(x - W.w / 2, y - W.h / 2) < mid + r + 120) continue;
    if (out.some((p) => Math.hypot(p.x - x, p.y - y) < p.r + r + 160)) continue;
    out.push({ x, y, r, rot: r2(0, Math.PI * 2), seed: rnd() });
  }
  return (PUDDLES = out);
}

// Obstacles of a season (drifts, leaf piles, mud): a fixed seeded layout too, clear of the
// start ring, the puddles and each other.
const OBST = {};
export function seasonObstacles(season) {
  if (OBST[season]) return OBST[season];
  const c = OB[season];
  if (!c) return (OBST[season] = []);
  let s = 7331 + season.length * 101;
  const rnd = () => { s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9 >>> 0; s ^= s >>> 13; return (s >>> 0) / 4294967296; };
  const r2 = (a, b) => a + rnd() * (b - a);
  const out = [], mid = Math.min(W.w, W.h) * RACE.startRing, wet = season === 'spring' ? springPuddles() : [];
  for (let tries = 0; out.length < c.count && tries < 3000; tries++) {
    const r = r2(c.rMin, c.rMax), x = r2(r + 80, W.w - r - 80), y = r2(r + 80, W.h - r - 80);
    if (Math.hypot(x - W.w / 2, y - W.h / 2) < mid + r + 120) continue;
    if ([...out, ...wet].some((p) => Math.hypot(p.x - x, p.y - y) < p.r + r + 170)) continue;
    out.push({ kind: c.kind, x, y, r, rot: r2(0, Math.PI * 2), seed: rnd() });
  }
  return (OBST[season] = out);
}

export function stageOf(xp) {
  let s = 0;
  while (s < LAST && xp >= STAGES[s + 1].xp) s++;
  return s;
}

// 0..1 progress inside the current stage (1 at the last stage).
export function stageProgress(xp) {
  const s = stageOf(xp);
  if (s === LAST) return 1;
  return (xp - STAGES[s].xp) / (STAGES[s + 1].xp - STAGES[s].xp);
}

// Visual phases of a knock-down, spread over the actual stun time: a short stun (small dog
// shoving a big one) still gets a complete, shortened tumble and get-up.
export function stunPhase(d) {
  if (d.yuck || d.stuck) { // ran over a pile / into mud: no tumble, just sit and shake it off
    const el = d.stunMax - d.stun, U = Math.min(0.4, d.stunMax * 0.15);
    if (d.stun < U) return { phase: 'up', k: 1 - d.stun / U };
    return { phase: 'sit', k: Math.min(1, el / 0.25), yuck: !!d.yuck };
  }
  const T = d.stunMax, scale = Math.min(1, 0.85 * T / (SH.fallSec + SH.getUpSec));
  const F = SH.fallSec * scale, U = SH.getUpSec * scale, S = Math.max(1e-6, T - F - U);
  const el = T - d.stun;
  if (el < F) return { phase: 'fall', k: el / F };
  if (d.stun < U) return { phase: 'up', k: 1 - d.stun / U };
  return { phase: 'sit', k: Math.min(1, (el - F) / S) };
}

function radiusFor(xp) {
  const s = stageOf(xp);
  if (s === LAST) return STAGES[s].r;
  return STAGES[s].r + (STAGES[s + 1].r - STAGES[s].r) * D.inStageGrowth * stageProgress(xp);
}

function pickFoodType() {
  const total = F.types.reduce((a, t) => a + t.weight, 0);
  let roll = Math.random() * total;
  for (const t of F.types) if ((roll -= t.weight) < 0) return t;
  return F.types[0];
}

function makeFood(x, y, type = pickFoodType()) {
  return { x, y, type, rot: rand(0, Math.PI * 2), pop: 0 }; // pop: seconds since it appeared (render-only)
}

function makeDog(name, isPlayer, x, y, skill = 1) {
  const r = radiusFor(0);
  return {
    name, isPlayer, xp: 0, stage: 0, r, drawR: r,
    x, y, px: x, py: y, vx: 0, vy: 0,
    dirX: 0, dirY: 0, mag: 0, wantDash: false, dashT: 0, dashCd: 0,
    face: x < W.w / 2 ? 1 : -1, pop: 0, stun: 0, stunMax: 0, immune: 0, shoveCd: 0, skid: 0,
    wantPoop: false, poopCd: isPlayer ? 12 : rand(12, 30), yuck: false, yuckImmune: 0, glide: 0, puddle: null,
    finished: 0, place: 0, eaten: 0,
    // bot brain
    skill, think: rand(0, B.thinkSec), wander: rand(0, Math.PI * 2), target: null,
    rival: null, rivalT: 0,
  };
}

export class Game {
  constructor(events) {
    this.events = events; // { onEat, onLevelUp, onFinish, onShove, onDash, onCountdown }
    this.time = 0;
    this.lv = CONFIG.difficulty.easy;
    this.season = 'summer'; this.obstacles = []; this.puddles = []; this.poops = [];
  }

  // season: 'summer' | 'autumn' | 'winter' | 'spring' (only spring changes the rules: puddles).
  start(playerName, season = 'summer', level = 'easy') {
    this.time = 0;
    this.season = season;
    this.level = DIFF[level] ? level : 'easy';
    const lv = this.lv = DIFF[this.level];
    this.poops = [];
    this.lastBotPoop = -Infinity; // reset the shared bot drop timer for this race
    this.countdown = RACE.countdownSec;
    this.places = 0;
    this.food = [];
    this.foodDebt = 0;

    // Start positions on a ring around the center, player at the bottom.
    const n = B.count + 1, ring = Math.min(W.w, W.h) * RACE.startRing;
    const spot = (i) => {
      const a = Math.PI / 2 + (i / n) * Math.PI * 2;
      return [W.w / 2 + Math.cos(a) * ring, W.h / 2 + Math.sin(a) * ring];
    };
    this.player = makeDog(playerName || 'Ты', true, ...spot(0));
    this.dogs = [this.player];
    const names = [...B.names].sort(() => Math.random() - 0.5);
    for (let i = 0; i < B.count; i++) {
      const base = B.skills?.[i] ?? (B.skillMin + (B.skillMax - B.skillMin) * (i / Math.max(1, B.count - 1)));
      const skill = Math.min(1, Math.max(lv.skillMin, base + lv.skillAdd));
      this.dogs.push(makeDog(names[i % names.length], false, ...spot(i + 1), skill));
    }
    this.puddles = season === 'spring' ? springPuddles() : [];
    this.obstacles = seasonObstacles(season).map((o) => ({ ...o, gone: 0 })); // gone: seconds until it is back
    for (let i = 0; i < F.count; i++) {
      const f = makeFood(...this.foodSpot());
      f.pop = -rand(0, 0.8); // the field fills in with a ripple of little pops
      this.food.push(f);
    }
  }

  puddleAt(x, y) {
    for (const p of this.puddles) { const dx = x - p.x, dy = y - p.y; if (dx * dx + dy * dy < p.r * p.r * 0.8) return p; }
    return null;
  }

  // Random point not too close to any dog (a few tries, then anywhere).
  foodSpot() {
    let x, y;
    for (let k = 0; k < 6; k++) {
      x = rand(30, W.w - 30); y = rand(30, W.h - 30);
      if (this.obstacles.some((o) => (o.x - x) ** 2 + (o.y - y) ** 2 < (o.r + 24) ** 2)) continue; // no cookies inside a drift
      if (this.dogs.every((d) => (d.x - x) ** 2 + (d.y - y) ** 2 > F.clearRadius ** 2)) break;
    }
    return [x, y];
  }

  setPlayerInput(dirX, dirY, mag, dash, poop = false) {
    const p = this.player;
    p.dirX = dirX; p.dirY = dirY; p.mag = mag; p.wantDash = dash;
    if (poop) p.wantPoop = true; // a tap: kept until the next step uses it
  }

  get racing() { return this.countdown <= 0; }

  step(dt) {
    if (this.countdown > 0) {
      const before = Math.ceil(this.countdown);
      this.countdown -= dt;
      if (Math.ceil(this.countdown) !== before) this.events.onCountdown?.(Math.max(0, Math.ceil(this.countdown)));
      for (const d of this.dogs) { d.px = d.x; d.py = d.y; }
      return;
    }
    this.time += dt;
    for (const d of this.dogs) { d.px = d.x; d.py = d.y; }
    for (const d of this.dogs) if (!d.isPlayer) this.think(d, dt);
    for (const d of this.dogs) this.move(d, dt);
    for (const d of this.dogs) this.tryPoop(d, dt);
    this.agePoops(dt);
    this.eatFood();
    this.eatPoops();
    this.bumpObstacles(dt);
    this.collideDogs();
    this.refillFood(dt);
  }

  move(d, dt) {
    d.dashCd = Math.max(0, d.dashCd - dt);
    d.dashT = Math.max(0, d.dashT - dt);
    const dashStart = d.wantDash && d.dashCd === 0 && d.mag > 0.1 && !d.stun && !d.finished;
    if (dashStart) { d.dashT = DASH.durationSec; d.dashCd = DASH.cooldownSec; this.events.onDash?.(d); }
    // Puddles: entering one with a dash shoots the dog ahead; on the water the paws slip.
    const pud = this.puddles.length ? this.puddleAt(d.x, d.y) : null;
    if (pud && pud !== d.puddle) {
      if (d.dashT > 0 && !d.stun) d.glide = PD.boostSec;
      this.events.onSplash?.(d, pud, d.glide > 0);
    }
    d.puddle = pud;
    d.glide = Math.max(0, d.glide - dt);
    const grip = pud ? PD.grip : D.grip, accel = pud ? D.accel * PD.accelMul : D.accel, brake = pud ? D.brake * PD.accelMul : D.brake;
    let speed = D.baseSpeed * Math.pow(d.r / D.baseRadius, D.speedExp) * (d.dashT > 0 ? DASH.speedMul : 1) * (d.glide > 0 ? PD.boostMul : 1);
    if (!d.isPlayer) speed *= this.lv.speedMul;
    if (d.finished) speed *= 0.45; // winners stroll around
    if (dashStart) { d.vx += d.dirX * speed * D.dashKick; d.vy += d.dirY * speed * D.dashKick; }

    d.shoveCd = Math.max(0, d.shoveCd - dt);
    d.immune = Math.max(0, d.immune - dt);
    d.yuckImmune = Math.max(0, d.yuckImmune - dt);
    d.bumpImmune = Math.max(0, (d.bumpImmune ?? 0) - dt);
    if (!d.stun) d.yuck = d.stuck = false;
    d.skid = 0;
    if (d.stun > 0) {
      // Knocked down: slide out without control, then sit dazed.
      d.stun = Math.max(0, d.stun - dt);
      const fr = Math.exp(-SH.friction * dt);
      d.vx *= fr; d.vy *= fr;
    } else if (d.mag < 0.05) {
      // No input: brake to a stop along the current motion.
      const v = Math.hypot(d.vx, d.vy);
      if (v > 0) {
        const k = Math.max(0, v - brake * dt) / v;
        d.vx *= k; d.vy *= k;
        d.skid = v > 120 ? v * 0.5 : 0;
      }
    } else {
      // Split velocity into the wanted direction and sideways: the first speeds up or brakes,
      // the sideways part decays by grip, which is what makes the dog drift in turns.
      const ux = d.dirX, uy = d.dirY, want = speed * d.mag;
      let par = d.vx * ux + d.vy * uy;
      let sx = d.vx - par * ux, sy = d.vy - par * uy;
      if (par < want) par = Math.min(want, par + (par < 0 ? brake : accel) * dt);
      else par = Math.max(want, par - brake * dt);
      const g = Math.exp(-grip * dt);
      sx *= g; sy *= g;
      d.vx = par * ux + sx; d.vy = par * uy + sy;
      d.skid = Math.hypot(sx, sy) + Math.max(0, -par);
    }
    d.x = clamp(d.x + d.vx * dt, d.r, W.w - d.r);
    d.y = clamp(d.y + d.vy * dt, d.r, W.h - d.r);
    if (Math.abs(d.vx) > 8 && !d.stun) d.face = d.vx > 0 ? 1 : -1;

    d.pop = Math.max(0, d.pop - dt);
    d.r = radiusFor(d.xp);
    d.drawR += (d.r - d.drawR) * (1 - Math.exp(-10 * dt));
  }

  gainXp(d, amount) {
    const before = d.stage;
    d.xp += amount;
    d.stage = stageOf(d.xp);
    if (d.stage > before) {
      d.pop = 0.6;
      this.events.onLevelUp?.(d);
    }
    if (d.stage === LAST && !d.finished) {
      d.finished = this.time;
      d.place = ++this.places;
      this.events.onFinish?.(d);
    }
  }

  eatFood() {
    for (const d of this.dogs) {
      if (d.finished || d.stun > 0) continue; // winners leave the cookies; spinning dogs can't eat
      const reach = d.r * D.eatReach;
      for (let i = this.food.length - 1; i >= 0; i--) {
        const f = this.food[i];
        const dx = f.x - d.x, dy = f.y - d.y;
        if (dx * dx + dy * dy < (reach + f.type.r) ** 2) {
          this.food[i] = this.food[this.food.length - 1];
          this.food.pop();
          d.eaten++;
          this.gainXp(d, f.type.xp);
          this.events.onEat?.(d, f);
          if (d.finished) break;
        }
      }
    }
  }

  // Dogs jostle: overlap is resolved by weight, the bigger dog moves less. A dash into a rival
  // (or a much bigger dog running into a small one) shoves it away.
  collideDogs() {
    const dogs = this.dogs.filter(d => !d.finished && d.immune <= 0);
    for (let i = 0; i < dogs.length; i++) {
      for (let j = i + 1; j < dogs.length; j++) {
        const a = dogs[i], b = dogs[j];
        if (a.immune > 0 || b.immune > 0) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        const overlap = (a.r + b.r) * 0.85 - dist;
        if (overlap <= 0) continue;
        const ma = a.r * a.r, mb = b.r * b.r;
        const nx = dist > 1e-6 ? dx / dist : 1, ny = dist > 1e-6 ? dy / dist : 0;
        a.x -= nx * overlap * mb / (ma + mb); a.y -= ny * overlap * mb / (ma + mb);
        b.x += nx * overlap * ma / (ma + mb); b.y += ny * overlap * ma / (ma + mb);
        // Approach speeds along the contact normal.
        const aIn = a.vx * nx + a.vy * ny, bIn = -(b.vx * nx + b.vy * ny);
        if (aIn + bIn <= 20) continue; // No shove while co-moving or separating.
        if (aIn >= bIn) this.tryShove(a, b, aIn, nx, ny);
        else this.tryShove(b, a, bIn, -nx, -ny);
      }
    }
    for (const d of dogs) {
      d.x = clamp(d.x, d.r, W.w - d.r);
      d.y = clamp(d.y, d.r, W.h - d.r);
    }
  }

  tryShove(att, vic, approach, nx, ny) {
    if (this.time < RACE.shoveGraceSec || att.shoveCd > 0 || att.immune > 0 || vic.stun > 0 || vic.immune > 0 || att.stun > 0 || att.finished || vic.finished) return;
    const dash = att.dashT > 0 && approach > SH.dashMinSpeed;
    const big = SH.bodyShove !== false && att.r > vic.r * SH.bigRatio && approach > SH.bigMinSpeed;
    if (!dash && !big) return;
    const ma = att.r * att.r, mv = vic.r * vic.r;
    const f = (2 * ma / (ma + mv)) * (dash ? 1 : 0.6); // 1 for equal dogs, up to ~2 for big ones
    vic.vx = nx * SH.power * f; vic.vy = ny * SH.power * f;
    vic.stun = vic.stunMax = Math.min(SH.maxStunSec ?? Infinity, SH.stunSec * Math.min(1.3, f));
    vic.immune = vic.stun + SH.immuneSec;
    vic.dashT = 0;
    vic.target = null;
    att.vx *= SH.recoil; att.vy *= SH.recoil;
    att.shoveCd = SH.cooldown;
    att.rivalT = 0;
    this.events.onShove?.(att, vic);
  }

  // --- Piles --------------------------------------------------------------------------------
  tryPoop(d, dt) {
    d.poopCd = Math.max(0, d.poopCd - dt);
    const want = d.wantPoop; d.wantPoop = false;
    if (!want || d.poopCd > 0 || d.stun > 0 || d.finished || !this.racing) return;
    if (this.poops.length >= PO.max) return; // the field is full: wait, the cooldown isn't spent
    // Just behind the dog (opposite to where it runs, or to where it faces when standing).
    const v = Math.hypot(d.vx, d.vy), bx = v > 20 ? -d.vx / v : -d.face, by = v > 20 ? -d.vy / v : 0;
    const p = { x: clamp(d.x + bx * d.r * 1.1, PO.r, W.w - PO.r), y: clamp(d.y + by * d.r * 1.1, PO.r, W.h - PO.r),
      owner: d, age: 0, rot: rand(0, Math.PI * 2) };
    if (!d.isPlayer) { // bots keep traps sparse: not by a cookie, not by another pile, not in a row
      if (this.time - (this.lastBotPoop ?? -1e9) < PO.botGapSec) return;
      if (this.food.some((f) => (f.x - p.x) ** 2 + (f.y - p.y) ** 2 < PO.botFoodGap ** 2)) return;
      if (this.poops.some((q) => (q.x - p.x) ** 2 + (q.y - p.y) ** 2 < PO.botPileGap ** 2)) return;
      this.lastBotPoop = this.time;
    }
    d.poopCd = d.isPlayer ? PO.cooldownSec : PO.botCooldownSec;
    this.poops.push(p);
    this.events.onPoop?.(d, p);
  }

  agePoops(dt) {
    for (const p of this.poops) p.age += dt;
    while (this.poops.length && this.poops[0].age > PO.lifeSec) this.poops.shift();
  }

  // Running over somebody else's pile: "yuck!" - sit for a while, no tumble, nothing lost.
  eatPoops() {
    if (!this.poops.length) return;
    for (const d of this.dogs) {
      if (d.finished || d.stun > 0 || d.immune > 0 || d.yuckImmune > 0) continue;
      // Only what is right under the nose counts (not the whole cookie reach).
      const v = Math.hypot(d.vx, d.vy), fx = v > 20 ? d.vx / v : d.face, fy = v > 20 ? d.vy / v : 0;
      const mx = d.x + fx * d.r * PO.mouthAhead, my = d.y + fy * d.r * PO.mouthAhead, reach = d.r * PO.mouthR + PO.r;
      for (let i = 0; i < this.poops.length; i++) {
        const p = this.poops[i];
        if (p.owner === d || p.age < PO.armSec) continue;
        const dx = p.x - mx, dy = p.y - my;
        if (dx * dx + dy * dy > reach * reach) continue;
        this.poops.splice(i, 1);
        d.stun = d.stunMax = PO.stunSec;
        d.yuck = true;
        d.yuckImmune = PO.stunSec + PO.immuneSec;
        d.immune = Math.max(d.immune, PO.stunSec + SH.immuneSec); // nobody shoves a dog that sits there
        d.vx *= 0.2; d.vy *= 0.2; d.dashT = 0; d.glide = 0; d.target = null;
        this.events.onYuck?.(d, p);
        break;
      }
    }
  }

  // --- Season obstacles ---------------------------------------------------------------------
  bumpObstacles(dt) {
    if (!this.obstacles.length) return;
    for (const o of this.obstacles) if (o.gone > 0) o.gone = Math.max(0, o.gone - dt);
    for (const d of this.dogs) {
      if (d.finished || d.stun > 0 || d.immune > 0 || d.bumpImmune > 0) continue;
      const v = Math.hypot(d.vx, d.vy);
      for (const o of this.obstacles) {
        if (o.gone > 0) continue;
        const mud = o.kind === 'mud', reach = o.r * OB[this.season].hit + d.r * (mud ? 0.2 : 0.5);
        const dx = o.x - d.x, dy = o.y - d.y;
        if (dx * dx + dy * dy > reach * reach) continue;
        if (!mud && v < OB.minSpeed) continue; // trotting gently up to a drift is fine
        d.stun = d.stunMax = OB.stunSec;
        d.stuck = mud; // mud: paws stuck, sit; drift / leaves: a proper tumble
        d.bumpImmune = OB.stunSec + OB.immuneSec;
        d.immune = Math.max(d.immune, OB.stunSec + SH.immuneSec);
        const k = mud ? 0.1 : 0.25;
        d.vx *= k; d.vy *= k; d.dashT = 0; d.glide = 0; d.target = null; d.rivalT = 0;
        if (!mud) o.gone = OB.regrowSec;
        this.events.onBump?.(d, o, v);
        break;
      }
    }
  }

  refillFood(dt) {
    if (this.food.length >= F.count) { this.foodDebt = 0; return; }
    this.foodDebt += F.respawnPerSec * dt;
    while (this.foodDebt >= 1 && this.food.length < F.count) {
      this.foodDebt -= 1;
      this.food.push(makeFood(...this.foodSpot()));
    }
  }

  // Bots chase the most valuable nearby cookie. Lower skill = slower reactions, shorter sight
  // and more wandering, which spreads the field so the player can win with some effort.
  think(d, dt) {
    if (d.rivalT > 0) {
      d.rivalT -= dt;
      const o = d.rival;
      const dx = o.x - d.x, dy = o.y - d.y, len = Math.hypot(dx, dy) || 1;
      d.dirX = dx / len; d.dirY = dy / len; d.mag = 1;
      d.wantDash = len < 160 + (this.lv.hunt ? 60 : 0); // dash when close enough to connect
      if (d.rivalT > 0 && !o.finished) return;
      d.rival = null; d.rivalT = 0; d.think = 0;
    }
    d.think -= dt;
    if (d.think > 0) return;
    const since = (d.lastThink ?? B.thinkSec) - d.think; // time since the previous decision
    d.think = d.lastThink = B.thinkSec * this.lv.think / d.skill * rand(0.8, 1.4);
    if (d.poopCd === 0 && !d.finished) this.botPoop(d, since);

    if (d.finished) {
      d.wander += rand(-0.8, 0.8);
      d.dirX = Math.cos(d.wander); d.dirY = Math.sin(d.wander); d.mag = 1;
      d.wantDash = false;
      return;
    }

    const R = B.senseRange * d.skill;
    let target = null, best = 0;
    for (const f of this.food) {
      const dx = f.x - d.x, dy = f.y - d.y;
      if (Math.abs(dx) > R || Math.abs(dy) > R) continue;
      // Slight preference to keep the current target avoids jitter between two cookies.
      const score = f.type.xp / (Math.hypot(dx, dy) + 40) * (f === d.target ? 1.3 : 1);
      if (score > best) { best = score; target = f; }
    }
    if (Math.random() > d.skill * B.focus) target = null; // distracted puppy moment
    d.target = target;

    // Harder levels: the bots go after the player when they are near and the dash is ready.
    const pl = this.player, lv = this.lv;
    if (lv.hunt && d !== pl && d.dashCd === 0 && !pl.finished && pl.stun <= 0 && pl.immune <= 0 && pl.r < d.r * 1.4 &&
        Math.hypot(pl.x - d.x, pl.y - d.y) < lv.huntRange && Math.random() < lv.hunt * d.skill) {
      d.rival = pl; d.rivalT = 0.9; return;
    }
    // A rival is about to take my cookie: go shove it (only when the dash is ready).
    if (target && d.dashCd === 0 && Math.random() < lv.aggression * d.skill) {
      const myDist = Math.hypot(target.x - d.x, target.y - d.y);
      let rival = null, nearest = Infinity;
      for (const o of this.dogs) {
        if (o === d || o.finished || o.stun > 0 || o.immune > 0) continue;
        const od = Math.hypot(o.x - d.x, o.y - d.y);
        if (od < lv.rivalRange && Math.hypot(target.x - o.x, target.y - o.y) < myDist && o.r < d.r * 1.3) {
          if (od < nearest) { nearest = od; rival = o; }
        }
      }
      if (rival) { d.rival = rival; d.rivalT = 0.7; return; }
    }

    let fx, fy;
    if (target) {
      fx = target.x - d.x; fy = target.y - d.y;
    } else {
      d.wander += rand(-0.6, 0.6);
      fx = Math.cos(d.wander); fy = Math.sin(d.wander);
    }
    // Sharp bots steer around piles, drifts and mud ahead of them; dreamy ones may not notice.
    const avoid = [];
    if (d.yuckImmune <= 0) for (const p of this.poops) if (p.owner !== d) avoid.push(p.x, p.y, PO.r);
    if (d.bumpImmune <= 0) for (const o of this.obstacles) if (o.gone <= 0) avoid.push(o.x, o.y, o.r * OB[this.season].hit);
    if (avoid.length && Math.random() < d.skill) {
      const len0 = Math.hypot(fx, fy) || 1, ux = fx / len0, uy = fy / len0;
      for (let i = 0; i < avoid.length; i += 3) {
        const px = avoid[i] - d.x, py = avoid[i + 1] - d.y, ahead = px * ux + py * uy, side = px * -uy + py * ux;
        const clear = d.r + avoid[i + 2] + 18;
        if (ahead > 0 && ahead < 220 && Math.abs(side) < clear) {
          const push = (clear - Math.abs(side)) / clear * 2.5, s = side >= 0 ? -1 : 1; // step to the other side
          fx = ux + -uy * s * push; fy = uy + ux * s * push;
          break;
        }
      }
    }
    const m = 120;
    if (d.x < m) fx += 2; if (d.x > W.w - m) fx -= 2;
    if (d.y < m) fy += 2; if (d.y > W.h - m) fy -= 2;
    const len = Math.hypot(fx, fy) || 1;
    d.dirX = fx / len; d.dirY = fy / len;
    d.mag = 1;
    d.wantDash = !!target && target.type.xp >= 3 && Math.random() < 0.3 * d.skill;
  }

  // A bot leaves a pile when a rival runs right behind it, and now and then anyway.
  botPoop(d, dt) {
    const v = Math.hypot(d.vx, d.vy);
    if (v > 40) {
      const ux = d.vx / v, uy = d.vy / v;
      for (const o of this.dogs) {
        if (o === d || o.finished || o.stun > 0) continue;
        const px = o.x - d.x, py = o.y - d.y, behind = -(px * ux + py * uy), side = Math.abs(px * -uy + py * ux);
        if (behind > d.r && behind < v * PO.botNearSec + d.r && side < d.r + o.r) {
          if (Math.random() < this.lv.poopNear * d.skill) d.wantPoop = true;
          return;
        }
      }
    }
    if (Math.random() < PO.botRandomPerMin * this.lv.poopRandom / 60 * dt) d.wantPoop = true;
  }

  // Finished dogs first (by place), then by growth.
  leaderboard() {
    return [...this.dogs].sort((a, b) =>
      (a.place || 99) - (b.place || 99) || b.xp - a.xp);
  }
}
