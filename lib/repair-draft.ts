import { sha256Hex } from './artefact-digest';
import { parseGeneratedPackage, replaceFileContent } from './generated-package';
import { applyRunnerVerdicts, type TestRunResult } from './test-verdicts';
import { isTestRunReceipt, testRunSubject, type TestRunReceipt } from './test-receipt';

/**
 * Repair drafts — roadmap 8.7 (CR-10).
 *
 * Why this exists. Auto-healing asks a model to repair the one file the
 * compiler named, then retries the run. Since E07-F02 `/api/run-tests` executes
 * what the project **stores** and ignores the code in the request body — for a
 * good reason: a caller could otherwise post a trivial suite and have its
 * verdict attributed to the project. The repair, though, only ever existed in
 * the browser's memory. The retry therefore ran the old, broken code again, and
 * every attempt ended in "nothing was saved" (roadmap, finding from 0.17).
 *
 * The fix is not to let the body back in. A repair becomes a **draft on the
 * server**: an immutable record written by the Admin SDK, naming the project
 * revision it descends from, carrying the full candidate code and suite and
 * their digests. The runner executes exactly one draft, by id, and nothing else
 * the caller says. The draft's receipt names the digests of what actually ran.
 * Adoption onto the project is a compare-and-swap: the project must still stand
 * where the draft was cut from, or nothing is written.
 *
 * Three promises this keeps together, none of which had to give way:
 *
 *   - **Nothing reaches the project before it compiles** (0.2): a draft without
 *     a compiled execution cannot be adopted.
 *   - **The runner runs only server-held code** (E07-F02): a draft is written by
 *     the server, is bound to one project and one owner, and cannot be edited.
 *   - **A receipt names what ran**: a draft run's receipt carries the draft's
 *     digests and its id, and only goes onto the project in the same
 *     transaction as the code it covers.
 *
 * What a draft is **not**: evidence. It is a candidate. Running one writes
 * nothing to the project — no verdicts, no receipt — so a draft cannot turn
 * Testing green by being tried. Only adoption can, and adoption takes the
 * draft's receipt with it only because after the swap the project holds exactly
 * the code that receipt names.
 *
 * Pure: no Firestore, no Next. The route and the store module call it; the
 * specs call it directly.
 */

/**
 * 2 since 3.0.12 (the `generation` target). A draft's version is part of its
 * digest, so a version-1 draft already on record stays intact and is read as
 * what it is; new drafts are written as version 2.
 */
export const REPAIR_DRAFT_VERSION = 2;
const READABLE_DRAFT_VERSIONS: readonly number[] = [1, 2];

/**
 * A generation candidate is one Firestore document as well (at most 1 MiB):
 * its code and suite together stay under this, with room for the other fields.
 */
export const GENERATION_DRAFT_MAX_BYTES = 900 * 1024;

/** Where drafts live. Not in `firestore.rules` — default deny, Admin SDK only. */
export const REPAIR_DRAFT_COLLECTION = 'repairDrafts';

/** The runner's own ceiling (`MAX_INPUT_BYTES` in `/api/run-tests`), held here too so a draft it would refuse is never cut. */
export const REPAIR_DRAFT_MAX_BYTES = 2 * 1024 * 1024;

/** How long a chain of repairs on repairs may get before it is someone else's problem. */
export const REPAIR_DRAFT_MAX_DEPTH = 4;

/**
 * The project revision a draft descends from. The four digests the receipt
 * already binds (`testRunSubject`) — so "the project still stands where the
 * draft was cut" and "the receipt still covers the project" are one comparison,
 * not two that could drift.
 */
export interface RepairDraftParent {
  runId: string | null;
  codeDigest: string | null;
  suiteDigest: string | null;
  casesDigest: string | null;
}

export type RepairDraftTarget =
  | { kind: 'package'; index: number; path: string }
  | { kind: 'module' }
  | { kind: 'test' }
  /**
   * 3.0.12 engine-led transformation (`docs/design/engine-led-transformation.md`
   * §13.1): a whole generated package that is not stored yet, sent to the
   * runner for its checks (`/api/run-tests` with `mode: 'verify'`). It has no
   * parent stand — it descends from no stored code — and it is never adopted:
   * a generation reaches the project only through the store of
   * `/api/projects/{id}/contract`, against its generation token.
   */
  | { kind: 'generation' };

