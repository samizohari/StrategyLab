/* ui/md.js — minimal safe Markdown renderer + strategy help popup (presentation).
   The renderer is DOM-free so it can be unit-tested headless. */
"use strict";
import { composeStrategyHelp } from "../domain/help.js";

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function inline(s) {
  // escape first, then apply inline markup (never re-escape the captured text)
  s = esc(s);
  return s
    .replace(/`([^`]+)`/g, (_, c) => "<code>" + c + "</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/~~([^~]+)~~/g, "<del>$1</del>")
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

/** renderMarkdown(md) -> escaped, structured HTML (basic CommonMark subset). */
export function renderMarkdown(md) {
  if (!md) return "<p class='muted'>No documentation yet.</p>";
  const lines = String(md).replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let i = 0;
  let list = null; // 'ul' | 'ol'
  let para = [];
  const flushPara = () => {
    if (para.length) { out.push("<p>" + para.map(inline).join("<br>") + "</p>"); para = []; }
  };
  const flushList = () => { if (list) { out.push("</" + list + ">"); list = null; } };
  const closePara = () => { flushPara(); flushList(); };

  while (i < lines.length) {
    const raw = lines[i];

    // code fence
    const fence = raw.match(/^\s*```/);
    if (fence) {
      closePara();
      const buf = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++; // skip closing fence
      out.push("<pre><code>" + esc(buf.join("\n")) + "</code></pre>");
      continue;
    }

    const t = raw.trim();

    // blank
    if (!t) { closePara(); i++; continue; }

    // headings
    const h = t.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      closePara();
      const level = h[1].length;
      out.push("<h" + level + ">" + inline(h[2]) + "</h" + level + ">");
      i++;
      continue;
    }
    // hr
    if (/^(\s*[-*_]\s*){3,}$/.test(t)) { closePara(); out.push("<hr>"); i++; continue; }
    // blockquote
    if (/^>\s?/.test(t)) {
      closePara();
      const quote = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { quote.push(lines[i].replace(/^>\s?/, "")); i++; }
      out.push("<blockquote>" + quote.map(q => inline(q)).join("<br>") + "</blockquote>");
      continue;
    }
    // table
    if (t.indexOf("|") >= 0 && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1]) && /-/.test(lines[i + 1])) {
      closePara();
      const parseRow = row => row.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map(c => inline(c.trim()));
      const head = parseRow(t);
      i += 2; // skip separator
      const rows = [];
      while (i < lines.length && lines[i].trim().indexOf("|") >= 0) { rows.push(parseRow(lines[i])); i++; }
      let th = "<table><thead><tr>" + head.map(c => "<th>" + c + "</th>").join("") + "</tr></thead>";
      if (rows.length) th += "<tbody>" + rows.map(r => "<tr>" + r.map(c => "<td>" + c + "</td>").join("") + "</tr>").join("") + "</tbody>";
      out.push(th + "</table>");
      continue;
    }
    // unordered list
    const ul = t.match(/^[-*+]\s+(.*)$/);
    if (ul) {
      flushPara();
      if (list !== "ul") { flushList(); out.push("<ul>"); list = "ul"; }
      out.push("<li>" + inline(ul[1]) + "</li>");
      i++;
      continue;
    }
    // ordered list
    const ol = t.match(/^\d+[.)]\s+(.*)$/);
    if (ol) {
      flushPara();
      if (list !== "ol") { flushList(); out.push("<ol>"); list = "ol"; }
      out.push("<li>" + inline(ol[1]) + "</li>");
      i++;
      continue;
    }
    flushList();
    para.push(t);
    i++;
  }
  flushPara();
  flushList();
  return out.join("\n");
}

/** showStrategyHelp({kit, strategy, resolveName?, title?}) — popup viewer with
 *  Markdown content (strategy.helpMd, falling back to the auto-composed doc). */
export function showStrategyHelp(opts) {
  const kit = opts.kit;
  const s = opts.strategy;
  if (!s) return;
  const md = (s.helpMd && String(s.helpMd).trim()) ? s.helpMd : composeStrategyHelp(s, opts.resolveName);
  kit.modal('<div class="md">' + renderMarkdown(md) + "</div>", {
    title: (opts.title || "Strategy help") + " — " + String(s.name || ""),
    size: "lg",
    onReady(ov) {
      const body = ov.querySelector(".modal-body");
      if (body && body.scrollTop) body.style.maxHeight = "70vh";
    }
  });
}

export const Md = { renderMarkdown, showStrategyHelp };
