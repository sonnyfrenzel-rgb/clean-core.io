/**
 * The key-user acceptance checks as run in the reader's own system — what is
 * on record, and when it counts (roadmap 3.0.19, owner decision 19.10.2026).
 *
 * When the decision is key user, Transformation generates no code and Testing
 * writes no test code: the steps of the engine's key-user step list become
 * acceptance checks a key user runs in the system once they are configured
 * (`lib/key-user-steps.ts`). Nothing here runs them. The account records that
 * it did — "run in my system", per check or all of them — the way the ABAP
 * Unit class's result is confirmed on the ABAP Cloud route
 * (`lib/sap-test-results.ts`, ADR-075): a **self-declaration of the signed-in
 * account**, provenance *Confirmed*, never *Proven*.
 *
 * **Where it lives.** `POST /api/projects/{id}/key-user-checks` rebuilds the
 * step list on the server from the signed source and the signed run's engine
 * (`buildProjectEvidence`), checks the ids against it, and writes the summary
 * below onto the project document as `keyUserAcceptance` — a key the client
 * allowlist of `firestore.rules` does not contain (like `outsideTestResult`),
 * written through the Admin SDK only, so no rules change. Every view reads it
 * through `workflowSteps`. Nothing of it reaches a signed run or the audit pack.
 *
 * **When it is current.** The record binds the active run, the source it was
 * given for and the step list's checks (`listDigest`). A record for another
 * run, another source or another step list counts for nothing: a reader that
 * holds the list compares its digest (`keyUserAcceptanceReading`).
 *
 * Pure: no React, no Firestore.
 */

import { sha256Hex } from './artefact-digest';
import type { KeyUserStepList } from './key-user-steps';
import { validateConfirmation } from './sap-test-results';

export const KEY_USER_ACCEPTANCE_VERSION = 1;

export interface KeyUserAcceptanceSubject {
  runId: string | null;
  /** SHA-256 of the source the step list was built from — the signed run's input fingerprint. */
  sourceSha256: string | null;
}

/** What the project document carries as `keyUserAcceptance`. */
export interface KeyUserAcceptanceSummary {
  v: number;
  kind: 'confirmed';
  subject: KeyUserAcceptanceSubject;
  /** SHA-256 over the step list's checks (id, given, when, then) when it was recorded. */
  listDigest: string;
  /** Every check id of the step list when it was recorded. */
  total: number;
  /** The check ids the account recorded as run in its system, in the list's order. */
  checkIds: string[];
  /** Server clock, ISO 8601. */
  recordedAt: string;
  /** The account that recorded it, from the verified token. */
  recordedBy: string;
  /** The system as the account named it, bounded. */
  system: string;
  /** The date of the run, `YYYY-MM-DD`. */
  ranOn: string;
  note: string | null;
}

/** Every acceptance check of the list, in its order. */
export function keyUserCheckIds(list: Pick<KeyUserStepList, 'steps'>): string[] {
  return list.steps.flatMap((s) => s.checks.map((c) => c.id));
}

/** What a record binds of the step list: its checks as a key user reads them. */
export function keyUserListDigest(list: Pick<KeyUserStepList, 'steps'>): string {
  return sha256Hex(JSON.stringify(list.steps.flatMap((s) => s.checks.map((c) => [c.id, c.given, c.when, c.then]))));
}

type ProjectLike = {
  activeRunId?: unknown;
  keyUserAcceptance?: unknown;
  inputFingerprint?: unknown;
  auditMetadata?: unknown;
} | null | undefined;

/** The source fingerprint the signed run recorded, or null. */
export function signedSourceShaOf(project: ProjectLike): string | null {
  const top = (project?.inputFingerprint as { sha256?: unknown } | undefined)?.sha256;
  if (typeof top === 'string' && top) return top;
  const run = (project?.auditMetadata as { inputFingerprint?: { sha256?: unknown } } | undefined)?.inputFingerprint?.sha256;
  return typeof run === 'string' && run ? run : null;
}

const isStr = (v: unknown): v is string => typeof v === 'string';

/** Shape check of a stored summary. Server-written, read defensively all the same. */
export function isKeyUserAcceptanceSummary(value: unknown): value is KeyUserAcceptanceSummary {
  if (!value || typeof value !== 'object') return false;
  const s = value as Record<string, unknown>;
  if (s.v !== KEY_USER_ACCEPTANCE_VERSION || s.kind !== 'confirmed') return false;
  const subject = s.subject as Record<string, unknown> | null;
  if (!subject || typeof subject !== 'object') return false;
  if (!(subject.runId === null || isStr(subject.runId)) || !(subject.sourceSha256 === null || isStr(subject.sourceSha256))) return false;
  if (!isStr(s.listDigest) || !isStr(s.recordedAt) || !isStr(s.recordedBy) || !isStr(s.system) || !isStr(s.ranOn)) return false;
  if (typeof s.total !== 'number' || !Number.isInteger(s.total) || s.total < 0) return false;
  if (!Array.isArray(s.checkIds) || !s.checkIds.every(isStr)) return false;
  return s.note === null || isStr(s.note);
}

