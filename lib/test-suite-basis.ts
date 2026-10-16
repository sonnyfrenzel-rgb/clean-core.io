/**
 * Which generated package the Testing stage wrote its suite for — owner
 * request 16.10.2026 ("wenn ich eine neue Transformation mache muss Testing
 * 'out of date' werden, oder?").
 *
 * Before this, Testing read stale only when the SOURCE changed. Regenerating
 * the Transformation package left the test cases, the suite and the stage's
 * state looking current, although they were written for — and run against —
 * the previous package.
 *
 * `/api/projects/{id}/artefacts` (`action: 'test-suite'`,
 * `lib/project-artefact-writes.ts`) now records, in the same write as the
 * suite, the digest of the package the browser generated the suite from
 * (`testSuiteBasis.codeSha256`, checked there against the package the server
 * holds at commit). `staleness()` in `lib/workflow-steps.ts` compares it with
 * the package on the project now: a different package means the suite was
 * written for a previous one.
 *
 * A suite stored before this record existed carries none, and is read as it
 * always was — not stale for a package change. The same rule as a run signed
 * before its input manifest: nothing recorded to compare is reported as
 * unknown, never guessed at, and a deploy does not turn every existing project
 * stale.
 *
 * The field is written by the server only (Admin SDK); it is not in the client
 * update allowlist of `firestore.rules`. Not a security boundary — like every
 * artefact digest (`lib/artefact-digest.ts`), it guards against reusing what
 * nobody regenerated, not against a forged write.
 *
 * Pure: imported by the browser (the hook, the phase contract) and the server.
 */

import { sha256Hex } from './artefact-digest';
import { artefactIndexOf } from './project-artefacts';

/** The project field. */
export const TEST_SUITE_BASIS_FIELD = 'testSuiteBasis';

export interface TestSuiteBasis {
  /** SHA-256 of the stored `generatedCode` the suite was written for; `null` when there was none. */
  codeSha256: string | null;
  /** ISO time of the write. */
  recordedAt: string;
}

/** The digest a package is named by: SHA-256 of the stored string, `null` for none. */
export function packageDigest(generatedCode: unknown): string | null {
  return typeof generatedCode === 'string' && generatedCode.trim() ? sha256Hex(generatedCode) : null;
}

/**
 * The record on a project, or `null` when there is none — a suite stored before
 * the record existed, a project without a suite, or a malformed value.
 */
export function testSuiteBasisOf(project: unknown): TestSuiteBasis | null {
  if (!project || typeof project !== 'object') return null;
  const raw = (project as Record<string, unknown>)[TEST_SUITE_BASIS_FIELD];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (r.codeSha256 !== null && !(typeof r.codeSha256 === 'string' && /^[0-9a-f]{64}$/.test(r.codeSha256))) return null;
  return { codeSha256: r.codeSha256 as string | null, recordedAt: typeof r.recordedAt === 'string' ? r.recordedAt : '' };
}

/**
 * Was the stored suite written for a package that is no longer the one on the
 * project? False when no record exists (unknown is not stale).
 */
export function testedPackageMoved(project: unknown): boolean {
  const basis = testSuiteBasisOf(project);
  if (!basis) return false;
  const p = project as Record<string, unknown>;
  // A package kept beside the project (`lib/project-artefacts.ts`) that this
  // reader did not join — a bare project document, a list row whose artefacts
  // could not be read — is not known here, and unknown is not stale.
  if (typeof p.generatedCode !== 'string' && (p._artefactsUnread === true || artefactIndexOf(p).generatedCode)) return false;
  return packageDigest(p.generatedCode) !== basis.codeSha256;
}

/** The phrase every sentence about a suite stale for this reason uses. */
export const PREVIOUS_PACKAGE = 'a previous generated package';
