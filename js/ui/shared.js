/* ui/shared.js — shared result/metrics renderers used by several pages (presentation) */
"use strict";
import { U } from "../core/utils.js";

export function createShared({ container, kit, charts }) {
  const results = container.results;

  function metricCardsHTML(m) {
    if (!m) return "";
    const cell = (lab, val, cls) => '<div class="card stat-card"><div class="lab">' + lab + '</div><div class="val ' + (cls || "") + '">' + val + "</div></div>";
    const pf = m.profitFactor === null ? (m.winningTrades > 0 ? "∞" : "—") : U.num(m.profitFactor);
    const sharpe = m.sharpe === null ? "—" : U.num(m.sharpe);
    return '<div class="grid grid-4" style="margin-bottom:14px">' +
      cell("Total return", m.totalReturn === null ? "—" : U.signPct(m.totalReturn), (m.totalReturn || 0) > 0 ? "pos" : (m.totalReturn || 0) < 0 ? "neg" : "") +
      cell("Win rate", m.winRate === null ? "—" : U.num(m.winRate) + "%") +
      cell("Profit factor", pf) +
      cell("Trades", String(m.totalTrades || 0)) +
      cell("Sharpe ratio", sharpe) +
      cell("Max drawdown", m.maxDrawdown === null ? "—" : U.num(m.maxDrawdown) + "%", "neg") +
      cell("Avg win / loss", m.avgWinLoss === null ? "—" : U.num(m.avgWinLoss) + "×") +
      cell("Exposure", m.exposure === null ? "—" : U.num(m.exposure) + "%") +
      "</div>";
  }

  function pnlCardsHTML(r) {
    const trades = r.tradeLog || [];
    let net = 0, grossWin = 0, grossLoss = 0;
    for (const t of trades) {
      if (t.pnl >= 0) grossWin += t.pnl; else grossLoss += -t.pnl;
      net += t.pnl;
    }
    const eqCurve = r.equityCurve || [];
    const startEq = eqCurve.length ? eqCurve[0][1] : r.initialCapital || 0;
    const endEq = eqCurve.length ? eqCurve[eqCurve.length - 1][1] : startEq;
    const eqNet = endEq - startEq;
    return '<div class="grid grid-3" style="margin-bottom:14px">' +
      '<div class="card stat-card"><div class="lab">Net P&amp;L (trade log)</div><div class="val ' + (net >= 0 ? "pos" : "neg") + '">' + U.signMoney(net) + "</div></div>" +
      '<div class="card stat-card"><div class="lab">Equity change ($)</div><div class="val ' + (eqNet >= 0 ? "pos" : "neg") + '">' + U.signMoney(eqNet) + "</div></div>" +
      '<div class="card stat-card"><div class="lab">Gross profit / loss</div><div class="val" style="font-size:16px;margin-top:10px"><span class="pos">' + U.signMoney(grossWin) +
      '</span> / <span class="neg">' + U.signMoney(-grossLoss) + "</span></div></div></div>";
  }

  function equityCanvasHTML(prefix) {
    return '<div class="chart-box"><canvas id="' + prefix + '-eq"></canvas></div>' +
      '<div class="chart-box" style="margin-top:10px"><canvas id="' + prefix + '-dd"></canvas></div>';
  }
  function drawCharts(prefix, r) {
    const eq = r.equityCurve || [], dd = r.drawdown || [];
    charts.line(prefix + "-eq", eq.map(p => p[0]),
      [{ label: "Equity", data: eq.map(p => p[1]), color: "#e6b53c", fill: true }], { title: "Equity curve" });
    charts.line(prefix + "-dd", (dd || []).map(p => p[0]),
      [{ label: "Drawdown %", data: (dd || []).map(p => U.round(p[1], 2)), color: "#f4574d", fill: true }], { title: "Drawdown" });
  }

  function tradesTableHTML(r) {
    const rows = (r.tradeLog || []).map(t =>
      '<tr><td>' + U.esc(t.entryDate) + "</td><td>" + U.esc(t.exitDate) + "</td><td>" + (t.dir === 1 ? "LONG" : "SHORT") +
      '</td><td class="right">' + U.num(t.entry) + '</td><td class="right">' + U.num(t.exit) + '</td><td class="right">' + U.num(t.qty) +
      '</td><td class="right ' + (t.pnl >= 0 ? "pos" : "neg") + '">' + U.signMoney(t.pnl) +
      '</td><td class="right ' + (t.pnl >= 0 ? "pos" : "neg") + '">' + U.signPct(t.pnlPct) + "</td><td>" + U.esc(t.reason || "") + "</td></tr>"
    ).join("");
    return '<div class="tbl-wrap" style="max-height:52vh"><table class="tbl"><thead><tr><th>Entry</th><th>Exit</th><th>Side</th>' +
      '<th class="right">Entry $</th><th class="right">Exit $</th><th class="right">Qty</th><th class="right">P&amp;L $</th><th class="right">P&amp;L %</th><th>Reason</th></tr></thead><tbody>' +
      (rows || "<tr><td colspan='9' class='muted'>No trades</td></tr>") + "</tbody></table></div>";
  }

  function showTrades(r) {
    kit.modal(tradesTableHTML(r), { title: "Trade log — " + (r.strategy ? r.strategy.name : "") + " (trades: " + (r.tradeLog ? r.tradeLog.length : 0) + ")", size: "lg" });
  }
  function exportResultCSV(r) {
    const csv = results.tradesCSV(r) || "No trades";
    U.download("trades-" + results.safeName(r) + ".csv", csv, "text/csv");
    kit.toast("Trade log exported", "ok", "Export");
  }
  function exportEquityCSV(r) {
    U.download("equity-" + results.safeName(r) + ".csv", results.equityCSV(r), "text/csv");
  }
  function exportReportJSON(r) {
    U.download("report-" + results.safeName(r) + ".json", results.reportJSON(r), "application/json");
  }
  function deleteResult(r, onDone) {
    kit.confirmDialog("Delete this saved result?", () => {
      results.remove(r.id);
      container.log.add("INFO", container.actorId(), "RESULT_DELETE", "Deleted result " + r.id);
      kit.toast("Result deleted", "ok", "Results");
      if (onDone) onDone();
    }, { danger: true, yesLabel: "Delete" });
  }

  /** Full result detail panel: renders into root element (cards, buttons, charts). */
  function renderResultDetail(root, r) {
    const prefix = "rd" + Math.random().toString(36).slice(2, 8);
    let html = '<div class="card" style="margin-top:14px"><h3>Result — ' + U.esc(r.strategy ? r.strategy.name : "Portfolio") +
      (r.portfolio ? ' <span class="badge gold">PORTFOLIO</span>' : "") +
      ' <span class="sub">' + U.fmtDT(r.timestamp) + "</span></h3>";
    if (r.portfolio) {
      html += '<table class="tbl"><thead><tr><th>Member</th><th class="right">Return</th><th class="right">Win rate</th><th class="right">Trades</th><th class="right">PF</th><th class="right">MaxDD</th></tr></thead><tbody>';
      r.children.forEach(c => {
        const cm = c.metrics || {};
        html += "<tr><td>" + U.esc(c.name) + "</td><td class='right'>" + U.signPct(cm.totalReturn) +
          "</td><td class='right'>" + (cm.winRate == null ? "—" : U.num(cm.winRate) + "%") +
          "</td><td class='right'>" + (cm.totalTrades || 0) +
          "</td><td class='right'>" + (cm.profitFactor === null ? "∞" : U.num(cm.profitFactor)) +
          "</td><td class='right'>" + U.num(cm.maxDrawdown) + "%</td></tr>";
      });
      html += "</tbody></table><div class='divider'></div>";
    }
    html += '<div class="kv" style="margin-bottom:12px">' +
      "<b>Strategy</b><span>" + U.esc((r.strategy && r.strategy.name) || "—") + "</span>" +
      "<b>Logic</b><span>" + U.esc(r.strategy && r.strategy.logic ? (container.strategies.catalog().LOGIC_META[r.strategy.logic.type] || {}).label || r.strategy.logic.type : "—") + "</span>" +
      "<b>Period</b><span>" + (r.dateRange ? U.esc(r.dateRange.start) + " → " + U.esc(r.dateRange.end) + " (" + r.dateRange.bars + " bars)" : "—") + "</span>" +
      "<b>Capital</b><span>$" + U.num(r.initialCapital) + "</span>" +
      "<b>Run at</b><span>" + U.fmtDT(r.timestamp) + "</span></div>";
    html += metricCardsHTML(r.metrics);
    html += pnlCardsHTML(r);
    html += '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<button class="btn btn-sm" data-act="trades">Trade log (' + (r.tradeLog ? r.tradeLog.length : 0) + ")</button>" +
      '<button class="btn btn-sm" data-act="csv">Export trades CSV</button>' +
      '<button class="btn btn-sm" data-act="del">Delete</button></div>' +
      '<div style="margin-top:12px">' + equityCanvasHTML(prefix) + "</div></div>";
    root.innerHTML = html;
    const btn = (act, fn) => {
      const el = root.querySelector('[data-act="' + act + '"]');
      if (el) el.addEventListener("click", fn);
    };
    btn("trades", () => showTrades(r));
    btn("csv", () => exportResultCSV(r));
    btn("del", () => deleteResult(r, () => renderResultDetail(root, { ...r, deleted: true })));
    drawCharts(prefix, r);
  }

  return {
    metricCardsHTML, pnlCardsHTML, equityCanvasHTML, drawCharts, tradesTableHTML,
    showTrades, exportResultCSV, exportEquityCSV, exportReportJSON,
    deleteResult, renderResultDetail
  };
}
