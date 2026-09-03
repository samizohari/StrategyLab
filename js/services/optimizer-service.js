/* services/optimizer-service.js — grid search over strategy logic parameters (use case layer) */
"use strict";
import { U } from "../core/utils.js";

const frame = () => new Promise(r => setTimeout(r, 0));

export class OptimizerService {
  constructor({ strategies, backtest, market }) {
    this.strategies = strategies;
    this.backtest = backtest;
    this.market = market;
  }

  /**
   * optimize({strategy, ranges, bars, from, to, metric, capital, onProgress})
   * ranges: [{key, from, to, step}] — logic parameter grids.
   * Resolves to {rows: [{params, metrics}...] sorted by metric desc}.
   */
  optimize(opts) {
    const { strategy, ranges, bars, from, to, metric, capital, onProgress } = opts;
    let combos = [{}];
    for (const r of ranges) {
      const values = [];
      for (let v = r.from; v <= r.to + 1e-9; v += r.step) values.push(U.round(v, 6));
      const next = [];
      for (const c of combos) for (const v of values) next.push(Object.assign({}, c, { [r.key]: v }));
      combos = next;
    }
    const total = combos.length;
    let done = 0;
    const t0 = Date.now();
    const rows = [];
    const runOne = i => {
      if (i >= combos.length) {
        rows.sort((a, b) => {
          const av = a.metrics[metric], bv = b.metrics[metric];
          const ax = av == null ? -Infinity : av, bx = bv == null ? -Infinity : bv;
          return bx - ax;
        });
        return Promise.resolve({ rows, metric, total });
      }
      const params = combos[i];
      const clone = JSON.parse(JSON.stringify(strategy));
      Object.keys(params).forEach(k => { clone.strategyLogic.params[k] = params[k]; });
      return this.backtest.runAsync(clone, bars, from, to, { capital: capital || strategy.capitalManagement.initialCapital })
        .then(res => {
          done++;
          if (onProgress && done % 5 === 0 || done === total) {
            const el = Date.now() - t0;
            const speed = done / (el / 1000 || 1);
            const eta = speed > 0 ? ((total - done) / speed) * 1000 : 0;
            onProgress(Math.min(100, done / total * 100), "Optimizing…", eta);
          }
          rows.push({ params: Object.assign({}, params), metrics: res.metrics, id: res.id });
          return runOne(i + 1);
        });
    };
    return runOne(0);
  }
}
