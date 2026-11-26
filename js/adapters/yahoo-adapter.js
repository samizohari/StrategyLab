/* adapters/yahoo-adapter.js — Yahoo Finance import + symbol search (infrastructure adapter).
   Browser CORS blocks direct calls, and free CORS proxies are flaky, so the adapter
   walks a retry matrix (allorigins raw, allorigins get-wrapper, corsproxy.io) and,
   for symbol search, falls back to a curated list of Yahoo symbols so the Settings
   selector always has items. Force your own proxy via the `yahoo_proxy` setting
   (full URL with {url} placeholder). */
"use strict";

/* Route matrix. Each route is distinct (no duplicates) and each failure is labelled
   so the import error tells the user which path died and what to do about it. */
const ENCODERS = {
  direct: u => u,
  aoRaw: u => "https://api.allorigins.win/raw?url=" + encodeURIComponent(u),
  aoGet: u => "https://api.allorigins.win/get?url=" + encodeURIComponent(u),
  codetabs: u => "https://api.codetabs.com/v1/proxy/?quest=" + encodeURIComponent(u),
  corsproxy: (u, key) => "https://corsproxy.io/?" + (key ? "key=" + encodeURIComponent(key) + "&" : "") + "url=" + encodeURIComponent(u)
};
const LABELS = {
  direct: "direct (CORS blocked in browsers)",
  aoRaw: "allorigins raw",
  aoGet: "allorigins get",
  codetabs: "codetabs",
  corsproxy: "corsproxy.io"
};
const WRAPPED = { aoGet: true };
const PUBLIC_ROUTES = ["aoRaw", "aoGet", "codetabs"];

/* Timeframes the UI offers. maxDays is Yahoo's lookback limit for that interval
   (0 = no limit); requesting more returns an error or silently truncates. */
export const INTERVALS = [
  { value: "1m", label: "1 minute", maxDays: 7 },
  { value: "5m", label: "5 minutes", maxDays: 60 },
  { value: "15m", label: "15 minutes", maxDays: 60 },
  { value: "30m", label: "30 minutes", maxDays: 60 },
  { value: "60m", label: "1 hour", maxDays: 730 },
  { value: "1d", label: "Daily", maxDays: 0 },
  { value: "1wk", label: "Weekly", maxDays: 0 },
  { value: "1mo", label: "Monthly", maxDays: 0 }
];
/* Day-based spans: Yahoo accepts any <n>d / <n>mo / <n>y range, so intraday
   intervals can use their full allowance (15m -> 60d) instead of a coarse month. */
export const RANGES = [
  { value: "1d", label: "1 day", days: 1 },
  { value: "3d", label: "3 days", days: 3 },
  { value: "7d", label: "1 week", days: 7 },
  { value: "14d", label: "2 weeks", days: 14 },
  { value: "30d", label: "1 month", days: 30 },
  { value: "60d", label: "2 months", days: 60 },
  { value: "90d", label: "3 months", days: 90 },
  { value: "180d", label: "6 months", days: 180 },
  { value: "365d", label: "1 year", days: 365 },
  { value: "730d", label: "2 years", days: 730 },
  { value: "1095d", label: "3 years", days: 1095 },
  { value: "1825d", label: "5 years", days: 1825 },
  { value: "3650d", label: "10 years", days: 3650 },
  { value: "5475d", label: "15 years", days: 5475 },
  { value: "7300d", label: "20 years", days: 7300 },
  { value: "ytd", label: "Year to date", days: 366 },
  { value: "max", label: "All time (max)", days: 100000 }
];
/* Older builds stored month/year tokens ("2y"); keep them working. */
const LEGACY_RANGES = {
  "1d": "1d", "5d": "7d", "1mo": "30d", "3mo": "90d", "6mo": "180d",
  "1y": "365d", "2y": "730d", "5y": "1825d", "10y": "3650d",
  "ytd": "ytd", "max": "max"
};
const INTERVAL_MAP = {};
INTERVALS.forEach(i => { INTERVAL_MAP[i.value] = i; });
const RANGE_MAP = {};
RANGES.forEach(r => { RANGE_MAP[r.value] = r; });

