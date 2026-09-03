/* adapters/yahoo-adapter.js — Yahoo Finance chart import (infrastructure adapter).
   Direct browser calls to query1.finance.yahoo.com are blocked by CORS, so the
   adapter tries the endpoint directly, then falls back to public CORS proxies
   (allorigins, then corsproxy.io). A custom proxy can be forced via the setting
   `yahoo_proxy` (full URL with {url} placeholder). */
"use strict";

const PROXIES = [
  "https://api.allorigins.win/raw?url={url}",
  "https://corsproxy.io/?url={url}"
];

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
    if (o == null || h == null || l == null || c == null) continue; // trading halt / gap rows
    const d = new Date(ts[i] * 1000).toISOString().slice(0, 10);
    if (seen[d]) continue;
    seen[d] = 1;
    bars.push({
      d,
      o: Math.round(o * 100) / 100,
      h: Math.round(h * 100) / 100,
      l: Math.round(l * 100) / 100,
      c: Math.round(c * 100) / 100,
      v: v == null ? 0 : Math.round(v)
    });
  }
  if (!bars.length) return { ok: false, msg: "Payload parsed but contained no valid bars." };
  bars.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  return { ok: true, bars, meta: res.meta || {}, count: bars.length };
}

export class YahooFinanceAdapter {
  /** @param {{settings, log, fetchFn?, timeoutMs?}} deps */
  constructor(deps) {
    this.settings = deps.settings;
    this.log = deps.log || null;
    this.fetchFn = deps.fetchFn || ((...a) => fetch(...a));
    this.timeoutMs = deps.timeoutMs || 30000;
  }
  _withTimeout(url, opts) {
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), this.timeoutMs) : null;
    return this.fetchFn(url, Object.assign({}, opts, ctrl ? { signal: ctrl.signal } : {}))
      .finally(() => { if (timer) clearTimeout(timer); });
  }
  async _fetchVia(url) {
    const r = await this._withTimeout(url, { method: "GET", headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }
  /** Try direct, then each CORS proxy in order. Throws the last error. */
  async fetchChart(symbol, range) {
    const direct = buildYahooUrl(symbol, range, "1d");
    const attempts = [];
    const urls = [direct];
    const forced = this.settings.get("yahoo_proxy");
    if (forced) urls.unshift(String(forced).replace("{url}", encodeURIComponent(direct)));
    else PROXIES.forEach(p => urls.push(p.replace("{url}", encodeURIComponent(direct))));

    let lastErr = null;
    for (const url of urls) {
      try {
        return parseYahooChart(await this._fetchVia(url));
      } catch (e) {
        lastErr = e;
        attempts.push(e.message || String(e));
      }
    }
    return {
      ok: false,
      msg: "Could not reach Yahoo Finance (CORS blocks browsers from calling it directly). Tried " + urls.length +
        " route(s): " + attempts.join(" | ") + ". Tip: run a local CORS proxy or set the `yahoo_proxy` setting."
    };
  }
}
