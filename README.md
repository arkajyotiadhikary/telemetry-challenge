# Telemetry challenge: rebuild a production observability stack from zero

You start with a small Node service that syncs projects from a fake CRM, and a Docker stack
with Grafana, Loki, Tempo, Prometheus and Alloy that receive nothing. Level by level you make
the service observable, the same way a real multi-tenant SaaS does it.

No prior knowledge is assumed. Each level says what to build, how to prove it works, and
which real-world piece it mirrors. Do them in order. Do not skip the "prove it" step.

```
            your code                      the collector                   the stores
 ┌──────────────────────────┐    ┌──────────────────────────┐    ┌─────────────────────┐
 │ solar-sync (app/)        │    │ Alloy                    │    │ Loki      (logs)    │
 │  winston ──logs─────────────▶ │ :4319 loki.source.api ───────▶│                     │
 │  OTel SDK ─traces───────────▶ │ :4317 otlp receiver ─────────▶│ Tempo     (traces)  │
 │  OTel SDK ─metrics──────────▶ │       deltatocumulative ─────▶│ Prometheus(metrics) │
 │  (fake CRM on :4100)     │    │       spanmetrics        │    └──────────┬──────────┘
 └──────────────────────────┘    └──────────────────────────┘               │
                                                                     ┌──────▼──────┐
                                                                     │   Grafana   │
                                                                     │ :3300       │
                                                                     └─────────────┘
```

## Setup (10 minutes)

Requirements: Docker, Node 22.6 or newer, pnpm.

```sh
docker compose up -d
cd app && pnpm install && pnpm dev
```

- Grafana: http://localhost:3300 (no login)
- Alloy UI: http://localhost:12345 (shows every pipeline component and whether data flows)
- App: `curl -X POST localhost:4000/refresh/hubspot/p12`

The app logs to the console only. Nothing reaches Grafana yet. That is the starting line.

Copy `.env.example` to `.env` when a level tells you to.

## How the course works

Each level is a short lesson in four parts:

1. **Learn**: the idea, in plain words. No prior knowledge assumed.
2. **Tour**: a guided walk through the real files and screens.
3. **Worked example**: a small problem solved step by step, with scripts you run yourself.
4. **Homework**: a similar problem in the app, solved on your own, with a clear "you pass when".

Then write three lines in `docs/journal.md`: what you built, what surprised you, what you would
do differently. This is the part that makes it stick.

| Level | Lesson |
|---|---|
| 0 | [Look around](lessons/level-0-look-around.md) |
| 1 | [Structured logs](lessons/level-1-structured-logs.md) |
| 2 to 8 | Below, in the old format. Being rewritten as lessons. |

---

## Level 2: Traces (3 to 4 hours)

Goal: one refresh is one trace, and you can see where the time went.

Build:

1. `app/telemetry.cjs`: the OpenTelemetry NodeSDK bootstrap. Follow the numbered comments.
   Set `ALLOY_GRPC_URL=http://localhost:4317` in `.env`. Start with `pnpm dev`.
   You should already see spans for every `fetch` to the fake CRM. That is
   auto-instrumentation: you wrote no span code yet.
2. `app/src/tracing.ts`: `addTracingSpan`, `addDetachedTracingSpan`, `traceAttributes`.
3. In `pipeline.ts`, wrap `refreshProject` in a span named `normalize project` with
   attributes `solar.provider`, `solar.project.id`, `solar.app.id`.
   In `index.ts`, make the queue path use a detached span. The HTTP path keeps the span the
   http instrumentation already opened.

Prove it:

- Tempo, TraceQL: `{ name = "normalize project" && span.solar.provider = "hubspot" }`.
  Open one trace. You see the parent span, then the `GET /projects/p..` span, then one
  `GET /contacts/..` span per contact. Click the slow one for `p14`, `p24`, ...: 1.5 s.
- A refresh of `p19` shows a span with status error and an exception event.
- A queue refresh is its own trace. An HTTP refresh is a child of the `POST /refresh/...` span.

Questions:

- Why must `telemetry.cjs` be loaded with `--require` before the app, not imported from it?
- What does `BatchSpanProcessor` do that `SimpleSpanProcessor` does not, and why does it
  matter at 1,000 refreshes a minute?

