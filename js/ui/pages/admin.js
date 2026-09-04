/* pages/admin.js — Admin Panel: users, settings, backup/restore, audit, tests & benchmark */
"use strict";
import { startPage } from "../../app/page.js";
import { U } from "../../core/utils.js";
import { runAll } from "../../tests/selftests.js";
import { demoData } from "../../domain/series.js";

startPage("admin", {
  mount(container, view, { kit, charts, shared, user }) {
    const auth = container.auth;
    let html = '<div class="view-head"><div><h1>Admin Panel</h1><p>User management, system settings, backup/restore, audit trail and diagnostics.</p></div></div>';
    html += '<div class="tabs"><button data-tab="users" class="active">Users</button><button data-tab="settings">Settings</button>' +
      '<button data-tab="backup">Backup &amp; Restore</button><button data-tab="audit">Audit trail</button><button data-tab="tests">Tests &amp; Benchmark</button></div>';
    html += '<div id="adm-body"></div>';
    view.innerHTML = html;
    let tab = "users";

    const roleBadge = r => r === "ADMIN" ? '<span class="badge gold">ADMIN</span>' : r === "ANALYST" ? '<span class="badge info">ANALYST</span>' : '<span class="badge neutral">VIEWER</span>';

    function render() {
      const body = document.getElementById("adm-body");
      if (tab === "users") usersTab(body);
      else if (tab === "settings") settingsTab(body);
      else if (tab === "backup") backupTab(body);
      else if (tab === "audit") auditTab(body);
      else testsTab(body);
    }
    view.querySelectorAll("[data-tab]").forEach(b => b.addEventListener("click", () => {
      view.querySelectorAll("[data-tab]").forEach(x => x.classList.remove("active"));
      b.classList.add("active");
      tab = b.getAttribute("data-tab");
      render();
    }));

    function usersTab(body) {
      const me = auth.current();
      let h = '<div style="display:flex;justify-content:flex-end;margin-bottom:10px"><button class="btn btn-primary" id="au-new">＋ Create user</button></div>' +
        '<div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Username</th><th>Full name</th><th>Role</th><th>Status</th><th>Last login</th><th>Actions</th></tr></thead><tbody>';
      auth.users().forEach(u => {
        h += '<tr><td><b>' + U.esc(u.username) + "</b>" + (u.id === me.id ? ' <span class="badge neutral">you</span>' : "") + (u.mustChangePw ? ' <span class="badge warn">pw reset pending</span>' : "") + "</td>" +
          "<td>" + U.esc(u.fullname) + "</td><td>" + roleBadge(u.role) + "</td>" +
          "<td>" + (u.active ? '<span class="badge ok">ACTIVE</span>' : '<span class="badge bad">DISABLED</span>') + "</td>" +
          '<td class="muted">' + U.fmtDT(u.lastLogin) + "</td>" +
          '<td style="white-space:nowrap"><select class="au-role" data-id="' + u.id + '" style="width:110px;display:inline-block;padding:4px 6px">' +
          ["ADMIN", "ANALYST", "VIEWER"].map(r => '<option' + (u.role === r ? " selected" : "") + ">" + r + "</option>").join("") + "</select>" +
          '<button class="btn btn-sm btn-ghost" data-rpw="' + u.id + '" title="Reset password">🔑</button>' +
          '<button class="btn btn-sm" data-tog="' + u.id + '">' + (u.active ? "Disable" : "Enable") + "</button>" +
          (u.id !== me.id ? '<button class="btn btn-sm btn-danger" data-del="' + u.id + '">🗑</button>' : "") + "</td></tr>";
      });
      h += "</tbody></table></div></div>";
      body.innerHTML = h;
      body.querySelectorAll(".au-role").forEach(sel => sel.addEventListener("change", () => {
        const r = auth.adminUpdateUser(me, sel.getAttribute("data-id"), { role: sel.value });
        kit.toast(r.ok ? "Role updated" : r.msg, r.ok ? "ok" : "bad");
        if (!r.ok) render();
      }));
      body.querySelectorAll("[data-tog]").forEach(b2 => b2.addEventListener("click", () => {
        const u = auth.users().filter(x => x.id === b2.getAttribute("data-tog"))[0];
        if (!u) return;
        kit.confirmDialog((u.active ? "Disable" : "Enable") + " user <b>" + U.esc(u.username) + "</b>?", () => {
          auth.adminUpdateUser(me, u.id, { active: !u.active });
          kit.toast("Updated", "ok");
          render();
        }, { danger: u.active, yesLabel: "Yes" });
      }));
      body.querySelectorAll("[data-del]").forEach(b2 => b2.addEventListener("click", () => {
        const u = auth.users().filter(x => x.id === b2.getAttribute("data-del"))[0];
        if (!u) return;
        kit.confirmDialog("Permanently delete user <b>" + U.esc(u.username) + "</b>?", () => {
          auth.adminDeleteUser(me, u.id);
          kit.toast("User deleted", "ok");
          render();
        }, { danger: true, yesLabel: "Delete" });
      }));
      body.querySelectorAll("[data-rpw]").forEach(b2 => b2.addEventListener("click", () => {
        const u = auth.users().filter(x => x.id === b2.getAttribute("data-rpw"))[0];
        if (!u) return;
        const m = kit.modal('<div class="field"><label>New password for ' + U.esc(u.username) + '</label><input id="rpw" type="text" placeholder="Must meet policy"></div>' +
          '<div class="meter"><i id="rpwMeter"></i></div><div class="err-msg" id="rpw-err"></div>', { title: "Reset password", size: "sm" });
        m.body.querySelector("#rpw").addEventListener("input", e => kit.pwStrength(e.target.value, { meter: "rpwMeter" }));
        const foot = document.createElement("div");
        foot.style.cssText = "display:flex;justify-content:flex-end;gap:8px;margin-top:10px";
        foot.innerHTML = '<button class="btn btn-primary" data-ok="1">Set password</button>';
        m.body.appendChild(foot);
        foot.querySelector("[data-ok]").addEventListener("click", () => {
          const pw = m.body.querySelector("#rpw").value;
          const r = auth.adminUpdateUser(me, u.id, { resetPw: pw });
          kit.toast(r.ok ? "Password reset — user must change on next login" : "Failed: " + r.msg, r.ok ? "ok" : "bad");
          m.close();
          render();
        });
      }));
      const nu = document.getElementById("au-new");
      if (nu) nu.addEventListener("click", () => {
        const m = kit.modal('<div class="frow"><div class="field"><label>Username</label><input id="cu-name" maxlength="32"></div>' +
          '<div class="field"><label>Full name</label><input id="cu-fn" maxlength="48"></div></div>' +
          '<div class="field"><label>Password</label><input id="cu-pw" type="text" placeholder="Min 8 + upper + number + special"></div>' +
          '<div class="field"><label>Role</label><select id="cu-role"><option>ANALYST</option><option>VIEWER</option><option>ADMIN</option></select></div>' +
          '<div class="err-msg" id="cu-err"></div>', { title: "Create user", size: "sm" });
        const foot = document.createElement("div");
        foot.style.cssText = "display:flex;justify-content:flex-end;gap:8px;margin-top:10px";
        foot.innerHTML = '<button class="btn btn-primary" data-ok="1">Create</button>';
        m.body.appendChild(foot);
        foot.querySelector("[data-ok]").addEventListener("click", () => {
          const r = auth.adminCreateUser(me, m.body.querySelector("#cu-name").value, m.body.querySelector("#cu-pw").value,
            m.body.querySelector("#cu-role").value, m.body.querySelector("#cu-fn").value);
          if (!r.ok) { m.body.querySelector("#cu-err").textContent = r.msg; return; }
          kit.toast("User created", "ok");
          m.close();
          render();
        });
      });
    }

    function settingsTab(body) {
      const s = container.settings.all();
      body.innerHTML = '<div class="card" style="max-width:640px"><h3>System settings</h3>' +
        '<div class="frow"><div class="field"><label>Session idle timeout (min)</label><input type="number" id="st-idle" min="1" max="480" value="' + s.idleTimeoutMin + '"></div>' +
        '<div class="field"><label>Log max entries before rotation</label><input type="number" id="st-log" min="100" max="10000" value="' + s.logMaxEntries + '"></div></div>' +
        '<div class="frow"><div class="field"><label>Saved results cap</label><input type="number" id="st-cap" min="5" max="100" value="' + s.resultCap + '"></div>' +
        '<div class="field"><label>Default capital ($)</label><input type="number" id="st-capital" min="100" value="' + s.defaultInitialCapital + '"></div></div>' +
        '<div class="field"><label>Default theme</label><select id="st-theme"><option value="dark"' + (s.theme === "dark" ? " selected" : "") + '>Dark</option><option value="light"' + (s.theme === "light" ? " selected" : "") + '>Light</option></select></div>' +
        '<div class="field"><label>Active market symbol</label><input id="st-symbol" list="st-syms" value="' + U.esc(s.symbol || "GC=F") + '">' +
        '<datalist id="st-syms"><option value="GC=F"><option value="XAUUSD=X"><option value="XAU=X"><option value="SI=F"><option value="CL=F"><option value="ES=F"></datalist>' +
        '<div class="hint">The whole site (dashboard, market data, backtests, advisor) runs on this symbol’s dataset. Each imported dataset is stored separately per symbol. Changing the symbol reloads the site.</div></div>' +
        '<button class="btn btn-primary" id="st-save">Save settings</button><div class="err-msg" id="st-msg"></div></div>';
      document.getElementById("st-save").addEventListener("click", () => {
        const gv = id => parseFloat(document.getElementById(id).value);
        container.settings.set("idleTimeoutMin", Math.max(1, gv("st-idle")));
        container.settings.set("logMaxEntries", Math.max(50, gv("st-log")));
        container.log.setMaxEntries(container.settings.get("logMaxEntries"));
        container.settings.set("resultCap", Math.max(5, gv("st-cap")));
        container.settings.set("defaultInitialCapital", Math.max(100, gv("st-capital")));
        container.settings.set("theme", document.getElementById("st-theme").value);
        const sym = (document.getElementById("st-symbol").value || "GC=F").trim().toUpperCase();
        container.settings.set("symbol", sym);
        container.log.add("INFO", container.actorId(), "SETTINGS_UPDATE", "Settings updated; active symbol " + sym);
        const el = document.getElementById("st-msg");
        el.classList.add("ok");
        el.textContent = "✓ Saved — reloading the site for the new symbol…";
        setTimeout(() => location.reload(), 700);
      });
    }

    function backupTab(body) {
      body.innerHTML = '<div class="grid grid-2"><div class="card"><h3>Backup</h3><p class="muted">Download a full JSON snapshot: users (with password hashes), market data, strategies, results, settings, logs, schedules, alerts.</p>' +
        '<button class="btn btn-primary" id="bk-out">⇩ Export full backup</button><div class="muted small" style="margin-top:8px">Local storage used: ' + U.num(container.stores.main.size() / 1024, 1) + ' KB</div></div>' +
        '<div class="card"><h3>Restore</h3><p class="muted">Replace all data from a backup JSON. You will be signed out if your account is not in the backup.</p>' +
        '<div class="drop" id="bk-drop">📂 Choose backup .json file<input type="file" id="bk-file" accept=".json"></div><div class="err-msg" id="bk-msg"></div></div></div>';
      document.getElementById("bk-out").addEventListener("click", () => {
        const data = {
          app: "StrategyLab", version: "2.0-modular", exportedAt: new Date().toISOString(),
          users: container.repos.users.all(),
          data: container.repos.market.get(),
          strategies: container.strategies.all(),
          results: container.results.list(),
          settings: container.settings.all(),
          logs: container.log.list(),
          logArchive: container.log.archives(),
          schedules: container.schedules.list(),
          alerts: container.alerts.list()
        };
        U.download("strategylab-backup-" + new Date().toISOString().slice(0, 10) + ".json", JSON.stringify(data, null, 2), "application/json");
        container.log.add("INFO", container.actorId(), "BACKUP_EXPORT", "Full backup exported");
        kit.toast("Backup downloaded", "ok");
      });
      const drop = document.getElementById("bk-drop"), fi = document.getElementById("bk-file");
      drop.addEventListener("click", () => fi.click());
      fi.addEventListener("change", () => {
        const rd = new FileReader();
        rd.onload = () => {
          let obj = null;
          try { obj = JSON.parse(rd.result); } catch (e) { document.getElementById("bk-msg").textContent = "Invalid backup JSON: " + e.message; return; }
          if (!obj || obj.app !== "StrategyLab") { document.getElementById("bk-msg").textContent = "Not a StrategyLab backup file."; return; }
          kit.confirmDialog("Restore this backup? It will REPLACE all users, data, strategies, results and logs.", () => {
            const me = auth.current();
            try {
              if (obj.users) container.repos.users.save(obj.users);
              if (obj.data) container.repos.market.set(obj.data);
              if (obj.strategies) container.strategies.repo.save(obj.strategies);
              if (obj.results) container.results.repo.saveAll(obj.results);
              if (obj.settings) { Object.keys(obj.settings).forEach(k => container.settings.set(k, obj.settings[k])); }
              if (obj.logs) container.repos.logs.save(obj.logs);
              if (obj.logArchive) container.repos.logs.saveArchives(obj.logArchive);
              if (obj.schedules) container.schedules.repo.save(obj.schedules);
              if (obj.alerts) container.alerts.repo.save(obj.alerts);
              container.log.add("SECURITY", me ? me.id : "system", "BACKUP_RESTORE", "Full backup restored (" + U.fmtDate(obj.exportedAt) + ")");
              const stillThere = me && obj.users && obj.users.some(x => x.id === me.id);
              kit.toast("Restore complete", "ok");
              if (stillThere) location.reload();
              else setTimeout(() => { location.replace("login.html"); }, 800);
            } catch (e) { document.getElementById("bk-msg").textContent = "Restore failed: " + e.message; }
          }, { danger: true, yesLabel: "Restore" });
        };
        rd.readAsText(fi.files[0]);
      });
    }

    function auditTab(body) {
      const rows = auth.auditList();
      body.innerHTML = '<div class="card"><h3>Audit trail <span class="sub">SECURITY-level log entries</span></h3>' +
        '<div class="tbl-wrap" style="max-height:60vh"><table class="tbl"><thead><tr><th>Time</th><th>User</th><th>Action</th><th>Details</th><th>IP</th></tr></thead><tbody>' +
        (rows.slice().reverse().map(e => '<tr><td class="muted">' + U.fmtDT(e.ts) + '</td><td>' + U.esc(e.userID) + '</td><td><code>' + U.esc(e.action) + '</code></td><td>' + U.esc(e.details) + '</td><td class="muted mono">' + U.esc(e.ip) + "</td></tr>").join("") ||
          "<tr><td colspan='5' class='muted'>No security events yet</td></tr>") + "</tbody></table></div></div>";
    }

    function testsTab(body) {
      body.innerHTML = '<div class="grid grid-2"><div class="card"><h3>Self tests</h3><p class="muted">Unit assertions for SHA-256, indicators, engine math and edge cases (zero trades, all-losing, daily-loss halt).</p>' +
        '<button class="btn btn-primary" id="tt-run">Run test suite</button><div id="tt-out" style="margin-top:12px"></div></div>' +
        '<div class="card"><h3>Performance benchmark</h3><p class="muted">Times a backtest over ' + container.settings.get("benchmarkBars") + ' synthetic candles.</p>' +
        '<button class="btn btn-primary" id="bm-run">Run benchmark</button><div id="bm-out" style="margin-top:12px"></div>' +
        '<div class="divider"></div><h3>Storage</h3><div class="kv"><b>localStorage used</b><span>' + U.num(container.stores.main.size() / 1024, 1) + ' KB</span>' +
        '<b>Users</b><span>' + auth.users().length + '</span><b>Strategies</b><span>' + container.strategies.all().length + '</span><b>Log entries</b><span>' + container.log.list().length + "</span></div></div></div>";
      document.getElementById("tt-run").addEventListener("click", () => {
        const out = document.getElementById("tt-out");
        out.innerHTML = '<span class="spin"></span> Running…';
        setTimeout(() => {
          try {
            const res = runAll(container);
            const pass = res.filter(r => r.ok).length;
            out.innerHTML = '<div style="display:flex;gap:10px;margin-bottom:8px"><span class="badge ' + (pass === res.length ? "ok" : "bad") + '">' + pass + "/" + res.length + " passed</span></div>" +
              '<div class="tbl-wrap" style="max-height:300px"><table class="tbl"><thead><tr><th></th><th>Test</th><th>Detail</th></tr></thead><tbody>' +
              res.map(r => '<tr><td>' + (r.ok ? '<span class="badge ok">PASS</span>' : '<span class="badge bad">FAIL</span>') + '</td><td>' + U.esc(r.name) + '</td><td class="muted">' + U.esc(r.detail || "") + "</td></tr>").join("") +
              "</tbody></table></div>";
            container.log.add("INFO", container.actorId(), "SELF_TEST", "Test suite: " + pass + "/" + res.length + " passed");
          } catch (e) { out.innerHTML = '<p class="err-msg">' + U.esc((e && e.message) || e) + "</p>"; }
        }, 60);
      });
      document.getElementById("bm-run").addEventListener("click", () => {
        const out = document.getElementById("bm-out");
        out.innerHTML = '<span class="spin"></span> Generating ' + container.settings.get("benchmarkBars") + " candles…";
        setTimeout(() => {
          try {
            const n = container.settings.get("benchmarkBars");
            const bars = demoData(n, 12345);
            const strat = container.strategies.byId((container.strategies.all()[0] || {}).id) || container.strategies.create("Bench", "MA_CROSS");
            const t0 = performance.now();
            const res = container.backtest.benchmark(strat, bars);
            const total = performance.now() - t0;
            out.innerHTML = '<div class="grid grid-3">' +
              '<div class="stat-card"><div class="lab">Bars</div><div class="val">' + U.num(n, 0) + "</div></div>" +
              '<div class="stat-card"><div class="lab">Engine time</div><div class="val">' + U.num(res.ms, 1) + " ms</div></div>" +
              '<div class="stat-card"><div class="lab">Throughput</div><div class="val">' + U.num(res.bps, 0) + " <small>b/s</small></div></div></div>" +
              '<p class="muted small">Total incl. indicator pre-compute: ' + U.num(total, 1) + " ms · trades: " + res.trades + "</p>";
            container.log.add("INFO", container.actorId(), "BENCHMARK", "Benchmark: " + res.ms.toFixed(1) + "ms over " + n + " bars");
          } catch (e) { out.innerHTML = '<p class="err-msg">' + U.esc((e && e.message) || e) + "</p>"; }
        }, 60);
      });
    }
    render();
  }
});
