import { artefactDigest, sha256Hex } from './artefact-digest';

/**
 * The server's own record that a test suite ran — and over which artefacts.
 *
 * Why this exists (QA full review of a19945ef01dc, roadmap E07-F02): Testing and
 * Delivery were painted green from `project.testCases[].status`. That field is
 * in the client update allowlist of `firestore.rules`, so a stored `Passed` can
 * equally have come from a direct browser write or from a model that invented a
 * `status` key in the suite it generated — the field cannot say which. (Since
 * roadmap 7.3 `/api/run-tests` writes the runner's verdicts there too, with the
 * Admin SDK, so the screen and the receipt agree after a real run; that does not
 * make the field evidence, because nothing reading it can tell the two apart.)
 * Either of the first two made
 *
 *   testEvidence → tests.passed === tests.total → Testing done & proven
 *                → `gaps` empty → Delivery "Ready", green, and the sentence
 *                  "a passing test run is on record"
 *
 * come true without anything having run. That is the class QA24-A17 names: *a
 * fingerprint without a confirmation is not a green status*.
 *
 * A receipt turns it into an observation. `/api/run-tests` is the only path from
 * this product to an execution; it is the only place that knows a suite ran, on
 * which code, for whom and what came back. It writes this record with the Admin
 * SDK onto the project document, under a key the client allowlist does not
 * contain — so a browser cannot write one, and `firestore.rules` needs no change
 * to say so.
 *
 * What each claim binds, and why none of them is decoration:
 *
 *   - `codeDigest` — the generated code that was executed. Without it the
 *     receipt survives a rewrite of the code it vouched for, which is the same
 *     lie one step later.
 *   - `suiteDigest` — the test code that was executed. A receipt that outlives
 *     the suite is a receipt for a suite nobody can read back.
 *   - `casesDigest` — the case list the verdicts belong to, hashed the way
 *     `artefactDigest` hashes it: **without** `status` and `message`, so adding
 *     or renaming a case invalidates the receipt and flipping a verdict does
 *     not. (Flipping one is caught anyway — the verdicts below are the receipt's,
 *     not the project's.)
 *   - `runId` — the signed analysis run this project stood on when the suite
 *     ran. A receipt that outlives the run belongs to a different chain.
 *   - `verdicts` — per case, from the runner's TAP output. The project's own
 *     `status` strings are never consulted for a verdict again; they remain what
 *     the testing page shows and what a reader may annotate.
 *   - `environment` — `mock` names a sandbox, and a sandbox result is still an
 *     execution of the generated code. A live tenant check is not an execution
 *     of anything and never reaches here.
 *   - `scope` — which cases the run was *asked* for. Two of eleven cases
 *     reporting two passes is a true sentence about two cases and a false one
 *     about the suite, and without the scope the receipt cannot tell them apart
 *     on its own.
 *   - `stubs` — the npm packages the sandbox replaced with a universal mock
 *     before the suite loaded. The runner has always computed this list and has
 *     always thrown it away after painting one banner on one screen; roadmap 7.3
 *     puts it in the record, because a run against a mock of `@sap/xssec` and a
 *     run against `@sap/xssec` are two different facts and only the receipt
 *     outlives the banner (UX-E08-F02-US02: *Umgebung und ersetzte
 *     Abhängigkeiten sind am Ergebnis sichtbar*).
 *
 * **What a verified receipt does and does not prove.** It proves that this
 * server ran this suite against this code for this account and saw these
 * verdicts. It does not prove the code is correct, and it is not a signature: it
 * is server-written state, trusted exactly as far as `activeRunId` is. The claim
 * that changed is "the browser said these passed" → "the server saw these pass".
 */

/**
 * Bumped only when the claim set changes. A reader refuses a version it does not know.
 *
 * 2 (roadmap 7.3) added `scope` and `stubs`. A version-1 receipt is refused
 * rather than read with those two claims defaulted, because a default would be
 * the claim itself: an empty `stubs` list means "nothing was replaced", and no
 * version-1 receipt ever established that. The cost is that a project whose last
 * run predates 7.3 reads as self-reported until the suite is run again, which is
 * the conservative direction this whole file is written in.
 */
export const TEST_RUN_RECEIPT_VERSION = 2;

/** The verdicts a runner can report. Only `Passed` is a pass. */
export type TestRunVerdict = 'Passed' | 'Failed' | 'Not run' | 'Skipped' | 'Todo' | 'Error';

/** What the run was asked to cover. */
export interface TestRunScope {
  /**
   * The case ids the caller selected, sorted — or `null` when the whole suite
   * was asked for. `[]` is not the same thing and is not written for "all".
   */
  selected: string[] | null;
  /** How many cases the project held when the run started. */
  cases: number;
}