export type KeyUserAcceptanceReading =
  | { state: 'none' }
  /** On record for another run or another source (`because: 'run'`), or for another step list (`because: 'list'`). */
  | { state: 'earlier'; summary: KeyUserAcceptanceSummary; because: 'run' | 'list' }
  /** `complete`: every check of the list is recorded as run. */
  | { state: 'current'; summary: KeyUserAcceptanceSummary; complete: boolean };

/**
 * The record as it stands for this project. With `list` — the step list as it
 * is built now — the record counts only for the checks it was given for
 * (`listDigest`), and `complete` is read against that list (SEC-2026-899).
 * Without one it is read off the project document alone; every screen that
 * holds the list passes it.
 */
export function keyUserAcceptanceReading(
  project: ProjectLike,
  list?: Pick<KeyUserStepList, 'steps'> | null,
): KeyUserAcceptanceReading {
  const stored = project?.keyUserAcceptance;
  if (!isKeyUserAcceptanceSummary(stored)) return { state: 'none' };
  const runId = typeof project?.activeRunId === 'string' ? project.activeRunId : null;
  if (!runId || stored.subject.runId !== runId || stored.subject.sourceSha256 !== signedSourceShaOf(project)) {
    return { state: 'earlier', summary: stored, because: 'run' };
  }
  if (list) {
    if (keyUserListDigest(list) !== stored.listDigest) return { state: 'earlier', summary: stored, because: 'list' };
    const ids = keyUserCheckIds(list);
    const recorded = new Set(stored.checkIds);
    return { state: 'current', summary: stored, complete: ids.length > 0 && ids.every((id) => recorded.has(id)) };
  }
  return { state: 'current', summary: stored, complete: stored.total > 0 && stored.checkIds.length >= stored.total };
}

/** "5 of 9 acceptance checks recorded as run in your system" — counts only. */
export function keyUserAcceptanceLine(s: Pick<KeyUserAcceptanceSummary, 'checkIds' | 'total'>): string {
  return `${s.checkIds.length} of ${s.total} acceptance ${s.total === 1 ? 'check' : 'checks'} recorded as run in your system`;
}

export interface KeyUserConfirmationInput {
  /** The check ids to record, in the list's order; every id of the list for `all`. */
  checkIds: string[];
  system: string;
  ranOn: string;
  note: string | null;
}

/**
 * The confirmation as the route accepts it, or why not. `checks` is `'all'` or
 * a list of check ids of the step list (`available`); the system, the date and
 * the note follow the ABAP Unit confirmation's rules exactly
 * (`validateConfirmation`): a named system, a date that is not in the future,
 * a bounded note.
 */
export function validateKeyUserConfirmation(
  body: Record<string, unknown>,
  available: readonly string[],
  now: Date,
): { ok: true; value: KeyUserConfirmationInput } | { ok: false; error: string } {
  let ids: string[];
  if (body.checks === 'all') ids = [...available];
  else if (Array.isArray(body.checks) && body.checks.length > 0 && body.checks.length <= available.length && body.checks.every(isStr)) {
    const unknown = body.checks.filter((id) => !available.includes(id));
    if (unknown.length > 0) return { ok: false, error: `Not a check of the key-user step list: ${unknown.slice(0, 5).join(', ')}.` };
    const asked = new Set(body.checks);
    ids = available.filter((id) => asked.has(id));
  } else return { ok: false, error: "Name the checks you ran — 'all', or a list of their ids (S1.1, S2.1 …)." };
  if (ids.length === 0) return { ok: false, error: 'The key-user step list holds no acceptance check to record.' };
  // The system, the date and the note: the ABAP Unit confirmation's own checks, word for word.
  const rest = validateConfirmation({ passed: 1, failed: 0, system: body.system, ranOn: body.ranOn, note: body.note }, now);
  if (!rest.ok) return { ok: false, error: rest.error.replace('the class ran in', 'the checks ran in') };
  return { ok: true, value: { checkIds: ids, system: rest.value.system, ranOn: rest.value.ranOn, note: rest.value.note } };
}

/**
 * The summary to store: the checks recorded now, together with those recorded
 * before for the same run, source and list — per check, one after the other,
 * adds up; a record for anything else is replaced.
 */
export function mergeKeyUserAcceptance(
  previous: unknown,
  next: Omit<KeyUserAcceptanceSummary, 'v' | 'kind'>,
  order: readonly string[],
): KeyUserAcceptanceSummary {
  const same =
    isKeyUserAcceptanceSummary(previous) &&
    previous.subject.runId === next.subject.runId &&
    previous.subject.sourceSha256 === next.subject.sourceSha256 &&
    previous.listDigest === next.listDigest;
  const ids = new Set([...(same ? (previous as KeyUserAcceptanceSummary).checkIds : []), ...next.checkIds]);
  return { v: KEY_USER_ACCEPTANCE_VERSION, kind: 'confirmed', ...next, checkIds: order.filter((id) => ids.has(id)) };
}
