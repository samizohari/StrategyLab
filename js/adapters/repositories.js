/* adapters/repositories.js — persistence repositories over StorePort (dependency inversion).
   Each class implements a narrow repository contract consumed by services.
   Key names stay identical to the previous single-file app (gpb_*) so existing
   browser data remains compatible. */
"use strict";

class BaseRepo {
  constructor(store, key) { this.store = store; this.key = key; }
  _all(def) { return this.store.get(this.key, def); }
  _save(value) { return this.store.set(this.key, value); }
}

export class UsersRepo extends BaseRepo {
  constructor(store) { super(store, "gpb_users"); }
  all() { return this._all([]); }
  save(users) { this._save(users); }
  byId(id) { return this.all().find(u => u.id === id) || null; }
  byName(name) {
    const n = String(name || "").trim().toLowerCase();
    return this.all().find(u => u.username.toLowerCase() === n) || null;
  }
}

export class StrategiesRepo extends BaseRepo {
  constructor(store) { super(store, "gpb_strategies"); }
  all() { return this._all([]); }
  save(list) { this._save(list); }
  byId(id) { return this.all().find(s => s.id === id) || null; }
}

export class ResultsRepo extends BaseRepo {
  constructor(store) { super(store, "gpb_results"); }
  all() { return this._all([]); }
  saveAll(list) { this._save(list); }
  byId(id) { return this.all().find(r => r.id === id) || null; }
  clear() { this._save([]); }
}

export class MarketDataRepo extends BaseRepo {
  constructor(store) { super(store, "gpb_data"); }
  get() {
    const d = this._all(null);
    if (d && d.bars && d.bars.length) return d;
    return { bars: [], meta: { name: "", source: "", symbol: "XAU/USD", importedAt: null } };
  }
  set({ bars, meta }) { this._save({ bars, meta }); }
  clear() { this._save({ bars: [], meta: { name: "", source: "", symbol: "XAU/USD", importedAt: null } }); }
}

export class LogsRepo extends BaseRepo {
  constructor(store) { super(store, "gpb_logs"); this.arcKey = "gpb_logs_archive"; }
  all() { return this._all([]); }
  save(entries) { this._save(entries); }
  clear() { this._save([]); }
  archives() { return this.store.get(this.arcKey, []); }
  saveArchives(list) { this.store.set(this.arcKey, list); }
}

export class AlertsRepo extends BaseRepo {
  constructor(store) { super(store, "gpb_alerts"); }
  all() { return this._all([]); }
  save(list) { this._save(list); }
}

export class SchedulesRepo extends BaseRepo {
  constructor(store) { super(store, "gpb_sched"); }
  all() { return this._all([]); }
  save(list) { this._save(list); }
}

export class SettingsRepo extends BaseRepo {
  constructor(store) { super(store, "gpb_settings"); }
  all() { return this._all({}); }
  patch(key, value) {
    const s = this._all({});
    s[key] = value;
    this._save(s);
  }
}