export interface RepairDraft {
  v: number;
  draftId: string;
  projectId: string;
  /** The project revision this draft was cut from — the root of a chain, never an intermediate draft. */
  parent: RepairDraftParent;
  /** The draft this one repairs further, or `null` when it was cut from the project itself. */
  parentDraftId: string | null;
  depth: number;
  target: RepairDraftTarget;
  /** The whole candidate — every file of the package, not just the repaired one. */
  generatedCode: string;
  suiteCode: string;
  codeDigest: string | null;
  suiteDigest: string | null;
  /** Binds parent, lineage and content in one value — what adoption compares against. */
  draftDigest: string;
  createdAt: string;
  createdBy: string;
}

/**
 * What the runner records on the draft after an execution that compiled. Kept
 * beside the draft rather than folded into it: the draft's content never
 * changes; its execution record is what happened to it.
 */
export interface RepairDraftExecution {
  receipt: TestRunReceipt;
  /** The runner's own results, so adoption can lay them over the project's cases the way `/api/run-tests` does. */
  testResults: TestRunResult[];
}

export interface RepairDraftRefusal {
  ok: false;
  status: number;
  code: string;
  error: string;
}

const refuse = (status: number, code: string, error: string): RepairDraftRefusal => ({ ok: false, status, code, error });

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const byteLength = (s: string) => new TextEncoder().encode(s).length;

/** The suite source the runner executes: `code`, or `spec` when there is no `code` — the runner's own fallback. */
export function storedSuiteSource(testSuite: unknown): string {
  if (!isPlainObject(testSuite)) return '';
  if (typeof testSuite.code === 'string' && testSuite.code) return testSuite.code;
  if (typeof testSuite.spec === 'string' && testSuite.spec) return testSuite.spec;
  return '';
}

/**
 * The revision of a project as a draft names it.
 *
 * The suite is bound by the source the runner executes — `code`, or `spec`
 * when there is no `code` — not by the receipt's `code`-only digest: a parent
 * holding a spec-only suite otherwise names no suite at all, and a newer spec
 * written after the draft was cut would be overwritten on adoption (codex
 * code-trust-06). For a suite with `code` the two digests are the same, so
 * drafts already on record keep their parent; a draft cut from a spec-only
 * suite before this change named none and is refused as moved.
 */
export function projectRevision(project: Record<string, unknown>): RepairDraftParent {
  const subject = testRunSubject(project);
  const source = storedSuiteSource(project.testSuite);
  return { ...subject, suiteDigest: source.trim() ? candidateDigests('', source).suiteDigest : null };
}

/** The digests of a candidate, computed exactly as the receipt computes them. */
export function candidateDigests(code: string, suite: string): { codeDigest: string | null; suiteDigest: string | null } {
  const s = testRunSubject({ generatedCode: code, testSuite: { code: suite } });
  return { codeDigest: s.codeDigest, suiteDigest: s.suiteDigest };
}

/**
 * The digests of what a repair on the stored project starts from — the code and
 * the suite source the runner executes. The browser sends these as
 * `expectedCodeDigest`/`expectedSuiteDigest`; the server computes the same from
 * its own copy, and one function means the two cannot hash differently.
 */
export function repairBaseDigests(project: { generatedCode?: unknown; testSuite?: unknown }): {
  codeDigest: string | null;
  suiteDigest: string | null;
} {
  const code = typeof project.generatedCode === 'string' ? project.generatedCode : '';
  return candidateDigests(code, storedSuiteSource(project.testSuite));
}

export function computeDraftDigest(
  d: {
    parent: RepairDraftParent;
    parentDraftId: string | null;
    codeDigest: string | null;
    suiteDigest: string | null;
  },
  /** The draft's own version — a stored version-1 draft is checked as version 1. */
  version: number = REPAIR_DRAFT_VERSION,
): string {
  return sha256Hex(
    JSON.stringify([
      version,
      d.parent.runId,
      d.parent.codeDigest,
      d.parent.suiteDigest,
      d.parent.casesDigest,
      d.parentDraftId,
      d.codeDigest,
      d.suiteDigest,
    ]),
  );
}

