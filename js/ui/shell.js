/* ui/shell.js — role-aware application shell (sidebar + topbar) for MPA pages */
"use strict";
import { U } from "../core/utils.js";
import { toggleTheme } from "./theme.js";

const NAV = [
  { id: "dashboard", label: "Dashboard", ic: "▦", group: "Overview", kbd: "1", roles: ["ADMIN", "ANALYST", "VIEWER"] },
  { id: "data", label: "Market Data", ic: "◧", group: "Data", kbd: "2", roles: ["ADMIN", "ANALYST", "VIEWER"] },
  { id: "strategies", label: "Strategies", ic: "⚙", group: "Trading", kbd: "3", roles: ["ADMIN", "ANALYST"] },
  { id: "backtest", label: "Backtest Lab", ic: "▶", group: "Trading", kbd: "4", roles: ["ADMIN", "ANALYST"] },
  { id: "compare", label: "Comparison", ic: "≋", group: "Analysis", kbd: "5", roles: ["ADMIN", "ANALYST", "VIEWER"] },
  { id: "optimize", label: "Optimizer", ic: "◎", group: "Analysis", kbd: "6", roles: ["ADMIN", "ANALYST"] },
  { id: "scenarios", label: "Scenario Analysis", ic: "◈", group: "Analysis", kbd: "7", roles: ["ADMIN", "ANALYST"] },
  { id: "risk", label: "Risk Dashboard", ic: "▲", group: "Analysis", kbd: "8", roles: ["ADMIN", "ANALYST", "VIEWER"] },
  { id: "alerts", label: "Alerts", ic: "🔔", group: "Automation", kbd: "9", roles: ["ADMIN", "ANALYST"] },
  { id: "reports", label: "Reports & Export", ic: "▤", group: "Automation", kbd: "0", roles: ["ADMIN", "ANALYST", "VIEWER"] },
  { id: "scheduler", label: "Scheduled Runs", ic: "⏱", group: "Automation", kbd: "", roles: ["ADMIN", "ANALYST"] },
  { id: "logs", label: "System Logs", ic: "🕮", group: "Admin", kbd: "L", roles: ["ADMIN"] },
  { id: "admin", label: "Admin Panel", ic: "⚷", group: "Admin", kbd: "A", roles: ["ADMIN"] }
];
const NAV_BY_ID = {};
NAV.forEach(n => { NAV_BY_ID[n.id] = n; });

export function navForRole(role) { return NAV.filter(n => n.roles.indexOf(role) >= 0); }
export function pageMeta(id) { return NAV_BY_ID[id]; }

/** mountShell(container, {active, title, root}) — renders sidebar + topbar.
 *  The view-root element (sibling of #shell) is moved inside the shell's .main. */
