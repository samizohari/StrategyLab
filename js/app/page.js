/* js/app/page.js — startPage helper: session guard + shell mount + title for one page */
"use strict";
import { buildContainer } from "./container.js";
import { mountShell } from "../ui/shell.js";
import { applyTheme } from "../ui/theme.js";
import { kit } from "../ui/kit.js";
import { charts } from "../ui/charts.js";
import { createShared } from "../ui/shared.js";
import { pwPolicy } from "../core/sha256.js";

const PAGE_ROLES = {
  dashboard: ["ADMIN", "ANALYST", "VIEWER"],
  data: ["ADMIN", "ANALYST", "VIEWER"],
  strategies: ["ADMIN", "ANALYST"],
  backtest: ["ADMIN", "ANALYST"],
  compare: ["ADMIN", "ANALYST", "VIEWER"],
  optimize: ["ADMIN", "ANALYST"],
  scenarios: ["ADMIN", "ANALYST"],
  risk: ["ADMIN", "ANALYST", "VIEWER"],
  alerts: ["ADMIN", "ANALYST"],
  reports: ["ADMIN", "ANALYST", "VIEWER"],
  scheduler: ["ADMIN", "ANALYST"],
  logs: ["ADMIN"],
  admin: ["ADMIN"]
};

const PAGE_TITLES = {
  dashboard: "Dashboard", data: "Market Data", strategies: "Strategies", backtest: "Backtest Lab",
  compare: "Comparison", optimize: "Optimizer", scenarios: "Scenario Analysis", risk: "Risk Dashboard",
  alerts: "Alerts", reports: "Reports & Export", scheduler: "Scheduled Runs", logs: "System Logs", admin: "Admin Panel"
};

function forcedChangePw(container, user, onDone) {
  const m = kit.modal(
    "<p class='muted' style='margin-top:0'>You are using a default or reset password. Set a new one (min 8 chars, uppercase, number, special character).</p>" +
    "<div class='field'><label>New password</label><div class='pw-wrap'><input id='cpw1' type='password'>" +
    '<button type="button" class="eye" data-eye="1">👁</button></div><div class="meter"><i id="cpwMeter"></i></div></div>' +
    "<div class='field'><label>Confirm new password</label><div class='pw-wrap'><input id='cpw2' type='password'>" +
    '<button type="button" class="eye" data-eye="1">👁</button></div></div>' +
    "<div id='cpErr' class='err-msg'></div>",
    {
      title: "Change password", size: "sm",
      foot: '<button class="btn btn-primary" data-save="1">Save password</button>',
      onClose() { if (!container.auth.current() || container.auth.current().mustChangePw) location.replace("login.html"); }
    }
  );
  const esc = str => String(str).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  m.body.querySelectorAll("[data-eye]").forEach(b => b.addEventListener("click", () => {
    const inp = b.parentElement.querySelector("input");
    inp.type = inp.type === "password" ? "text" : "password";
  }));
  m.body.querySelector("#cpw1").addEventListener("input", e => {
    const pol = pwPolicy(e.target.value);
    const meter = m.body.querySelector("#cpwMeter");
    meter.style.width = (pol.ok ? 100 : Math.max(4, pol.score * 25)) + "%";
    meter.style.background = pol.ok ? "var(--ok)" : pol.score <= 1 ? "var(--bad)" : pol.score === 2 ? "var(--warn)" : "var(--acc)";
  });
  m.body.querySelector("[data-save]").addEventListener("click", () => {
    const p1 = m.body.querySelector("#cpw1").value;
    const p2 = m.body.querySelector("#cpw2").value;
    const err = m.body.querySelector("#cpErr");
    if (p1 !== p2) { err.textContent = "Passwords do not match."; return; }
    const pol = pwPolicy(p1);
    if (!pol.ok) { err.textContent = "Too weak: " + pol.msg.join(", ") + "."; return; }
    const res = container.auth.changePassword(user, p1);
    if (!res.ok) { err.textContent = res.msg; return; }
    kit.toast("Password updated", "ok", "Security");
    m.close();
    if (onDone) onDone();
  });
}

/**
 * startPage(name, { mount }) — guards session + role, boots container, mounts shell,
 * then calls mount(container, view, { kit, charts, shared, user }).
 */
export function startPage(name, handlers) {
  const container = buildContainer();
  container.boot();
  applyTheme(container.settings.get("theme"));

  const user = container.auth.current();
  if (!user) { location.replace("login.html"); return; }
  const roles = PAGE_ROLES[name];
  if (roles && roles.indexOf(user.role) < 0) { location.replace("dashboard.html"); return; }

  container.bindNotify({ askPermission: kit.askNotifyPermission, notify: kit.notify });
  const shared = createShared({ container, kit, charts });

  const shellEl = document.getElementById("shell");
  if (shellEl) mountShell(container, { active: name, title: PAGE_TITLES[name] || name, root: shellEl, kit, charts });

  const view = document.getElementById("view-root");
  document.title = (PAGE_TITLES[name] || name) + " — StrategyLab";
  try {
    handlers.mount(container, view, { kit, charts, shared, user });
    if (user.mustChangePw) forcedChangePw(container, user, () => {
      view.innerHTML = "";
      handlers.mount(container, view, { kit, charts, shared, user: container.auth.current() });
    });
  } catch (err) {
    view.innerHTML = '<div class="empty"><div class="big">⚠</div><p>' + String((err && err.message) || err) + "</p></div>";
    console.error(err);
  }
}
