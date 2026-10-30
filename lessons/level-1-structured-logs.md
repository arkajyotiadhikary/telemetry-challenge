# Level 1: Structured logs

Time: about 3 hours. 1 hour to learn and follow the examples, 2 hours of homework.

Before you start: Level 0 is done, and the stack is running (`docker compose up -d`).

---

## Part 1: Learn

### What is wrong with `console.log`?

Run the app (`cd app && pnpm dev`) and look at a line:

```
2026-10-30T10:00:00.000Z warn  No email provided for zoho contact c453
```

A human can read it. A machine cannot easily answer "show me every missing email for tenant
`sunny-side` in the last hour". The tenant is not even in the line. And the line is only on
your screen. When the server restarts, it is gone.

We need three things:

1. **Structure.** Each line is JSON, with fields: `{"level":"warn","message":"No email...","provider":"zoho","project":"p45"}`.
   Now a machine can filter on `provider`.
2. **Context.** Fields like `requestId`, `app` and `project` show up on every line by
   themselves, even ten function calls deep.
3. **Shipping.** Lines also go to Loki, so you can search them later from Grafana.

### Words you need

- **Logger**: the object you call, like `logger.info(...)`.
- **Level**: how serious a line is. From low to high: `debug`, `info`, `warn`, `error`. A
  logger set to `info` drops `debug` lines.
- **Format**: a function that shapes a line before it is written. You can chain several.
- **Transport**: where lines go. Console, a file, Loki. One logger can have many.
- **Label** (Loki): a field Loki **indexes**. Searching by label is fast. Every new label
  value creates a new "stream", and too many streams makes Loki slow and expensive.
- **Field**: anything else in the JSON line. Not indexed. Loki reads it at search time with
  `| json`.

The rule of thumb: **labels for things with few values** (service, env, host). **Fields for
everything else** (tenant, project, request id).

### AsyncLocalStorage in one paragraph

Node runs many requests at the same time on one thread. A global variable would mix them up.
`AsyncLocalStorage` (from `node:async_hooks`) gives each call chain its own private box.
You open the box with `storage.run(value, fn)`. Anything inside `fn`, even after an `await`,
can read it with `storage.getStore()`. When `fn` ends, the box is gone.

---

## Part 2: Tour

### Stop 1: the current logger

Open `app/src/logger.ts`. It is a fake logger made of `console.log`. It has the same shape as
the real one (`logger.info(message, meta)`), so the rest of the app will not change when you
replace it.

### Stop 2: where the app logs

Search the app for `logger.`:

```sh
grep -n "logger\." app/src/*.ts
```

Look at `pipeline.ts`. `normalizeContact` logs "No email provided". It knows the contact id,
but it does not know the request id or the tenant. It would need them passed in. That is the
problem context solves.

### Stop 3: the context file

Open `app/src/log-context.ts`. Two functions, both stubs:

- `runWithLogContext(store, fn)` just calls `fn()`.
- `getLogContext()` always returns `undefined`.

Now open `app/src/index.ts`, function `handleRefresh`. It already calls `runWithLogContext`
with `requestId`, `app`, `provider` and `project`. So the box is already being "opened". It
just does nothing yet.

### Stop 4: the Loki door

In `telemetry/alloy/config.alloy`, find `loki.source.api`. Port 4319. That is where your
logger will send lines. Not Loki's own port 3100.

---

## Part 3: Worked examples

There are three small scripts in `app/examples/level-1/`. They are about a pizza shop, not
about the app. Run each one from the `app/` folder, read the output, then read the code.

### Example 1: winston basics

```sh
node examples/level-1/01-winston-basics.ts
```

What to look for:

- Step 1 vs step 2: same message, but now it is JSON with fields.
- The `debug` line does not appear. The level is `info`.
- Step 3: a **custom format** (`addShop`) adds `shop: "downtown"` to every line. You never
  passed it in. Look at how short the format function is.
- Step 4: **two transports**, each with its own format. Readable for the console, JSON for
  the file. Open `examples/level-1/pizza.log` to see the file side.

### Example 2: AsyncLocalStorage

```sh
node examples/level-1/02-async-local-storage.ts
```

What to look for:

