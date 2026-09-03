/* pages/logs.js — system log viewer (ADMIN only) */
"use strict";
import { startPage } from "../../app/page.js";
import { U } from "../../core/utils.js";

startPage("logs", {
  mount(container, view, { kit, charts, shared, user }) {
    const svc = container.log;
    const users = container.auth.users();
    const lvlBadge = { INFO: "badge info", WARNING: "badge warn", ERROR: "badge bad", SECURITY: "badge gold" };
    let html = '<div class="view-head"><div><h1>System Logs</h1><p>Full audit trail of user actions. Log rotation archives entries automatically when the cap is exceeded.</p></div>' +
      '<div class="sp"></div><div class="actions"><button class="btn" id="lg-refresh">⟳ Refresh</button><button class="btn btn-danger" id="lg-clear">Clear current log</button></div></div>';
    html += '<div class="card"><div class="frow">' +
      '<div class="field"><label>Level</label><select id="lg-level"><option value="">All</option><option>INFO</option><option>WARNING</option><option>ERROR</option><option>SECURITY</option></select></div>' +
      '<div class="field"><label>User</label><select id="lg-user"><option value="">All</option>' + users.map(u => "<option>" + U.esc(u.username) + "</option>").join("") + "</select></div>" +
      '<div class="field"><label>Action contains</label><input id="lg-q" placeholder="e.g. LOGIN, BACKTEST…"></div>' +
      '<div class="field"><label>From date</label><input type="date" id="lg-from"></div>' +
      '<div class="field"><label>Archive</label><select id="lg-arc"><option value="">Current log</option>' +
      svc.archives().map((a, i) => '<option value="' + i + '">Archive ' + (i + 1) + " (" + U.fmtDate(a.archivedAt) + ", " + a.entries.length + ")</option>").join("") + "</select></div>" +
      '</div><div class="muted small" style="margin-bottom:8px" id="lg-cnt"></div>' +
      '<div class="tbl-wrap" style="max-height:56vh"><table class="tbl"><thead><tr><th>Time</th><th>Level</th><th>User</th><th>Action</th><th>Details</th><th>IP</th></tr></thead><tbody id="lg-body"></tbody></table></div></div>';
    view.innerHTML = html;

    function refresh() {
      const f = {};
      const lv = document.getElementById("lg-level").value;
      if (lv) f.level = lv;
      const us = document.getElementById("lg-user").value;
      if (us) f.user = us;
      const q = document.getElementById("lg-q").value.trim();
      if (q) f.q = q;
      const fr = document.getElementById("lg-from").value;
      if (fr) f.from = fr + "T00:00:00";
      const arcIdx = document.getElementById("lg-arc").value;
      let rows = [];
      if (arcIdx === "") rows = svc.query(f);
      else {
        const arc = svc.archives()[+arcIdx];
        rows = arc ? arc.entries.filter(e => {
          if (f.level && e.level !== f.level) return false;
          if (f.user && e.userID !== f.user) return false;
          if (f.q) { const hay = (e.action + " " + e.details).toLowerCase(); if (hay.indexOf(f.q.toLowerCase()) < 0) return false; }
          if (f.from && e.ts < f.from) return false;
          return true;
        }) : [];
      }
      document.getElementById("lg-cnt").textContent = rows.length + " entries";
      document.getElementById("lg-body").innerHTML = rows.slice().reverse().map(e =>
        '<tr><td class="muted">' + U.fmtDT(e.ts) + '</td><td><span class="' + (lvlBadge[e.level] || "badge neutral") + '">' + e.level + "</span></td><td>" + U.esc(e.userID) +
        '</td><td><code>' + U.esc(e.action) + "</code></td><td>" + U.esc(e.details) + '</td><td class="muted mono">' + U.esc(e.ip) + "</td></tr>").join("") ||
        "<tr><td colspan='6' class='muted' style='text-align:center'>No matching entries</td></tr>";
    }
    ["lg-level", "lg-user", "lg-arc"].forEach(id => document.getElementById(id).addEventListener("change", refresh));
    document.getElementById("lg-q").addEventListener("input", U.debounce(refresh, 250));
    document.getElementById("lg-from").addEventListener("change", refresh);
    document.getElementById("lg-refresh").addEventListener("click", refresh);
    document.getElementById("lg-clear").addEventListener("click", () => {
      kit.confirmDialog("Clear the CURRENT log? (Archives are kept.)", () => {
        svc.clear();
        svc.add("SECURITY", container.actorId(), "LOG_CLEAR", "Admin cleared the current log");
        kit.toast("Log cleared", "ok");
        location.reload();
      }, { danger: true, yesLabel: "Clear" });
    });
    refresh();
  }
});
