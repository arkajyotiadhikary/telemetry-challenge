// Worked example 2: a box that follows one async call chain.
// Run from app/:  node examples/level-1/02-async-local-storage.ts
//
// The problem: bakePizza() is three calls deep. It wants to log the orderId. We do not want to
// pass orderId through every function just so it can be logged.

import { AsyncLocalStorage } from 'node:async_hooks';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

console.log('--- step 1: the painful way, passing orderId everywhere ---');

async function bakeWithArg(orderId: string) {
    await sleep(10);
    console.log(`bake done for order ${orderId}`);
}

async function handleOrderWithArg(orderId: string) {
    await bakeWithArg(orderId);
}

await handleOrderWithArg('42');

console.log('\n--- step 2: AsyncLocalStorage ---');

// Think of it as a box. storage.run(value, fn) puts value in the box for everything fn does,
// including code after an await. storage.getStore() reads the box from anywhere inside.
type OrderStore = { orderId?: string; customer?: string };

const storage = new AsyncLocalStorage<OrderStore>();

async function bake() {
    await sleep(10);
    console.log('bake done', storage.getStore());
}

async function handleOrder() {
    await bake();
}

await storage.run({ orderId: '42' }, handleOrder);

console.log('\n--- step 3: two orders at the same time do not mix ---');

// This is why a plain global variable does not work. Both orders run at once,
// but each one sees only its own box.
await Promise.all([storage.run({ orderId: 'A' }, handleOrder), storage.run({ orderId: 'B' }, handleOrder)]);

console.log('\n--- step 4: outside any run(), the box is empty ---');

console.log('outside:', storage.getStore());

console.log('\n--- step 5: the trap. A nested run() REPLACES the box ---');

await storage.run({ orderId: '42' }, async () => {
    await storage.run({ customer: 'ana' }, async () => {
        console.log('inner sees:', storage.getStore(), '<- orderId is gone!');
    });
});

console.log('\nStep 5 is a bug in real code. Your homework fixes it: nested calls must ADD fields.');
