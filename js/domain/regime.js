/* domain/regime.js — market regime detector (bull/bear/sideways) + contiguous segments (pure) */
"use strict";
import { sma } from "./indicators.js";

/** regimes(bars, period=120) -> array of 'bull'|'bear'|'side' aligned to bars */
export function regimes(barsArr, period = 120) {
  const closes = barsArr.map(b => b.c);
  const sm = sma(closes, period);
  const rocW = Math.max(20, Math.floor(period / 4));
  const out = new Array(barsArr.length).fill("side");
  for (let i = period; i < barsArr.length; i++) {
    const base = sm[i - rocW];
    if (isNaN(base) || base === 0) { out[i] = "side"; continue; }
    const roc = (sm[i] - base) / base;
    if (barsArr[i].c > sm[i] && roc > 0.004) out[i] = "bull";
    else if (barsArr[i].c < sm[i] && roc < -0.004) out[i] = "bear";
    else out[i] = "side";
  }
  return out;
}

function stdOf(vals) {
  const m = vals.reduce((a, b) => a + b, 0) / vals.length;
  const v = vals.reduce((a, b) => a + (b - m) * (b - m), 0) / vals.length;
  return Math.sqrt(v);
}

/** regimeSegments(bars, minLen=15) -> contiguous regime runs with stats */
export function regimeSegments(barsArr, minLen = 15) {
  const rg = regimes(barsArr);
  const segs = [];
  let cur = null;
  for (let i = 0; i < barsArr.length; i++) {
    if (!cur) cur = { regime: rg[i], start: i, end: i };
    else if (rg[i] === cur.regime) cur.end = i;
    else {
      if (cur.end - cur.start + 1 >= minLen) segs.push(cur);
      cur = { regime: rg[i], start: i, end: i };
    }
  }
  if (cur && cur.end - cur.start + 1 >= minLen) segs.push(cur);
  return segs.map(s => {
    const first = barsArr[s.start], last = barsArr[s.end];
    return {
      regime: s.regime, startD: first.d, endD: last.d, startIdx: s.start, endIdx: s.end,
      bars: s.end - s.start + 1, ret: (last.c / first.c - 1) * 100,
      vol: stdOf(barsArr.slice(s.start, s.end + 1).map(b => b.c))
    };
  });
}

export const Regime = { regimes, regimeSegments };