/** Shape check of a stored draft, and whether its content still hashes to what it says. */
export function isIntactRepairDraft(value: unknown): value is RepairDraft {
  if (!isPlainObject(value)) return false;
  const d = value as Record<string, unknown>;
  if (typeof d.v !== 'number' || !READABLE_DRAFT_VERSIONS.includes(d.v)) return false;
  // A generation candidate exists only from version 2 on.
  if (isPlainObject(d.target) && d.target.kind === 'generation' && d.v < 2) return false;
  if (typeof d.draftId !== 'string' || typeof d.projectId !== 'string') return false;
  if (typeof d.generatedCode !== 'string' || typeof d.suiteCode !== 'string') return false;
  if (typeof d.draftDigest !== 'string' || !isPlainObject(d.parent)) return false;
  if (!(d.parentDraftId === null || typeof d.parentDraftId === 'string')) return false;
  const parent = d.parent as Record<string, unknown>;
  const nullableString = (x: unknown) => x === null || typeof x === 'string';
  if (!['runId', 'codeDigest', 'suiteDigest', 'casesDigest'].every((k) => nullableString(parent[k]))) return false;
  const now = candidateDigests(d.generatedCode, d.suiteCode);
  if (now.codeDigest !== d.codeDigest || now.suiteDigest !== d.suiteDigest) return false;
  return (
    computeDraftDigest(
      {
        parent: parent as unknown as RepairDraftParent,
        parentDraftId: d.parentDraftId as string | null,
        codeDigest: now.codeDigest,
        suiteDigest: now.suiteDigest,
      },
      d.v,
    ) === d.draftDigest
  );
}

/* ---------------------------------------------------------------- propose */

/**
 * What the browser sends to cut a draft: the base it repaired (by digest), which
 * file, and the model's answer for that one file. The server applies the answer
 * to **its own** copy of the base — the browser never sends the package.
 */
export interface ProposeRepairBody {
  /** `null` (or absent) — cut from the project; otherwise the draft being repaired further. */
  parentDraftId?: string | null;
  /** Digests of the base the browser repaired, as it read it. Compared, never trusted. */
  expectedCodeDigest: string | null;
  expectedSuiteDigest: string | null;
  target: RepairDraftTarget;
  content: string;
}

/** The base a new draft is built on, as the server read it. */
export interface RepairBase {
  code: string;
  suite: string;
  /** The project revision at the root of the chain. */
  parent: RepairDraftParent;
  parentDraftId: string | null;
  depth: number;
}

function readTarget(value: unknown): RepairDraftTarget | null {
  if (!isPlainObject(value)) return null;
  if (value.kind === 'module') return { kind: 'module' };
  if (value.kind === 'test') return { kind: 'test' };
  if (value.kind === 'generation') return { kind: 'generation' };
  if (
    value.kind === 'package' &&
    typeof value.index === 'number' &&
    Number.isInteger(value.index) &&
    value.index >= 0 &&
    typeof value.path === 'string' &&
    value.path.length > 0
  ) {
    return { kind: 'package', index: value.index, path: value.path };
  }
  return null;
}

/**
 * Cuts a draft from a base the server holds.
 *
 * Refuses, in words, when the browser repaired something other than what the
 * server holds (409 — another tab, a regeneration), when the named file is not
 * the file at that index, when the answer changes nothing, and when the
 * candidate would be too large for the runner. Returns the draft without an id;
 * the store assigns one.
 */
