import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { sha256Hex } from './artefact-digest';
import { readStoredDocumentation } from './process-documentation';
import { storedCoverageEstimate, storedTestSuite } from './test-suite-storage';
import { DOCUMENTATION_PACKAGE_FILES } from './workflow-steps';
import { projectTooLargeMessage, PROJECT_TOO_LARGE_CODE, type ProjectSizeCheck } from './firestore-doc-size';
import { planArtefactWrite, withStoredArtefacts, writeArtefactParts } from './project-artefact-store';
import { packageDigest, testSuiteBasisOf, TEST_SUITE_BASIS_FIELD, type TestSuiteBasis } from './test-suite-basis';
import type { AiModelRecord } from './ai-marking';

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
 *     manual requirements, in one write, as the Testing stage wrote them —
 *     with the package they were written for (`testSuiteBasis`,
 *     `lib/test-suite-basis.ts`, owner 16.10.2026).
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

/**
 * Roadmap 3.0.17 (AI Act Art. 50(2)): which provider and model wrote the
 * business layer and the test suite — the record of a receipt the route
 * verified (`lib/ai-marking.ts`), or null when none did. Written with every
 * write of the artefact, and read only while the artefact is on the project
 * (`lib/ai-authorship.ts`), so it never describes a text it did not write.
 */
export const BUSINESS_LAYER_MODEL_FIELD = 'businessDocumentationModel';
export const TEST_SUITE_MODEL_FIELD = 'testSuiteModel';

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

/**
 * The cleanup above rewrites `generatedCode` without changing a line of code
 * under test. A suite recorded against the package as it stood is still the
 * suite for the cleaned one, so its record moves with it — otherwise a
 * Documentation write would make Testing read stale.
 */
function carriedTestSuiteBasis(project: Record<string, unknown>, cleanup: { generatedCode?: string }): Record<string, unknown> {
  if (cleanup.generatedCode === undefined) return {};
  const basis = testSuiteBasisOf(project);
  if (!basis || basis.codeSha256 !== packageDigest(project.generatedCode)) return {};
  const carried: TestSuiteBasis = { ...basis, codeSha256: packageDigest(cleanup.generatedCode) };
  return { [TEST_SUITE_BASIS_FIELD]: carried };
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
    // written as the current one.
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
    // keyed to its step ids, so it goes with it.
    const cleanup = documentationPackageCleanup(project.generatedCode);
    return commit(
      tx, db, args.projectId, stored,
      { documentation, status: 'documented', businessDocumentation: '', ...cleanup, ...carriedTestSuiteBasis(project, cleanup) },
      'this documentation',
    );
  });
}

/** The SOP and RACI proposal (`action: 'business-layer'`). */
export async function storeBusinessLayer(
  db: Firestore,
  args: { projectId: string; uid: string; body: Record<string, unknown>; aiModel?: AiModelRecord | null },
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
    const layerFields = { businessDocumentation: layer, ...cleanup, ...carriedTestSuiteBasis(project, cleanup) };
    // Roadmap 3.0.17: who wrote this layer, beside it (null when no receipt verified).
    const outcome = await commit(
      tx, db, args.projectId, stored,
      { ...layerFields, [BUSINESS_LAYER_MODEL_FIELD]: args.aiModel ?? null },
      'this business documentation',
    );
    return outcome.status === 200 ? { ...outcome, kept: null } : outcome;
  });
}

/** The test scenarios and the suite (`action: 'test-suite'`). */
export async function storeTestSuite(
  db: Firestore,
  args: { projectId: string; uid: string; body: Record<string, unknown>; aiModel?: AiModelRecord | null },
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
  // The package the suite was written for (owner 16.10.2026): the digest of the
  // `generatedCode` the page built its prompt from. `null` is a page that had
  // none; a body without the key is a page from before the record, and its
  // suite is stored without one — unknown, which no reader turns into stale.
  const claimed = args.body.generatedCodeSha256;
  if (claimed !== undefined && claimed !== null && !(typeof claimed === 'string' && /^[0-9a-f]{64}$/.test(claimed))) {
    return { status: 400, code: 'bad-request', error: 'generatedCodeSha256 must be the SHA-256 of the generated package, or null.' };
  }
  const fields = {
    testCases,
    testSuite: storedTestSuite(args.body.testSuite),
    coverageEstimate: storedCoverageEstimate(args.body.coverageEstimate),
    manualTestingRequirements: manual,
    status: 'testing',
    [TEST_SUITE_MODEL_FIELD]: args.aiModel ?? null,
  };
  return inTransaction(db, args.projectId, args.uid, async (tx, stored, project) => {
    const refused = statusRefused(project);
    if (refused) return refused;
    if (claimed === undefined) return commit(tx, db, args.projectId, stored, { ...fields, [TEST_SUITE_BASIS_FIELD]: null }, 'this test suite');
    // Written for the package the page loaded. If a new Transformation was
    // stored meanwhile, this suite tests the previous package and is not
    // written as the current one.
    if (packageDigest(project.generatedCode) !== claimed) {
      return {
        status: 409,
        code: 'package-moved',
        error: 'The generated code of this project changed while the test suite was being written, so nothing was saved. Reload the stage and generate the suite again.',
      };
    }
    const basis: TestSuiteBasis = { codeSha256: claimed, recordedAt: new Date().toISOString() };
    return commit(tx, db, args.projectId, stored, { ...fields, [TEST_SUITE_BASIS_FIELD]: basis }, 'this test suite');
  });
}
