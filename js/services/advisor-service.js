/* services/advisor-service.js — local strategy recommendation engine (use case layer).
   Deterministic, offline "AI-lite" advisor: reads market state (trend/regime/volatility)
   and the trader's own result history to recommend concrete, validated strategy drafts. */
"use strict";
import { sma, atr } from "../domain/indicators.js";
import { regimeSegments } from "../domain/regime.js";
import { U } from "../core/utils.js";

export class AdvisorService {
  constructor({ market, strategies, results, ids, clock }) {
    this.market = market;
    this.strategies = strategies;
    this.results = results;
    this.ids = ids;
    this.clock = clock;
  }

  /** Numeric snapshot of market state used by every recommendation. */
  marketSummary() {
    const bars = this.market.bars();
    if (!bars.length) return null;
    const closes = bars.map(b => b.c);
    const n = closes.length;
    const last = closes[n - 1];
    const sma50 = sma(closes, Math.min(50, n));
    const sma200 = n >= 200 ? sma(closes, 200) : sma50;
    const atrArr = atr(bars, 14);

    // recent window stats (last 250 bars or all)
    const win = Math.min(250, n);
    const seg = bars.slice(n - win);
    const segCloses = closes.slice(n - win);
    const ret60 = closes[n - 1] / closes[Math.max(0, n - 61)] - 1;
    const ret20 = closes[n - 1] / closes[Math.max(0, n - 21)] - 1;

    let hi = -Infinity, lo = Infinity;
    const segRet = [];
    for (let i = 1; i < segCloses.length; i++) {
      segRet.push(segCloses[i] / segCloses[i - 1] - 1);
      if (segCloses[i] > hi) hi = segCloses[i];
      if (segCloses[i] < lo) lo = segCloses[i];
    }
    const mean = segRet.reduce((a, b) => a + b, 0) / Math.max(1, segRet.length);
    const vol = Math.sqrt(segRet.reduce((a, b) => a + (b - mean) * (b - mean), 0) / Math.max(1, segRet.length)) * Math.sqrt(252) * 100;
    const atrPct = (atrArr[n - 1] / last) * 100;
    const s50 = sma50[n - 1], s200 = sma200[n - 1];

    // regime mix across full history
    const segs = regimeSegments(bars, 40);
    const mix = { bull: 0, bear: 0, side: 0 };
    segs.forEach(s => { mix[s.regime] += s.bars; });
    const totalMix = Math.max(1, segs.reduce((a, s) => a + s.bars, 0));
    const mixPct = { bull: mix.bull / totalMix * 100, bear: mix.bear / totalMix * 100, side: mix.side / totalMix * 100 };

    // 52w range position
    const yearWin = bars.slice(-Math.min(252, n));
    let yHi = -Infinity, yLo = Infinity;
    yearWin.forEach(b => { if (b.h > yHi) yHi = b.h; if (b.l < yLo) yLo = b.l; });
    const rangePos = yHi > yLo ? (last - yLo) / (yHi - yLo) * 100 : 50;

    let trend = "side";
    if (last > s200 * 1.02 && s50 > s200) trend = "bull";
    else if (last < s200 * 0.98 && s50 < s200) trend = "bear";
    const volLabel = vol > 30 ? "high" : vol > 16 ? "elevated" : vol < 10 ? "low" : "moderate";
    const strength = Math.min(100, Math.max(0, Math.abs(last / s200 - 1) * 400 + (s50 > s200 ? 20 : 0)));

    return {
      bars: n, last: U.round(last, 2), ret20: U.round(ret20 * 100, 2), ret60: U.round(ret60 * 100, 2),
      trend, trendStrength: U.round(strength, 1), annVol: U.round(vol, 1), atrPct: U.round(atrPct, 2),
      volLabel, rangePos: U.round(rangePos, 1), rangeHi: U.round(yHi, 2), rangeLo: U.round(yLo, 2),
      regimeMix: { bull: U.round(mixPct.bull, 0), bear: U.round(mixPct.bear, 0), side: U.round(mixPct.side, 0) },
      summary: n
        ? "Price $" + last.toFixed(2) + " in a " + trend + " regime (" + strength.toFixed(0) + "% strength), " +
          volLabel + " volatility (" + vol.toFixed(0) + "% ann.), 60d return " + (ret60 * 100).toFixed(1) + "%, " +
          "range position " + rangePos.toFixed(0) + "% of 52w range."
        : ""
    };
  }

