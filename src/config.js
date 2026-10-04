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
    // Handling has momentum: the dog speeds up and brakes over a moment and drifts in sharp turns.
    accel: 650,           // units/s^2 speeding up along the wanted direction
    brake: 560,           // units/s^2 slowing down: stick released, or turning back
    grip: 3.2,            // 1/s decay of sideways speed; lower = longer drifts
    dashKick: 0.35,       // a dash instantly adds this share of the dash speed
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

  // Season obstacles (fixed layout per map, like the puddles): running into a snowdrift or a
  // leaf pile at speed knocks the dog over (the drift / pile scatters and comes back after
  // regrowSec); stepping into summer mud gets the paws stuck. Nothing is lost, just time.
  obstacles: {
    stunSec: 3,
    immuneSec: 4,         // after getting up: no second bump right away
    minSpeed: 110,        // drifts and leaves only stop a dog that runs into them
    regrowSec: 15,
    summer: { kind: 'mud', count: 9, rMin: 48, rMax: 70, hit: 0.75 },
    autumn: { kind: 'leaves', count: 22, rMin: 24, rMax: 32, hit: 0.7 },
    winter: { kind: 'drift', count: 18, rMin: 28, rMax: 40, hit: 0.75 },
  },

  // Difficulty: how sharp and pushy the bots are. easy is the original balance. skillAdd /
  // skillMin lift every bot's skill (capped at 1); think scales their reaction time; aggression:
  // chance (times skill) to shove a rival heading for the same cookie, within rivalRange; hunt:
  // chance (times skill) per decision to go after the player when the dash is ready; poopNear /
  // poopRandom: how eagerly bots leave a surprise; bonus: cookies for finishing at this level.
  difficulty: {
    order: ['easy', 'medium', 'hard', 'extreme'],
    easy:    { name: 'Простой',  ico: '🌱', skillAdd: 0,    skillMin: 0,    speedMul: 0.92, think: 1,    aggression: 0.20, rivalRange: 220, hunt: 0,    huntRange: 0,   poopNear: 0.5, poopRandom: 0,   bonus: 80 },
    medium:  { name: 'Средний',  ico: '🐾', skillAdd: 0.15, skillMin: 0.55, speedMul: 0.95, think: 0.9,  aggression: 0.35, rivalRange: 250, hunt: 0.06, huntRange: 260, poopNear: 0.6, poopRandom: 0,   bonus: 120 },
    hard:    { name: 'Сложный',  ico: '🔥', skillAdd: 0.3,  skillMin: 0.75, speedMul: 0.98, think: 0.75, aggression: 0.6,  rivalRange: 300, hunt: 0.2,  huntRange: 340, poopNear: 0.8, poopRandom: 1,   bonus: 180 },
    extreme: { name: 'Экстрим',  ico: '🌶️', skillAdd: 0.5,  skillMin: 0.92, speedMul: 1.0,  think: 0.6,  aggression: 1,    rivalRange: 360, hunt: 0.35, huntRange: 420, poopNear: 1,   poopRandom: 2.5, bonus: 260 },
  },

  // Shoves: a dashing dog knocks a rival back; the rival tumbles, sits dazed for a moment and
  // can't eat, then is protected for a while. No XP is lost.
  shove: {
    bodyShove: false,
    maxStunSec: 2.4,
    dashMinSpeed: 200,    // approach speed needed for a dash shove
    bigRatio: 1.25,       // ...or the attacker is this much bigger
    bigMinSpeed: 120,     // ...and approaches at least this fast
    power: 360,           // knockback speed for equal-sized dogs
    stunSec: 1.8,         // knocked-down time for equal-sized dogs: tumble, sit dazed, get up
    fallSec: 0.35,        // render: tumble part at the start of the knock-down
    getUpSec: 0.4,        // render: hop back on the paws at the end
    cooldown: 1.2,        // attacker can't shove again for this long
    immuneSec: 2.5,       // a shoved dog can't be shoved again for this long after the spin
    recoil: 0.3,          // attacker keeps this share of its speed
    friction: 4.0,        // knocked-back slide decay, 1/s
  },

  // Spring puddles: low grip (the dog slides), and a dash into one shoots the dog ahead.
  puddles: {
    count: 12, rMin: 70, rMax: 120,
    grip: 1.2,            // instead of dog.grip (3.2) while on the water: a drift, still steerable
    accelMul: 0.85,       // paws slip a little: speeding up and braking are weaker
    boostMul: 1.2,        // dashing in: this much faster...
    boostSec: 0.45,       // ...for this long
  },

  // "Surprise": a dog leaves a little pile behind; a rival that runs over it sits 'yuck!' for a
  // while (no growth is lost). Your own piles are harmless to you.
  poop: {
    cooldownSec: 30,
    botCooldownSec: 45,
    stunSec: 4,
    immuneSec: 6,         // after a 'yuck!', piles can't get you again for this long
    lifeSec: 25,
    max: 6,               // on the field at once; when full, a new one waits (cooldown not spent)
    r: 11,
    armSec: 0.8,          // a fresh pile is harmless for a moment (dogs right behind can react)
    mouthAhead: 0.65,     // it gets you only under the nose: a circle this far ahead (in r)...
    mouthR: 0.55,         // ...of this radius (in r), plus the pile's own
    botNearSec: 1.2,      // bots drop one when a rival is this close behind them (in seconds of running)
    botRandomPerMin: 0.4, // ...or now and then anyway (times the level's poopRandom; 0 on easy)
    botFoodGap: 45,       // bots don't drop right next to a cookie...
    botPileGap: 140,      // ...or another pile...
    botGapSec: 4,         // ...or right after another bot did
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

  // Wardrobe: things bought with cookies from races (1 eaten = 1 🍪, + finishBonus for finishing,
  // whatever the place). ~360 cookies a race, so the whole wardrobe takes ~40 races. tier: common /
  // rare / dream. look: how proto/outfits.js draws it. bots: cheap and small enough for rivals.
  wardrobe: {
    starterGift: 200,
    finishBonus: 80,
    dressedBots: 3,
    tabs: [
      { slot: 'head', ico: '🎀', name: 'Голова' },
      { slot: 'neck', ico: '💗', name: 'Шея' },
      { slot: 'body', ico: '👗', name: 'Наряд' },
      { slot: 'paws', ico: '🥾', name: 'Лапки' },
      { slot: 'tail', ico: '🐾', name: 'Хвост' },
      { slot: 'back', ico: '🎒', name: 'Спинка' },
      { slot: 'face', ico: '👓', name: 'Мордочка' },
      { slot: 'coat', ico: '🎨', name: 'Шёрстка' },
      { slot: 'trail', ico: '✨', name: 'Рывок' },
      { slot: 'world', ico: '🗺', name: 'Мир' },
    ],
    items: [
      { id: 'bow', slot: 'head', name: 'Бант «Клубника»', price: 120, tier: 'common', ico: '🎀', bots: true, look: { kind: 'bow', color: '#ff6f9f', knot: '#ff4f86', dots: '#ffffff' } },
      { id: 'daisy', slot: 'head', name: 'Ромашка', price: 160, tier: 'common', ico: '🌼', bots: true, look: { kind: 'daisy' } },
      { id: 'beret', slot: 'head', name: 'Мятный берет', price: 260, tier: 'common', ico: '🫐', bots: true, look: { kind: 'beret', color: '#8fe3c4' } },
      { id: 'chef', slot: 'head', name: 'Колпак повара', price: 360, tier: 'rare', ico: '👨‍🍳', look: { kind: 'chef', band: '#ff6b6b' } },
      { id: 'party', slot: 'head', name: 'Праздничный колпачок', price: 450, tier: 'rare', ico: '🥳', bots: true, look: { kind: 'party', color: '#c9b5ff', ring2: '#8fe3c4', top: '#ff6fae' } },
      { id: 'tiara', slot: 'head', name: 'Тиара «Годовщина»', price: 2000, tier: 'dream', ico: '👑', look: { kind: 'tiara', gem: '#3cc9c0' } },
      { id: 'heart', slot: 'neck', name: 'Ошейник-сердечко', price: 100, tier: 'common', ico: '💗', bots: true, look: { kind: 'collar', color: '#ff7a7a', charm: 'heart', charmColor: '#ffd34d' } },
      { id: 'bandana', slot: 'neck', name: 'Бандана «Пикник»', price: 180, tier: 'common', ico: '🧣', bots: true, look: { kind: 'bandana', color: '#8fdcb8' } },
      { id: 'bowtie', slot: 'neck', name: 'Бабочка «Джентльпу»', price: 220, tier: 'common', ico: '🎩', bots: true, look: { kind: 'collar', color: '#4a6fd8', charm: 'bowtie', charmColor: '#6fb8ff' } },
      { id: 'sailor', slot: 'neck', name: 'Матросский воротник', price: 320, tier: 'rare', ico: '⚓', look: { kind: 'sailor' } },
      { id: 'bloom', slot: 'neck', name: 'Цветочный воротничок', price: 420, tier: 'rare', ico: '🌸', look: { kind: 'bloom' } },
      { id: 'specs', slot: 'face', name: 'Очки «Умница»', price: 500, tier: 'rare', ico: '👓', look: { kind: 'specs', color: '#6b3f2a' } },
      { id: 'dress', slot: 'body', name: 'Платье «Горошек»', price: 400, tier: 'rare', ico: '👗', look: { kind: 'garment', cut: 'dress', color: '#ff9a9a', dots: '#fff4e8' } },
      { id: 'raincape', slot: 'body', name: 'Дождевик «Лимон»', price: 500, tier: 'rare', ico: '🧥', look: { kind: 'garment', cut: 'cape', color: '#ffd84a', trim: '#f2a900' } },
      { id: 'bee', slot: 'body', name: 'Костюм «Пчёлка»', price: 600, tier: 'rare', ico: '🐝', look: { kind: 'garment', cut: 'bee', color: '#ffc83d', stripe: '#5a3a22' } },
      { id: 'apron', slot: 'body', name: 'Попона «Печенька»', price: 320, tier: 'common', ico: '🍪', look: { kind: 'garment', cut: 'blanket', color: '#9fd4ff', trim: '#ffffff', pocket: '#d9a05b' } },
      { id: 'satchel', slot: 'back', name: 'Рюкзачок «Печенье»', price: 600, tier: 'rare', ico: '🎒', look: { kind: 'satchel' } },
      { id: 'wings', slot: 'back', name: 'Крылышки «Фея»', price: 2200, tier: 'dream', ico: '🧚', look: { kind: 'wings' } },
      { id: 'pompom', slot: 'tail', name: 'Помпон «Малина»', price: 150, tier: 'common', ico: '🩷', bots: true, look: { kind: 'pompom', color: '#ff4fa3' } },
      { id: 'duck', slot: 'tail', name: 'Уточка на хвосте', price: 350, tier: 'rare', ico: '🐤', look: { kind: 'duck' } },
      { id: 'pinwheel', slot: 'tail', name: 'Вертушка', price: 450, tier: 'rare', ico: '🍭', look: { kind: 'pinwheel' } },
      { id: 'boots', slot: 'paws', name: 'Сапожки «Солнышко»', price: 250, tier: 'common', ico: '🥾', look: { kind: 'boots', color: '#ffd23f' } },
      { id: 'slippers', slot: 'paws', name: 'Тапочки «Зефир»', price: 300, tier: 'common', ico: '🩰', look: { kind: 'boots', color: '#ffb3d6' } },
      { id: 'petalboots', slot: 'paws', name: 'Сапожки «Лепестки»', price: 400, tier: 'rare', ico: '💜', look: { kind: 'boots', color: '#a98bff' } },
      { id: 'strawberry', slot: 'coat', name: 'Клубничное суфле', price: 300, tier: 'common', ico: '🍓', look: { kind: 'coat', coat: '#f7b4c6', light: '#fff1ea', ear: '#e98aa6' } },
      { id: 'lavender', slot: 'coat', name: 'Лавандовое молоко', price: 300, tier: 'common', ico: '🪻', look: { kind: 'coat', coat: '#cdb8f0', light: '#f6f0ff', ear: '#a98fd8' } },
      { id: 'mint', slot: 'coat', name: 'Мятный зефир', price: 300, tier: 'common', ico: '🌿', look: { kind: 'coat', coat: '#a9e6cf', light: '#fbf6e8', ear: '#fff1d6' } },
      { id: 'cocoa', slot: 'coat', name: 'Какао со сливками', price: 250, tier: 'common', ico: '☕', look: { kind: 'coat', coat: '#8a5a44', light: '#fbe9d4', ear: '#6a3f2e' } },
      { id: 'peach', slot: 'coat', name: 'Персиковый йогурт', price: 250, tier: 'common', ico: '🍑', look: { kind: 'coat', coat: '#ffc29a', light: '#fff0de', ear: '#f19c6c' } },
      { id: 'cloud', slot: 'coat', name: 'Серебряное облачко', price: 450, tier: 'rare', ico: '☁️', look: { kind: 'coat', coat: '#d9dde6', light: '#ffffff', ear: '#b4bccb' } },
      { id: 'crumbs', slot: 'trail', name: 'Крошки радости', price: 150, tier: 'common', ico: '🍪', look: { kind: 'trail', fx: 'crumbs' } },
      { id: 'hearts', slot: 'trail', name: 'Сердечки', price: 250, tier: 'common', ico: '💕', look: { kind: 'trail', fx: 'hearts' } },
      { id: 'petals', slot: 'trail', name: 'Лепестки', price: 350, tier: 'common', ico: '🌷', look: { kind: 'trail', fx: 'petals' } },
      { id: 'bubbles', slot: 'trail', name: 'Мыльные пузыри', price: 400, tier: 'rare', ico: '🫧', look: { kind: 'trail', fx: 'bubbles' } },
      { id: 'stars', slot: 'trail', name: 'Звёздная пыль', price: 450, tier: 'rare', ico: '⭐', look: { kind: 'trail', fx: 'stars' } },
      { id: 'rainbow', slot: 'trail', name: 'Радужный рывок', price: 2400, tier: 'dream', ico: '🌈', look: { kind: 'trail', fx: 'rainbow' } },
      // Maps: the season of the meadow. Summer is everyone's from the start (price 0 = owned).
      { id: 'summer', slot: 'world', name: 'Лето', price: 0, tier: 'common', ico: '☀️', world: 'summer' },
      { id: 'autumn', slot: 'world', name: 'Осень', price: 800, tier: 'rare', ico: '🍂', world: 'autumn' },
      { id: 'winter', slot: 'world', name: 'Зима', price: 1000, tier: 'rare', ico: '❄️', world: 'winter' },
      { id: 'spring', slot: 'world', name: 'Весна', price: 1200, tier: 'rare', ico: '🌸', world: 'spring' },
    ],
  },
};
