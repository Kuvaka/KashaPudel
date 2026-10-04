// Cookie bank and wardrobe: what was collected, bought and worn. Everything that changes the
// profile goes through here. Rules: nothing bought is ever lost (unknown ids are kept, a broken
// or newer save is never silently replaced), cookies are credited while racing so closing the
// game mid-race keeps them, and a race pays out once.
//
// Storage is one small JSON in localStorage. Every change runs under one Web Lock (Safari 15.4+)
// and is applied to a fresh read of the save, so two tabs can't write over each other's
// purchases; `revision` + the 'storage' event keep the screen of the other tab up to date.
// Changes are async: the UI confirms a purchase only after it was saved.
const KEY = 'kf_wardrobe', PREV = 'kf_wardrobe_prev', UNDO = 'kf_wardrobe_undo', VERSION = 1;
export const SLOTS = ['head', 'face', 'neck', 'body', 'back', 'tail', 'paws', 'coat', 'trail'];

const fresh = (gift) => ({
  v: VERSION, app: 'kashafish', revision: 0, cookies: gift, total: gift,
  owned: [], worn: {}, grants: { starter: true }, run: null,
});

function valid(p) {
  return p && p.app === 'kashafish' && Number.isInteger(p.v) && Number.isFinite(p.cookies) && Array.isArray(p.owned);
}

// Fill fields a later version added; never drop owned ids or cookies.
function normalize(p) {
  p.cookies = Math.max(0, Math.floor(p.cookies));
  p.total = Math.max(p.total | 0, p.cookies);
  p.owned = [...new Set(p.owned.filter((x) => typeof x === 'string'))];
  p.worn = p.worn && typeof p.worn === 'object' ? p.worn : {};
  for (const s of Object.keys(p.worn)) if (!p.owned.includes(p.worn[s])) delete p.worn[s];
  p.grants = p.grants || {};
  p.revision = p.revision | 0;
  return p;
}

// Short checksum for export strings: catches a truncated copy-paste, not tampering.
function sum(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}
const b64 = (s) => btoa(unescape(encodeURIComponent(s)));
const unb64 = (s) => decodeURIComponent(escape(atob(s)));

export class Wallet {
  constructor(gift = 200) {
    this.gift = gift;
    this.state = 'ok';      // 'ok' | 'new' | 'corrupt' | 'future' | 'nostorage'
    this.readOnly = false;  // corrupt/future save: play, but never write over it
    this.listeners = new Set();
    this.p = this.read();
    this.persistAsked = false;
    try {
      addEventListener('storage', (e) => {
        if (e.key !== KEY || !e.newValue) return;
        try {
          const q = JSON.parse(e.newValue);
          if (valid(q) && q.v <= VERSION && q.revision > this.p.revision) { this.p = normalize(q); this.emit(); }
        } catch {}
      });
    } catch {}
  }

  read() {
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch { this.state = 'nostorage'; return fresh(this.gift); }
    if (raw === null) {
      this.state = 'new'; const p = fresh(this.gift);
      try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {}
      return p;
    }
    try {
      const p = JSON.parse(raw);
      if (!valid(p)) throw new Error('bad');
      if (p.v > VERSION) { this.state = 'future'; this.readOnly = true; return normalize(p); }
      if (p.v < VERSION) { try { localStorage.setItem(PREV, raw); } catch {} p.v = VERSION; }
      return normalize(p);
    } catch {
      // Keep the broken save untouched (and a copy), play on a temporary profile.
      this.state = 'corrupt'; this.readOnly = true;
      try { if (!localStorage.getItem(PREV)) localStorage.setItem(PREV, raw); } catch {}
      return fresh(0);
    }
  }

  // The save as it is now (another tab may have written since), or null if it can't be used.
  load() {
    let raw;
    try { raw = localStorage.getItem(KEY); } catch { return null; }
    if (raw === null) return this.p;
    let q = null;
    try { q = JSON.parse(raw); } catch {}
    if (valid(q) && q.v <= VERSION) { q.v = VERSION; return normalize(q); }
    return this.state === 'corrupt' && !this.readOnly ? this.p : null; // a broken save we chose to replace
  }