Mirrors: `packages/utils/telemetry.cjs`, `packages/utils/tracing.ts`, the `normalize
project` span every CRM listener opens.

---

## Level 3: Connect logs and traces (1 hour)

Goal: from a log line, one click to its trace. From a span, one click to its logs.

Build:

1. `getActiveTraceId` and `getActiveSpanId` in `tracing.ts` from the active span context.
2. A winston format that adds `trace_id` and `span_id` to every line when a span is active.

Prove it:

- In Loki, a "No email provided" line shows a `View trace` button (the data source is already
  provisioned to look for a `trace_id` field). Click it. You land on the right trace.
- In Tempo, open a trace, click a span, "Logs for this span". The lines appear.

Question: the log line is written before the span ends. Why does the link still work?

Mirrors: `getActiveTraceId()` in `packages/logger/index.ts`; the `tstudio trace` and
`tstudio logs` commands that do the same jump from the terminal.

---

## Level 4: Metrics (3 to 4 hours)

Goal: counters with labels you can alert on, and a histogram for durations.

Build, in `app/src/metrics.ts` and the TODO(level 4) spots:

1. `recordCount(name, count, attributes)`. One cached counter per name. Attributes always
   include `pid` and `instance`. Never throws.
2. Counters:
   - `crm_project_normalization{provider, appId, status}` once per refresh outcome.
   - `crm_contact_normalization{provider, appId, status}` once per contact, status
     `SUCCESS` or `MISSING_EMAIL`.
   - `crm_project_normalization_issue{provider, appId, issue="traversal_dead_end"}`.
     The formula engine must not import metrics. Give it a callback (`onTraversalDeadEnd`)
     and let the pipeline decide what to count. Count at most one per refresh.
3. `recordDurationHistogram('normalize', {provider}, fn)` around the refresh, with a view in
   `telemetry.cjs` that sets explicit buckets (say 0.1, 0.5, 1, 2, 5 seconds).
4. Metric export in `telemetry.cjs` with DELTA temporality. Look at the Alloy config to see why
   `deltatocumulative` sits before Prometheus.

Prove it, in Explore, Prometheus:

- `sum by (provider, status) (increase(crm_project_normalization_total[5m]))` shows all
  providers and at least SUCCESS, NO_CONTACTS, FILTERED_OUT, PROJECT_NOT_FOUND.
- `histogram_quantile(0.95, sum by (le) (rate(normalize_bucket[5m])))` is above 1 s only
  when `p?4` projects are in the mix.
- The name in code has no `_total`. The name in Prometheus has. Explain who added it.

The cardinality lesson, do not skip it:

- Temporarily add `projectId` as a label. Run `pnpm load 500`. Open Prometheus at
  http://localhost:9090/tsdb-status and read "Head Series". Remove the label. Write the two
  numbers in the journal. This is the bill in Grafana Cloud.

Mirrors: `packages/utils/metrics.ts`, `recordCount`, the explicit bucket views in
`telemetry.cjs`, `FormulaEvaluationConfig.onTraversalDeadEnd`.

---

## Level 5: Metrics from spans, with no app code (1 hour)

Goal: understand that the collector can compute RED (rate, errors, duration) from traces.

Build: nothing in the app. Read the `spanmetrics` and `servicegraph` blocks in
`config.alloy`. Add a dimension for `solar.app.id`.

Prove it:

- Prometheus: `sum by (span_name, status_code) (rate(traces_spanmetrics_calls_total[5m]))`.
- Grafana, Tempo data source, "Service graph" tab shows `solar-sync` calling the fake CRM.

Question: when would you count in code (level 4) and when in the collector (level 5)? Hint:
what label does spanmetrics not know about?

Mirrors: `docker/telemetry/spanmetrics.alloy`, used for webhooks, redis, monthly reports.

---

## Level 6: Dashboards as code (2 hours)

Goal: a dashboard that lives in git and appears in Grafana by itself.

Build: a RED dashboard for solar-sync as a JSON file in `telemetry/grafana/dashboards/`.
Panels: refreshes per minute by provider, error ratio, p95 duration, outcome breakdown as a
stacked bar, missing-email ratio. Grafana provisions that folder every 10 seconds.

