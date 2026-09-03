/* services/log-service.js — audit logger over LogsRepo with rotation (adapter of LogPort) */
"use strict";

const LEVELS = { INFO: 0, WARNING: 1, ERROR: 2, SECURITY: 3 };

export class LogService {
  /** @param {{logs: LogsRepo, ip: {value():string}, ids: {next():string}}} deps */
  constructor({ logs, ip, ids }) {
    this.repo = logs;
    this.ip = ip;
    this.ids = ids;
    this.maxEntries = 1500; // refreshed from settings by SettingsService when available
  }
  setMaxEntries(n) { this.maxEntries = Math.max(50, n); }
  add(level, userID, action, details, extra) {
    if (!(level in LEVELS)) level = "INFO";
    const e = {
      id: this.ids.next(), ts: new Date().toISOString(), level, userID: userID || "system",
      action: action || "", ip: this.ip.value(), details: details || "", extra: extra || {}
    };
    const arr = this.repo.all();
    arr.push(e);
    if (arr.length > this.maxEntries) {
      this.repo.saveArchives([...this.repo.archives(), { archivedAt: new Date().toISOString(), entries: arr }].slice(-3));
      this.repo.clear();
      this.repo.save([e]);
    } else {
      this.repo.save(arr);
    }
    return e;
  }
  list() { return this.repo.all(); }
  archives() { return this.repo.archives(); }
  clear() { this.repo.clear(); }
  query(f) {
    const rows = this.repo.all();
    if (!f) return rows;
    return rows.filter(e => {
      if (f.level && e.level !== f.level) return false;
      if (f.user && e.userID !== f.user) return false;
      if (f.action && e.action !== f.action) return false;
      if (f.q) {
        const hay = (e.action + " " + e.details + " " + e.userID).toLowerCase();
        if (hay.indexOf(String(f.q).toLowerCase()) < 0) return false;
      }
      if (f.from && e.ts < f.from) return false;
      if (f.to && e.ts > f.to) return false;
      return true;
    });
  }
}

export const LogLevels = LEVELS;
