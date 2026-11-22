import { engineVersionAtLeast } from '../score-rule';

/**
 * The engine version gate of the release after 3.2.0 — two engine defects of the engine review of 22.11.2026,
 * both in the evidence engine (`lib/abap/evidence-model.ts`), both changing signed findings or coverage:
 *
 *   - **ER-01: an embedded expression of a string template spans lines** (`tokenize`, option
 *     `multiLineTemplates`). The statement reader under the coverage, the findings and the table dependencies
 *     started its comment scan afresh on every line, so a template whose `{ … }` ran over several lines and whose
 *     last line held a `"` inside the template text was cut at that `"`: the closing `|` and the period were
 *     taken for a comment, and the rest of the file was swallowed into one statement. The coverage then reported
 *     no gap and `complete: true` over code it had never read. The comment scan now carries the literal state of
 *     the line before, so a `"` inside a template's text is text.
 *   - **ER-02: a dynamic `CALL FUNCTION name` whose name the source closes is read as the call of that module**
 *     (`resolveDynamicCalls`): a constant, a `DATA … VALUE '…'` the source never writes again, or a literal (or
 *     constant) assigned on the straight line right before the call. The catalog answers it like a literal call,
 *     and the call is no `dynamic-invocation` gap. A finding that names the module stands at the call, no longer
 *     at the `CONSTANTS` line while the call itself was listed as not determined. Any other write, a parameter, a
 *     second declaration or a branch between assignment and call leaves the call dynamic.
 *
 * A run of an older engine keeps what it signed: whatever rebuilds evidence passes the run's engine version to
 * `buildAbapEvidence`. The readings go live when `APP_VERSION` (`lib/version.ts`) reaches this version.
 *
 * Pure: no imports beyond the version comparison.
 */
export const ENGINE_READS_321_FROM = '3.2.1';

/** True when a run of this engine version carries the readings above. A missing or unreadable version does not. */
export function engineReads321Apply(engineVersion: string | null | undefined): boolean {
  return engineVersionAtLeast(engineVersion, ENGINE_READS_321_FROM);
}
