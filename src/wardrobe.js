// Wardrobe screen: try anything on for free in the 3D fitting room, buy with cookies, wear,
// take off. Purchases go through the Wallet; the fitting room is the renderer's Studio (3D only).
import { CONFIG } from './config.js';
import { sfx } from './audio.js';
import { LOOKS } from './wallet.js';

const W = CONFIG.wardrobe;
const BY_ID = Object.fromEntries(W.items.map((i) => [i.id, i]));
const TIER = { common: 'Обычная', rare: 'Редкая', dream: 'Мечта' };
const LOOK_TAB = { slot: 'looks', ico: '👑', name: 'Образы' }; // saved outfits, first in the row
const TABS = [LOOK_TAB, ...W.tabs];
const noWorld = (o) => Object.keys(o || {}).filter((k) => k !== 'world');
const sameLook = (a, b) => {
  const ka = noWorld(a), kb = noWorld(b);
  return ka.length === kb.length && ka.every((k) => a[k] === b[k]);
};
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const itemById = (id) => BY_ID[id];
// The season of the race map: the chosen world item, summer when none.
export const worldOf = (worn) => BY_ID[worn?.world]?.world || 'summer';

// { slot: id } from the save → { slot: { id, look } } for DogVisual. Unknown ids are skipped
// (still owned, just not drawn by this version).
export function outfitOf(worn) {
  const out = {};
  for (const [slot, id] of Object.entries(worn || {})) { const it = BY_ID[id]; if (it?.look) out[slot] = { id, look: it.look }; }
  return out;
}

// A rival's look for one race: one small cheap item, picked at random.
export function botOutfit() {
  const pool = W.items.filter((i) => i.bots);
  const it = pool[Math.floor(Math.random() * pool.length)];
  return { [it.slot]: { id: it.id, look: it.look } };
}

const isFree = (it) => it.price === 0; // summer: everyone has it
const own = (w, it) => isFree(it) || w.owns(it.id);
const isWorn = (w, it) => (it.slot === 'world' ? w.worn('world') || 'summer' : w.worn(it.slot)) === it.id;

