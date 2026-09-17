/* pages/reports.js — printable reports + CSV/JSON exports */
"use strict";
import { startPage } from "../../app/page.js";
import { U } from "../../core/utils.js";

startPage("reports", {
  mount(container, view, { kit, charts, shared, user }) {
    const saved = container.results.list();
    const _b = container.market.rangeBounds();
    const _meta = container.market.meta();
    let html = '<div class="muted small" style="margin:0 0 10px">Data source: <b>' + U.esc(_meta.symbol || "—") + '</b> · ' +
      (_b ? U.esc(_b.start) + " – " + U.esc(_b.end) : "no data") + ' · ' + container.market.count() + ' bars' +
      (_meta.source ? ' · ' + U.esc(_meta.source) : "") + '</div>';
    html += '<div class="view-head"><div><h1>Reports &amp; Export</h1><p>Generate a printable report or download results as CSV / JSON.</p></div>' +
      '<div class="sp"></div><div class="actions"><button class="btn" id="rp-print" disabled>🖨 Print / PDF</button></div></div>';
    if (!saved.length) {
      html += '<div class="card"><div class="empty"><div class="big">▤</div>No saved results to report on.</div></div>';
      view.innerHTML = html;
      return;
    }
    const syms = ["All"];
    saved.forEach(r => { if (r.symbol && syms.indexOf(r.symbol) < 0) syms.push(r.symbol); });
    const activeSym = container.settings.get("symbol") || "GC=F";
    html += '<div class="card no-print"><div class="frow">' +
      '<div class="field"><label>Symbol</label><select id="rp-sym">' +
      syms.map(s => '<option value="' + U.esc(s) + '"' + (s === activeSym || (s === "All" && syms.indexOf(activeSym) < 0) ? " selected" : "") + ">" + U.esc(s) + "</option>").join("") +
      '</select><div class="hint">Reports follow the active symbol (All shows everything).</div></div>' +
      '<div class="field"><label>Result</label><select id="rp-sel"></select></div>' +
      '<div class="field" style="flex:0 0 auto"><label>&nbsp;</label><button class="btn btn-primary" id="rp-build">Build report</button></div></div></div>';
    html += '<div id="rp-out"></div>';
    view.innerHTML = html;

    document.getElementById("rp-build").addEventListener("click", () => build(document.getElementById("rp-sel").value));
    document.getElementById("rp-print").addEventListener("click", () => window.print());

    function build(id) {
      const r = container.results.get(id);
      if (!r) return;
      document.getElementById("rp-print").disabled = false;
      const out = document.getElementById("rp-out");
      const s = r.strategy || {};
      const m = r.metrics || {};
      const meta = s.logic ? (container.strategies.catalog().LOGIC_META[s.logic.type] || {}).label : "—";
      let h = '<div class="card" style="margin-top:14px"><h3 style="border-bottom:2px solid var(--gold);padding-bottom:8px">StrategyLab — Backtest Report</h3>' +
        '<div class="kv" style="margin-bottom:10px">' +
        "<b>Strategy</b><span>" + U.esc(s.name || "Portfolio") + "</span>" +
        "<b>Report generated</b><span>" + new Date().toLocaleString("en-GB") + "</span>" +
        "<b>User</b><span>" + U.esc(user.username) + "</span>" +
        "<b>Period</b><span>" + (r.dateRange ? U.esc(r.dateRange.start) + " → " + U.esc(r.dateRange.end) + " (" + r.dateRange.bars + " bars)" : "—") + "</span>" +
        "<b>Initial capital</b><span>$" + U.num(r.initialCapital) + "</span></div>" +
        '<p class="muted small" style="margin:0 0 12px">Logic: ' + U.esc(meta) + (s.combine && s.combine.enabled ? " · combined [" + U.esc(s.combine.logic) + "]" : "") + "</p></div>";
      h += shared.metricCardsHTML(m);
      h += shared.pnlCardsHTML(r);
      h += '<div class="grid grid-2" style="margin-top:14px"><div class="card"><h3>Equity curve</h3><div class="chart-box"><canvas id="rp-eq"></canvas></div></div>' +
        '<div class="card"><h3>Drawdown</h3><div class="chart-box"><canvas id="rp-dd"></canvas></div></div></div>';
      const tr = r.tradeLog || [];
      h += '<div class="card" style="margin-top:14px"><h3>Trade summary <span class="sub">' + tr.length + " trades" + (tr.length ? " · last 25 shown" : "") + '</span></h3>' +
        '<div class="tbl-wrap" style="max-height:340px"><table class="tbl"><thead><tr><th>Entry</th><th>Exit</th><th>Side</th><th class="right">Qty</th><th class="right">Entry</th><th class="right">Exit</th><th class="right">P&amp;L $</th><th class="right">P&amp;L %</th><th>Reason</th></tr></thead><tbody>' +
        (tr.slice(-25).map(t => '<tr><td>' + U.esc(t.entryDate) + "</td><td>" + U.esc(t.exitDate) + "</td><td>" + (t.dir === 1 ? "L" : "S") +
          '</td><td class="right">' + U.num(t.qty) + '</td><td class="right">' + U.num(t.entry) + '</td><td class="right">' + U.num(t.exit) +
          '</td><td class="right ' + (t.pnl >= 0 ? "pos" : "neg") + '">' + U.signMoney(t.pnl) +
          '</td><td class="right ' + (t.pnl >= 0 ? "pos" : "neg") + '">' + U.signPct(t.pnlPct) + '</td><td class="muted">' + U.esc(t.reason) + "</td></tr>").join("")) +
        "</tbody></table></div></div>";
      h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;align-items:center" class="no-print">' +
        '<button class="btn btn-primary" id="rp-print2">🖨 Print / save as PDF</button>' +
        '<button class="btn" id="rp-csv">⇩ Trades CSV</button>' +
        '<button class="btn" id="rp-eqcsv">⇩ Equity CSV</button>' +
        '<button class="btn" id="rp-json">⇩ Report JSON</button>' +
        '<span class="muted small">CSV opens in Excel / Google Sheets; PDF via the browser print dialog.</span></div>';
      out.innerHTML = h;
      const prefix = "rp";
      charts.line(prefix + "-eq", (r.equityCurve || []).map(p => p[0]),
        [{ label: "Equity", data: (r.equityCurve || []).map(p => p[1]), color: "#e6b53c", fill: true }], { title: "Equity curve" });
      charts.line(prefix + "-dd", (r.drawdown || []).map(p => p[0]),
        [{ label: "Drawdown %", data: (r.drawdown || []).map(p => U.round(p[1], 2)), color: "#f4574d", fill: true }], { title: "Drawdown" });
      document.getElementById("rp-print2").addEventListener("click", () => window.print());
      document.getElementById("rp-csv").addEventListener("click", () => shared.exportResultCSV(r));
      document.getElementById("rp-eqcsv").addEventListener("click", () => shared.exportEquityCSV(r));
      document.getElementById("rp-json").addEventListener("click", () => shared.exportReportJSON(r));
    }
    let pool = saved;
    function refreshSel() {
      const sel = document.getElementById("rp-sel");
      const keep = sel && sel.value;
      sel.innerHTML = pool.map((r, i) =>
        '<option value="' + r.id + '"' + (r.id === keep || (!keep && i === 0) ? " selected" : "") + ">" +
        (r.symbol ? "[" + U.esc(r.symbol) + "] " : "") + U.esc(r.strategy ? r.strategy.name : "Portfolio") + " · " + U.fmtDate(r.timestamp) + "</option>").join("") ||
        "<option value=''>No results for this symbol — run backtests first</option>";
      build(sel.value || "");
    }
    const symSel = document.getElementById("rp-sym");
    if (symSel) symSel.addEventListener("change", () => {
      const v = symSel.value;
      pool = v === "All" ? saved : saved.filter(r => r.symbol === v);
      refreshSel();
    });
    refreshSel();
    container.log.add("INFO", container.actorId(), "REPORT_VIEW", "Opened report builder");
  }
});