export function buildRepairDraft(
  body: unknown,
  base: RepairBase,
  actor: { uid: string; now: string; projectId: string },
): { ok: true; draft: Omit<RepairDraft, 'draftId'> } | RepairDraftRefusal {
  if (!isPlainObject(body)) return refuse(400, 'malformed', 'A repair draft is an object.');
  const target = readTarget(body.target);
  if (!target) return refuse(400, 'malformed-target', 'target must be { kind: "package", index, path }, { kind: "module" } or { kind: "test" }.');
  if (target.kind === 'generation') {
    return refuse(400, 'malformed-target', 'A generation candidate is proposed whole (buildGenerationDraft), not as a repair of the stored code.');
  }
  const content = body.content;
  if (typeof content !== 'string' || content.trim().length === 0) {
    return refuse(400, 'empty-repair', 'The repair is empty. Nothing was drafted.');
  }
  if (base.depth + 1 > REPAIR_DRAFT_MAX_DEPTH) {
    return refuse(409, 'chain-too-long', `This repair would be the ${base.depth + 1}th on top of the stored code. Nothing was drafted; regenerate the code instead.`);
  }

  const baseDigests = candidateDigests(base.code, base.suite);
  if (body.expectedCodeDigest !== baseDigests.codeDigest || body.expectedSuiteDigest !== baseDigests.suiteDigest) {
    return refuse(
      409,
      'base-moved',
      base.parentDraftId
        ? `The repair was made on a different version of draft ${base.parentDraftId} than the server holds. Nothing was drafted.`
        : 'The generated code or test suite on this project changed after the repair was requested — another tab or a regeneration. Nothing was drafted; run the tests again on what is stored now.',
    );
  }

  let code = base.code;
  let suite = base.suite;
  if (target.kind === 'package') {
    const pkg = parseGeneratedPackage(base.code);
    if (!pkg) return refuse(409, 'not-a-package', 'The stored code is not a multi-file package, so there is no file to replace. Nothing was drafted.');
    if (target.index >= pkg.length || pkg[target.index].path !== target.path) {
      return refuse(409, 'file-moved', `There is no file ${target.path} at position ${target.index} in the stored package. Nothing was drafted.`);
    }
    code = replaceFileContent(pkg, target.index, content);
  } else if (target.kind === 'module') {
    if (parseGeneratedPackage(base.code)) {
      return refuse(409, 'is-a-package', 'The stored code is a multi-file package; a repair replaces one of its files, not the whole package. Nothing was drafted.');
    }
    code = content;
  } else {
    suite = content;
  }

  if (code === base.code && suite === base.suite) {
    return refuse(422, 'no-change', 'The repair is identical to what it repairs. Nothing was drafted.');
  }
  if (byteLength(code) + byteLength(suite) > REPAIR_DRAFT_MAX_BYTES) {
    return refuse(413, 'too-large', 'The repaired code and suite together exceed what the test runner accepts. Nothing was drafted.');
  }

  const digests = candidateDigests(code, suite);
  const parentDraftId = base.parentDraftId;
  return {
    ok: true,
    draft: {
      v: REPAIR_DRAFT_VERSION,
      projectId: actor.projectId,
      parent: base.parent,
      parentDraftId,
      depth: base.depth + 1,
      target,
      generatedCode: code,
      suiteCode: suite,
      codeDigest: digests.codeDigest,
      suiteDigest: digests.suiteDigest,
      draftDigest: computeDraftDigest({ parent: base.parent, parentDraftId, ...digests }),
      createdAt: actor.now,
      createdBy: actor.uid,
    },
  };
}

/* -------------------------------------------------- generation candidates */

/**
 * Cuts a generation candidate (3.0.12): the whole package the engine-led
 * transformation assembled — scaffold plus filled bodies — before it is
 * stored, so the runner can check it (`/api/run-tests`, `mode: 'verify'`).
 *
 * Unlike a repair it is sent whole, because there is no stored stand it
 * descends from; the runner still executes only what the server holds (this
 * draft, by id). Its parent names the active run and no stand — the code,
 * suite and case digests are null — and it can never be adopted
 * (`decideAdoption`). Running it writes nothing onto the project.
 */