/** Normalise a stored/typed range to a current value (falls back to 2 years). */
export function normRange(range) {
  if (RANGE_MAP[range]) return range;
  if (LEGACY_RANGES[range]) return LEGACY_RANGES[range];
  return "730d";
}

/** Normalise an interval value; unknown values fall back to daily. */
export function normInterval(interval) { return INTERVAL_MAP[interval] ? interval : "1d"; }
export function isIntraday(interval) { return /m$|h$/.test(normInterval(interval)); }

/** Ranges Yahoo will serve for this interval (UI uses it to filter the dropdown). */
export function rangesFor(interval) {
  const max = (INTERVAL_MAP[normInterval(interval)] || {}).maxDays || 0;
  return RANGES.filter(r => !max || r.days <= max);
}

/** Largest allowed range for the interval, e.g. 15m -> 1mo. */
export function maxRangeFor(interval) {
  const list = rangesFor(interval);
  if (!list.length) return "30d";
  const max = (INTERVAL_MAP[normInterval(interval)] || {}).maxDays || 0;
  if (!max) return "max";
  return list.reduce((best, r) => (r.days >= best.days ? r : best), list[0]).value;
}

/** Clamp a range to what the interval supports. Returns { range, clamped }. */
export function clampRange(range, interval) {
  const iv = normInterval(interval);
  const want = normRange(range);
  const max = (INTERVAL_MAP[iv] || {}).maxDays || 0;
  if (!max) return { range: want, clamped: false };
  const r = RANGE_MAP[want];
  if (r.days <= max) return { range: want, clamped: false };
  return { range: maxRangeFor(iv), clamped: true };
}

export function buildYahooUrl(symbol, range, interval) {
  const sym = encodeURIComponent(String(symbol || "GC=F").trim());
  const iv = normInterval(interval);
  const rng = normRange(range);
  return "https://query1.finance.yahoo.com/v8/finance/chart/" + sym +
    "?range=" + rng + "&interval=" + iv +
    "&includePrePost=false&events=div%2Csplit";
}

/** Pure parser: yahoo v8 chart JSON -> sorted OHLCV bars. Exported for tests.
 *  Intraday intervals keep the clock in `d` ("YYYY-MM-DD HH:mm") so bars on the
 *  same day are not collapsed; daily and coarser keep plain "YYYY-MM-DD". */
export function parseYahooChart(data, interval) {
  if (!data || data.chart && data.chart.error) {
    const msg = data && data.chart && data.chart.error && data.chart.error.description || "Yahoo returned an error.";
    return { ok: false, msg };
  }
  const res = data && data.chart && data.chart.result && data.chart.result[0];
  if (!res || !res.timestamp || !res.indicators || !res.indicators.quote || !res.indicators.quote[0]) {
    return { ok: false, msg: "No chart data found for this symbol." };
  }
  const ts = res.timestamp;
  const q = res.indicators.quote[0];
  const intra = isIntraday(interval);
  const bars = [];
  const seen = {};
  for (let i = 0; i < ts.length; i++) {
    const o = q.open && q.open[i], h = q.high && q.high[i], l = q.low && q.low[i],
      c = q.close && q.close[i], v = q.volume && q.volume[i];
    if (o == null || h == null || l == null || c == null) continue;
    const iso = new Date(ts[i] * 1000).toISOString();
    const d = intra ? iso.slice(0, 16).replace("T", " ") : iso.slice(0, 10);
    if (seen[d]) continue;
    seen[d] = 1;
    bars.push({
      d,
      o: Math.round(o * 100) / 100, h: Math.round(h * 100) / 100,
      l: Math.round(l * 100) / 100, c: Math.round(c * 100) / 100,
      v: v == null ? 0 : Math.round(v)
    });
  }
  if (!bars.length) return { ok: false, msg: "Payload parsed but contained no valid bars." };
  bars.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  return { ok: true, bars, meta: res.meta || {}, count: bars.length };
}

