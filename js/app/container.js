/* js/app/container.js — composition root (manual dependency injection).
   Builds: stores → repositories → services → singleton container.
   Same builder works in the browser (localStorage) and in Node tests (MemoryStore). */
"use strict";
import { LocalStorageStore, SessionStore, MemoryStore } from "../core/storage.js";
import { Clock, IdProvider, SimulatedIpProvider } from "../core/infra.js";
import {
  UsersRepo, StrategiesRepo, ResultsRepo, MarketDataRepo, LogsRepo,
  AlertsRepo, SchedulesRepo, SettingsRepo
} from "../adapters/repositories.js";
import { LogService } from "../services/log-service.js";
import { SettingsService } from "../services/settings-service.js";
import { AuthService } from "../services/auth-service.js";
import { MarketService } from "../services/market-service.js";
import { StrategyService } from "../services/strategy-service.js";
import { BacktestService } from "../services/backtest-service.js";
import { ResultService } from "../services/result-service.js";
import { AnalysisService } from "../services/analysis-service.js";
import { OptimizerService } from "../services/optimizer-service.js";
import { AlertService } from "../services/alert-service.js";
import { ScheduleService } from "../services/schedule-service.js";
import { AdvisorService } from "../services/advisor-service.js";
import { OpenAiCompatibleProvider } from "../services/ai-provider.js";

/** buildContainer({main?, session?}) -> container
 *  main/session: StorePort instances. Defaults: browser localStorage/sessionStorage. */
export function buildContainer(opts) {
  opts = opts || {};
  const mainStore = opts.main || new LocalStorageStore("");
  const sessionStore = opts.session || new SessionStore("");

  const ids = opts.ids || new IdProvider();
  const clock = opts.clock || new Clock();

  const repos = {
    users: new UsersRepo(mainStore),
    strategies: new StrategiesRepo(mainStore),
    results: new ResultsRepo(mainStore),
    market: new MarketDataRepo(mainStore),
    logs: new LogsRepo(mainStore),
    alerts: new AlertsRepo(mainStore),
    schedules: new SchedulesRepo(mainStore),
    settings: new SettingsRepo(mainStore)
  };

  const settings = new SettingsService(repos.settings);
  const ip = opts.ip || new SimulatedIpProvider(mainStore);
  const log = new LogService({ logs: repos.logs, ip, ids });
  log.setMaxEntries(settings.get("logMaxEntries"));

  const auth = new AuthService({ users: repos.users, log, settings, clock, ids, session: sessionStore });
  const market = new MarketService({ repo: repos.market, log, ids });
  const strategies = new StrategyService({ repo: repos.strategies, log, ids });
  const backtest = new BacktestService({ strategies, ids, clock });
  const results = new ResultService({ repo: repos.results, settings, log });
  const analysis = new AnalysisService({ market, backtest });
  const optimizer = new OptimizerService({ strategies, backtest, market });
  const alerts = new AlertService({ repo: repos.alerts, log, ids, market, notify: null });
  const schedules = new ScheduleService({ repo: repos.schedules, strategies, results, backtest, market, log, ids });
  const advisor = new AdvisorService({ market, strategies, results, ids, clock });
  const ai = new OpenAiCompatibleProvider({ settings, log });

  const container = {
    stores: { main: mainStore, session: sessionStore },
    repos, settings, log, ids, clock, ip,
    auth, market, strategies, backtest, results, analysis, optimizer, alerts, schedules,
    advisor, ai,

    /** Notification port — UI adapters register themselves (inversion of control). */
    bindNotify(port) { alerts.notifyPort = port; },

    /** Seeds + housekeeping, safe to call repeatedly. */
    boot() {
      log.setMaxEntries(settings.get("logMaxEntries"));
      auth.seedDefaults();
      strategies.seedDefaults();
      market.ensureDemo();
      return container;
    },

    /** Convenience: current actor id ('' when guest). */
    actorId() {
      const u = auth.current();
      return u ? u.id : "system";
    }
  };
  return container;
}

export const container = typeof document !== "undefined" ? buildContainer() : null;
