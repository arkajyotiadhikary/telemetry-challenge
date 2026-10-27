// Level 4: counters and histograms.
//
// Sunvoy's packages/utils/metrics.ts keeps one Meter and caches instruments by name:
//
//   recordCount(name, count, attributes)
//       counter.add(count, { pid, instance, ...attributes }); skip when count <= 0;
//       never throw from here (a metric bug must not break a sync).
//
//   recordDurationHistogram(name, attributes, callback)
//       time the callback and record seconds (or ms, pick one and say which in the name).
//
// Hint: @opentelemetry/api  ->  metrics.getMeter('solar-sync').createCounter(name)
//
// Rules you will be tested on:
//   - metric names have NO _total suffix in code; the exporter adds it.
//   - labels must have a bounded number of values. provider, appId, status: yes. projectId: NO.

export function recordCount(_name: string, _count: number, _attributes: Record<string, unknown>): void {
    // TODO(level 4)
}

export async function recordDurationHistogram<T>(
    _name: string,
    _attributes: Record<string, unknown>,
    callback: () => Promise<T>,
): Promise<T> {
    // TODO(level 4)
    return callback();
}
