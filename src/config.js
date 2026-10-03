// All balance numbers live here so they can be tuned without touching game logic.
export const CONFIG = {
  gift: {
    defaultName: 'Катя',
    message: 'Поздравляю с тем, что твой мальтипу стал таким большим!',
    signature: 'С любовью, Паша. С годовщиной!',
  },

  world: { w: 2000, h: 2000 },
  simHz: 60,
  maxDpr: 2,

  dog: {
    baseRadius: 20,       // stage 1 radius, world units (per-stage radius is in stages[].r)
    inStageGrowth: 0.35,  // share of the way to the next stage's radius grown before level-up
    baseSpeed: 220,       // units/s at base radius
    speedExp: -0.22,      // speed ~ (r / baseRadius) ^ speedExp: 220 at r=20, ~180 at r=50
    accel: 9,             // velocity steering rate, 1/s
    eatReach: 1.0,        // food is eaten when its center is within r * eatReach
  },

  // xp = cumulative XP needed to reach the stage, r = body radius. Colors are for the
  // procedural fallback art and particles.
  stages: [
    { name: 'Щенок',     xp: 0,   r: 20, coat: '#f7ecdc', shade: '#e3cfb2', ear: '#e9d2b0' },
    { name: 'Малыш',     xp: 27,  r: 24, coat: '#f6d29a', shade: '#e2b170', ear: '#e7ac63' },
    { name: 'Подросток', xp: 75,  r: 29, coat: '#e9a25a', shade: '#c97d38', ear: '#c46f2c' },
    { name: 'Юный',      xp: 150, r: 35, coat: '#8a5a3b', shade: '#6b4129', ear: '#5c3520' },
    { name: 'Взрослый',  xp: 270, r: 42, coat: '#c9ced6', shade: '#9fa6b2', ear: '#8e95a1' },
    { name: 'Чемпион',   xp: 460, r: 50, coat: '#f4c84a', shade: '#d9a321', ear: '#c98f16' },
  ],

  food: {
    count: 360,
    respawnPerSec: 12,
    clearRadius: 140,     // new food does not appear right next to a dog
    types: [
      { id: 'basic', xp: 1,  weight: 90, r: 8 },
      { id: 'choco', xp: 3,  weight: 9,  r: 10 },
      { id: 'bone',  xp: 10, weight: 1,  r: 12 },
    ],
  },

  bots: {
    count: 8,
    skills: [0.38, 0.42, 0.46, 0.50, 0.54, 0.58, 0.90, 1.0],
    thinkSec: 0.25,
    senseRange: 380,
    speedMul: 0.92,       // bots are a bit slower than the player
    skillMin: 0.55,       // skill spreads bots from dreamy to sharp
    skillMax: 1.0,
    focus: 0.95,          // chance per think to actually pick a target, times skill
    aggression: 0.20,     // chance (times skill) to dash-shove a rival that is closer to the bot's cookie
    names: ['Бусинка', 'Пончик', 'Ириска', 'Зефир', 'Кекс', 'Плюша', 'Бублик',
            'Мася', 'Тоффи', 'Персик', 'Кнопка', 'Бисквит', 'Ватрушка'],
  },

  // Shoves: a dashing dog (or a much bigger running one) knocks a rival back; the rival spins
  // for a moment and can't eat. No XP is lost.
  shove: {
    bodyShove: false,
    maxStunSec: 0.55,
    dashMinSpeed: 200,    // approach speed needed for a dash shove
    bigRatio: 1.25,       // ...or the attacker is this much bigger
    bigMinSpeed: 120,     // ...and approaches at least this fast
    power: 360,           // knockback speed for equal-sized dogs
    stunSec: 0.45,        // spin time for equal-sized dogs
    cooldown: 1.2,        // attacker can't shove again for this long
    immuneSec: 2.5,       // a shoved dog can't be shoved again for this long after the spin
    recoil: 0.3,          // attacker keeps this share of its speed
    friction: 4.0,        // knocked-back slide decay, 1/s
  },

  race: {
    countdownSec: 3,
    shoveGraceSec: 3,     // no shoves right after the start, while everyone is bunched up
    startRing: 0.12,      // start positions: ring radius as a share of the field size
  },

  // Dash is free (it must never push the finish further away) but has a cooldown.
  dash: {
    speedMul: 1.6,
    durationSec: 0.45,
    cooldownSec: 3.5,
  },

  camera: {
    viewAtBase: 400,    // world units across the shorter screen side at base radius
    zoomExp: 0.45,        // view grows ~ (r / baseRadius) ^ zoomExp: 400 -> ~600 at the finish
    follow: 8,
    landscapeZoom: 1.35,  // phones held sideways have a short side of ~390 px: zoom in more
  },
};
