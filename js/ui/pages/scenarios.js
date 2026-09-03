/* pages/scenarios.js — regime scenario analysis */
"use strict";
import { startPage } from "../../app/page.js";
import { U } from "../../core/utils.js";

startPage("scenarios", {
  mount(container, view, { kit, charts, shared, user }) {
    const svc = container.strategies;
    const strategies = svc.all();
    let html = '<div class="view-head"><div><h1>Scenario Analysis</h1><p>Test a strategy under different market regimes — bull, bear and sideways segments auto-detected from the price series.</p></div></div>';
    if (!container.market.count()) { html += '<div class="card"><div class="empty"><div class="big">◈</div>Load market data first.</div></div>'; view.innerHTML = html; return; }
    if (!strategies.length) { html += '<div class="card"><div class="empty">Create a strategy first.</div></div>'; view.innerHTML = html; return; }
    html += '<div class="card"><div class="frow">' +
      '<div class="field"><label>Strategy</label><select id="sc-sel">' + strategies.map(s => '<option value="' + s.id + '">' + U.esc(s.name) + "</option>").join("") + "</select></div>" +
      '<div class="field"><label>Segments per regime</label><select id="sc-max"><option value="1">1 (largest)</option><option value="3" selected>3 (largest)</option><option value="5">5</option></select></div>' +
      '<div class="field" style="flex:0 0 auto"><label>&nbsp;</label><button class="btn btn-primary" id="sc-run">Run scenario analysis</button></div></div>' +
      '<div id="sc-prog" style="display:none;margin-top:10px"><div class="prog"><i id="sc-bar"></i></div><div class="muted small" id="sc-msg"></div></div></div>';
    html += '<div id="sc-out"></div>';
    view.innerHTML = html;

    document.getElementById("sc-run").addEventListener("click", () => {
      const s = svc.byId(document.getElementById("sc-sel").value);
      if (!s) return;
      const prog = document.getElementById("sc-prog");
      const bar = document.getElementById("sc-bar");
      const msg = document.getElementById("sc-msg");
      const maxPer = parseInt(document.getElementById("sc-max").value, 10);
      prog.style.display = "block";
      container.analysis.scenarioSegments(s, container.market.bars(), {
        maxPerRegime: maxPer,
        onProgress: (p, m) => { bar.style.width = p + "%"; msg.textContent = m ? "Running " + m + "…" : "…"; }
      }).then(segs => {
        prog.style.display = "none";
        renderOut(s, segs);
        container.log.add("INFO", container.actorId(), "SCENARIO_RUN", "Scenario analysis for " + s.name + " (" + segs.length + " segments)");
      }).catch(e => { prog.style.display = "none"; kit.toast((e && e.message) || "Failed", "bad"); });
    });

    function renderOut(s, segs) {
      const out = document.getElementById("sc-out");
      if (!segs.length) { out.innerHTML = "<div class='empty'>No regime segments found (need ≥30-bar runs).</div>"; return; }
      const badge = { bull: '<span class="badge ok">BULL</span>', bear: '<span class="badge bad">BEAR</span>', side: '<span class="badge neutral">SIDEWAYS</span>' };
      let h = '<div class="card" style="margin-top:14px"><h3>Segments — ' + U.esc(s.name) + ' <span class="sub">' + segs.length + " runs · $10,000 each</span></h3>" +
        '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Regime</th><th>Period</th><th class="right">Bars</th><th class="right">Return</th><th class="right">Win rate</th><th class="right">Trades</th><th class="right">MaxDD</th><th class="right">PF</th></tr></thead><tbody>';
      h += segs.map(x => {
        const m = x.m || {};
        return "<tr><td>" + (badge[x.regime] || x.regime) + "</td><td>" + U.esc(x.startD) + " → " + U.esc(x.endD) +
          "</td><td class='right'>" + x.bars +
          '</td><td class="right ' + (x.ret >= 0 ? "pos" : "neg") + '">' + U.signPct(x.ret) +
          '</td><td class="right">' + (m.winRate == null ? "—" : U.num(m.winRate) + "%") +
          '</td><td class="right">' + (m.totalTrades || 0) +
          '</td><td class="right neg">' + U.num(m.maxDrawdown) + '%</td><td class="right">' + (m.profitFactor === null ? "∞" : U.num(m.profitFactor)) + "</td></tr>";
      }).join("");
      h += "</tbody></table></div></div>";
      h += '<div class="card" style="margin-top:14px"><h3>Return by segment</h3><div class="chart-box tall"><canvas id="sc-chart"></canvas></div></div>';
      out.innerHTML = h;
      const labels = segs.map(x => x.regime + "\n" + x.startD);
      const cols = segs.map(x => x.ret >= 0 ? "rgba(62,207,110,.8)" : "rgba(244,87,77,.8)");
      charts.bar("sc-chart", labels, [{ label: "Return %", data: segs.map(x => U.round(x.ret, 2)), colors: cols }], { title: "Total return per regime segment" });
    }
  }
});
