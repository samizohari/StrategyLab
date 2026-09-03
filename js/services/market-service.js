/* services/market-service.js — market data use case over MarketDataRepo + pure domain parsers */
"use strict";
import { parseCSV, parseJSON, exportCSV, demoData } from "../domain/series.js";
import { regimes, regimeSegments } from "../domain/regime.js";

export class MarketService {
  constructor({ repo, log, ids }) {
    this.repo = repo;
    this.log = log;
    this.ids = ids;
    this._cache = null;
    this._load();
  }
  _load() {
    const d = this.repo.get();
    this._cache = { bars: d.bars.slice(), meta: Object.assign({}, d.meta) };
  }
  bars() { return this._cache.bars; }
  meta() { return this._cache.meta; }
  count() { return this._cache.bars.length; }

  setAll(bars, metaInfo) {
    this._cache.bars = bars;
    this._cache.meta = Object.assign({}, this._cache.meta, metaInfo || {}, { importedAt: new Date().toISOString() });
    this._persist();
    return this._cache;
  }
  _persist() {
    this.repo.set({
      bars: this._cache.bars,
      meta: Object.assign({}, this._cache.meta, { importedAt: this._cache.meta.importedAt || new Date().toISOString() })
    });
  }
  clear() {
    this._cache = { bars: [], meta: { name: "", source: "", symbol: "XAU/USD", importedAt: null } };
    this.repo.clear();
  }

  /* import */
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
    const fresh = [...arr, {
      d: b.d, o: +b.o, h: +b.h, l: +b.l, c: +b.c, v: +(b.v || 0)
    }].sort((a, x) => (a.d < x.d ? -1 : a.d > x.d ? 1 : 0));
    this.setAll(fresh, {});
    return { ok: true };
  }
  ensureDemo() {
    if (this.count() === 0) {
      const b = demoData(1600, 20260903);
      this.setAll(b, { name: "Synthetic gold daily", source: "Seeded demo generator", symbol: "XAU/USD" });
    }
  }
  regenerateDemo() {
    const b = demoData(1600);
    this.setAll(b, { name: "Synthetic gold daily", source: "Demo generator (seeded)", symbol: "XAU/USD" });
    return b.length;
  }
  exportCSV() { return exportCSV(this.bars()); }

  /* ranges & regimes */
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