export interface TestRunReceipt {
  v: number;
  /** `projects/{id}.activeRunId` as it stood when the suite ran, or null. */
  runId: string | null;
  /** SHA-256 of the generated code that was executed. */
  codeDigest: string | null;
  /** SHA-256 of the test suite source that was executed. */
  suiteDigest: string | null;
  /** `artefactDigest('testCases', …)` of the case list the verdicts belong to. */
  casesDigest: string | null;
  /** `mock` — the Node sandbox. Nothing else executes the generated code today. */
  environment: 'mock';
  /** Which cases the run was asked for. */
  scope: TestRunScope;
  /**
   * The npm packages the sandbox replaced with a universal mock, sorted. Empty
   * means the run replaced none — a statement, not an absence.
   */
  stubs: string[];
  /** Server clock, ISO 8601. */
  executedAt: string;
  /** The account the run was served for. */
  executedBy: string;
  /** The runner's exit code. Non-zero is kept: a receipt records what happened. */
  exitCode: number;
  /** One entry per case the runner reported on. */
  verdicts: Array<{ id: string; status: TestRunVerdict }>;
  /**
   * Roadmap 8.7 — present when the run executed a repair draft rather than the
   * stored artefacts: the draft's id and `draftDigest` (`lib/repair-draft.ts`).
   * `codeDigest` and `suiteDigest` above are then the draft's, which is what
   * actually ran. Such a receipt is written onto the draft, never onto the
   * project; it reaches the project only by adoption, in the same transaction
   * as the code it names — so the coverage check below needs no special case.
   *
   * Optional and additive, so the version stays 2: it adds provenance and
   * changes the meaning of no other claim. Absent means "the stored artefacts ran".
   */
  draft?: { id: string; digest: string };
}

const VERDICTS: readonly string[] = ['Passed', 'Failed', 'Not run', 'Skipped', 'Todo', 'Error'];

/** What a receipt is taken over — computed identically by the writer and every reader. */
export function testRunSubject(source: {
  activeRunId?: unknown;
  generatedCode?: unknown;
  testSuite?: unknown;
  testCases?: unknown;
}): { runId: string | null; codeDigest: string | null; suiteDigest: string | null; casesDigest: string | null } {
  const suite = source.testSuite as { code?: unknown } | undefined | null;
  const suiteCode = suite && typeof suite.code === 'string' ? suite.code : '';
  return {
    runId: typeof source.activeRunId === 'string' && source.activeRunId ? source.activeRunId : null,
    codeDigest: typeof source.generatedCode === 'string' && source.generatedCode.trim() ? sha256Hex(source.generatedCode) : null,
    suiteDigest: suiteCode.trim() ? sha256Hex(suiteCode) : null,
    casesDigest: artefactDigest('testCases', source.testCases),
  };
}

function isTestRunScope(value: unknown): value is TestRunScope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const scope = value as Record<string, unknown>;
  const selected = scope.selected;
  const selectedOk =
    selected === null || (Array.isArray(selected) && selected.every((id) => typeof id === 'string'));
  return selectedOk && typeof scope.cases === 'number';
}

/** Shape check only — it says nothing about whether the receipt still fits the project. */
export function isTestRunReceipt(value: unknown): value is TestRunReceipt {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const r = value as Record<string, unknown>;
  return (
    r.v === TEST_RUN_RECEIPT_VERSION &&
    (r.runId === null || typeof r.runId === 'string') &&
    (r.codeDigest === null || typeof r.codeDigest === 'string') &&
    (r.suiteDigest === null || typeof r.suiteDigest === 'string') &&
    (r.casesDigest === null || typeof r.casesDigest === 'string') &&
    r.environment === 'mock' &&
    isTestRunScope(r.scope) &&
    Array.isArray(r.stubs) &&
    r.stubs.every((s) => typeof s === 'string') &&
    typeof r.executedAt === 'string' &&
    typeof r.executedBy === 'string' &&
    typeof r.exitCode === 'number' &&
    (r.draft === undefined ||
      (!!r.draft &&
        typeof r.draft === 'object' &&
        typeof (r.draft as { id?: unknown }).id === 'string' &&
        typeof (r.draft as { digest?: unknown }).digest === 'string')) &&
    Array.isArray(r.verdicts) &&
    r.verdicts.every(
      (entry) =>
        entry &&
        typeof entry === 'object' &&
        typeof (entry as { id?: unknown }).id === 'string' &&
        VERDICTS.includes((entry as { status?: unknown }).status as string),
    )
  );
}

/**
 * The receipt on this project, **if** it is still a receipt for what is on it.
 *
 * Conservative in one direction only: anything that cannot be shown to match
 * comes back as `null`, and `null` means "nothing executed this", never "assume
 * it did". A project carrying no receipt, a receipt of an unknown version, a
 * receipt for another run, for code that has since been rewritten, for a suite
 * that has since been regenerated or for a different set of cases all land here.
 */
export function coveringTestRunReceipt(project: {
  activeRunId?: unknown;
  generatedCode?: unknown;
  testSuite?: unknown;
  testCases?: unknown;
  testRunReceipt?: unknown;
} | null | undefined): TestRunReceipt | null {
  if (!project) return null;
  const receipt = project.testRunReceipt;
  if (!isTestRunReceipt(receipt)) return null;
  const now = testRunSubject(project);
  if (now.runId === null || receipt.runId !== now.runId) return null;
  if (now.codeDigest === null || receipt.codeDigest !== now.codeDigest) return null;
  if (now.suiteDigest === null || receipt.suiteDigest !== now.suiteDigest) return null;
  if (now.casesDigest === null || receipt.casesDigest !== now.casesDigest) return null;
  return receipt;
}

/**
 * How many of `ids` an attributable execution reports as passed.
 *
 * Every id has to appear in the receipt with `Passed`. A case the runner never
 * mentioned is not a pass — that is the same absence `TestCase['status']`
 * records as `Not run`, and reading it as a pass is how a whole file failing to
 * load once reported ten verified tests.
 */
export function executedPasses(receipt: TestRunReceipt | null, ids: string[]): number {
  if (!receipt) return 0;
  const passed = new Set(receipt.verdicts.filter((v) => v.status === 'Passed').map((v) => v.id));
  return ids.filter((id) => passed.has(id)).length;
}
