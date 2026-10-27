// Fire a burst of refreshes at the running app, so dashboards and alerts have data.
//   node src/load.ts            100 requests
//   node src/load.ts 500        500 requests
//   CHAOS=0.5 node src/load.ts  also tell the fake CRM to fail half the calls

const count = Number(process.argv[2] ?? 100);
const providers = ['hubspot', 'zoho', 'scoop'];
const app = process.env.APP_URL ?? 'http://localhost:4000';
const crm = process.env.CRM_URL ?? 'http://localhost:4100';

if (process.env.CHAOS) {
    await fetch(`${crm}/chaos`, { method: 'POST', body: JSON.stringify({ errorRate: Number(process.env.CHAOS) }) });
}

const results: Record<string, number> = {};

for (let i = 0; i < count; i++) {
    const provider = providers[i % providers.length];
    const projectId = `p${Math.floor(Math.random() * 90) + 10}`;
    const response = await fetch(`${app}/refresh/${provider}/${projectId}`, { method: 'POST' });
    const { result } = (await response.json()) as { result: string };

    results[result] = (results[result] ?? 0) + 1;
}

console.log(results);
