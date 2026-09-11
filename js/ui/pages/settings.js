/* pages/settings.js — site settings page.
   Active market symbol drives EVERYTHING (data, backtests, history, reports,
   advisor). Switching warns that the site will reload for the new symbol.
   Symbol candidates are fetched live from Yahoo Finance. */
"use strict";
import { startPage } from "../../app/page.js";
import { U } from "../../core/utils.js";
import { applyTheme } from "../theme.js";

startPage("settings", {
  mount(container, view, { kit, charts, shared, user }) {
    const market = container.market;
    const settings = container.settings;
    const active = market.symbol();
    const datasets = market.datasetList();
    const activeDs = datasets.find(d => d.symbol === active) || null;
    const results = container.results.list();

    let html = '<div class="view-head"><div><h1>Settings</h1><p>The <b>active symbol</b> drives the whole site — data, backtests, history, reports and the advisor. Every imported dataset is stored separately per symbol.</p></div></div>';

    /* 1 · active symbol */
    html += '<div class="card"><h3>Active market symbol <span class="badge gold">' + U.esc(active) + '</span></h3>' +
      '<div class="kv" style="margin-bottom:8px">' +
      '<b>Dataset file</b><span>' + (activeDs ? U.esc((activeDs.meta && (activeDs.meta.name || activeDs.meta.source)) || active) + " (" + activeDs.bars + " bars)" : "none stored yet") + "</span>" +
      "<b>Source</b><span>" + (activeDs && activeDs.meta ? U.esc(activeDs.meta.source || "—") : "—") + "</span>" +
      "<b>Saved results</b><span>" + results.filter(r => r.symbol === active).length + " for this symbol · " + results.length + " total</span>" +
      "</div>" +
      '<p class="muted small">Changing the symbol re-points data, backtests, history and reports. Datasets are never deleted by switching.</p></div>';

    /* 2 · switch between stored datasets */
    html += '<div class="card" style="margin-top:14px"><h3>Stored datasets (files per symbol)</h3>';
    if (datasets.length) {
      html += '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Symbol</th><th>Name / source</th><th class="right">Bars</th><th></th></tr></thead><tbody>' +
        datasets.map(d => {
          const isActive = d.symbol === active;
          return '<tr><td>' + (isActive ? '<span class="badge gold">' + U.esc(d.symbol) + "</span>" : '<span class="badge neutral">' + U.esc(d.symbol) + "</span>") +
            '</td><td class="muted">' + U.esc((d.meta && (d.meta.name || d.meta.source)) || "") +
            '</td><td class="right">' + d.bars + "</td>" +
            '<td style="text-align:right">' +
            (isActive ? '<button class="btn btn-sm" disabled>Active</button>'
              : '<button class="btn btn-sm btn-primary" data-switch="' + U.esc(d.symbol) + '">Make active</button>') +
            ' <button class="btn btn-sm btn-danger" data-delds="' + U.esc(d.symbol) + '" title="Delete this dataset file" style="padding:4px 8px">✕</button>' +
            "</td></tr>";
        }).join("") + "</tbody></table></div>";
    } else {
      html += '<div class="empty">No datasets stored yet — import data for your symbol on <a href="data.html">Market Data</a>.</div>';
    }
    html += "</div>";

    /* 3 · pick from Yahoo */
    html += '<div class="card" style="margin-top:14px"><h3>Find a symbol (Yahoo Finance) <span class="sub">fills the selector from Yahoo</span></h3>' +
      '<div class="frow">' +
      '<div class="field" style="flex:2"><label>Search symbol or name</label><input id="set-q" list="set-dl" placeholder="GC=F, gold, XAUUSD…" value="' + U.esc(active) + '">' +
      '<datalist id="set-dl"></datalist><div class="hint">Search is filled automatically from Yahoo for the current symbol. After switching, import/refresh the dataset on Market Data — it is stored as its own file.</div></div>' +
      '<div class="field" style="flex:0 0 auto"><label>&nbsp;</label><button class="btn btn-primary" id="set-search">Search Yahoo</button></div></div>' +
      '<div id="set-res" class="tbl-wrap" style="display:none;max-height:260px"><table class="tbl"><thead><tr><th>Symbol</th><th>Name</th><th>Exchange</th><th></th></tr></thead><tbody></tbody></table></div>' +
      '<div id="set-status" class="err-msg" style="margin-top:6px"></div></div>';

    /* 4 · appearance + admin note */
    html += '<div class="card" style="margin-top:14px"><h3>Appearance &amp; admin</h3>' +
      '<div class="frow"><div class="field"><label>Theme</label><div class="chips">' +
      '<span class="chip' + (container.settings.get("theme") === "dark" ? " gold-on" : "") + '" data-theme="dark">Dark</span>' +
      '<span class="chip' + (container.settings.get("theme") === "light" ? " gold-on" : "") + '" data-theme="light">Light</span></div></div>' +
      '<div class="field"><label>System settings &amp; users</label><div class="hint"><a href="admin.html">Admin Panel</a> (users, logs, backup, tests) — ADMIN only.</div></div></div></div>';

    view.innerHTML = html;
    const status = document.getElementById("set-status");

    /* --- switch flow with warning --- */
    function switchSymbol(sym) {
      sym = String(sym || "").trim().toUpperCase();
      if (!sym || sym === market.symbol()) { kit.toast("That symbol is already active", "info"); return; }
      const ds = market.datasetList().find(d => d.symbol === sym);
      const bars = container.results.list().filter(r => r.symbol === sym).length;
      kit.confirmDialog(
        "Switch the active symbol to <b>" + U.esc(sym) + "</b>?<br><br>" +
        "The entire site (data, charts, backtests, history, reports, advisor) will reload for this symbol. " +
        (ds
          ? "A stored dataset for <b>" + U.esc(sym) + "</b> already exists (" + ds.bars + " bars" + (bars ? " · " + bars + " saved result(s)" : "") + ")."
          : "No dataset is stored for <b>" + U.esc(sym) + "</b> yet — after switching, import it on Market Data (Yahoo Finance) and it will be saved as its own file.") +
        "<br><span class='muted small'>Your datasets are kept separately per symbol — nothing is deleted.</span>",
        () => {
          settings.set("symbol", sym);
          container.log.add("INFO", container.actorId(), "SYMBOL_SWITCH", "Active symbol changed to " + sym);
          kit.toast("Symbol switched to " + sym + " — reloading the site…", "ok", "Symbol");
          setTimeout(() => location.reload(), 400);
        },
        { title: "Change symbol", yesLabel: "Switch & reload", danger: false });
    }
    /* stored-dataset buttons */
    view.querySelectorAll("[data-switch]").forEach(b => b.addEventListener("click", () => switchSymbol(b.getAttribute("data-switch"))));
    view.querySelectorAll("[data-delds]").forEach(b => b.addEventListener("click", () => {
      const sym = b.getAttribute("data-delds");
      kit.confirmDialog("Delete the stored dataset file for <b>" + U.esc(sym) + "</b>? Saved backtest results for it are kept.", () => {
        container.market.removeSymbol(sym);
        container.log.add("WARNING", container.actorId(), "DATASET_DELETE", "Deleted dataset file " + sym);
        kit.toast("Dataset file deleted", "ok");
        location.reload();
      }, { danger: true, yesLabel: "Delete file" });
    }));

    /* --- theme chips --- */
    view.querySelectorAll("[data-theme]").forEach(c => c.addEventListener("click", () => {
      applyTheme(c.getAttribute("data-theme"));
      container.settings.set("theme", c.getAttribute("data-theme"));
      view.querySelectorAll("[data-theme]").forEach(x => x.classList.remove("gold-on"));
      c.classList.add("gold-on");
    }));

    /* --- yahoo symbol search --- */
    function renderQuotes(quotes) {
      const host = document.getElementById("set-res");
      host.style.display = "block";
      host.querySelector("tbody").innerHTML = quotes.map(q =>
        '<tr style="cursor:pointer" data-sym="' + U.esc(q.symbol) + '"><td><b>' + U.esc(q.symbol) +
        '</b></td><td>' + U.esc(q.name || "") + "</td><td class='muted'>" + U.esc(q.exchange || "") +
        '</td><td style="text-align:right"><button class="btn btn-sm btn-primary">Make active</button></td></tr>'
      ).join("") || "<tr><td colspan='4' class='muted'>No results</td></tr>";
      host.querySelectorAll("tr[data-sym]").forEach(tr => tr.addEventListener("click", () => switchSymbol(tr.getAttribute("data-sym"))));
      // fill the datalist for the dropdown
      const dl = document.getElementById("set-dl");
      dl.innerHTML = quotes.map(q => '<option value="' + U.esc(q.symbol) + '">' + U.esc((q.name || q.exchange || "").slice(0, 40)) + "</option>").join("");
    }
    function doSearch(q) {
      q = String(q || "").trim();
      if (!q) { status.textContent = "Type a symbol or name first."; return; }
      status.textContent = "Searching Yahoo Finance for \u201C" + q + "\u201D…";
      container.yahoo.fetchSymbols(q).then(res => {
        if (!res.ok) {
          status.textContent = res.msg || "Search failed.";
          document.getElementById("set-res").style.display = "none";
          return;
        }
        if (res.fallback) {
          status.textContent = "⚠ " + (res.msg || "Yahoo search unreachable — showing the built-in symbol list.") +
            " (" + res.quotes.length + " symbols)";
        } else {
          status.textContent = "✓ " + res.quotes.length + " symbol(s) from Yahoo Finance.";
        }
        renderQuotes(res.quotes);
        container.log.add("INFO", container.actorId(), "SYMBOL_SEARCH",
          "Yahoo symbol search: " + q + (res.fallback ? " (built-in fallback list)" : ""));
      }).catch(e => { status.textContent = (e && e.message) || "Search failed."; });
    }
    document.getElementById("set-search").addEventListener("click", () => doSearch(document.getElementById("set-q").value));
    document.getElementById("set-q").addEventListener("keydown", e => { if (e.key === "Enter") doSearch(e.target.value); });

    // auto-fill from Yahoo on mount with the current symbol
    doSearch(active);
  }
});
