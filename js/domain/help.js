/* domain/help.js — pure Markdown documentation composer for strategies.
   Generates a comprehensive, human-readable help document from the strategy
   configuration. No DOM/storage — safe for services and tests. */
"use strict";
import { LOGIC_META, RISK_META, CAP_META } from "./catalog.js";

function esc(s) {
  return String(s == null ? "" : s).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

/** composeStrategyHelp(strategy, resolveName?) -> Markdown string */
export function composeStrategyHelp(s, resolveName) {
  if (!s) return "";
  const logic = s.strategyLogic || {};
  const meta = LOGIC_META[logic.type];
  const p = logic.params || {};
  const rm = s.riskManagement || {};
  const cm = s.capitalManagement || {};
  const L = [];
  const name = String(s.name || "Untitled strategy").replace(/^#+\s*/, "");

  L.push("# " + name);
  if (s.desc) L.push("", s.desc);
  L.push("");
  L.push("## Strategy logic");
  if (meta) {
    L.push("**Type:** " + meta.label);
    L.push("");
    L.push("> " + meta.help);
    L.push("");
    L.push("### Parameters");
    L.push("");
    L.push("| Parameter | Value |");
    L.push("| --- | --- |");
    const paramMeta = meta.params;
    Object.keys(p).forEach(k => {
      const m = paramMeta.find(x => x.key === k);
      L.push("| " + esc(m ? m.label : k) + " | `" + esc(p[k]) + "` |");
    });
  }
  const cb = s.combine;
  if (cb && cb.enabled) {
    L.push("");
    L.push("### Combination");
    const names = (cb.memberIds || []).map(id => {
      const nm = resolveName ? resolveName(id) : null;
      return nm ? "`" + esc(nm) + "`" : "`" + id + "`";
    });
    L.push("- Logic: **" + esc(cb.logic) + "** over " + names.join(", "));
    if (cb.logic === "WEIGHTED") L.push("- Vote threshold: `" + esc(cb.threshold) + "`");
    if (cb.logic === "SEQUENTIAL") L.push("- Confirmation window: `" + esc(cb.seqWindow) + "` bars");
  }

  L.push("");
  L.push("## Risk management");
  const stopTxt = rm.stopType === "pct" ? "fixed **" + rm.stopLoss + "%** stop-loss"
    : rm.stopType === "atr" ? "**" + rm.stopATR + "×** ATR(14) stop-loss"
      : "**none** (no stop-loss — dangerous)";
  const tpTxt = rm.tpType === "pct" ? "fixed **" + rm.takeProfit + "%** take-profit"
    : rm.tpType === "trail" ? "trailing stop activated at **" + rm.trailActivate + "%** profit, **" + rm.trailDist + "%** trail distance"
      : "**none** (exit on signal/end only)";
  L.push("- Stop-loss: " + stopTxt);
  L.push("- Take-profit: " + tpTxt);
  L.push("- Risk per trade: **" + esc(rm.riskPerTrade) + "%** of equity");
  L.push("- Max daily loss: **" + esc(rm.maxDailyLoss) + "%** (trading halts for the day)");
  L.push("- Max consecutive losses: **" + esc(rm.maxConsecLosses) + "** → pause **" + esc(rm.pauseBars) + "** bars");

  L.push("");
  L.push("## Capital management");
  const sizingTxt = cm.positionSizing === "risk" ? "risk-based (sized to the stop distance)"
    : cm.positionSizing === "percentage" ? "**" + cm.positionSize + "%** of equity"
      : cm.positionSizing === "fixed" ? "fixed **" + cm.fixedUnits + "** units"
        : "Kelly fraction (capped at 25%)";
  L.push("- Position sizing: " + sizingTxt);
  L.push("- Max position: **" + esc(cm.maxPositionPct) + "%** of equity");
  L.push("- Compounding: **" + (cm.compounding ? "on" : "off") + "**");
  L.push("- Max drawdown halt: **" + esc(cm.maxDrawdown) + "%**");
  if (cm.feePct) L.push("- Fees: **" + esc(cm.feePct) + "%** per trade");
  L.push("");
  L.push("## Notes");
  L.push("- Edit or replace this document in **Strategies → Edit → Help** step (Markdown supported).");
  L.push("- Suggested starting capital: **$" + esc(cm.initialCapital || 10000) + "**.");
  L.push("- Backtest any strategy in the **Backtest Lab** before committing real funds.");
  return L.join("\n");
}

export const Help = { composeStrategyHelp };
