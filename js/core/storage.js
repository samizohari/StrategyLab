/* core/storage.js — StorePort contract + implementations (localStorage / sessionStorage / memory) */
"use strict";

/**
 * StorePort (interface):
 *   get(key, def) -> parsed JSON value (or def)
 *   set(key, value) -> boolean   (value JSON-serialised)
 *   remove(key)
 *   getRaw(key) -> string|null
 *   setRaw(key, string) -> boolean
 *   size() -> approximate bytes
 * All storage implementations below satisfy this contract. Repositories depend
 * on this port only (dependency inversion).
 */

export class LocalStorageStore {
  constructor(prefix = "") { this.prefix = prefix; this._ls = typeof localStorage !== "undefined" ? localStorage : null; }
  _k(key) { return this.prefix + key; }
  get(key, def) {
    try {
      const v = this._ls.getItem(this._k(key));
      return v == null ? def : JSON.parse(v);
    } catch (e) { return def; }
  }
  set(key, value) { try { this._ls.setItem(this._k(key), JSON.stringify(value)); return true; } catch (e) { return false; } }
  remove(key) { try { this._ls.removeItem(this._k(key)); } catch (e) { /* ignore */ } }
  getRaw(key) { try { return this._ls.getItem(this._k(key)); } catch (e) { return null; } }
  setRaw(key, value) { try { this._ls.setItem(this._k(key), value); return true; } catch (e) { return false; } }
  size() {
    let t = 0;
    try {
      for (let i = 0; i < this._ls.length; i++) {
        const k = this._ls.key(i);
        if (k && k.indexOf(this.prefix) === 0) t += (this._ls.getItem(k) || "").length;
      }
    } catch (e) { /* ignore */ }
    return t;
  }
}

export class SessionStore extends LocalStorageStore {
  constructor(prefix = "") {
    super(prefix);
    this._ls = typeof sessionStorage !== "undefined" ? sessionStorage : null;
  }
}

export class MemoryStore {
  constructor() { this._m = new Map(); }
  get(key, def) {
    try { const v = this._m.get(key); return v == null ? def : JSON.parse(v); } catch (e) { return def; }
  }
  set(key, value) { this._m.set(key, JSON.stringify(value)); return true; }
  remove(key) { this._m.delete(key); }
  getRaw(key) { return this._m.has(key) ? this._m.get(key) : null; }
  setRaw(key, value) { this._m.set(key, String(value)); return true; }
  size() { let t = 0; for (const v of this._m.values()) t += v.length; return t; }
}
