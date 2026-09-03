/* pages/alerts.js — market watchers with browser notifications */
"use strict";
import { startPage } from "../../app/page.js";
import { U } from "../../core/utils.js";

startPage("alerts", {
  mount(container, view, { kit, charts, shared, user }) {
    const svc = container.alerts;
    let html = '<div class="view-head"><div><h1>Alerts</h1><p>Watch live conditions on the latest price — browser notification when triggered.</p></div>' +
      '<div class="sp"></div><div class="actions"><button class="btn" id="al-perm">Enable notifications</button><button class="btn btn-primary" id="al-new">＋ New alert</button></div></div>';
    html += '<div class="card"><h3>Active alerts</h3><div id="al-list"></div></div>';
    view.innerHTML = html;

    function draw() {
      const l = svc.list();
      let h = l.length ? "" : "<div class='empty'><div class='big'>🔔</div>No alerts yet.</div>";
      l.forEach(a => {
        const t = a.type === "PRICE" ? "Price " + a.op + " $" + U.num(a.level)
          : a.type === "MA_CROSS" ? "SMA " + a.fast + " " + a.op + " SMA " + a.slow
            : "RSI(" + a.period + ") " + a.op + " " + a.level;
        h += '<div style="display:flex;align-items:center;gap:10px;padding:9px 2px;border-bottom:1px solid var(--line-2)">' +
          '<div style="flex:1"><b>' + U.esc(a.name) + '</b><div class="muted small">' + U.esc(t) + "</div>" +
          (a.lastTrig ? '<div class="muted small">last fired: ' + U.fmtDT(a.lastTrig) + "</div>" : "") + "</div>" +
          '<label class="switch"><input type="checkbox" data-tog="' + a.id + '"' + (a.enabled === false ? "" : " checked") + "><i></i></label>" +
          '<button class="btn btn-sm btn-danger" data-del="' + a.id + '">✕</button></div>';
      });
      document.getElementById("al-list").innerHTML = h;
      view.querySelectorAll("[data-tog]").forEach(cb => cb.addEventListener("change", () => svc.setEnabled(cb.getAttribute("data-tog"), cb.checked)));
      view.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", () => { svc.remove(b.getAttribute("data-del")); draw(); }));
    }
    draw();
    document.getElementById("al-perm").addEventListener("click", () => svc.askPermission());

    document.getElementById("al-new").addEventListener("click", () => {
      const price = container.market.count() ? container.market.bars()[container.market.bars().length - 1].c : 2500;
      const m = kit.modal('<div class="field"><label>Alert name</label><input id="al-name" placeholder="e.g. Gold above 2600"></div>' +
        '<div class="field"><label>Type</label><select id="al-type"><option value="PRICE">Price level</option><option value="MA_CROSS">SMA cross</option><option value="RSI">RSI level</option></select></div>' +
        '<div id="al-fields"></div>', { title: "New alert", size: "sm" });
      const types = {
        PRICE: '<div class="frow"><div class="field"><label>Operator</label><select id="al-op"><option value="above">above</option><option value="below">below</option></select></div>' +
          '<div class="field"><label>Level $</label><input type="number" id="al-v" step="0.1" value="' + U.round(price * 1.05, 1) + '"></div></div>',
        MA_CROSS: '<div class="frow"><div class="field"><label>Fast SMA</label><input type="number" id="al-f" value="20"></div>' +
          '<div class="field"><label>Operator</label><select id="al-op"><option value="above">crosses above</option><option value="below">crosses below</option></select></div>' +
          '<div class="field"><label>Slow SMA</label><input type="number" id="al-s" value="50"></div></div>',
        RSI: '<div class="frow"><div class="field"><label>RSI period</label><input type="number" id="al-p" value="14"></div>' +
          '<div class="field"><label>Operator</label><select id="al-op"><option value="above">above</option><option value="below">below</option></select></div>' +
          '<div class="field"><label>Level</label><input type="number" id="al-v" value="70"></div></div>'
      };
      const fill = () => { document.getElementById("al-fields").innerHTML = types[document.getElementById("al-type").value]; };
      fill();
      m.body.querySelector("#al-type").addEventListener("change", fill);
      const foot = document.createElement("div");
      foot.style.cssText = "display:flex;justify-content:flex-end;gap:8px;margin-top:12px";
      foot.innerHTML = '<button class="btn btn-primary" data-ok="1">Create alert</button>';
      m.body.appendChild(foot);
      foot.querySelector("[data-ok]").addEventListener("click", () => {
        const a = {
          name: (m.body.querySelector("#al-name").value.trim()) || "Untitled alert",
          type: m.body.querySelector("#al-type").value,
          op: m.body.querySelector("#al-op").value
        };
        if (a.type === "PRICE") a.level = parseFloat(m.body.querySelector("#al-v").value) || 0;
        if (a.type === "MA_CROSS") { a.fast = parseInt(m.body.querySelector("#al-f").value, 10); a.slow = parseInt(m.body.querySelector("#al-s").value, 10); }
        if (a.type === "RSI") { a.period = parseInt(m.body.querySelector("#al-p").value, 10); a.level = parseFloat(m.body.querySelector("#al-v").value) || 70; }
        svc.add(a);
        container.log.add("INFO", container.actorId(), "ALERT_CREATE", "Created alert " + a.name);
        kit.toast("Alert created", "ok");
        m.close();
        draw();
      });
    });
  }
});