export function mountShell(container, cfg) {
  const shell = cfg.root;
  const user = container.auth.current();
  if (!user) return;

  shell.innerHTML = "";
  shell.className = "app-shell-root";

  const scrim = document.createElement("div");
  scrim.className = "scrim";
  scrim.addEventListener("click", () => document.body.classList.remove("nav-open"));

  const nav = navForRole(user.role);
  let navHTML = "";
  let lastGrp = "";
  nav.forEach(n => {
    if (n.group !== lastGrp) { navHTML += '<div class="grp">' + U.esc(n.group) + "</div>"; lastGrp = n.group; }
    navHTML += '<a class="nav-item ' + (n.id === cfg.active ? "active" : "") + '" href="' + n.id + '.html">' +
      '<span class="ic">' + n.ic + '</span><span>' + U.esc(n.label) + "</span>" +
      (n.kbd ? '<span class="kbd">' + n.kbd + "</span>" : "") + "</a>";
  });

  const roleBadge = user.role === "ADMIN" ? "badge gold" : user.role === "ANALYST" ? "badge info" : "badge neutral";
  const aside = document.createElement("aside");
  aside.className = "sidebar";
  aside.innerHTML =
    '<div class="brand"><div class="logo">Au</div><div><b>StrategyLab</b><small>Backtesting Suite</small></div></div>' +
    '<nav class="nav">' + navHTML + "</nav>" +
    '<div class="side-foot">Modular build · clean architecture<br>localStorage only · v2.0</div>';

  const mainWrap = document.createElement("div");
  mainWrap.className = "main";
  const topbar = document.createElement("header");
  topbar.className = "topbar";
  topbar.innerHTML =
    '<button class="btn btn-ghost icon-btn no-print" id="btnBurger">☰</button>' +
    '<div class="crumb">' + U.esc(cfg.title || "") + "</div><div class='sp'></div>" +
    '<button class="btn btn-ghost icon-btn no-print" id="btnTheme" title="Toggle theme (D)">🌓</button>' +
    '<button class="btn btn-ghost icon-btn no-print" id="btnNotify" title="Enable notifications">🔔</button>' +
    '<div class="user-chip no-print"><div class="av">' + U.esc((user.fullname || user.username).slice(0, 1).toUpperCase()) +
    '</div><div><div class="nm">' + U.esc(user.fullname || user.username) +
    '</div><div class="rl">' + user.role + "</div></div></div>" +
    '<button class="btn btn-sm btn-ghost no-print" id="btnLogout">Sign out</button>';

  mainWrap.appendChild(topbar);
  shell.appendChild(scrim);
  shell.appendChild(aside);
  shell.appendChild(mainWrap);

  // relocate the sibling view-root into .main
  const viewRoot = document.getElementById("view-root");
  if (viewRoot) mainWrap.appendChild(viewRoot);

  /* burger visibility */
  const burger = topbar.querySelector("#btnBurger");
  const onResize = () => { burger.style.display = window.innerWidth < 900 ? "inline-flex" : "none"; };
  window.addEventListener("resize", onResize);
  onResize();
  burger.addEventListener("click", () => document.body.classList.toggle("nav-open"));

  topbar.querySelector("#btnTheme").addEventListener("click", () => {
    const t = toggleTheme(container.settings);
    if (cfg.kit) cfg.kit.toast("Theme switched to " + t, "ok", "Appearance");
  });
  topbar.querySelector("#btnNotify").addEventListener("click", () => {
    if (container.alerts) container.alerts.askPermission();
  });
  topbar.querySelector("#btnLogout").addEventListener("click", () => {
    container.auth.logout("user");
    location.replace("login.html");
  });

  /* idle watchdog + activity touch */
  const touch = U.debounce(() => container.auth.touch(), 800);
  ["click", "keydown", "scroll", "mousemove"].forEach(ev => document.addEventListener(ev, touch, { passive: true }));
  setInterval(() => {
    if (!container.auth.current()) location.replace("login.html");
  }, 20000);

  /* keyboard shortcuts (page-scoped: digits + d + ?) */
  const SHORTCUTS = { d: "Toggle dark/light theme", h: "Show shortcuts", esc: "Close dialogs" };
  nav.forEach((n, i) => { if (i < 10) SHORTCUTS[i < 9 ? String(i + 1) : "0"] = "Go to " + n.label; });
  document.addEventListener("keydown", function keyH(ev) {
    if (ev.target && /INPUT|TEXTAREA|SELECT/.test(ev.target.tagName)) return;
    const k = ev.key.toLowerCase();
    if (ev.key === "Escape") {
      const m = document.querySelector(".modal-overlay");
      if (m) m.remove();
      return;
    }
    if (k === "d") { toggleTheme(container.settings); return; }
    if (k === "?" || k === "/" || k === "h") {
      if (cfg.kit) {
        const rows = Object.keys(SHORTCUTS).map(x => "<tr><td><span class='kbd-hint'>" + U.esc(x) + "</span></td><td>" + U.esc(SHORTCUTS[x]) + "</td></tr>").join("");
        cfg.kit.modal("<table class='tbl'><thead><tr><th>Key</th><th>Action</th></tr></thead><tbody>" + rows + "</tbody></table>", { title: "Keyboard shortcuts", size: "sm" });
      }
      return;
    }
    const up = ev.key.toUpperCase();
    const target = nav.filter(n => n.kbd === up)[0];
    if (target && target.id !== cfg.active) location.href = target.id + ".html";
  });
}
