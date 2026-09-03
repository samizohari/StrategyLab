/* services/analysis-service.js — scenario analysis & regime heatmap data (use case layer) */
"use strict";

export class AnalysisService {
  constructor({ market, backtest }) {
    this.market = market;
    this.backtest = backtest;
  }

  /** Run a strategy over the largest regime segments (max N per regime). */
  scenarioSegments(strategy, bars, opts) {
    opts = opts || {};
    const segs = this.market.segments(bars, 30);
    const keep = { bull: [], bear: [], side: [] };
    segs.forEach(s => keep[s.regime].push(s));
    Object.keys(keep).forEach(k => {
      keep[k].sort((a, b) => b.bars - a.bars);
      keep[k] = keep[k].slice(0, opts.maxPerRegime || 3);
    });
    const all = [];
    Object.keys(keep).forEach(k => keep[k].forEach(s => all.push(s)));
    all.sort((a, b) => a.startIdx - b.startIdx);
    const out = [];
    let done = 0;
    const runOne = i => {
      if (i >= all.length) return Promise.resolve(out);
      const seg = all[i];
      if (opts.onProgress) opts.onProgress(done / all.length * 100, seg.regime + " " + seg.startD + " → " + seg.endD);
      return this.backtest.runAsync(strategy, bars, seg.startIdx, seg.endIdx, { capital: 10000 })
        .then(res => {
          done++;
          out.push({ regime: seg.regime, startD: seg.startD, endD: seg.endD, bars: seg.bars, ret: res.metrics.totalReturn, m: res.metrics });
          return runOne(i + 1);
        });
    };
    return runOne(0);
  }

  /** Average per-regime return for several strategies (compare heatmap). Returns [{bull,bear,side}]. */
  regimeAverages(strategies, bars, opts) {
    opts = opts || {};
    const rows = [];
    let done = 0;
    const runOne = i => {
      if (i >= strategies.length) return Promise.resolve(rows);
      const s = strategies[i];
      return this.scenarioSegments(s, bars, { maxPerRegime: 3 })
        .then(segs => {
          done++;
          if (opts.onProgress) opts.onProgress(done / strategies.length * 100);
          const agg = { bull: null, bear: null, side: null };
          ["bull", "bear", "side"].forEach(rg => {
            const rs = segs.filter(x => x.regime === rg);
            if (rs.length) agg[rg] = rs.reduce((a, x) => a + x.ret, 0) / rs.length;
          });
          rows.push(agg);
          return runOne(i + 1);
        });
    };
    return runOne(0);
  }
}
