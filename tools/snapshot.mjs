#!/usr/bin/env node
/* tools/snapshot.mjs — fetch Yahoo daily bars server-side (no CORS) and write
   data/<slug>.json + data/index.json so the static site can import without a proxy.

   Run locally: node tools/snapshot.mjs "GC=F,XAUUSD=X" 5y
   Env: SYMBOLS (comma list), RANGE (1y|2y|5y|10y|max), OUT_DIR (default data) */
"use strict";
import { mkdir, writeFile, readdir, unlink } from "node:fs/promises";
import { buildYahooUrl, parseYahooChart } from "../js/adapters/yahoo-adapter.js";

const DEFAULT_SYMBOLS = ["GC=F", "MGC=F", "GLD", "SI=F", "CL=F", "ES=F", "BTC-USD", "EURUSD=X"];
const symbols = String(process.env.SYMBOLS || process.argv[2] || "")
  .split(",").map(s => s.trim()).filter(Boolean);
const list = symbols.length ? symbols : DEFAULT_SYMBOLS;
const range = String(process.env.RANGE || process.argv[3] || "10y").trim();
const outDir = process.env.OUT_DIR || "data";
const slug = s => String(s).replace(/[^A-Za-z0-9._-]/g, "_");

const entries = [];
await mkdir(outDir, { recursive: true });

for (const symbol of list) {
  const url = buildYahooUrl(symbol, range, "1d");
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; StrategyLab snapshot)" },
      signal: AbortSignal.timeout(30000)
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const parsed = parseYahooChart(await r.json());
    if (!parsed.ok) throw new Error(parsed.msg);
    const file = slug(symbol) + ".json";
    const payload = {
      symbol, fetchedAt: new Date().toISOString(), range,
      source: "Yahoo Finance chart API (server-side snapshot)",
      count: parsed.bars.length,
      first: parsed.bars[0].d, last: parsed.bars[parsed.bars.length - 1].d,
      bars: parsed.bars
    };
    await writeFile(outDir + "/" + file, JSON.stringify(payload));
    entries.push({ symbol, file, count: payload.count, first: payload.first, last: payload.last });
    console.log("ok   " + symbol + "  " + payload.count + " bars  " + payload.first + " -> " + payload.last);
  } catch (e) {
    console.error("fail " + symbol + "  " + (e.message || e));
  }
}

if (!entries.length) {
  console.error("No symbol could be snapshotted — leaving the previous data/ untouched.");
  process.exit(1);
}

/* drop files for symbols we no longer snapshot, but keep anything hand-added */
const keep = new Set(entries.map(e => e.file));
for (const f of await readdir(outDir)) {
  if (!f.endsWith(".json") || f === "index.json" || keep.has(f)) continue;
  const old = await import("node:fs/promises").then(m => m.readFile(outDir + "/" + f, "utf8")).catch(() => null);
  let known = false;
  try { known = !!JSON.parse(old).symbol; } catch (e) { known = false; }
  if (known && !list.some(s => slug(s) + ".json" === f)) await unlink(outDir + "/" + f);
}

await writeFile(outDir + "/index.json", JSON.stringify({
  generatedAt: new Date().toISOString(),
  range,
  symbols: entries
}, null, 2));
console.log("wrote " + outDir + "/index.json with " + entries.length + " symbol(s)");