export function buildGenerationDraft(
  body: unknown,
  project: Record<string, unknown>,
  actor: { uid: string; now: string; projectId: string },
): { ok: true; draft: Omit<RepairDraft, 'draftId'> } | RepairDraftRefusal {
  if (!isPlainObject(body)) return refuse(400, 'malformed', 'A generation candidate is an object.');
  const code = body.generatedCode;
  if (typeof code !== 'string' || code.trim().length === 0) {
    return refuse(400, 'empty-candidate', 'The generation candidate holds no code. Nothing was drafted.');
  }
  if (!parseGeneratedPackage(code)) {
    return refuse(400, 'not-a-package', 'A generation candidate is a multi-file package (a JSON list of { path, content }). Nothing was drafted.');
  }
  const suite = typeof body.suiteCode === 'string' ? body.suiteCode : '';
  if (byteLength(code) + byteLength(suite) > GENERATION_DRAFT_MAX_BYTES) {
    return refuse(413, 'too-large', 'The generation candidate is larger than one draft may hold. Nothing was drafted.');
  }
  const parent: RepairDraftParent = {
    runId: projectRevision(project).runId,
    codeDigest: null,
    suiteDigest: null,
    casesDigest: null,
  };
  const digests = candidateDigests(code, suite);
  return {
    ok: true,
    draft: {
      v: REPAIR_DRAFT_VERSION,
      projectId: actor.projectId,
      parent,
      parentDraftId: null,
      depth: 0,
      target: { kind: 'generation' },
      generatedCode: code,
      suiteCode: suite,
      codeDigest: digests.codeDigest,
      suiteDigest: digests.suiteDigest,
      draftDigest: computeDraftDigest({ parent, parentDraftId: null, ...digests }),
      createdAt: actor.now,
      createdBy: actor.uid,
    },
  };
}

/** The draft is a generation candidate (checked by `/api/run-tests` in verify mode only). */
export function isGenerationDraft(draft: Pick<RepairDraft, 'target'>): boolean {
  return draft.target?.kind === 'generation';
}

/* ------------------------------------------------- generation repair rounds */

/**
 * The repair loop of a generation (`docs/design/engine-led-transformation.md`
 * §13.2), as a decision: after each check, either stop — and why — or send
 * exactly the failing functions back, with their failure, for one more round.
 *
 * Stop rules, in this order:
 *   1. `passed`      — nothing fails;
 *   2. `no-progress` — the same functions fail with the same failures as before
 *                      the last round (a round that fixed nothing);
 *   3. `lease`       — the lease ended (expired, closed, refused);
 *   4. `budget`      — no model call is left in the lease;
 *   5. `round-limit` — two rounds are done.
 * Failures in engine-written code never reach this decision (they are
 * scaffold findings, §13.2 step 2); a unit the model declined or could not
 * answer twice is not in `failing` (it stays a stub).
 *
 * Gate repairs (owner decision 14.10.2026, quality over cost; a call costs
 * ≈ $0.005): with `gate`, the units that fail the gate — the activation check's
 * parser/syntax errors (RAP), the type check's errors (Node) — get more: when
 * the lease's budget is used they may still go back on its gate-repair calls
 * (`gate.callsLeft`, at most 16), and after round 2 they alone get a third
 * round with the gate's mapped reasons only. Every other failure stops where it
 * did. A unit going back for a gate error is marked `gate`, and its gate
 * failures lead its failure text, so the 2,000-character cut never drops them.
 */
export const GENERATION_REPAIR_MAX_ROUNDS = 2;
/** The third round, for units that fail the gate only (owner decision 14.10.2026). */
export const GENERATION_GATE_REPAIR_ROUND = 3;
export const GENERATION_REPAIR_FAILURE_MAX_CHARS = 2_000;

export type GenerationRepairStop = 'passed' | 'no-progress' | 'lease' | 'budget' | 'round-limit';

export type GenerationRepairDecision =
  | { kind: 'stop'; reason: GenerationRepairStop; signature: string }
  | { kind: 'repair'; round: 1 | 2 | 3; units: Array<{ unitId: string; failure: string; gate?: boolean }>; signature: string };

/** One value for "these functions fail with these failures" — what "the same failures twice" compares. */
export function failureSignature(failing: ReadonlyArray<{ unitId: string; failures: readonly string[] }>): string {
  return failing
    .map((f) => `${f.unitId}\u0000${[...f.failures].sort().join('\u0001')}`)
    .sort()
    .join('\u0002');
}

