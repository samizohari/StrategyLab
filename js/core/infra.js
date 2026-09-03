/* core/infra.js — small infrastructure ports: identity, ip, clock */
"use strict";
import { U } from "./utils.js";

/** ClockProvider — injectable time source (defaults to real clock). */
export class Clock {
  nowISO() { return new Date().toISOString(); }
  nowMs() { return Date.now(); }
  todayISO() { return new Date().toISOString().slice(0, 10); }
}

/** IdProvider — uuid generation (crypto.randomUUID when available). */
export class IdProvider {
  next() { return U.uuid(); }
}

/** SimulatedIpProvider — stable per-browser fake IP persisted through a StorePort. */
export class SimulatedIpProvider {
  constructor(store) {
    this.store = store;
    this._ip = store.getRaw("gpb_ip");
    if (!this._ip) {
      this._ip = "172." + (10 + Math.floor(Math.random() * 200)) + "." +
        Math.floor(Math.random() * 255) + "." + (2 + Math.floor(Math.random() * 252));
      store.setRaw("gpb_ip", this._ip);
    }
  }
  value() { return this._ip; }
}