export class Wardrobe {
  constructor({ wallet, renderer, onClose }) {
    this.wallet = wallet;
    this.studio = renderer.studio ?? null; // null in the 2D game
    this.renderer = renderer;
    this.onClose = onClose;
    this.el = $('wardrobe');
    this.tab = W.tabs[0].slot;
    this.sel = null;
    this.tryOn = {};
    this.stage = 5;
    this.filter = 'all'; // 'all' | 'owned' | 'afford' (not bought yet, enough cookies)

    const tabs = $('wr-tabs');
    tabs.innerHTML = TABS.map((t) => `<button data-slot="${t.slot}">${t.ico} ${esc(t.name)}</button>`).join('');
    tabs.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (this.tab === 'looks' || b.dataset.slot === 'looks') this.tryOn = { ...this.wallet.p.worn }; // drop a previewed outfit
      if (this.tab === 'world') this.tryOn.world = this.wallet.p.worn.world; // leaving the maps: back to the chosen one
      this.tab = b.dataset.slot; this.sel = null; this.render();
      b.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
      $('wr-grid').scrollTop = 0;
    });
    $('wr-grid').addEventListener('click', (e) => {
      const c = e.target.closest('.card'); if (!c) return;
      if (c.dataset.look !== undefined) this.pickLook(+c.dataset.look); else this.pick(c.dataset.id);
    });
    $('wr-filter').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      this.filter = b.dataset.f; this.render(); $('wr-grid').scrollTop = 0;
    });
    $('wr-act').addEventListener('click', () => this.act());
    $('wr-save').addEventListener('click', () => this.saveLook());
    $('wr-back').addEventListener('click', () => this.close());
    for (const b of this.el.querySelectorAll('[data-stage]')) {
      b.addEventListener('click', () => { this.stage = +b.dataset.stage; this.studio?.setStage(this.stage); this.render(); });
    }
    $('wr-run').addEventListener('click', () => { if (this.studio) { this.studio.run = !this.studio.run; this.render(); } });
    $('wr-backup').addEventListener('click', () => this.openBackup());
    this.dragRotate($('wr-preview'));
    this.initBackup();
    wallet.on(() => { if (this.isOpen) this.render(); });
  }

  get isOpen() { return !this.el.classList.contains('hidden'); }

  open() {
    this.tryOn = { ...this.wallet.p.worn };
    this.sel = null;
    this.el.classList.remove('hidden');
    $('wr-no3d').classList.toggle('hidden', !!this.studio);
    $('wr-tools').classList.toggle('hidden', !this.studio);
    if (this.studio) {
      this.studio.active = true;
      this.studio.setStage(this.stage);
      this.studio.yaw = -0.5;
      this.layout();
    }
    this.render();
    this.wallet.persist();
  }

  close() {
    this.el.classList.add('hidden');
    $('backup').classList.add('hidden');
    if (this.studio) { this.studio.active = false; this.studio.run = false; }
    this.onClose?.();
  }

  // The dog fills the part of the screen above (or left of) the card sheet.
  layout() {
    if (!this.studio || !this.isOpen) return;
    const r = $('wr-preview').getBoundingClientRect();
    this.studio.rect = { x: r.left, y: r.top + 52, w: r.width, h: Math.max(60, r.height - 100) }; // below the title, above the pills
  }

  dragRotate(el) {
    let x0 = null, yaw0 = 0;
    el.addEventListener('pointerdown', (e) => {
      if (!this.studio || e.target.closest('button')) return;
      x0 = e.clientX; yaw0 = this.studio.yaw; el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => { if (x0 !== null) this.studio.yaw = yaw0 + (e.clientX - x0) * 0.012; });
    const end = () => { x0 = null; };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  }

  pick(id) {
    const it = BY_ID[id]; if (!it) return;
    if (this.sel === id && this.tryOn[it.slot] === id && !own(this.wallet, it)) delete this.tryOn[it.slot]; // tap again: take it off
    else this.tryOn[it.slot] = id;
    this.sel = id;
    if (it.slot === 'trail' && this.studio && this.tryOn.trail) { this.studio.run = true; this.studio.yaw = 0.6; } // trails show on the dash, side on
    this.render();
  }

  // Saved outfits: tapping one shows it on the dog; an empty one shows what would be saved.
  pickLook(i) {
    const l = this.wallet.look(i);
    this.sel = 'look:' + i;
    this.tryOn = {};
    for (const [s, id] of Object.entries(l || this.wallet.p.worn)) if (this.wallet.owns(id)) this.tryOn[s] = id;
    this.render();
  }

  get lookSel() { return this.sel?.startsWith('look:') ? +this.sel.slice(5) : null; }

  async saveLook() {
    const i = this.lookSel; if (i === null) return;
    if (await this.wallet.saveLook(i)) {
      this.tryOn = { ...this.wallet.p.worn };
      sfx.levelUp(0.2); this.flash(`Образ ${i + 1} запомнен`);
    } else this.flash('Не получилось сохранить. Попробуй ещё раз');
    this.render();
  }

  async act() {
    const li = this.lookSel;
    if (li !== null) {
      if (!this.wallet.look(li)) return this.saveLook();
      if (await this.wallet.wearLook(li)) { this.tryOn = { ...this.wallet.p.worn }; this.flash(`Надет образ ${li + 1}`); }
      return this.render();
    }
    const it = BY_ID[this.sel]; if (!it) return;
    const w = this.wallet, btn = $('wr-act');
    btn.disabled = true;
    try {
      if (!own(w, it)) {
        if (w.cookies < it.price) { await w.setWish(w.wish === it.id ? null : it.id); return; }
        const res = await w.buy(it, true);
        if (res === 'ok') { this.tryOn[it.slot] = it.id; sfx.levelUp(0.3); this.flash(it.slot === 'world' ? `Ура! Новая карта: ${it.name}` : `Ура! ${it.name} теперь твоё`); }
        else if (res === 'nosave') this.flash('Не получилось сохранить. Попробуй ещё раз');
      } else if (it.slot === 'world') {
        if (await w.wear('world', isFree(it) ? null : it.id)) this.tryOn.world = it.id;
      } else if (w.worn(it.slot) === it.id) {
        if (await w.wear(it.slot, null)) delete this.tryOn[it.slot];
      } else if (await w.wear(it.slot, it.id)) this.tryOn[it.slot] = it.id;
    } finally { btn.disabled = false; this.render(); }
  }

  flash(text) {
    this.flashUntil = performance.now() + 1800;
    $('wr-note').textContent = text;
    clearTimeout(this.flashT); this.flashT = setTimeout(() => this.render(), 1850);
  }

  render() {
    const w = this.wallet, cookies = w.cookies;
    for (const b of $('wr-tabs').children) {
      const slot = b.dataset.slot, items = W.items.filter((i) => i.slot === slot);
      b.classList.toggle('on', slot === this.tab);
      b.classList.toggle('has', slot === 'looks' ? w.p.looks.some(Boolean) : items.some((i) => w.owns(i.id)));
    }
    for (const b of this.el.querySelectorAll('[data-stage]')) b.classList.toggle('on', +b.dataset.stage === this.stage);
    $('wr-run').classList.toggle('on', !!this.studio?.run);

    $('wr-save').classList.add('hidden');
    $('wr-filter').classList.toggle('hidden', this.tab === 'looks');
    if (this.tab === 'looks') return this.renderLooks();

    const inTab = W.items.filter((i) => i.slot === this.tab);
    const FILTERS = { all: () => true, owned: (i) => own(w, i), afford: (i) => !own(w, i) && cookies >= i.price };
    for (const b of $('wr-filter').children) {
      const n = inTab.filter(FILTERS[b.dataset.f]).length;
      b.classList.toggle('on', b.dataset.f === this.filter);
      b.innerHTML = `${{ all: 'Все', owned: 'Куплено', afford: 'Доступно' }[b.dataset.f]} <i>${n}</i>`;
    }
    const shown = inTab.filter(FILTERS[this.filter]);
    const none = this.filter === 'owned' ? 'Тут пока ничего не куплено'
      : inTab.every((i) => own(w, i)) ? 'Здесь уже всё куплено 🎉' : 'Пока не хватает печенья. Беги за 🍪!';
    $('wr-grid').innerHTML = shown.length ? shown.map((i) => {
      const has = own(w, i), on = isWorn(w, i), cls = ['card', i.tier,
        has ? 'owned' : cookies < i.price ? 'poor' : '',
        on ? 'worn' : '', this.sel === i.id ? 'sel' : '', w.wish === i.id ? 'wish' : ''].join(' ');
      const pr = has ? (on ? (i.slot === 'world' ? 'выбрано' : 'надето') : 'есть ✓') : `🍪 ${i.price}`;
      return `<div class="${cls}" data-id="${i.id}"><div class="ico">${i.ico}</div><span class="nm">${esc(i.name)}</span><span class="pr">${pr}</span></div>`;
    }).join('') : `<p class="wr-empty">${none}</p>`;

    // Bottom bar: the selected item and what can be done with it.
    const it = BY_ID[this.sel], act = $('wr-act'), name = $('wr-name'), note = $('wr-note');
    const keep = performance.now() < (this.flashUntil ?? 0); // a 'bought!' message stays a moment
    act.classList.toggle('hidden', !it);
    if (!it) {
      name.textContent = TABS.find((t) => t.slot === this.tab).name;
      if (!keep) note.textContent = w.readOnly ? 'Сохранение не читается: восстанови копилку из кода ниже'
        : this.tab === 'world' ? 'Время года на поляне: снег, листопад или весенние лужи' : 'Нажми на вещь, чтобы примерить. Примерка бесплатная';
    } else {
      name.textContent = `${it.ico} ${it.name}`;
      const has = own(w, it), on = isWorn(w, it), lack = it.price - cookies, map = it.slot === 'world';
      const tier = map ? 'Карта' : TIER[it.tier];
      if (!keep) {
        note.textContent = has ? (on ? (map ? 'Следующая гонка здесь' : 'Надето') : 'Куплено') + ' · ' + tier
          : lack > 0 ? `${tier} · не хватает ${lack} 🍪` + (w.wish === it.id ? ' · копим ⭐' : '')
          : `${tier} · ${map ? 'смотришь' : 'примеряешь'}`;
      }
      act.textContent = has ? (on ? (map ? 'Выбрано ✓' : 'Снять') : (map ? 'Выбрать' : 'Надеть'))
        : lack > 0 ? (w.wish === it.id ? 'Не копить' : '⭐ Хочу') : `Купить за ${it.price} 🍪`;
      act.classList.toggle('buy', !has && lack <= 0);
      act.classList.toggle('hidden', map && has && on);
    }
    if (this.studio) { this.studio.dog.outfit = outfitOf(this.tryOn); this.studio.setSeason(worldOf(this.tryOn)); }
  }

  renderLooks() {
    const w = this.wallet, worn = w.p.worn, li = this.lookSel;
    $('wr-grid').innerHTML = Array.from({ length: LOOKS }, (_, i) => {
      const l = w.look(i), on = !!l && sameLook(l, worn);
      const icons = l ? Object.values(l).map((id) => BY_ID[id]?.ico).filter(Boolean) : [];
      const cls = ['card', 'look', on ? 'worn' : '', li === i ? 'sel' : ''].join(' ');
      const ico = l ? `<div class="ico${icons.length > 2 ? ' many' : ''}">${icons.slice(0, 6).join('')}</div>` : '<div class="ico">➕</div>';
      return `<div class="${cls}" data-look="${i}">${ico}<span class="nm">Образ ${i + 1}</span><span class="pr">${on ? 'надето' : l ? 'вещей: ' + Object.keys(l).length : 'пусто'}</span></div>`;
    }).join('');

    const act = $('wr-act'), save = $('wr-save'), name = $('wr-name'), note = $('wr-note');
    const keep = performance.now() < (this.flashUntil ?? 0), empty = !Object.keys(worn).length;
    act.classList.remove('buy');
    if (li === null) {
      name.textContent = 'Образы';
      act.classList.add('hidden');
      if (!keep) note.textContent = 'Запомни до трёх нарядов и переодевайся в одно касание';
    } else {
      const l = w.look(li), on = !!l && sameLook(l, worn);
      name.textContent = `👑 Образ ${li + 1}`;
      act.classList.toggle('hidden', on || (!l && empty));
      act.textContent = l ? 'Надеть' : '💾 Запомнить';
      save.classList.toggle('hidden', !l || on || empty);
      if (!keep) {
        note.textContent = on ? 'Надето сейчас'
          : l ? '💾 запомнит сюда то, что надето сейчас'
          : empty ? 'Сначала надень вещи, потом запомни их здесь' : 'Запомнит то, что надето сейчас';
      }
    }
    if (this.studio) { this.studio.dog.outfit = outfitOf(this.tryOn); this.studio.setSeason(worldOf(this.tryOn)); }
  }

  // --- Backup code ----------------------------------------------------------------------------
  initBackup() {
    const code = $('bk-code'), msg = $('bk-msg');
    $('bk-copy').addEventListener('click', async () => {
      code.value = this.wallet.exportCode();
      try { await navigator.clipboard.writeText(code.value); msg.textContent = 'Скопировано. Сохрани код в Заметках'; }
      catch { code.select(); msg.textContent = 'Выдели код и скопируй его'; }
    });
    $('bk-restore').addEventListener('click', async () => {
      const q = this.wallet.parseCode(code.value);
      if (typeof q === 'string') { msg.textContent = q; return; }
      const ok = await this.wallet.applyCode(q);
      msg.textContent = ok ? `Готово! В копилке ${this.wallet.cookies} 🍪, вещей: ${this.wallet.p.owned.length}` : 'Не получилось сохранить. Попробуй ещё раз';
      if (ok) { this.tryOn = { ...this.wallet.p.worn }; this.render(); }
    });
    $('bk-close').addEventListener('click', () => $('backup').classList.add('hidden'));
  }

  openBackup() {
    $('bk-code').value = this.wallet.readOnly ? '' : this.wallet.exportCode();
    $('bk-msg').textContent = this.wallet.readOnly ? 'Вставь сюда сохранённый код' : '';
    $('backup').classList.remove('hidden');
  }
}
