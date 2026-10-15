import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { sha256Hex } from './artefact-digest';
import { readStoredDocumentation } from './process-documentation';
import { storedCoverageEstimate, storedTestSuite } from './test-suite-storage';
import { DOCUMENTATION_PACKAGE_FILES } from './workflow-steps';
import { projectTooLargeMessage, PROJECT_TOO_LARGE_CODE, type ProjectSizeCheck } from './firestore-doc-size';
import { planArtefactWrite, withStoredArtefacts, writeArtefactParts } from './project-artefact-store';

/**
 * The three artefact writes the browser used to make itself — roadmap 3.0.14,
 * item 9. Since the large artefacts live in documents no browser may touch
 * (`lib/project-artefacts.ts`), the Documentation and Testing stages hand what
 * they built to `POST /api/projects/{id}/artefacts`, and the transactions they
 * ran in the browser run here, with the same preconditions and the same
 * sentences:
 *
 *   - `documentation`: the process description read from the code. Written
 *     only while the project still has the run and the source it was read
 *     from; the business layer of the description it replaces goes with it.
 *   - `business-layer`: the SOP and RACI proposal. Written only while the
 *     project still has the run and the description it was written from; a
 *     layer another tab stored meanwhile is kept, unless this write was asked
 *     to replace exactly that one.
 *   - `test-suite`: the scenarios, the suite, the coverage estimate and the
 *     manual requirements, in one write, as the Testing stage wrote them.
 *
 * Both documentation writes take the files an earlier build merged into the
 * package back out (`documentationPackageCleanup`, roadmap 3.0.7, item 4).
 *
 * What `firestore.rules` checked on these fields from the browser is checked
 * here: the owner, the status transition (`isValidProjectFieldChange`), the
 * shape of the suite and the estimate, the size of each list and text. The
 * documentation is now held to its engine form on the way in, which the rules
 * could not do.
 *
 * `db` is a parameter so the specs run every path against the emulator without
 * a server — the shape of `lib/repair-draft-store.ts`.
 */

/** The stored statuses after which a stage may set its own (`isValidProjectFieldChange`). */
const STATUS_AFTER_ANALYSIS = ['analyzed', 'designed', 'transformed', 'testing', 'documented', 'completed'];

/** The bound `firestore.rules` set on these texts from the browser. */
const MAX_TEXT_CHARS = 999_999;
const MAX_TEST_CASES = 99;
const MAX_MANUAL_REQUIREMENTS = 500;

export type ArtefactWriteOutcome =
  | { status: 200; fields: Record<string, unknown>; kept?: string | null }
  | { status: number; code: string; error: string; check?: ProjectSizeCheck };

const NOT_FOUND = { status: 404, code: 'not-found', error: 'Project not found.' } as const;

/**
 * Roadmap 3.0.7 ("Documentation lean", item 4) — the Documentation stage used to
 * merge its two Markdown files into `generatedCode`; a write of this stage takes
 * the files an earlier build put there back out (`{}` when there are none, so
 * nothing else of the package is ever touched). Moved here from the stage with
 * the writes.
 */
export function documentationPackageCleanup(generatedCode: unknown): { generatedCode?: string } {
  if (typeof generatedCode !== 'string') return {};
  try {
    const parsed: unknown = JSON.parse(generatedCode);
    if (!Array.isArray(parsed)) return {};
    const kept = parsed.filter((f) => !(f && typeof f === 'object' && DOCUMENTATION_PACKAGE_FILES.includes(String((f as { path?: unknown }).path))));
    return kept.length === parsed.length ? {} : { generatedCode: JSON.stringify(kept) };
  } catch {
    // A flat source from before packages: nothing of this stage is in it.
    return {};
  }
}

/** The digest a stage names a stored text by: `null` for none. */
export const textDigest = (value: unknown): string | null => (typeof value === 'string' ? sha256Hex(value) : null);

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

function tooLarge(check: ProjectSizeCheck, what: string): ArtefactWriteOutcome {
  return { status: 413, code: PROJECT_TOO_LARGE_CODE, error: projectTooLargeMessage(check, what), check };
}

