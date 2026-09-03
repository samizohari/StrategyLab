/* services/result-service.js — result persistence (cap), removal and export builders */
"use strict";
import { U } from "../core/utils.js";

export class ResultService {
  constructor({ repo, settings, log }) {
    this.repo = repo;
    this.settings = settings;
    this.log = log;
  }
  list() { return this.repo.all(); }
  get(id) { return this.repo.byId(id); }
  save(result) {
    let l = this.repo.all().filter(x => x.id !== result.id);
    l.unshift(result);
    const cap = this.settings.get("resultCap") || 20;
    if (l.length > cap) l = l.slice(0, cap);
    this.repo.saveAll(l);
    return result;
  }
  remove(id) { this.repo.saveAll(this.repo.all().filter(x => x.id !== id)); }
  clear() { this.repo.clear(); }

  tradesCSV(result) {
    return U.toCSV((result.tradeLog || []).map(t => ({
      entryDate: t.entryDate, exitDate: t.exitDate, side: t.dir === 1 ? "LONG" : "SHORT",
      entry: t.entry, exit: t.exit, qty: t.qty, pnl: t.pnl, pnlPct: t.pnlPct, reason: t.reason
    })));
  }
  equityCSV(result) {
    return U.toCSV((result.equityCurve || []).map(p => ({ Date: p[0], Equity: U.round(p[1], 2) })));
  }
  reportJSON(result) {
    return JSON.stringify({
      report: {
        generated: new Date().toISOString(), strategy: result.strategy,
        dateRange: result.dateRange, initialCapital: result.initialCapital,
        metrics: result.metrics, tradeCount: (result.tradeLog || []).length
      },
      resultId: result.id
    }, null, 2);
  }
  safeName(result) {
    return (result.strategy && result.strategy.name ? result.strategy.name : "result")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-");
  }
}
