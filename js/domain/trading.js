/* domain/trading.js — indicator context, signal evaluation, combination engine (pure).
   Member strategies are resolved through an injected resolver (dependency inversion),
   so this module never touches storage. */
"use strict";
import { sma, ema, rsi, macd, bollinger, atr } from "./indicators.js";

export function makeContext(bars) {
  const n = bars.length;
  const closes = new Array(n), highs = new Array(n), lows = new Array(n);
  for (let i = 0; i < n; i++) { closes[i] = bars[i].c; highs[i] = bars[i].h; lows[i] = bars[i].l; }
  const cache = {};
  const get = (key, calc) => { if (!(key in cache)) cache[key] = calc(); return cache[key]; };
  return {
    n, bars, closes, highs, lows,
    getMA: (exp, p) => exp ? get("ema" + p, () => ema(closes, p)) : get("sma" + p, () => sma(closes, p)),
    getRSI: p => get("rsi" + p, () => rsi(closes, p)),
    getMACD: (f, s, g) => get("macd" + f + "_" + s + "_" + g, () => macd(closes, f, s, g)),
    getBB: (p, m) => get("bb" + p + "_" + m, () => bollinger(closes, p, m)),
    getATR: p => get("atr" + p, () => atr(bars, p))
  };
}

const nan = v => v == null || isNaN(v);
const ZERO = { dir: 0, score: 0, src: "" };
const sig = (dir, score, src) => ({ dir, score, src: src || "" });

function evalBase(sl, ctx, i) {
  const p = sl.params || {};
  if (i < 0 || i >= ctx.n) return ZERO;
  const g = arr => arr[i];
  switch (sl.type) {
    case "MA_CROSS": {
      const fast = ctx.getMA(p.fastType === "ema" ? 1 : 0, +p.fastMA);
      const slow = ctx.getMA(p.slowType === "ema" ? 1 : 0, +p.slowMA);
      const f = g(fast), s = g(slow);
      if (nan(f) || nan(s)) return ZERO;
      const score = ((f - s) / s) * 1000;
      if (p.signalType === "above") return f > s ? sig(1, score, "fast>slow") : f < s ? sig(-1, score, "fast<slow") : ZERO;
      const pf = nan(fast[i - 1]) ? f : fast[i - 1], ps = nan(slow[i - 1]) ? s : slow[i - 1];
      if (pf <= ps && f > s) return sig(1, score, "MA cross up");
      if (pf >= ps && f < s) return sig(-1, score, "MA cross down");
      return ZERO;
    }
    case "RSI": {
      const arr = ctx.getRSI(+p.period);
      const r = g(arr);
      if (nan(r)) return ZERO;
      const ob = +p.overbought, os = +p.oversold;
      const pr = nan(arr[i - 1]) ? r : arr[i - 1];
      if (p.mode === "reversion") {
        if (pr >= os && r < os) return sig(1, os - r, "RSI exit oversold");
        if (pr <= ob && r > ob) return sig(-1, r - ob, "RSI exit overbought");
        return ZERO;
      }
      if (r > ob) return sig(1, r - ob, "RSI momentum up");
      if (r < os) return sig(-1, os - r, "RSI momentum down");
      return ZERO;
    }
    case "MACD": {
      const m = ctx.getMACD(+p.fast, +p.slow, +p.signal);
      const line = g(m.macd), sigL = g(m.signal);
      if (nan(line)) return ZERO;
      if (p.mode === "hist") { const h = g(m.hist); if (nan(h)) return ZERO; return h > 0 ? sig(1, h, "MACD hist +") : h < 0 ? sig(-1, -h, "MACD hist -") : ZERO; }
      if (p.mode === "above") return line > 0 ? sig(1, line, "MACD>0") : line < 0 ? sig(-1, -line, "MACD<0") : ZERO;
      if (nan(sigL)) return ZERO;
      const pl = nan(m.macd[i - 1]) ? line : m.macd[i - 1], ps = nan(m.signal[i - 1]) ? sigL : m.signal[i - 1];
      if (pl <= ps && line > sigL) return sig(1, line - sigL, "MACD cross up");
      if (pl >= ps && line < sigL) return sig(-1, sigL - line, "MACD cross down");
      return ZERO;
    }
    case "BOLL": {
      const bb = ctx.getBB(+p.period, +p.mult);
      const up = g(bb.upper), lo = g(bb.lower), c = ctx.closes[i];
      if (nan(up) || nan(lo)) return ZERO;
      if (p.mode === "breakout") {
        const pu = nan(bb.upper[i - 1]) ? up : bb.upper[i - 1], pl2 = nan(bb.lower[i - 1]) ? lo : bb.lower[i - 1];
        if (c > up && ctx.closes[i - 1] <= pu) return sig(1, (c - up) / up * 1000, "BB breakout up");
        if (c < lo && ctx.closes[i - 1] >= pl2) return sig(-1, (lo - c) / lo * 1000, "BB breakout down");
        return ZERO;
      }
      if (c < lo) return sig(1, (lo - c) / lo * 1000, "BB reversion up");
      if (c > up) return sig(-1, (c - up) / up * 1000, "BB reversion down");
      return ZERO;
    }
    case "S_R_BREAK": {
      const lb = +p.lookback;
      if (i < lb + 2) return ZERO;
      let res = -Infinity, sup = Infinity;
      for (let j = i - lb; j < i; j++) {
        if (ctx.highs[j] > res) res = ctx.highs[j];
        if (ctx.lows[j] < sup) sup = ctx.lows[j];
      }
      const c = ctx.closes[i];
      if (p.mode === "bounce") {
        if (ctx.lows[i] <= sup && c > sup * 1.002) return sig(1, (c - sup) / sup * 1000, "S/R bounce up");
        if (ctx.highs[i] >= res && c < res * 0.998) return sig(-1, (res - c) / res * 1000, "S/R bounce down");
        return ZERO;
      }
      if (c > res) return sig(1, (c - res) / res * 1000, "Resistance break up");
      if (c < sup) return sig(-1, (sup - c) / sup * 1000, "Support break down");
      return ZERO;
    }
  }
  return ZERO;
}

