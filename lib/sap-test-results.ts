/**
 * Test results from the reader's own SAP system — what is on record, and when
 * it counts for the handover.
 *
 * Owner decision 03.10.2026, ADR-075 (`docs/design/decisions.md`). On the ABAP
 * Cloud route the suite is an ABAP Unit class, and nothing here can run it
 * (`lib/test-runnability.ts`), so the testing phase could never reach the
 * handover. Two ways bring the result in, and both are the account's:
 *
 *   - **imported** — the ABAP Unit result file of a run in the reader's system
 *     (JUnit XML or ADT's run result, `lib/test-result-import.ts`), matched to
 *     the scenarios by method name. Provenance *Imported*: taken from a file.
 *   - **confirmed** — "I ran the test class in my SAP system": passed and failed
 *     counts, the system, the date. Provenance *Confirmed*, a self-declaration
 *     of the signed-in account, never *Proven*.
 *
 * Neither is an execution here, so neither sets `RailStep.proven`. The phase
 * contract carries it beside it, as `verifiedOutside` (`lib/workflow-steps.ts`).
 *
 * **Where it lives.** `/api/projects/{id}/test-results` writes the full record
 * (per-scenario results, unmatched methods, the note) to
 * `projects/{id}/test_results/current` and, in the same transaction, the
 * summary below onto the project document as `outsideTestResult` — a key the
 * client allowlist of `firestore.rules` does not contain, like
 * `testRunReceipt`. The summary is what every view reads through
 * `workflowSteps`, so the rail, the dashboard and Delivery agree without a
 * second read. Nothing of it reaches a signed run or the audit pack.
 *
 * **When it is current.** The record binds what it was given for: the active
 * run, the generated code, the test class and the scenario list
 * (`testRunSubject`, the same subject the sandbox receipt binds). A result
 * recorded before any of them changed is out of date and counts for nothing.
 *
 * Pure: no React, no Firestore.
 */

import { testRunSubject } from './test-receipt';
import { isAbapUnitRoute } from './test-runnability';

export const OUTSIDE_RESULT_VERSION = 1;

/** The two ways a result from outside is on record — the provenance value of each. */
export type OutsideKind = 'imported' | 'confirmed';

export interface OutsideSubject {
  runId: string | null;
  codeDigest: string | null;
  suiteDigest: string | null;
  casesDigest: string | null;
}

/** Per scenario, counted over the scenarios on the project when the file was imported. */
export interface OutsideCoverage {
  passed: number;
  failed: number;
  skipped: number;
  /** Scenarios the file holds no test method for. */
  none: number;
}

/** What the project document carries — enough for every view, nothing a reader typed at length. */
export interface OutsideTestSummary {
  v: number;
  kind: OutsideKind;
  subject: OutsideSubject;
  /** Server clock, ISO 8601. */
  recordedAt: string;
  /** The account that recorded it, from the verified token. */
  recordedBy: string;
  /** Scenarios on the project when it was recorded. */
  scenarioCount: number;
  /** Test methods: in the file (imported), or as stated (confirmed). */
  passed: number;
  failed: number;
  skipped: number;
  /** Imported only. */
  coverage: OutsideCoverage | null;
  /** Imported only. */
  file: { name: string; sha256: string; format: 'junit' | 'aunit' } | null;
  /** Confirmed only: the system as the account named it, bounded. */
  system: string | null;
  /** Confirmed only: the date of the run, `YYYY-MM-DD`. */
  ranOn: string | null;
}

export interface OutsideScenarioResult {
  id: string;
  outcome: 'passed' | 'failed' | 'skipped' | 'none';
  tests: number;
  message: string | null;
}

/** The full record in `test_results/current`. */
export interface OutsideTestRecord extends OutsideTestSummary {
  /** Imported only: one per scenario, in the project's order. */
  results: OutsideScenarioResult[];
  /** Imported only: test methods that are not one of the scenarios. */
  unmatched: Array<{ name: string; outcome: 'passed' | 'failed' | 'skipped' }>;
  unmatchedTotal: number;
  /** Confirmed only: the account's note, bounded. */
  note: string | null;
}

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const isStr = (v: unknown): v is string => typeof v === 'string';
const isStrOrNull = (v: unknown) => v === null || typeof v === 'string';

