import { deriveBusinessRules } from './abap/business-rule-set';
import { deriveEngineCases, engineCaseOf, type EngineCaseDerivation, type EngineTestCase } from './testing-engine-cases';

/**
 * Which stored engine cases the engine can still show it wrote (QA review of
 * 2e6596ddbbc8, 0297134b3b87 and 3ea38fd51acf).
 *
 * `testCases` is client-writable (`firestore.rules`, the project update
 * allowlist), so `origin: 'engine'` on a stored case is a marker anybody with
 * write access can set. What the browser cannot forge is the derivation: the
 * engine cases are a pure function of the signed source
 * (`deriveEngineCases(source, deriveBusinessRules(source).rules)`). A stored
 * case counts as engine-derived only when the same id comes out of that
 * derivation with the same data; the export then ships the recomputed case,
 * never the stored one. Everything else is named as unverified.
 *
 * The same derivation gives the cases the caps left out. The count is only
 * said when it belongs to the cases on record: every stored engine case
 * reproduced, and the test phase not stale. Otherwise the reason is said.
 *
 * `VerifiedEngineCase` is the only input `engineCasesFile` and `planEngineRun`
 * take (QA e04537f4bb66, 0297134b3b87): a type no other module can produce
 * without a cast, because its brand is a symbol declared here and never
 * exported. `tests/qa-56bd195-harness.spec.ts` holds every other file to
 * having no such cast.
 */

declare const VERIFIED_ENGINE_CASE: unique symbol;

/** An engine case recomputed from the signed source — produced by `engineCaseProvenance` alone. */
export type VerifiedEngineCase = EngineTestCase & { readonly [VERIFIED_ENGINE_CASE]: true };

export interface EngineCaseProvenance {
  /** The recomputed cases whose stored twin matches, by id, in stored order; each id once. */
  verified: VerifiedEngineCase[];
  /**
   * Ids stored as engine cases that the derivation from the signed source does
   * not reproduce — and ids stored more than once (QA 663172392dc6): one
   * derivation yields each id once, so a second copy is not its output.
   */
  unverified: string[];
  /** Cases past the caps for the source the stored cases were derived from; null when that cannot be shown. */
  notCovered: { precision: number; guard: number } | null;
  /** Why `notCovered` is null, in words; null when it is not. */
  notCoveredReason: string | null;
}

/** JSON with the keys of every object sorted — Firestore does not keep map key order. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** The engine cases of a signed source, or null when there is none or it cannot be read. */
export function deriveEngineCasesOf(signedSource: string | null): EngineCaseDerivation | null {
  if (!signedSource) return null;
  try {
    return deriveEngineCases(signedSource, deriveBusinessRules(signedSource).rules);
  } catch {
    return null;
  }
}

export function engineCaseProvenance(
  stored: ReadonlyArray<Record<string, unknown>>,
  derivation: EngineCaseDerivation | null,
  testsStale = false,
): EngineCaseProvenance {
  const derived = new Map((derivation?.cases ?? []).map((c) => [c.id, c]));
  const verified: VerifiedEngineCase[] = [];
  const unverified: string[] = [];
  // How often each id is stored as an engine case: a duplicated id is no output of one derivation.
  const copies = new Map<string, number>();
  for (const tc of stored) {
    if (engineCaseOf(tc)) copies.set(String(tc.id ?? ''), (copies.get(String(tc.id ?? '')) ?? 0) + 1);
  }
  for (const tc of stored) {
    const data = engineCaseOf(tc);
    if (!data) continue;
    const id = String(tc.id ?? '');
    if ((copies.get(id) ?? 0) > 1) {
      if (!unverified.includes(id)) unverified.push(id);
      continue;
    }
    const twin = derived.get(id);
    const twinData = twin ? engineCaseOf(twin as unknown as Record<string, unknown>) : null;
    if (twin && twinData && canonical(twinData) === canonical(data)) verified.push(twin as VerifiedEngineCase);
    else unverified.push(id);
  }
  let notCovered: EngineCaseProvenance['notCovered'] = null;
  let notCoveredReason: string | null = null;
  if (testsStale) notCoveredReason = 'the scenarios on record were built for a previous source';
  else if (!derivation) notCoveredReason = 'there is no signed source to count them from';
  else if (unverified.length > 0) notCoveredReason = 'the engine cases on record do not match the signed source';
  else notCovered = derivation.notCovered;
  return { verified, unverified, notCovered, notCoveredReason };
}

/** "Engine cases past the caps: not counted — the scenarios on record were built for a previous source." */
export function engineCasesNotCountedSentence(reason: string): string {
  return `Engine cases past the caps: not counted — ${reason}.`;
}
