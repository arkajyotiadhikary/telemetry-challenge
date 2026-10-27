# What the real stack looks like, and where it lives in this repo

| Concern | Real stack | This repo |
|---|---|---|
| App logs | winston + `winston-loki` transport, labels `service_name`, `env`, `hostname`, `instance`, `build` | `app/src/logger.ts` (level 1) |
| Log context | `AsyncLocalStorage<LogContextStore>` with `runWithLogContext`, fields `requestId`, `app`, `provider`, `project` | `app/src/log-context.ts` (level 1) |
| Trace and span ids on logs | `getActiveTraceId()` read from `@opentelemetry/api` inside a winston format | `app/src/tracing.ts` (level 3) |
| OTel bootstrap | `telemetry.cjs` loaded with `NODE_OPTIONS=--require`, NodeSDK, OTLP gRPC exporters for traces and metrics, DELTA temporality, explicit bucket views, auto-instrumentation for http, undici, pg, redis, winston | `app/telemetry.cjs` (levels 2 and 4) |
| Custom spans | `addTracingSpan`, `addDetachedTracingSpan`, `traceAttributes`, `traceException`, `collapseTracingToSpan` | `app/src/tracing.ts` (level 2) |
| Custom metrics | `recordCount`, `recordDurationHistogram`, `createObservableGauge`, one Meter, instruments cached by name, `pid` and `instance` on every point | `app/src/metrics.ts` (level 4) |
| Collector | Grafana Alloy: OTLP receiver, Loki API receiver, `deltatocumulative`, `batch`, `memory_limiter`, `spanmetrics`, `servicegraph`, `probabilistic_sampler`; exporters to Prometheus remote write, Loki, Tempo, and a sampled copy to Honeycomb | `telemetry/alloy/config.alloy` |
| Stores | Grafana Cloud: Mimir (Prometheus), Loki, Tempo | Docker: Prometheus, Loki, Tempo |
| Frontend | Grafana Faro with web tracing, fetch and document-load instrumentation | bonus level |
| Dashboards | Grafana Foundation SDK (TypeScript) building a RED dashboard, uploaded over the API | `telemetry/grafana/dashboards/*.json`, file provisioned (level 6) |
| Alerts | Foundation SDK alert rules in TypeScript: Prometheus queries, Loki queries, math expressions, thresholds, `noDataState`, `severity` labels; uploaded over the API | `telemetry/grafana/provisioning/alerting/*.yaml` (level 7) |
| Terminal access | `tstudio` CLI: `traces`, `trace <id>`, `logs <id>`, `loki <logql>`, `slice` | bonus level |

## The questions the real stack had to answer

These came up while adding four alert rules for CRM project normalization. Each one is a
level in the challenge because each one bit for real.

1. The outcome counter was only recorded on the queue path, while the issue counters fired on
   every path. The ratio alert divided apples by oranges and could divide by zero. Fix: find
   the one choke point every path crosses, and count there. (Level 8)
2. The formula evaluator serves tickets, automations and settings previews too. A metric
   inside it counted a settings preview as a CRM sync problem. Fix: a callback the caller
   provides. (Level 4)
3. Metric names in code must not end in `_total`; the exporter appends it. The alert would
   have queried a metric that does not exist, and `noDataState: OK` would have hidden that
   forever. (Level 4)
4. One tenant with one failed refresh is a 100 percent error rate. Alerts need a minimum
   volume gate. (Level 7)
5. The same lock wrapper was also used by staff edits. Wrapping it with the counter made a
   typo in a form count as a sync failure. Fix: split lock-only from lock-plus-count.
   (Level 8)
6. A contact counter divided by a project counter inflates for tenants that get contact-only
   webhooks. Numerator and denominator must come from the same stream. (Level 7)