/** Shape check of a stored summary. Server-written, read defensively all the same. */
export function isOutsideSummary(value: unknown): value is OutsideTestSummary {
  if (!value || typeof value !== 'object') return false;
  const s = value as Record<string, unknown>;
  if (s.v !== OUTSIDE_RESULT_VERSION) return false;
  if (s.kind !== 'imported' && s.kind !== 'confirmed') return false;
  const subject = s.subject as Record<string, unknown> | null;
  if (!subject || typeof subject !== 'object') return false;
  if (!['runId', 'codeDigest', 'suiteDigest', 'casesDigest'].every((k) => isStrOrNull(subject[k]))) return false;
  if (!isStr(s.recordedAt) || !isStr(s.recordedBy)) return false;
  if (!isCount(s.scenarioCount) || !isCount(s.passed) || !isCount(s.failed) || !isCount(s.skipped)) return false;
  if (s.kind === 'imported') {
    const c = s.coverage as Record<string, unknown> | null;
    if (!c || !isCount(c.passed) || !isCount(c.failed) || !isCount(c.skipped) || !isCount(c.none)) return false;
    const f = s.file as Record<string, unknown> | null;
    if (!f || !isStr(f.name) || !isStr(f.sha256) || (f.format !== 'junit' && f.format !== 'aunit')) return false;
  } else {
    if (!isStr(s.system) || !isStr(s.ranOn)) return false;
  }
  return true;
}

/** What the result is bound to — the sandbox receipt's subject, so the two go out of date together. */
export function outsideSubjectOf(project: Parameters<typeof testRunSubject>[0]): OutsideSubject {
  return testRunSubject(project);
}

function sameSubject(a: OutsideSubject, b: OutsideSubject): boolean {
  return a.runId === b.runId && a.codeDigest === b.codeDigest && a.suiteDigest === b.suiteDigest && a.casesDigest === b.casesDigest;
}

type ProjectLike = Parameters<typeof testRunSubject>[0] & {
  extensibilityRoute?: string | null;
  outsideTestResult?: unknown;
  testCases?: unknown;
};

/**
 * Does this result let the testing phase count as verified for the handover?
 *
 *   - imported: no failure anywhere in the file, and every scenario passed —
 *     none failed, none skipped, none without a method in the file;
 *   - confirmed: no failure, and at least as many passes as there are
 *     scenarios — a class that passed three methods has not passed ten
 *     scenarios, whatever the account says about it.
 */
export function outsideVerifies(s: OutsideTestSummary): boolean {
  if (s.scenarioCount <= 0 || s.failed > 0) return false;
  if (s.kind === 'imported') {
    const c = s.coverage;
    return !!c && c.failed === 0 && c.skipped === 0 && c.none === 0 && c.passed === s.scenarioCount;
  }
  return s.passed >= s.scenarioCount;
}

export type OutsideReading =
  | { state: 'none' }
  /** On record for an earlier run, code, test class or scenario list. */
  | { state: 'earlier'; summary: OutsideTestSummary }
  | { state: 'current'; summary: OutsideTestSummary; verifies: boolean };

/**
 * The result from outside as it stands for this project. Only on the ABAP
 * Cloud route — elsewhere the sandbox runs the suite and records its own
 * receipt — and only with a scenario list to have given a result for.
 */
