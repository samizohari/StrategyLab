/* ui/kit.js — DOM component kit: toast, modal, confirm, busy, password helpers */
"use strict";
import { U } from "../core/utils.js";
import { pwPolicy } from "../core/sha256.js";

function toast(msg, type, title) {
  const root = document.getElementById("toast-root");
  if (!root) return;
  const t = document.createElement("div");
  t.className = "toast " + (type || "");
  const ic = type === "ok" ? "✓" : type === "bad" ? "✕" : type === "warn" ? "⚠" : "ℹ";
  t.innerHTML = '<span class="t-ic">' + ic + '</span><div><b>' + U.esc(title || (type === "ok" ? "Success" : type === "bad" ? "Error" : "Notice")) +
    '</b><span>' + U.esc(msg) + "</span></div>";
  root.appendChild(t);
  setTimeout(() => { t.style.opacity = "0"; t.style.transition = "opacity .3s"; setTimeout(() => t.remove(), 350); }, 4200);
}

function modal(html, opts) {
  opts = opts || {};
  const root = document.getElementById("modal-root");
  if (!root) return null;
  const ov = document.createElement("div");
  ov.className = "modal-overlay";
  ov.innerHTML = '<div class="modal ' + (opts.size === "lg" ? "lg" : opts.size === "sm" ? "sm" : "") + '">' +
    '<div class="modal-head"><h3>' + U.esc(opts.title || "") + '</h3><div style="flex:1"></div>' +
    '<button class="btn btn-ghost icon-btn" data-close="1">✕</button></div>' +
    '<div class="modal-body">' + html + "</div>" +
    (opts.foot ? '<div class="modal-foot">' + opts.foot + "</div>" : "") + "</div>";
  root.appendChild(ov);
  function close() { ov.remove(); if (opts.onClose) opts.onClose(); }
  ov.addEventListener("click", e => { if (e.target === ov || e.target.getAttribute("data-close")) close(); });
  if (opts.onReady) opts.onReady(ov);
  return { close, body: ov.querySelector(".modal-body"), overlay: ov };
}

function confirmDialog(msg, onYes, opts) {
  opts = opts || {};
  modal('<div style="display:flex;gap:12px"><div style="font-size:22px">' + (opts.icon || "⚠") +
    '</div><div style="color:var(--ink-2);font-size:13.5px;line-height:1.5">' + msg + "</div></div>",
    {
      title: opts.title || "Please confirm", size: "sm",
      foot: '<button class="btn" data-c="1">Cancel</button><button class="btn ' + (opts.danger ? "btn-danger" : "btn-primary") + '" data-y="1">' + (opts.yesLabel || "Confirm") + "</button>",
      onReady(ov) {
        ov.querySelector("[data-y]").addEventListener("click", () => { ov.remove(); if (onYes) onYes(); });
        ov.querySelector("[data-c]").addEventListener("click", () => ov.remove());
      }
    });
}

function busy(show, msg) {
  let b = document.getElementById("busyOverlay");
  if (show) {
    if (!b) {
      b = document.createElement("div");
      b.id = "busyOverlay";
      b.style.cssText = "position:fixed;inset:0;z-index:300;display:flex;align-items:center;justify-content:center;background:rgba(5,7,10,.55);backdrop-filter:blur(3px)";
      document.body.appendChild(b);
    }
    b.innerHTML = '<div style="background:var(--card);border:1px solid var(--line);padding:22px 30px;border-radius:16px;text-align:center;box-shadow:var(--shadow)">' +
      '<div class="spin" style="width:26px;height:26px;border-width:3px;margin:0 auto 10px"></div><div style="font-weight:600">' + U.esc(msg || "Working…") + "</div></div>";
    b.style.display = "flex";
  } else if (b) b.remove();
}

function shake(el) { if (!el) return; el.classList.remove("shake"); void el.offsetWidth; el.classList.add("shake"); }

function togglePw(btn) {
  const inp = btn.parentElement.querySelector("input");
  inp.type = inp.type === "password" ? "text" : "password";
}

/** Evaluate policy + update meter UI. Returns {ok, msg}. */
function pwStrength(pw, ids) {
  const pol = pwPolicy(pw || "");
  if (ids && ids.meter) {
    const m = document.getElementById(ids.meter);
    if (m) {
      m.style.width = (pol.ok ? 100 : Math.max(4, pol.score * 25)) + "%";
      m.style.background = pol.ok ? "var(--ok)" : pol.score <= 1 ? "var(--bad)" : pol.score === 2 ? "var(--warn)" : "var(--acc)";
    }
  }
  if (ids && ids.rule) {
    const r = document.getElementById(ids.rule);
    if (r) {
      r.innerHTML = pol.ok ? "✓ Strong enough" : "Requires: " + pol.msg.join(", ");
      r.style.color = pol.ok ? "var(--ok)" : "";
    }
  }
  return pol;
}

/* notification adapter (browser Notification API) */
function askNotifyPermission() {
  if (!("Notification" in window)) { toast("Notifications not supported in this browser", "warn"); return; }
  if (Notification.permission === "default") {
    Notification.requestPermission().then(p => toast(p === "granted" ? "Notifications enabled" : "Notifications blocked", p === "granted" ? "ok" : "warn", "Alerts"));
  } else toast("Permission: " + Notification.permission, "info", "Alerts");
}
function notify(title, body) {
  try {
    if ("Notification" in window && Notification.permission === "granted") new Notification(title, { body });
  } catch (e) { /* ignore */ }
}

export const kit = { toast, modal, confirmDialog, busy, shake, togglePw, pwStrength, askNotifyPermission, notify };
