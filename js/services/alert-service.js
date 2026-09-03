/* services/alert-service.js — market condition watchers (use case layer) */
"use strict";
import { sma, rsi as rsiInd } from "../domain/indicators.js";

export class AlertService {
  /** @param {{repo: AlertsRepo, log, ids, market: MarketService, notify: {askPermission():void, notify(title,body):void}}} deps */
  constructor(deps) {
    this.repo = deps.repo;
    this.log = deps.log;
    this.ids = deps.ids;
    this.market = deps.market;
    this.notifyPort = deps.notify;
  }
  list() { return this.repo.all(); }
  add(a) {
    const l = this.repo.all();
    l.unshift(Object.assign({ id: this.ids.next(), enabled: true, lastStatus: false, created: new Date().toISOString() }, a));
    this.repo.save(l);
    return l[0];
  }
  remove(id) { this.repo.save(this.repo.all().filter(x => x.id !== id)); }
  setEnabled(id, enabled) {
    this.repo.save(this.repo.all().map(a => (a.id === id ? Object.assign({}, a, { enabled }) : a)));
  }
  askPermission() { if (this.notifyPort) this.notifyPort.askPermission(); }

  /** Evaluate watchers against the latest bar. Call periodically (30 s). */
  check() {
    if (this.market.count() === 0) return;
    const bars = this.market.bars();
    const i = bars.length - 1;
    const c = bars[i].c;
    const closes = bars.slice(-260).map(b => b.c);
    const alerts = this.list().filter(a => a.enabled !== false);
    const changed = [];
    alerts.forEach(a => {
      let trig = false, msg = "";
      if (a.type === "PRICE") {
        trig = a.op === "above" ? c > a.level : c < a.level;
        msg = "Price $" + c.toFixed(2) + " is " + a.op + " $" + a.level;
      } else if (a.type === "MA_CROSS") {
        const f = sma(closes, +a.fast), s = sma(closes, +a.slow);
        const fv = f[f.length - 1], sv = s[s.length - 1];
        trig = a.op === "above" ? fv > sv : fv < sv;
        msg = "SMA " + a.fast + " is " + a.op + " SMA " + a.slow;
      } else if (a.type === "RSI") {
        const r = rsiInd(closes, +a.period);
        const rv = r[r.length - 1];
        if (!isNaN(rv)) {
          trig = a.op === "above" ? rv > a.level : rv < a.level;
          msg = "RSI(" + a.period + ") = " + rv.toFixed(2) + " is " + a.op + " " + a.level;
        }
      }
      if (trig && a.lastStatus !== true) {
        changed.push(Object.assign({}, a, { lastStatus: true, lastTrig: new Date().toISOString() }));
        if (this.notifyPort) this.notifyPort.notify("StrategyLab alert — " + a.name, msg);
        this.log.add("INFO", "system", "ALERT_TRIGGER", a.name + ": " + msg);
      } else if (!trig && a.lastStatus === true) {
        changed.push(Object.assign({}, a, { lastStatus: false }));
      }
    });
    if (changed.length) {
      const map = {};
      changed.forEach(a => { map[a.id] = a; });
      this.repo.save(this.repo.all().map(a => (map[a.id] ? map[a.id] : a)));
    }
    return changed;
  }
}
