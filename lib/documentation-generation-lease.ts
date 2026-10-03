/**
 * Who is writing the business layer of a project right now, so that opening
 * Documentation never pays for it twice (owner 03.10.2026: the stage writes
 * on opening, analogous to Design).
 *
 * Two holders, for the two ways a second start can happen:
 *
 *   - **this page** — a module-level map from project to the generation in
 *     flight. React's StrictMode runs an effect twice, and leaving the stage
 *     and coming back mounts the page anew while the first call still runs;
 *     both find the generation here and do not start their own.
 *   - **another tab of this browser** — a lease in `localStorage` with the time
 *     it was taken. It ends when the generation ends, or by itself after the
 *     ceiling and a margin, so a closed tab does not hold the stage shut.
 *
 * Neither locks the project: two browsers can still both start. The write is
 * the last guard — the transaction keeps a layer another writer stored in the
 * meantime and refuses one written for another documentation.
 */

/** How long the stage waits for the business layer it writes on opening, in ms. Below the service's 120 s request timeout. */
export const BUSINESS_LAYER_CEILING_MS = 90_000;

const inFlight = new Map<string, Promise<void>>();

export function businessLayerInFlight(projectId: string): Promise<void> | null {
  return inFlight.get(projectId) ?? null;
}

export function trackBusinessLayer(projectId: string, run: Promise<void>): Promise<void> {
  const tracked = run.finally(() => {
    if (inFlight.get(projectId) === tracked) inFlight.delete(projectId);
  });
  inFlight.set(projectId, tracked);
  return tracked;
}

export function businessLayerLeaseKey(projectId: string): string {
  return `cc-business-layer-writing-${projectId}`;
}

const LEASE_MS = BUSINESS_LAYER_CEILING_MS + 15_000;

interface Lease {
  tab: string;
  at: number;
}

function readLease(projectId: string): Lease | null {
  try {
    const raw = window.localStorage.getItem(businessLayerLeaseKey(projectId));
    if (!raw) return null;
    const lease = JSON.parse(raw) as Partial<Lease>;
    if (typeof lease.tab !== 'string' || typeof lease.at !== 'number') return null;
    return Date.now() - lease.at < LEASE_MS ? (lease as Lease) : null;
  } catch {
    return null;
  }
}

/** Another tab's live lease on this project. */
export function otherTabWritingBusinessLayer(projectId: string, tab: string): { since: number } | null {
  const lease = readLease(projectId);
  return lease && lease.tab !== tab ? { since: lease.at } : null;
}

/** Takes the lease; `false` when another tab holds a live one. A browser without storage always gets it. */
export function claimBusinessLayerLease(projectId: string, tab: string): boolean {
  if (otherTabWritingBusinessLayer(projectId, tab)) return false;
  try {
    window.localStorage.setItem(businessLayerLeaseKey(projectId), JSON.stringify({ tab, at: Date.now() }));
  } catch {
    /* a private window keeps no lease; the page's own guard still holds */
  }
  return true;
}

export function releaseBusinessLayerLease(projectId: string, tab: string): void {
  try {
    const lease = readLease(projectId);
    if (!lease || lease.tab === tab) window.localStorage.removeItem(businessLayerLeaseKey(projectId));
  } catch {
    /* nothing to release */
  }
}
