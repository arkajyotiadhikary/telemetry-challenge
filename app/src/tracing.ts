// Level 2: custom spans on top of the auto-instrumentation.
//
// Sunvoy's packages/utils/tracing.ts exposes a small set of helpers. Rebuild them:
//
//   addTracingSpan(name, attributes, callback)
//       start a child span under the active one, run callback(span), end the span,
//       mark it as an error (SpanStatusCode.ERROR + recordException) if callback throws.
//
//   addDetachedTracingSpan(name, attributes, callback)
//       same, but start a NEW trace (ROOT_CONTEXT). A queue job is a new story, it must
//       not hang under whatever the consumer loop was doing.
//
//   traceAttributes(attributes)   -> add attributes to the active span
//   getActiveTraceId()            -> trace id of the active span, for log lines (level 3)
//
// Hint: @opentelemetry/api  ->  trace.getTracer('solar-sync'), context.with, trace.setSpan.
// The stubs below keep the app running until you implement them.

import type { Attributes, Span } from '@opentelemetry/api';

export type TracingCallback<T> = (span: Span) => Promise<T>;

export async function addTracingSpan<T>(_name: string, _attributes: Attributes, callback: TracingCallback<T>): Promise<T> {
    // TODO(level 2)
    return callback(undefined as unknown as Span);
}

export async function addDetachedTracingSpan<T>(
    _name: string,
    _attributes: Attributes,
    callback: TracingCallback<T>,
): Promise<T> {
    // TODO(level 2)
    return callback(undefined as unknown as Span);
}

export function traceAttributes(_attributes: Attributes): void {
    // TODO(level 2)
}

export function getActiveTraceId(): string | undefined {
    // TODO(level 3)
    return undefined;
}
