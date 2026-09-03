/* services/engine-core.js — pure bar-by-bar simulation engine (domain execution).
   The engine knows nothing about storage/DOM: signals come from an injected
   `evaluate(strategy, ctx, i, comboState)` function (dependency inversion). */
"use strict";
import { U } from "../core/utils.js";

export class SimulationEngine {
  _closeTrade(cfg, st, i, price, reason) {
    const pos = st.pos, cm = cfg.cm;
    const fee = pos.qty * pos.entry * (cm.feePct || 0) / 100;
    const pnl = pos.dir * pos.qty * (price - pos.entry) - fee;
    const pnlPct = pos.dir * (price / pos.entry - 1) * 100 - (cm.feePct || 0);
    if (pos.dir === 1) st.cash += pos.qty * price; else st.cash -= pos.qty * price;
    st.cash -= fee;
    st.trades.push({
      id: U.uuid(), dir: pos.dir, entryBar: pos.entryBar, exitBar: i,
      entryDate: pos.entryDate, exitDate: cfg.ctx.bars[i].d,
      entry: U.round(pos.entry, 4), exit: U.round(price, 4), qty: U.round(pos.qty, 6),
      pnl: U.round(pnl, 2), pnlPct: U.round(pnlPct, 4), reason, src: pos.src,
      holdBars: i - pos.entryBar
    });
    st.equity = st.cash;
    if (pnl >= 0) { st.kelly.wins++; st.kelly.winSum += pnl; st.consec = 0; }
    else { st.kelly.losses++; st.kelly.lossSum += -pnl; st.consec++; st.dayLoss += -pnl; }
    st.pos = null;
    return st.trades[st.trades.length - 1];
  }

  _openPosition(cfg, st, i, dir, src) {
    const rm = cfg.rm, cm = cfg.cm, ctx = cfg.ctx;
    const entry = ctx.closes[i];
    const base = cm.compounding ? Math.max(0, st.cash) : cm.initialCapital;
    let stop = null;
    if (rm.stopType === "pct") stop = entry * (1 - dir * rm.stopLoss / 100);
    else if (rm.stopType === "atr") {
      const at = ctx.getATR(14)[i];
      if (!isNaN(at)) stop = entry - dir * at * rm.stopATR;
    }
    const stopDist = stop != null ? Math.abs(entry - stop) : 0;
    let qty = 0;
    switch (cm.positionSizing) {
      case "risk":
        qty = (stopDist > 0 && rm.riskPerTrade > 0)
          ? base * (rm.riskPerTrade / 100) / stopDist
          : base * ((cm.positionSize || 10) / 100) / entry;
        break;
      case "percentage":
        qty = base * ((cm.positionSize || 10) / 100) / entry;
        break;
      case "fixed":
        qty = cm.fixedUnits || 1;
        break;
      case "kelly": {
        let W = 0.5, R = 1.5;
        const n = st.kelly.wins + st.kelly.losses;
        if (n > 0) {
          W = st.kelly.wins / n;
          if (st.kelly.lossSum > 0) {
            const aw = st.kelly.wins > 0 ? st.kelly.winSum / st.kelly.wins : 0;
            const al = st.kelly.lossSum / st.kelly.losses;
            R = al > 0 ? aw / al : 3;
          } else R = 3;
        }
        const f = Math.max(0, Math.min(0.25, W - (1 - W) / R));
        qty = base * f / entry;
        break;
      }
      default:
        qty = base * ((cm.positionSize || 10) / 100) / entry;
    }
    const maxNotional = base * (cm.maxPositionPct || 100) / 100;
    if (qty * entry > maxNotional) qty = maxNotional / entry;
    if (!isFinite(qty) || qty * entry < 1) return false;
    st.cash -= dir * qty * entry;
    const fee = qty * entry * (cm.feePct || 0) / 100;
    st.cash -= fee;
    let tp = null;
    if (rm.tpType === "pct") tp = entry * (1 + dir * rm.takeProfit / 100);
    st.pos = {
      dir, qty, entry, entryBar: i, entryDate: ctx.bars[i].d, stop, tp,
      trailActivated: false, trailDistPct: rm.trailDist / 100, src, entryFee: fee
    };
    return true;
  }