/* ---- combination engine (AND / OR / WEIGHTED / SEQUENTIAL) ---- */
function resolveMembers(combine, resolve) {
  return (combine.memberIds || []).map(resolve).filter(Boolean);
}
function memberSignals(combine, ctx, i, resolve, evalFull) {
  return resolveMembers(combine, resolve).map(m => {
    const s = evalFull(m, ctx, i);
    return { strat: m, dir: s.dir, score: s.score, src: s.src };
  });
}
function evalCombo(strategy, ctx, i, comboState, resolve, evalFull) {
  const cb = strategy.combine;
  if (!cb || !cb.enabled) return evalBase(strategy.strategyLogic, ctx, i);
  const mems = memberSignals(cb, ctx, i, resolve, evalFull);
  if (!mems.length) return ZERO;
  let weights = {};
  try { weights = cb.weights || {}; } catch (e) { weights = {}; }
  const w = m => { const x = +weights[m.strat.id]; return isFinite(x) ? x : 1; };
  const anyNonZero = () => mems.some(m => m.dir !== 0);
  switch (cb.logic) {
    case "AND": {
      const dirs = mems.filter(m => m.dir !== 0);
      if (dirs.length !== mems.length) return ZERO;
      const d0 = dirs[0].dir;
      for (let k = 1; k < dirs.length; k++) if (dirs[k].dir !== d0) return ZERO;
      let sc = 0; mems.forEach(m => { sc += m.dir * w(m); });
      return sig(d0, sc, "AND consensus");
    }
    case "OR": {
      if (!anyNonZero()) return ZERO;
      let sc2 = 0; mems.forEach(m => { sc2 += m.dir * w(m); });
      if (sc2 === 0) return ZERO;
      return sig(sc2 > 0 ? 1 : -1, Math.abs(sc2), "OR trigger");
    }
    case "WEIGHTED": {
      let sc3 = 0, act = 0;
      mems.forEach(m => { if (m.dir !== 0) { sc3 += m.dir * w(m); act += w(m); } });
      if (act === 0 || Math.abs(sc3) < +cb.threshold) return ZERO;
      return sig(sc3 > 0 ? 1 : -1, Math.abs(sc3), "Weighted vote");
    }
    case "SEQUENTIAL": {
      if (!comboState.seq) comboState.seq = { dir: 0, countdown: 0 };
      const st = comboState.seq;
      const trig = mems[0] || { dir: 0 };
      const conf = mems.length > 1 ? mems[1] : trig;
      if (st.countdown > 0) st.countdown--;
      if (st.countdown <= 0) st.dir = 0;
      if (trig.dir !== 0 && st.dir === 0) { st.dir = trig.dir; st.countdown = Math.max(1, +cb.seqWindow || 5); return ZERO; }
      if (st.dir !== 0 && conf.dir === st.dir) {
        const d2 = st.dir; st.dir = 0; st.countdown = 0;
        return sig(d2, conf.score, "Sequential trigger+confirm");
      }
      if (conf.dir === -st.dir) { st.dir = 0; st.countdown = 0; }
      return ZERO;
    }
  }
  return ZERO;
}

/** createEvaluator({ resolveStrategy }) -> { maxWarmupFor, makeContext, evaluate }
 *  resolveStrategy(id) must return a strategy entity or null (DI). */
export function createEvaluator(deps) {
  const resolve = (deps && deps.resolveStrategy) || (() => null);
  function evalFull(strategy, ctx, i, comboState) {
    if (strategy.strategyLogic.type === "COMBO") return evalCombo(strategy, ctx, i, comboState || {}, resolve, evalFull);
    return evalBase(strategy.strategyLogic, ctx, i);
  }
  function maxWarmupFor(strategy) {
    function walk(s, seen) {
      if (!s || seen[s.id]) return 0;
      seen[s.id] = 1;
      let w = 0;
      const sl = s.strategyLogic;
      if (sl) {
        const p = sl.params || {};
        switch (sl.type) {
          case "MA_CROSS": w = Math.max(w, +p.fastMA + 1, +p.slowMA + 1); break;
          case "RSI": w = Math.max(w, +p.period + 2); break;
          case "MACD": w = Math.max(w, +p.slow + (sl.params.signal || 9) + 5); break;
          case "BOLL": w = Math.max(w, +p.period + 2); break;
          case "S_R_BREAK": w = Math.max(w, +p.lookback + 3); break;
        }
      }
      if (s.combine && s.combine.enabled) s.combine.memberIds.forEach(id => { w = Math.max(w, walk(resolve(id), seen)); });
      return w;
    }
    return walk(strategy, {});
  }
  return { maxWarmupFor, makeContext, evaluate: evalFull };
}

export const Trading = { makeContext, createEvaluator };
