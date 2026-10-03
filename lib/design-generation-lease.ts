import { DESIGN_GENERATION_CEILING_MS } from './model-stages';

/**
 * Who is writing the solution design of a project right now, so that opening
 * Design never pays for it twice (owner decision 03.10.2026, ADR-070
 * amendment: the stage writes the design when it is opened).
 *
 * Two holders, for the two ways a second start can happen:
 *
 *   - **this page** — a module-level map from project to the generation in
 *     flight. React's StrictMode runs an effect twice, and leaving Design and
 *     coming back mounts the page anew while the first generation is still
 *     running; both find the generation here and wait for it instead of
 *     starting their own.
 *   - **another tab of this browser** — a lease in `localStorage` with the time
 *     it was taken. It ends when the generation ends, or by itself after the
 *     ceiling and a margin, so a tab that was closed mid-call does not hold the
 *     stage shut.
 *
 * Neither is a lock on the project: two browsers can still both start. The
 * write itself is the last guard — the page re-reads the project before the
 * model call and, in the transaction, keeps a design another writer saved in
 * the meantime instead of writing over it.
 */

const inFlight = new Map<string, Promise<void>>();

/** The generation of this project already running in this page, if any. */
export function designInFlight(projectId: string): Promise<void> | null {
  return inFlight.get(projectId) ?? null;
}

/** Registers a generation; it is removed when it settles. */
export function trackDesignGeneration(projectId: string, run: Promise<void>): Promise<void> {
  const tracked = run.finally(() => {
    if (inFlight.get(projectId) === tracked) inFlight.delete(projectId);
  });
  inFlight.set(projectId, tracked);
  return tracked;
}

/** The lease key, one per project. Exported for the `storage` listener. */
export function designLeaseKey(projectId: string): string {
  return `cc-design-writing-${projectId}`;
}

/** Long enough for the slowest generation, short enough that a closed tab does not block the next day. */
const LEASE_MS = DESIGN_GENERATION_CEILING_MS + 15_000;

interface Lease {
  tab: string;
  at: number;
}

function readLease(projectId: string): Lease | null {
  try {
    const raw = window.localStorage.getItem(designLeaseKey(projectId));
    if (!raw) return null;
    const lease = JSON.parse(raw) as Partial<Lease>;
    if (typeof lease.tab !== 'string' || typeof lease.at !== 'number') return null;
    return Date.now() - lease.at < LEASE_MS ? (lease as Lease) : null;
  } catch {
    return null;
  }
}

/** Another tab's live lease on this project, with the time it was taken. */
export function otherTabWriting(projectId: string, tab: string): { since: number } | null {
  const lease = readLease(projectId);
  return lease && lease.tab !== tab ? { since: lease.at } : null;
}

/** Takes the lease; `false` when another tab holds a live one. A browser without storage always gets it. */
export function claimDesignLease(projectId: string, tab: string): boolean {
  if (otherTabWriting(projectId, tab)) return false;
  try {
    window.localStorage.setItem(designLeaseKey(projectId), JSON.stringify({ tab, at: Date.now() }));
  } catch {
    /* a private window keeps no lease; the page's own guard still holds */
  }
  return true;
}

/** Gives the lease back, only if it is this tab's. */
export function releaseDesignLease(projectId: string, tab: string): void {
  try {
    const lease = readLease(projectId);
    if (!lease || lease.tab === tab) window.localStorage.removeItem(designLeaseKey(projectId));
  } catch {
    /* nothing to release */
  }
}
