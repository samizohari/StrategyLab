/* ui/builder.js — 7-step Strategy Builder wizard (shared controller) */
"use strict";
import { U } from "../core/utils.js";
import { renderMarkdown } from "./md.js";
import { composeStrategyHelp } from "../domain/help.js";

export function openBuilder(container, ui, id) {
  const svc = container.strategies;
  const cat = svc.catalog();
  const kit = ui.kit;
  const draft = id ? JSON.parse(JSON.stringify(svc.byId(id))) : svc.create("", "MA_CROSS");
  if (id) draft.updatedAt = new Date().toISOString();
  const wiz = { s: draft, editing: !!id, step: 0 };

  const modal = kit.modal('<div id="wizBody"></div>', {
    title: (id ? "Edit strategy" : "New strategy") + " — Strategy Builder", size: "lg",
    onClose() { /* noop */ }
  });
  const W = () => ({ wiz, modal });
  function goto(step) { wiz.step = step; render(); }

  function stepsHTML() {
    const steps = ["Type", "Logic", "Combination", "Risk", "Capital", "Help", "Review"];
    let h = '<div class="wiz-step">';
    steps.forEach((n, i) => {
      h += '<span class="st ' + (i < wiz.step ? "done" : i === wiz.step ? "on" : "") + '"><span class="n">' + (i < wiz.step ? "✓" : i + 1) + "</span>" + n + "</span>";
      if (i < steps.length - 1) h += '<span class="ln"></span>';
    });
    return h + "</div>";
  }
  function nav(prev, next, extra) {
    return '<div style="display:flex;justify-content:space-between;gap:8px;margin-top:16px;align-items:center">' +
      '<div>' + (extra || "") + '</div><div style="display:flex;gap:8px">' +
      (prev ? '<button class="btn" data-w="prev">← Back</button>' : "") +
      (next ? '<button class="btn btn-primary" data-w="next">' + next + " →</button>" : "") + "</div></div>";
  }
  function fieldHTML(m, v) {
    const f = "f-" + m.key;
    const tip = m.help ? '<span class="tip" tabindex="0"><i class="q">?</i><span class="tip-txt">' + U.esc(m.help) + "</span></span>" : "";
    if (m.type === "bool")
      return '<div class="field"><div style="display:flex;align-items:center;gap:8px"><label style="margin:0">' + U.esc(m.label) + "</label>" +
        '<label class="switch"><input type="checkbox" id="' + f + '" ' + (v ? "checked" : "") + "><i></i></label>" + tip + "</div></div>";
    if (m.type === "select") {
      const opts = m.opts.map(o => '<option value="' + U.esc(o[0]) + '"' + (String(v) === o[0] ? " selected" : "") + ">" + U.esc(o[1]) + "</option>").join("");
      return '<div class="field"><label>' + U.esc(m.label) + " " + tip + '</label><select id="' + f + '">' + opts + "</select></div>";
    }
    return '<div class="field"><label>' + U.esc(m.label) + " " + tip + '</label><input type="number" id="' + f + '" step="' + (m.step || 1) + '" min="' + (m.min != null ? m.min : "") + '" max="' + (m.max != null ? m.max : "") + '" value="' + U.esc(v) + '"></div>';
  }
  function collect(containerEl, metas, target) {
    metas.forEach(m => {
      const inp = containerEl.querySelector("#f-" + m.key);
      if (!inp) return;
      if (m.type === "bool") target[m.key] = inp.checked;
      else if (m.type === "number") { const v = parseFloat(inp.value); target[m.key] = isNaN(v) ? 0 : v; }
      else target[m.key] = inp.value;
    });
  }
  function wireNav(body) {
    const prev = body.querySelector("[data-w=prev]");
    if (prev) prev.addEventListener("click", () => goto(wiz.step - 1));
    const next = body.querySelector("[data-w=next]");
    return next;
  }

  function render() {
    const body = modal.body;
    const s = wiz.s;
    let html = "";
    if (wiz.step === 0) {
      html = stepsHTML();
      html += '<div class="field"><label>Strategy name</label><input id="w-name" maxlength="60" value="' + U.esc(s.name) + '"><div class="hint">A short, descriptive name shown across the app.</div></div>';
      html += '<div class="field"><label>Description</label><textarea id="w-desc" rows="2" maxlength="200">' + U.esc(s.desc) + "</textarea></div>";
      html += '<div class="field"><label>Strategy logic type</label><div id="w-types" class="grid grid-2"></div></div>';
      html += nav(false, "Logic type →");
      body.innerHTML = html;
      document.getElementById("w-types").innerHTML = Object.keys(cat.LOGIC_META).map(k => {
        const m = cat.LOGIC_META[k];
        const on = s.strategyLogic.type === k;
        return '<div class="card" style="cursor:pointer;padding:12px;border-color:' + (on ? "var(--acc)" : "var(--line)") + ';background:' + (on ? "var(--sel)" : "") + '" data-t="' + k + '"><b>' + U.esc(m.label) + '</b><div class="muted small" style="margin-top:4px">' + U.esc(m.help) + "</div></div>";
      }).join("");
      body.querySelectorAll("[data-t]").forEach(c => c.addEventListener("click", () => {
        const t = c.getAttribute("data-t");
        if (t !== s.strategyLogic.type) {
          s.strategyLogic.type = t;
          s.strategyLogic.params = JSON.parse(JSON.stringify(svc.create("", t).strategyLogic.params));
          render();
        }
      }));
      const next = wireNav(body);
      if (next) next.addEventListener("click", () => {
        const nm = document.getElementById("w-name").value.trim();
        if (!nm) { kit.toast("Give the strategy a name", "warn"); return; }
        s.name = nm;
        s.desc = document.getElementById("w-desc").value.trim();
        goto(1);
      });
    } else if (wiz.step === 1) {
      const meta = cat.LOGIC_META[s.strategyLogic.type];
      html = stepsHTML() + '<div class="card" style="margin-bottom:12px"><b>' + U.esc(meta.label) + '</b><div class="muted small">' + U.esc(meta.help) + "</div></div>";
      html += '<div class="fgrid">' + meta.params.map(m => fieldHTML(m, s.strategyLogic.params[m.key])).join("") + "</div>";
      html += nav(true, "Risk management →");
      body.innerHTML = html;
      const next = wireNav(body);
      next.addEventListener("click", () => {
        collect(body, meta.params, s.strategyLogic.params);
        const errs = svc.validate(s);
        if (errs.length) { kit.toast(errs[0], "bad"); return; }
        goto(2);
      });
    } else if (wiz.step === 2) {
      const others = svc.all().filter(x => x.id !== s.id);
      html = stepsHTML();
      html += '<div class="field"><div style="display:flex;align-items:center;gap:8px"><label class="switch" style="display:inline-flex;margin:0"><input type="checkbox" id="cb-enable" ' + (s.combine.enabled ? "checked" : "") + "><i></i></label><label style='margin:0'>Combine with other strategies</label></div>" +
        '<div class="hint">Members are re-evaluated on every bar and their signals merged. The parent strategy controls exits and sizing.</div></div><div id="cb-area">';
      html += '<div class="frow"><div class="field"><label>Combination logic</label><select id="cb-logic">' +
        [["AND", "AND — all members must agree"], ["OR", "OR — any member triggers"], ["WEIGHTED", "WEIGHTED — weighted vote ≥ threshold"], ["SEQUENTIAL", "SEQUENTIAL — trigger then confirm"]]
          .map(o => '<option value="' + o[0] + '"' + (s.combine.logic === o[0] ? " selected" : "") + ">" + o[1] + "</option>").join("") + "</select></div>" +
        '<div class="field" id="cb-thr-wrap" style="display:none"><label>Vote threshold</label><input type="number" id="cb-thr" step="0.1" min="0" value="' + U.esc(s.combine.threshold) + '"></div>' +
        '<div class="field" id="cb-seq-wrap" style="display:none"><label>Confirm window (bars)</label><input type="number" id="cb-seq" step="1" min="1" max="200" value="' + U.esc(s.combine.seqWindow) + '"></div></div>';
      html += '<div class="field"><label>Member strategies</label><div id="cb-members" class="chips">' +
        (others.length ? others.map(o => '<span class="chip" data-id="' + o.id + '" data-on="0" style="cursor:pointer">' + U.esc(o.name) + "</span>").join("") : '<span class="muted">Create other strategies first.</span>') + "</div></div>" +
        '<div id="cb-weights" style="display:none"></div></div>';
      html += nav(true, "Capital management →");
      body.innerHTML = html;
      const enabled = () => document.getElementById("cb-enable").checked;
      function renderWeights() {
        const ww = document.getElementById("cb-weights");
        const sel = Array.prototype.map.call(document.querySelectorAll('#cb-members .chip[data-on="1"]'), c => c.getAttribute("data-id"));
        if (!sel.length) { ww.innerHTML = '<div class="muted small">Select members to assign weights.</div>'; return; }
        ww.innerHTML = '<div class="field"><label>Weights</label><div class="fgrid">' + sel.map(sid => {
          const o = svc.byId(sid);
          return '<div class="field"><label style="font-size:11px">' + U.esc(o ? o.name : sid) + '</label><input type="number" step="0.1" min="0" data-wid="' + sid + '" value="' + U.esc((s.combine.weights && s.combine.weights[sid]) || 1) + '"></div>';
        }).join("") + '</div><div class="hint">Signals are multiplied by weight and summed; |sum| must reach the threshold.</div></div>';
      }
      function vis() {
        const lg = document.getElementById("cb-logic").value;
        document.getElementById("cb-thr-wrap").style.display = (enabled() && lg === "WEIGHTED") ? "block" : "none";
        document.getElementById("cb-seq-wrap").style.display = (enabled() && lg === "SEQUENTIAL") ? "block" : "none";
        const ww = document.getElementById("cb-weights");
        ww.style.display = (enabled() && lg === "WEIGHTED") ? "block" : "none";
        if (ww.style.display === "block") renderWeights();
        document.querySelectorAll("#cb-members .chip").forEach(c => { c.style.opacity = enabled() ? 1 : 0.35; c.style.pointerEvents = enabled() ? "auto" : "none"; });
        document.getElementById("cb-logic").style.opacity = enabled() ? 1 : 0.5;
      }
      document.getElementById("cb-enable").addEventListener("change", vis);
      document.getElementById("cb-logic").addEventListener("change", vis);
      document.querySelectorAll("#cb-members .chip").forEach(c => c.addEventListener("click", () => {
        const on = c.getAttribute("data-on") === "1";
        c.setAttribute("data-on", on ? "0" : "1");
        c.classList.toggle("gold-on", !on);
        vis();
      }));
      vis();
      const next = wireNav(body);
      next.addEventListener("click", () => {
        const cb = s.combine;
        cb.enabled = enabled();
        cb.logic = document.getElementById("cb-logic").value;
        cb.threshold = parseFloat(document.getElementById("cb-thr").value) || 0;
        cb.seqWindow = parseInt(document.getElementById("cb-seq").value, 10) || 5;
        cb.memberIds = Array.prototype.map.call(document.querySelectorAll('#cb-members .chip[data-on="1"]'), c => c.getAttribute("data-id"));
        const weights = {};
        document.querySelectorAll("#cb-weights input[data-wid]").forEach(i => { weights[i.getAttribute("data-wid")] = parseFloat(i.value) || 1; });
        cb.weights = weights;
        if (cb.enabled && !cb.memberIds.length) { kit.toast("Select at least one member strategy", "warn"); return; }
        goto(3);
      });
    } else if (wiz.step === 3) {
      const rm = s.riskManagement;
      html = stepsHTML() + '<div class="card" style="margin-bottom:12px"><b>Risk management</b><div class="muted small">Position protection rules applied by the backtest engine. Hover any "?" for details.</div></div>';
      html += '<div class="fgrid">' + cat.RISK_META.map(m => fieldHTML(m, rm[m.key])).join("") + "</div>";
      html += nav(true, "Capital management →");
      body.innerHTML = html;
      function vis() {
        const st = document.getElementById("f-stopType").value;
        const tp = document.getElementById("f-tpType").value;
        const hid = (id, on) => { const x = document.getElementById(id); if (x) { const f = x.closest(".field"); if (f) f.style.display = on ? "block" : "none"; } };
        hid("f-stopLoss", st === "pct"); hid("f-stopATR", st === "atr");
        hid("f-takeProfit", tp === "pct");
        hid("f-trailActivate", tp === "trail"); hid("f-trailDist", tp === "trail");
      }
      ["stopType", "tpType"].forEach(k => { const x = document.getElementById("f-" + k); if (x) x.addEventListener("change", vis); });
      vis();
      const next = wireNav(body);
      next.addEventListener("click", () => { collect(body, cat.RISK_META, s.riskManagement); goto(4); });
    } else if (wiz.step === 4) {
      const cm = s.capitalManagement;
      html = stepsHTML() + '<div class="card" style="margin-bottom:12px"><b>Capital management</b><div class="muted small">Sizing, compounding and drawdown limits.</div></div>';
      html += '<div class="fgrid">' + cat.CAP_META.map(m => fieldHTML(m, cm[m.key])).join("") + "</div>";
      html += nav(true, "Help & docs →");
      body.innerHTML = html;
      function vis() {
        const sz = document.getElementById("f-positionSizing").value;
        const hid = (id, on) => { const x = document.getElementById(id); if (x) { const f = x.closest(".field"); if (f) f.style.display = on ? "block" : "none"; } };
        hid("f-positionSize", sz === "percentage");
        hid("f-fixedUnits", sz === "fixed");
      }
      const sel = document.getElementById("f-positionSizing");
      if (sel) sel.addEventListener("change", vis);
      vis();
      const next = wireNav(body);
      next.addEventListener("click", () => { collect(body, cat.CAP_META, s.capitalManagement); goto(5); });
    } else if (wiz.step === 5) {
      /* Help & documentation (Markdown) */
      const resolver = id => { const m = svc.byId(id); return m ? m.name : null; };
      if (!s.helpMd || !String(s.helpMd).trim()) {
        s.helpMd = composeStrategyHelp(s, resolver);
      }
      html = stepsHTML();
      html += '<div class="card" style="margin-bottom:12px"><b>Help &amp; documentation</b>' +
        '<div class="muted small">Write a comprehensive guide for this strategy in Markdown — headings, lists, tables, links and code blocks are supported. It is shown via the <b>Help popup</b> next to the strategy.</div></div>';
      html += '<div class="field"><label>Markdown content <span class="muted small">(auto-filled — edit freely)</span></label>' +
        '<textarea id="w-help" rows="10" style="font-family:var(--mono);font-size:12.5px"></textarea></div>' +
        '<button class="btn btn-sm" id="w-help-default">↺ Regenerate default</button>' +
        '<h4 style="margin-top:12px">Live preview</h4>' +
        '<div class="card" style="max-height:240px;overflow:auto"><div class="md" id="w-help-prev"></div></div>';
      html += nav(true, "Review & save →");
      body.innerHTML = html;
      const ta = body.querySelector("#w-help");
      ta.value = s.helpMd || "";
      const preview = body.querySelector("#w-help-prev");
      const update = () => { s.helpMd = ta.value; preview.innerHTML = renderMarkdown(ta.value || "*No content yet.*"); };
      ta.addEventListener("input", update);
      body.querySelector("#w-help-default").addEventListener("click", () => {
        ta.value = composeStrategyHelp(s, resolver);
        update();
      });
      update();
      const nextHelp = wireNav(body);
      nextHelp.addEventListener("click", () => goto(6));
    } else {
      const errs = svc.validate(s);
      const meta = cat.LOGIC_META[s.strategyLogic.type];
      const row = (l, v) => "<tr><td style='width:180px'><b>" + U.esc(l) + "</b></td><td>" + v + "</td></tr>";
      html = stepsHTML() + '<div class="card"><h3>' + U.esc(s.name) + '</h3><p class="muted" style="margin:0 0 10px">' + U.esc(s.desc || "No description") + '</p><table class="tbl"><tbody>' +
        row("Logic type", U.esc((meta ? meta.label : "") || s.strategyLogic.type)) +
        row("Parameters", "<code>" + U.esc(JSON.stringify(s.strategyLogic.params)) + "</code>") +
        row("Risk", U.esc(JSON.stringify(s.riskManagement))) +
        row("Capital", U.esc(JSON.stringify(s.capitalManagement))) +
        row("Combination", s.combine && s.combine.enabled ? U.esc(s.combine.logic + " · " + (s.combine.memberIds || []).map(id => { const m = svc.byId(id); return m ? m.name : id; }).join(", ")) : "None") +
        row("Help doc", s.helpMd && String(s.helpMd).trim() ? "<span class='muted'>" + String(s.helpMd).length + " chars of Markdown — shown via the Help popup</span>" : "auto-generated on save") +
        "</tbody></table></div><div id='wiz-errs'></div>";
      html += nav(true, "", '<button class="btn btn-primary" data-save="1">💾 Save strategy</button>');
      body.innerHTML = html;
      if (errs.length) {
        document.getElementById("wiz-errs").innerHTML = '<div class="err-msg" style="margin-top:8px">⚠ ' + errs.map(U.esc).join("<br>") + "</div>";
        const sb = body.querySelector("[data-save]");
        if (sb) sb.disabled = true;
      }
      wireNav(body);
      const saveBtn = body.querySelector("[data-save]");
      if (saveBtn) saveBtn.addEventListener("click", () => {
        const res = svc.save(s);
        if (!res.ok) { kit.toast(res.errors[0], "bad"); return; }
        container.log.add("INFO", container.actorId(), wiz.editing ? "STRATEGY_UPDATE" : "STRATEGY_CREATE", "Saved strategy " + s.name + " (" + s.strategyLogic.type + ")");
        kit.toast("Strategy saved: " + s.name, "ok");
        modal.close();
        location.reload();
      });
    }
  }
  render();
}