  /** Deterministic local recommendations -> array of draft entities (unsaved). */
  localRecommendations() {
    const m = this.marketSummary();
    if (!m) return [];
    const out = [];
    const draft = (name, type, params, risk, cap) => {
      const s = this.strategies.create(name, type);
      s.strategyLogic.params = Object.assign(s.strategyLogic.params, params);
      if (risk) s.riskManagement = Object.assign(s.riskManagement, risk);
      if (cap) s.capitalManagement = Object.assign(s.capitalManagement, cap);
      return s;
    };
    const volAdjStop = m.volLabel === "high" ? 1.2 : m.volLabel === "low" ? 0.6 : 1;

    if (m.trend === "bull") {
      out.push({
        kind: "Trend following (bull regime)",
        draft: draft("AI: Bull Trend Rider", "MA_CROSS",
          { fastMA: 20, slowMA: 60, fastType: "ema", slowType: "ema", signalType: "cross" },
          { stopType: "atr", stopATR: 2.4 * volAdjStop, tpType: "trail", trailActivate: 1.5, trailDist: volAdjStop, riskPerTrade: 1.2, maxDailyLoss: 4, maxConsecLosses: 3, pauseBars: 5 },
          { positionSizing: "risk", maxPositionPct: 60, compounding: true }),
        reasoning: "Price trades above its 200-period average with the 50 above it (" + m.trendStrength + "% strength). EMAs 20/60 ride the trend; a wide ATR stop avoids noise; trailing profit locks gains. Daily risk is capped at 4%."
      });
      out.push({
        kind: "Momentum pullback (bull)",
        draft: draft("AI: MACD Momentum", "MACD",
          { fast: 8, slow: 21, signal: 5, mode: "cross" },
          { stopType: "atr", stopATR: 2 * volAdjStop, tpType: "trail", trailActivate: 1, trailDist: 0.8 * volAdjStop, riskPerTrade: 1, maxDailyLoss: 4, maxConsecLosses: 4, pauseBars: 4 },
          { positionSizing: "risk", maxPositionPct: 50, compounding: true }),
        reasoning: "Faster MACD (8/21/5) catches the shorter pullback waves common in this " + m.volLabel + "-volatility uptrend. Risk 1% per trade, max 4% daily."
      });
    } else if (m.trend === "bear") {
      out.push({
        kind: "Bear regime: short rallies",
        draft: draft("AI: Bear Rally Fader", "MA_CROSS",
          { fastMA: 15, slowMA: 40, fastType: "ema", slowType: "ema", signalType: "cross" },
          { stopType: "atr", stopATR: 2.2 * volAdjStop, tpType: "pct", takeProfit: 3, riskPerTrade: 1.2, maxDailyLoss: 4, maxConsecLosses: 3, pauseBars: 5 },
          { positionSizing: "risk", maxPositionPct: 55, compounding: true }),
        reasoning: "Price sits below the long average in a bear regime (" + m.trendStrength + "% strength). The cross engine shorts bounces with an ATR stop and takes fixed 3% profits."
      });
      out.push({
        kind: "Breakdown continuation (bear)",
        draft: draft("AI: Support Break Hunter", "S_R_BREAK",
          { lookback: 25, mode: "breakout" },
          { stopType: "atr", stopATR: 1.8 * volAdjStop, tpType: "trail", trailActivate: 1, trailDist: 0.7 * volAdjStop, riskPerTrade: 1, maxDailyLoss: 4, maxConsecLosses: 4, pauseBars: 4 },
          { positionSizing: "risk", maxPositionPct: 50, compounding: true }),
        reasoning: "Breaking 25-bar support in a downtrend tends to extend. Tight ATR stop, trailing profit, 1% risk."
      });
    } else {
      out.push({
        kind: "Range regime: mean reversion",
        draft: draft("AI: Range Fader", "RSI",
          { period: 14, overbought: 72, oversold: 28, mode: "reversion" },
          { stopType: "atr", stopATR: 1.6 * volAdjStop, tpType: "pct", takeProfit: 2.5, riskPerTrade: 1, maxDailyLoss: 3.5, maxConsecLosses: 3, pauseBars: 5 },
          { positionSizing: "risk", maxPositionPct: 50, compounding: true }),
        reasoning: "Sideways tape (" + m.regimeMix.side + "% of history sideways, 52w range position " + m.rangePos + "%). RSI extremes mean-revert; take quick 2.5% profits, tight stops."
      });
      out.push({
        kind: "Range regime: band breakout",
        draft: draft("AI: Band Breakout", "BOLL",
          { period: 20, mult: 2, mode: "breakout" },
          { stopType: "atr", stopATR: 2 * volAdjStop, tpType: "trail", trailActivate: 1, trailDist: 1 * volAdjStop, riskPerTrade: 1.2, maxDailyLoss: 4, maxConsecLosses: 3, pauseBars: 5 },
          { positionSizing: "risk", maxPositionPct: 55, compounding: true }),
        reasoning: "Volatility " + m.volLabel + " (" + m.annVol + "% ann.). Breakouts beyond 2-sigma bands are traded with a trend-following trailing exit."
      });
    }
    // universal balanced pick as third option
    out.push({
      kind: "Balanced all-market default",
      draft: draft("AI: Balanced MACD", "MACD",
        { fast: 12, slow: 26, signal: 9, mode: "cross" },
        { stopType: "pct", stopLoss: 2 * volAdjStop, tpType: "trail", trailActivate: 1.5, trailDist: 1.2 * volAdjStop, riskPerTrade: 1, maxDailyLoss: 4, maxConsecLosses: 3, pauseBars: 5 },
        { positionSizing: "risk", maxPositionPct: 50, compounding: true }),
      reasoning: "Classic MACD cross with balanced risk in any regime. Suggested capital split alongside a regime-specific pick."
    });
    out.push({
      kind: "Trendline structure trade (AI)",
      draft: draft("AI: Trendline Rider", "TRENDLINE",
        { lookback: 50, mode: "dual", minSlopePct: 0.01, bufferPct: 0 },
        { stopType: "atr", stopATR: 2.2 * volAdjStop, tpType: "trail", trailActivate: 1.2, trailDist: 1.0 * volAdjStop, riskPerTrade: 1.2, maxDailyLoss: 4, maxConsecLosses: 3, pauseBars: 5 },
        { positionSizing: "risk", maxPositionPct: 55, compounding: true }),
      reasoning: "Rule: buy when price closes ABOVE the rising bullish trendline (regression of lows); sell when it closes BELOW the falling bearish trendline (regression of highs). Volatility " + m.volLabel + " (" + m.annVol + "% ann.) — the ATR stop is scaled to it, profit is trailed, 1.2% risk per trade."
    });
    return out.map(r => Object.assign(r, { market: m.summary }));
  }

