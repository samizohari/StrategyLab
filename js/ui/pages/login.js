/* pages/login.js — sign-in / register page controller (no shell) */
"use strict";
import { buildContainer } from "../../app/container.js";
import { applyTheme } from "../theme.js";
import { kit } from "../kit.js";
import { U } from "../../core/utils.js";

const container = buildContainer();
container.boot();
applyTheme(container.settings.get("theme"));

// already signed in?
if (container.auth.current()) { location.replace("dashboard.html"); }

const root = document.getElementById("login-root");
root.innerHTML =
  '<div class="card glass login-card">' +
  '<div class="login-hero"><div class="ring">Au</div><h1>StrategyLab</h1>' +
  '<p class="muted">Strategy backtesting for gold (XAU/USD) — 100% in your browser</p></div>' +
  '<div class="login-tabs"><button id="lt-login" class="active">Sign in</button><button id="lt-reg">Create account</button></div>' +
  '<form id="loginForm">' +
  '<div class="field"><label>Username</label><input name="username" autocomplete="username" required maxlength="32" placeholder="admin"></div>' +
  '<div class="field"><label>Password</label><div class="pw-wrap"><input name="password" type="password" autocomplete="current-password" required placeholder="••••••••">' +
  '<button type="button" class="eye" data-eye="1">👁</button></div></div>' +
  '<div id="loginErr" class="err-msg"></div>' +
  '<button class="btn btn-primary btn-lg btn-block" type="submit">Sign in</button></form>' +
  '<form id="regForm" hidden>' +
  '<div class="frow"><div class="field"><label>Username <span class="req">*</span></label><input name="username" required minlength="3" maxlength="32" placeholder="3–32 chars"></div>' +
  '<div class="field"><label>Full name</label><input name="fullname" maxlength="48" placeholder="optional"></div></div>' +
  '<div class="field"><label>Password <span class="req">*</span></label><div class="pw-wrap">' +
  '<input name="password" type="password" required><button type="button" class="eye" data-eye="1">👁</button></div>' +
  '<div class="meter"><i id="pwMeter"></i></div><div id="pwRule" class="hint">Requires: ≥8 chars, uppercase, number, special character</div></div>' +
  '<div class="field"><label>Confirm password <span class="req">*</span></label><div class="pw-wrap">' +
  '<input name="password2" type="password" required><button type="button" class="eye" data-eye="1">👁</button></div></div>' +
  '<div id="regErr" class="err-msg"></div>' +
  '<button class="btn btn-primary btn-lg btn-block" type="submit">Create account (ANALYST role)</button>' +
  '<p class="muted" style="margin-top:8px;text-align:center">Self-registered users get the <span class="badge info">ANALYST</span> role.</p></form></div>';

function bindEyes(scope) {
  scope.querySelectorAll("[data-eye]").forEach(b => b.addEventListener("click", () => {
    const inp = b.parentElement.querySelector("input");
    inp.type = inp.type === "password" ? "text" : "password";
  }));
}
bindEyes(root);

function tab(which) {
  document.getElementById("lt-login").classList.toggle("active", which === "login");
  document.getElementById("lt-reg").classList.toggle("active", which === "register");
  document.getElementById("loginForm").hidden = which !== "login";
  document.getElementById("regForm").hidden = which !== "register";
}
document.getElementById("lt-login").addEventListener("click", () => tab("login"));
document.getElementById("lt-reg").addEventListener("click", () => tab("register"));

document.getElementById("regForm").querySelector("[name=password]").addEventListener("input", e => {
  const pol = kit.pwStrength(e.target.value, { meter: "pwMeter", rule: "pwRule" });
});
document.getElementById("loginForm").addEventListener("submit", ev => {
  ev.preventDefault();
  const f = ev.target;
  const err = document.getElementById("loginErr");
  const res = container.auth.login(f.username.value.trim(), f.password.value);
  if (!res.ok) {
    err.textContent = res.msg;
    err.classList.remove("ok");
    kit.shake(err);
    return;
  }
  location.replace("dashboard.html");
});
document.getElementById("regForm").addEventListener("submit", ev => {
  ev.preventDefault();
  const f = ev.target;
  const err = document.getElementById("regErr");
  if (f.password.value !== f.password2.value) { err.textContent = "Passwords do not match."; return; }
  const res = container.auth.register(f.username.value.trim(), f.password.value, f.fullname.value.trim());
  if (!res.ok) { err.textContent = res.msg; return; }
  err.textContent = "Account created. Signing you in…";
  err.classList.add("ok");
  const l = container.auth.login(res.user.username, f.password.value);
  if (l.ok) setTimeout(() => location.replace("dashboard.html"), 400);
});
tab("login");
void U;
