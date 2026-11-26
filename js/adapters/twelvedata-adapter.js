/* adapters/twelvedata-adapter.js — Twelve Data OHLCV import (infrastructure).
   Twelve Data sends `Access-Control-Allow-Origin: *`, so this path works from a
   plain browser with no CORS proxy. It needs a free API key (800 requests/day);
   the key is stored locally in settings and only ever sent to api.twelvedata.com. */
"use strict";

/* Twelve Data interval codes and rough bars per day, used to size outputsize. */
const INTERVALS = { "1m": ["1min", 400], "5m": ["5min", 80], "15m": ["15min", 27], "30m": ["30min", 14], "60m": ["1h", 7], "1d": ["1day", 1], "1wk": ["1week", 0.2], "1mo": ["1month", 0.05] };
const RANGE_DAYS = {
  "1d": 1, "5d": 5, "1mo": 22, "3mo": 66, "6mo": 130, "1y": 260, "2y": 520,
  "5y": 1300, "10y": 2600, "20y": 5000, ytd: 260, max: 5000
};

export function toTwelveInterval(interval) {
  return (INTERVALS[String(interval || "1d")] || INTERVALS["1d"])[0];
}

/** Range + interval -> number of bars to request (capped at Twelve Data's 5000). */
export function outputSize(range, interval) {
  const days = RANGE_DAYS[range] || 520;
  const perDay = (INTERVALS[String(interval || "1d")] || INTERVALS["1d"])[1];
  return Math.max(1, Math.min(5000, Math.round(days * perDay)));
}

/** Yahoo symbol -> Twelve Data symbol. Unknown symbols pass through untouched. */
export function toTwelveSymbol(symbol) {
  const s = String(symbol || "").trim().toUpperCase();
  const map = {
    "GC=F": "XAU/USD", "XAUUSD=X": "XAU/USD", "XAU=X": "XAU/USD", "XAUUSD": "XAU/USD",
    "SI=F": "XAG/USD", "XAGUSD=X": "XAG/USD", "XAG=X": "XAG/USD", "XAGUSD": "XAG/USD",
    "PL=F": "XPT/USD", "PA=F": "XPD/USD",
    "EURUSD=X": "EUR/USD", "GBPUSD=X": "GBP/USD", "USDJPY=X": "USD/JPY",
    "AUDUSD=X": "AUD/USD", "USDCAD=X": "USD/CAD", "USDCHF=X": "USD/CHF",
    "BTC-USD": "BTC/USD", "ETH-USD": "ETH/USD",
    "^GSPC": "SPX", "^IXIC": "IXIC", "^DJI": "DJI", "DX=F": "DXY"
  };
  if (map[s]) return map[s];
  // EURUSD=X -> EUR/USD for any other 6-letter FX pair
  const fx = /^([A-Z]{3})([A-Z]{3})=X$/.exec(s);
  if (fx) return fx[1] + "/" + fx[2];
  return s;
}

/** Prices need more decimals on FX than on gold; keep 2 for high-priced assets. */
export function roundPrice(x) {
  const v = Number(x);
  if (!isFinite(v)) return 0;
  const dp = Math.abs(v) >= 100 ? 2 : Math.abs(v) >= 1 ? 4 : 6;
  const f = Math.pow(10, dp);
  return Math.round(v * f) / f;
}

/** Pure parser: Twelve Data time_series JSON -> { ok, bars, meta, count }. */
export function parseTwelveSeries(data) {
  if (!data) return { ok: false, msg: "Empty response from Twelve Data." };
  if (data.status === "error" || data.code) {
    const m = data.message || ("Twelve Data error " + data.code);
    return { ok: false, msg: m, retryable: /limit|rate/i.test(m) };
  }
  const values = data.values;
  if (!Array.isArray(values) || !values.length) return { ok: false, msg: "No bars returned for this symbol (check the symbol format)." };
  const seen = {};
  const bars = [];
  for (const r of values) {
    const d = String(r.datetime || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || seen[d]) continue;
    const o = Number(r.open), h = Number(r.high), l = Number(r.low), c = Number(r.close);
    if (!isFinite(o) || !isFinite(h) || !isFinite(l) || !isFinite(c)) continue;
    seen[d] = 1;
    bars.push({ d, o: roundPrice(o), h: roundPrice(h), l: roundPrice(l), c: roundPrice(c), v: Math.round(Number(r.volume) || 0) });
  }
  if (!bars.length) return { ok: false, msg: "Payload parsed but contained no valid bars." };
  bars.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  return { ok: true, bars, count: bars.length, meta: data.meta || {} };
}

export class TwelveDataAdapter {
  constructor(deps) {
    this.settings = deps.settings;
    this.fetchFn = deps.fetchFn || ((...a) => fetch(...a));
    this.timeoutMs = deps.timeoutMs || 25000;
  }

  key() { return String(this.settings.get("twelvedata_key") || "").trim(); }

  buildUrl(symbol, range, interval) {
    return "https://api.twelvedata.com/time_series?symbol=" + encodeURIComponent(toTwelveSymbol(symbol)) +
      "&interval=" + encodeURIComponent(toTwelveInterval(interval)) +
      "&order=ASC&outputsize=" + outputSize(range, interval) +
      "&format=JSON&apikey=" + encodeURIComponent(this.key());
  }

  async fetchChart(symbol, range, interval) {
    const key = this.key();
    if (!key) return { ok: false, provider: "twelvedata", msg: "No Twelve Data API key saved — add one in Settings → Market data source." };
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), this.timeoutMs) : null;
    try {
      const r = await this.fetchFn(this.buildUrl(symbol, range, interval), Object.assign(
        { method: "GET", headers: { Accept: "application/json" } },
        ctrl ? { signal: ctrl.signal } : {}
      ));
      if (r.status === 429) return { ok: false, provider: "twelvedata", msg: "Twelve Data rate limit reached (free tier: 8 requests/min, 800/day) — wait a minute and retry." };
      if (r.status === 401 || r.status === 403) return { ok: false, provider: "twelvedata", msg: "Twelve Data rejected the API key (HTTP " + r.status + ") — check it in Settings." };
      if (!r.ok) return { ok: false, provider: "twelvedata", msg: "Twelve Data returned HTTP " + r.status + "." };
      const parsed = parseTwelveSeries(await r.json());
      if (!parsed.ok) return { ok: false, provider: "twelvedata", msg: parsed.msg };
      return Object.assign(parsed, {
        provider: "twelvedata", symbol: toTwelveSymbol(symbol), source: "Twelve Data",
        interval: String(interval || "1d"), range
      });
    } catch (e) {
      const aborted = e && (e.name === "AbortError" || /abort/i.test(e.message || ""));
      return { ok: false, provider: "twelvedata", msg: aborted ? "Twelve Data timed out." : ("Twelve Data unreachable: " + (e.message || e)) };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
