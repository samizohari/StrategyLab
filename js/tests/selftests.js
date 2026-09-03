/* js/tests/selftests.js — unit assertions over domain/services (pure; no DOM).
   runAll(container) — container built with MemoryStore for headless runs, or the
   live browser container when launched from the Admin panel. */
"use strict";
import { sha256Hex, pwPolicy } from "../core/sha256.js";
import { sma, ema, rsi, macd, bollinger, atr } from "../domain/indicators.js";
import { parseCSV } from "../domain/series.js";
import { regimes } from "../domain/regime.js";
import { computeMetrics } from "../domain/metrics.js";
import { U } from "../core/utils.js";
import { createStrategy } from "../domain/entities.js";
import { parseLLMJSON } from "../services/ai-provider.js";
import { parseYahooChart, buildYahooUrl } from "../adapters/yahoo-adapter.js";

function mkBars(closes, opts) {
  opts = opts || {};
  const bars = [];
  for (let i = 0; i < closes.length; i++) {
    const c = closes[i], o = i === 0 ? c * 0.999 : closes[i - 1];
    const h = Math.max(o, c) * (1 + (opts.hw || 0.004));
    const l = Math.min(o, c) * (1 - (opts.lw || 0.004));
    bars.push({ d: opts.dates ? opts.dates[i] : ("2026-01-" + String((i % 28) + 1).padStart(2, "0")), o: U.round(o, 3), h: U.round(h, 3), l: U.round(l, 3), c: U.round(c, 3), v: 100000 + (i % 7) * 1000 });
  }
  return bars;
}
function simpleStrategy(container, over) {
  const s = createStrategy("T", "MA_CROSS", () => container.ids.next());
  return Object.assign(s, over || {});
}
const eq = (a, b, eps) => Math.abs(a - b) <= (eps || 1e-6);

