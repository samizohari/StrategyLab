/* pages/data.js — market data page controller */
"use strict";
import { startPage } from "../../app/page.js";
import { U } from "../../core/utils.js";

startPage("data", {
  mount(container, view, { kit, charts, shared, user }) {
    const market = container.market;
    const isAnalyst = user.role !== "VIEWER";
    const st = market.stats();
    let html = '<div class="view-head"><div><h1>Market Data</h1><p>Import, manage and inspect the OHLCV series used for backtesting (localStorage only).</p></div>' +
      '<div class="sp"></div><div class="actions">' +
      (st ? '<button class="btn" id="data-export">Export CSV</button>' : "") +
      (st ? '<button class="btn btn-danger" id="data-clear">Clear data</button>' : "") + "</div></div>";
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
      '</span><b>Imported</b><span>' + U.fmtDT(market.meta().importedAt) + "</span></div></div></div>";
    html += '<div class="card" style="margin-top:14px"><h3>Series preview <span class="sub" id="data-cnt"></span></h3>' +
      '<div class="tbl-wrap" style="max-height:420px"><table class="tbl"><thead><tr><th>Date</th><th class="right">Open</th><th class="right">High</th><th class="right">Low</th><th class="right">Close</th><th class="right">Volume</th></tr></thead><tbody id="data-tb"></tbody></table></div></div>';
    view.innerHTML = html;
    document.getElementById("data-cnt").textContent = st ? (st.count + " bars · " + st.start + " → " + st.end) : "no data";

    function fillTable() {
      const rows = market.bars().slice(-80).map(b =>
        "<tr><td>" + U.esc(b.d) + "</td><td class='right'>" + U.num(b.o) + "</td><td class='right'>" + U.num(b.h) +
        "</td><td class='right'>" + U.num(b.l) + "</td><td class='right'><b>" + U.num(b.c) + "</b></td><td class='right'>" + U.num(b.v, 0) + "</td></tr>").join("");
      document.getElementById("data-tb").innerHTML = rows || "<tr><td colspan='6' class='muted' style='text-align:center'>No bars</td></tr>";
    }
    fillTable();
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
        const looksJSON = /^\s*[\[]/.test(txt) || /^\s*\{/.test(txt);
        applyParsed(looksJSON ? market.importJSON(txt) : market.importCSV(txt));
      });
      document.getElementById("data-demo").addEventListener("click", () => {
        const n = market.regenerateDemo();
        container.log.add("INFO", container.actorId(), "DATA_DEMO", "Regenerated demo data");
        msg("Demo data regenerated: " + n + " bars.", true);
        fillTable();
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