  /** simulate(cfg, st, from, to) — one synchronous pass over a bar range.
   *  cfg: {strategy, ctx, rm, cm, warmup, evaluate} */
  simulate(cfg, st, from, to) {
    const bars = cfg.ctx.bars, ctx = cfg.ctx, rm = cfg.rm, cm = cfg.cm;
    if (!st.init) {
      st.cash = cm.initialCapital; st.equity = cm.initialCapital; st.peak = cm.initialCapital;
      st.halted = false; st.pause = 0; st.consec = 0; st.dayLoss = 0; st.dayKey = null;
      st.kelly = { wins: 0, losses: 0, winSum: 0, lossSum: 0 };
      st.trades = []; st.curve = []; st.pos = null; st.combo = {};
      st.lastExitBar = -10; st.init = true;
    }
    for (let i = from; i <= to; i++) {
      const bar = bars[i];
      if (st.dayKey !== bar.d) { st.dayKey = bar.d; st.dayLoss = 0; }
      if (st.pause > 0) st.pause--;
      let pos = st.pos;
      const wasIn = !!pos;

      /* intrabar exits */
      if (pos && i > pos.entryBar) {
        const dir = pos.dir;
        if (dir === 1) {
          if (rm.tpType === "trail") {
            if (pos.trailActivated) {
              const cand = bar.h * (1 - pos.trailDistPct);
              if (cand > pos.stop) pos.stop = cand;
              if (bar.l <= pos.stop) { this._closeTrade(cfg, st, i, pos.stop, "trailing stop"); pos = null; }
            } else {
              const act = pos.entry * (1 + rm.trailActivate / 100);
              if (bar.h >= act) {
                pos.trailActivated = true;
                pos.stop = Math.max(pos.stop != null ? pos.stop : 0, bar.h * (1 - pos.trailDistPct));
                if (bar.l <= pos.stop) { this._closeTrade(cfg, st, i, pos.stop, "trailing stop"); pos = null; }
              }
            }
          }
          if (pos) {
            if (pos.stop != null && bar.l <= pos.stop) { this._closeTrade(cfg, st, i, pos.stop, "stop-loss"); pos = null; }
            else if (pos.tp != null && bar.h >= pos.tp) { this._closeTrade(cfg, st, i, pos.tp, "take-profit"); pos = null; }
          }
        } else {
          if (rm.tpType === "trail") {
            if (pos.trailActivated) {
              const cand2 = bar.l * (1 + pos.trailDistPct);
              if (pos.stop == null || cand2 < pos.stop) pos.stop = cand2;
              if (bar.h >= pos.stop) { this._closeTrade(cfg, st, i, pos.stop, "trailing stop"); pos = null; }
            } else {
              const act2 = pos.entry * (1 - rm.trailActivate / 100);
              if (bar.l <= act2) {
                pos.trailActivated = true;
                pos.stop = pos.stop != null
                  ? Math.min(pos.stop, bar.l * (1 + pos.trailDistPct))
                  : bar.l * (1 + pos.trailDistPct);
                if (bar.h >= pos.stop) { this._closeTrade(cfg, st, i, pos.stop, "trailing stop"); pos = null; }
              }
            }
          }
          if (pos) {
            if (pos.stop != null && bar.h >= pos.stop) { this._closeTrade(cfg, st, i, pos.stop, "stop-loss"); pos = null; }
            else if (pos.tp != null && bar.l <= pos.tp) { this._closeTrade(cfg, st, i, pos.tp, "take-profit"); pos = null; }
          }
        }
      }
      if (wasIn && !st.pos) st.lastExitBar = i;

      /* entries & flip exits */
      const dailyOK = (st.dayLoss < cm.initialCapital * rm.maxDailyLoss / 100);
      if (i >= cfg.warmup) {
        const s = cfg.evaluate(cfg.strategy, ctx, i, st.combo);
        if (!st.pos) {
          if (!st.halted && st.pause <= 0 && dailyOK && i > st.lastExitBar && s.dir !== 0) {
            const opened = this._openPosition(cfg, st, i, s.dir, s.src);
            if (!opened) st.skipped = (st.skipped || 0) + 1;
          }
        } else if (s.dir === -st.pos.dir) {
          this._closeTrade(cfg, st, i, ctx.closes[i], "signal reversal");
          st.lastExitBar = i;
        }
      }

      /* mark to market, peak, drawdown halt */
      const eq = st.cash + (st.pos ? st.pos.dir * st.pos.qty * bar.c : 0);
      st.equity = eq;
      st.curve.push([bar.d, eq]);
      if (eq > st.peak) st.peak = eq;
      const dd = (st.peak - eq) / st.peak * 100;
      if (!st.halted && dd >= (cm.maxDrawdown || 100)) {
        st.halted = true;
        if (st.pos) this._closeTrade(cfg, st, i, bar.c, "max drawdown halt");
      }
      if (i === to && st.pos) this._closeTrade(cfg, st, i, bar.c, "end of data");
    }
  }
}