export function decideGenerationRepair(input: {
  roundsDone: number;
  failing: ReadonlyArray<{ unitId: string; failures: readonly string[] }>;
  /** The signature before the last round, or null before round 1. */
  previousSignature: string | null;
  /** Calls left of the lease's budget. */
  callsLeft: number;
  leaseEnded: boolean;
  /**
   * Gate repairs (owner decision 14.10.2026): which failure line is a gate error, and the lease's gate-repair
   * calls still left. Absent: two rounds within the budget, as before.
   */
  gate?: { isGate: (failure: string) => boolean; callsLeft: number };
}): GenerationRepairDecision {
  const signature = failureSignature(input.failing);
  if (input.failing.length === 0) return { kind: 'stop', reason: 'passed', signature };
  if (input.previousSignature !== null && signature === input.previousSignature) return { kind: 'stop', reason: 'no-progress', signature };
  if (input.leaseEnded) return { kind: 'stop', reason: 'lease', signature };
  const gate = input.gate;
  const gateOf = (f: readonly string[]) => (gate ? f.filter((x) => gate.isGate(x)) : []);
  const gateUnits = input.failing.filter((f) => gateOf(f.failures).length > 0);
  // The gate's reasons first, so the cut at 2,000 characters keeps them; in the gate's own round, only they.
  const failure = (f: readonly string[], onlyGate = false) => {
    const g = gateOf(f);
    const text = (onlyGate ? g : [...g, ...f.filter((x) => !g.includes(x))]).join('\n');
    return text.length > GENERATION_REPAIR_FAILURE_MAX_CHARS ? `${text.slice(0, GENERATION_REPAIR_FAILURE_MAX_CHARS - 1)}…` : text;
  };
  const gateRound = (round: 1 | 2 | 3): GenerationRepairDecision => ({
    kind: 'repair',
    round,
    units: gateUnits.map((f) => ({ unitId: f.unitId, failure: failure(f.failures, round === GENERATION_GATE_REPAIR_ROUND), gate: true })),
    signature,
  });
  if (input.callsLeft <= 0) {
    // The budget is used: only units failing the gate may go on, on the gate-repair calls.
    if (gate && gateUnits.length > 0 && gate.callsLeft > 0 && input.roundsDone < GENERATION_GATE_REPAIR_ROUND) {
      return gateRound((input.roundsDone + 1) as 1 | 2 | 3);
    }
    return { kind: 'stop', reason: 'budget', signature };
  }
  if (input.roundsDone >= GENERATION_REPAIR_MAX_ROUNDS) {
    if (gate && gateUnits.length > 0 && input.roundsDone < GENERATION_GATE_REPAIR_ROUND) return gateRound(GENERATION_GATE_REPAIR_ROUND);
    return { kind: 'stop', reason: 'round-limit', signature };
  }
  return {
    kind: 'repair',
    round: (input.roundsDone + 1) as 1 | 2,
    units: input.failing.map((f) => ({ unitId: f.unitId, failure: failure(f.failures), ...(gateOf(f.failures).length > 0 ? { gate: true } : {}) })),
    signature,
  };
}

/* ------------------------------------------------------------------ adopt */

export interface AdoptRepairBody {
  draftId: string;
  /** The draft the reader saw run. Compared with the stored one, never trusted. */
  expectedDraftDigest: string;
}

export interface AdoptionWrite {
  ok: true;
  /** The exact fields to merge onto the project. */
  fields: Record<string, unknown>;
}

const PARENT_FIELDS: Array<[keyof RepairDraftParent, string]> = [
  ['runId', 'the signed analysis run'],
  ['codeDigest', 'the generated code'],
  ['suiteDigest', 'the test suite'],
  ['casesDigest', 'the list of test cases'],
];

/**
 * The compare-and-swap. Called inside the transaction that reads both the
 * project and the draft, so what is compared is what the write is conditional on.
 *
 * Adopts only a draft that is intact, not yet adopted, has a compiled execution
 * whose receipt names exactly this draft, and whose parent revision is still
 * the project's revision — run, code, suite and cases. Anything else is 409 and
 * a sentence; nothing is written and nothing is moved onto a newer state.
 */
