/* pages/strategies.js — strategy library page controller */
"use strict";
import { startPage } from "../../app/page.js";
import { U } from "../../core/utils.js";
import { openBuilder } from "../builder.js";

startPage("strategies", {
  mount(container, view, { kit, charts, shared, user }) {
    const svc = container.strategies;
    const list = svc.all();
    let html = '<div class="view-head"><div><h1>Strategies</h1><p>Build strategy logic, attach risk &amp; capital rules, and combine strategies with AND / OR / weighted / sequential logic.</p></div>' +
      '<div class="sp"></div><div class="actions"><button class="btn" id="st-import">Import JSON</button>' +
      '<button class="btn btn-primary" id="st-new">＋ New strategy</button></div></div>';
    html += '<div class="card"><h3>Strategy library <span class="sub">' + list.length + " defined</span></h3><div id='st-list'></div></div>";
    view.innerHTML = html;

    function summary(s) {
      const p = s.strategyLogic.params;
      switch (s.strategyLogic.type) {
        case "MA_CROSS": return (p.fastType === "ema" ? "EMA" : "SMA") + " " + p.fastMA + " / " + (p.slowType === "ema" ? "EMA" : "SMA") + " " + p.slowMA + (p.signalType === "above" ? " (above)" : " (cross)");
        case "RSI": return "RSI(" + p.period + ") " + p.overbought + "/" + p.oversold + " " + p.mode;
        case "MACD": return "MACD(" + p.fast + "," + p.slow + "," + p.signal + ") " + p.mode;
        case "BOLL": return "BB(" + p.period + "," + p.mult + ") " + p.mode;
        case "S_R_BREAK": return "S/R " + p.lookback + " bars " + p.mode;
        default: return s.strategyLogic.type;
      }
    }
    function draw() {
      const all = svc.all();
      let lh = all.length ? "" : "<div class='empty'><div class='big'>⚙</div>No strategies yet.<br><button class='btn btn-primary' style='margin-top:10px' id='st-first'>Create the first one</button></div>";
      all.forEach(s => {
        const meta = svc.catalog().LOGIC_META[s.strategyLogic.type];
        const errs = svc.validate(s);
        let combo = "";
        if (s.combine && s.combine.enabled) {
          const mems = (s.combine.memberIds || []).map(id => { const m = svc.byId(id); return m ? m.name : id; });
          combo = '<div class="muted" style="margin-top:4px"><span class="badge gold">' + U.esc(s.combine.logic) + "</span> with " + mems.map(U.esc).join(", ") + "</div>";
        }
        const rm = s.riskManagement, cm = s.capitalManagement;
        const riskTxt = (rm.stopType === "pct" ? "SL " + rm.stopLoss + "%" : rm.stopType === "atr" ? "SL " + rm.stopATR + "×ATR" : "no SL") +
          " · " + (rm.tpType === "pct" ? "TP " + rm.takeProfit + "%" : rm.tpType === "trail" ? "trailing " + rm.trailDist + "%" : "no TP") +
          " · risk " + rm.riskPerTrade + "% · dailyLoss " + rm.maxDailyLoss + "%";
        const capTxt = (cm.positionSizing === "risk" ? "risk-based" : cm.positionSizing === "percentage" ? cm.positionSize + "%" : cm.positionSizing === "fixed" ? cm.fixedUnits + " units" : "Kelly") +
          " · maxPos " + cm.maxPositionPct + "% · " + (cm.compounding ? "compounding" : "flat") + " · cap $" + U.num(cm.initialCapital, 0);
        lh += '<div class="card" style="margin-bottom:12px"><div style="display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap">' +
          '<div style="flex:1;min-width:240px"><h3 style="margin:0">' + U.esc(s.name) + "</h3>" +
          '<div class="muted" style="margin:3px 0">' + U.esc((meta ? meta.label : "") + " · " + summary(s)) + "</div>" +
          (s.desc ? '<div class="small" style="color:var(--ink-2)">' + U.esc(s.desc) + "</div>" : "") + combo +
          (errs.length ? '<div class="err-msg" style="margin-top:6px">⚠ ' + errs.map(U.esc).join("; ") + "</div>" : "") + "</div>" +
          '<div style="min-width:230px;max-width:330px" class="muted small">🛡 ' + U.esc(riskTxt) + "<br>💰 " + U.esc(capTxt) + "</div>" +
          '<div style="display:flex;flex-direction:column;gap:6px">' +
          '<button class="btn btn-sm" data-edit="' + s.id + '">✎ Edit</button>' +
          '<button class="btn btn-sm btn-ghost" data-dup="' + s.id + '">⧉ Duplicate</button>' +
          '<button class="btn btn-sm btn-ghost" data-exp="' + s.id + '">⇩ JSON</button>' +
          '<button class="btn btn-sm btn-danger" data-del="' + s.id + '">🗑 Delete</button></div></div></div>';
      });
      document.getElementById("st-list").innerHTML = lh;
      const first = document.getElementById("st-first");
      if (first) first.addEventListener("click", () => openBuilder(container, { kit, charts }, null));
      document.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () => openBuilder(container, { kit, charts }, b.getAttribute("data-edit"))));
      document.querySelectorAll("[data-dup]").forEach(b => b.addEventListener("click", () => {
        svc.duplicate(b.getAttribute("data-dup"));
        container.log.add("INFO", container.actorId(), "STRATEGY_DUPLICATE", "Duplicated strategy");
        kit.toast("Strategy duplicated", "ok");
        draw();
      }));
      document.querySelectorAll("[data-exp]").forEach(b => b.addEventListener("click", () => {
        const s = svc.byId(b.getAttribute("data-exp"));
        if (s) {
          U.download("strategy-" + s.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".json", JSON.stringify(s, null, 2), "application/json");
          container.log.add("INFO", container.actorId(), "STRATEGY_EXPORT", "Exported strategy " + s.name);
        }
      }));
      document.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", () => {
        const s = svc.byId(b.getAttribute("data-del"));
        if (!s) return;
        kit.confirmDialog("Delete strategy <b>" + U.esc(s.name) + "</b>?", () => {
          svc.remove(s.id);
          container.log.add("WARNING", container.actorId(), "STRATEGY_DELETE", "Deleted strategy " + s.name);
          kit.toast("Strategy deleted", "ok");
          draw();
        }, { danger: true, yesLabel: "Delete" });
      }));
    }
    draw();

    document.getElementById("st-new").addEventListener("click", () => openBuilder(container, { kit, charts }, null));
    document.getElementById("st-import").addEventListener("click", () => {
      const m = kit.modal('<p class="muted" style="margin-top:0">Paste one or more strategy configs as JSON.</p>' +
        '<textarea id="st-imp-txt" rows="10" style="font-family:var(--mono);font-size:12px" placeholder=\'[ { "name":"My strategy", "strategyLogic":{...} } ]\'></textarea>' +
        '<div id="st-imp-msg" class="err-msg"></div>', { title: "Import strategies", size: "lg" });
      const foot = document.createElement("div");
      foot.style.cssText = "display:flex;justify-content:flex-end;gap:8px;margin-top:10px";
      foot.innerHTML = '<button class="btn btn-primary" data-ok="1">Import</button>';
      m.body.appendChild(foot);
      foot.querySelector("[data-ok]").addEventListener("click", () => {
        const res = svc.importJson(m.body.querySelector("#st-imp-txt").value);
        const el = m.body.querySelector("#st-imp-msg");
        if (!res.ok && !res.imported) { el.textContent = (res.msg || "") + (res.errors ? res.errors.slice(0, 3).join("; ") : ""); return; }
        el.classList.add("ok");
        el.textContent = "✓ Imported " + res.imported + " strategy(ies).";
        container.log.add("INFO", container.actorId(), "STRATEGY_IMPORT", "Imported " + res.imported + " strategies");
        setTimeout(() => { m.close(); draw(); }, 800);
      });
    });

    /* deep-link edit */
    const params = new URLSearchParams(location.search);
    const edit = params.get("edit");
    if (edit) { params.delete("edit"); history.replaceState(null, "", location.pathname + location.search); openBuilder(container, { kit, charts }, edit); }
  }
});
