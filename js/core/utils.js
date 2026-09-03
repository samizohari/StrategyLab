/* core/utils.js — pure helper functions (no DOM/storage) */
"use strict";

function uuid() {
  try { if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) { /* ignore */ }
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function num(v, d) {
  if (v == null || isNaN(v) || !isFinite(v)) return "—";
  d = d == null ? 2 : d;
  const x = Number(v);
  const s = x < 0 ? "−" : "";
  return s + Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}
function pct(v, d) { return v == null || isNaN(v) ? "—" : num(v, d) + "%"; }
function money(v) { return v == null || isNaN(v) ? "—" : "$" + num(Math.abs(v)); }
function signMoney(v) { return v == null || isNaN(v) ? "—" : (v < 0 ? "-$" : "$") + num(Math.abs(v)); }
function signPct(v) { return (v > 0 ? "+" : "") + num(v) + "%"; }
function fmtDate(d) {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt)) return String(d);
  return dt.toISOString ? dt.toISOString().slice(0, 10) : String(d);
}
function fmtDT(d) {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt)) return String(d);
  return dt.toLocaleString("en-GB", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function round(v, d) { const p = Math.pow(10, d == null ? 2 : d); return Math.round(v * p) / p; }
function debounce(fn, ms) { let t; return function (...a) { clearTimeout(t); t = setTimeout(() => fn.apply(this, a), ms); }; }

/* browser-only download helper (guarded for pure tests) */
function download(name, content, mime) {
  if (typeof document === "undefined") return;
  const b = new Blob([content], { type: mime || "text/plain;charset=utf-8" });
  const u = URL.createObjectURL(b);
  const a = document.createElement("a");
  a.href = u; a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(u); a.remove(); }, 400);
}

function toCSV(rows) {
  if (!rows || !rows.length) return "";
  const h = Object.keys(rows[0]);
  const out = [h.map(esc).join(",")];
  for (const r of rows) {
    out.push(h.map(k => {
      const v = r[k];
      if (v == null) return "";
      const s = String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(","));
  }
  return out.join("\n");
}

function downsample(data, max) {
  if (!data || data.length <= max) return data || [];
  const step = Math.ceil(data.length / max);
  const out = [];
  for (let i = 0; i < data.length; i += step) out.push(data[i]);
  const last = data[data.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

function lerpColor(hex, alpha) {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map(c => c + c).join("");
  const n = parseInt(h, 16);
  const a = alpha == null ? 1 : alpha;
  return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
}

function seededRand(seed) {
  let s = seed >>> 0;
  return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function isValidDateStr(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s).getTime());
}

export const U = {
  uuid, esc, num, pct, money, signMoney, signPct, fmtDate, fmtDT, clamp, round,
  debounce, download, toCSV, downsample, lerpColor, seededRand, isValidDateStr
};
export default U;
