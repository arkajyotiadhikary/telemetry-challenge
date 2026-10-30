# Level 0: Look around

Time: about 1 hour. You write no app code in this level.

Every level has the same four parts:

1. **Learn**: the idea, in plain words.
2. **Tour**: we walk through the real files and screens together.
3. **Worked example**: I solve a small problem step by step. You copy along.
4. **Homework**: you solve a similar problem on your own.

Do them in order. Do not jump to the homework.

---

## Part 1: Learn

### Why do we need any of this?

Your app runs on a server you cannot see. When a customer says "my sync is broken", you need
answers to three questions:

- **What happened?** Read the logs.
- **How often does it happen?** Look at the metrics.
- **Where did the time go in this one request?** Open the trace.

That is the whole field. People call it "observability". It just means: can you see what
your app is doing from the outside?

### The three kinds of data

| Kind | What it is | Example | Where it is stored |
|---|---|---|---|
| Log | A line of text the app prints | `No email provided for contact c123` | Loki |
| Metric | A number that changes over time | `errors per minute = 12` | Prometheus |
| Trace | One request's journey, split into timed steps | `refresh p14 took 1.6 s: 1.5 s was the CRM call` | Tempo |

A trace is made of **spans**. A span is one timed step, like "GET /contacts/c141 took
40 ms". Spans have parents, so you can see what called what.

### The middleman: Alloy

The app does not send data straight to Loki, Prometheus or Tempo. It sends everything to
**Alloy**. Alloy is a "collector": a program that receives data, cleans it up, and forwards
it to the right store.

Think of a post office. The app drops all its letters at one post office. The post office
sorts them and sends each one to the right house.

Why? The app only needs **one address**. If the company moves from local Loki to Grafana
Cloud, you change Alloy's config. You do not touch the app.

### Inside Alloy: pipelines and stages

Alloy has **three pipelines**, one per kind of data: logs, traces, metrics.

Each pipeline has **three stages**:

1. **Receiver**: the door where data comes in.
2. **Processor**: optional work on the data, like grouping it into batches.
3. **Exporter**: the door where data goes out to a store.

Do not mix these up. Pipelines are the "what" (logs, traces, metrics). Stages are the "how"
(in, work, out).

### Grafana

Grafana is **the window**. It stores nothing. It asks Loki, Prometheus and Tempo for data and
draws it on screen.

### The ports you will see

| Port | Who listens | What arrives |
|---|---|---|
| 4317 | Alloy | Traces and metrics, in OTLP over gRPC (a fast binary format) |
| 4318 | Alloy | The same, in OTLP over plain HTTP |
| 4319 | Alloy | Logs, in Loki's push format |
| 3300 | Grafana | You, in the browser |
| 12345 | Alloy UI | You, in the browser |

OTLP means "OpenTelemetry Protocol". OpenTelemetry is the open standard most tools use to
describe logs, metrics and traces.

---

## Part 2: Tour

Start the stack first: `docker compose up -d`. Do not start the app yet.

### Stop 1: the Alloy config

Open `telemetry/alloy/config.alloy`. Read it with this guide next to you.

- `otelcol.receiver.otlp "default"` is a **receiver**. It listens on 4317 (gRPC) and 4318
  (HTTP). Look at its `output` block. Metrics go one way, traces go three ways.
- `loki.source.api "default"` is the **log receiver** on 4319. It forwards straight to
  `loki.write`. There is no processor in the log pipeline.
- `otelcol.processor.deltatocumulative` is a **processor** for metrics. Ignore why for now.
  Level 4 explains it.
- `otelcol.processor.batch` is a **processor**. It groups data into batches so Alloy sends
  fewer, bigger requests.
- `otelcol.connector.spanmetrics` and `servicegraph` are **connectors**. A connector reads one
  kind of data and makes another kind. These two read traces and make metrics. Level 5.
- `otelcol.exporter.*`, `prometheus.remote_write` and `loki.write` are **exporters**. They are
  the doors out.

Trick for reading any Alloy file: find a block, read its `output` or `forward_to`, then jump
to the block it names. Keep going until you hit an exporter. That is one pipeline.

### Stop 2: the Alloy UI

Open http://localhost:12345. You see one box per block from the config file, with arrows
between them. This is the same pipeline, drawn for you.

Click `loki.source.api.default`. You see its settings and its health. Green means it started
fine. It does not mean data is flowing. Nothing is flowing yet.

### Stop 3: Grafana Explore

Open http://localhost:3300, then click **Explore** in the left menu.

At the top is a data source picker. Switch between the three:

- **Loki**: the query box speaks **LogQL**.
- **Prometheus**: the query box speaks **PromQL**.
- **Tempo**: the query box speaks **TraceQL**.

Every one of them is empty right now. That is expected. Nobody has sent anything.

---

## Part 3: Worked example: send data by hand

The app sends nothing yet. So let us play the app ourselves, with `curl`. This shows you that
there is no magic. Telemetry is just HTTP requests with JSON in them.

### Example A: one log line

Loki's push format is a list of "streams". A stream is a set of labels plus some lines.
Each line is a pair: a timestamp in nanoseconds, and the text.

