/* domain/entities.js — strategy & user factories + validation (pure) */
"use strict";
import { LOGIC_META, RISK_META, CAP_META } from "./catalog.js";

export const ROLES = ["ADMIN", "ANALYST", "VIEWER"];

/** Strategy factory with sane defaults; id assigned by caller-provided idFn. */
export function createStrategy(name, type, idFn) {
  const meta = LOGIC_META[type] || LOGIC_META.MA_CROSS;
  const p = {};
  meta.params.forEach(m => { p[m.key] = m.def; });
  const now = new Date().toISOString();
  return {
    id: idFn ? idFn() : null,
    name: name || meta.label, desc: "", ownerId: "seed",
    createdAt: now, updatedAt: now,
    strategyLogic: { type, params: p },
    riskManagement: {
      stopType: "pct", stopLoss: 2, stopATR: 2, tpType: "pct", takeProfit: 4,
      trailActivate: 2, trailDist: 1.5, riskPerTrade: 1.5, maxDailyLoss: 5,
      maxConsecLosses: 3, pauseBars: 5
    },
    capitalManagement: {
      initialCapital: 10000, positionSizing: "risk", positionSize: 10, fixedUnits: 10,
      maxPositionPct: 50, compounding: true, maxDrawdown: 25, feePct: 0
    },
    combine: { enabled: false, memberIds: [], weights: {}, logic: "AND", threshold: 0, seqWindow: 5 }
  };
}

/** validateStrategy(strategy, {memberExists}) -> list of human-readable errors */
export function validateStrategy(s, deps) {
  const errs = [];
  const memberExists = (deps && deps.memberExists) || (() => false);
  if (!s || !s.name || !String(s.name).trim()) errs.push("Strategy needs a name.");
  const sl = s && s.strategyLogic;
  if (!sl || !LOGIC_META[sl.type]) errs.push("Unknown strategy type.");
  else {
    const p = sl.params || {};
    if (sl.type === "MA_CROSS" && (+p.fastMA >= +p.slowMA)) errs.push("Fast MA period must be smaller than slow MA period.");
    if (sl.type === "RSI" && (+p.oversold >= +p.overbought)) errs.push("Oversold must be below overbought.");
    if (sl.type === "MACD" && (+p.fast >= +p.slow)) errs.push("MACD fast EMA must be smaller than slow EMA.");
  }
  const rm = s.riskManagement;
  if (!rm) errs.push("Risk management block required.");
  else {
    if (rm.stopType === "pct" && !(+rm.stopLoss > 0)) errs.push("Fixed stop-loss must be > 0.");
    if (rm.stopType === "atr" && !(+rm.stopATR > 0)) errs.push("ATR stop must be > 0.");
  }
  const cm = s.capitalManagement;
  if (!cm) errs.push("Capital management block required.");
  else {
    if (!(+cm.initialCapital > 0)) errs.push("Initial capital must be > 0.");
    if (+cm.riskPerTrade <= 0) errs.push("Risk per trade must be > 0.");
  }
  if (s.combine && s.combine.enabled) {
    if (!s.combine.memberIds || s.combine.memberIds.length < 1) errs.push("Combination needs at least one member strategy.");
    if (s.combine.memberIds.indexOf(s.id) >= 0) errs.push("A strategy cannot combine with itself.");
    s.combine.memberIds.forEach(id => { if (!memberExists(id)) errs.push("Member strategy no longer exists: " + id); });
  }
  return errs;
}

/** User factory. Returns a plain entity; hashing is the AuthService's job. */
export function createUserEntity({ username, fullname, role, salt, passwordHash, mustChangePw }) {
  return {
    id: null, username, fullname: fullname || username,
    passwordHash, salt, role,
    created: new Date().toISOString(), lastLogin: null, active: true, mustChangePw: !!mustChangePw
  };
}

export function validateUsername(name) {
  if (!name || String(name).trim().length < 3 || String(name).trim().length > 32) return "Username must be 3–32 characters.";
  if (!/^[A-Za-z0-9_.-]+$/.test(name)) return "Username may only contain letters, digits, . _ -";
  return null;
}

/** Strategy parameter metadata accessors (used by UI + optimizer). */
export const Catalog = { LOGIC_META, RISK_META, CAP_META };
