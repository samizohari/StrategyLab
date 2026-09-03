/* domain/indicators.js — full-series technical indicators (pure, O(n)) */
"use strict";

export function sma(vals, p) {
  const out = new Array(vals.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < vals.length; i++) {
    sum += vals[i];
    if (i >= p) sum -= vals[i - p];
    if (i >= p - 1) out[i] = sum / p;
  }
  return out;
}

export function ema(vals, p) {
  const out = new Array(vals.length).fill(NaN);
  const k = 2 / (p + 1);
  let seed = 0;
  for (let i = 0; i < vals.length; i++) {
    if (i < p - 1) { seed += vals[i]; continue; }
    if (i === p - 1) { seed = (seed + vals[i]) / p; out[i] = seed; }
    else { seed = vals[i] * k + seed * (1 - k); out[i] = seed; }
  }
  return out;
}

export function rsi(closes, p = 14) {
  const out = new Array(closes.length).fill(NaN);
  let ag = 0, al = 0;
  for (let i = 1; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1];
    const g = ch > 0 ? ch : 0, l = ch < 0 ? -ch : 0;
    if (i <= p) {
      ag += g; al += l;
      if (i === p) { ag /= p; al /= p; const rs0 = al === 0 ? 100 : ag / al; out[i] = 100 - 100 / (1 + rs0); }
    } else {
      ag = (ag * (p - 1) + g) / p;
      al = (al * (p - 1) + l) / p;
      const rs = al === 0 ? 100 : ag / al;
      out[i] = 100 - 100 / (1 + rs);
    }
  }
  return out;
}

export function macd(closes, f = 12, s = 26, sig = 9) {
  const ef = ema(closes, f), es = ema(closes, s);
  const line = closes.map((_, i) => (isNaN(ef[i]) || isNaN(es[i])) ? NaN : ef[i] - es[i]);
  const signal = new Array(closes.length).fill(NaN);
  const hist = new Array(closes.length).fill(NaN);
  const k = 2 / (sig + 1);
  let seed = 0, seeded = false;
  for (let i = 0; i < closes.length; i++) {
    if (isNaN(line[i])) continue;
    if (!seeded) {
      let cnt = 0, s2 = 0;
      for (let j = i; j < closes.length && cnt < sig; j++) {
        if (isNaN(line[j])) break;
        s2 += line[j]; cnt++;
        if (cnt === sig) { seed = s2 / sig; seeded = true; signal[j] = seed; hist[j] = line[j] - seed; i = j; break; }
      }
      continue;
    }
    seed = line[i] * k + seed * (1 - k);
    signal[i] = seed;
    hist[i] = line[i] - seed;
  }
  return { macd: line, signal, hist };
}

export function bollinger(closes, p = 20, mult = 2) {
  const mid = sma(closes, p);
  const upper = new Array(closes.length).fill(NaN);
  const lower = new Array(closes.length).fill(NaN);
  for (let i = p - 1; i < closes.length; i++) {
    const m = mid[i];
    let ss = 0;
    for (let j = i - p + 1; j <= i; j++) { const d = closes[j] - m; ss += d * d; }
    const sd = Math.sqrt(ss / p);
    upper[i] = m + mult * sd;
    lower[i] = m - mult * sd;
  }
  return { mid, upper, lower };
}

export function atr(bars, p = 14) {
  const n = bars.length;
  const tr = new Array(n).fill(NaN);
  const out = new Array(n).fill(NaN);
  for (let i = 1; i < n; i++) {
    const h = bars[i].h, l = bars[i].l, pc = bars[i - 1].c;
    tr[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
  }
  let seed = 0;
  for (let i = 1; i < n; i++) {
    if (i <= p) { seed += tr[i]; if (i === p) { seed /= p; out[i] = seed; } }
    else { seed = (seed * (p - 1) + tr[i]) / p; out[i] = seed; }
  }
  return out;
}


export function linregLine(vals, p) {
  const n = vals.length;
  const line = new Array(n).fill(NaN);
  const slope = new Array(n).fill(NaN);
  const mean = new Array(n).fill(NaN);
  const mX = (p - 1) / 2;
  const denom = p * (p * p - 1) / 12; // sum (x - meanX)^2
  for (let i = p - 1; i < n; i++) {
    let sy = 0, sxy = 0;
    for (let j = i - p + 1, k = 0; j <= i; j++, k++) {
      sy += vals[j];
      sxy += (k - mX) * vals[j];
    }
    const meanY = sy / p;
    const b = sxy / denom;                 // slope per bar
    const a = meanY - b * mX;
    line[i] = a + b * (p - 1);             // fitted value at the right edge (current bar)
    slope[i] = b;
    mean[i] = meanY;
  }
  return { line, slope, mean };
}

export const Ind = { sma, ema, rsi, macd, bollinger, atr, linregLine };
