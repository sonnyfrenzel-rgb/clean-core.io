/**
 * A test run that gave no result, and testing closed without a passing run —
 * what is on record, and when it counts (ADR-094, owner 11.10.2026).
 *
 * Owner report of 11.10.2026 (FI_Collection_Worklist): "The test runner failed,
 * yet I am asked again and again to run the tests and tests count as open.
 * Negative cases need a way to come to a conclusion anyway." Two gaps lay under
 * it, and this module holds the record of both:
 *
 *   1. **A run that gave no result left no trace.** `/api/run-tests` writes a
 *      receipt only when the suite executed. A suite that did not compile, a
 *      runner that could not be reached or answered with something unusable,
 *      returned an error to the page and wrote nothing, so every view went on
 *      saying "no test run on record" — true of the receipt, false of what had
 *      happened. The route now writes `testRunFailure` onto the project (Admin
 *      SDK, a key the client allowlist of `firestore.rules` does not contain):
 *      the kind, the first line of the cause, the time, the account and how
 *      many attempts in a row failed for the same code and suite.
 *
 *   2. **A failed or impossible run had no end.** The testing phase was done
 *      only on a passing run (or, on the ABAP Cloud route, a passing result from
 *      the reader's own system, ADR-075). The owner can now close testing
 *      without a passing run — `close-testing` through the project commands,
 *      server-written as `testingClosure` with the account and the time, and a
 *      reason. It is a **self-declaration**: the phase is `done`, never
 *      `proven`, and every view says "not verified". Nothing claims a pass.
 *
 * Both records bind what they were made for — the active run, the generated
 * code, the suite and the case list (`testRunSubject`, the receipt's subject) —
 * and both give way to a newer run: a receipt or a failure recorded after the
 * closure reopens testing, as does "Reopen testing".
 *
 * Pure: no React, no Firestore. Never part of a signed run; the audit pack
 * carries the closure in `07-user-attested.md`, as the account's word.
 */

import { sha256Hex } from './artefact-digest';
import { formatTextDate } from './format';
import { coveringTestRunReceipt, testRunSubject } from './test-receipt';

export type TestSubject = ReturnType<typeof testRunSubject>;

type ProjectLike = Parameters<typeof testRunSubject>[0] & {
  testRunReceipt?: unknown;
  testRunFailure?: unknown;
  testingClosure?: unknown;
  outsideTestResult?: unknown;
};

const isStr = (v: unknown): v is string => typeof v === 'string';
const isStrOrNull = (v: unknown) => v === null || typeof v === 'string';
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

function isSubject(value: unknown): value is TestSubject {
  if (!value || typeof value !== 'object') return false;
  const s = value as Record<string, unknown>;
  return ['runId', 'codeDigest', 'suiteDigest', 'casesDigest'].every((k) => isStrOrNull(s[k]));
}

export function sameSubject(a: TestSubject, b: TestSubject): boolean {
  return a.runId === b.runId && a.codeDigest === b.codeDigest && a.suiteDigest === b.suiteDigest && a.casesDigest === b.casesDigest;
}

/**
 * One short key for the subject, so a page can say which code and suite it
 * asked to close and the server can refuse a closure of something else.
 */
export function subjectKey(subject: TestSubject): string {
  return sha256Hex([subject.runId, subject.codeDigest, subject.suiteDigest, subject.casesDigest].map((v) => v ?? '-').join('|')).slice(0, 32);
}

