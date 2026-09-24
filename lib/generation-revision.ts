import { artefactDigest, sha256Hex } from './artefact-digest';
import { missingArtefacts, usableTestSuite, type GeneratedTestSuite, type ProjectFile } from './transformation-artefacts';

/**
 * Roadmap 3.0.11 — the generation is stored by the server, against the state
 * the page read **before** the model was asked (QA full review of 81810c8026e0,
 * `e649177b3894`, `c42de15e9c75`).
 *
 * The Transformation stage used to guard a generation with a per-tab ref and
 * then write `generatedCode`, `testSuite` and `status` from the browser, after a
 * binding whose compare-and-swap only covered the few milliseconds of its own
 * POST. Two tabs interleaving stored one tab's code under the other tab's
 * `codeSha256`; and the prompt was built from what the page had loaded, so code
 * computed from an old solution design could replace the stand of a newer one.
 *
 * The token closes both. `GET /api/projects/{id}/contract` returns it together
 * with the very inputs it covers; the page builds the prompt from those inputs
 * and hands the token back with the answer; the POST writes code, suite, status
 * and binding in one transaction, only if the token still describes the
 * project.
 *
 * **Why not the contract fingerprint.** The roadmap row suggested moving
 * `solutionDesign` into the fingerprint. The contract does not read the design —
 * it is derived from the run's evidence and its signed manifest — and its
 * fingerprint is bound elsewhere: every stored `generationBinding` names it, and
 * `contractManifestInput()` puts it into the manifest of the project decision
 * (8.4), whose fingerprint `lib/project-commands.ts` compares against a stored
 * one. Changing the canonical form would turn every existing binding and every
 * stored decision into "moved" overnight, for a field that is not part of what
 * the contract says. So the design is compared here, as a digest of its own,
 * beside the fingerprint rather than inside it.
 *
 * Pure: no Firestore, no `node:crypto` — the same function on both sides.
 */

/** Bumped only when the canonical form below changes. */
export const GENERATION_REVISION_VERSION = 1;

/** The project fields a generation is computed from or replaces. */
export interface GenerationRevisionState {
  legacyCode?: unknown;
  solutionDesign?: unknown;
  analysis?: unknown;
  generatedCode?: unknown;
  generationBinding?: unknown;
}

/** The prompt inputs, exactly as the token covers them. */
export interface GenerationInputs {
  legacyCode: string;
  solutionDesign: string;
  analysis: string;
}

const text = (v: unknown): string => (typeof v === 'string' ? v : '');
const digestOf = (v: unknown): string => (typeof v === 'string' && v.length > 0 ? sha256Hex(v) : 'none');

export function generationInputsOf(state: GenerationRevisionState): GenerationInputs {
  return {
    legacyCode: text(state.legacyCode),
    solutionDesign: text(state.solutionDesign),
    analysis: text(state.analysis),
  };
}

/**
 * The canonical form: one line per part, fixed order. Inputs enter as digests,
 * the way the contract's prose does — a separator in the text cannot break it.
 *
 * - `contract` — the direction; a new analysis or decision moves it.
 * - `source`, `design`, `analysis` — what the prompt is built from. The design
 *   is the one the contract does not cover.
 * - `stand`, `bound` — the generated package and the digest its binding names.
 *   A second tab that stored first moves both, so the late tab is refused
 *   instead of replacing a newer generation with its own.
 */
export function canonicalGenerationRevision(state: GenerationRevisionState, contractFingerprint: string): string {
  const binding = state.generationBinding as { codeSha256?: unknown } | null | undefined;
  const bound = binding && typeof binding === 'object' && typeof binding.codeSha256 === 'string' ? binding.codeSha256 : 'none';
  return [
    `v${GENERATION_REVISION_VERSION}`,
    `contract=${contractFingerprint}`,
    `source=${digestOf(state.legacyCode)}`,
    `design=${digestOf(state.solutionDesign)}`,
    `analysis=${digestOf(state.analysis)}`,
    `stand=${artefactDigest('generatedCode', state.generatedCode) ?? 'none'}`,
    `bound=${bound}`,
  ].join('\n');
}

/** The token the page reads before the model call and returns with the answer. */
export function generationRevision(state: GenerationRevisionState, contractFingerprint: string): string {
  return sha256Hex(canonicalGenerationRevision(state, contractFingerprint));
}

/** A package file the stage can show — the page's `isUsableFile`, on the server. */
const isUsableFile = (f: unknown): f is ProjectFile =>
  !!f &&
  typeof f === 'object' &&
  typeof (f as ProjectFile).path === 'string' &&
  (f as ProjectFile).path.trim().length > 0 &&
  typeof (f as ProjectFile).content === 'string' &&
  (f as ProjectFile).content.trim().length > 0;

/**
 * The server's own check of what it is asked to store as a finished
 * transformation. The page checks the model's answer before it sends it; the
 * server stores `status: 'transformed'` now, so it does not take that check on
 * faith.
 */
export function checkGeneratedPackage(
  generatedCode: string,
  testSuite: unknown,
  isAbapCloud: boolean,
): { ok: true; testSuite: GeneratedTestSuite } | { ok: false; error: string } {
  let files: unknown;
  try {
    files = JSON.parse(generatedCode);
  } catch {
    return { ok: false, error: 'The generated package is not the file list this stage stores.' };
  }
  if (!Array.isArray(files) || files.length === 0 || !files.every(isUsableFile)) {
    return { ok: false, error: 'The generated package is not the file list this stage stores.' };
  }
  const missing = missingArtefacts(files, isAbapCloud);
  if (missing.length > 0) {
    return { ok: false, error: `The generated package is incomplete. Missing: ${missing.join('; ')}.` };
  }
  const suite = usableTestSuite(testSuite, isAbapCloud);
  if (!suite) return { ok: false, error: 'The generated package came without its test suite.' };
  return { ok: true, testSuite: suite };
}
