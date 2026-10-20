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
    this.ensureTrendlineSeed();
    this.ensureRsiBracketSeed();
  }

  /** AI-created Trendline strategy (added once, even for existing installs). */
  ensureTrendlineSeed() {
    if (this.repo.all().some(s => s.strategyLogic && s.strategyLogic.type === "TRENDLINE")) return null;
    const s = this.create("Trendline Follower (AI)", "TRENDLINE");
    s.strategyLogic.params = { lookback: 50, mode: "dual", minSlopePct: 0.01, bufferPct: 0 };
    s.riskManagement = { stopType: "atr", stopLoss: 2, stopATR: 2.2, tpType: "trail", takeProfit: 4, trailActivate: 1.2, trailDist: 1.0, riskPerTrade: 1.2, maxDailyLoss: 4, maxConsecLosses: 3, pauseBars: 5 };
    s.capitalManagement = { initialCapital: 10000, positionSizing: "risk", positionSize: 10, fixedUnits: 10, maxPositionPct: 55, compounding: true, maxDrawdown: 25, feePct: 0 };
    s.desc = "Buy when price closes above the rising bullish trendline (low regression); sell below the falling bearish trendline (high regression). Trendlines are rolling linear regressions; ATR stops + trailing profit.";
    const all = this.repo.all();
    all.push(s);
    this.repo.save(all);
    this.log.add("INFO", "system", "STRATEGY_CREATE", "AI-created Trendline Follower strategy added");
    return s;
  }

  /** AI-created RSI bracket strategy; retires the earlier single-side presets.
   *   long  — buy when RSI(14) < 30, exit at +0.5% profit or a 100-pip stop
   *   short — sell short when RSI(14) > 70, exit at +500 pips or a 100-pip stop
   *  Band signals only OPEN trades, so the bracket is the only exit. */
  ensureRsiBracketSeed() {
    const NAME = "RSI 30/70 Bracketed (AI)";
    const LEGACY = ["RSI 30/70 Dip Buyer (AI)", "RSI 70/30 Rally Fader (AI)"];
    const all = this.repo.all();
    const hasNew = all.some(s => s.name === NAME);
    const retiring = all.filter(s => LEGACY.indexOf(s.name) >= 0);
    if (hasNew && !retiring.length) return null;
    const kept = all.filter(s => LEGACY.indexOf(s.name) < 0);
    let created = null;
    if (!hasNew) {
      created = this.create(NAME, "RSI");
      created.strategyLogic.params = {
        period: 14, overbought: 70, oversold: 30,
        mode: "bands", side: "both", longOnly: true, signalExit: false
      };
      created.riskManagement = {
        pipSize: 0.1,
        stopType: "pips", stopPips: 100, stopLoss: 2, stopATR: 2,
        tpType: "pct", takeProfit: 0.5, takeProfitPips: 500,
        shortTpType: "pips", shortTakeProfit: 4, shortTakeProfitPips: 500,
        trailActivate: 2, trailDist: 1.5,
        riskPerTrade: 1, maxDailyLoss: 4, maxConsecLosses: 3, pauseBars: 5
      };
      created.capitalManagement = {
        initialCapital: 10000, positionSizing: "risk", positionSize: 10, fixedUnits: 10,
        maxPositionPct: 50, compounding: true, maxDrawdown: 25, feePct: 0
      };
      created.desc = "Bracket rules. LONG: buy when RSI(14) drops below 30; exit at +0.5% profit or a 100-pip stop. SHORT: sell when RSI(14) rises above 70; exit at +500 pips or a 100-pip stop. Band signals only open trades, so the bracket is the only exit. Pip size 0.1 (gold): 100 pips = $10, 500 pips = $50 per ounce.";
      kept.push(created);
    }
    this.repo.save(kept);
    if (created) this.log.add("INFO", "system", "STRATEGY_CREATE", "AI-created strategy added: " + NAME);
    if (retiring.length) this.log.add("INFO", "system", "STRATEGY_DELETE", "Retired superseded AI presets: " + retiring.map(s => s.name).join(", "));
    return created;
  }

  /** Lazy evaluator wired to this service's repository (dependency injection). */
  evaluator() {
    if (!this._evaluator) {
      this._evaluator = createEvaluator({ resolveStrategy: id => this.byId(id) });
    }
    return this._evaluator;
  }
}