/** Control and bidi characters removed, whitespace collapsed, trimmed. */
function cleanLine(raw: string): string {
  return raw
    .replace(/[\u0000-\u001F\u007F-\u009F‎‏‪-‮⁦-⁩]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ------------------------------------------------------- a failed run */

export const TEST_RUN_FAILURE_VERSION = 1;
export const MAX_CAUSE_CHARS = 240;

/**
 * - `build-error`        the code or the suite did not compile in the runner;
 * - `runner-unavailable` no runner could be reached for this run;
 * - `runner-error`       the runner answered, but with nothing usable.
 */
export type TestRunFailureKind = 'build-error' | 'runner-unavailable' | 'runner-error';

export interface TestRunFailure {
  v: number;
  subject: TestSubject;
  /** Server clock, ISO 8601, of the latest failed attempt. */
  at: string;
  /** The account the run was served for (uid, from the verified token). */
  by: string;
  kind: TestRunFailureKind;
  /** The first line of the cause that says something, bounded. */
  cause: string;
  /** Failed attempts in a row for this subject, this one included. */
  attempts: number;
}

export function isTestRunFailure(value: unknown): value is TestRunFailure {
  if (!value || typeof value !== 'object') return false;
  const f = value as Record<string, unknown>;
  return (
    f.v === TEST_RUN_FAILURE_VERSION &&
    isSubject(f.subject) &&
    isStr(f.at) &&
    isStr(f.by) &&
    (f.kind === 'build-error' || f.kind === 'runner-unavailable' || f.kind === 'runner-error') &&
    isStr(f.cause) &&
    isCount(f.attempts) &&
    f.attempts > 0
  );
}

/**
 * The line of an error text worth showing: the compiler's own `ERROR:` line
 * when there is one ("Build failed with 1 error:" says nothing), otherwise the
 * first line that is not empty. The run directory marker is dropped.
 */
export function failureCause(text: string | null | undefined): string {
  const lines = String(text ?? '')
    .split('\n')
    .map((l) => cleanLine(l.replace(/<sandbox>\//g, '')))
    .filter(Boolean)
    .filter((l) => !/^Compilation failed:?$/i.test(l));
  const line = lines.find((l) => /\bERROR:/.test(l)) ?? lines[0] ?? '';
  return line.length > MAX_CAUSE_CHARS ? `${line.slice(0, MAX_CAUSE_CHARS - 1)}…` : line;
}

/** The record to write for this failed attempt — one more attempt when the stored one is for the same subject. */
export function nextTestRunFailure(
  stored: unknown,
  input: {
    subject: TestSubject;
    at: string;
    by: string;
    kind: TestRunFailureKind;
    cause: string;
    /**
     * When the receipt that covers this subject was executed, if one does. A
     * run that gave a result after the stored failure breaks the row: fail,
     * run, fail again is one attempt, not two in a row (QA 02095ce5c0a7) — the
     * same comparison `testRunFailureReading` makes.
     */
    receiptAt?: string | null;
  },
): TestRunFailure {
  const inARow =
    isTestRunFailure(stored) &&
    sameSubject(stored.subject, input.subject) &&
    !(typeof input.receiptAt === 'string' && input.receiptAt >= stored.at);
  const previous = inARow && isTestRunFailure(stored) ? stored.attempts : 0;
  return {
    v: TEST_RUN_FAILURE_VERSION,
    subject: input.subject,
    at: input.at,
    by: input.by,
    kind: input.kind,
    cause: failureCause(input.cause) || 'No cause was reported.',
    attempts: previous + 1,
  };
}

export type TestRunFailureReading =
  | { state: 'none' }
  /** Recorded for an earlier run, code, suite or case list. */
  | { state: 'earlier'; failure: TestRunFailure }
  | { state: 'current'; failure: TestRunFailure };

/**
 * The failed run as it stands for this project: current only while it is for
 * what the project holds and no receipt recorded after it covers the suite.
 */
export function testRunFailureReading(project: ProjectLike | null | undefined): TestRunFailureReading {
  if (!project) return { state: 'none' };
  const stored = project.testRunFailure;
  if (!isTestRunFailure(stored)) return { state: 'none' };
  if (!sameSubject(stored.subject, testRunSubject(project))) return { state: 'earlier', failure: stored };
  const receipt = coveringTestRunReceipt(project);
  if (receipt && receipt.executedAt >= stored.at) return { state: 'none' };
  return { state: 'current', failure: stored };
}

const FAILURE_WORDS: Readonly<Record<TestRunFailureKind, string>> = Object.freeze({
  'build-error': 'the generated code or the suite did not compile in the runner',
  'runner-unavailable': 'no test runner could be reached',
  'runner-error': 'the test runner gave no usable answer',
});

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "the generated code or the suite did not compile in the runner: test.ts:162:27: ERROR: …" */
export function failureReason(f: TestRunFailure): string {
  return f.cause ? `${FAILURE_WORDS[f.kind]}: ${f.cause}` : FAILURE_WORDS[f.kind];
}

/** "The last run on 11 Oct 2026 gave no result — … (3 attempts)." */
export function failureSentence(f: TestRunFailure): string {
  const day = formatTextDate(f.at) ?? f.at.slice(0, 10);
  const tries = f.attempts > 1 ? ` (${plural(f.attempts, 'attempt')} in a row)` : '';
  return `The last run on ${day} gave no result${tries} — ${failureReason(f)}.`;
}

/* ------------------------------------------- closing without a passing run */

export const TESTING_CLOSURE_VERSION = 1;
export const MAX_CLOSURE_NOTE_CHARS = 500;

export const CLOSURE_REASONS = [
  'runner-failed',
  'failures-accepted',
  'tested-elsewhere',
  'not-testable-here',
  'other',
] as const;
export type ClosureReason = (typeof CLOSURE_REASONS)[number];

/** What the owner picks, in the owner's words. */
export const CLOSURE_REASON_LABELS: Readonly<Record<ClosureReason, string>> = Object.freeze({
  'runner-failed': 'The runner failed here',
  'failures-accepted': 'The failures are known and accepted',
  'tested-elsewhere': 'Tested in our own system',
  'not-testable-here': 'Not testable here',
  other: 'Another reason',
});

/**
 * What was on record when testing was closed, derived by the server — never
 * sent by a browser:
 *
 *   - `failed-run`  a recorded run (or a result from the reader's own SAP
 *                   system) with failures or without a pass for every scenario;
 *   - `run-error`   a run that gave no result (`testRunFailure`);
 *   - `no-runner`   the route has no runner here (ABAP Unit, ADR-075).
 */
export type ClosureBasisKind = 'failed-run' | 'run-error' | 'no-runner';
export interface ClosureBasis {
  kind: ClosureBasisKind;
  /** One sentence: what that record said. */
  line: string;
}

/** Which reasons fit which basis. "The runner failed" needs a failed run of the runner. */
export function reasonsFor(basis: ClosureBasisKind): ClosureReason[] {
  return CLOSURE_REASONS.filter((r) =>
    r === 'runner-failed' ? basis === 'run-error' : r === 'failures-accepted' ? basis === 'failed-run' : true,
  );
}

export interface TestingClosure {
  v: number;
  subject: TestSubject;
  reason: ClosureReason;
  /** The owner's own words, bounded; required for `other`. */
  note: string | null;
  basis: ClosureBasis;
  /** The address on the verified token — who closed it. */
  account: string;
  /** Server clock, ISO 8601. */
  at: string;
}

export function isTestingClosure(value: unknown): value is TestingClosure {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  const basis = c.basis as Record<string, unknown> | null;
  return (
    c.v === TESTING_CLOSURE_VERSION &&
    isSubject(c.subject) &&
    (CLOSURE_REASONS as readonly string[]).includes(c.reason as string) &&
    isStrOrNull(c.note) &&
    !!basis &&
    typeof basis === 'object' &&
    (basis.kind === 'failed-run' || basis.kind === 'run-error' || basis.kind === 'no-runner') &&
    isStr(basis.line) &&
    isStr(c.account) &&
    isStr(c.at)
  );
}

export type ClosureInput = { reason: ClosureReason; note: string | null };

/** The body of `close-testing` as the server accepts it, or why not. */
export function validateClosureBody(
  body: Record<string, unknown>,
  basis: ClosureBasisKind,
): { ok: true; value: ClosureInput } | { ok: false; error: string } {
  const reason = body.reason;
  if (typeof reason !== 'string' || !(CLOSURE_REASONS as readonly string[]).includes(reason)) {
    return { ok: false, error: `reason must be one of ${CLOSURE_REASONS.join(', ')}.` };
  }
  if (!reasonsFor(basis).includes(reason as ClosureReason)) {
    return {
      ok: false,
      error:
        reason === 'runner-failed'
          ? 'No failed run of the runner is on record for this suite, so "the runner failed" is not a reason that fits.'
          : 'No failing run is on record for this suite, so "the failures are accepted" is not a reason that fits.',
    };
  }
  let note: string | null = null;
  if (body.note !== undefined && body.note !== null) {
    if (typeof body.note !== 'string') return { ok: false, error: 'The note is text.' };
    const cleaned = cleanLine(body.note);
    if (cleaned.length > MAX_CLOSURE_NOTE_CHARS) return { ok: false, error: `The note is at most ${MAX_CLOSURE_NOTE_CHARS} characters.` };
    note = cleaned || null;
  }
  if (reason === 'other' && !note) return { ok: false, error: 'Say in a few words why testing is closed.' };
  return { ok: true, value: { reason: reason as ClosureReason, note } };
}

export type TestingClosureReading =
  | { state: 'none' }
  /** Closed for an earlier run, code, suite or case list — it no longer applies. */
  | { state: 'earlier'; closure: TestingClosure }
  /** A run was recorded after the closure: testing is open again. */
  | { state: 'superseded'; closure: TestingClosure }
  | { state: 'current'; closure: TestingClosure };

/** Is the closure still the last word on this suite? */
export function testingClosureReading(project: ProjectLike | null | undefined): TestingClosureReading {
  if (!project) return { state: 'none' };
  const stored = project.testingClosure;
  if (!isTestingClosure(stored)) return { state: 'none' };
  if (!sameSubject(stored.subject, testRunSubject(project))) return { state: 'earlier', closure: stored };
  const receipt = coveringTestRunReceipt(project);
  if (receipt && receipt.executedAt > stored.at) return { state: 'superseded', closure: stored };
  const failure = project.testRunFailure;
  if (isTestRunFailure(failure) && sameSubject(failure.subject, stored.subject) && failure.at > stored.at) {
    return { state: 'superseded', closure: stored };
  }
  const outside = project.outsideTestResult as { recordedAt?: unknown } | null | undefined;
  if (outside && typeof outside.recordedAt === 'string' && outside.recordedAt > stored.at) {
    return { state: 'superseded', closure: stored };
  }
  return { state: 'current', closure: stored };
}

/** The badge every view shows for a closed testing phase. Never "passed", never "proven". */
export const CLOSED_NOT_VERIFIED = 'Closed · not verified';

/** "the runner failed here — the generated code … did not compile …: test.ts:162 …" */
export function closureReasonText(c: TestingClosure): string {
  // The basis line is a sentence of its own; inside this one it starts small and loses its full stop.
  const line = c.basis.line.replace(/\.$/, '').replace(/^The /, 'the ');
  const head =
    c.reason === 'runner-failed'
      ? `the runner failed here — ${line}`
      : c.reason === 'failures-accepted'
        ? `the failures are known and accepted — ${line}`
        : c.reason === 'tested-elsewhere'
          ? 'tested in our own system'
          : c.reason === 'not-testable-here'
            ? 'not testable here'
            : c.note ?? 'another reason';
  return c.reason !== 'other' && c.note ? `${head} (“${c.note}”)` : head;
}

/** "Closed without a passing run by x@y on 11 Oct 2026: tested in our own system." */
export function closureSentence(c: TestingClosure): string {
  const day = formatTextDate(c.at) ?? c.at.slice(0, 10);
  return `Closed without a passing run by ${c.account} on ${day}: ${closureReasonText(c)}.`;
}

/**
 * The provenance note beside a closed testing phase. "you" only for the reader
 * who closed it — the owner, the one account `close-testing` accepts; a reader
 * the project is shared with sees the recorded account instead of being told
 * they made the statement themselves (QA 035a6c65b96f).
 */
export function closureByline(c: TestingClosure, viewerIsOwner: boolean): string {
  return `closed by ${viewerIsOwner ? 'you' : c.account} · not verified`;
}

/** The handover's line: "Tests: not verified — closed by x@y on 11 Oct 2026: …" */
export function closureHandoverLine(c: TestingClosure): string {
  const day = formatTextDate(c.at) ?? c.at.slice(0, 10);
  return `Tests: not verified — closed by ${c.account} on ${day}: ${closureReasonText(c)}.`;
}
