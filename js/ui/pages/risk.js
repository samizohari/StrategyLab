/* pages/risk.js — risk dashboard */
"use strict";
import { startPage } from "../../app/page.js";
import { U } from "../../core/utils.js";

startPage("risk", {
  mount(container, view, { kit, charts, shared, user }) {
    const saved = container.results.list();
    let html = '<div class="view-head"><div><h1>Risk Dashboard</h1><p>Risk exposure of saved backtests — drawdown, volatility, exposure and halt events.</p></div></div>';
    if (!saved.length) {
      html += '<div class="card"><div class="empty"><div class="big">▲</div>Run and save backtests to populate risk metrics.</div></div>';
      view.innerHTML = html;
      return;
    }
    function volFromCurve(curve) {
      const rs = [];
      for (let i = 1; i < curve.length; i++) if (curve[i - 1][1] > 0) rs.push(curve[i][1] / curve[i - 1][1] - 1);
      if (rs.length < 5) return null;
      const m = rs.reduce((a, b) => a + b, 0) / rs.length;
      const v = rs.reduce((a, b) => a + (b - m) * (b - m), 0) / (rs.length - 1);
      return Math.sqrt(v) * Math.sqrt(252) * 100;
    }
    let worst = null, best = null;
    saved.forEach(r => {
      const m = r.metrics || {};
      if (m.maxDrawdown != null && (worst == null || m.maxDrawdown < worst)) worst = m.maxDrawdown;
      if (m.profitFactor != null && m.profitFactor !== Infinity && (best == null || m.profitFactor > best)) best = m.profitFactor;
    });
    const halted = saved.filter(r => r.halted).length;
    html += '<div class="grid grid-4" style="margin-bottom:14px">' +
      '<div class="card stat-card"><div class="lab">Worst max drawdown</div><div class="val neg">' + (worst == null ? "—" : U.num(worst) + "%") + "</div></div>" +
      '<div class="card stat-card"><div class="lab">Best profit factor</div><div class="val pos">' + (best == null ? "—" : U.num(best)) + "</div></div>" +
      '<div class="card stat-card"><div class="lab">Runs halted (DD limit)</div><div class="val">' + halted + " / " + saved.length + "</div></div>" +
      '<div class="card stat-card"><div class="lab">Saved runs</div><div class="val">' + saved.length + "</div></div></div>";
    html += '<div class="card"><h3>Per-run risk profile</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Strategy</th><th class="right">Ann. vol %</th><th class="right">MaxDD %</th><th class="right">Sharpe</th><th class="right">Exposure %</th><th class="right">Avg hold</th><th>Flags</th></tr></thead><tbody>';
    saved.forEach(r => {
      const m = r.metrics || {};
      const vol = volFromCurve(r.equityCurve || []);
      let flags = "";
      if (r.halted) flags += '<span class="badge bad" title="Max drawdown halt triggered">HALT</span> ';
      if (r.portfolio) flags += '<span class="badge gold">PF</span> ';
      if ((m.totalTrades || 0) === 0) flags += '<span class="badge warn">0 TRADES</span>';
      if (m.winRate != null && m.winRate < 35) flags += '<span class="badge warn">LOW WR</span>';
      html += "<tr><td>" + U.esc(r.strategy ? r.strategy.name : "Portfolio") +
        '</td><td class="right">' + (vol == null ? "—" : U.num(vol) + "%") +
        '</td><td class="right neg">' + U.num(m.maxDrawdown) + '%</td><td class="right">' + (m.sharpe == null ? "—" : U.num(m.sharpe)) +
        '</td><td class="right">' + (m.exposure == null ? "—" : U.num(m.exposure) + "%") +
        '</td><td class="right">' + (m.avgHold == null ? "—" : U.num(m.avgHold, 1) + " b") + "</td><td>" + flags + "</td></tr>";
    });
    html += "</tbody></table></div></div>";
    html += '<div class="card" style="margin-top:14px"><h3>Drawdown overlay</h3><div class="chart-box tall"><canvas id="risk-dd"></canvas></div></div>';
    view.innerHTML = html;

    const pal = charts.colors().pal;
    const top = saved.slice(0, 6);
    const union = {};
    top.forEach(r => (r.drawdown || []).forEach(p => { union[p[0]] = 1; }));
    const labels = Object.keys(union).sort();
    const sets = top.map((r, i) => {
      const map = {};
      (r.drawdown || []).forEach(p => { map[p[0]] = p[1]; });
      return {
        label: r.strategy ? r.strategy.name : "Portfolio", color: pal[i % pal.length],
        data: labels.map(d => (map[d] != null ? U.round(map[d], 2) : null))
      };
    });
    charts.line("risk-dd", labels, sets, { title: "Drawdown % over time" });
  }
});
