// All balance numbers live here so they can be tuned without touching game logic.
export const CONFIG = {
  gift: {
    defaultName: 'Катя',
    message: 'Поздравляю с тем, что твой мальтипу стал таким большим!',
    signature: 'С любовью, Паша. С годовщиной!',
  },

  world: { w: 3000, h: 3000 },
  simHz: 60,
  maxDpr: 2,

  dog: {
    baseRadius: 20,       // stage 1 radius, world units
    radiusMul: 1.25,      // radius multiplier per stage
    inStageGrowth: 0.12,  // extra radius gained across one stage (fraction)
    baseSpeed: 230,       // units/s at base radius
    speedExp: -0.35,      // speed ~ (r / baseRadius) ^ speedExp
    accel: 9,             // velocity steering rate, 1/s
    eatReach: 1.0,        // food is eaten when its center is within r * eatReach
  },

  // xp = cumulative XP needed to reach the stage. Coat colors are placeholders until art arrives.
  stages: [
    { name: 'Щенок',    xp: 0,   coat: '#f7ecdc', shade: '#e3cfb2', ear: '#e9d2b0' },
    { name: 'Малыш',    xp: 20,  coat: '#f6d29a', shade: '#e2b170', ear: '#e7ac63' },
    { name: 'Подросток', xp: 52, coat: '#e9a25a', shade: '#c97d38', ear: '#c46f2c' },
    { name: 'Юный',     xp: 103, coat: '#8a5a3b', shade: '#6b4129', ear: '#5c3520' },
    { name: 'Взрослый', xp: 185, coat: '#c9ced6', shade: '#9fa6b2', ear: '#8e95a1' },
    { name: 'Чемпион',  xp: 316, coat: '#f4c84a', shade: '#d9a321', ear: '#c98f16' },
  ],

  food: {
    count: 280,
    respawnPerSec: 12,
    types: [
      { id: 'basic', xp: 1,  weight: 80, r: 8 },
      { id: 'choco', xp: 3,  weight: 18, r: 10 },
      { id: 'bone',  xp: 10, weight: 2,  r: 12 },
    ],
  },

  bots: {
    count: 9,
    thinkSec: 0.3,
    senseRange: 380,
    speedMul: 0.92,       // bots are a bit slower than the player
    skillMin: 0.55,       // skill spreads bots from dreamy to sharp
    skillMax: 1.0,
    focus: 0.95,          // chance per think to actually pick a target, times skill
    aggression: 0.35,     // chance (times skill) to shove a rival that is closer to the bot's cookie
    names: ['Бусинка', 'Пончик', 'Ириска', 'Зефир', 'Кекс', 'Плюша', 'Бублик',
            'Мася', 'Тоффи', 'Персик', 'Кнопка', 'Бисквит', 'Ватрушка'],
  },

  // Shoves: a dashing dog (or a much bigger running one) knocks a rival back; the rival spins
  // for a moment and can't eat. No XP is lost.
  shove: {
    dashMinSpeed: 200,    // approach speed needed for a dash shove
    bigRatio: 1.25,       // ...or the attacker is this much bigger
    bigMinSpeed: 120,     // ...and approaches at least this fast
    power: 560,           // knockback speed for equal-sized dogs
    stunSec: 0.75,        // spin time for equal-sized dogs
    cooldown: 0.6,        // attacker can't shove again for this long
    recoil: 0.3,          // attacker keeps this share of its speed
    friction: 3.2,        // knocked-back slide decay, 1/s
  },

  race: {
    countdownSec: 3,
    startRing: 0.12,      // start positions: ring radius as a share of the field size
  },

  dash: {
    speedMul: 1.75,
    xpPerSec: 4,          // cost; never drops the dog below its current stage start
  },

  camera: {
    viewAtBase: 400,    // world units across the shorter screen side at base radius
    zoomExp: 0.55,        // view grows ~ (r / baseRadius) ^ zoomExp
    follow: 8,
  },
};
