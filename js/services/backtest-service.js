/* services/backtest-service.js — async backtest runner, portfolio aggregation, benchmark.
   Orchestrates SimulationEngine + evaluator + metrics; result persistence stays in ResultService. */
"use strict";
import { U } from "../core/utils.js";
import { computeMetrics, ddSeries } from "../domain/metrics.js";
import { SimulationEngine } from "./engine-core.js";

const CHUNK = 2500;
const frame = () => new Promise(r => setTimeout(r, 0));

export class BacktestService {
  constructor({ strategies, ids, clock, settings }) {
    this.strategies = strategies;   // StrategyService (source of evaluator)
    this.ids = ids;
    this.clock = clock;
    this.settings = settings || null;
    this.engine = new SimulationEngine();
  }
  _symbol() {
    return (this.settings && this.settings.get("symbol")) || "GC=F";
  }

  _buildResult(strategy, cfg, st, sIdx, eIdx, opts) {
    const curve = st.curve;
    const metrics = computeMetrics(curve, st.trades, cfg.cm.initialCapital);
    return {
      id: opts.resultId || this.ids.next(),
      symbol: this._symbol(),
      strategyId: strategy.id,
      strategy: this._snapshot(strategy),
      dateRange: {
        start: cfg.ctx.bars[sIdx] ? cfg.ctx.bars[sIdx].d : null,
        end: cfg.ctx.bars[eIdx] ? cfg.ctx.bars[eIdx].d : null,
        bars: eIdx - sIdx + 1
      },
      initialCapital: cfg.cm.initialCapital,
      metrics,
      tradeLog: st.trades || [],
      equityCurve: U.downsample(curve, 3000),
      drawdown: U.downsample(ddSeries(curve), 3000),
      halted: !!st.halted,
      skippedSignals: st.skipped || 0,
      timestamp: this.clock.nowISO(),
      engine: "modular-v1"
    };
  }
  _snapshot(strategy) {
    return {
      id: strategy.id, name: strategy.name,
      logic: JSON.parse(JSON.stringify(strategy.strategyLogic)),
      rm: JSON.parse(JSON.stringify(strategy.riskManagement)),
      cm: JSON.parse(JSON.stringify(strategy.capitalManagement)),
      combine: JSON.parse(JSON.stringify(strategy.combine))
    };
  }

  /** runAsync(strategy, bars, startIdx, endIdx, opts) — chunked with progress */
  runAsync(strategy, bars, sIdx, eIdx, opts) {
    opts = opts || {};
    const cm = JSON.parse(JSON.stringify(strategy.capitalManagement));
    if (opts.capital && opts.capital > 0) cm.initialCapital = opts.capital;
    const evaluator = this.strategies.evaluator();
    const ctx = evaluator.makeContext(bars);
    const warmup = evaluator.maxWarmupFor(strategy);
    const cfg = { strategy, ctx, rm: strategy.riskManagement, cm, warmup, evaluate: (s, c, i, cs) => evaluator.evaluate(s, c, i, cs) };
    const st = {};
    const total = eIdx - sIdx + 1;
    let done = 0;
    const t0 = Date.now();
    let lastTick = 0;
    const progress = pct => {
      if (!opts.onProgress) return;
      const el = Date.now() - t0;
      const speed = done / (el / 1000 || 1);
      const eta = speed > 0 ? ((total - done) / speed) * 1000 : 0;
      opts.onProgress(pct, "Running backtest…", eta, st.trades ? st.trades.length : 0);
    };
    const step = () => {
      const from = sIdx + done;
      const to = Math.min(eIdx, from + CHUNK - 1);
      this.engine.simulate(cfg, st, from, to);
      done += to - from + 1;
      const pct = Math.min(100, done / total * 100);
      if (Date.now() - lastTick > 40) { progress(pct); lastTick = Date.now(); }
      if (done < total) return frame().then(step);
      progress(100);
      return this._buildResult(strategy, cfg, st, sIdx, eIdx, opts);
    };
    // Always resolve as a Promise: a single-chunk run completes synchronously
    // inside step(), and consumers rely on .then().
    return Promise.resolve(step());
  }