Do it the honest way: build it by clicking in Grafana, export the JSON, commit it, then edit
the JSON by hand to add one more panel. Now you know both directions.

Prove it: `docker compose restart grafana` and the dashboard is still there with your panel.

Mirrors: `packages/infrastructure/grafana/src/dashboards/red.ts`, built with the Grafana
Foundation SDK and uploaded over the API. Same idea, more code.

---

## Level 7: Alert rules as code (2 to 3 hours)

Goal: an alert that fires when a tenant's sync is broken, and stays quiet otherwise.

Build, in `telemetry/grafana/provisioning/alerting/` (there is a worked example for HTTP
errors already there):

1. "CRM Normalization Errors": UNKNOWN_ERROR over all outcomes, per provider and app, over
   one hour, above 10 percent.
2. "CRM Contacts Missing Email": MISSING_EMAIL over all contact normalizations, above 25
   percent.
3. Both need a minimum volume. A tenant with one refresh and one error is 100 percent and
   must not page anyone. Gate the math on the denominator.
4. Labels `severity` and `env`. Think about what `noDataState` should be for a brand new
   metric.

Prove it:

- `CHAOS=0.5 pnpm load 300`. Within a few minutes the error alert is Firing in Grafana,
  Alerting, Alert rules. Then `CHAOS=0 pnpm load 300`, and it resolves.
- Restart the app ten times. The alert does not flap. (Counter resets. `increase` handles
  them. Prove you understand why.)

Mirrors: `packages/infrastructure/grafana/src/alerting/alertRules.ts`, four CRM rules of
exactly this shape.

---

## Level 8: Capstone, count once (3 to 4 hours)

This is the real engineering problem behind the metrics. Read it twice.

`refreshProject` is called from the HTTP route, from the queue, and (add this) from a new
`refreshMany(tenant, ids)` that calls `refreshProject` in a loop. Some callers wrap other
callers. The outcome counter must go up exactly once per refresh, on every path, including
when `refreshProject` throws.

Build:

1. `withProjectNormalizationOutcome(context, callback)`: an AsyncLocalStorage flag that marks
   the outermost call. Only the outermost call records. A throw records `UNKNOWN_ERROR` and
   rethrows. Results the pipeline already counted (SUCCESS, NO_CONTACTS, FILTERED_OUT) are
   not counted again.
2. Put the wrapper in one choke point every path passes through. Find it.
3. A `node --test` test in `app/src/` that calls the nested path and asserts the counter went
   up by one. You will need to swap the real counter for a fake in the test.

Prove it: the test passes, and the "Normalization Errors" ratio in Grafana matches what
`pnpm load` printed to the console, within rounding.

Mirrors: `withProjectNormalizationOutcome` in `packages/services/sites/NormalizationMetrics.ts`
and the `lockProject` versus `normalizeProjectSerialized` split in `packages/services/crm/service.ts`.

---

## Bonus levels

- **Frontend**: add a one-page HTML UI served by the app and instrument it with Grafana Faro
  (web vitals, errors, fetch spans that join the backend trace). Mirrors `faro.client.ts`.
- **Your own tstudio**: a CLI that takes a trace id and prints the span tree from Tempo's
  API and the matching log lines from Loki's API. Mirrors the `tstudio` tool.
- **Sampling**: add a `probabilistic_sampler` processor in Alloy that keeps 10 percent of
  successful traces and 100 percent of error traces. Mirrors the Honeycomb branch of
  Sunvoy's Alloy config.
- **Cost**: write down the formula for how many series this app produces per tenant, then
  check it against `/tsdb-status`.

## Reading, in this order

1. Grafana docs, "Introduction to observability".
2. OpenTelemetry JS docs, "Getting started, Node", then "Instrumentation", then "Resources".
3. Prometheus docs, "Querying basics" and "Best practices, naming" and "Instrumentation,
   things to watch out for" (the cardinality section).
4. Grafana Alloy docs, "Components" for every block you saw in `config.alloy`.
5. Loki docs, "LogQL" and "Labels, best practices".
6. Tempo docs, "TraceQL".
