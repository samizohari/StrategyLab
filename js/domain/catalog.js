/* domain/catalog.js — parameter metadata for strategy builder, wizard and optimizer */
"use strict";

export const LOGIC_META = {
  MA_CROSS: {
    label: "Moving Average Crossover",
    help: "Trade the direction of fast MA vs slow MA. Cross mode enters on an actual crossover; Above mode stays in the direction of the faster MA.",
    params: [
      { key: "fastMA", label: "Fast MA period", type: "number", min: 2, max: 250, step: 1, def: 10, help: "Lookback of the fast average." },
      { key: "slowMA", label: "Slow MA period", type: "number", min: 3, max: 500, step: 1, def: 30, help: "Lookback of the slow average. Must exceed fast period." },
      { key: "fastType", label: "Fast MA type", type: "select", opts: [["sma", "SMA"], ["ema", "EMA"]], def: "sma" },
      { key: "slowType", label: "Slow MA type", type: "select", opts: [["sma", "SMA"], ["ema", "EMA"]], def: "sma" },
      { key: "signalType", label: "Signal mode", type: "select", opts: [["cross", "Crossover"], ["above", "Fast above slow"]], def: "cross", help: "cross = enter on crossover events; above = always trade the direction of the faster MA." }
    ]
  },
  RSI: {
    label: "RSI Reversion / Momentum",
    help: "RSI (Wilder). Reversion buys when RSI exits oversold, shorts at overbought. Momentum trades the opposite.",
    params: [
      { key: "period", label: "RSI period", type: "number", min: 2, max: 100, step: 1, def: 14 },
      { key: "overbought", label: "Overbought level", type: "number", min: 55, max: 95, step: 1, def: 70 },
      { key: "oversold", label: "Oversold level", type: "number", min: 5, max: 45, step: 1, def: 30 },
      { key: "mode", label: "Mode", type: "select", opts: [["reversion", "Mean reversion"], ["momentum", "Momentum"]], def: "reversion" }
    ]
  },
  MACD: {
    label: "MACD",
    help: "Moving Average Convergence Divergence. Cross = signal-line crosses; Hist = histogram sign; Above = MACD line sign.",
    params: [
      { key: "fast", label: "Fast EMA", type: "number", min: 2, max: 100, step: 1, def: 12 },
      { key: "slow", label: "Slow EMA", type: "number", min: 3, max: 200, step: 1, def: 26 },
      { key: "signal", label: "Signal EMA", type: "number", min: 2, max: 100, step: 1, def: 9 },
      { key: "mode", label: "Mode", type: "select", opts: [["cross", "Signal cross"], ["hist", "Histogram sign"], ["above", "MACD above zero"]], def: "cross" }
    ]
  },
  BOLL: {
    label: "Bollinger Bands",
    help: "Breakout enters when price closes beyond a band (expecting continuation); Reversion fades moves back inside the bands.",
    params: [
      { key: "period", label: "Band period", type: "number", min: 5, max: 300, step: 1, def: 20 },
      { key: "mult", label: "Std-dev multiplier", type: "number", min: 1, max: 4, step: 0.1, def: 2 },
      { key: "mode", label: "Mode", type: "select", opts: [["breakout", "Breakout"], ["reversion", "Mean reversion"]], def: "breakout" }
    ]
  },
  S_R_BREAK: {
    label: "Support / Resistance Breakout",
    help: "Resistance = highest high of lookback; Support = lowest low. Breakout enters on close beyond the level; Bounce trades rejection.",
    params: [
      { key: "lookback", label: "Lookback bars", type: "number", min: 5, max: 300, step: 1, def: 20 },
      { key: "mode", label: "Mode", type: "select", opts: [["breakout", "Breakout"], ["bounce", "Bounce"]], def: "breakout" }
    ]
  }
};

export const RISK_META = [
  { key: "stopType", label: "Stop-loss type", type: "select", opts: [["pct", "Fixed %"], ["atr", "ATR-based"], ["none", "None"]], def: "pct", help: "pct = fixed % below entry; atr = N x ATR(14) below entry." },
  { key: "stopLoss", label: "Stop-loss (%)", type: "number", min: 0.1, max: 50, step: 0.1, def: 2, help: "Applies when stop type is Fixed %." },
  { key: "stopATR", label: "Stop-loss (ATR x)", type: "number", min: 0.5, max: 10, step: 0.1, def: 2, help: "Applies when stop type is ATR-based." },
  { key: "tpType", label: "Take-profit type", type: "select", opts: [["pct", "Fixed %"], ["trail", "Trailing"], ["none", "None"]], def: "pct" },
  { key: "takeProfit", label: "Take-profit (%)", type: "number", min: 0.1, max: 100, step: 0.1, def: 4 },
  { key: "trailActivate", label: "Trailing: activate after profit %", type: "number", min: 0.1, max: 50, step: 0.1, def: 2, help: "Trailing stop activates once unrealized profit reaches this %." },
  { key: "trailDist", label: "Trailing: distance %", type: "number", min: 0.1, max: 20, step: 0.1, def: 1.5, help: "Trailing stop distance once activated." },
  { key: "riskPerTrade", label: "Risk per trade (% equity)", type: "number", min: 0.1, max: 10, step: 0.1, def: 1.5, help: "Risk-based sizing: stop-out loses this % of equity." },
  { key: "maxDailyLoss", label: "Max daily loss (%)", type: "number", min: 0.5, max: 30, step: 0.5, def: 5, help: "Trading halts for the day after realized losses reach this %." },
  { key: "maxConsecLosses", label: "Max consecutive losses", type: "number", min: 1, max: 20, step: 1, def: 3, help: "After this many consecutive losers, trading pauses." },
  { key: "pauseBars", label: "Pause length (bars)", type: "number", min: 1, max: 100, step: 1, def: 5 }
];

export const CAP_META = [
  { key: "initialCapital", label: "Initial capital ($)", type: "number", min: 100, max: 100000000, step: 100, def: 10000 },
  { key: "positionSizing", label: "Position sizing", type: "select", opts: [["risk", "Risk-based"], ["percentage", "% of equity"], ["fixed", "Fixed units"], ["kelly", "Kelly fraction"]], def: "risk", help: "risk = sized by stop distance so loss = riskPerTrade% of equity; percentage = fixed % of equity; fixed = constant units; kelly = f = W-(1-W)/R using live trade stats, capped at 25%." },
  { key: "positionSize", label: "Position size (% equity)", type: "number", min: 1, max: 100, step: 1, def: 10, help: "Used by percentage sizing." },
  { key: "fixedUnits", label: "Fixed units", type: "number", min: 0.01, max: 100000, step: 0.01, def: 10, help: "Used by fixed sizing (e.g. oz of gold)." },
  { key: "maxPositionPct", label: "Max position (% equity)", type: "number", min: 5, max: 100, step: 5, def: 50, help: "Hard cap on notional exposure." },
  { key: "compounding", label: "Compounding", type: "bool", def: true, help: "Reinvest profits: sizing uses current equity." },
  { key: "maxDrawdown", label: "Max drawdown halt (%)", type: "number", min: 2, max: 100, step: 1, def: 25, help: "Trading stops for the rest of the run if equity falls this % from peak." },
  { key: "feePct", label: "Fees per trade (%)", type: "number", min: 0, max: 2, step: 0.01, def: 0, help: "Round-trip cost as % of notional, deducted per trade." }
];
