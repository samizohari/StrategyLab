/* adapters/market-data-adapter.js — routes OHLCV downloads to the configured provider.
   Yahoo needs a CORS relay (browsers cannot call it directly and the free proxies
   are unreliable); Twelve Data is CORS-enabled and needs a free API key. The app
   can run either, with an automatic fallback so one dead provider is not fatal. */
"use strict";

export class MarketDataAdapter {
  constructor({ settings, yahoo, twelve }) {
    this.settings = settings;
    this.yahoo = yahoo;
    this.twelve = twelve;
  }

  provider() {
    return this.settings.get("data_provider") === "twelvedata" ? "twelvedata" : "yahoo";
  }

  async fetchChart(symbol, range, interval) {
    if (this.provider() === "twelvedata") {
      const a = await this.twelve.fetchChart(symbol, range, interval);
      if (a.ok) return a;
      const b = await this.yahoo.fetchChart(symbol, range, interval);
      if (b.ok) return Object.assign(b, { provider: "yahoo", note: "Twelve Data failed (" + a.msg + "), Yahoo succeeded." });
      return {
        ok: false, provider: "twelvedata",
        msg: a.msg + " · Yahoo: " + b.msg,
        detail: b.detail, attempts: b.attempts
      };
    }
    const r = await this.yahoo.fetchChart(symbol, range, interval);
    if (r.ok) return Object.assign(r, { provider: "yahoo" });
    /* Yahoo is down but a Twelve Data key may still be saved — use it rather than fail. */
    if (String(this.settings.get("twelvedata_key") || "").trim()) {
      const t = await this.twelve.fetchChart(symbol, range, interval);
      if (t.ok) return Object.assign(t, { note: "Yahoo failed — used Twelve Data." });
      return Object.assign(r, { provider: "yahoo", msg: r.msg + " Twelve Data also failed: " + t.msg });
    }
    return Object.assign(r, { provider: "yahoo" });
  }
}
