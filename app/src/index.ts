// solar-sync: a tiny service that keeps CRM projects in sync, like a slice of Sunvoy's worker.
//
//   POST /refresh/:provider/:projectId   refresh one project now (like a CRM webhook)
//   GET  /projects                       what is stored
//   GET  /health
//
// A background "queue" also refreshes a random project every second, so the stack
// always has data flowing.

import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { startFakeCrm } from './crm.ts';
import { logger } from './logger.ts';
import { runWithLogContext } from './log-context.ts';
import { ProjectNormalizationResult, refreshProject, storedProjects, type Tenant } from './pipeline.ts';

const PORT = Number(process.env.PORT ?? 4000);
const CRM_PORT = Number(process.env.CRM_PORT ?? 4100);

const tenants: Tenant[] = [
    { id: 'acme-solar', provider: 'hubspot' },
    { id: 'sunny-side', provider: 'zoho' },
    { id: 'pv-squared', provider: 'scoop' },
];

function json(res: http.ServerResponse, status: number, body: unknown) {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
}

// TODO(level 2): the queue handler should open a DETACHED span "normalize project".
// TODO(level 1): every handler runs inside runWithLogContext({ requestId, app, provider, project }).
async function handleRefresh(tenant: Tenant, projectId: string): Promise<ProjectNormalizationResult> {
    return runWithLogContext({ requestId: randomUUID(), app: tenant.id, provider: tenant.provider, project: projectId }, async () => {
        try {
            return await refreshProject(tenant, projectId);
        } catch (error) {
            logger.error(`Refresh failed for ${tenant.provider} project ${projectId}`, { error: (error as Error).message });

            return ProjectNormalizationResult.UNKNOWN_ERROR;
        }
    });
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);

    if (url.pathname === '/health') {
        return json(res, 200, { ok: true });
    }

    if (url.pathname === '/projects') {
        return json(res, 200, storedProjects());
    }

    const refresh = url.pathname.match(/^\/refresh\/(\w+)\/(\w+)$/);
    if (req.method === 'POST' && refresh) {
        const tenant = tenants.find((t) => t.provider === refresh[1]);

        if (!tenant) {
            return json(res, 400, { error: `unknown provider ${refresh[1]}` });
        }

        const result = await handleRefresh(tenant, refresh[2]!);

        return json(res, result === ProjectNormalizationResult.SUCCESS ? 200 : 422, { result });
    }

    return json(res, 404, { error: 'no route' });
});

startFakeCrm(CRM_PORT);
server.listen(PORT, () => logger.info(`solar-sync listening on :${PORT}, fake CRM on :${CRM_PORT}`));

// The "queue": one random project per second. In Sunvoy this is an SQS message per project.
setInterval(() => {
    const tenant = tenants[Math.floor(Math.random() * tenants.length)]!;
    const projectId = `p${Math.floor(Math.random() * 90) + 10}`;

    void handleRefresh(tenant, projectId);
}, 1000);
