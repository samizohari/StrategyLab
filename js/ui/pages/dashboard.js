/* pages/dashboard.js — overview page controller */
"use strict";
import { startPage } from "../../app/page.js";
import { U } from "../../core/utils.js";
import { sma } from "../../domain/indicators.js";

startPage("dashboard", {
  mount(container, view, { kit, charts, shared, user }) {
    const market = container.market, strategiesSvc = container.strategies;
    const data = market.stats();
    const strategies = strategiesSvc.all();
    const results = container.results.list();
    const isAnalyst = user.role !== "VIEWER";

    let html = '<div class="view-head"><div><h1>Dashboard</h1><p>Portfolio overview, market snapshot and latest backtest results.</p></div>' +
      '<div class="sp"></div><div class="actions">' +
      (isAnalyst ? '<button class="btn btn-primary" id="dash-run">▶ Run quick backtest</button>' : "") +
      '<button class="btn" id="dash-refresh">⟳ Refresh</button></div></div>';

    if (!data) {
      html += '<div class="card"><div class="empty"><div class="big">◧</div><h3>No market data loaded</h3>' +
        '<p class="muted">Load the bundled demo gold series or import your own CSV/JSON.</p>' +
        '<button class="btn btn-primary" id="dash-demo">Load demo data (1,600 bars)</button></div></div>';
      view.innerHTML = html;
      const db = document.getElementById("dash-demo");
      if (db) db.addEventListener("click", () => {
        market.regenerateDemo();
        container.log.add("INFO", container.actorId(), "DATA_DEMO", "Loaded demo data");
        kit.toast("Demo data loaded", "ok", "Data");
        location.reload();
      });
      return;
    }
    const chgCls = data.rangeRet >= 0 ? "pos" : "neg";
    html += '<div class="grid grid-4" style="margin-bottom:14px">' +
      '<div class="card stat-card"><div class="lab">Bars</div><div class="val">' + U.num(data.count, 0) + "</div></div>" +
      '<div class="card stat-card"><div class="lab">Period</div><div class="val" style="font-size:15px;margin-top:10px">' + U.esc(data.start) + "<br><small>→ " + U.esc(data.end) + "</small></div></div>" +
      '<div class="card stat-card"><div class="lab">Last close</div><div class="val">$' + U.num(data.lastClose) + "</div></div>" +
      '<div class="card stat-card"><div class="lab">Range change</div><div class="val ' + chgCls + '">' + U.signPct(data.rangeRet) + "</div></div>" +
      '<div class="card stat-card"><div class="lab">Strategies</div><div class="val">' + strategies.length + "</div></div>" +
      '<div class="card stat-card"><div class="lab">Saved results</div><div class="val">' + results.length + "</div></div>" +
      '<div class="card stat-card"><div class="lab">High / Low</div><div class="val" style="font-size:15px;margin-top:10px">$' + U.num(data.max) + "<br><small>$" + U.num(data.min) + "</small></div></div>" +
      '<div class="card stat-card"><div class="lab">Avg volume</div><div class="val" style="font-size:16px;margin-top:10px">' + U.num(data.avgVol, 0) + "</div></div></div>";
    html += '<div class="card"><h3>Gold price <span class="sub">close + SMA 20 / 50</span></h3><div class="chart-box tall"><canvas id="dash-price"></canvas></div></div>';
    html += '<div class="grid grid-2" style="margin-top:14px"><div class="card"><h3>Latest results</h3><div id="dash-res"></div></div>' +
      '<div class="card"><h3>Strategies <span class="sub">quick list</span></h3><div id="dash-strats"></div></div></div>';
    view.innerHTML = html;

    const bars = market.bars();
    const show = bars.length > 900 ? bars.slice(-900) : bars;
    const closes = show.map(b => b.c);
    const labels = show.map(b => b.d);
    charts.line("dash-price", labels, [
      { label: "Close", data: closes, color: "#e6b53c" },
      { label: "SMA 20", data: sma(closes, 20), color: "#5aa2f0" },
      { label: "SMA 50", data: sma(closes, 50), color: "#f4574d" }
    ], { title: "XAU/USD daily" });

    document.getElementById("dash-res").innerHTML = results.length
      ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Strategy</th><th class="right">Return</th><th class="right">Trades</th><th>When</th></tr></thead><tbody>' +
        results.slice(0, 6).map(r => {
          const m = r.metrics || {};
          return '<tr style="cursor:pointer"><td>' + U.esc(r.strategy ? r.strategy.name : "Portfolio") + (r.portfolio ? ' <span class="badge gold">PF</span>' : "") +
            '</td><td class="right ' + ((m.totalReturn || 0) >= 0 ? "pos" : "neg") + '">' + U.signPct(m.totalReturn) +
            '</td><td class="right">' + (m.totalTrades || 0) + '</td><td class="muted">' + U.fmtDate(r.timestamp) + "</td></tr>";
        }).join("") + "</tbody></table></div>"
      : "<div class='empty'><div class='big'>▤</div>No results yet" + (isAnalyst ? " — run a backtest from the Backtest Lab" : "") + "</div>";
    const resRows = document.querySelectorAll("#dash-res tr");
    resRows.forEach((tr, i) => {
      tr.addEventListener("click", () => { location.href = "backtest.html?result=" + encodeURIComponent(results[i].id); });
    });

    document.getElementById("dash-strats").innerHTML = strategies.length
      ? strategies.map(s => {
        const meta = container.strategies.catalog().LOGIC_META[s.strategyLogic.type] || {};
        const combo = s.combine && s.combine.enabled ? ' <span class="badge gold">' + U.esc(s.combine.logic) + "</span>" : "";
        return '<div style="display:flex;align-items:center;gap:10px;padding:8px 2px;border-bottom:1px solid var(--line-2)">' +
          '<div style="flex:1"><b>' + U.esc(s.name) + "</b>" + combo + '<div class="muted">' + U.esc(meta.label || "") + "</div></div>" +
          (isAnalyst ? '<a class="btn btn-sm" href="strategies.html?edit=' + encodeURIComponent(s.id) + '">Edit</a>' : "") + "</div>";
      }).join("")
      : "<div class='empty'>No strategies</div>";

    const runBtn = document.getElementById("dash-run");
    if (runBtn) runBtn.addEventListener("click", () => {
      const s = strategies[0];
      if (!s) { kit.toast("Create a strategy first", "warn"); return; }
      kit.busy(true, "Running quick backtest on " + s.name + "…");
      const b = market.bars();
      container.backtest.runAsync(s, b, 0, b.length - 1, { capital: container.settings.get("defaultInitialCapital") })
        .then(res => {
          container.results.save(res);
          container.log.add("INFO", container.actorId(), "BACKTEST_RUN", "Quick backtest: " + s.name + " → " + U.round(res.metrics.totalReturn, 2) + "%");
          kit.busy(false);
          kit.toast("Backtest finished: " + U.signPct(res.metrics.totalReturn), "ok", "Result");
          location.href = "backtest.html?result=" + encodeURIComponent(res.id);
        })
        .catch(e => { kit.busy(false); kit.toast((e && e.message) || "Backtest failed", "bad"); });
    });
    const ref = document.getElementById("dash-refresh");
    if (ref) ref.addEventListener("click", () => location.reload());
  }
});
