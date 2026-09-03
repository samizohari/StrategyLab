/* services/schedule-service.js — recurring (simulated interval) backtests */
"use strict";

export class ScheduleService {
  /** @param {{repo: SchedulesRepo, strategies, results: ResultService, backtest: BacktestService,
   *           market: MarketService, log, ids}} deps */
  constructor(deps) {
    this.repo = deps.repo;
    this.strategies = deps.strategies;
    this.results = deps.results;
    this.backtest = deps.backtest;
    this.market = deps.market;
    this.log = deps.log;
    this.ids = deps.ids;
    this._timer = null;
    this._busy = false;
  }
  list() { return this.repo.all(); }
  add(c) {
    const l = this.repo.all();
    l.push(Object.assign({ id: this.ids.next(), enabled: true, nextRun: 0, created: new Date().toISOString() }, c));
    this.repo.save(l);
  }
  remove(id) { this.repo.save(this.repo.all().filter(x => x.id !== id)); }
  setEnabled(id, enabled) {
    this.repo.save(this.repo.all().map(c => (c.id === id ? Object.assign({}, c, { enabled }) : c)));
  }

  /** Fire due schedules (no-op when already running). */
  tick() {
    if (this._busy) return;
    const now = Date.now();
    const due = this.list().filter(c =>
      c.enabled !== false && (!c.nextRun || c.nextRun <= now) && this.strategies.byId(c.strategyId));
    if (!due.length) return;
    this._busy = true;
    let i = 0;
    const finish = c => { c.lastRun = new Date().toISOString(); c.nextRun = Date.now() + c.intervalMin * 60000; this.repo.save(this.repo.all()); };
    const runNext = () => {
      if (i >= due.length) { this._busy = false; return; }
      const c = due[i++];
      const s = this.strategies.byId(c.strategyId);
      const bars = this.market.bars();
      if (!bars.length) { finish(c); runNext(); return; }
      let ix = { s: 0, e: bars.length - 1 };
      if (c.years > 0) {
        const from = new Date();
        from.setFullYear(from.getFullYear() - c.years);
        ix = this.market.sliceIdx(from.toISOString().slice(0, 10), null);
      }
      this.backtest.runAsync(s, bars, ix.s, ix.e, { capital: c.capital || 10000 })
        .then(res => {
          res.scheduled = c.name;
          this.results.save(res);
          this.log.add("INFO", "system", "SCHEDULED_RUN", "Scheduled run '" + c.name + "' → " + res.metrics.totalReturn.toFixed(2) + "%");
          finish(c);
          runNext();
        })
        .catch(() => { finish(c); runNext(); });
    };
    runNext();
  }
  /** Start the interval loop (page-open only). Safe in any runtime. */
  start(intervalMs) {
    if (this._timer) return;
    this._timer = setInterval(() => { try { this.tick(); } catch (e) { /* keep running */ } }, intervalMs || 15000);
  }
}
