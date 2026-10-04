// All balance numbers live here so they can be tuned without touching game logic.
export const CONFIG = {
  gift: {
    defaultName: 'Катя',
    message: 'Поздравляю с тем, что твой мальтипу стал таким большим!',
    signature: 'С любовью, Паша. С годовщиной!',
  },

  world: { w: 2000, h: 2000 },
  // Dark map colours keep white rivals and the yellow player visible on the minimap.
  minimap: {
    whale:'#3e6b64',yorknew:'#4e5870',greed:'#506b62',
    summer: 'rgba(30,70,25,0.55)', autumn: '#67513b', winter: '#536779',
    spring: '#466c42', sakura: '#685364', kyoto: '#585b65', italy: '#6f6242',
  },
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
    greed:{kind:'leaves',count:12,rMin:29,rMax:38,hit:.7},
    stunSec: 3,
    immuneSec: 4,         // after getting up: no second bump right away
    minSpeed: 140,        // drifts and leaves only stop a dog that runs into them
    regrowSec: 15,
    sakura: { kind:'leaves',count:12,rMin:27,rMax:36,hit:.7 },
    italy: { kind:'mud',count:7,rMin:48,rMax:70,hit:.75 }, // damp garden soil, same visual/physical meaning as summer
    summer: { kind: 'mud', count: 7, rMin: 48, rMax: 70, hit: 0.75 },
    autumn: { kind: 'leaves', count: 16, rMin: 24, rMax: 32, hit: 0.7 },
    winter: { kind: 'drift', count: 14, rMin: 28, rMax: 40, hit: 0.75 },
  },

  // Difficulty: how sharp and pushy the bots are. easy is the original balance. skillAdd /
  // skillMin lift every bot's skill (capped at 1); think scales their reaction time; aggression:
  // chance (times skill) to shove a rival heading for the same cookie, within rivalRange; hunt:
  // chance (times skill) per decision to go after the player when the dash is ready; poopNear /
  // poopRandom: how eagerly bots leave a surprise; bonus: cookies for finishing at this level.
  difficulty: {
    order: ['easy', 'medium', 'hard', 'extreme'],
    easy:    { name: 'Простой',  ico: '🌱', skillAdd: 0,     skillMin: 0,    speedMul: 0.92, think: 1,    aggression: 0.2,  rivalRange: 220, hunt: 0,    huntRange: 0,   poopNear: 0.5,  poopRandom: 0,   bonus: 80 },
    medium:  { name: 'Средний',  ico: '🐾', skillAdd: 0.05,  skillMin: 0.45, speedMul: 0.94, think: 1,    aggression: 0.3,  rivalRange: 240, hunt: 0.04, huntRange: 240, poopNear: 0.55, poopRandom: 0,   bonus: 120 },
    hard:    { name: 'Сложный',  ico: '🔥', skillAdd: 0.25,  skillMin: 0.65, speedMul: 0.98, think: 0.8, aggression: 0.6,  rivalRange: 280, hunt: 0.12,  huntRange: 300, poopNear: 0.8, poopRandom: 1,   bonus: 180 },
    extreme: { name: 'Экстрим',  ico: '🌶️', skillAdd: 0.3,  skillMin: 0.75, speedMul: 1,  think: 0.7,  aggression: 0.9,    rivalRange: 340, hunt: 0.18, huntRange: 340, poopNear: 1,   poopRandom: 2.5, bonus: 260 },
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
    maps: { spring:12, kyoto:10, whale:8, yorknew:10 },
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
      // Italian collection: round 2, twenty independent purchases.
      {"id":"it_boater","slot":"head","name":"Канотье","price":500,"tier":"rare","ico":"👒","bots":true,"look":{"kind":"it_boater","straw":"#dab975","ribbon":"#c85455"}},
      {"id":"it_baker","slot":"head","name":"Пиццайоло","price":260,"tier":"common","ico":"👨‍🍳","bots":true,"look":{"kind":"it_baker","color":"#fff1db","ribbon":"#c85455"}},
      {"id":"it_olive","slot":"head","name":"Оливковый венок","price":280,"tier":"common","ico":"🌿","bots":false,"look":{"kind":"it_olive","leaf":"#588342","fruit":"#35313e","wood":"#947650"}},
      {"id":"it_lemon","slot":"head","name":"Лимончик","price":240,"tier":"common","ico":"🍋","bots":true,"look":{"kind":"it_lemon","color":"#f2cc42","leaf":"#409843"}},
      {"id":"it_tifosi","slot":"neck","name":"Платок «Тифози»","price":220,"tier":"common","ico":"🇮🇹","bots":true,"look":{"kind":"it_scarf","color":"#fff0db","green":"#638c73","red":"#ca6864"}},
      {"id":"it_pasta","slot":"neck","name":"Фарфалле","price":400,"tier":"rare","ico":"🍝","bots":false,"look":{"kind":"it_pasta","color":"#ecc044","cord":"#997254"}},
      {"id":"it_maiolica","slot":"neck","name":"Кулон «Майолика»","price":300,"tier":"common","ico":"🔷","bots":false,"look":{"kind":"it_tile","color":"#296fb6","rim":"#f9ebd4","lemon":"#f8d24b","leaf":"#489149","cord":"#95704d"}},
      {"id":"it_maestro","slot":"face","name":"Усы «Маэстро»","price":450,"tier":"rare","ico":"🥸","bots":false,"look":{"kind":"it_moustache","color":"#25232a"}},
      {"id":"it_riviera","slot":"face","name":"Очки «Ривьера»","price":450,"tier":"rare","ico":"🕶️","bots":false,"look":{"kind":"it_specs","frame":"#45566c","lens":"#6f91a1","gold":"#d6b877"}},
      {"id":"it_gondolier","slot":"body","name":"Тельняшка гондольера","price":320,"tier":"common","ico":"👕","bots":true,"look":{"kind":"garment","cut":"it_stripes","color":"#faf0db","stripe":"#536987","trim":"#536987"}},
      {"id":"it_apron","slot":"body","name":"Фартук пиццайоло","price":550,"tier":"rare","ico":"🍅","bots":false,"look":{"kind":"garment","cut":"it_apron","color":"#fff0d8","trim":"#c76760","sauce":"#bb5d50"}},
      {"id":"it_harlequin","slot":"body","name":"Арлекин","price":1200,"tier":"epic","ico":"♦️","bots":false,"look":{"kind":"garment","cut":"it_harlequin","color":"#f3dfb6","red":"#c97470","blue":"#75a3a5","trim":"#635573"}},
      {"id":"it_basket","slot":"back","name":"Лимонная корзинка","price":600,"tier":"rare","ico":"🧺","bots":false,"look":{"kind":"it_basket","color":"#b99160","rim":"#d8b77b","lemon":"#f2cd43","leaf":"#429347","strap":"#98704f"}},
      {"id":"it_pizza","slot":"back","name":"Пицца с собой","price":550,"tier":"rare","ico":"🍕","bots":false,"look":{"kind":"it_pizzabox","color":"#fff2db","red":"#c4473c","cheese":"#fff0ca","strap":"#997452"}},
      {"id":"it_pigeon","slot":"back","name":"Голубь Сан-Марко","price":2000,"tier":"dream","ico":"🕊️","bots":false,"look":{"kind":"it_pigeon","color":"#a4b0bb","wing":"#788c9f","neck":"#789a8d","beak":"#d7917e","ink":"#474550","pad":"#eee0c3"}},
      {"id":"it_flag","slot":"tail","name":"Итальянский флажок","price":200,"tier":"common","ico":"🇮🇹","bots":false,"look":{"kind":"it_flag","white":"#fff0da","red":"#c96662","green":"#6a9276","wood":"#b08c62"}},
      {"id":"it_gelato","slot":"tail","name":"Джелато","price":400,"tier":"rare","ico":"🍦","bots":false,"look":{"kind":"it_gelato","cone":"#cca370","pink":"#e5a6b8","green":"#a8bd83","cream":"#fff0d6"}},
      {"id":"it_capri","slot":"paws","name":"Сандалии «Капри»","price":450,"tier":"rare","ico":"🩴","bots":false,"look":{"kind":"shoes","style":"it_capri","color":"#b8875a","sole":"#835c43","trim":"#dfbd73"}},
      {"id":"it_tiramisu","slot":"coat","name":"Тирамису","price":400,"tier":"rare","ico":"🍰","bots":false,"look":{"kind":"coat","coat":"#a9856b","light":"#faeacf","ear":"#71534b"}},
      {"id":"it_confetti","slot":"trail","name":"Конфетти-карнавал","price":1200,"tier":"epic","ico":"🎊","bots":false,"look":{"kind":"trail","fx":"confetti"}},
      // Fashion eyewear: six independent face-slot purchases.
      {"id":"gl_cat","slot":"face","name":"Очки «Кошечка»","price":500,"tier":"rare","ico":"🕶️","bots":false,"look":{"kind":"fashion_specs","model":"cat","color":"#252632","lens":"#423447","shine":"#d7e5f0"}},
      {"id":"gl_oval","slot":"face","name":"Очки «Ретро-овал»","price":450,"tier":"rare","ico":"👓","bots":false,"look":{"kind":"fashion_specs","model":"oval","color":"#c5923f","shine":"#fff1bc"}},
      {"id":"gl_podium","slot":"face","name":"Солнечные «Подиум»","price":600,"tier":"rare","ico":"🕶️","bots":false,"look":{"kind":"fashion_specs","model":"square","color":"#563326","spot":"#d19347","lens":"#52382f","shine":"#edc899"}},
      {"id":"gl_butterfly","slot":"face","name":"Очки «Бабочка»","price":600,"tier":"rare","ico":"🦋","bots":false,"look":{"kind":"fashion_specs","model":"butterfly","color":"#db8ea9","lens":"#b7bddb","shine":"#f4f4fd"}},
      {"id":"gl_visor","slot":"face","name":"Солнечные «Визор»","price":550,"tier":"rare","ico":"🕶️","bots":false,"look":{"kind":"fashion_specs","model":"visor","color":"#f3e9d6","lens":"#983e51","shine":"#ffbe88"}},
      {"id":"gl_crystal","slot":"face","name":"Очки «Кристалл»","price":900,"tier":"epic","ico":"💎","bots":false,"look":{"kind":"fashion_specs","model":"crystal","color":"#cbbcea","shine":"#f6f1ff","edge":"#8979b5"}},
      // HxH expedition collection: additive stable IDs.
      {"id":"hx_cap","slot":"head","name":"Кепка рыбака","price":900,"tier":"rare","ico":"🧢","look":{"kind":"hx_cap"}},
      {"id":"hx_hat","slot":"head","name":"Шляпа путешественника","price":1100,"tier":"rare","ico":"🪶","look":{"kind":"hx_hat"}},
      {"id":"hx_band","slot":"head","name":"Повязка экспедиции","price":800,"tier":"rare","ico":"🟢","look":{"kind":"hx_band"}},
      {"id":"hx_hibiscus","slot":"head","name":"Гибискус Китового острова","price":1000,"tier":"rare","ico":"🌺","look":{"kind":"hx_hibiscus"}},
      {"id":"hx_helmet","slot":"head","name":"Король муравьёв","price":1600,"tier":"epic","ico":"🪲","look":{"kind":"hx_helmet"}},
      {"id":"hx_silver","slot":"head","name":"Серебряные вихры","price":1200,"tier":"rare","ico":"🌬️","look":{"kind":"hx_silver"}},
      {"id":"hx_hair","slot":"head","name":"Длинные волосы героя","price":2400,"tier":"dream","ico":"🌪️","look":{"kind":"hx_hair"}},
      {"id":"hx_license","slot":"neck","name":"Лицензия охотника","price":800,"tier":"rare","ico":"🪪","look":{"kind":"hx_license"}},
      {"id":"hx_scarlet","slot":"neck","name":"Алая капля","price":1000,"tier":"rare","ico":"♦️","look":{"kind":"hx_scarlet"}},
      {"id":"hx_bow","slot":"neck","name":"Фиолетовый бант","price":900,"tier":"rare","ico":"🎀","look":{"kind":"hx_bow"}},
      {"id":"hx_glasses","slot":"face","name":"Очки студента-медика","price":900,"tier":"rare","ico":"👓","look":{"kind":"hx_glasses"}},
      {"id":"hx_diamond","slot":"face","name":"Карточный ромб","price":800,"tier":"rare","ico":"🔶","look":{"kind":"hx_diamond"}},
      {"id":"hx_jacket","slot":"body","name":"Зелёная куртка","price":1100,"tier":"rare","ico":"🧥","look":{"kind":"garment","cut":"hx_jacket","color":"#319457","trim":"#1b3030"}},
      {"id":"hx_shirt","slot":"body","name":"Голубой высокий ворот","price":900,"tier":"rare","ico":"👕","look":{"kind":"garment","cut":"hx_shirt","color":"#f3f9f8","trim":"#78c3e8"}},
      {"id":"hx_suit","slot":"body","name":"Костюм большого города","price":1400,"tier":"rare","ico":"👔","look":{"kind":"garment","cut":"hx_suit","color":"#2864a2","trim":"#eff3e4"}},
      {"id":"hx_cloak","slot":"body","name":"Плащ солнечного клана","price":1600,"tier":"epic","ico":"☀️","look":{"kind":"garment","cut":"hx_cloak","color":"#f3ca43","trim":"#34558d"}},
      {"id":"hx_pack","slot":"back","name":"Рюкзак рыбака с удочкой","price":2800,"tier":"dream","ico":"🎒","look":{"kind":"hx_pack"}},
      {"id":"hx_skate","slot":"back","name":"Скейт","price":2400,"tier":"dream","ico":"🛹","look":{"kind":"hx_skate"}},
      {"id":"hx_case","slot":"back","name":"Чемоданчик доктора","price":1200,"tier":"rare","ico":"🩺","look":{"kind":"hx_case"}},
      {"id":"hx_binder","slot":"back","name":"Книга карточных приключений","price":1800,"tier":"epic","ico":"📗","look":{"kind":"hx_binder"}},
      {"id":"hx_yoyos","slot":"tail","name":"Два йо-йо","price":1800,"tier":"epic","ico":"🪀","look":{"kind":"hx_yoyos"}},
      {"id":"hx_kite","slot":"tail","name":"Воздушная рыбка","price":1000,"tier":"rare","ico":"🐟","look":{"kind":"hx_kite"}},
      {"id":"hx_boots","slot":"paws","name":"Ботинки рыбака","price":900,"tier":"rare","ico":"🥾","look":{"kind":"shoes","style":"hx_boots","color":"#32934d","sole":"#243c37","trim":"#c8ad76"}},
      {"id":"hx_fur","slot":"coat","name":"Серебряная шерсть","price":1000,"tier":"rare","ico":"☁️","look":{"kind":"coat","coat":"#eef6ff","light":"#fffdf4","ear":"#c8e3ee","tips":"#a9daf2"}},
      {"id":"hx_lightning","slot":"trail","name":"Молния","price":1800,"tier":"epic","ico":"⚡","look":{"kind":"trail","fx":"lightning"}},
      {"id":"hx_gum","slot":"trail","name":"Жвачка","price":2000,"tier":"epic","ico":"🩷","look":{"kind":"trail","fx":"gum"}},
      {"id":"hx_aura","slot":"trail","name":"Нэн-аура","price":900,"tier":"rare","ico":"✨","look":{"kind":"trail","fx":"aura"}},
      {"id":"whale","world":"whale","name":"Китовый остров","price":2400,"ico":"🌊","slot":"world","tier":"dream"},
      {"id":"yorknew","world":"yorknew","name":"Йоркшин ночью","price":2800,"ico":"🌃","slot":"world","tier":"dream"},
      {"id":"greed","world":"greed","name":"Остров Жадности","price":3200,"ico":"🃏","slot":"world","tier":"dream"},
      {"id":"jp_daruma_helmet","slot":"head","name":"Шлем «Дарума»","price":600,"tier":"rare","ico":"🔴","bots":false,"look":{"kind":"jp_daruma_helmet","color":"#ce4e55","face":"#fff0d6","gold":"#edc364","ink":"#4d3540"}},
      // Japanese travel collection: additive IDs, existing prices and saves unchanged.
      {"id":"jp_sakura_wreath","slot":"head","name":"Венок «Сакура»","price":500,"tier":"rare","ico":"🌸","bots":true,"look":{"kind":"jp_wreath","flower":"#ef9fbe","middle":"#f8d578","band":"#80965d"}},
      {"id":"jp_kasa","slot":"head","name":"Шляпа каса","price":550,"tier":"rare","ico":"👒","bots":false,"look":{"kind":"jp_kasa","color":"#d9ba77","rim":"#9c7849"}},
      {"id":"jp_hachimaki","slot":"head","name":"Хатимаки","price":220,"tier":"common","ico":"🔴","bots":true,"look":{"kind":"jp_hachimaki","color":"#fff6e9","disk":"#d74b52"}},
      {"id":"jp_kanzashi","slot":"head","name":"Канзаси","price":600,"tier":"rare","ico":"🌺","bots":false,"look":{"kind":"jp_kanzashi","flower":"#e68fb7","middle":"#f7d97e","cord":"#b4727a"}},
      {"id":"jp_fox_ears","slot":"head","name":"Ушки кицунэ","price":550,"tier":"rare","ico":"🦊","bots":false,"look":{"kind":"jp_ears","color":"#ce844c","inner":"#fff1d6","band":"#84644c"}},
      {"id":"jp_tenugui","slot":"head","name":"Тэнугуи","price":220,"tier":"common","ico":"🧺","bots":true,"look":{"kind":"jp_towel","color":"#fff4de","trim":"#547195"}},
      {"id":"jp_suzu","slot":"neck","name":"Колокольчик судзу","price":260,"tier":"common","ico":"🔔","bots":true,"look":{"kind":"jp_suzu","cord":"#c75157","gold":"#e9bc5f","ink":"#665244"}},
      {"id":"jp_waves","slot":"neck","name":"Шарф «Волны»","price":450,"tier":"rare","ico":"🌊","bots":false,"look":{"kind":"jp_waves","color":"#486489","trim":"#f8edd8"}},
      {"id":"jp_eri","slot":"neck","name":"Воротник кимоно","price":400,"tier":"rare","ico":"🤍","bots":false,"look":{"kind":"jp_eri","color":"#fff3df","trim":"#c95660"}},
      {"id":"jp_koban","slot":"neck","name":"Монетка кобан","price":300,"tier":"common","ico":"🪙","bots":false,"look":{"kind":"jp_koban","cord":"#c75157","gold":"#e9bc5f","ink":"#977340"}},
      {"id":"jp_fox_mask","slot":"face","name":"Маска кицунэ","price":650,"tier":"rare","ico":"🎭","bots":false,"look":{"kind":"jp_mask","color":"#fff2df","red":"#c85860","ink":"#66494c"}},
      {"id":"jp_sensei","slot":"face","name":"Очки «Сэнсэй»","price":280,"tier":"common","ico":"👓","bots":false,"look":{"kind":"jp_specs","color":"#485970","bridge":"#cfaa68"}},
      {"id":"jp_cheeks","slot":"face","name":"Наклейки «Сакура»","price":200,"tier":"common","ico":"🌸","bots":false,"look":{"kind":"jp_cheeks","flower":"#df93ad","middle":"#ffe6c7"}},
      {"id":"jp_yukata","slot":"body","name":"Юката «Сакура»","price":650,"tier":"rare","ico":"👘","bots":false,"look":{"kind":"jp_garment","cut":"jp_yukata","color":"#d98fad","trim":"#fff0d8","belt":"#b64d65","motif":"#fff0d8"}},
      {"id":"jp_happi","slot":"body","name":"Хаппи «Праздник»","price":550,"tier":"rare","ico":"🎐","bots":false,"look":{"kind":"jp_garment","cut":"jp_happi","color":"#4f6c9e","trim":"#fff0d8","belt":"#d88b76","motif":"#fff0d8"}},
      {"id":"jp_koi","slot":"body","name":"Костюм «Карп кои»","price":1200,"tier":"epic","ico":"🎏","bots":false,"look":{"kind":"jp_garment","cut":"jp_koi","color":"#fff1dc","trim":"#e39354","belt":"#df8753","motif":"#66575c"}},
      {"id":"jp_ninja","slot":"body","name":"Костюм «Ниндзя-Пу»","price":600,"tier":"rare","ico":"🥷","bots":true,"look":{"kind":"jp_garment","cut":"jp_ninja","color":"#333e53","trim":"#cf5b68","belt":"#dc596a","motif":"#b5b4b0"}},
      {"id":"jp_tanuki","slot":"body","name":"Костюм «Тануки»","price":1200,"tier":"epic","ico":"🦝","bots":false,"look":{"kind":"jp_garment","cut":"jp_tanuki","color":"#a17c60","trim":"#efd9b6","belt":"#735a4b","motif":"#513d34"}},
      {"id":"jp_wagasa","slot":"back","name":"Складной вагаса","price":600,"tier":"rare","ico":"🌂","bots":false,"look":{"kind":"jp_wagasa","color":"#c7686e","rib":"#e9b9a2","wood":"#ae8855","strap":"#826559"}},
      {"id":"jp_daruma","slot":"back","name":"Рюкзак-дарума","price":650,"tier":"rare","ico":"🎒","bots":false,"look":{"kind":"jp_daruma","color":"#c45c60","face":"#fff0d6","gold":"#e7bd68","ink":"#514244","strap":"#876455"}},
      {"id":"jp_maneki","slot":"back","name":"Пассажир «Манэки-нэко»","price":2200,"tier":"dream","ico":"🐱","bots":false,"look":{"kind":"jp_maneki","color":"#fff0d8","red":"#ca6268","gold":"#e8bd63","ink":"#594745","pad":"#c76770"}},
      {"id":"jp_uchiwa","slot":"tail","name":"Веер утива","price":320,"tier":"common","ico":"🪭","bots":false,"look":{"kind":"jp_fan","color":"#fff0d9","motif":"#557197","wood":"#c29a60"}},
      {"id":"jp_chochin","slot":"tail","name":"Фонарик тётин","price":450,"tier":"rare","ico":"🏮","bots":false,"look":{"kind":"jp_lantern","color":"#d8787b","rib":"#f5d7b2","cap":"#66524b"}},
      {"id":"jp_fox_charm","slot":"tail","name":"Подвеска «Лисий хвостик»","price":650,"tier":"rare","ico":"🦊","bots":false,"look":{"kind":"jp_foxcharm","color":"#d87735","tip":"#fff0d7","cord":"#87614c"}},
      {"id":"jp_geta","slot":"paws","name":"Гэта","price":500,"tier":"rare","ico":"🩴","bots":false,"look":{"kind":"shoes","style":"jp_geta","color":"#c99760","sole":"#9c704b","trim":"#c85561"}},
      {"id":"jp_tabi","slot":"paws","name":"Таби","price":240,"tier":"common","ico":"🧦","bots":false,"look":{"kind":"shoes","style":"jp_tabi","color":"#edf4ff","sole":"#cfdbed","trim":"#3863a5"}},
      {"id":"jp_matcha","slot":"coat","name":"Матча-латте","price":400,"tier":"rare","ico":"🍵","bots":false,"look":{"kind":"coat","coat":"#a8ba78","light":"#fff2d6","ear":"#809451"}},
      {"id":"jp_mochi","slot":"coat","name":"Сакура-моти","price":450,"tier":"rare","ico":"🍡","bots":false,"look":{"kind":"coat","coat":"#f0bacb","light":"#fff4e7","ear":"#9cac70"}},
      {"id":"jp_petals","slot":"trail","name":"Рывок «Сакура»","price":400,"tier":"rare","ico":"🌸","bots":false,"look":{"kind":"trail","fx":"sakura"}},
      {"id":"jp_origami","slot":"trail","name":"Рывок «Оригами»","price":1200,"tier":"epic","ico":"🕊️","bots":false,"look":{"kind":"trail","fx":"origami"}},
      { id: 'bow', slot: 'head', name: 'Бант «Клубника»', price: 120, tier: 'common', ico: '🎀', bots: true, look: { kind: 'bow', color: '#ff6f9f', knot: '#ff4f86', dots: '#ffffff' } },
      { id: 'daisy', slot: 'head', name: 'Ромашка', price: 160, tier: 'common', ico: '🌼', bots: true, look: { kind: 'daisy' } },
      { id: 'beret', slot: 'head', name: 'Мятный берет', price: 260, tier: 'common', ico: '🫐', bots: true, look: { kind: 'beret', color: '#8fe3c4' } },
      { id: 'chef', slot: 'head', name: 'Колпак повара', price: 360, tier: 'rare', ico: '👨‍🍳', look: { kind: 'chef', band: '#ff6b6b' } },
      { id: 'party', slot: 'head', name: 'Праздничный колпачок', price: 450, tier: 'rare', ico: '🥳', bots: true, look: { kind: 'party', color: '#c9b5ff', ring2: '#8fe3c4', top: '#ff6fae' } },
      { id: 'bunny_ears', slot: 'head', name: 'Ушки «Зайка»', price: 400, tier: 'rare', ico: '🐰', look: { kind: 'bunny' } },
      { id: 'clover_wreath', slot: 'head', name: 'Венок «Клевер»', price: 450, tier: 'rare', ico: '☘️', bots: true, look: { kind: 'clover' } },
      { id: 'ushanka', slot: 'head', name: 'Ушанка «Снежок»', price: 550, tier: 'rare', ico: '🧢', look: { kind: 'ushanka' } },
      { id: 'cupcake_crown', slot: 'head', name: 'Корона «Кексик»', price: 2600, tier: 'dream', ico: '🧁', look: { kind: 'cupcake' } },
      { id: 'tiara', slot: 'head', name: 'Тиара «Годовщина»', price: 2000, tier: 'dream', ico: '👑', look: { kind: 'tiara', gem: '#3cc9c0' } },
      { id: 'heart', slot: 'neck', name: 'Ошейник-сердечко', price: 100, tier: 'common', ico: '💗', bots: true, look: { kind: 'collar', color: '#ff7a7a', charm: 'heart', charmColor: '#ffd34d' } },
      { id: 'bandana', slot: 'neck', name: 'Бандана «Пикник»', price: 180, tier: 'common', ico: '🧣', bots: true, look: { kind: 'bandana', color: '#8fdcb8' } },
      { id: 'bowtie', slot: 'neck', name: 'Бабочка «Джентльпу»', price: 220, tier: 'common', ico: '🎩', bots: true, look: { kind: 'collar', color: '#4a6fd8', charm: 'bowtie', charmColor: '#6fb8ff' } },
      { id: 'ribbon_bell', slot: 'neck', name: 'Ленточка с бубенчиком', price: 150, tier: 'common', ico: '🔔', bots: true, look: { kind: 'ribbon' } },
      { id: 'ruff', slot: 'neck', name: 'Жабо «Пушкин»', price: 250, tier: 'common', ico: '🤍', look: { kind: 'ruff' } },
      { id: 'tartan_scarf', slot: 'neck', name: 'Шарф «Пледик»', price: 400, tier: 'rare', ico: '🧣', look: { kind: 'scarf' } },
      { id: 'sailor', slot: 'neck', name: 'Матросский воротник', price: 320, tier: 'rare', ico: '⚓', look: { kind: 'sailor' } },
      { id: 'bloom', slot: 'neck', name: 'Цветочный воротничок', price: 420, tier: 'rare', ico: '🌸', look: { kind: 'bloom' } },
      { id: 'brush_moustache', slot: 'face', name: 'Усы «Профессор Пу»', price: 200, tier: 'common', ico: '🥸', look: { kind: 'moustache' } },
      { id: 'heart_frames', slot: 'face', name: 'Очки «Сердечки»', price: 450, tier: 'rare', ico: '💗', look: { kind: 'hearts' } },
      { id: 'specs', slot: 'face', name: 'Очки «Умница»', price: 500, tier: 'rare', ico: '👓', look: { kind: 'specs', color: '#6b3f2a' } },
      { id: 'dress', slot: 'body', name: 'Платье «Горошек»', price: 400, tier: 'rare', ico: '👗', look: { kind: 'garment', cut: 'dress', color: '#ff9a9a', dots: '#fff4e8' } },
      { id: 'raincape', slot: 'body', name: 'Дождевик «Лимон»', price: 500, tier: 'rare', ico: '🧥', look: { kind: 'garment', cut: 'cape', color: '#ffd84a', trim: '#f2a900' } },
      { id: 'bee', slot: 'body', name: 'Костюм «Пчёлка»', price: 600, tier: 'rare', ico: '🐝', look: { kind: 'garment', cut: 'bee', color: '#ffc83d', stripe: '#5a3a22' } },
      { id: 'apron', slot: 'body', name: 'Попона «Печенька»', price: 320, tier: 'common', ico: '🍪', look: { kind: 'garment', cut: 'blanket', color: '#9fd4ff', trim: '#ffffff', pocket: '#d9a05b' } },
      { id: 'reindeer_knit', slot: 'body', name: 'Свитер «Оленёнок»', price: 650, tier: 'rare', ico: '🦌', look: { kind: 'garment', cut: 'knit', color: '#d94a42', trim: '#fff1dc' } },
      { id: 'frog_suit', slot: 'body', name: 'Костюм «Лягушонок»', price: 1200, tier: 'epic', ico: '🐸', look: { kind: 'garment', cut: 'frog', color: '#6cbf5a', belly: '#d8f08a', eye: '#ffffff', pupil: '#3a2418' } },
      { id: 'hero_cape', slot: 'body', name: 'Плащ «Супер-Пу»', price: 1200, tier: 'epic', ico: '🦸', look: { kind: 'garment', cut: 'hero', color: '#e8485e', emblem: '#ffc83d', button: '#ffc83d' } },
      { id: 'picnic_pack', slot: 'back', name: 'Корзинка «На пикник»', price: 450, tier: 'rare', ico: '🧺', look: { kind: 'picnic' } },
      { id: 'satchel', slot: 'back', name: 'Рюкзачок «Печенье»', price: 600, tier: 'rare', ico: '🎒', look: { kind: 'satchel' } },
      { id: 'turtle_pack', slot: 'back', name: 'Рюкзак «Черепашка»', price: 650, tier: 'rare', ico: '🐢', look: { kind: 'turtle' } },
      { id: 'bunny_saddle', slot: 'back', name: 'Пассажир «Зайчонок»', price: 3000, tier: 'dream', ico: '🐇', look: { kind: 'saddle' } },
      { id: 'wings', slot: 'back', name: 'Крылышки «Фея»', price: 2200, tier: 'dream', ico: '🧚', look: { kind: 'wings' } },
      { id: 'pompom', slot: 'tail', name: 'Помпон «Малина»', price: 150, tier: 'common', ico: '🩷', bots: true, look: { kind: 'pompom', color: '#ff4fa3' } },
      { id: 'tail_bow', slot: 'tail', name: 'Бантик «Хвостик»', price: 150, tier: 'common', ico: '🎀', bots: true, look: { kind: 'tailbow', color: '#7fb6ff', knot: '#5a9cf0' } },
      { id: 'tail_carrot', slot: 'tail', name: 'Морковка на хвосте', price: 150, tier: 'common', ico: '🥕', look: { kind: 'carrot' } },
      { id: 'duck', slot: 'tail', name: 'Уточка на хвосте', price: 350, tier: 'rare', ico: '🐤', look: { kind: 'duck' } },
      { id: 'pinwheel', slot: 'tail', name: 'Вертушка', price: 450, tier: 'rare', ico: '🍭', look: { kind: 'pinwheel' } },
      { id: 'tail_lantern', slot: 'tail', name: 'Фонарик «Светлячок»', price: 500, tier: 'rare', ico: '🏮', look: { kind: 'lantern' } },
      { id: 'boots', slot: 'paws', name: 'Сапожки «Солнышко»', price: 250, tier: 'common', ico: '🥾', look: { kind: 'boots', color: '#ffd23f' } },
      { id: 'slippers', slot: 'paws', name: 'Тапочки «Зефир»', price: 300, tier: 'common', ico: '🩰', look: { kind: 'boots', color: '#ffb3d6' } },
      { id: 'petalboots', slot: 'paws', name: 'Сапожки «Лепестки»', price: 400, tier: 'rare', ico: '💜', look: { kind: 'boots', color: '#a98bff' } },
      { id: 'felt_boots', slot: 'paws', name: 'Валенки «Тёплые лапки»', price: 300, tier: 'common', ico: '🧦', look: { kind: 'shoes', style: 'felt', color: '#a9a9b0', sole: '#fff4e6', trim: '#ff5a5a' } },
      { id: 'sneakers', slot: 'paws', name: 'Кеды «Топ-топ»', price: 450, tier: 'rare', ico: '👟', look: { kind: 'shoes', style: 'sneakers', color: '#ff7b72' } },
      { id: 'flippers', slot: 'paws', name: 'Ласты «Плюх»', price: 1200, tier: 'epic', ico: '🦆', look: { kind: 'shoes', style: 'flippers', color: '#ffd84a', trim: '#f2b631' } },
      { id: 'strawberry', slot: 'coat', name: 'Клубничное суфле', price: 300, tier: 'common', ico: '🍓', look: { kind: 'coat', coat: '#f7b4c6', light: '#fff1ea', ear: '#e98aa6' } },
      { id: 'lavender', slot: 'coat', name: 'Лавандовое молоко', price: 300, tier: 'common', ico: '🪻', look: { kind: 'coat', coat: '#cdb8f0', light: '#f6f0ff', ear: '#a98fd8' } },
      { id: 'mint', slot: 'coat', name: 'Мятный зефир', price: 300, tier: 'common', ico: '🌿', look: { kind: 'coat', coat: '#a9e6cf', light: '#fbf6e8', ear: '#fff1d6' } },
      { id: 'cocoa', slot: 'coat', name: 'Какао со сливками', price: 250, tier: 'common', ico: '☕', look: { kind: 'coat', coat: '#8a5a44', light: '#fbe9d4', ear: '#6a3f2e' } },
      { id: 'peach', slot: 'coat', name: 'Персиковый йогурт', price: 250, tier: 'common', ico: '🍑', look: { kind: 'coat', coat: '#ffc29a', light: '#fff0de', ear: '#f19c6c' } },
      { id: 'cloud', slot: 'coat', name: 'Серебряное облачко', price: 450, tier: 'rare', ico: '☁️', look: { kind: 'coat', coat: '#d9dde6', light: '#ffffff', ear: '#b4bccb' } },
      { id: 'marble_coat', slot: 'coat', name: 'Шёрстка «Мраморный кекс»', price: 1200, tier: 'epic', ico: '🍰', look: { kind: 'coat', coat: '#fbeedd', light: '#fffaf2', ear: '#8a5a3c', spots: ['#8a5a3c', '#e9b46e'] } },
      { id: 'crumbs', slot: 'trail', name: 'Крошки радости', price: 150, tier: 'common', ico: '🍪', look: { kind: 'trail', fx: 'crumbs' } },
      { id: 'hearts', slot: 'trail', name: 'Сердечки', price: 250, tier: 'common', ico: '💕', look: { kind: 'trail', fx: 'hearts' } },
      { id: 'petals', slot: 'trail', name: 'Лепестки', price: 350, tier: 'common', ico: '🌷', look: { kind: 'trail', fx: 'petals' } },
      { id: 'snow_trail', slot: 'trail', name: 'Рывок «Снежинки»', price: 200, tier: 'common', ico: '❄️', look: { kind: 'trail', fx: 'snow' } },
      { id: 'leaf_trail', slot: 'trail', name: 'Рывок «Листопад»', price: 250, tier: 'common', ico: '🍂', look: { kind: 'trail', fx: 'leaves' } },
      { id: 'bubbles', slot: 'trail', name: 'Мыльные пузыри', price: 400, tier: 'rare', ico: '🫧', look: { kind: 'trail', fx: 'bubbles' } },
      { id: 'stars', slot: 'trail', name: 'Звёздная пыль', price: 450, tier: 'rare', ico: '⭐', look: { kind: 'trail', fx: 'stars' } },
      { id: 'rainbow', slot: 'trail', name: 'Радужный рывок', price: 2400, tier: 'dream', ico: '🌈', look: { kind: 'trail', fx: 'rainbow' } },
      // Maps: the season of the meadow. Summer is everyone's from the start (price 0 = owned).
      { id: 'summer', slot: 'world', name: 'Лето', price: 0, tier: 'common', ico: '☀️', world: 'summer' },
      { id: 'autumn', slot: 'world', name: 'Осень', price: 800, tier: 'rare', ico: '🍂', world: 'autumn' },
      { id: 'winter', slot: 'world', name: 'Зима', price: 1000, tier: 'rare', ico: '❄️', world: 'winter' },
      { id: 'spring', slot: 'world', name: 'Весна', price: 1200, tier: 'rare', ico: '🌸', world: 'spring' },
      { id:'sakura',slot:'world',name:'Сакура вечером',price:1400,tier:'rare',ico:'🌸',world:'sakura' },
      { id:'italy',slot:'world',name:'Тосканский полдень',price:1600,tier:'rare',ico:'🌿',world:'italy' },
      { id:'kyoto',slot:'world',name:'Улочки Киото',price:1800,tier:'rare',ico:'🏮',world:'kyoto' },
    ],
  },
};
