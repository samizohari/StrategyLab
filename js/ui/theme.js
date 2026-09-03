/* ui/theme.js — dark/light theme adapter */
"use strict";

export function applyTheme(theme) {
  const t = theme || "dark";
  document.documentElement.setAttribute("data-theme", t);
  return t;
}
export function currentTheme() {
  return document.documentElement.getAttribute("data-theme") || "dark";
}
export function toggleTheme(settings) {
  const next = currentTheme() === "dark" ? "light" : "dark";
  applyTheme(next);
  if (settings) settings.set("theme", next);
  return next;
}
