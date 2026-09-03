/* pages/backtest.js — Backtest Lab page controller */
"use strict";
import { startPage } from "../../app/page.js";
import { U } from "../../core/utils.js";
import { openBuilder } from "../builder.js";
import { showStrategyHelp } from "../md.js";

startPage("backtest", {
  mount(container, view, { kit, charts, shared, user }) {
    const market = container.market;
    const svc = container.strategies;
    const strategies = svc.all();
    const data = market.stats();
    const saved = container.results.list();
    const b = market.rangeBounds();
    const yearsAgo = n => { const d = new Date(); d.setFullYear(d.getFullYear() - n); return d.toISOString().slice(0, 10); };

    let html = '<div class="view-head"><div><h1>Backtest Lab</h1><p>Run a strategy (or a capital-split portfolio) over a date range with full risk &amp; capital rules.</p></div>' +
      '<div class="sp"></div>' + (saved.length ? '<button class="btn" id="bt-clear">Clear saved results</button>' : "") + "</div>";
    if (!data) {
      html += '<div class="card"><div class="empty"><div class="big">◧</div>Load market data first (Dashboard or Market Data).</div></div>';
      view.innerHTML = html;
      return;
    }
    html += '<div class="grid grid-2" style="margin-bottom:14px">';
    html += '<div class="card"><h3>1 · Strategy <span class="sub" id="bt-selname"></span></h3>' +
      '<div class="field"><label>Run mode</label><div class="chips" id="bt-mode"><span class="chip gold-on" data-m="single">Single strategy</span><span class="chip" data-m="portfolio">Portfolio (split capital)</span></div></div>' +
      '<div id="bt-stratpick"></div></div>';
    html += '<div class="card"><h3>2 · Period &amp; capital</h3>' +
      '<div class="frow"><div class="field"><label>From</label><input type="date" id="bt-from" value="' + U.esc(yearsAgo(3)) + '"></div>' +
      '<div class="field"><label>To</label><input type="date" id="bt-to" value="' + U.esc(b.end) + '"></div>' +
      '<div class="field"><label>Capital $</label><input type="number" id="bt-cap" step="100" min="100" value="' + container.settings.get("defaultInitialCapital") + '"></div></div>' +
      '<div class="chips" id="bt-quick"><span class="chip" data-y="1">1Y</span><span class="chip" data-y="2">2Y</span><span class="chip gold-on" data-y="3">3Y</span><span class="chip" data-y="0">All (' + data.count + ' bars)</span></div>' +
      '<div style="margin-top:14px"><button class="btn btn-primary btn-lg" id="bt-run">▶ Run backtest</button></div>' +
      '<div id="bt-progress" style="display:none;margin-top:12px"><div class="prog striped"><i id="bt-bar"></i></div>' +
      '<div class="muted small" style="margin-top:5px;display:flex;justify-content:space-between"><span id="bt-msg"></span><span id="bt-eta"></span></div></div></div></div>';
    html += '<div id="bt-result"></div>';
    if (saved.length) {
      html += '<div class="card" style="margin-top:14px"><h3>Saved results <span class="sub">' + saved.length + '</span></h3>' +
        '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>Strategy</th><th class="right">Return</th><th class="right">Win rate</th><th class="right">Trades</th><th class="right">MaxDD</th><th class="right">Sharpe</th><th></th></tr></thead><tbody id="bt-saved"></tbody></table></div></div>';
    }
    view.innerHTML = html;

    // restore the last strategy edited/used here so page reloads keep the selection
    let lastStrategy = null;
    try { lastStrategy = sessionStorage.getItem("bt_lastStrategy"); } catch (e) { /* ignore */ }
    const state = {
      mode: "single",
      singleId: strategies.length
        ? (strategies.some(s => s.id === lastStrategy) ? lastStrategy : strategies[0].id)
        : null,
      members: {}
    };

    function stratPickHTML() {
      const area = document.getElementById("bt-stratpick");
      if (!area) return;
      if (state.mode === "single") {
        area.innerHTML = '<div class="field"><label>Strategy</label><div style="display:flex;gap:6px">' +
          '<select id="bt-sel" style="flex:1">' +
          strategies.map(s => '<option value="' + s.id + '"' + (s.id === state.singleId ? " selected" : "") + ">" + U.esc(s.name) + (s.combine && s.combine.enabled ? " [" + U.esc(s.combine.logic) + "]" : "") + "</option>").join("") +
          '</select><button class="btn btn-sm btn-ghost" id="bt-help" title="Strategy help (Markdown popup)">ℹ</button>' +
          '<button class="btn btn-sm" id="bt-edit" title="Edit this strategy (opens the builder)">✎ Edit</button></div>' +
          '<div class="hint" id="bt-seldoc"></div></div>';
        const sel = area.querySelector("#bt-sel");
        const doc = () => {
          const s = svc.byId(sel.value);
          const meta = s ? svc.catalog().LOGIC_META[s.strategyLogic.type] : null;
          document.getElementById("bt-seldoc").textContent = s ? ((meta ? meta.label + " — " : "") + (s.desc || "")) : "";
          document.getElementById("bt-selname").textContent = s ? s.name : "";
        };
        sel.addEventListener("change", () => {
          state.singleId = sel.value;
          doc();
          try { sessionStorage.setItem("bt_lastStrategy", state.singleId); } catch (e) { /* ignore */ }
        });
        doc();
        const helpBtn = area.querySelector("#bt-help");
        if (helpBtn) helpBtn.addEventListener("click", () => {
          const current = sel.value || state.singleId;
          const s = current ? svc.byId(current) : null;
          if (s) showStrategyHelp({ kit, strategy: s, resolveName: id => { const m = svc.byId(id); return m ? m.name : null; } });
        });
        const editBtn = area.querySelector("#bt-edit");
        if (editBtn) editBtn.addEventListener("click", () => {
          const current = sel.value || state.singleId;
          if (!current) { kit.toast("Pick a strategy first", "warn"); return; }
          try { sessionStorage.setItem("bt_lastStrategy", current); } catch (e) { /* ignore */ }
          openBuilder(container, { kit, charts }, current);
        });
      } else {
        if (!strategies.length) { area.innerHTML = "<p class='muted'>No strategies.</p>"; return; }
        area.innerHTML = '<div class="field"><label>Select members &amp; weights (capital is split by weight)</label><div class="fgrid" id="bt-pf">' +
          strategies.map(s => {
            const w = state.members[s.id] != null ? state.members[s.id] : 1;
            return '<div class="field"><label style="display:flex;align-items:center;gap:6px"><input type="checkbox" class="pf-cb" data-id="' + s.id + '"' + (state.members[s.id] != null ? " checked" : "") + ">" + U.esc(s.name) + '</label>' +
              '<input type="number" class="pf-w" data-id="' + s.id + '" step="0.1" min="0" value="' + w + '" style="margin-top:4px"></div>';
          }).join("") + "</div></div>";
        area.querySelectorAll(".pf-cb").forEach(cb => cb.addEventListener("change", () => { state.members[cb.getAttribute("data-id")] = cb.checked ? 1 : null; }));
        area.querySelectorAll(".pf-w").forEach(inp => inp.addEventListener("input", () => { state.members[inp.getAttribute("data-id")] = parseFloat(inp.value) || 0; }));
      }
    }
    view.querySelectorAll("#bt-mode .chip").forEach(c => c.addEventListener("click", () => {
      view.querySelectorAll("#bt-mode .chip").forEach(x => x.classList.remove("gold-on"));
      c.classList.add("gold-on");
      state.mode = c.getAttribute("data-m");
      stratPickHTML();
    }));
    view.querySelectorAll("#bt-quick .chip").forEach(c => c.addEventListener("click", () => {
      view.querySelectorAll("#bt-quick .chip").forEach(x => x.classList.remove("gold-on"));
      c.classList.add("gold-on");
      const y = parseInt(c.getAttribute("data-y"), 10);
      document.getElementById("bt-from").value = y > 0 ? yearsAgo(y) : b.start;
      document.getElementById("bt-to").value = b.end;
    }));
    stratPickHTML();

    function ensureSavedSection() {
      if (document.getElementById("bt-saved")) return;
      const html = '<div class="card" style="margin-top:14px"><h3>Saved results <span class="sub" id="bt-saved-count">' +
        container.results.list().length + '</span></h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>Strategy</th><th class="right">Return</th><th class="right">Win rate</th><th class="right">Trades</th><th class="right">MaxDD</th><th class="right">Sharpe</th><th></th></tr></thead><tbody id="bt-saved"></tbody></table></div></div>';
      const ref = document.getElementById("bt-result");
      ref.insertAdjacentHTML("beforebegin", html);
    }
    function fillSaved() {
      if (container.results.list().length && !document.getElementById("bt-saved")) ensureSavedSection();
      const tb = document.getElementById("bt-saved");
      if (!tb) return;
      const countEl = document.getElementById("bt-saved-count");
      if (countEl) countEl.textContent = container.results.list().length;
      tb.innerHTML = container.results.list().map((r, i) => {
        const m = r.metrics || {};
        return '<tr style="cursor:pointer" data-id="' + r.id + '"><td>' + (i + 1) + "</td><td>" + U.esc(r.strategy ? r.strategy.name : "Portfolio") +
          (r.portfolio ? ' <span class="badge gold">PF</span>' : "") +
          '</td><td class="right ' + ((m.totalReturn || 0) >= 0 ? "pos" : "neg") + '">' + U.signPct(m.totalReturn) +
          '</td><td class="right">' + (m.winRate == null ? "—" : U.num(m.winRate) + "%") +
          '</td><td class="right">' + (m.totalTrades || 0) +
          '</td><td class="right neg">' + U.num(m.maxDrawdown) + '%</td><td class="right">' + (m.sharpe == null ? "—" : U.num(m.sharpe)) +
          '</td><td><button class="btn btn-sm btn-ghost" data-del="' + r.id + '">✕</button></td></tr>';
      }).join("") || "<tr><td colspan='8' class='muted'>Nothing saved yet.</td></tr>";
      tb.querySelectorAll("tr[data-id]").forEach(tr => tr.addEventListener("click", ev => {
        if (ev.target.closest("[data-del]")) return;
        showResult(tr.getAttribute("data-id"));
      }));
      tb.querySelectorAll("[data-del]").forEach(bn => bn.addEventListener("click", ev => {
        ev.stopPropagation();
        container.results.remove(bn.getAttribute("data-del"));
        kit.toast("Result removed", "ok");
        fillSaved();
      }));
    }
    fillSaved();

    function showResult(id) {
      const r = container.results.get(id);
      if (!r) { kit.toast("Result not found", "warn"); return; }
      const panel = document.getElementById("bt-result");
      panel.innerHTML = "";
      shared.renderResultDetail(panel, r);
      if (panel.scrollIntoView) panel.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    window.__showResult = showResult;

    document.getElementById("bt-run").addEventListener("click", () => {
      const from = document.getElementById("bt-from").value;
      const to = document.getElementById("bt-to").value;
      const cap = parseFloat(document.getElementById("bt-cap").value) || 10000;
      const ix = market.sliceIdx(from, to);
      const bars = market.bars();
      if (ix.e <= ix.s) { kit.toast("Date range has no bars.", "warn"); return; }
      const prog = document.getElementById("bt-progress");
      const bar = document.getElementById("bt-bar");
      const msg = document.getElementById("bt-msg");
      const eta = document.getElementById("bt-eta");
      prog.style.display = "block";
      bar.style.width = "0%";
      if (state.mode === "single") {
        const s = svc.byId(state.singleId);
        if (!s) { kit.toast("Pick a strategy", "warn"); return; }
        const t0 = Date.now();
        container.backtest.runAsync(s, bars, ix.s, ix.e, {
          capital: cap,
          onProgress: (p, m, e, t) => {
            bar.style.width = p + "%";
            msg.textContent = m + " " + Math.round(p) + "%";
            eta.textContent = (e ? "ETA " + (e / 1000).toFixed(1) + "s · " : "") + "trades: " + t;
          }
        }).then(res => {
          container.results.save(res);
          container.log.add("INFO", container.actorId(), "BACKTEST_RUN", "Strategy " + s.name + " [" + from + "→" + to + "] → " + U.round(res.metrics.totalReturn, 2) + "% (" + res.metrics.totalTrades + " trades)");
          msg.textContent = "Done in " + ((Date.now() - t0) / 1000).toFixed(2) + "s";
          setTimeout(() => { prog.style.display = "none"; }, 1200);
          showResult(res.id);
          fillSaved();
        }).catch(e => { prog.style.display = "none"; kit.toast((e && e.message) || "Backtest failed", "bad"); });
      } else {
        const items = [];
        Object.keys(state.members).forEach(id => {
          const w = state.members[id];
          if (w > 0) { const s2 = svc.byId(id); if (s2) items.push({ strategy: s2, weight: w }); }
        });
        if (!items.length) { kit.toast("Select at least one strategy with a weight", "warn"); return; }
        if (items.length === 1) { state.mode = "single"; state.singleId = items[0].strategy.id; location.reload(); return; }
        container.backtest.runPortfolio(items, bars, ix.s, ix.e, {
          capital: cap,
          onProgress: (p, m, e, t) => {
            bar.style.width = p + "%";
            msg.textContent = m + " " + Math.round(p) + "%";
            eta.textContent = (e ? "ETA " + (e / 1000).toFixed(1) + "s · " : "") + "trades: " + t;
          }
        }).then(res => {
          container.results.save(res);
          container.log.add("INFO", container.actorId(), "BACKTEST_RUN", "Portfolio (" + items.length + " strategies) → " + U.round(res.metrics.totalReturn, 2) + "%");
          msg.textContent = "Portfolio done";
          setTimeout(() => { prog.style.display = "none"; }, 1200);
          showResult(res.id);
          fillSaved();
        }).catch(e => { prog.style.display = "none"; kit.toast((e && e.message) || "Portfolio failed", "bad"); });
      }
    });
    const cl = document.getElementById("bt-clear");
    if (cl) cl.addEventListener("click", () => {
      kit.confirmDialog("Delete all saved backtest results?", () => {
        container.results.clear();
        container.log.add("INFO", container.actorId(), "RESULTS_CLEAR", "Cleared all results");
        kit.toast("Results cleared", "ok");
        location.reload();
      }, { danger: true, yesLabel: "Delete all" });
    });

    const params = new URLSearchParams(location.search);
    const want = params.get("result");
    if (want && container.results.get(want)) {
      params.delete("result");
      history.replaceState(null, "", location.pathname + location.search);
      setTimeout(() => showResult(want), 80);
    }
  }
});
