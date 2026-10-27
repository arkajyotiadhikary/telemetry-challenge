// The "normalization pipeline". This is a small copy of what Sunvoy does when a CRM
// project changes: fetch it, run formulas over it, fetch its contacts, save it.
//
// Every TODO(level N) marks a spot the challenge asks you to instrument.
// The business logic itself should not change.

import { logger } from './logger.ts';
import type { RawContact, RawProject } from './crm.ts';

// A const object instead of an enum: Node runs .ts files by stripping types only,
// and an enum is real runtime code, so it would not start.
export const ProjectNormalizationResult = {
    SUCCESS: 'SUCCESS',
    UNKNOWN_ERROR: 'UNKNOWN_ERROR',
    NO_CONTACTS: 'NO_CONTACTS',
    FILTERED_OUT: 'FILTERED_OUT',
    PROJECT_NOT_FOUND: 'PROJECT_NOT_FOUND',
} as const;

export type ProjectNormalizationResult = (typeof ProjectNormalizationResult)[keyof typeof ProjectNormalizationResult];

export type Tenant = { id: string; provider: 'hubspot' | 'zoho' | 'scoop' };

export type NormalizedContact = { contactId: string; email: string; name: string };

export type NormalizedProject = {
    projectId: string;
    provider: Tenant['provider'];
    name: string;
    stage: string;
    ownerId?: string;
    contacts: NormalizedContact[];
};

const CRM_URL = process.env.CRM_URL ?? 'http://localhost:4100';

const store = new Map<string, NormalizedProject>();

async function crmGet<T>(path: string): Promise<T | undefined> {
    const response = await fetch(`${CRM_URL}${path}`);

    if (response.status === 404) {
        return undefined;
    }

    if (!response.ok) {
        throw new Error(`CRM responded ${response.status} for ${path}`);
    }

    return (await response.json()) as T;
}

// A pretend formula engine. Real formulas walk relations like project -> owner -> email.
// When a relation is null we hit a "traversal dead end", same words Sunvoy uses.
function evaluateFormula(raw: RawProject, path: string): unknown {
    let value: any = raw;

    for (const key of path.split('.')) {
        if (value == null) {
            // TODO(level 4): report a traversal dead end to the caller (callback), not a metric here.
            logger.error(`Trying to traverse into nullish key ${key} @ ${path}`);

            return undefined;
        }

        value = value[key];
    }

    return value;
}

function shouldProcess(raw: RawProject): boolean {
    return raw.stage !== 'lead';
}

async function normalizeContact(tenant: Tenant, contactId: string): Promise<NormalizedContact | undefined> {
    const raw = await crmGet<RawContact>(`/contacts/${contactId}`);

    if (!raw) {
        return undefined;
    }

    if (!raw.email) {
        // TODO(level 4): count crm_contact_normalization{status="MISSING_EMAIL"}
        logger.warn(`No email provided for ${tenant.provider} contact ${contactId}`);

        return undefined;
    }

    // TODO(level 4): count crm_contact_normalization{status="SUCCESS"}
    return { contactId, email: raw.email, name: `${raw.firstName} ${raw.lastName}` };
}

export async function refreshProject(tenant: Tenant, projectId: string): Promise<ProjectNormalizationResult> {
    // TODO(level 2): wrap this in a span "normalize project" with attributes
    //   solar.provider, solar.project.id, solar.app.id
    // TODO(level 8): record the outcome exactly once per refresh, even when callers nest.

    const raw = await crmGet<RawProject>(`/projects/${projectId}`);

    if (!raw) {
        logger.error(`No ${tenant.provider} project ${projectId} in app ${tenant.id} found`);

        return ProjectNormalizationResult.PROJECT_NOT_FOUND;
    }

    if (!shouldProcess(raw)) {
        return ProjectNormalizationResult.FILTERED_OUT;
    }

    const ownerId = evaluateFormula(raw, 'owner.id') as string | undefined;

    const contacts: NormalizedContact[] = [];

    for (const contactId of raw.contactIds) {
        const contact = await normalizeContact(tenant, contactId);

        if (contact) {
            contacts.push(contact);
        }
    }

    if (contacts.length === 0) {
        logger.error(`Trying to push normalized project with zero valid contacts: app=${tenant.id}, projectId=${projectId}`);

        return ProjectNormalizationResult.NO_CONTACTS;
    }

    store.set(`${tenant.id}:${projectId}`, {
        projectId,
        provider: tenant.provider,
        name: raw.name,
        stage: raw.stage,
        ownerId,
        contacts,
    });

    logger.info(`Saved project ${projectId} with ${contacts.length} contacts`);

    return ProjectNormalizationResult.SUCCESS;
}

export function storedProjects(): NormalizedProject[] {
    return [...store.values()];
}