export function runAll(container) {
  const results = [];
  const run = (name, fn) => {
    try { const d = fn(); results.push({ name, ok: true, detail: d || "" }); }
    catch (e) { results.push({ name, ok: false, detail: e.message }); }
  };

  /* crypto */
  run("SHA-256 vector: abc", () => {
    const h = sha256Hex("abc");
    if (h !== "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad") throw new Error("got " + h);
  });
  run("SHA-256 vector: empty", () => {
    const h = sha256Hex("");
    if (h !== "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855") throw new Error("got " + h);
  });
  run("SHA-256: UTF-8 input", () => {
    const h = sha256Hex("héllo世界");
    if (h.length !== 64) throw new Error("not hex64");
  });
  run("Password policy", () => {
    if (pwPolicy("short").ok) throw new Error("short accepted");
    if (!pwPolicy("Strong#123").ok) throw new Error("strong rejected");
  });

  /* indicators */
  run("SMA correctness", () => {
    const v = sma([1, 2, 3, 4, 5], 3);
    if (!(isNaN(v[0]) && isNaN(v[1]) && eq(v[2], 2) && eq(v[3], 3) && eq(v[4], 4))) throw new Error(JSON.stringify(v));
  });
  run("EMA increasing series", () => {
    const v = ema([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 3);
    const last = v[v.length - 1];
    if (!(last > 8 && last < 10)) throw new Error("last=" + last);
    for (let i = 4; i < v.length; i++) if (v[i] < v[i - 1]) throw new Error("not monotonic at " + i);
  });
  run("RSI all-gains ≈ high", () => {
    const cs = []; for (let i = 1; i <= 30; i++) cs.push(100 + i);
    const r = rsi(cs, 14);
    if (!(r[r.length - 1] > 90)) throw new Error("rsi=" + r[r.length - 1]);
  });
  run("RSI all-losses ≈ low", () => {
    const cs = []; for (let i = 1; i <= 30; i++) cs.push(200 - i);
    const r = rsi(cs, 14);
    if (!(r[r.length - 1] < 10)) throw new Error("rsi=" + r[r.length - 1]);
  });
  run("MACD finite after warmup", () => {
    const cs = []; for (let i = 1; i <= 200; i++) cs.push(1000 + Math.sin(i / 5) * 10 + i * 0.2);
    const m = macd(cs, 12, 26, 9);
    for (let i = 40; i < 200; i++) if (isNaN(m.macd[i]) || isNaN(m.signal[i]) || isNaN(m.hist[i])) throw new Error("NaN at " + i);
  });
  run("Bollinger: mid=SMA, upper>lower", () => {
    const cs = []; for (let i = 1; i <= 60; i++) cs.push(1000 + Math.sin(i / 3) * 20);
    const bb = bollinger(cs, 20, 2);
    const sm = sma(cs, 20);
    if (!eq(bb.mid[59], sm[59], 1e-9)) throw new Error("mid mismatch");
    if (!(bb.upper[59] > bb.lower[59])) throw new Error("band order");
  });
  run("ATR positive", () => {
    const b = mkBars(Array.from({ length: 40 }, (_, i) => 1000 + i));
    const a = atr(b, 14);
    if (!(a[39] > 0 && isFinite(a[39]))) throw new Error("atr=" + a[39]);
  });

  /* engine */
  const capital = {
    initialCapital: 10000, positionSizing: "risk", positionSize: 10, fixedUnits: 10,
    maxPositionPct: 90, compounding: true, maxDrawdown: 90, feePct: 0
  };
  const runSim = (s, bars) => {
    const evaluator = container.strategies.evaluator();
    const ctx = evaluator.makeContext(bars);
    const cfg = {
      strategy: s, ctx, rm: s.riskManagement, cm: s.capitalManagement,
      warmup: evaluator.maxWarmupFor(s),
      evaluate: (st, c, i, cs) => evaluator.evaluate(st, c, i, cs)
    };
    const st = {};
    container.backtest.engine.simulate(cfg, st, 0, bars.length - 1);
    return st;
  };

  run("Engine: take-profit win", () => {
    const cs = []; let p = 1000;
    for (let i = 0; i < 60; i++) { p *= 1.012; cs.push(p); }
    const bars = mkBars(cs, { hw: 0.01, lw: 0.004 });
    const s = simpleStrategy(container, {
      strategyLogic: { type: "MA_CROSS", params: { fastMA: 3, slowMA: 8, fastType: "sma", slowType: "sma", signalType: "above" } },
      riskManagement: { stopType: "pct", stopLoss: 2, tpType: "pct", takeProfit: 1.5, riskPerTrade: 1, maxDailyLoss: 20, maxConsecLosses: 9, pauseBars: 1 },
      capitalManagement: Object.assign({}, capital, { maxPositionPct: 50 })
    });
    const st = runSim(s, bars);
    if (!st.trades.length) throw new Error("no trades");
    const tp = st.trades.filter(t => t.reason === "take-profit");
    if (!tp.length) throw new Error("no TP exits");
    if (!(tp[0].pnl > 0)) throw new Error("TP trade lost money");
    if (!(st.cash > 10000)) throw new Error("equity not up: " + st.cash);
  });
  run("Engine: stop-loss & conservative both-touch", () => {
    const cs = []; let p = 1000;
    for (let i = 0; i < 15; i++) { p *= 1.01; cs.push(p); }
    const bars = mkBars(cs, { hw: 0.006, lw: 0.006 });
    const entryP = cs[cs.length - 1];
    bars.push({ d: "2026-02-01", o: entryP, h: entryP * 1.08, l: entryP * 0.92, c: entryP * 0.985 });
    const s = simpleStrategy(container, {
      strategyLogic: { type: "MA_CROSS", params: { fastMA: 2, slowMA: 5, fastType: "sma", slowType: "sma", signalType: "above" } },
      riskManagement: { stopType: "pct", stopLoss: 2, tpType: "pct", takeProfit: 4, riskPerTrade: 1, maxDailyLoss: 20, maxConsecLosses: 9, pauseBars: 1 },
      capitalManagement: Object.assign({}, capital, { maxPositionPct: 50 })
    });
    const st = runSim(s, bars);
    const stops = st.trades.filter(t => t.reason === "stop-loss");
    if (!stops.length) throw new Error("no stop exits; reasons=" + st.trades.map(t => t.reason).join(","));
    if (!(stops[0].pnl < 0)) throw new Error("stop exit not a loss");
  });
  run("Engine: zero-trade edge (short data)", () => {
    const bars = mkBars(Array.from({ length: 8 }, (_, i) => 1000 + i));
    const s = simpleStrategy(container, {
      strategyLogic: { type: "MA_CROSS", params: { fastMA: 100, slowMA: 250, fastType: "sma", slowType: "sma", signalType: "cross" } }
    });
    const st = runSim(s, bars);
    if (st.trades.length !== 0) throw new Error("expected 0 trades");
  });
  run("Engine: daily loss limit blocks re-entry same day", () => {
    const cs = []; let p = 1000;
    for (let i = 0; i < 25; i++) { p *= 1.002; cs.push(p); }
    const bars = mkBars(cs, { hw: 0.002, lw: 0.001 });
    bars.push({ d: "2026-03-01", o: U.round(p, 3), h: U.round(p * 1.002, 3), l: U.round(p * 0.94, 3), c: U.round(p * 0.945, 3) });
    bars.push({ d: "2026-03-01", o: U.round(p * 0.945, 3), h: U.round(p * 0.95, 3), l: U.round(p * 0.89, 3), c: U.round(p * 0.895, 3) });
    const s = simpleStrategy(container, {
      strategyLogic: { type: "MA_CROSS", params: { fastMA: 3, slowMA: 6, fastType: "sma", slowType: "sma", signalType: "above" } },
      riskManagement: { stopType: "pct", stopLoss: 2, tpType: "none", takeProfit: 4, riskPerTrade: 2, maxDailyLoss: 1.2, maxConsecLosses: 99, pauseBars: 1 },
      capitalManagement: capital
    });
    const st = runSim(s, bars);
    if (!st.trades.length) throw new Error("no trades at all");
    const stops = st.trades.filter(t => t.reason === "stop-loss" && t.exitDate === "2026-03-01");
    if (!stops.length) throw new Error("expected stop-loss on crash day");
    const shorts = st.trades.filter(t => t.dir === -1 && t.entryDate === "2026-03-01");
    if (shorts.length) throw new Error("re-entered short on crash day despite daily loss limit");
  });
  run("Engine: all-losing metrics", () => {
    const curve = []; let e2 = 10000;
    for (let i = 0; i < 30; i++) { e2 *= 0.98; curve.push(["2026-06-" + String((i % 28) + 1).padStart(2, "0"), e2]); }
    const trades = [];
    for (let t = 0; t < 5; t++) trades.push({ pnl: -50 - t, pnlPct: -1, qty: 1, entry: 1000, holdBars: 3 });
    const m = computeMetrics(curve, trades, 10000);
    if (m.winRate !== 0) throw new Error("winRate=" + m.winRate);
    if (m.totalTrades !== 5) throw new Error("count");
    if (m.avgWinLoss !== 0) throw new Error("avgWinLoss=" + m.avgWinLoss);
  });
  run("Engine: compounding changes outcome", () => {
    const cs = []; let p = 1000;
    for (let i = 0; i < 120; i++) { p *= 1.006; cs.push(p); }
    const bars = mkBars(cs, { hw: 0.004, lw: 0.002 });
    const runC = comp => {
      const s = simpleStrategy(container, {
        strategyLogic: { type: "MA_CROSS", params: { fastMA: 5, slowMA: 15, fastType: "sma", slowType: "sma", signalType: "above" } },
        riskManagement: { stopType: "pct", stopLoss: 1.5, tpType: "trail", takeProfit: 3, trailActivate: 1, trailDist: 0.8, riskPerTrade: 1.5, maxDailyLoss: 20, maxConsecLosses: 9, pauseBars: 1 },
        capitalManagement: Object.assign({}, capital, { positionSizing: "percentage", positionSize: 30, maxPositionPct: 50, compounding: comp })
      });
      const st = runSim(s, bars);
      return st.cash;
    };
    const c1 = runC(true), c2 = runC(false);
    if (Math.abs(c1 - c2) < 1) throw new Error("compounding had no effect: " + c1 + " vs " + c2);
  });

  /* regime + parsing */
  run("Regime detector labels", () => {
    const up = []; let p = 1000;
    for (let i = 0; i < 200; i++) { p *= 1.004; up.push(p); }
    const rg = regimes(mkBars(up), 60);
    const bulls = rg.filter(r => r === "bull").length;
    if (bulls < rg.length * 0.6) throw new Error("bulls=" + bulls + "/" + rg.length);
  });
  run("CSV parser: headers + duplicates", () => {
    const csv = "Date,Open,High,Low,Close,Volume\n2026-01-02,100,101,99,100.5,1000\n2026-01-03,100.5,102,100,101,1200\n2026-01-03,1,1,1,1,1\n";
    const r = parseCSV(csv);
    if (!r.ok) throw new Error(r.msg);
    if (r.bars.length !== 2) throw new Error("bars=" + r.bars.length);
    if (r.warnings.length < 1) throw new Error("dup not warned");
  });
  run("XSS escaping", () => {
    const s1 = "<scr" + "ipt>alert(1)</scr" + "ipt>";
    if (U.esc(s1) !== "&lt;script&gt;alert(1)&lt;/script&gt;") throw new Error("not escaped: " + U.esc(s1));
    if (U.esc('"onclick="x') !== "&quot;onclick=&quot;x") throw new Error("attr escape failed");
  });
  run("Combination engine: AND consensus", () => {
    const A = createStrategy("A", "MA_CROSS", () => container.ids.next());
    A.strategyLogic.params = { fastMA: 5, slowMA: 10, fastType: "sma", slowType: "sma", signalType: "above" };
    const B = createStrategy("B", "RSI", () => container.ids.next());
    B.strategyLogic.params = { period: 14, overbought: 80, oversold: 20, mode: "reversion" };
    const combo = createStrategy("C", "MA_CROSS", () => container.ids.next());
    combo.combine = { enabled: true, memberIds: [A.id, B.id], weights: {}, logic: "AND", threshold: 0, seqWindow: 5 };
    const list = container.strategies.all();
    const len = list.length;
    list.push(A, B);
    container.strategies.repo.save(list);
    try {
      const cs = []; let p = 1000;
      for (let i = 0; i < 80; i++) { p *= 1.004; cs.push(p); }
      const bars = mkBars(cs);
      const evaluator = container.strategies.evaluator();
      const ctx = evaluator.makeContext(bars);
      const st = {};
      const sig = evaluator.evaluate(combo, ctx, 79, st);
      if (sig.dir !== 0) throw new Error("AND fired with neutral member");
    } finally {
      container.strategies.repo.save(list.slice(0, len));
    }
  });
  run("LLM JSON parser: fenced + trailing prose", () => {
    const txt = "Sure! Here you go:\n```json\n{\"name\":\"A\",\"strategyLogic\":{\"type\":\"RSI\",\"params\":{}}}\n```\nGood luck!";
    const p = parseLLMJSON(txt);
    if (!p.ok) throw new Error(p.error);
    if (p.value.name !== "A" || p.value.strategyLogic.type !== "RSI") throw new Error("wrong parse");
  });
  run("LLM JSON parser: nested strings with braces", () => {
    const p = parseLLMJSON('{"name":"x","desc":"weird } brace","params":{"a":1}}');
    if (!p.ok || p.value.params.a !== 1 || p.value.desc.indexOf("}") < 0) throw new Error("nested parse fail");
  });
  run("LLM JSON parser: garbage rejected", () => {
    const p = parseLLMJSON("Sorry, I cannot do that.");
    if (p.ok) throw new Error("should have failed");
  });
  run("Advisor: deterministic local recommendations", () => {
    const recs1 = container.advisor.localRecommendations();
    const recs2 = container.advisor.localRecommendations();
    if (recs1.length < 2) throw new Error("too few recs: " + recs1.length);
    if (JSON.stringify(recs1.map(r => r.draft.name)) !== JSON.stringify(recs2.map(r => r.draft.name))) throw new Error("not deterministic");
    recs1.forEach(r => {
      const errs = container.strategies.validate(r.draft);
      if (errs.length) throw new Error(r.draft.name + ": " + errs.join(";"));
    });
  });
  run("Advisor: tweak suggestions handle no-result", () => {
    const s = container.strategies.all()[0];
    const res = container.advisor.suggestTweaks(s.id);
    if (!res.ok) throw new Error(res.msg);
  });
  run("Yahoo parser: bars, null rows, duplicates", () => {
    const day = 86400;
    const fixture = {
      chart: { result: [{
        timestamp: [1000 + day, 1000 + day, 1000 + 2 * day],
        indicators: { quote: [{ open: [10, null, 12], high: [11, null, 13], low: [9, null, 11], close: [10.5, null, 12.5], volume: [100, null, 150] }] }
      }] }
    };
    const p = parseYahooChart(fixture);
    if (!p.ok) throw new Error(p.msg);
    if (p.bars.length !== 2) throw new Error("bars=" + p.bars.length + " (null/dup rows must be dropped)");
    if (p.bars[0].d > p.bars[1].d) throw new Error("not sorted");
    if (p.bars[0].c !== 10.5) throw new Error("close mismatch");
  });
  run("Yahoo parser: error envelope", () => {
    const p = parseYahooChart({ chart: { error: { description: "No data found" } } });
    if (p.ok) throw new Error("should fail");
    if (!/No data/.test(p.msg)) throw new Error("msg wrong: " + p.msg);
  });
  run("Yahoo url builder", () => {
    const u = buildYahooUrl("GC=F", "2y", "1d");
    if (u.indexOf("GC%3DF") < 0 || u.indexOf("range=2y") < 0) throw new Error(u);
    if (buildYahooUrl("X", "bogus", "1d").indexOf("range=2y") < 0) throw new Error("bad range fallback");
  });
  run("Rate limiting: lock after 5 fails", () => {
    for (let i = 0; i < 5; i++) container.auth.login("viewer", "wrongpass1");
    const sixth = container.auth.login("viewer", "wrongpass1");
    if (sixth.locked !== true) throw new Error("not locked after 5 fails");
  });
  return results;
}
