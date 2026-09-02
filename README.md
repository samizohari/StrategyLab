# GoldStrategy Lab — Gold Price Strategy Backtesting App

A professional-grade, **100% client-side** trading strategy backtesting application for gold (XAU/USD) data. Everything runs in a single HTML file in the browser; all data, users, logs and results live in `localStorage`. No server, no database, no build step.

---

## Quick start

1. **Open `index.html`** in Chrome, Firefox, Edge or Safari (double-click is fine).
2. Sign in with the pre-configured credentials below.
3. Demo market data (1,600 synthetic daily gold bars) is auto-loaded on first run — or import your own CSV/JSON in **Market Data**.
4. Pick a seeded strategy in **Backtest Lab** and press **Run backtest**.

> Charts use Chart.js from a CDN, so an internet connection is required for the first page load (or replace the `<script src=…chart.js…>` tag with a local copy for fully offline use). Everything else — engine, crypto, storage — has zero external dependencies.

### Default accounts

| Username | Password | Role | Notes |
|---|---|---|---|
| `admin` | `admin123` | **ADMIN** | **Password change forced on first login** |
| `analyst` | `Analyst#123` | ANALYST | Full trading workflow, no user/log management |
| `viewer` | `Viewer#123` | VIEWER | Read-only: dashboards, comparison, risk, reports |

Self-registered accounts get the ANALYST role; an ADMIN can change roles in **Admin Panel → Users**.

---

## Feature map

| Area | What you get |
|---|---|
| **Data** | CSV/JSON import (flexible headers, date dedupe, validation), manual OHLCV entry, seeded demo generator, CSV export, date-range slices |
| **Strategies** | Builder wizard (6 steps): logic type, parameters, combination, risk management, capital management, review. Types: MA crossover (SMA/EMA), RSI, MACD, Bollinger Bands, Support/Resistance breakout. Param tooltips throughout |
| **Combination engine** | AND (consensus), OR, WEIGHTED voting (with per-member weights + threshold), SEQUENTIAL (trigger → confirm within N bars). Member strategies evaluated on every bar |
| **Risk rules** | Stop-loss fixed % / ATR-based / none; take-profit fixed % / trailing (activation + distance); risk-per-trade % sizing; % of equity, fixed-units or Kelly sizing; max position % cap; max daily loss halt; max consecutive losses → pause; max drawdown → run halted; compounding toggle; fee % |
| **Backtest engine** | Bar-by-bar simulation with intrabar stop/TP handling (conservative both-touch: stop assumed first), trailing stops, long + short, signal-flip exits, same-bar re-entry cooldown, mark-to-market equity curve, drawdown series, full trade log. Async with progress bar + ETA; handles 10,000+ bars (~250k bars/s engine throughput) |
| **Metrics** | Win rate, total return, Sharpe (annualised), max drawdown, avg win/loss ratio, profit factor, trade count, exposure, avg hold |
| **Analysis** | Comparison matrix + ranking (sortable), radar profile, overlaid equity curves, **regime heatmap** (bull/bear/sideways × strategy), scenario analysis on auto-detected regime segments, optimizer (grid search over parameters with progress, apply best), risk dashboard (vol, drawdown, halt flags) |
| **Automation** | Browser-notification price/MA/RSI alerts, scheduled recurring backtests (interval-based, runs while the tab is open), printable PDF reports (browser print) + CSV/JSON exports |
| **Security** | Salted SHA-256 password hashing (pure JS, no plaintext), session tokens with inactivity timeout (configurable), RBAC (ADMIN/ANALYST/VIEWER), login rate limiting (5/min), XSS-escaped rendering, full audit logging with simulated IP, log rotation with archives |
| **Admin** | User CRUD + role change + password reset, system settings, full JSON backup/restore, log viewer with filters, self-test suite (unit assertions) and performance benchmark |

---

## Data format

Import supports CSV and JSON. Header names are matched case-insensitively (`Date,Open,High,Low,Close,Volume` or `date,open,high,low,close,volume`, plus common aliases; a `volume` column is optional).

```csv
Date,Open,High,Low,Close,Volume
2026-08-03,2440.1,2461.7,2432.4,2455.3,183420
2026-08-04,2455.3,2470.2,2448.9,2462.1,152100
```

```json
[ { "date": "2026-08-03", "open": 2440.1, "high": 2461.7, "low": 2432.4, "close": 2455.3, "volume": 183420 } ]
```

A ready-to-use sample file, **`sample-gold-data.csv`** (750 daily bars), ships with this app.

---

## How to run a workflow

