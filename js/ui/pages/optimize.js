/* pages/optimize.js — grid-search parameter optimizer */
"use strict";
import { startPage } from "../../app/page.js";
import { U } from "../../core/utils.js";

startPage("optimize", {
  mount(container, view, { kit, charts, shared, user }) {
    const svc = container.strategies;
    const strategies = svc.all();
    const market = container.market;
    const data = market.stats();
    let html = '<div class="view-head"><div><h1>Optimizer</h1><p>Grid-search over strategy logic parameters to find the best combination by your chosen objective.</p></div></div>';
    if (!data) { html += '<div class="card"><div class="empty">Load market data first.</div></div>'; view.innerHTML = html; return; }
    html += '<div class="card"><div class="frow">' +
      '<div class="field"><label>Strategy</label><select id="op-sel">' + strategies.map(s => '<option value="' + s.id + '">' + U.esc(s.name) + "</option>").join("") + "</select></div>" +
      '<div class="field"><label>Objective metric</label><select id="op-metric"><option value="totalReturn">Total return</option><option value="sharpe">Sharpe</option><option value="profitFactor">Profit factor</option><option value="winRate">Win rate</option></select></div>' +
      '<div class="field"><label>Period</label><select id="op-win"><option value="1">Last year</option><option value="3" selected>Last 3 years</option><option value="0">Full range</option></select></div></div>' +
      '<div class="field"><label>Parameter grids</label><div id="op-grids"></div><button class="btn btn-sm" id="op-addgrid">＋ Add parameter range</button></div>' +
      '<div class="field"><label>&nbsp;</label><button class="btn btn-primary" id="op-run">Run optimization</button></div>' +
      '<div id="op-prog" style="display:none;margin-top:10px"><div class="prog"><i id="op-bar"></i></div><div class="muted small" id="op-msg"></div></div></div>';
    html += '<div id="op-out"></div>';
    view.innerHTML = html;
    const yearsAgo = n => { const d = new Date(); d.setFullYear(d.getFullYear() - n); return d.toISOString().slice(0, 10); };

    let grids = [{ key: "", from: 5, to: 30, step: 5 }];
    const drawGrids = () => {
      const host = document.getElementById("op-grids");
      const s = svc.byId(document.getElementById("op-sel").value);
      const meta = s ? svc.catalog().LOGIC_META[s.strategyLogic.type] : null;
      const opts = meta ? meta.params.filter(p => p.type === "number") : [];
      host.innerHTML = grids.map((g, gi) =>
        '<div class="fgrid" style="margin-bottom:8px;align-items:end">' +
        '<div class="field"><label>Parameter</label><select data-param="' + gi + '">' +
        '<option value="">— choose —</option>' + opts.map(p => '<option value="' + p.key + '"' + (g.key === p.key ? " selected" : "") + ">" + U.esc(p.label) + "</option>").join("") + "</select></div>" +
        '<div class="field"><label>From</label><input type="number" data-from="' + gi + '" value="' + g.from + '"></div>' +
        '<div class="field"><label>To</label><input type="number" data-to="' + gi + '" value="' + g.to + '"></div>' +
        '<div class="field"><label>Step</label><input type="number" data-step="' + gi + '" value="' + g.step + '"></div>' +
        '<button class="btn btn-sm btn-danger" data-rm="' + gi + '">✕</button></div>').join("");
      host.querySelectorAll("[data-param]").forEach(sel => sel.addEventListener("change", () => { grids[+sel.getAttribute("data-param")].key = sel.value; }));
      host.querySelectorAll("[data-from]").forEach(inp => inp.addEventListener("input", () => { grids[+inp.getAttribute("data-from")].from = parseFloat(inp.value) || 1; }));
      host.querySelectorAll("[data-to]").forEach(inp => inp.addEventListener("input", () => { grids[+inp.getAttribute("data-to")].to = parseFloat(inp.value) || 1; }));
      host.querySelectorAll("[data-step]").forEach(inp => inp.addEventListener("input", () => { grids[+inp.getAttribute("data-step")].step = parseFloat(inp.value) || 1; }));
      host.querySelectorAll("[data-rm]").forEach(b => b.addEventListener("click", () => { grids.splice(+b.getAttribute("data-rm"), 1); drawGrids(); }));
    };
    document.getElementById("op-addgrid").addEventListener("click", () => { grids.push({ key: "", from: 5, to: 30, step: 5 }); drawGrids(); });
    document.getElementById("op-sel").addEventListener("change", drawGrids);
    drawGrids();

    document.getElementById("op-run").addEventListener("click", () => {
      const s = svc.byId(document.getElementById("op-sel").value);
      if (!s) { kit.toast("Pick a strategy", "warn"); return; }
      const ranges = grids.filter(g => g.key && g.from <= g.to && g.step > 0);
      if (!ranges.length) { kit.toast("Add at least one valid parameter range", "warn"); return; }
      const metric = document.getElementById("op-metric").value;
      const y = parseInt(document.getElementById("op-win").value, 10);
      const bars = market.bars();
      let ix = { s: 0, e: bars.length - 1 };
      if (y > 0) ix = market.sliceIdx(yearsAgo(y), null);
      const prog = document.getElementById("op-prog");
      const bar = document.getElementById("op-bar");
      const msg = document.getElementById("op-msg");
      prog.style.display = "block";
      kit.busy(true, "Optimizing " + s.name + "…");
      container.optimizer.optimize({
        strategy: s, ranges, bars, from: ix.s, to: ix.e, metric,
        onProgress: (p, m) => {
          bar.style.width = p + "%";
          msg.textContent = (m || "Optimizing…") + " " + Math.round(p) + "%";
        }
      }).then(res => {
          prog.style.display = "none";
          kit.busy(false);
          const out = document.getElementById("op-out");
          let h = '<div class="card" style="margin-top:14px"><h3>Results <span class="sub">' + res.rows.length + " combinations · best by " + metric + '</span></h3>' +
            '<div class="tbl-wrap" style="max-height:420px"><table class="tbl"><thead><tr><th>#</th><th>Parameters</th><th class="right">Return</th><th class="right">Sharpe</th><th class="right">Win rate</th><th class="right">Trades</th><th class="right">MaxDD</th><th></th></tr></thead><tbody>';
          res.rows.slice(0, 40).forEach((row, i) => {
            const m = row.metrics;
            h += "<tr><td>" + (i + 1) + '</td><td><code>' + U.esc(JSON.stringify(row.params)) + '</code></td>' +
              '<td class="right ' + ((m.totalReturn || 0) >= 0 ? "pos" : "neg") + '">' + U.signPct(m.totalReturn) +
              '</td><td class="right">' + (m.sharpe == null ? "—" : U.num(m.sharpe)) +
              '</td><td class="right">' + (m.winRate == null ? "—" : U.num(m.winRate) + "%") +
              '</td><td class="right">' + (m.totalTrades || 0) +
              '</td><td class="right neg">' + U.num(m.maxDrawdown) + '%</td>' +
              '<td><button class="btn btn-sm" data-apply="' + i + '">Apply best</button></td></tr>';
          });
          h += "</tbody></table></div></div>";
          out.innerHTML = h;
          const best = res.rows[0];
          out.querySelectorAll("[data-apply]").forEach(bn => bn.addEventListener("click", () => {
            const idx = +bn.getAttribute("data-apply");
            const pick = res.rows[idx];
            const clone = svc.byId(s.id);
            Object.keys(pick.params).forEach(k => { clone.strategyLogic.params[k] = pick.params[k]; });
            const saved = svc.save(clone);
            if (saved.ok) {
              container.log.add("INFO", container.actorId(), "OPTIMIZE_APPLY", "Applied params " + JSON.stringify(pick.params) + " to " + s.name);
              kit.toast("Parameters applied to " + s.name + " (" + metric + " " + U.num(pick.metrics[metric]) + ")", "ok");
            } else kit.toast("Could not apply: " + saved.errors[0], "bad");
          }));
          container.log.add("INFO", container.actorId(), "OPTIMIZE_RUN", "Optimized " + s.name + " (" + res.rows.length + " combos) best " + metric + "=" + U.num(best.metrics[metric], 3));
        })
        .catch(e => { prog.style.display = "none"; kit.busy(false); kit.toast((e && e.message) || "Optimization failed", "bad"); });
    });
  }
});
