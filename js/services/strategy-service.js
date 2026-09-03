/* services/strategy-service.js — strategy management + evaluator factory (use case layer) */
"use strict";
import { createStrategy, validateStrategy, Catalog } from "../domain/entities.js";
import { createEvaluator } from "../domain/trading.js";
import { composeStrategyHelp } from "../domain/help.js";

export class StrategyService {
  constructor({ repo, log, ids }) {
    this.repo = repo;
    this.log = log;
    this.ids = ids;
    this._evaluator = null;
  }
  all() { return this.repo.all(); }
  byId(id) { return this.repo.byId(id); }
  catalog() { return Catalog; }

  create(name, type) {
    const s = createStrategy(name, type, () => this.ids.next());
    return s;
  }
  validate(s) { return validateStrategy(s, { memberExists: id => !!this.byId(id) }); }

  /** Save (insert or update) after validation. Returns {ok, errors?, strategy?} */
  save(s) {
    if (!s.helpMd || !String(s.helpMd).trim()) {
      s.helpMd = composeStrategyHelp(s, id => { const m = this.byId(id); return m ? m.name : null; });
    }
    const errs = this.validate(s);
    if (errs.length) return { ok: false, errors: errs };
    const all = this.repo.all();
    const idx = all.findIndex(x => x.id === s.id);
    s.updatedAt = new Date().toISOString();
    if (idx >= 0) all[idx] = s;
    else {
      if (!s.id) s.id = this.ids.next();
      s.createdAt = s.createdAt || new Date().toISOString();
      all.push(s);
    }
    this.repo.save(all);
    return { ok: true, strategy: s };
  }
  remove(id) {
    const s = this.byId(id);
    if (!s) return { ok: false, msg: "Not found." };
    this.repo.save(this.repo.all().filter(x => x.id !== id));
    return { ok: true, strategy: s };
  }
  duplicate(id) {
    const s = this.byId(id);
    if (!s) return null;
    const copy = JSON.parse(JSON.stringify(s));
    copy.id = this.ids.next();
    copy.name = s.name + " (copy)";
    copy.createdAt = copy.updatedAt = new Date().toISOString();
    if (copy.combine && copy.combine.enabled) copy.combine.enabled = false;
    const all = this.repo.all();
    all.push(copy);
    this.repo.save(all);
    return copy;
  }
  /** Import raw JSON (single or array) with basic schema merge. */
  importJson(raw) {
    let arr = null;
    try { arr = JSON.parse(raw); } catch (e) { return { ok: false, msg: "Invalid JSON: " + e.message }; }
    if (!Array.isArray(arr)) arr = [arr];
    const ok = [], errs = [];
    for (const r of arr) {
      if (!r || !r.name) { errs.push("Entry missing name"); continue; }
      const s = this.create(r.name, (r.strategyLogic && r.strategyLogic.type) || "MA_CROSS");
      if (r.strategyLogic) s.strategyLogic = r.strategyLogic;
      if (r.riskManagement) s.riskManagement = Object.assign(s.riskManagement, r.riskManagement);
      if (r.capitalManagement) s.capitalManagement = Object.assign(s.capitalManagement, r.capitalManagement);
      if (r.combine) s.combine = Object.assign(s.combine, r.combine);
      if (r.desc) s.desc = r.desc;
      const res = this.save(s);
      if (res.ok) ok.push(s); else errs.push(s.name + ": " + res.errors.join("; "));
    }
    return { ok: ok.length > 0, imported: ok.length, errors: errs };
  }

  seedDefaults() {
    if (this.repo.all().length) return;
    const A = this.create("MA Crossover", "MA_CROSS");
    A.desc = "Classic trend follower: buy when the fast SMA crosses above the slow SMA.";
    A.riskManagement = { stopType: "pct", stopLoss: 2, stopATR: 2, tpType: "trail", takeProfit: 4, trailActivate: 1.5, trailDist: 1.2, riskPerTrade: 1.5, maxDailyLoss: 5, maxConsecLosses: 3, pauseBars: 5 };
    const B = this.create("RSI Mean Reversion", "RSI");
    B.strategyLogic.params = { period: 14, overbought: 70, oversold: 30, mode: "reversion" };
    B.desc = "Fades overbought/oversold extremes.";
    const C = this.create("MACD Momentum", "MACD");
    C.strategyLogic.params = { fast: 12, slow: 26, signal: 9, mode: "cross" };
    C.desc = "Trades MACD signal-line crosses with an ATR stop.";
    const D = this.create("Bollinger Breakout", "BOLL");
    D.strategyLogic.params = { period: 20, mult: 2, mode: "breakout" };
    D.desc = "Enters when price closes outside the bands.";
    const E = this.create("Trend Combo", "MA_CROSS");
    E.strategyLogic.params = { fastMA: 20, slowMA: 60, fastType: "ema", slowType: "ema", signalType: "cross" };
    E.combine = { enabled: true, memberIds: [A.id, C.id], weights: {}, logic: "AND", threshold: 0, seqWindow: 5 };
    E.desc = "Combination: EMA crossover AND MACD cross must agree (consensus).";
    this.repo.save([A, B, C, D, E]);
  }

  /** Lazy evaluator wired to this service's repository (dependency injection). */
  evaluator() {
    if (!this._evaluator) {
      this._evaluator = createEvaluator({ resolveStrategy: id => this.byId(id) });
    }
    return this._evaluator;
  }
}