export function outsideReading(project: ProjectLike | null | undefined): OutsideReading {
  if (!project || !isAbapUnitRoute(project)) return { state: 'none' };
  const cases = Array.isArray(project.testCases) ? project.testCases : [];
  if (cases.length === 0) return { state: 'none' };
  const stored = project.outsideTestResult;
  if (!isOutsideSummary(stored)) return { state: 'none' };
  if (!sameSubject(stored.subject, outsideSubjectOf(project))) return { state: 'earlier', summary: stored };
  return { state: 'current', summary: stored, verifies: outsideVerifies(stored) };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The chip's note after *Imported* or *Confirmed* — "from your system", "by you · self-declaration". */
export function outsideChipNote(kind: OutsideKind): string {
  return kind === 'imported' ? 'from your system' : 'by you · self-declaration';
}

/** "10 of 10 scenarios passed" / "You confirmed 12 passed, 0 failed" — counts only, never a file or system name. */
export function outsideCountsLine(s: OutsideTestSummary): string {
  if (s.kind === 'imported') {
    const c = s.coverage!;
    const parts = [`${c.passed} of ${plural(s.scenarioCount, 'scenario')} passed`];
    if (c.failed > 0) parts.push(`${c.failed} failed`);
    if (c.skipped > 0) parts.push(`${c.skipped} skipped`);
    if (c.none > 0) parts.push(`${c.none} with no result in the file`);
    return parts.join(', ');
  }
  return `${s.passed} passed, ${s.failed} failed, for ${plural(s.scenarioCount, 'scenario')}`;
}

/** Why a current result does not verify the phase, in one sentence. `null` when it does. */
export function outsideShortfall(s: OutsideTestSummary): string | null {
  if (outsideVerifies(s)) return null;
  if (s.scenarioCount <= 0) return 'No scenarios were on record when it was recorded.';
  if (s.kind === 'imported') {
    const c = s.coverage!;
    if (s.failed > 0 || c.failed > 0) return `The imported run has ${plural(Math.max(s.failed, c.failed), 'failure')}.`;
    if (c.none > 0) return `${plural(c.none, 'scenario')} ${c.none === 1 ? 'has' : 'have'} no result in the file.`;
    if (c.skipped > 0) return `${plural(c.skipped, 'scenario')} ${c.skipped === 1 ? 'was' : 'were'} skipped.`;
    return 'Not every scenario passed.';
  }
  if (s.failed > 0) return `You recorded ${plural(s.failed, 'failure')}.`;
  return `You recorded ${s.passed} passed for ${plural(s.scenarioCount, 'scenario')} — fewer passes than scenarios.`;
}

/* ------------------------------------------------------------ confirmation */

export const MAX_CONFIRMED_COUNT = 100_000;
export const MAX_SYSTEM_CHARS = 40;
export const MAX_NOTE_CHARS = 500;

export interface ConfirmationInput {
  passed: number;
  failed: number;
  system: string;
  ranOn: string;
  note: string | null;
}

/** Control and bidi characters removed, whitespace collapsed, trimmed. */
function cleanLine(raw: string): string {
  return raw
    .replace(/[\u0000-\u001F\u007F-\u009F‎‏‪-‮⁦-⁩]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Today in UTC as `YYYY-MM-DD`. */
export function isoDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/**
 * The confirmation as the route accepts it, or why not. `now` is the server
 * clock; the date of the run may not lie after it (a day of slack for time zones).
 */
export function validateConfirmation(
  body: Record<string, unknown>,
  now: Date,
): { ok: true; value: ConfirmationInput } | { ok: false; error: string } {
  const { passed, failed } = body;
  if (!isCount(passed) || !isCount(failed) || passed > MAX_CONFIRMED_COUNT || failed > MAX_CONFIRMED_COUNT) {
    return { ok: false, error: 'The counts of passed and failed tests are whole numbers from 0.' };
  }
  if (passed + failed === 0) return { ok: false, error: 'A run with no passed and no failed test is not a result.' };
  const system = typeof body.system === 'string' ? cleanLine(body.system) : '';
  if (!system) return { ok: false, error: 'Name the system the class ran in — its SID and client, for example S4D / 100.' };
  if (system.length > MAX_SYSTEM_CHARS) return { ok: false, error: `The system is at most ${MAX_SYSTEM_CHARS} characters.` };
  const ranOn = typeof body.ranOn === 'string' ? body.ranOn.trim() : '';
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ranOn);
  const parsed = day ? new Date(`${ranOn}T00:00:00Z`) : null;
  if (!day || !parsed || Number.isNaN(parsed.getTime()) || isoDay(parsed) !== ranOn) {
    return { ok: false, error: 'The date of the run is a date, YYYY-MM-DD.' };
  }
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  if (ranOn > isoDay(tomorrow)) return { ok: false, error: 'The date of the run lies in the future.' };
  if (ranOn < '2000-01-01') return { ok: false, error: 'The date of the run is before 2000.' };
  let note: string | null = null;
  if (body.note !== undefined && body.note !== null) {
    if (typeof body.note !== 'string') return { ok: false, error: 'The note is text.' };
    const cleaned = cleanLine(body.note);
    if (cleaned.length > MAX_NOTE_CHARS) return { ok: false, error: `The note is at most ${MAX_NOTE_CHARS} characters.` };
    note = cleaned || null;
  }
  return { ok: true, value: { passed, failed, system, ranOn, note } };
}

/** The record's summary half — what goes onto the project document. */
export function summaryOf(record: OutsideTestRecord): OutsideTestSummary {
  return {
    v: record.v,
    kind: record.kind,
    subject: record.subject,
    recordedAt: record.recordedAt,
    recordedBy: record.recordedBy,
    scenarioCount: record.scenarioCount,
    passed: record.passed,
    failed: record.failed,
    skipped: record.skipped,
    coverage: record.coverage,
    file: record.file,
    system: record.system,
    ranOn: record.ranOn,
  };
}
