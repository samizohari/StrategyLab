/* adapters/yahoo-adapter.js — Yahoo Finance import + symbol search (infrastructure adapter).
   Browser CORS blocks direct calls, and free CORS proxies are flaky, so the adapter
   walks a retry matrix (allorigins raw, allorigins get-wrapper, corsproxy.io) and,
   for symbol search, falls back to a curated list of Yahoo symbols so the Settings
   selector always has items. Force your own proxy via the `yahoo_proxy` setting
   (full URL with {url} placeholder). */
"use strict";

const ENCODERS = {
  direct: u => u,
  aoRaw: u => "https://api.allorigins.win/raw?url=" + encodeURIComponent(u),
  aoGet: u => "https://api.allorigins.win/get?url=" + encodeURIComponent(u),
  aoRaw2: u => "https://api.allorigins.win/raw?url=" + encodeURIComponent(u),
  aoGet2: u => "https://api.allorigins.win/get?url=" + encodeURIComponent(u),
  corsproxy: u => "https://corsproxy.io/?url=" + encodeURIComponent(u)
};
const ORDER = ["direct", "aoRaw", "aoGet", "aoRaw2", "aoGet2", "corsproxy"];
const WRAPPED = { aoGet: true, aoGet2: true };

export function buildYahooUrl(symbol, range, interval) {
  const sym = encodeURIComponent(String(symbol || "GC=F").trim());
  const rng = ["1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "10y", "ytd", "max"].indexOf(range) >= 0 ? range : "2y";
  return "https://query1.finance.yahoo.com/v8/finance/chart/" + sym +
    "?range=" + rng + "&interval=" + (interval || "1d") +
    "&includePrePost=false&events=div%2Csplit";
}

/** Pure parser: yahoo v8 chart JSON -> sorted OHLCV bars. Exported for tests. */
export function parseYahooChart(data) {
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
  const bars = [];
  const seen = {};
  for (let i = 0; i < ts.length; i++) {
    const o = q.open && q.open[i], h = q.high && q.high[i], l = q.low && q.low[i],
      c = q.close && q.close[i], v = q.volume && q.volume[i];
    if (o == null || h == null || l == null || c == null) continue;
    const d = new Date(ts[i] * 1000).toISOString().slice(0, 10);
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
    const list = [];
    if (forced) list.push({ url: String(forced).replace("{url}", encodeURIComponent(url)), wrap: false });
    else {
      ORDER.forEach(k => {
        list.push({ url: ENCODERS[k](url), wrap: !!WRAPPED[k] });
        if (k === "direct") list[list.length - 1].note = "direct (CORS blocked in browsers)";
      });
    }
    return list;
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
    return { ok: false, msg: tried.join(" | "), lastError: lastErr && lastErr.message };
  }

  /** fetchChart(symbol, range) — OHLCV import. */
  fetchChart(symbol, range) {
    return this._request(buildYahooUrl(symbol, range, "1d"), parseYahooChart);
  }

  /** fetchSymbols(query) — symbol list from Yahoo; falls back to the curated list. */
  async fetchSymbols(query) {
    const q = String(query || "gold").trim();
    const url = "https://query1.finance.yahoo.com/v1/finance/search?q=" + encodeURIComponent(q) +
      "&quotesCount=30&newsCount=0&listsCount=0";
    const res = await this._request(url, parseYahooQuotes);
    if (res.ok) return res;
    return {
      ok: true, fallback: true,
      quotes: FALLBACK_SYMBOLS.slice(),
      msg: "Yahoo search unreachable (" + (res.lastError || "network") + ") — showing the built-in Yahoo symbol list instead."
    };
  }
}