/**
 * Read the project in the transaction, check the owner, and hand the stored
 * document (for the size guard and the index) and the filled-in one (for the
 * comparisons) to `decide`.
 */
async function inTransaction(
  db: Firestore,
  projectId: string,
  uid: string,
  decide: (tx: Transaction, stored: Record<string, unknown>, project: Record<string, unknown>) => Promise<ArtefactWriteOutcome>,
): Promise<ArtefactWriteOutcome> {
  const projectRef = db.collection('projects').doc(projectId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(projectRef);
    if (!snap.exists) return NOT_FOUND;
    const stored = (snap.data() || {}) as Record<string, unknown>;
    if (stored.userId !== uid) return NOT_FOUND;
    const project = await withStoredArtefacts(tx, projectRef, stored);
    return decide(tx, stored, project);
  });
}

async function commit(
  tx: Transaction,
  db: Firestore,
  projectId: string,
  stored: Record<string, unknown>,
  fields: Record<string, unknown>,
  what: string,
): Promise<ArtefactWriteOutcome> {
  const projectRef = db.collection('projects').doc(projectId);
  const planned = await planArtefactWrite(projectRef, stored, fields, 'update');
  if (!planned.ok) return tooLarge(planned.check, what);
  tx.update(projectRef, planned.plan.projectFields);
  writeArtefactParts(tx, planned.plan);
  return { status: 200, fields };
}

function statusRefused(project: Record<string, unknown>): ArtefactWriteOutcome | null {
  return STATUS_AFTER_ANALYSIS.includes(String(project.status ?? ''))
    ? null
    : { status: 409, code: 'not-analysed', error: 'This project has no analysis on record, so nothing was saved. Run the analysis in stage 1 first.' };
}

/** The process description read from the code (`action: 'documentation'`). */
export async function storeDocumentation(
  db: Firestore,
  args: { projectId: string; uid: string; body: Record<string, unknown> },
): Promise<ArtefactWriteOutcome> {
  const documentation = str(args.body.documentation);
  const fromRunId = str(args.body.fromRunId);
  const sourceSha256 = str(args.body.sourceSha256);
  if (!documentation || !fromRunId || !sourceSha256) {
    return { status: 400, code: 'bad-request', error: 'Expected { documentation, fromRunId, sourceSha256 }.' };
  }
  if (documentation.length > MAX_TEXT_CHARS) {
    return { status: 413, code: 'too-large', error: `The documentation is larger than the ${MAX_TEXT_CHARS} characters a project stores.` };
  }
  // The reader of the stored value is the gate: what is written must read back
  // as an engine document, or nothing is written.
  if (readStoredDocumentation(documentation).kind !== 'engine') {
    return { status: 400, code: 'not-engine-documentation', error: 'The documentation could not be put together from this source, so nothing was saved.' };
  }
  return inTransaction(db, args.projectId, args.uid, async (tx, stored, project) => {
    // Built from the source of the run the page loaded. A second tab can
    // re-analyse in between; then it describes an earlier run and is not
    // written as the current one (QA review of 4b4586aff273).
    if (project.activeRunId !== fromRunId || textDigest(project.legacyCode) !== sourceSha256) {
      return {
        status: 409,
        code: 'analysis-moved',
        error: 'The analysis of this project changed while the documentation was being put together, so nothing was saved. Reload the stage and generate it again.',
      };
    }
    const refused = statusRefused(project);
    if (refused) return refused;
    // The business layer was written from the documentation this replaces,
    // keyed to its step ids, so it goes with it (QA full review 96b39ec78c97).
    const cleanup = documentationPackageCleanup(project.generatedCode);
    return commit(tx, db, args.projectId, stored, { documentation, status: 'documented', businessDocumentation: '', ...cleanup }, 'this documentation');
  });
}

