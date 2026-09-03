/* ui/charts.js — Chart.js adapter (presentation layer, theme-aware) */
"use strict";
import { U } from "../core/utils.js";

const instances = {};

function cssVar(name) {
  const c = getComputedStyle(document.documentElement);
  return c.getPropertyValue(name).trim() || "#888";
}
function colors() {
  return {
    acc: cssVar("--acc"), grid: cssVar("--line"), tick: cssVar("--ink-2"),
    ok: cssVar("--ok"), bad: cssVar("--bad"),
    pal: [cssVar("--acc"), cssVar("--info"), cssVar("--ok"), cssVar("--bad"), cssVar("--warn"), "#c77dff", "#2bd4c4", "#ff9f6e"]
  };
}
function hasChart() { return typeof Chart !== "undefined"; }
function destroy(id) {
  if (instances[id]) { try { instances[id].destroy(); } catch (e) { /* ignore */ } delete instances[id]; }
}
function baseOpts(extra) {
  const c = colors();
  return Object.assign({
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { labels: { color: c.tick, boxWidth: 12, font: { size: 11 } } },
      tooltip: { backgroundColor: cssVar("--bg-3"), titleColor: cssVar("--ink"), bodyColor: cssVar("--ink-2"), borderColor: c.grid, borderWidth: 1 }
    }
  }, extra || {});
}

function line(id, labels, series, opts) {
  if (!hasChart()) return false;
  destroy(id);
  const c = colors();
  const ds = series.map((s, i) => {
    const col = s.color || c.pal[i % c.pal.length];
    return {
      label: s.label, data: s.data, borderColor: col,
      backgroundColor: U.lerpColor(col, 0.08), fill: !!s.fill,
      borderWidth: s.width || 1.6, pointRadius: 0, tension: 0.15,
      borderDash: s.dash || [], yAxisID: s.axis || "y", spanGaps: true
    };
  });
  const o = baseOpts({
    scales: Object.assign({
      x: { type: "category", ticks: { color: c.tick, maxTicksLimit: 10, font: { size: 10 } }, grid: { display: false } },
      y: { ticks: { color: c.tick, font: { size: 10 } }, grid: { color: c.grid } }
    }, (opts && opts.scales) || {})
  });
  if (opts && opts.y2) o.scales.y2 = Object.assign({ position: "right", grid: { display: false }, ticks: { color: c.tick, font: { size: 10 } } }, opts.y2);
  o.plugins.title = opts && opts.title ? { display: true, text: opts.title, color: cssVar("--ink-2"), font: { size: 13, weight: "600" } } : undefined;
  const el = document.getElementById(id);
  if (!el) return false;
  instances[id] = new Chart(el.getContext("2d"), { type: "line", data: { labels, datasets: ds }, options: o });
  return true;
}

function bar(id, labels, series, opts) {
  if (!hasChart()) return false;
  destroy(id);
  const c = colors();
  const ds = series.map((s, i) => {
    const col = s.color || c.pal[i % c.pal.length];
    return {
      label: s.label, data: s.data,
      backgroundColor: Array.isArray(s.colors) ? s.colors : s.background || U.lerpColor(col, 0.75),
      borderColor: col, borderWidth: 1, borderRadius: 5
    };
  });
  const o = baseOpts({
    scales: {
      x: { ticks: { color: c.tick, font: { size: 10 } }, grid: { display: false } },
      y: { beginAtZero: true, ticks: { color: c.tick, font: { size: 10 } }, grid: { color: c.grid } }
    }
  });
  o.plugins.title = opts && opts.title ? { display: true, text: opts.title, color: cssVar("--ink-2"), font: { size: 13, weight: "600" } } : undefined;
  const el = document.getElementById(id);
  if (!el) return false;
  instances[id] = new Chart(el.getContext("2d"), { type: "bar", data: { labels, datasets: ds }, options: o });
  return true;
}

function radar(id, labels, datasets) {
  if (!hasChart()) return false;
  destroy(id);
  const c = colors();
  const ds = datasets.map((s, i) => {
    const col = s.color || c.pal[i % c.pal.length];
    return {
      label: s.label, data: s.data, borderColor: col,
      backgroundColor: U.lerpColor(col, 0.18), pointBackgroundColor: col, borderWidth: 2
    };
  });
  const o = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { labels: { color: c.tick, boxWidth: 12, font: { size: 11 } } } },
    scales: {
      r: {
        ticks: { color: c.tick, backdropColor: "transparent", font: { size: 9 } },
        grid: { color: c.grid }, angleLines: { color: c.grid }, pointLabels: { color: c.tick, font: { size: 10 } }
      }
    }
  };
  const el = document.getElementById(id);
  if (!el) return false;
  instances[id] = new Chart(el.getContext("2d"), { type: "radar", data: { labels, datasets: ds }, options: o });
  return true;
}

function allDestroy() { Object.keys(instances).forEach(destroy); }

export const charts = { line, bar, radar, destroy, allDestroy, hasChart, colors, cssVar };
