# StrategyLab — Gold Price Strategy Backtesting

A professional-grade, **100% client-side** trading strategy backtesting application for gold (XAU/USD).
No database, no server, no build step: pure HTML + JavaScript ES modules, all data in `localStorage`.

The project follows **Clean Architecture** and **SOLID** principles: a pure domain layer, use-case
services wired by dependency injection, persistence/UI adapters behind ports, and a modular UI —
**one page per HTML file**, not a single monolithic HTML.

---

## Live & files

| | |
|---|---|
| Live app | https://samizohari.github.io/StrategyLab/ (auto-routes to login/dashboard) |
| Pages | `pages/login.html`, `pages/dashboard.html`, `pages/data.html`, `pages/strategies.html`, `pages/backtest.html`, `pages/compare.html`, `pages/optimize.html`, `pages/scenarios.html`, `pages/risk.html`, `pages/alerts.html`, `pages/reports.html`, `pages/scheduler.html`, `pages/logs.html`, `pages/admin.html` |
| Legacy | `legacy/index.html` — the original single-file build (same features, same storage keys) |

## Run locally

ES modules need an HTTP origin (opening `index.html` via `file://` won't load them):

```bash
cd StrategyLab
python3 -m http.server 8000     # or: npx serve .
# open http://localhost:8000
```

### Default accounts (change admin password on first login — it is forced)

| Username | Password | Role |
|---|---|---|
| `admin` | `admin123` | ADMIN |
| `analyst` | `Analyst#123` | ANALYST |
| `viewer` | `Viewer#123` | VIEWER |

Self-registered accounts get the ANALYST role.

---

## Architecture (Clean Architecture + SOLID)

```
pages/*.html                 thin shells — one HTML per UI module
css/styles.css               shared design system (dark/light themes)
js/
├── app/                     composition root & boot
│   ├── container.js         dependency injection: stores → repos → services (single place wiring)
│   ├── page.js              startPage(): session/role guard + shell mount for every page
│   └── redirect.js          root index routing
├── core/                    infrastructure ports & pure helpers
│   ├── storage.js           StorePort contract + LocalStorage/Session/Memory implementations
│   ├── sha256.js            pure JS SHA-256, salted password hashing, policy
│   ├── utils.js             formatting, escaping (XSS), CSV building, downsampling…
│   └── infra.js             Clock / IdProvider / simulated-IP (injectable ports)
├── domain/                  pure business logic — zero DOM/storage/IO
│   ├── entities.js          strategy/user factories + validation
│   ├── catalog.js           parameter metadata (wizard, optimizer, docs)
│   ├── indicators.js        SMA/EMA/RSI/MACD/Bollinger/ATR
│   ├── trading.js           signal evaluation + AND/OR/WEIGHTED/SEQUENTIAL engine (resolver injected)
│   ├── metrics.js           performance metrics, drawdown series
│   ├── regime.js            bull/bear/sideway detection + segments
│   └── series.js            CSV/JSON parsers, export, demo generator
├── adapters/
│   └── repositories.js      persistence repositories over StorePort (users/strategies/results/…)
├── services/                use-case layer — one responsibility per service, DI in constructors
│   ├── auth-service.js      register/login/rate-limit/RBAC/sessions/password
│   ├── market-service.js    data import/export/ranges/regimes
│   ├── strategy-service.js  strategy CRUD + evaluator factory
│   ├── engine-core.js       pure bar-by-bar simulation engine (risk & capital rules)
│   ├── backtest-service.js  async runner, portfolio aggregation, benchmark
│   ├── result-service.js    results persistence/export
│   ├── analysis-service.js  scenario segments + regime averages (heatmap)
│   ├── optimizer-service.js grid search
│   ├── alert-service.js     market watchers (Notification via port)
│   ├── schedule-service.js  recurring backtests
│   ├── log-service.js       audit logging with rotation
│   └── settings-service.js  typed settings
├── ui/                      presentation layer (DOM only here)
│   ├── kit.js               toast/modal/confirm/busy components
│   ├── charts.js            Chart.js adapter (theme-aware)
│   ├── shell.js             role-aware sidebar/topbar, shortcuts, idle watchdog
│   ├── shared.js            shared result/metric renderers
│   ├── builder.js           strategy wizard controller
│   └── pages/*.js           one controller per page
└── tests/selftests.js       unit assertions (22) runnable headless or in Admin Panel
```

### How the principles map

| Principle | Where |
|---|---|
| **S**ingle Responsibility | one service/component per concern (auth, market, engine, optimizer, shell, …) |
| **O**pen/Closed | strategies & risk rules extend via catalog + config, never by editing the engine |
| **L**iskov | repositories/ports interchangeable — `LocalStorageStore`, `SessionStore`, `MemoryStore` all satisfy `StorePort`; tests run on `MemoryStore` |
| **I**nterface Segregation | small ports (`StorePort`, notification port, evaluator resolver) instead of fat globals |
| **D**ependency Inversion | services depend on injected repos/ports; domain knows nothing about storage or DOM; `container.js` wires it all |

Dependency rule: `domain ← services ← adapters ← ui`, and `app/container.js` composes from the outside.
The previous single-file build relied on a global `GPB` namespace; the modular build removes all globals
(grep `js/` for `GPB.` → 0 hits) in favour of explicit imports.

---

## Market data

Browsers cannot call `query1.finance.yahoo.com` directly — Yahoo sends no CORS header — and the
free public CORS proxies that used to make this work are now dead, rate-limited, or key-only
(`corsproxy.io` returns `401`). The app therefore ships two supported paths:

1. **Twelve Data (recommended, no proxy).** Get a free key at [twelvedata.com](https://twelvedata.com/pricing)
   (800 requests/day, 8/minute), paste it into **Settings → Market data source → Twelve Data API key**,
   set the provider to *Twelve Data*. CORS is open, so the request goes straight from the browser.
   Yahoo symbols are mapped automatically (`GC=F → XAU/USD`, `EURUSD=X → EUR/USD`, `BTC-USD → BTC/USD`, …).
2. **Your own relay (keeps Yahoo, no third party).** Deploy [`relay/cloudflare-worker.js`](relay/cloudflare-worker.js)
   as a Cloudflare Worker (free, ~2 minutes, no CLI), then paste its URL into **Yahoo relay URL** with the
   `{url}` placeholder kept: `https://<worker>.workers.dev/?url={url}`.

3. **Bundled snapshot (zero setup, daily bars).** `.github/workflows/snapshot.yml` runs
   [`tools/snapshot.mjs`](tools/snapshot.mjs) server-side (no CORS) every day at 05:17 UTC and commits
   `data/<symbol>.json` + `data/index.json` back to the repo. Daily imports read that file from the app's
   own origin first, so they need no relay, no proxy and no API key. Refresh or add symbols with
   **Actions → Yahoo data snapshot → Run workflow** (`symbols`, `range` inputs), or locally:
   `node tools/snapshot.mjs "GC=F,XAU…" 10y`. Intraday timeframes skip the snapshot (it holds daily bars)
   and use the paths above.

**Settings → Market data source → Test download** runs a real one-month request for the active symbol and
reports which provider answered (or the exact route failures). If Yahoo fails while a Twelve Data key is
saved, the app automatically falls back to Twelve Data, and vice-versa.

Every failed download writes the route-by-route detail to the audit log, and the banner explains the fix
instead of printing a raw pipe-separated error.

---

## Features

- **Data** — CSV/JSON import (flexible headers, dedupe, validation), manual bars, seeded demo generator, CSV export, date slicing, live OHLCV import at a chosen **timeframe** (1m / 5m / 15m / 30m / 1h / daily / weekly / monthly) over any history from **1 day to 20 years or all time** (17 spans, filtered to what the interval allows), with a **preview-before-save grid** and a paged **dataset grid** (bar count, span, bar spacing, OHLC quality flags, per-row change %, page size and navigation). Providers are switchable in **Settings → Market data source**: *Yahoo Finance* through your own relay (direct calls are CORS-blocked), or *Twelve Data* with a free API key (direct browser calls, no proxy). See [Market data](#market-data) below.
- **Strategies** — 7-step wizard (type → logic → combination → risk → capital → help → review): MA cross (SMA/EMA), RSI, MACD, Bollinger, S/R breakout, **Trendline** (buy above the rising bullish low-regression line, sell below the falling bearish high-regression line), RSI **level bands** in both directions (long: buy below the oversold level, sell above the overbought level; short: the mirror; or "both" to trade each band in its own direction), with optional pips-based stops/targets and a separate short take-profit; param tooltips and Markdown help docs throughout.
- **AI Advisor** — offline deterministic recommendations from live market state, plus optional LLM generation (OpenAI-compatible endpoint); ships with AI-created presets such as *Trendline Follower (AI)* and *RSI 30/70 Bracketed (AI)* — buy RSI(14) < 30 with a +0.5% target and a 100-pip stop, short RSI(14) > 70 with a 500-pip target and a 100-pip stop, band signals opening trades only.
- **Combination engine** — AND consensus, OR, WEIGHTED vote (+threshold), SEQUENTIAL trigger/confirm.
- **Risk rules** — fixed %/ATR stops, fixed %/trailing take-profit, risk-per-trade sizing, %-of-equity / fixed-units / Kelly sizing, position cap, max daily loss halt, consecutive-loss pause, drawdown halt, compounding, fees.
- **Engine** — intrabar stops with conservative both-touch handling, signal-flip exits, same-bar re-entry cooldown, mark-to-market equity, trade log, async with progress/ETA; ~290k bars/s engine throughput; 10k+ bars comfortably.
- **Metrics** — return, win rate, Sharpe (annualised), max drawdown, avg win/loss, profit factor, exposure, hold time.
- **Analysis** — comparison matrix + ranking + radar + equity overlay, **regime heatmap**, scenario analysis on auto-detected bull/bear/sideways segments, parameter optimizer (grid search), risk dashboard.
- **Automation** — price/MA/RSI alerts with browser notifications, scheduled recurring backtests (tab-open), printable PDF reports, CSV/JSON exports.
- **Security** — salted SHA-256 (pure JS), session tokens + inactivity timeout, RBAC (ADMIN/ANALYST/VIEWER), login rate limiting (5/min), XSS-escaped rendering, full audit log with rotation + archives, JSON backup/restore.
- **Quality** — self-test suite (68 assertions, headless-capable) + performance benchmark in Admin → Tests & Benchmark.

---

## Storage

Namespaced `gpb_*` keys in `localStorage` (identical to the legacy single-file build, so existing
browser data carries over). Admin → Backup & Restore downloads/uploads a full JSON snapshot.

## Keyboard shortcuts

`1…0` switch pages · `L` logs · `A` admin · `D` theme · `H`/`?` help · `Esc` close dialogs.

## Known limitations

- Runs per browser/profile; clearing site data erases everything (back up first).
- Notifications/schedules/alerts fire only while a page is open (by design — no server).
- Chart.js loads from a CDN (the only external library); offline, logic/storage/tests still work, charts are skipped.
- Demo price series is synthetic — import real data for real decisions.