/** The SOP and RACI proposal (`action: 'business-layer'`). */
export async function storeBusinessLayer(
  db: Firestore,
  args: { projectId: string; uid: string; body: Record<string, unknown> },
): Promise<ArtefactWriteOutcome> {
  const layer = str(args.body.businessDocumentation);
  const fromRunId = str(args.body.fromRunId);
  const documentationSha256 = args.body.documentationSha256 === null ? null : str(args.body.documentationSha256);
  const replacingSha256 = args.body.replacingSha256 === null || args.body.replacingSha256 === undefined ? null : str(args.body.replacingSha256);
  if (!layer || !layer.trim() || !fromRunId) {
    return { status: 400, code: 'bad-request', error: 'Expected { businessDocumentation, fromRunId, documentationSha256, replacingSha256 }.' };
  }
  if (layer.length > MAX_TEXT_CHARS) {
    return { status: 413, code: 'too-large', error: `The business documentation is larger than the ${MAX_TEXT_CHARS} characters a project stores.` };
  }
  return inTransaction(db, args.projectId, args.uid, async (tx, stored, project) => {
    // Written from this run's documentation; if another tab re-analysed or
    // rewrote the documentation meanwhile, it describes something else and is
    // not stored (0f6472d80f3f).
    if (project.activeRunId !== fromRunId || textDigest(project.documentation) !== documentationSha256) {
      return {
        status: 409,
        code: 'documentation-moved',
        error: 'The analysis or the documentation of this project changed while the business layer was being written, so nothing was saved. Reload the stage and generate it again.',
      };
    }
    // Another browser stored a layer for this documentation meanwhile: that one
    // is kept, and shown, instead of being written over. A regeneration
    // replaces the layer it was asked for, and only that one.
    const current = project.businessDocumentation;
    if (typeof current === 'string' && current.trim() && (replacingSha256 === null || sha256Hex(current) !== replacingSha256)) {
      return { status: 200, fields: {}, kept: current };
    }
    const cleanup = documentationPackageCleanup(project.generatedCode);
    const outcome = await commit(tx, db, args.projectId, stored, { businessDocumentation: layer, ...cleanup }, 'this business documentation');
    return outcome.status === 200 ? { ...outcome, kept: null } : outcome;
  });
}

/** The test scenarios and the suite (`action: 'test-suite'`). */
export async function storeTestSuite(
  db: Firestore,
  args: { projectId: string; uid: string; body: Record<string, unknown> },
): Promise<ArtefactWriteOutcome> {
  const { testCases, manualTestingRequirements } = args.body;
  if (!Array.isArray(testCases) || testCases.length === 0 || !testCases.every((t) => t && typeof t === 'object' && !Array.isArray(t))) {
    return { status: 400, code: 'bad-request', error: 'Expected { testCases, testSuite, coverageEstimate, manualTestingRequirements } with at least one scenario.' };
  }
  if (testCases.length > MAX_TEST_CASES) {
    return { status: 400, code: 'too-many-cases', error: `A suite holds at most ${MAX_TEST_CASES} scenarios.` };
  }
  const manual = manualTestingRequirements === undefined ? [] : manualTestingRequirements;
  if (!Array.isArray(manual) || manual.length > MAX_MANUAL_REQUIREMENTS) {
    return { status: 400, code: 'bad-request', error: `manualTestingRequirements must be a list of at most ${MAX_MANUAL_REQUIREMENTS} entries.` };
  }
  // Exactly the keys of TestSuite and CoverageEstimate, typed and bounded — the
  // shape the rules accepted from the browser (isValidTestSuite,
  // isValidCoverageEstimate).
  const fields = {
    testCases,
    testSuite: storedTestSuite(args.body.testSuite),
    coverageEstimate: storedCoverageEstimate(args.body.coverageEstimate),
    manualTestingRequirements: manual,
    status: 'testing',
  };
  return inTransaction(db, args.projectId, args.uid, async (tx, stored, project) => {
    const refused = statusRefused(project);
    if (refused) return refused;
    return commit(tx, db, args.projectId, stored, fields, 'this test suite');
  });
}
