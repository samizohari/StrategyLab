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

## Features

- **Data** — CSV/JSON import (flexible headers, dedupe, validation), manual bars, seeded demo generator, CSV export, date slicing, **Yahoo Finance live import** (any symbol, 1y–max daily history) with a Refresh button — direct calls are CORS-blocked, so the app auto-falls back to public CORS proxies (allorigins → corsproxy.io).
- **Strategies** — 6-step wizard (type → logic → combination → risk → capital → review): MA cross (SMA/EMA), RSI, MACD, Bollinger, S/R breakout; param tooltips throughout.
- **Combination engine** — AND consensus, OR, WEIGHTED vote (+threshold), SEQUENTIAL trigger/confirm.
- **Risk rules** — fixed %/ATR stops, fixed %/trailing take-profit, risk-per-trade sizing, %-of-equity / fixed-units / Kelly sizing, position cap, max daily loss halt, consecutive-loss pause, drawdown halt, compounding, fees.
- **Engine** — intrabar stops with conservative both-touch handling, signal-flip exits, same-bar re-entry cooldown, mark-to-market equity, trade log, async with progress/ETA; ~290k bars/s engine throughput; 10k+ bars comfortably.
- **Metrics** — return, win rate, Sharpe (annualised), max drawdown, avg win/loss, profit factor, exposure, hold time.
- **Analysis** — comparison matrix + ranking + radar + equity overlay, **regime heatmap**, scenario analysis on auto-detected bull/bear/sideways segments, parameter optimizer (grid search), risk dashboard.
- **Automation** — price/MA/RSI alerts with browser notifications, scheduled recurring backtests (tab-open), printable PDF reports, CSV/JSON exports.
- **Security** — salted SHA-256 (pure JS), session tokens + inactivity timeout, RBAC (ADMIN/ANALYST/VIEWER), login rate limiting (5/min), XSS-escaped rendering, full audit log with rotation + archives, JSON backup/restore.
- **Quality** — self-test suite (22 assertions, headless-capable) + performance benchmark in Admin → Tests & Benchmark.

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
