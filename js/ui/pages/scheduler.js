/* pages/scheduler.js — recurring backtests (in-browser intervals) */
"use strict";
import { startPage } from "../../app/page.js";
import { U } from "../../core/utils.js";

startPage("scheduler", {
  mount(container, view, { kit, charts, shared, user }) {
    const svc = container.schedules;
    const strategies = container.strategies.all();
    let html = '<div class="view-head"><div><h1>Scheduled Runs</h1><p>Recurring backtests (simulated with in-browser intervals). Runs only while this tab is open.</p></div>' +
      '<div class="sp"></div><div class="actions"><button class="btn btn-primary" id="sch-add">＋ Add schedule</button></div></div>';
    html += '<div class="card"><h3>Schedules</h3><div id="sch-list"></div></div>';
    view.innerHTML = html;

    function draw() {
      const l = svc.list();
      let h = l.length ? "" : "<div class='empty'><div class='big'>⏱</div>No scheduled runs. Add one to re-run a strategy periodically and auto-save results.</div>";
      l.forEach(c => {
        const s = container.strategies.byId(c.strategyId);
        h += '<div style="display:flex;align-items:center;gap:10px;padding:10px 2px;border-bottom:1px solid var(--line-2);flex-wrap:wrap">' +
          '<div style="flex:1;min-width:200px"><b>' + U.esc(c.name) + '</b><div class="muted small">' + U.esc(s ? s.name : "(deleted strategy)") + " · every " + c.intervalMin + " min" + (c.years > 0 ? " · last " + c.years + "y" : " · full range") + "</div>" +
          (c.lastRun ? '<div class="muted small">last: ' + U.fmtDT(c.lastRun) + " · next: <span data-cd></span></div>" : "") + "</div>" +
          '<button class="btn btn-sm" data-now="' + c.id + '">Run now</button>' +
          '<label class="switch"><input type="checkbox" data-on="' + c.id + '"' + (c.enabled === false ? "" : " checked") + "><i></i></label>" +
          '<button class="btn btn-sm btn-danger" data-del="' + c.id + '">✕</button></div>';
      });
      document.getElementById("sch-list").innerHTML = h;
      view.querySelectorAll("[data-now]").forEach(b => b.addEventListener("click", () => {
        const c = svc.list().filter(x => x.id === b.getAttribute("data-now"))[0];
        if (c) { c.nextRun = 0; svc.repo.save(svc.list()); svc.tick(); kit.toast("Scheduled tick fired", "info"); }
      }));
      view.querySelectorAll("[data-on]").forEach(cb => cb.addEventListener("change", () => svc.setEnabled(cb.getAttribute("data-on"), cb.checked)));
      view.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", () => { svc.remove(b.getAttribute("data-del")); draw(); }));
    }
    draw();

    document.getElementById("sch-add").addEventListener("click", () => {
      const m = kit.modal('<div class="field"><label>Schedule name</label><input id="sch-name" placeholder="Weekly MACD check"></div>' +
        '<div class="frow">' +
        '<div class="field"><label>Strategy</label><select id="sch-sel">' + strategies.map(s => '<option value="' + s.id + '">' + U.esc(s.name) + "</option>").join("") + "</select></div>" +
        '<div class="field"><label>Every (minutes)</label><select id="sch-int"><option value="5">5 min</option><option value="15" selected>15 min</option><option value="30">30 min</option><option value="60">1 hour</option><option value="1440">1 day</option></select></div>' +
        '<div class="field"><label>Data window</label><select id="sch-win"><option value="0">Full range</option><option value="3" selected>Last 3 years</option><option value="1">Last year</option></select></div></div>',
        { title: "Add scheduled run", size: "sm" });
      const foot = document.createElement("div");
      foot.style.cssText = "display:flex;justify-content:flex-end;gap:8px;margin-top:12px";
      foot.innerHTML = '<button class="btn btn-primary" data-ok="1">Add schedule</button>';
      m.body.appendChild(foot);
      foot.querySelector("[data-ok]").addEventListener("click", () => {
        svc.add({
          name: m.body.querySelector("#sch-name").value.trim() || "Scheduled run",
          strategyId: m.body.querySelector("#sch-sel").value,
          intervalMin: parseInt(m.body.querySelector("#sch-int").value, 10),
          years: parseInt(m.body.querySelector("#sch-win").value, 10)
        });
        container.log.add("INFO", container.actorId(), "SCHEDULE_ADD", "Added scheduled run");
        kit.toast("Schedule added — next tick fires shortly", "ok");
        m.close();
        draw();
      });
    });
  }
});
