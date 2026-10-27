'use strict';

// Level 2 + 4: the OpenTelemetry bootstrap.
//
// This file is loaded BEFORE the app through NODE_OPTIONS='--require ./telemetry.cjs'
// (see package.json). It has to be CommonJS and it has to run first, because
// auto-instrumentation works by patching modules like node:http at require time.
// Sunvoy does the same with packages/utils/telemetry.cjs.
//
// Build it up:
//   1. Only start when ALLOY_GRPC_URL is set (so plain `node src/index.ts` stays quiet).
//   2. A Resource with service.name (from OTEL_SERVICE_NAME), host.name, instance, pid, env.
//   3. Traces: OTLPTraceExporter over gRPC to ALLOY_GRPC_URL, behind a BatchSpanProcessor.
//   4. Metrics: OTLPMetricExporter with temporalityPreference DELTA, read by a
//      PeriodicExportingMetricReader every 10 s (Sunvoy uses 3 min in production).
//   5. getNodeAutoInstrumentations() with fs disabled and undici/http enabled.
//   6. A view for your duration histogram with explicit buckets.
//   7. sdk.start(); flush on 'beforeExit'.
//
// Until you implement it, this file does nothing and the app runs without telemetry.

const grpcUrl = process.env.ALLOY_GRPC_URL;

if (grpcUrl) {
    // TODO(level 2)
}
