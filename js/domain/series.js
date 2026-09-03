/* domain/series.js — market series parsing/export/demo generation (pure) */
"use strict";
import { U } from "../core/utils.js";

function detectDelim(line) {
  if (line.indexOf("\t") >= 0) return "\t";
  if (line.indexOf(";") >= 0) return ";";
  return ",";
}

/** parseCSV(text) -> {ok, bars, warnings, skipped, msg} */
export function parseCSV(text) {
  const lines = text.replace(/\r/g, "").split("\n").filter(l => l.trim().length > 0);
  if (lines.length < 2) return { ok: false, msg: "File must contain a header row plus data rows.", warnings: [], skipped: 0 };
  const delim = detectDelim(lines[0]);
  const hdr = lines[0].split(delim).map(h => h.trim().replace(/^"|"$/g, "").toLowerCase());
  const find = aliases => { for (let i = 0; i < hdr.length; i++) if (aliases.indexOf(hdr[i]) >= 0) return i; return -1; };
  const cD = find(["date", "time", "timestamp", "day", "datetime", "d"]);
  const cO = find(["open", "o", "op"]);
  const cH = find(["high", "h", "hi"]);
  const cL = find(["low", "l", "lo"]);
  const cC = find(["close", "c", "cl", "price", "adj close", "px"]);
  const cV = find(["volume", "vol", "v"]);
  if (cD < 0 || cC < 0) return { ok: false, msg: "CSV needs at least Date and Close columns (Date,Open,High,Low,Close,Volume).", warnings: [], skipped: 0 };
  const out = [], warn = [], seen = {};
  let skip = 0;
  for (let i = 1; i < lines.length; i++) {
    const f = lines[i].split(delim).map(x => x.trim().replace(/^"|"$/g, ""));
    let date = null;
    const rawD = f[cD];
    if (/^\d{4}-\d{2}-\d{2}/.test(rawD)) date = rawD.slice(0, 10);
    else if (/^\d{4}\/\d{1,2}\/\d{1,2}/.test(rawD)) { const mm = rawD.split("/"); date = mm[0] + "-" + String(+mm[1]).padStart(2, "0") + "-" + String(+mm[2]).padStart(2, "0"); }
    else if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(rawD)) { const mm = rawD.split("/"); date = mm[2] + "-" + String(+mm[0]).padStart(2, "0") + "-" + String(+mm[1]).padStart(2, "0"); }
    if (!date || isNaN(new Date(date).getTime())) { skip++; continue; }
    const num = idx => { if (idx < 0 || idx >= f.length || f[idx] === "") return NaN; const v = parseFloat(f[idx].replace(/[$,%]/g, "")); return isNaN(v) ? NaN : v; };
    let o = cO >= 0 ? num(cO) : NaN, h = cH >= 0 ? num(cH) : NaN, l = cL >= 0 ? num(cL) : NaN;
    const c = num(cC);
    let v = cV >= 0 ? num(cV) : NaN;
    if (isNaN(c)) { skip++; continue; }
    if (isNaN(o)) o = c;
    if (isNaN(h) || h < Math.max(o, c)) h = Math.max(o, c);
    if (isNaN(l) || l > Math.min(o, c)) l = Math.min(o, c);
    if (isNaN(v)) v = 0;
    if (seen[date]) { warn.push("Duplicate date skipped: " + date); continue; }
    seen[date] = 1;
    out.push({ d: date, o, h, l, c, v });
  }
  if (!out.length) return { ok: false, msg: "No valid rows parsed (" + skip + " skipped). Check date format (YYYY-MM-DD).", warnings: warn, skipped: skip };
  out.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  return { ok: true, bars: out, warnings: warn, skipped: skip };
}

/** parseJSON(text) -> {ok, bars, warnings, skipped, msg} */
export function parseJSON(text) {
  let obj = null;
  try { obj = JSON.parse(text); } catch (e) { return { ok: false, msg: "Invalid JSON: " + e.message, warnings: [], skipped: 0 }; }
  const arr = Array.isArray(obj) ? obj : (obj.bars || obj.data);
  if (!Array.isArray(arr) || !arr.length) return { ok: false, msg: "JSON must be an array of {date,open,high,low,close,volume}.", warnings: [], skipped: 0 };
  const out = [], warn = [], seen = {};
  let skip = 0;
  for (const r of arr) {
    if (!r) continue;
    const d = String(r.date || r.d || r.time || r.t || "").slice(0, 10);
    if (!U.isValidDateStr(d)) { skip++; continue; }
    let o = +r.open || +r.o, c = +r.close || +r.c, h = +r.high || +r.h, l = +r.low || +r.l;
    const v = +r.volume || +r.v || 0;
    if (!isFinite(c)) { skip++; continue; }
    if (!isFinite(o)) o = c;
    if (!isFinite(h) || h < Math.max(o, c)) h = Math.max(o, c);
    if (!isFinite(l) || l > Math.min(o, c)) l = Math.min(o, c);
    if (seen[d]) { warn.push("Duplicate date: " + d); continue; }
    seen[d] = 1;
    out.push({ d, o, h, l, c, v });
  }
  if (!out.length) return { ok: false, msg: "No valid records parsed.", warnings: warn, skipped: skip };
  out.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  return { ok: true, bars: out, warnings: warn, skipped: skip };
}

export function exportCSV(bars) {
  const rows = bars.map(b => ({ Date: b.d, Open: b.o, High: b.h, Low: b.l, Close: b.c, Volume: Math.round(b.v) }));
  return U.toCSV(rows);
}

/** demoData(n, seed) — deterministic synthetic gold daily series */
export function demoData(n = 1600, seedVal = 20260903) {
  const rnd = U.seededRand(seedVal);
  const out = [];
  const d = new Date(2026, 8, 2);
  while (out.length < n) {
    if (d.getDay() !== 0 && d.getDay() !== 6) out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() - 1);
  }
  out.reverse();
  const bars = [];
  let price = 1870;
  const vol = 0.011;
  for (let i = 0; i < out.length; i++) {
    const t = i / out.length;
    const drift = 0.00035 * Math.sin(t * Math.PI * 2.2) + 0.0002 * Math.cos(t * Math.PI * 6.8) + 0.00025;
    let shock = 0;
    if (rnd() < 0.012) shock = (rnd() - 0.5) * 0.05;
    const ret = drift + (rnd() - 0.5) * 2 * vol + shock;
    const gap = (rnd() - 0.5) * vol * 0.4;
    const o = price * (1 + gap);
    const c = o * (1 + ret);
    const wickH = Math.abs(rnd()) * vol * 0.9;
    const wickL = Math.abs(rnd()) * vol * 0.9;
    const h = Math.max(o, c) * (1 + wickH);
    const l = Math.min(o, c) * (1 - wickL);
    const v = Math.round(60000 + rnd() * 260000 + (shock ? rnd() * 500000 : 0));
    bars.push({ d: out[i], o: U.round(o, 2), h: U.round(h, 2), l: U.round(l, 2), c: U.round(c, 2), v });
    price = c;
  }
  return bars;
}

export const Series = { parseCSV, parseJSON, exportCSV, demoData };
