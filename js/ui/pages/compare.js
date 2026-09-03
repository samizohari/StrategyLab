/* pages/compare.js — comparison matrix, ranking, radar, equity overlay, regime heatmap */
"use strict";
import { startPage } from "../../app/page.js";
import { U } from "../../core/utils.js";

startPage("compare", {
  mount(container, view, { kit, charts, shared, user }) {
    const saved = container.results.list();
    let html = '<div class="view-head"><div><h1>Comparison</h1><p>Side-by-side metrics, ranking, equity overlay and regime heatmaps across saved results.</p></div>' +
      '<div class="sp"></div><div class="actions"><button class="btn btn-primary" id="cmp-refresh">⟳ Refresh</button></div></div>';
    if (!saved.length) {
      html += '<div class="card"><div class="empty"><div class="big">≋</div>No saved results to compare.<br><a class="btn btn-primary" style="margin-top:10px" href="backtest.html">Run backtests first</a></div></div>';
      view.innerHTML = html;
      return;
    }
    html += '<div class="card"><h3>Select results to compare <span class="sub">' + saved.length + ' saved</span></h3><div class="chips" id="cmp-pick">' +
      saved.map((r, i) => '<span class="chip ' + (i < 3 ? "gold-on" : "") + '" data-id="' + r.id + '">' + U.esc(r.strategy ? r.strategy.name : "Portfolio") + " · " + U.signPct((r.metrics || {}).totalReturn) + "</span>").join("") +
      "</div></div><div id='cmp-out'></div>";
    view.innerHTML = html;
    const selected = () => Array.prototype.map.call(view.querySelectorAll("#cmp-pick .chip.gold-on"), c => c.getAttribute("data-id"));

    function normMetric(m, v, set) {
      if (v == null || v === undefined) return 0;
      const vals = set.map(x => { const y = (x.metrics || {})[m]; return y == null ? 0 : y; });
      let min = Math.min.apply(null, vals.concat([0]));
      let max = Math.max.apply(null, vals.concat([0]));
      if (m === "maxDrawdown") { min = -Math.max(Math.abs(min), Math.abs(max)) || -1; max = 0; }
      const rng = max - min;
      if (rng === 0) return 50;
      return Math.max(0, Math.min(100, (v - min) / rng * 100));
    }

    function renderAll() {
      const ids = selected();
      const out = document.getElementById("cmp-out");
      if (!ids.length) { out.innerHTML = "<div class='empty'>Select at least one result.</div>"; return; }
      const rs = ids.map(id => container.results.get(id)).filter(Boolean);
      const pal = charts.colors().pal;
      let h = "";
      const defs = [
        ["totalReturn", "Total return %", "ret"], ["winRate", "Win rate %", "pct"], ["profitFactor", "Profit factor", "pf"],
        ["sharpe", "Sharpe", "num"], ["maxDrawdown", "Max drawdown %", "dd"], ["avgWinLoss", "Avg win/loss ×", "num"],
        ["totalTrades", "Trades", "int"], ["exposure", "Exposure %", "pct"]
      ];
      h += '<div class="card" style="margin-top:14px"><h3>Metrics matrix</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Metric</th>' +
        rs.map(r => "<th class='right'>" + U.esc(r.strategy ? r.strategy.name : "Portfolio") + (r.portfolio ? ' <span class="badge gold">PF</span>' : "") + "</th>").join("") + "</tr></thead><tbody>";
      defs.forEach(def => {
        h += "<tr><td><b>" + def[0].replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase()) + "</b></td>";
        rs.forEach(r => {
          const m = r.metrics || {}, v = m[def[0]];
          let txt = "—";
          if (def[0] === "profitFactor") txt = v === null ? (m.winningTrades > 0 ? "∞" : "—") : U.num(v);
          else if (def[0] === "totalTrades") txt = String(v == null ? 0 : v);
          else if (def[0] === "totalReturn") txt = U.signPct(v);
          else if (def[0] === "winRate" || def[0] === "exposure") txt = (v == null ? "—" : U.num(v) + "%");
          else if (def[0] === "maxDrawdown") txt = (v == null ? "—" : U.num(v) + "%");
          else txt = v == null ? "—" : U.num(v);
          const cls = def[2] === "ret" ? (v > 0 ? "pos" : v < 0 ? "neg" : "") : def[2] === "dd" ? "neg" : "";
          h += '<td class="right ' + cls + '">' + txt + "</td>";
        });
        h += "</tr>";
      });
      h += "</tbody></table></div></div>";
      h += '<div class="card" style="margin-top:14px"><h3>Ranking <span class="sub">sort by</span> <select id="cmp-rank-metric" style="width:auto;display:inline-block">' +
        [["totalReturn", "Total return"], ["sharpe", "Sharpe ratio"], ["winRate", "Win rate"], ["profitFactor", "Profit factor"], ["maxDrawdown", "Max drawdown (best = least negative)"]]
          .map(o => '<option value="' + o[0] + '">' + o[1] + "</option>").join("") + '</select></h3><div id="cmp-rank"></div></div>';
      h += '<div class="card" style="margin-top:14px"><h3>Equity curves (normalized to 100)</h3><div class="chart-box tall"><canvas id="cmp-eq"></canvas></div></div>';
      h += '<div class="card" style="margin-top:14px"><h3>Normalized profile</h3><div class="chart-box tall"><canvas id="cmp-radar"></canvas></div></div>';
      h += '<div class="card" style="margin-top:14px"><h3>Market-condition heatmap <span class="sub">avg total return % per regime</span></h3>' +
        '<button class="btn btn-sm btn-primary" id="cmp-heatbtn">Build / refresh heatmap</button><div id="cmp-heat" style="margin-top:10px"></div></div>';
      out.innerHTML = h;

      function renderRank(metric) {
        const desc = metric !== "maxDrawdown";
        const rows = rs.slice().sort((a, b2) => {
          let x = (a.metrics || {})[metric], y = (b2.metrics || {})[metric];
          x = x == null ? (metric === "maxDrawdown" ? 0 : -Infinity) : x;
          y = y == null ? (metric === "maxDrawdown" ? 0 : -Infinity) : y;
          return desc ? y - x : x - y;
        });
        const medals = ["🥇", "🥈", "🥉"];
        document.getElementById("cmp-rank").innerHTML = '<table class="tbl"><thead><tr><th>#</th><th>Strategy</th><th class="right">' + metric + '</th></tr></thead><tbody>' +
          rows.map((r, i) => {
            const m = r.metrics || {}, v = m[metric];
            let txt = "—";
            if (metric === "profitFactor") txt = v === null ? (m.winningTrades > 0 ? "∞" : "—") : U.num(v);
            else if (metric === "maxDrawdown" || metric === "winRate") txt = (v == null ? "—" : U.num(v) + "%");
            else if (metric === "totalReturn") txt = U.signPct(v);
            else txt = v == null ? "—" : U.num(v);
            const cls = metric === "maxDrawdown" ? "neg" : (metric === "totalReturn" ? (v >= 0 ? "pos" : "neg") : "");
            return "<tr><td>" + (medals[i] || (i + 1)) + "</td><td>" + U.esc(r.strategy ? r.strategy.name : "Portfolio") + '</td><td class="right ' + cls + '">' + txt + "</td></tr>";
          }).join("") + "</tbody></table>";
      }
      renderRank("totalReturn");
      const rsel = document.getElementById("cmp-rank-metric");
      rsel.addEventListener("change", () => renderRank(rsel.value));

      const union = {};
      rs.forEach(r => (r.equityCurve || []).forEach(p => { union[p[0]] = 1; }));
      const labels = Object.keys(union).sort();
      const sets = rs.map((r, i) => {
        const map = {};
        (r.equityCurve || []).forEach(p => { map[p[0]] = p[1]; });
        const base = r.initialCapital || 1;
        return {
          label: r.strategy ? r.strategy.name : "Portfolio", color: pal[i % pal.length],
          dash: r.portfolio ? [5, 4] : [], data: labels.map(d => (map[d] != null ? map[d] / base * 100 : null))
        };
      });
      charts.line("cmp-eq", labels, sets, { title: "Equity (base 100)" });

      const radarMetrics = ["totalReturn", "winRate", "sharpe", "maxDrawdown", "profitFactor", "exposure"];
      const ds = rs.map((r, i) => ({
        label: r.strategy ? r.strategy.name : "Portfolio", color: pal[i % pal.length],
        data: radarMetrics.map(m => U.round(normMetric(m, (r.metrics || {})[m], rs), 1))
      }));
      charts.radar("cmp-radar", radarMetrics, ds);

      document.getElementById("cmp-heatbtn").addEventListener("click", function heat() {
        const btn = this;
        const members = rs.map(r => r.strategy).filter(s => s && s.strategyLogic);
        if (!members.length) {
          kit.toast("Heatmap needs at least one non-portfolio result (its strategy must be resolved)", "warn");
          return;
        }
        btn.disabled = true;
        btn.textContent = "Building…";
        container.analysis.regimeAverages(members, container.market.bars(), {})
          .then(rows => {
            let hh = '<div class="heat" style="grid-template-columns:140px repeat(' + rs.length + ',1fr)"><div></div>';
            rs.forEach(r => { hh += '<div class="muted small" style="text-align:center;font-weight:700">' + U.esc(r.strategy ? r.strategy.name : "") + "</div>"; });
            ["bull", "bear", "side"].forEach(rg => {
              hh += '<div style="display:flex;align-items:center;font-weight:650">' + (rg === "bull" ? "Bull" : rg === "bear" ? "Bear" : "Sideways") + "</div>";
              rows.forEach(row => {
                const v = row[rg];
                const bg = v == null ? "var(--bg-3)" : v >= 0 ? "rgba(62,207,110," + Math.min(0.85, 0.25 + v / 40) + ")" : "rgba(244,87,77," + Math.min(0.85, 0.25 + (-v) / 40) + ")";
                hh += '<div class="cell" style="background:' + bg + '">' + (v == null ? "—" : U.signPct(v)) + "</div>";
              });
            });
            hh += "</div>";
            document.getElementById("cmp-heat").innerHTML = hh;
            btn.disabled = false;
            btn.textContent = "Rebuild heatmap";
            container.log.add("INFO", container.actorId(), "HEATMAP_RUN", "Built regime heatmap for " + rs.length + " results");
          })
          .catch(e => { btn.disabled = false; btn.textContent = "Rebuild heatmap"; kit.toast((e && e.message) || "Heatmap failed", "bad"); });
      });
    }
    view.querySelectorAll("#cmp-pick .chip").forEach(c => c.addEventListener("click", () => { c.classList.toggle("gold-on"); renderAll(); }));
    renderAll();
    document.getElementById("cmp-refresh").addEventListener("click", () => location.reload());
  }
});