export function decideAdoption(
  body: unknown,
  project: Record<string, unknown>,
  stored: { draft: unknown; execution: unknown; adoptedAt: unknown },
): AdoptionWrite | RepairDraftRefusal {
  if (!isPlainObject(body)) return refuse(400, 'malformed', 'An adoption is an object.');
  if (typeof body.draftId !== 'string' || body.draftId.length === 0) {
    return refuse(400, 'missing-draft', 'Name the draft to adopt: draftId.');
  }
  if (typeof body.expectedDraftDigest !== 'string' || body.expectedDraftDigest.length === 0) {
    return refuse(400, 'missing-draft-digest', 'Name the draft as you saw it run: expectedDraftDigest.');
  }
  const draft = stored.draft;
  if (!isIntactRepairDraft(draft) || draft.draftId !== body.draftId) {
    return refuse(409, 'draft-unreadable', `Draft ${body.draftId} could not be read as an intact repair draft. Nothing was adopted.`);
  }
  if (draft.target.kind === 'generation') {
    return refuse(
      409,
      'generation-not-adoptable',
      `Draft ${draft.draftId} is a generation candidate checked before storing. A generation is stored with its generation token, never adopted; nothing was adopted.`,
    );
  }
  if (draft.draftDigest !== body.expectedDraftDigest) {
    return refuse(409, 'draft-mismatch', `Draft ${draft.draftId} is not the draft you saw run. Nothing was adopted.`);
  }
  if (stored.adoptedAt) {
    return refuse(409, 'already-adopted', `Draft ${draft.draftId} has already been adopted. Nothing was written twice.`);
  }

  const exec = stored.execution as Partial<RepairDraftExecution> | null | undefined;
  const receipt = exec && isTestRunReceipt(exec.receipt) ? exec.receipt : null;
  if (!receipt || !Array.isArray(exec?.testResults)) {
    return refuse(409, 'not-executed', `Draft ${draft.draftId} has not been run to the end yet. A repair is adopted only after a run shows it compiles; nothing was adopted.`);
  }
  if (
    receipt.codeDigest !== draft.codeDigest ||
    receipt.suiteDigest !== draft.suiteDigest ||
    receipt.draft?.id !== draft.draftId ||
    receipt.draft?.digest !== draft.draftDigest
  ) {
    return refuse(409, 'receipt-mismatch', `The run recorded on draft ${draft.draftId} did not execute this draft's code. Nothing was adopted.`);
  }

  const now = projectRevision(project);
  const moved = PARENT_FIELDS.filter(([k]) => now[k] !== draft.parent[k]).map(([, label]) => label);
  if (moved.length > 0) {
    return refuse(
      409,
      'parent-moved',
      `This repair was drafted on a version of the project that is no longer the current one: ${moved.join(', ')} changed since. ` +
        'Nothing was adopted and nothing was merged onto the newer state. Run the tests again on what is stored now.',
    );
  }
  if (receipt.runId !== now.runId || receipt.casesDigest !== now.casesDigest) {
    return refuse(409, 'receipt-mismatch', `The run recorded on draft ${draft.draftId} belongs to a different analysis run or case list. Nothing was adopted.`);
  }

  const fields: Record<string, unknown> = {};
  const storedCode = typeof project.generatedCode === 'string' ? project.generatedCode : '';
  if (draft.generatedCode !== storedCode) fields.generatedCode = draft.generatedCode;
  const storedSuite = isPlainObject(project.testSuite) ? project.testSuite : {};
  if (storedSuite.code !== draft.suiteCode) fields.testSuite = { ...storedSuite, code: draft.suiteCode };

  const storedCases = (Array.isArray(project.testCases) ? project.testCases : []).filter(
    (t): t is Record<string, unknown> => isPlainObject(t),
  );
  if (storedCases.length > 0) {
    fields.testCases = applyRunnerVerdicts(storedCases, exec!.testResults as TestRunResult[], receipt.exitCode);
  }
  fields.testRunReceipt = receipt;
  return { ok: true, fields };
}
