// A fake CRM. It behaves badly on purpose so you have something to observe.
//
//   GET /projects/:id            -> a project with contact ids
//   GET /contacts/:id            -> a contact, sometimes without an email
//
// Failure modes (deterministic, based on the id, so you can reproduce them):
//   id ends with 7  -> 404 project not found
//   id ends with 9  -> 500 CRM is down
//   id ends with 4  -> slow (1.5 s)
//   contact id ends with 3 -> no email
//
// You can also break everything at once: POST /chaos { "errorRate": 0.5 }

import http from 'node:http';

export type RawProject = {
    id: string;
    name: string;
    stage: string;
    owner: { id: string } | null;
    contactIds: string[];
};

export type RawContact = {
    id: string;
    firstName: string;
    lastName: string;
    email?: string;
};

let chaosErrorRate = 0;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function json(res: http.ServerResponse, status: number, body: unknown) {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
}

export function startFakeCrm(port: number) {
    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url ?? '/', `http://${req.headers.host}`);

        if (req.method === 'POST' && url.pathname === '/chaos') {
            let raw = '';
            for await (const chunk of req) raw += chunk;
            chaosErrorRate = Number(JSON.parse(raw || '{}').errorRate ?? 0);
            return json(res, 200, { chaosErrorRate });
        }

        if (Math.random() < chaosErrorRate) {
            return json(res, 500, { error: 'chaos' });
        }

        const project = url.pathname.match(/^\/projects\/(\w+)$/);
        if (project) {
            const id = project[1]!;
            if (id.endsWith('7')) return json(res, 404, { error: 'not found' });
            if (id.endsWith('9')) return json(res, 500, { error: 'crm down' });
            if (id.endsWith('4')) await sleep(1500);

            const body: RawProject = {
                id,
                name: `Project ${id}`,
                stage: ['lead', 'design', 'install', 'done'][Number(id.at(-1)) % 4]!,
                owner: id.endsWith('5') ? null : { id: `owner-${id.at(-2)}` },
                contactIds: [`c${id}1`, `c${id}3`],
            };
            return json(res, 200, body);
        }

        const contact = url.pathname.match(/^\/contacts\/(\w+)$/);
        if (contact) {
            const id = contact[1]!;
            const body: RawContact = {
                id,
                firstName: 'Sun',
                lastName: `Voy ${id}`,
                ...(id.endsWith('3') ? {} : { email: `${id}@example.com` }),
            };
            return json(res, 200, body);
        }

        return json(res, 404, { error: 'no route' });
    });

    server.listen(port);
    return server;
}
