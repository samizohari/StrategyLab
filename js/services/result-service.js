/* services/result-service.js — result persistence (cap), removal and export builders */
"use strict";
import { U } from "../core/utils.js";
import { computeMetrics, ddSeries } from "../domain/metrics.js";

export class ResultService {
  constructor({ repo, settings, log }) {
    this.repo = repo;
    this.settings = settings;
    this.log = log;
  }

  /** Self-healing: results written by older/buggy versions may carry null metrics.
   *  Recompute from the stored equity curve + trade log whenever the metrics look
   *  empty but the underlying data exists. Persisted once so every consumer
   *  (dashboard, backtest, compare, risk, reports) sees real numbers. */
  _normalize(r) {
    if (!r || !r.metrics) return r;
    const m = r.metrics;
    const curve = r.equityCurve || [];
    const trades = r.tradeLog || [];
    const looksBroken = (m.totalReturn == null && (curve.length > 1 || trades.length > 0)) ||
      ((curve.length > 1 || trades.length > 0) && m.totalTrades === 0 && trades.length > 0);
    if (!looksBroken) return r;
    const fresh = computeMetrics(curve, trades, r.initialCapital || 10000);
    fresh.totalTrades = trades.length > 0 ? trades.length : (fresh.totalTrades || 0);
    if (r.portfolio && r.children) fresh.totalTrades = r.children.reduce((a, c) => a + (c.trades || 0), 0);
    fresh.winningTrades = trades.length ? fresh.winningTrades : (m.winningTrades || 0);
    fresh.losingTrades = trades.length ? fresh.losingTrades : (m.losingTrades || 0);
    r.metrics = fresh;
    if (!r.drawdown || r.drawdown.length === 0) r.drawdown = U.downsample(ddSeries(curve), 3000);
    this.repo.saveAll(this.repo.all().map(x => (x.id === r.id ? r : x)));
    return r;
  }

  list() { return this.repo.all().map(r => this._normalize(r)); }
  get(id) { const r = this.repo.byId(id); return r ? this._normalize(r) : null; }
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