1. **Market Data** — drop your CSV or paste data (or keep the demo series). Check the preview.
2. **Strategies → ＋ New strategy** — walk the wizard. On the *Combination* step you can optionally require other strategies to agree before this one trades.
3. **Backtest Lab** — choose the strategy (or enable *Portfolio* and pick several with capital weights), set the period/capital, run, and inspect metrics, equity/drawdown charts and the trade log.
4. **Comparison** — tick saved results; view the matrix, ranking, radar, overlaid equities; press *Build heatmap* for the regime analysis.
5. **Optimizer** — select a strategy, choose parameter ranges and objective; results are ranked; *Apply best* writes the parameters back.
6. **Reports & Export** — build a printable report (Print → *Save as PDF*), export trades/equity CSV or a JSON report.
7. **Admin Panel → Tests & Benchmark** — run the self-test suite and the throughput benchmark any time.

### Keyboard shortcuts

`1…0` switch views · `D` toggle theme · `H` / `?` shortcut help · `Esc` close dialogs.

---

## Security model

- Passwords: `SHA-256("gpbt$" + salt + "$" + password + "$v1")` with a fresh 16-byte random salt per user; policy requires ≥8 chars incl. uppercase, number and special char (admin-reset users must change on next login).
- Sessions: random token in `sessionStorage` with expiry; inactivity watchdog auto-signs-out after the configured timeout (default 30 min).
- RBAC: VIEWER = view/export/report only; ANALYST = everything except admin areas; ADMIN = all.
- Login throttling: max 5 failed attempts per user per minute, then a 60 s lockout.
- All actions write to the log (`INFO/WARNING/ERROR/SECURITY`) with userID, action, timestamp and simulated IP; rotation auto-archives past the cap (default 1,500 entries, last 3 archives kept). Logs are admin-only.
- XSS: every user-controlled string is escaped through a single `esc()` helper before entering the DOM.

---

## Storage

Everything is namespaced under `gpb_*` keys in `localStorage`:

`gpb_users` · `gpb_session` (sessionStorage) · `gpb_logs` + `gpb_logs_archive` · `gpb_data` · `gpb_strategies` · `gpb_results` (capped, default 20) · `gpb_settings` · `gpb_alerts` · `gpb_sched` · `gpb_ip`

Use **Admin → Backup & Restore** to download/upload a full JSON snapshot (users, data, strategies, results, logs, schedules, alerts). Clearing site data removes everything.

---

## Architecture (single file)

```
index.html
├── CSS        design system: dark/light themes, glassmorphism, responsive shell, print styles
└── JS modules (inline <script> blocks, in load order)
    ├── core       utils, pure-JS SHA-256, storage wrapper, settings, logger w/ rotation
    ├── auth       users, salted hashing, sessions, RBAC, rate limiting
    ├── data/ind   OHLCV store + importer, demo generator, regime detector; SMA/EMA/RSI/MACD/BB/ATR
    ├── strat      strategy schema, presets, validation, signal evaluation, AND/OR/WEIGHTED/SEQUENTIAL engine
    ├── engine     bar simulation (risk/capital rules), metrics, async runner w/ progress, portfolio, benchmark
    ├── charts     Chart.js wrappers (theme-aware, downsampled)
    ├── ui         router/nav, modals, toasts, theme, keyboard shortcuts, login flow
    ├── views      dashboard · data · strategies+builder wizard · backtest · comparison · optimizer ·
    │              scenarios · risk · alerts · scheduler · reports · logs · admin
    └── tests      self-test suite (run from Admin Panel)
```

Module boundaries mirror a conventional `js/app.js … utils.js` layout; the whole app is a set of namespaced IIFEs on one `GPB` object.

---

## Testing

- **Self tests:** Admin Panel → *Tests & Benchmark → Run test suite* (23 assertions): SHA-256 vectors, indicator math, engine trade math (TP win, stop-loss, conservative both-touch), compounding effect, daily-loss halt, zero-trade / all-losing edge cases, regime detector, CSV parsing, XSS escaping, login rate limiting.
- **Benchmark:** Admin Panel → *Tests & Benchmark → Run benchmark* — times a backtest over 12,000 synthetic candles (engine loop typically runs in tens of ms; the async UI path stays responsive).
- Cross-browser: plain ES5-ish JS + Chart.js 4 — tested targets Chrome, Firefox, Edge, Safari (recent versions).
- Edge cases handled: empty/short datasets (zero trades → clean “—” metrics), all-losing runs (win rate 0, PF undefined → shown as ∞/—), extreme volatility (gap bars through both stop and target are resolved conservatively), duplicate dates on import (skipped with warnings).

## Known limitations

- Client-side only: data persists per browser/profile; clearing site data erases it (back up first).
- Notifications, scheduled runs and alerts only fire while the app tab is open (by design — no server).
- Chart.js is loaded from a CDN; without network the app runs but charts are disabled (logic, tests and storage all work).
- Demo price series is synthetic (seeded) — use your own data for real decisions.

---

## Files

```
gold-price-backtester/
├── index.html              the complete application (single file)
├── sample-gold-data.csv    750 daily OHLCV bars for immediate testing
└── README.md               this document
```
