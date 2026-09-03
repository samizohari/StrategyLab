/* services/ai-provider.js — optional OpenAI-compatible LLM integration.
   Pure helper parseLLMJSON is exported for headless testing; the provider only
   talks to the network when the user configures an API key + endpoint. */
"use strict";
import { LOGIC_META } from "../domain/catalog.js";

/** Extract the first JSON object/array from an LLM answer (handles ``` fences,
 *  prose before/after, and stray characters). Returns {ok, value?, error?}. */
export function parseLLMJSON(text) {
  if (!text) return { ok: false, error: "Empty response." };
  let t = String(text).trim();
  // strip common code fences
  t = t.replace(/```(?:json)?/gi, "").replace(/```/g, "");
  const firstBrace = t.indexOf("{");
  const firstBracket = t.indexOf("[");
  const starts = [firstBrace, firstBracket].filter(i => i >= 0);
  if (!starts.length) return { ok: false, error: "No JSON object found in the response." };
  const start = Math.min.apply(null, starts);
  const open = t[start];
  const close = open === "{" ? "}" : "]";
  // brace/bracket matching with string awareness
  let depth = 0, inStr = false, esc = false, end = -1;
  for (let i = start; i < t.length; i++) {
    const ch = t[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end < 0) return { ok: false, error: "Unbalanced JSON in the response." };
  try {
    const value = JSON.parse(t.slice(start, end + 1));
    return { ok: true, value };
  } catch (e) {
    return { ok: false, error: "JSON parse failed: " + e.message };
  }
}

const SYSTEM_PROMPT = `You are StrategyLab's quantitative strategy advisor for gold (XAU/USD).
Given a market snapshot and optional user goal, design ONE trading strategy.
Reply with ONLY a JSON object (no markdown fences, no commentary) shaped as:
{
  "name": "Short descriptive name",
  "strategyLogic": { "type": "MA_CROSS" | "RSI" | "MACD" | "BOLL" | "S_R_BREAK", "params": { ... } },
  "riskManagement": { "stopType": "pct" | "atr" | "none", "stopLoss": 2, "stopATR": 2, "tpType": "pct" | "trail" | "none", "takeProfit": 4, "trailActivate": 1.5, "trailDist": 1.2, "riskPerTrade": 1.0, "maxDailyLoss": 4, "maxConsecLosses": 3, "pauseBars": 5 },
  "capitalManagement": { "positionSizing": "risk" | "percentage" | "fixed" | "kelly", "positionSize": 10, "maxPositionPct": 50, "compounding": true, "maxDrawdown": 25, "feePct": 0 },
  "reasoning": "2-3 sentences: why this fits the regime, how you set the stop/target"
}
Parameter rules:
- MA_CROSS params: fastMA, slowMA, fastType, slowType ("sma"|"ema"), signalType ("cross"|"above"); fastMA < slowMA.
- RSI params: period, overbought, oversold, mode ("reversion"|"momentum"); oversold < overbought.
- MACD params: fast, slow, signal, mode ("cross"|"hist"|"above"); fast < slow.
- BOLL params: period, mult, mode ("breakout"|"reversion").
- S_R_BREAK params: lookback, mode ("breakout"|"bounce").
Keep numbers in valid ranges (stops 0.1-10%, take profit 0.1-20%, risk per trade 0.5-2%, maxDailyLoss 1-6%, maxDrawdown 10-40%). Prefer conservative values.`;

export class OpenAiCompatibleProvider {
  /** @param {{settings: SettingsService, fetchFn?: Function, log?: LogService}} deps */
  constructor(deps) {
    this.settings = deps.settings;
    this.fetchFn = deps.fetchFn || ((...a) => fetch(...a));
    this.log = deps.log || null;
  }
  key() { return this.settings.get("ai_key") || ""; }
  model() { return this.settings.get("ai_model") || "gpt-4o-mini"; }
  baseUrl() { return (this.settings.get("ai_base") || "https://api.openai.com/v1").replace(/\/+$/, ""); }
  configured() { return !!this.key(); }

  /**
   * generateRecommendation({marketSummary, resultsBrief, userGoal}) -> {ok, draft?, raw?, error?}
   * draft: parsed JSON object from the model (validated by the caller before saving).
   */
  async generateRecommendation(ctx) {
    ctx = ctx || {};
    const key = this.key();
    if (!key) return { ok: false, error: "No API key configured. Add one on the AI Advisor page (or use the built-in local engine)." };
    const userParts = [];
    if (ctx.marketSummary) userParts.push("Market snapshot:\n" + ctx.marketSummary);
    if (ctx.resultsBrief) userParts.push("Current saved results (strategy -> return%/trades):\n" + ctx.resultsBrief);
    if (ctx.userGoal) userParts.push("User goal: " + ctx.userGoal);
    userParts.push("Return only the JSON strategy object.");
    const body = {
      model: this.model(),
      temperature: 0.2,
      max_tokens: 900,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userParts.join("\n\n") }
      ]
    };
    let resp;
    try {
      resp = await this.fetchFn(this.baseUrl() + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
        body: JSON.stringify(body)
      });
    } catch (e) {
      if (this.log) this.log.add("ERROR", "system", "AI_CALL_FAIL", "Network error: " + e.message);
      return { ok: false, error: "Network error calling the model: " + e.message + " (CORS? Some endpoints block browsers — try OpenRouter or a local gateway like Ollama/LM Studio.)" };
    }
    if (!resp.ok) {
      let detail = "";
      try { detail = (await resp.text()).slice(0, 300); } catch (e) { /* ignore */ }
      if (this.log) this.log.add("ERROR", "system", "AI_CALL_FAIL", "HTTP " + resp.status + " " + detail);
      return { ok: false, error: "Model API error HTTP " + resp.status + (detail ? " — " + detail : "") };
    }
    let data;
    try { data = await resp.json(); } catch (e) { return { ok: false, error: "Invalid response from model API." }; }
    const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!content) return { ok: false, error: "Model returned no content." };
    const parsed = parseLLMJSON(content);
    if (!parsed.ok) return { ok: false, error: "Model output was not valid JSON: " + parsed.error, raw: content };
    return { ok: true, draft: parsed.value, raw: content };
  }

  /** Validate & normalize an AI draft into a strategy entity (id/created set by save). */
  normalizeDraft(draft, strategies) {
    if (!draft || typeof draft !== "object") return { ok: false, error: "Draft is not an object." };
    const type = draft.strategyLogic && draft.strategyLogic.type;
    if (!LOGIC_META[type]) return { ok: false, error: "Unknown or missing strategy type in the draft." };
    const s = strategies.create(String(draft.name || "AI Strategy").slice(0, 60), type);
    if (draft.strategyLogic && draft.strategyLogic.params) {
      s.strategyLogic.params = Object.assign(s.strategyLogic.params, draft.strategyLogic.params);
    }
    if (draft.riskManagement) s.riskManagement = Object.assign(s.riskManagement, draft.riskManagement);
    if (draft.capitalManagement) s.capitalManagement = Object.assign(s.capitalManagement, draft.capitalManagement);
    if (draft.reasoning) s.desc = String(draft.reasoning).slice(0, 300);
    if (draft.helpMd) s.helpMd = String(draft.helpMd).slice(0, 8000);
    const errs = strategies.validate(s);
    return errs.length ? { ok: false, errors: errs, strategy: s } : { ok: true, strategy: s };
  }
}