/** Pure parser for the Yahoo symbol-search endpoint. */
export function parseYahooQuotes(data) {
  if (!data || !data.quotes) return { ok: false, msg: "No quotes in response." };
  const seen = {};
  const out = [];
  for (const q of data.quotes) {
    const sym = q && q.symbol ? String(q.symbol).trim() : "";
    if (!sym || seen[sym] || !/^[A-Z0-9.\\^=_-]+$/.test(sym)) continue;
    seen[sym] = 1;
    out.push({ symbol: sym, name: q.shortname || q.longname || "", exchange: q.exchange || "", type: q.quoteType || "" });
  }
  if (!out.length) return { ok: false, msg: "No matching symbols found." };
  return { ok: true, quotes: out };
}

/** Curated Yahoo symbols used when the search API is unreachable (dropdown stays filled). */
export const FALLBACK_SYMBOLS = [
  { symbol: "GC=F", name: "Gold", exchange: "CMX" },
  { symbol: "XAUUSD=X", name: "Gold Spot / USD", exchange: "CCY" },
  { symbol: "XAU=X", name: "Gold (London)", exchange: "CCY" },
  { symbol: "SI=F", name: "Silver", exchange: "CMX" },
  { symbol: "XAGUSD=X", name: "Silver Spot / USD", exchange: "CCY" },
  { symbol: "PL=F", name: "Platinum", exchange: "NYM" },
  { symbol: "PA=F", name: "Palladium", exchange: "NYM" },
  { symbol: "CL=F", name: "Crude Oil WTI", exchange: "NYM" },
  { symbol: "NG=F", name: "Natural Gas", exchange: "NYM" },
  { symbol: "ES=F", name: "S&P 500 Futures", exchange: "CME" },
  { symbol: "NQ=F", name: "Nasdaq 100 Futures", exchange: "CME" },
  { symbol: "YM=F", name: "Dow Jones Futures", exchange: "CBOT" },
  { symbol: "DX=F", name: "US Dollar Index", exchange: "NYB" },
  { symbol: "EURUSD=X", name: "EUR/USD", exchange: "CCY" },
  { symbol: "GBPUSD=X", name: "GBP/USD", exchange: "CCY" },
  { symbol: "USDJPY=X", name: "USD/JPY", exchange: "CCY" },
  { symbol: "BTC-USD", name: "Bitcoin USD", exchange: "CCC" },
  { symbol: "ETH-USD", name: "Ethereum USD", exchange: "CCC" },
  { symbol: "^GSPC", name: "S&P 500", exchange: "PCX" },
  { symbol: "^IXIC", name: "Nasdaq Composite", exchange: "PCX" },
  { symbol: "^DJI", name: "Dow Jones", exchange: "DJI" },
  { symbol: "GLD", name: "SPDR Gold Shares", exchange: "PCX" },
  { symbol: "SLV", name: "iShares Silver Trust", exchange: "PCX" },
  { symbol: "MGC=F", name: "Micro Gold Futures", exchange: "CMX" }
];

export class YahooFinanceAdapter {
  /** @param {{settings, log, fetchFn?, timeoutMs?}} deps */
  constructor(deps) {
    this.settings = deps.settings;
    this.log = deps.log || null;
    this.fetchFn = deps.fetchFn || ((...a) => fetch(...a));
    this.timeoutMs = deps.timeoutMs || 25000;
  }
  _attemptUrls(url) {
    const forced = this.settings.get("yahoo_proxy");
    const key = this.settings.get("yahoo_proxy_key");
    const list = [];
    if (forced) {
      const raw = String(forced);
      list.push({ url: raw.replace("{url}", encodeURIComponent(url)), wrap: /allorigins\/get/.test(raw), note: "custom relay" });
    } else {
      list.push({ url: ENCODERS.direct(url), wrap: false, note: LABELS.direct });
    }
    PUBLIC_ROUTES.forEach(k => list.push({ url: ENCODERS[k](url), wrap: !!WRAPPED[k], note: LABELS[k] }));
    if (key) list.push({ url: ENCODERS.corsproxy(url, key), wrap: false, note: LABELS.corsproxy });
    return list;
  }

