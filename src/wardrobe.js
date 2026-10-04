// Wardrobe screen: try anything on for free in the 3D fitting room, buy with cookies, wear,
// take off. Purchases go through the Wallet; the fitting room is the renderer's Studio (3D only).
import { CONFIG } from './config.js';
import { sfx } from './audio.js';

const W = CONFIG.wardrobe;
const BY_ID = Object.fromEntries(W.items.map((i) => [i.id, i]));
const TIER = { common: 'Обычная', rare: 'Редкая', dream: 'Мечта' };
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const itemById = (id) => BY_ID[id];

// { slot: id } from the save → { slot: { id, look } } for DogVisual. Unknown ids are skipped
// (still owned, just not drawn by this version).
export function outfitOf(worn) {
  const out = {};
  for (const [slot, id] of Object.entries(worn || {})) { const it = BY_ID[id]; if (it) out[slot] = { id, look: it.look }; }
  return out;
}

// A rival's look for one race: one small cheap item, picked at random.
export function botOutfit() {
  const pool = W.items.filter((i) => i.bots);
  const it = pool[Math.floor(Math.random() * pool.length)];
  return { [it.slot]: { id: it.id, look: it.look } };
}

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

    const tabs = $('wr-tabs');
    tabs.innerHTML = W.tabs.map((t) => `<button data-slot="${t.slot}">${t.ico} ${esc(t.name)}</button>`).join('');
    tabs.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      this.tab = b.dataset.slot; this.sel = null; this.render();
      b.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
      $('wr-grid').scrollTop = 0;
    });
    $('wr-grid').addEventListener('click', (e) => {
      const c = e.target.closest('.card'); if (c) this.pick(c.dataset.id);
    });
    $('wr-act').addEventListener('click', () => this.act());
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
    if (this.sel === id && this.tryOn[it.slot] === id && !this.wallet.owns(id)) delete this.tryOn[it.slot]; // tap again: take it off
    else this.tryOn[it.slot] = id;
    this.sel = id;
    if (it.slot === 'trail' && this.studio && this.tryOn.trail) { this.studio.run = true; this.studio.yaw = 0.6; } // trails show on the dash, side on
    this.render();
  }

  async act() {
    const it = BY_ID[this.sel]; if (!it) return;
    const w = this.wallet, btn = $('wr-act');
    btn.disabled = true;
    try {
      if (!w.owns(it.id)) {
        if (w.cookies < it.price) { await w.setWish(w.wish === it.id ? null : it.id); return; }
        const res = await w.buy(it, true);
        if (res === 'ok') { this.tryOn[it.slot] = it.id; sfx.levelUp(0.3); this.flash(`Ура! ${it.name} теперь твоё`); }
        else if (res === 'nosave') this.flash('Не получилось сохранить. Попробуй ещё раз');
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
      b.classList.toggle('has', items.some((i) => w.owns(i.id)));
    }
    for (const b of this.el.querySelectorAll('[data-stage]')) b.classList.toggle('on', +b.dataset.stage === this.stage);
    $('wr-run').classList.toggle('on', !!this.studio?.run);

    $('wr-grid').innerHTML = W.items.filter((i) => i.slot === this.tab).map((i) => {
      const own = w.owns(i.id), cls = ['card', i.tier,
        own ? 'owned' : cookies < i.price ? 'poor' : '',
        w.worn(i.slot) === i.id ? 'worn' : '', this.sel === i.id ? 'sel' : '', w.wish === i.id ? 'wish' : ''].join(' ');
      const pr = own ? (w.worn(i.slot) === i.id ? 'надето' : 'есть ✓') : `🍪 ${i.price}`;
      return `<div class="${cls}" data-id="${i.id}"><div class="ico">${i.ico}</div><span class="nm">${esc(i.name)}</span><span class="pr">${pr}</span></div>`;
    }).join('');

    // Bottom bar: the selected item and what can be done with it.
    const it = BY_ID[this.sel], act = $('wr-act'), name = $('wr-name'), note = $('wr-note');
    const keep = performance.now() < (this.flashUntil ?? 0); // a 'bought!' message stays a moment
    act.classList.toggle('hidden', !it);
    if (!it) {
      name.textContent = W.tabs.find((t) => t.slot === this.tab).name;
      if (!keep) note.textContent = w.readOnly ? 'Сохранение не читается: восстанови копилку из кода ниже' : 'Нажми на вещь, чтобы примерить. Примерка бесплатная';
    } else {
      name.textContent = `${it.ico} ${it.name}`;
      const own = w.owns(it.id), lack = it.price - cookies;
      if (!keep) {
        note.textContent = own ? (w.worn(it.slot) === it.id ? 'Надето' : 'Куплено') + ' · ' + TIER[it.tier]
          : lack > 0 ? `${TIER[it.tier]} · не хватает ${lack} 🍪` + (w.wish === it.id ? ' · копим ⭐' : '')
          : `${TIER[it.tier]} · примеряешь`;
      }
      act.textContent = own ? (w.worn(it.slot) === it.id ? 'Снять' : 'Надеть')
        : lack > 0 ? (w.wish === it.id ? 'Не копить' : '⭐ Хочу') : `Купить за ${it.price} 🍪`;
      act.classList.toggle('buy', !own && lack <= 0);
    }
    if (this.studio) this.studio.dog.outfit = outfitOf(this.tryOn);
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
