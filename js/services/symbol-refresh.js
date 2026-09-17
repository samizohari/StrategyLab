/* services/symbol-refresh.js — keeps the Yahoo symbol list fresh in the background.
   Runs at most once per tab session; only hits the network when the cached list
   is older than maxAgeHours (default 24h). Never throws at call sites. */
"use strict";

export class SymbolRefreshService {
  constructor({ yahoo, settings, log }) {
    this.yahoo = yahoo;
    this.settings = settings;
    this.log = log;
    this._running = false;
  }

  ageHours() {
    let c = null;
    try { c = this.settings.get("yahoo_symbols_cache"); } catch (e) { c = null; }
    if (!c || !c.at) return Infinity;
    return (Date.now() - c.at) / 3600000;
  }

  /** maybeRefresh(maxAgeHours) -> {skipped|ok|error, source?, count?, ageHours} */
  async maybeRefresh(maxAgeHours = 24) {
    const age = this.ageHours();
    if (age < maxAgeHours) return { skipped: true, ageHours: age };
    if (this._running) return { skipped: true, inFlight: true, ageHours: age };
    this._running = true;
    try {
      const q = this.settings.get("symbol") || "GC=F";
      const res = await this.yahoo.fetchSymbols(q);
      const out = { ok: !!res.ok, source: res.source || "unknown", count: res.quotes ? res.quotes.length : 0, ageHours: this.ageHours() };
      try { this.log.add("INFO", "system", "SYMBOL_LIST_REFRESH", "Auto symbol-list refresh: " + out.source + " (" + out.count + " symbols)"); } catch (e) { /* ignore */ }
      return out;
    } catch (e) {
      return { error: String(e && e.message || e), ageHours: age };
    } finally {
      this._running = false;
    }
  }
}
