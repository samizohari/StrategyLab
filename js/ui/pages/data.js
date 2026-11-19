/* pages/data.js — market data page controller */
"use strict";
import { startPage } from "../../app/page.js";
import { U } from "../../core/utils.js";
import { INTERVALS, RANGES, normInterval, rangesFor, maxRangeFor } from "../../adapters/yahoo-adapter.js";

startPage("data", {
  mount(container, view, { kit, charts, shared, user }) {
    const market = container.market;
    const isAnalyst = user.role !== "VIEWER";
    const st = market.stats();
    let html = '<div class="view-head"><div><h1>Market Data</h1><p>Import, manage and inspect the OHLCV series used for backtesting (localStorage only).</p></div>' +
      '<div class="sp"></div><div class="actions">' +
      (st ? '<button class="btn" id="data-export">Export CSV</button>' : "") +
      (st ? '<button class="btn btn-danger" id="data-clear">Clear data</button>' : "") + "</div></div>";
    const yhSym = container.settings.get("symbol") || "GC=F";
    const yhRange = container.settings.get("yahoo_range") || "2y";
    const yhInt = normInterval(container.settings.get("yahoo_interval") || "1d");
    const yhLast = container.settings.get("yahoo_last_at");
    html += '<div class="card" style="margin-bottom:14px"><h3>Yahoo Finance <span class="sub">live OHLCV import · pick symbol, timeframe and history</span></h3>' +
      '<div class="frow">' +
      '<div class="field" style="flex:2"><label>Symbol</label><input id="yh-sym" list="yh-syms" value="' + U.esc(yhSym) + '" placeholder="GC=F"><datalist id="yh-syms"><option value="GC=F"><option value="XAUUSD=X"><option value="XAU=X"><option value="SI=F"><option value="CL=F"><option value="ES=F"></datalist>' +
      '<div class="hint">GC=F gold futures · XAUUSD=X spot · any Yahoo symbol. The import replaces the dataset for this symbol and makes it the active symbol.</div></div>' +
      '<div class="field" style="flex:0 0 140px"><label>Timeframe</label><select id="yh-int">' +
      INTERVALS.map(o => '<option value="' + o.value + '"' + (yhInt === o.value ? " selected" : "") + ">" + o.label + "</option>").join("") + "</select></div>" +
      '<div class="field" style="flex:0 0 140px"><label>History</label><select id="yh-range"></select><div class="hint" id="yh-lim"></div></div>' +
      '<div class="field" style="flex:0 0 auto"><label>&nbsp;</label><div style="display:flex;gap:6px;flex-wrap:wrap">' +
      '<button class="btn btn-primary" id="yh-import">⇩ Import</button>' +
      '<button class="btn" id="yh-preview" title="Fetch and inspect before saving">▦ Preview</button>' +
      '<button class="btn" id="yh-refresh" title="Re-fetch the same symbol, timeframe and history">↻ Refresh</button></div></div></div>' +
      '<div id="yh-status" class="err-msg">' + (yhLast ? '<span style="color:var(--ink-3)">Last Yahoo import: ' + U.esc(yhLast) + "</span>" : "") + "</div>" +
      '<p class="muted small" style="margin:2px 0 0">Yahoo blocks direct browser calls (CORS), so the app automatically retries via public CORS proxies (allorigins → corsproxy.io). Intraday timeframes are capped by Yahoo: 1m ≈ 7 days, 5–30m ≈ 60 days, 1h ≈ 2 years.</p></div>';
    html += '<div id="yh-preview-card"></div>';
    html += '<div class="grid grid-2">';
    html += '<div class="card"><h3>Import <span class="sub">CSV or JSON — Date,Open,High,Low,Close,Volume</span></h3>' +
      '<div class="drop" id="data-drop">📂 Drop CSV/JSON file here<br><span class="muted">or click to browse</span><input type="file" id="data-file" accept=".csv,.json,.txt"></div>' +
      '<div class="field" style="margin-top:12px"><label>…or paste data</label><textarea id="data-paste" rows="5" placeholder="Date,Open,High,Low,Close,Volume&#10;2026-09-01,2040.1,2055.3,2035.2,2050.4,120340"></textarea></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary" id="data-parse">Parse pasted data</button>' +
      '<button class="btn" id="data-demo">Regenerate demo data</button></div><div id="data-msg"></div></div>';
    html += '<div class="card"><h3>Add bar manually <span class="sub">single OHLCV row</span></h3><div class="fgrid">' +
      '<div class="field"><label>Date</label><input type="date" id="m-date"></div>' +
      '<div class="field"><label>Open</label><input type="number" id="m-o" step="0.01"></div>' +
      '<div class="field"><label>High</label><input type="number" id="m-h" step="0.01"></div>' +
      '<div class="field"><label>Low</label><input type="number" id="m-l" step="0.01"></div>' +
      '<div class="field"><label>Close</label><input type="number" id="m-c" step="0.01"></div>' +
      '<div class="field"><label>Volume</label><input type="number" id="m-v" step="1"></div></div>' +
      '<button class="btn btn-primary" id="m-add">Add bar</button><div id="m-msg" class="err-msg" style="margin-top:6px"></div>' +
      '<div class="divider"></div><h4>Data source</h4><div class="kv"><b>Name</b><span>' + U.esc(market.meta().name || "—") +
      '</span><b>Source</b><span>' + U.esc(market.meta().source || "—") +
      '</span><b>Timeframe</b><span>' + U.esc(intervalLabel(market.meta().interval)) +
      '</span><b>Imported</b><span>' + U.fmtDT(market.meta().importedAt) + "</span></div></div></div>";
    html += gridCard("data", "Dataset grid", "stored bars for the active symbol");
    view.innerHTML = html;
    document.getElementById("data-cnt").textContent = st
      ? (market.meta().symbol + " · " + intervalLabel(market.meta().interval) + " · " + st.count + " bars · " + st.start + " → " + st.end)
      : "no data for " + market.meta().symbol;

    /* ---------- shared grid: paged OHLCV table ---------- */
    function intervalLabel(v) {
      if (!v) return "daily";
      const hit = INTERVALS.filter(x => x.value === v)[0];
      return hit ? hit.label : v;
    }
    function gridCard(id, title, sub) {
      return '<div class="card" id="' + id + '-grid" style="margin-top:14px"><h3>' + title + ' <span class="sub" id="' + id + '-cnt">' + sub + "</span></h3>" +
        '<div class="kv" id="' + id + '-stats" style="margin-bottom:10px"></div>' +
        '<div class="frow" style="align-items:flex-end">' +
        '<div class="field" style="flex:0 0 130px"><label>Rows / page</label><select data-grid="size" id="' + id + '-size">' +
        [25, 50, 100, 250].map(n => '<option value="' + n + '"' + (n === 50 ? " selected" : "") + ">" + n + "</option>").join("") + "</select></div>" +
        '<div class="sp"></div>' +
        '<div class="field" style="flex:0 0 auto"><label>&nbsp;</label><div style="display:flex;gap:6px;align-items:center">' +
        '<button class="btn btn-sm" data-grid="nav" data-dir="first">⏮</button>' +
        '<button class="btn btn-sm" data-grid="nav" data-dir="prev">◀</button>' +
        '<span class="muted small" data-grid="page" style="min-width:170px;text-align:center">—</span>' +
        '<button class="btn btn-sm" data-grid="nav" data-dir="next">▶</button>' +
        '<button class="btn btn-sm" data-grid="nav" data-dir="last">⏭</button></div></div></div>' +
        '<div class="tbl-wrap" style="max-height:480px"><table class="tbl"><thead><tr><th class="right">#</th><th>Date / time</th>' +
        '<th class="right">Open</th><th class="right">High</th><th class="right">Low</th><th class="right">Close</th>' +
        '<th class="right">Chg %</th><th class="right">Range</th><th class="right">Volume</th></tr></thead>' +
        '<tbody data-grid="body"></tbody></table></div></div>';
    }
    function mountGrid(root, getBars) {
      const body = root.querySelector('[data-grid="body"]');
      const pager = root.querySelector('[data-grid="page"]');
      const sizeSel = root.querySelector('[data-grid="size"]');
      let page = 0;
      const size = () => parseInt(sizeSel.value, 10) || 50;
      function draw() {
        const bars = getBars() || [];
        const per = size();
        const pages = Math.max(1, Math.ceil(bars.length / per));
        if (page > pages - 1) page = pages - 1;
        if (page < 0) page = 0;
        const from = bars.length ? page * per : 0;
        const slice = bars.slice(from, from + per);
        body.innerHTML = slice.map((b, k) => {
          const idx = from + k;
          const prev = idx > 0 ? bars[idx - 1].c : null;
          const chg = prev ? (b.c / prev - 1) * 100 : null;
          const rng = b.h - b.l;
          const bad = b.h < b.l || b.c > b.h || b.c < b.l;
          return "<tr" + (bad ? ' style="background:rgba(220,38,38,.06)" title="Inconsistent OHLC"' : "") + ">" +
            '<td class="right muted">' + (idx + 1) + "</td>" +
            "<td>" + U.esc(b.d) + "</td>" +
            '<td class="right">' + U.num(b.o) + "</td>" +
            '<td class="right">' + U.num(b.h) + "</td>" +
            '<td class="right">' + U.num(b.l) + "</td>" +
            '<td class="right"><b>' + U.num(b.c) + "</b></td>" +
            '<td class="right ' + (chg == null ? "" : chg >= 0 ? "pos" : "neg") + '">' + (chg == null ? "—" : (chg >= 0 ? "+" : "") + chg.toFixed(2) + "%") + "</td>" +
            '<td class="right muted">' + U.num(rng) + "</td>" +
            '<td class="right muted">' + U.num(b.v, 0) + "</td></tr>";
        }).join("") || "<tr><td colspan='9' class='muted' style='text-align:center'>No bars</td></tr>";
        pager.textContent = bars.length
          ? "rows " + (from + 1) + "–" + (from + slice.length) + " of " + bars.length + " · page " + (page + 1) + "/" + pages
          : "no bars";
        root.querySelectorAll('[data-grid="nav"]').forEach(btn => {
          const d = btn.getAttribute("data-dir");
          btn.disabled = !bars.length || (d === "first" || d === "prev" ? page === 0 : page >= pages - 1);
        });
      }
      root.querySelectorAll('[data-grid="nav"]').forEach(btn => btn.addEventListener("click", () => {
        const d = btn.getAttribute("data-dir");
        const pages = Math.max(1, Math.ceil((getBars() || []).length / size()));
        if (d === "first") page = 0;
        else if (d === "prev") page--;
        else if (d === "next") page++;
        else page = pages - 1;
        draw();
      }));
      sizeSel.addEventListener("change", () => { page = 0; draw(); });
      draw();
      return { draw, reset: () => { page = 0; draw(); } };
    }
    function statsHTML(bars) {
      if (!bars.length) return "<b>Bars</b><span>0</span>";
      let hi = -Infinity, lo = Infinity, vi = 0, bad = 0;
      bars.forEach(b => {
        if (b.h > hi) hi = b.h;
        if (b.l < lo) lo = b.l;
        vi += +b.v || 0;
        if (b.h < b.l || b.c > b.h || b.c < b.l) bad++;
      });
      const gaps = [];
      for (let i = 1; i < Math.min(bars.length, 200); i++) {
        const a = Date.parse(String(bars[i - 1].d).replace(" ", "T")), c = Date.parse(String(bars[i].d).replace(" ", "T"));
        if (!isNaN(a) && !isNaN(c) && c > a) gaps.push(c - a);
      }
      gaps.sort((x, y) => x - y);
      const step = gaps.length ? gaps[Math.floor(gaps.length / 2)] / 60000 : 0;
      const stepTxt = !step ? "—" : step < 60 ? step + " min" : step < 1440 ? (step / 60).toFixed(1) + " h" : (step / 1440).toFixed(0) + " d";
      return "<b>Bars</b><span>" + bars.length + "</span>" +
        "<b>From</b><span>" + U.esc(bars[0].d) + "</span>" +
        "<b>To</b><span>" + U.esc(bars[bars.length - 1].d) + "</span>" +
        "<b>High / Low</b><span>" + U.num(hi) + " / " + U.num(lo) + "</span>" +
        "<b>Avg volume</b><span>" + U.num(vi / bars.length, 0) + "</span>" +
        "<b>Bar spacing</b><span>" + stepTxt + "</span>" +
        "<b>Quality</b><span" + (bad ? ' class="neg"' : ' class="pos"') + ">" + (bad ? bad + " inconsistent row(s)" : "all rows consistent") + "</span>";
    }

    const dsGrid = mountGrid(document.getElementById("data-grid"), () => market.bars());
    const dsStats = document.getElementById("data-stats");
    dsStats.innerHTML = statsHTML(market.bars());

    const msg = (txt, ok) => {
      document.getElementById("data-msg").innerHTML = ok
        ? '<div class="err-msg ok" style="margin-top:8px">✓ ' + U.esc(txt) + "</div>"
        : '<div class="err-msg" style="margin-top:8px">' + U.esc(txt) + "</div>";
    };
    function applyParsed(res) {
      if (!res.ok) { msg(res.msg, false); return; }
      container.log.add("INFO", container.actorId(), "DATA_IMPORT", "Imported " + res.bars.length + " bars");
      if (res.warnings && res.warnings.length) kit.toast(res.warnings.slice(0, 3).join("; "), "warn", "Import warnings");
      msg("Imported " + res.bars.length + " bars. " + (res.skipped || 0) + " rows skipped.", true);
      location.reload();
    }
    function readFile(f) {
      const rd = new FileReader();
      rd.onload = () => {
        const txt = String(rd.result);
        applyParsed(/\.json$/i.test(f.name) ? market.importJSON(txt) : market.importCSV(txt));
      };
      rd.readAsText(f);
    }
    if (isAnalyst) {
      const drop = document.getElementById("data-drop"), fi = document.getElementById("data-file");
      drop.addEventListener("click", () => fi.click());
      drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("over"); });
      drop.addEventListener("dragleave", () => drop.classList.remove("over"));
      drop.addEventListener("drop", e => {
        e.preventDefault(); drop.classList.remove("over");
        const f = e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) readFile(f);
      });
      fi.addEventListener("change", () => { if (fi.files[0]) readFile(fi.files[0]); });
      document.getElementById("data-parse").addEventListener("click", () => {
        const txt = document.getElementById("data-paste").value;
        if (!txt.trim()) { msg("Paste something first.", false); return; }
        const looksJSON = /^\s*[\[{]/.test(txt);
        applyParsed(looksJSON ? market.importJSON(txt) : market.importCSV(txt));
      });
      document.getElementById("data-demo").addEventListener("click", () => {
        const n = market.regenerateDemo();
        container.log.add("INFO", container.actorId(), "DATA_DEMO", "Regenerated demo data");
        msg("Demo data regenerated: " + n + " bars.", true);
        location.reload();
      });
      document.getElementById("m-add").addEventListener("click", () => {
        const b = {
          d: document.getElementById("m-date").value, o: document.getElementById("m-o").value,
          h: document.getElementById("m-h").value, l: document.getElementById("m-l").value,
          c: document.getElementById("m-c").value, v: document.getElementById("m-v").value
        };
        if (!U.isValidDateStr(b.d)) { document.getElementById("m-msg").textContent = "Invalid date (YYYY-MM-DD)."; return; }
        const r = market.addBar(b);
        const me = document.getElementById("m-msg");
        if (!r.ok) { me.textContent = r.msg; return; }
        me.textContent = "";
        container.log.add("INFO", container.actorId(), "DATA_ADD", "Manual bar added " + b.d);
        kit.toast("Bar added", "ok", "Data");
        location.reload();
      });
    } else {
      document.getElementById("data-drop").style.opacity = 0.5;
      ["data-parse", "data-demo", "m-add", "data-clear"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = true;
      });
    }

    /* ---------- Yahoo Finance: timeframe-aware import + preview ---------- */
    const yhStatus = document.getElementById("yh-status");
    const intSel = document.getElementById("yh-int");
    const rangeSel = document.getElementById("yh-range");
    const limHint = document.getElementById("yh-lim");
    const previewCard = document.getElementById("yh-preview-card");

    function yhMessage(txt, ok) {
      yhStatus.classList.toggle("ok", !!ok);
      yhStatus.textContent = txt;
    }
    function fillRanges(preferred) {
      const iv = normInterval(intSel.value);
      const list = rangesFor(iv);
      const want = preferred || rangeSel.value || container.settings.get("yahoo_range") || "2y";
      const ok = list.some(r => r.value === want) ? want : maxRangeFor(iv);
      rangeSel.innerHTML = list.map(r => '<option value="' + r.value + '"' + (r.value === ok ? " selected" : "") + ">" + r.label + "</option>").join("");
      const cap = (INTERVALS.filter(x => x.value === iv)[0] || {}).maxDays || 0;
      limHint.textContent = cap ? "Yahoo caps " + intervalLabel(iv) + " at ~" + cap + " days." : "";
    }
    fillRanges(yhRange);

    async function fetchBars() {
      const symbol = document.getElementById("yh-sym").value.trim() || "GC=F";
      const interval = normInterval(intSel.value);
      const range = rangeSel.value;
      container.settings.set("yahoo_range", range);
      container.settings.set("yahoo_interval", interval);
      yhMessage("Fetching " + symbol + " · " + intervalLabel(interval) + " · " + range + " from Yahoo Finance…");
      kit.busy(true, "Fetching " + symbol + "…");
      try {
        const res = await container.yahoo.fetchChart(symbol, range, interval);
        kit.busy(false);
        if (!res.ok) { yhMessage(res.msg || "Yahoo import failed.", false); return null; }
        return { symbol, interval: res.interval || interval, range: res.range || range, requested: range, clamped: !!res.clamped, res };
      } catch (e) {
        kit.busy(false);
        yhMessage((e && e.message) || "Yahoo import failed.", false);
        return null;
      }
    }

    function showPreview(p) {
      const bars = p.res.bars;
      previewCard.innerHTML = '<div class="card" style="border-color:var(--accent,#3D6F94)">' +
        '<h3>Preview — not saved yet <span class="sub">' + U.esc(p.symbol) + " · " + U.esc(intervalLabel(p.interval)) + " · " + bars.length + " bars</span></h3>" +
        (p.clamped ? '<div class="err-msg" style="margin-bottom:8px">Yahoo limits ' + U.esc(intervalLabel(p.interval)) + " to ~" + ((INTERVALS.filter(x => x.value === p.interval)[0] || {}).maxDays || "?") +
          " days, so history was clamped from " + U.esc(p.requested) + " to " + U.esc(p.range) + ".</div>" : "") +
        '<div class="kv" id="prev-stats" style="margin-bottom:10px"></div>' +
        '<div class="frow" style="align-items:flex-end"><div class="field" style="flex:0 0 130px"><label>Rows / page</label>' +
        '<select data-grid="size">' + [25, 50, 100, 250].map(n => '<option value="' + n + '"' + (n === 50 ? " selected" : "") + ">" + n + "</option>").join("") + "</select></div>" +
        '<div class="sp"></div><div class="field" style="flex:0 0 auto"><label>&nbsp;</label><div style="display:flex;gap:6px;align-items:center">' +
        '<button class="btn btn-sm" data-grid="nav" data-dir="first">⏮</button><button class="btn btn-sm" data-grid="nav" data-dir="prev">◀</button>' +
        '<span class="muted small" data-grid="page" style="min-width:170px;text-align:center">—</span>' +
        '<button class="btn btn-sm" data-grid="nav" data-dir="next">▶</button><button class="btn btn-sm" data-grid="nav" data-dir="last">⏭</button></div></div></div>' +
        '<div class="tbl-wrap" style="max-height:420px"><table class="tbl"><thead><tr><th class="right">#</th><th>Date / time</th>' +
        '<th class="right">Open</th><th class="right">High</th><th class="right">Low</th><th class="right">Close</th><th class="right">Chg %</th><th class="right">Range</th><th class="right">Volume</th></tr></thead>' +
        '<tbody data-grid="body"></tbody></table></div>' +
        '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">' +
        '<button class="btn btn-primary" id="prev-save">✓ Save ' + bars.length + " bars as " + U.esc(p.symbol) + "</button>" +
        '<button class="btn" id="prev-discard">Discard</button>' +
        '<span class="muted small" style="align-self:center">Saving switches the whole site to ' + U.esc(p.symbol) + ".</span></div></div>";
      document.getElementById("prev-stats").innerHTML = statsHTML(bars);
      mountGrid(previewCard, () => bars);
      document.getElementById("prev-discard").addEventListener("click", () => { previewCard.innerHTML = ""; yhMessage("Preview discarded — nothing was saved.", true); });
      document.getElementById("prev-save").addEventListener("click", () => {
        const storedSym = market.importSymbol(p.symbol, bars, {
          name: p.symbol + " · " + intervalLabel(p.interval) + " via Yahoo Finance",
          source: "Yahoo Finance",
          symbol: p.symbol,
          interval: p.interval,
          range: p.range
        });
        container.settings.set("symbol", storedSym);
        container.settings.set("yahoo_last_at", new Date().toLocaleString("en-GB") + " — " + p.symbol + " " + p.interval + " " + bars.length + " bars");
        container.log.add("INFO", container.actorId(), "DATA_IMPORT", "Yahoo Finance " + storedSym + " " + p.interval + " (" + p.range + ") → " + bars.length + " bars");
        kit.toast("Saved " + bars.length + " bars for " + p.symbol, "ok", "Yahoo Finance");
        location.reload();
      });
      previewCard.scrollIntoView && previewCard.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    async function importYahoo() {
      if (!container.yahoo) {
        yhMessage("Yahoo import module not loaded yet — do a hard refresh (Ctrl/Cmd+Shift+R) to update the app.", false);
        return;
      }
      const p = await fetchBars();
      if (!p) return;
      const bars = p.res.bars;
      const storedSym = market.importSymbol(p.symbol, bars, {
        name: p.symbol + " · " + intervalLabel(p.interval) + " via Yahoo Finance",
        source: "Yahoo Finance",
        symbol: p.symbol,
        interval: p.interval,
        range: p.range
      });
      container.settings.set("symbol", storedSym);
      container.settings.set("yahoo_last_at", new Date().toLocaleString("en-GB") + " — " + p.symbol + " " + p.interval + " " + bars.length + " bars");
      container.log.add("INFO", container.actorId(), "DATA_IMPORT", "Yahoo Finance " + storedSym + " " + p.interval + " (" + p.range + ") → " + bars.length + " bars");
      yhMessage("");
      kit.toast("Imported " + bars.length + " " + intervalLabel(p.interval) + " bars for " + p.symbol, "ok", "Yahoo Finance");
      location.reload();
    }

    async function previewYahoo() {
      if (!container.yahoo) {
        yhMessage("Yahoo import module not loaded yet — do a hard refresh (Ctrl/Cmd+Shift+R) to update the app.", false);
        return;
      }
      const p = await fetchBars();
      if (!p) return;
      yhMessage("Preview ready — " + p.res.bars.length + " bars, nothing saved yet.", true);
      showPreview(p);
    }

    if (isAnalyst) {
      intSel.addEventListener("change", () => fillRanges());
      const impBtn = document.getElementById("yh-import");
      if (impBtn) impBtn.addEventListener("click", importYahoo);
      const refBtn = document.getElementById("yh-refresh");
      if (refBtn) refBtn.addEventListener("click", importYahoo);
      const pvBtn = document.getElementById("yh-preview");
      if (pvBtn) pvBtn.addEventListener("click", previewYahoo);
      const symInput = document.getElementById("yh-sym");
      if (symInput) symInput.addEventListener("keydown", e => { if (e.key === "Enter") importYahoo(); });
    } else {
      ["yh-import", "yh-refresh", "yh-preview"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = true;
      });
    }

    const ex = document.getElementById("data-export");
    if (ex) ex.addEventListener("click", () => {
      U.download("gold-ohlcv.csv", market.exportCSV(), "text/csv");
      container.log.add("INFO", container.actorId(), "DATA_EXPORT", "Exported CSV (" + market.count() + " bars)");
      kit.toast("CSV downloaded", "ok", "Export");
    });
    const cl = document.getElementById("data-clear");
    if (cl) cl.addEventListener("click", () => {
      kit.confirmDialog("Delete ALL market data? Strategies and results are kept.", () => {
        market.clear();
        container.log.add("WARNING", container.actorId(), "DATA_CLEAR", "All market data cleared");
        kit.toast("Data cleared", "ok");
        location.reload();
      }, { danger: true, yesLabel: "Clear" });
    });
  }
});