  /** Turn the raw route failures into one actionable sentence. */
  _advice(detail) {
    if (/HTTP 401/.test(detail)) {
      return "Yahoo refused the request (HTTP 401) — the free proxy now requires an API key. Add your own relay URL, or switch the provider to Twelve Data, in Settings → Market data source.";
    }
    if (/HTTP 429/.test(detail)) {
      return "Yahoo rate-limited this network (HTTP 429). Wait a few minutes, or switch the provider to Twelve Data in Settings → Market data source.";
    }
    return "Could not reach Yahoo Finance from this browser: direct calls are blocked by CORS and the public proxies failed. Add your own relay URL, or switch the provider to Twelve Data, in Settings → Market data source.";
  }
  async _fetchJSON(entry) {
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), this.timeoutMs) : null;
    try {
      const r = await this.fetchFn(entry.url, Object.assign(
        { method: "GET", headers: { Accept: "application/json" } },
        ctrl ? { signal: ctrl.signal } : {}
      ));
      if (!r.ok) throw new Error("HTTP " + r.status);
      let data = await r.json();
      if (entry.wrap) {
        // allorigins "get" returns { contents: "<json string>" }
        if (data && typeof data.contents === "string") data = JSON.parse(data.contents);
      }
      return { data };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  async _request(url, parser) {
    const attempts = this._attemptUrls(url);
    const tried = [];
    let lastErr = null;
    for (const entry of attempts) {
      try {
        const { data } = await this._fetchJSON(entry);
        const parsed = parser(data);
        if (parsed.ok) return parsed;
        lastErr = new Error(parsed.msg || "parse error");
      } catch (e) {
        lastErr = e;
        tried.push((entry.note || "proxy") + ":" + (e.message || e));
      }
    }
    const detail = tried.join(" | ");
    return {
      ok: false, msg: this._advice(detail), detail, attempts: tried,
      lastError: lastErr && lastErr.message
    };
  }

  /** fetchChart(symbol, range, interval) — OHLCV import at the chosen timeframe.
   *  The range is clamped to what Yahoo serves for that interval (e.g. 15m -> 1mo). */
  async fetchChart(symbol, range, interval) {
    const iv = normInterval(interval);
    const cl = clampRange(range, iv);
    const res = await this._request(buildYahooUrl(symbol, cl.range, iv), d => parseYahooChart(d, iv));
    if (res.ok) {
      res.interval = iv;
      res.range = cl.range;
      res.requestedRange = range;
      res.clamped = cl.clamped;
    }
    return res;
  }

  /** fetchSymbols(query) — symbol list from Yahoo; falls back to the curated list. */
  async fetchSymbols(query) {
    const q = String(query || "gold").trim();
    const url = "https://query1.finance.yahoo.com/v1/finance/search?q=" + encodeURIComponent(q) +
      "&quotesCount=30&newsCount=0&listsCount=0";
    const res = await this._request(url, parseYahooQuotes);
    if (res.ok) {
      res.source = "live";
      try { this.settings.set("yahoo_symbols_cache", { at: Date.now(), quotes: res.quotes }); } catch (e) { /* ignore */ }
      return res;
    }
    let cache = null;
    try { cache = this.settings.get("yahoo_symbols_cache"); } catch (e) { cache = null; }
    if (cache && cache.quotes && cache.quotes.length) {
      return {
        ok: true, source: "cache", quotes: cache.quotes,
        msg: "Yahoo unreachable (" + (res.lastError || "network") + ") — using the cached symbol list from " +
          new Date(cache.at).toLocaleString() + "."
      };
    }
    return {
      ok: true, fallback: true, source: "builtin",
      quotes: FALLBACK_SYMBOLS.slice(),
      msg: "Yahoo search unreachable (" + (res.lastError || "network") + ") — showing the built-in Yahoo symbol list instead."
    };
  }
}