  /** runPortfolio(items, bars, sIdx, eIdx, opts) — split capital by weights, aggregate equity */
  runPortfolio(items, bars, sIdx, eIdx, opts) {
    opts = opts || {};
    const totalCapital = opts.capital || 10000;
    let wsum = 0;
    items.forEach(it => { wsum += +it.weight || 0; });
    if (wsum <= 0) wsum = items.length;
    const evaluator = this.strategies.evaluator();
    const ctx = evaluator.makeContext(bars);
    const sts = [], curves = [];

    const runOne = idx => {
      if (idx >= items.length) return Promise.resolve();
      const it = items[idx];
      const capital = totalCapital * (+it.weight || 1) / wsum;
      const st = {};
      const cm = Object.assign(JSON.parse(JSON.stringify(it.strategy.capitalManagement)), { initialCapital: capital });
      const warmup = evaluator.maxWarmupFor(it.strategy);
      const cfg = {
        strategy: it.strategy, ctx, rm: it.strategy.riskManagement, cm, warmup,
        evaluate: (s, c, i, cs) => evaluator.evaluate(s, c, i, cs)
      };
      const total = eIdx - sIdx + 1;
      let done = 0;
      const t0 = Date.now();
      let lastTick = 0;
      const prog = pct => {
        if (!opts.onProgress) return;
        const el = Date.now() - t0;
        const speed = done / (el / 1000 || 1);
        const eta = speed > 0 ? ((total - done) / speed) * 1000 : 0;
        opts.onProgress(pct, "Running portfolio: " + it.strategy.name + "…", eta, st.trades ? st.trades.length : 0);
      };
      const step2 = () => {
        const from = sIdx + done;
        const to = Math.min(eIdx, from + CHUNK - 1);
        this.engine.simulate(cfg, st, from, to);
        done += to - from + 1;
        const pct = Math.min(100, done / total * 100);
        if (Date.now() - lastTick > 40) { prog(pct); lastTick = Date.now(); }
        if (done < total) return frame().then(step2);
        prog(100);
        sts.push(this._buildResult(it.strategy, cfg, st, sIdx, eIdx, {}));
        curves.push({ name: it.strategy.name, curve: st.curve, capital });
        return runOne(idx + 1);
      };
      return step2();
    };

    return Promise.resolve(runOne(0)).then(() => {
      const len = curves.length ? curves[0].curve.length : 0;
      const agg = [];
      for (let k = 0; k < len; k++) {
        const d = curves[0].curve[k][0];
        let eq = 0;
        for (const c of curves) eq += c.curve[k][1];
        agg.push([d, eq]);
      }
      const am = computeMetrics(agg, [], totalCapital);
      let aggTrades = 0;
      sts.forEach(r => { aggTrades += r.tradeLog.length; });
      am.totalTrades = aggTrades;
      return {
        id: opts.resultId || this.ids.next(),
        portfolio: true,
        symbol: this._symbol(),
        children: sts.map(r => ({ id: r.id, strategyId: r.strategyId, name: r.strategy.name, metrics: r.metrics, trades: r.tradeLog.length })),
        strategy: { id: "portfolio", name: "Portfolio" },
        dateRange: { start: bars[sIdx] ? bars[sIdx].d : null, end: bars[eIdx] ? bars[eIdx].d : null, bars: len },
        initialCapital: totalCapital,
        metrics: am, tradeLog: [],
        equityCurve: U.downsample(agg, 3000),
        drawdown: U.downsample(ddSeries(agg), 3000),
        halted: false, skippedSignals: 0,
        timestamp: this.clock.nowISO(), engine: "modular-v1"
      };
    });
  }

  /** Synchronous benchmark over synthetic bars (indicator pre-compute excluded). */
  benchmark(strategy, bars) {
    const evaluator = this.strategies.evaluator();
    const ctx = evaluator.makeContext(bars);
    const warmup = evaluator.maxWarmupFor(strategy);
    const cfg = {
      strategy, ctx, rm: strategy.riskManagement,
      cm: JSON.parse(JSON.stringify(strategy.capitalManagement)), warmup,
      evaluate: (s, c, i, cs) => evaluator.evaluate(s, c, i, cs)
    };
    const st = {};
    const t0 = performance.now();
    this.engine.simulate(cfg, st, 0, bars.length - 1);
    const ms = performance.now() - t0;
    return { ms, bars: bars.length, bps: bars.length / (ms / 1000), trades: st.trades.length };
  }
}
