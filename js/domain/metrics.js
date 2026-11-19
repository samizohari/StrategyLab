/* domain/metrics.js — performance metrics + drawdown series (pure) */
"use strict";

/** Bars per year implied by the bar labels: 252 daily, 52 weekly, 12 monthly,
 *  and 252 sessions x 390 minutes / bar size for intraday data. */
export function periodsPerYear(dates) {
  if (!dates || dates.length < 3) return 252;
  const ms = [];
  for (let i = 1; i < Math.min(dates.length, 60); i++) {
    const a = Date.parse(String(dates[i - 1]).replace(" ", "T"));
    const b = Date.parse(String(dates[i]).replace(" ", "T"));
    if (!isNaN(a) && !isNaN(b) && b > a) ms.push(b - a);
  }
  if (!ms.length) return 252;
  ms.sort((a, b) => a - b);
  const gapMin = ms[Math.floor(ms.length / 2)] / 60000;
  if (!gapMin) return 252;
  if (gapMin < 24 * 60) return Math.max(1, Math.round(252 * 390 / gapMin));
  const days = gapMin / (24 * 60);
  if (days <= 3.5) return 252;
  if (days <= 10) return 52;
  return 12;
}

/** computeMetrics(curve, trades, initialCapital, barPerYear)
 *  curve: [[date, equity], ...]  trades: [{pnl, holdBars, entry, qty}, ...]
 *  barPerYear defaults to 252 (daily bars) and only affects Sharpe annualisation.
 *  Returns metric object with nulls for undefined values. */
export function computeMetrics(curve, trades, initialCapital, periodsPerYr) {
  const m = {
    winRate: null, totalReturn: null, sharpe: null, maxDrawdown: null, avgWinLoss: null,
    profitFactor: null, totalTrades: 0, winningTrades: 0, losingTrades: 0, totalFees: 0,
    bestTrade: null, worstTrade: null, avgHold: null, exposure: null
  };
  if (!curve || curve.length < 1) return m;
  const start = curve[0][1], end = curve[curve.length - 1][1];
  m.totalReturn = start > 0 ? (end / start - 1) * 100 : 0;

  if (curve.length > 2) {
    const rs = [];
    let sum = 0;
    for (let i = 1; i < curve.length; i++) { const r = curve[i][1] / curve[i - 1][1] - 1; rs.push(r); sum += r; }
    const mean = sum / rs.length;
    let varr = 0;
    for (const r of rs) varr += (r - mean) * (r - mean);
    const sd = Math.sqrt(varr / (rs.length - 1));
    m.sharpe = sd > 0 ? mean / sd * Math.sqrt(periodsPerYr > 0 ? periodsPerYr : 252) : 0;
  }

  let peak = -Infinity, maxDD = 0;
  for (const p of curve) {
    const eq = p[1];
    if (eq > peak) peak = eq;
    const ddp = (peak - eq) / peak * 100;
    if (ddp > maxDD) maxDD = ddp;
  }
  m.maxDrawdown = -maxDD;

  if (trades && trades.length) {
    m.totalTrades = trades.length;
    let wins = 0, losses = 0, gw = 0, gl = 0, hold = 0, best = -Infinity, worst = Infinity;
    for (const tr of trades) {
      if (tr.pnl >= 0) { wins++; gw += tr.pnl; } else { losses++; gl += -tr.pnl; }
      hold += tr.holdBars || 0;
      if (tr.pnl > best) best = tr.pnl;
      if (tr.pnl < worst) worst = tr.pnl;
    }
    m.winningTrades = wins;
    m.losingTrades = losses;
    m.winRate = wins / trades.length * 100;
    const aw = wins > 0 ? gw / wins : 0, al = losses > 0 ? gl / losses : 0;
    m.avgWinLoss = (wins > 0 && losses > 0 && al > 0) ? aw / al : (wins > 0 && losses === 0 ? null : 0);
    m.profitFactor = gl > 0 ? gw / gl : (gw > 0 ? null : null);
    m.avgHold = trades.length > 0 ? hold / trades.length : null;
    m.exposure = curve.length > 0 ? hold / curve.length * 100 : null;
    m.bestTrade = isFinite(best) ? best : null;
    m.worstTrade = isFinite(worst) ? worst : null;
  }
  return m;
}

export function ddSeries(curve) {
  const out = [];
  let peak = -Infinity;
  for (const p of curve) {
    const eq = p[1];
    if (eq > peak) peak = eq;
    out.push([p[0], peak > 0 ? (eq - peak) / peak * 100 : 0]);
  }
  return out;
}

export const Metrics = { computeMetrics, ddSeries };
