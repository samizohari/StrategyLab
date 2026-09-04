/* services/settings-service.js — typed access to app settings */
"use strict";

const DEFAULTS = {
  theme: "dark", symbol: "GC=F", idleTimeoutMin: 30, logMaxEntries: 1500, defaultInitialCapital: 10000,
  defaultRiskPerTrade: 1.5, defaultMaxDailyLoss: 5, resultCap: 20, benchmarkBars: 12000
};

export class SettingsService {
  constructor(repo) { this.repo = repo; }
  all() { return Object.assign({}, DEFAULTS, this.repo.all()); }
  get(key) { return this.all()[key]; }
  set(key, value) { this.repo.patch(key, value); }
  static defaults() { return Object.assign({}, DEFAULTS); }
}
