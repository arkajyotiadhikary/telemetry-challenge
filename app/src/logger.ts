// Level 1: replace this with a winston logger that
//   - prints readable lines locally,
//   - ships JSON lines to Alloy at http://localhost:4319 (winston-loki) with labels
//     service_name, env, hostname,
//   - merges the current log context (see log-context.ts) into every line,
//   - stamps trace_id and span_id from the active OpenTelemetry span (level 3).
//
// Until then, this is a plain console logger so the app runs on day one.

type Meta = Record<string, unknown>;

function line(level: string, message: string, meta?: Meta) {
    const extra = meta && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    console.log(`${new Date().toISOString()} ${level.padEnd(5)} ${message}${extra}`);
}

export const logger = {
    info: (message: string, meta?: Meta) => line('info', message, meta),
    warn: (message: string, meta?: Meta) => line('warn', message, meta),
    error: (message: string, meta?: Meta) => line('error', message, meta),
    debug: (message: string, meta?: Meta) => line('debug', message, meta),
};