  // One change = fn(profile) on a fresh copy; kept only if it was saved. fn returns false to skip.
  // Resolves to fn's result (or true), or false if nothing was saved.
  change(fn) {
    const run = () => {
      if (this.readOnly) return false;
      const cur = this.load();
      if (!cur) return false;
      const p = JSON.parse(JSON.stringify(cur));
      const res = fn(p);
      if (res === false) return false;
      p.revision = (p.revision | 0) + 1;
      try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { return false; }
      this.p = p; this.state = 'ok';
      this.emit();
      return res ?? true;
    };
    try { if (navigator.locks) return navigator.locks.request('kashafish-wallet', run); } catch {}
    return Promise.resolve().then(run); // old Safari: same tab is still safe
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const fn of this.listeners) fn(this.p); }

  get cookies() { return this.p.cookies; }
  owns(id) { return this.p.owned.includes(id); }
  worn(slot) { return this.p.worn[slot] || null; }

  // --- Racing: credit cookies as they are eaten, close the run once at the finish ----------
  startRun() {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    this.change((p) => { p.run = { id, credited: 0, closed: false }; });
    return id;
  }

  // eaten: the player's running total for this race. Safe to call any number of times.
  credit(runId, eaten) {
    return this.change((p) => {
      const r = p.run;
      if (!r || r.id !== runId || r.closed || eaten <= r.credited) return false;
      const add = eaten - r.credited;
      r.credited = eaten; p.cookies += add; p.total += add;
      return add;
    }).then((x) => x || 0);
  }

  // Pays what's left of the cookies plus the finish bonus; a second call pays nothing.
  // Resolves to { eaten, bonus, cookies } or null.
  finish(runId, eaten, bonus) {
    return this.change((p) => {
      const r = p.run;
      if (!r || r.id !== runId || r.closed) return false;
      const rest = Math.max(0, eaten - r.credited);
      r.credited = Math.max(eaten, r.credited); r.closed = true;
      p.cookies += rest + bonus; p.total += rest + bonus;
      return { eaten, bonus, cookies: p.cookies };
    }).then((x) => x || null);
  }

  // --- Wardrobe ----------------------------------------------------------------------------
  // Resolves to 'ok' | 'owned' | 'poor' | 'nosave'.
  buy(item, wear = true) {
    let why = 'nosave';
    return this.change((p) => {
      if (p.owned.includes(item.id)) { why = 'owned'; return false; }
      if (p.cookies < item.price) { why = 'poor'; return false; }
      p.cookies -= item.price;
      p.owned.push(item.id);
      if (wear) p.worn[item.slot] = item.id;
      if (p.wish === item.id) delete p.wish;
    }).then((ok) => ok ? 'ok' : why);
  }

  wear(slot, id) {
    return this.change((p) => {
      if (id && !p.owned.includes(id)) return false;
      if (id) p.worn[slot] = id; else delete p.worn[slot];
    });
  }

  // A dream item to save up for (free, reserves nothing): shown with what's left to collect.
  get wish() { return this.p.wish || null; }
  setWish(id) { return this.change((p) => { if (id) p.wish = id; else delete p.wish; }); }

  // Ask the browser not to evict the save (Safari 17+, heuristic). Result is informative only.
  async persist() {
    if (this.persistAsked) return this.persisted;
    this.persistAsked = true;
    try { this.persisted = await navigator.storage?.persist?.() ?? false; } catch { this.persisted = false; }
    return this.persisted;
  }

  // --- Backup: "KF1.<base64 json>.<checksum>" ----------------------------------------------
  exportCode() {
    const { cookies, total, owned, worn } = this.p;
    const body = b64(JSON.stringify({ v: VERSION, app: 'kashafish', at: new Date().toISOString(), cookies, total, owned, worn }));
    return `KF1.${body}.${sum(body)}`;
  }

  // Returns a preview { cookies, owned } or an error string; apply() merges it.
  parseCode(code) {
    const m = /^KF(\d+)\.([A-Za-z0-9+/=]+)\.([0-9a-z]+)$/.exec(String(code).trim().replace(/\s+/g, ''));
    if (!m) return 'Это не код копилки.';
    if (sum(m[2]) !== m[3]) return 'Код повреждён: скопируй его целиком.';
    try {
      const q = JSON.parse(unb64(m[2]));
      if (q.app !== 'kashafish' || !Array.isArray(q.owned) || !Number.isFinite(q.cookies)) return 'Код не от этой игры.';
      if (q.v > VERSION) return 'Код из более новой версии игры: обнови страницу.';
      return q;
    } catch { return 'Код повреждён: скопируй его целиком.'; }
  }

  // Merge: union of owned items, the larger balance; nothing current is lost.
  applyCode(q) {
    try { localStorage.setItem(UNDO, localStorage.getItem(KEY) ?? ''); } catch {} // the save as it was
    if (this.readOnly) { this.readOnly = false; this.state = 'corrupt'; this.p = fresh(0); } // replace the unreadable save
    return this.change((p) => {
      p.owned = [...new Set([...p.owned, ...q.owned.filter((x) => typeof x === 'string')])];
      p.cookies = Math.max(p.cookies, Math.floor(q.cookies));
      p.total = Math.max(p.total, q.total | 0, p.cookies);
      for (const [s, id] of Object.entries(q.worn || {})) if (!p.worn[s] && p.owned.includes(id)) p.worn[s] = id;
    });
  }
}