```sh
NOW=$(date +%s)000000000

curl -s -X POST http://localhost:4319/loki/api/v1/push \
  -H 'content-type: application/json' \
  -d '{
    "streams": [{
      "stream": { "service_name": "curl-demo", "env": "local" },
      "values": [["'"$NOW"'", "hello from curl, order=42 status=paid"]]
    }]
  }'
```

No output means success. Now find it:

1. Grafana, Explore, data source **Loki**.
2. Switch the query box from "Builder" to "Code".
3. Type `{service_name="curl-demo"}` and press Run query.

You see your line. Read what you just did:

- The part in `{ }` picks streams by **label**. Labels are the index. They make the search
  fast.
- The text inside the line is not indexed. Loki reads it when you search.

Now filter on the text: `{service_name="curl-demo"} |= "order=42"`. The `|=` means "line
contains".

What path did the line take? curl → Alloy port 4319 (`loki.source.api`) → `loki.write` →
Loki → Grafana asked Loki → your screen.

### Example B: one trace with two spans

A trace needs a trace id (32 hex characters) and each span needs a span id (16 hex
characters). The child span names its parent with `parentSpanId`.

```sh
START=$(date +%s)000000000
MID=$(( $(date +%s) ))500000000
END=$(( $(date +%s) + 1 ))000000000

curl -s -X POST http://localhost:4318/v1/traces \
  -H 'content-type: application/json' \
  -d '{
    "resourceSpans": [{
      "resource": { "attributes": [{ "key": "service.name", "value": { "stringValue": "curl-demo" } }] },
      "scopeSpans": [{
        "spans": [
          {
            "traceId": "5b8efff798038103d269b633813fc60c",
            "spanId": "eee19b7ec3c1b174",
            "name": "make pizza",
            "kind": 1,
            "startTimeUnixNano": "'"$START"'",
            "endTimeUnixNano": "'"$END"'"
          },
          {
            "traceId": "5b8efff798038103d269b633813fc60c",
            "spanId": "eee19b7ec3c1b175",
            "parentSpanId": "eee19b7ec3c1b174",
            "name": "bake",
            "kind": 1,
            "startTimeUnixNano": "'"$MID"'",
            "endTimeUnixNano": "'"$END"'"
          }
        ]
      }]
    }]
  }'
```

This one goes to port **4318**, the OTLP HTTP door. Your app will use 4317, the gRPC door. Same
data, different packing.

Now find it:

1. Explore, data source **Tempo**.
2. Pick the "TraceQL" tab and type `{ resource.service.name = "curl-demo" }`. Run it.
3. Click the trace. You see "make pizza" with "bake" nested under it, and how long each took.

It can take 10 to 20 seconds to show up. Tempo writes in small batches.

What path did it take? curl → Alloy 4318 (`otelcol.receiver.otlp`) → `batch` → `otelcol.exporter.otlp "tempo"` → Tempo.

Bonus: open Explore, **Prometheus**, and type `traces_spanmetrics_calls_total`. You get
numbers, and you never sent a metric. The `spanmetrics` connector made them from your two
spans. Keep that in mind for Level 5.

### What you just learned by doing

- Telemetry is plain requests. The app libraries you will use in later levels just build these
  requests for you.
- You can trace any data from the sender to the screen by following the Alloy config.
- Labels are how you find things fast.

---

## Part 4: Homework

Do these on your own. Answers to the self-check are at the bottom. Do not peek until you have
written yours.

1. **Send your own log.** Use the curl from Example A, but send three lines with a label
   `service_name="homework"` and a second label `team="you"`. In Grafana, write one LogQL query
   that returns only the line that contains the word `error`.
2. **Send a trace with three levels.** Change Example B so it has a grandparent, a parent and
   a child span. Make the child the slowest. Find it in Tempo and check the nesting is right.
3. **Draw the three pipelines** on paper, from the config file. For each one, write the
   receiver, every processor, and the exporter. Mark the two connectors.
4. **Find the listeners** in the Alloy UI: the one on 4317 and the one on 4319. Write their
   full names.
5. **Write the four sentences** in `docs/journal.md` (copy `docs/journal.example.md` first):
   - What Loki stores.
   - What Prometheus stores.
   - What Tempo stores.
   - Why the app talks to Alloy instead of to the stores.

### You pass Level 0 when

- Your homework log and your three-level trace show up in Grafana.
- Your drawing names all three pipelines and the stages inside each.
- Your four sentences are in the journal.

### Self-check

<details>
<summary>1. Alloy has three pipelines. What are they?</summary>

Logs, traces, metrics. Receiver, processor and exporter are the stages inside each pipeline,
not pipelines.
</details>

<details>
<summary>2. Which pipeline has no processor?</summary>

Logs. `loki.source.api` forwards straight to `loki.write`.
</details>

<details>
<summary>3. Why the app talks to Alloy, in one sentence</summary>

The app only knows Alloy's address, so you can change where the data is stored, or how it is
batched and converted, without changing the app.
</details>

<details>
<summary>4. You sent no metric, but Prometheus has `traces_spanmetrics_calls_total`. Why?</summary>

The `spanmetrics` connector in Alloy reads every span and counts them. It turns traces into
metrics.
</details>

### Mirrors in Sunvoy

Sunvoy's app only knows two addresses: `ALLOY_GRPC_URL` and `ALLOY_LOGS_URL`. Alloy forwards
to Grafana Cloud. Swap the backend and the app does not change.
