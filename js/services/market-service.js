/* services/market-service.js — multi-symbol market data use case.
   Every imported dataset is stored separately per symbol ("file"), and all
   consumers operate on the dataset of the ACTIVE symbol (settings.symbol).
   Switching the symbol updates the whole site after reload. */
"use strict";
import { parseCSV, parseJSON, exportCSV, demoData } from "../domain/series.js";
import { regimes, regimeSegments } from "../domain/regime.js";

const norm = s => {
  const v = String(s == null ? "" : s).trim().toUpperCase();
  return v || "GC=F";
};

export class MarketService {
  /** @param {{datasets: DatasetsRepo, legacy: MarketDataRepo, settings, log, ids}} deps */
  constructor(deps) {
    this.dsRepo = deps.datasets;   // gpb_datasets: { SYMBOL: {bars, meta} } — one file per symbol
    this.legacy = deps.legacy;     // gpb_data mirror (kept for the single-file build)
    this.settings = deps.settings;
    this.log = deps.log;
    this.ids = deps.ids;
    this._cache = null;
    this._load();
  }
  _load() {
    const map = this.dsRepo.get() || {};
    if (!Object.keys(map).length) {
      // migrate a legacy single-dataset install into a symbol file
      const lg = this.legacy.get();
      if (lg && lg.bars && lg.bars.length) {
        const sym = norm(lg.meta && lg.meta.symbol) || this.symbol();
        map[sym] = { bars: lg.bars, meta: Object.assign({}, lg.meta, { symbol: sym }) };
      }
    }
    this._cache = map;
  }
  /** Active symbol setting (normalised). */
  symbol() { return norm(this.settings.get("symbol")); }
  /** All stored symbol files. */
  datasetList() {
    return Object.keys(this._cache).map(k => ({
      symbol: k,
      bars: this._cache[k].bars ? this._cache[k].bars.length : 0,
      meta: this._cache[k].meta || {}
    }));
  }
  _dataset(sym) {
    if (!this._cache[sym]) this._cache[sym] = { bars: [], meta: { name: "", source: "", symbol: sym, importedAt: null } };
    return this._cache[sym];
  }
  /** Active dataset helpers (the rest of the site sees only the active symbol). */
  bars() { return this._dataset(this.symbol()).bars; }
  meta() { return this._dataset(this.symbol()).meta; }
  count() { return this.bars().length; }

  /** Replace the ACTIVE symbol's dataset ("file"). */
  setAll(bars, metaInfo) { this._put(this.symbol(), bars, metaInfo); return this._dataset(this.symbol()); }
  /** Save a dataset under an explicit symbol (Yahoo import) — separate file. */
  importSymbol(sym, bars, metaInfo) { this._put(norm(sym), bars, metaInfo); return norm(sym); }
  _put(sym, bars, metaInfo) {
    const cur = this._dataset(sym);
    const nm = Object.assign({}, cur.meta, metaInfo || {}, {
      symbol: metaInfo && metaInfo.symbol ? norm(metaInfo.symbol) : sym,
      importedAt: new Date().toISOString()
    });
    this._cache[sym] = { bars, meta: nm };
    this._persist();
  }
  _persist() {
    this.dsRepo.save(this._cache);
    const a = this._cache[this.symbol()];
    if (a) this.legacy.set({ bars: a.bars, meta: a.meta }); // mirror for the legacy build
  }
  clear() {
    const s = this.symbol();
    this._cache[s] = { bars: [], meta: { name: "", source: "", symbol: s, importedAt: null } };
    this._persist();
  }

  /* ---- import (active symbol) ---- */
  importCSV(text, metaInfo) { return this._apply(parseCSV(text), metaInfo); }
  importJSON(text, metaInfo) { return this._apply(parseJSON(text), metaInfo); }
  _apply(res, metaInfo) {
    if (!res.ok) return res;
    this.setAll(res.bars, Object.assign({ name: "Imported series", source: "Import" }, metaInfo || {}));
    return res;
  }
  addBar(b) {
    const arr = this.bars();
    if (arr.some(x => x.d === b.d)) return { ok: false, msg: "A bar for " + b.d + " already exists." };
    const fresh = [...arr, { d: b.d, o: +b.o, h: +b.h, l: +b.l, c: +b.c, v: +(b.v || 0) }]
      .sort((a, x) => (a.d < x.d ? -1 : a.d > x.d ? 1 : 0));
    this.setAll(fresh, {});
    return { ok: true };
  }
  ensureDemo() {
    if (!Object.keys(this._cache).length) {
      const s = this.symbol();
      const b = demoData(1600, 20260903);
      this._put(s, b, { name: "Synthetic gold daily (demo)", source: "Seeded demo — replace with Yahoo import", symbol: s });
    }
  }
  regenerateDemo() {
    const s = this.symbol();
    const b = demoData(1600);
    this._put(s, b, { name: "Synthetic demo", source: "Demo (seeded)", symbol: s });
    return b.length;
  }
  exportCSV() { return exportCSV(this.bars()); }

  /* ---- ranges & regimes (active symbol) ---- */
  rangeBounds() {
    const b = this.bars();
    if (!b.length) return null;
    return { start: b[0].d, end: b[b.length - 1].d };
  }
  sliceIdx(startD, endD) {
    const b = this.bars();
    let s = 0, e = b.length - 1;
    if (startD) for (let i = 0; i < b.length; i++) if (b[i].d >= startD) { s = i; break; }
    if (endD) for (let j = b.length - 1; j >= 0; j--) if (b[j].d <= endD) { e = j; break; }
    return { s, e };
  }
  slice(startD, endD) {
    const ix = this.sliceIdx(startD, endD);
    return this.bars().slice(ix.s, ix.e + 1);
  }
  regimesOf(barsArr, period) { return regimes(barsArr || this.bars(), period); }
  segments(barsArr, minLen) { return regimeSegments(barsArr || this.bars(), minLen); }

  stats() {
    const b = this.bars();
    if (!b.length) return null;
    let min = Infinity, max = -Infinity, sum = 0;
    for (const x of b) {
      if (x.l < min) min = x.l;
      if (x.h > max) max = x.h;
      sum += x.v;
    }
    return {
      count: b.length, start: b[0].d, end: b[b.length - 1].d, min, max,
      firstClose: b[0].c, lastClose: b[b.length - 1].c,
      rangeRet: (b[b.length - 1].c / b[0].c - 1) * 100,
      avgVol: Math.round(sum / b.length)
    };
  }
}