- Step 2: `bake()` prints the `orderId` without getting it as an argument.
- Step 3: two orders run at once. Each sees only its own `orderId`.
- Step 4: outside `run()`, the box is `undefined`. Your code must handle that.
- Step 5: **the trap**. A `run()` inside a `run()` replaces the box. The inner code loses
  `orderId`. Remember this. Your homework must not have this bug.

### Example 3: shipping to Loki

```sh
node examples/level-1/03-ship-to-loki.ts
```

It waits 6 seconds before exiting, because `winston-loki` sends lines in batches.

Then in Grafana, Explore, Loki, Code mode, run these one at a time:

```
{service_name="pizza-demo"}
{service_name="pizza-demo"} | json
{service_name="pizza-demo"} | json | status="burnt"
```

- The first finds the stream by label.
- The second reads the JSON, so each field shows up as a column you can click.
- The third filters on a field that is not a label.

Now break it on purpose:

```sh
docker compose stop alloy
node examples/level-1/03-ship-to-loki.ts
docker compose start alloy
```

The console lines still print. You see `loki transport could not send: ECONNREFUSED`. The
script does not crash. That is the `onConnectionError` option doing its job. **Logging must
never take the app down.**

### What the examples did not do

On purpose, the examples leave out three things. Those are your homework:

- Putting the context (from example 2) into every log line (with a format, like example 1
  step 3).
- Merging nested contexts instead of replacing them.
- Doing all of it inside the real app.

---

## Part 4: Homework

### Task

Build these, in `app/src/logger.ts` and `app/src/log-context.ts`:

1. **`runWithLogContext` and `getLogContext`** with `AsyncLocalStorage`. A nested call must
   **merge**: if the outer store has `{ app }` and the inner call passes `{ project }`, the
   inner code sees `{ app, project }`. Hint: read the current store first.
2. **A winston logger** that keeps the same `logger.info(message, meta)` shape, with two
   transports:
   - Console: a readable line, like example 1 step 4.
   - `winston-loki` to `http://localhost:4319`, with labels `service_name="solar-sync"`, `env`,
     and `hostname`. Nothing else as a label.
3. **A custom format** that copies `getLogContext()` into every line, so `requestId`, `app`,
   `provider` and `project` appear on every line without being passed to the logger.

### You pass Level 1 when

- This query in Grafana returns the "zero valid contacts" lines, and each one has `app` and
  `project` fields:

  ```
  {service_name="solar-sync"} | json | provider="zoho" | level="error"
  ```

- `docker compose stop alloy` does not crash the app. Logs keep printing to the console.
  `docker compose start alloy` and lines reach Loki again.
- You can show nested merge working. Wrap a small piece of code in a second
  `runWithLogContext({ step: 'contacts' }, ...)` and check the line has both `project` and
  `step`. Then remove it.

### Questions for the journal

Answer these in `docs/journal.md`, in your own words.

1. Why are `app` and `project` **fields** and not **labels**? Search for "Loki label
   cardinality". Think about how many projects Sunvoy has.
2. What happens to the context when you call `setTimeout` inside `runWithLogContext`? Do not
   guess. Write a three-line test like example 2 and run it.
3. Why does the logger use `onConnectionError` instead of letting the error throw?

### Self-check

Answer these before you look.

<details>
<summary>1. Your format adds the context, but lines from the startup message have no `app` field. Bug?</summary>

No. The startup line runs outside any `runWithLogContext`, so `getLogContext()` returns
`undefined`. Your format must handle that and add nothing.
</details>

<details>
<summary>2. Why not just put `project` on the logger once, with `logger.child({ project })`?</summary>

A child logger has to be passed down to every function, which is the problem we started
with. The context box follows the call chain by itself.
</details>

<details>
<summary>3. You added `requestId` as a Loki label. What goes wrong?</summary>

Every request makes a new stream. Millions of tiny streams make Loki slow and costly.
`requestId` belongs in the JSON line.
</details>

### Mirrors in Sunvoy

`packages/logger/index.ts`: winston with a `winston-loki` transport, labels `service_name`,
`env`, `hostname`, plus `LogContextStore` and `runWithLogContext`. Same shape as what you just
built.