  /** Suggest concrete tweaks for one strategy based on its latest saved result. */
  suggestTweaks(strategyId) {
    const s = this.strategies.byId(strategyId);
    if (!s) return { ok: false, msg: "Strategy not found." };
    const r = this.results.list().find(x => x.strategyId === strategyId);
    if (!r) return { ok: true, notes: ["No backtest result yet — run one, then ask me again."] };
    const m = r.metrics || {};
    const notes = [];
    const rm = s.riskManagement, cm = s.capitalManagement;
    if ((m.totalTrades || 0) < 15) notes.push("Only " + (m.totalTrades || 0) + " trades in the sample — conclusions are weak; widen the date range.");
    else {
      if (m.winRate != null && m.winRate < 42 && m.profitFactor != null && m.profitFactor < 1.2)
        notes.push("Win rate " + U.round(m.winRate, 1) + "% with profit factor " + U.round(m.profitFactor, 2) + " — consider a stronger trend filter (raise the slow MA) or reversion mode.");
      if (m.maxDrawdown != null && Math.abs(m.maxDrawdown) > (cm.maxDrawdown || 25) * 0.7)
        notes.push("Max drawdown " + U.round(m.maxDrawdown, 1) + "% approaches your halt — cut risk per trade to " + Math.max(0.5, U.round((rm.riskPerTrade || 1) * 0.7, 1)) + "% or lower position cap.");
      if (m.winRate != null && m.winRate > 55 && m.avgWinLoss != null && m.avgWinLoss < 0.9)
        notes.push("High win rate but win/loss ratio " + U.round(m.avgWinLoss, 2) + " — let winners run: switch to trailing take-profit with a wider trail.");
      if (m.profitFactor != null && m.profitFactor >= 1.6 && m.winRate != null && m.winRate > 45)
        notes.push("Healthy edge (PF " + U.round(m.profitFactor, 2) + "). Consider compounding on and risk per trade " + Math.min(2, U.round((rm.riskPerTrade || 1) * 1.15, 1)) + "%.");
      if (!notes.length) notes.push("Profile looks balanced (" + U.round(m.totalReturn || 0, 1) + "% return, PF " + (m.profitFactor == null ? "n/a" : U.round(m.profitFactor, 2)) + "). Keep parameters; monitor regime changes.");
    }
    if (rm.stopType === "none") notes.push("No stop-loss is set — that is dangerous on gold. Add a fixed % or ATR stop.");
    if (!cm.compounding) notes.push("Compounding is off — consider enabling to grow equity in winning regimes.");
    return { ok: true, notes };
  }
}
