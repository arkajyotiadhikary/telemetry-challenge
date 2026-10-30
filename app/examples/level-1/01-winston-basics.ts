// Worked example 1: from console.log to a real logger.
// Run from app/:  node examples/level-1/01-winston-basics.ts
//
// The story: a tiny pizza shop prints what it does. We go from plain text to JSON lines
// with fields, which is what a log store can search.

import winston from 'winston';

console.log('--- step 1: plain console.log ---');
console.log('order 42 paid by ana');

console.log('\n--- step 2: a winston logger with one console transport ---');

// A logger is: a level, a format (how a line looks), and transports (where lines go).
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    transports: [new winston.transports.Console()],
});

logger.info('order paid', { orderId: '42', customer: 'ana', amount: 18.5 });
logger.warn('oven is getting hot', { celsius: 290 });
logger.debug('you will NOT see this line, because the level is info');

console.log('\n--- step 3: a custom format that adds a fixed field to every line ---');

// A winston format is a function that gets the line (called "info") and returns it.
// Whatever you add to info ends up in the JSON.
const addShop = winston.format((info) => {
    info.shop = 'downtown';
    return info;
});

const shopLogger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(addShop(), winston.format.timestamp(), winston.format.json()),
    transports: [new winston.transports.Console()],
});

shopLogger.info('order paid', { orderId: '43' });
shopLogger.info('order delivered', { orderId: '43' });

console.log('\n--- step 4: two transports, two formats ---');

// Each transport can have its own format. Humans read the console. Machines read JSON.
const twoWayLogger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(addShop(), winston.format.timestamp()),
    transports: [
        new winston.transports.Console({
            format: winston.format.printf(({ timestamp, level, message, ...fields }) => `${timestamp} ${level.padEnd(5)} ${message} ${JSON.stringify(fields)}`),
        }),
        new winston.transports.File({ filename: 'examples/level-1/pizza.log', format: winston.format.json() }),
    ],
});

twoWayLogger.info('order paid', { orderId: '44' });

console.log('\nNow open app/examples/level-1/pizza.log. Same line, as JSON.');
