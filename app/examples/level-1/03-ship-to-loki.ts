// Worked example 3: send winston lines to Loki through Alloy.
// Needs the stack: docker compose up -d
// Run from app/:  node examples/level-1/03-ship-to-loki.ts
//
// Then in Grafana, Explore, Loki:  {service_name="pizza-demo"} | json

import winston from 'winston';
import LokiTransport from 'winston-loki';

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    transports: [
        new winston.transports.Console(),
        new LokiTransport({
            // Alloy's log door, not Loki itself. Loki is at 3100, but the app never talks to it.
            host: 'http://localhost:4319',
            // Labels: a SMALL set of values that pick a stream. Few values, never ids.
            labels: { service_name: 'pizza-demo', env: 'local' },
            // Send the whole line as JSON, so `| json` in LogQL can read the fields.
            json: true,
            format: winston.format.json(),
            // If Alloy is down, print the error and keep going. Logging must never crash the app.
            onConnectionError: (error: unknown) => console.error('loki transport could not send:', (error as { code?: string }).code ?? String(error)),
        }),
    ],
});

for (const [orderId, customer, status] of [
    ['42', 'ana', 'paid'],
    ['43', 'bo', 'paid'],
    ['44', 'cy', 'burnt'],
]) {
    const level = status === 'burnt' ? 'error' : 'info';
    logger.log(level, `order ${status}`, { orderId, customer, status });
}

// winston-loki sends in batches every few seconds. Wait so the batch goes out before we exit.
await new Promise((resolve) => setTimeout(resolve, 6000));

console.log('\nSent. Try these in Grafana, Explore, Loki:');
console.log('  {service_name="pizza-demo"}');
console.log('  {service_name="pizza-demo"} | json');
console.log('  {service_name="pizza-demo"} | json | status="burnt"');
