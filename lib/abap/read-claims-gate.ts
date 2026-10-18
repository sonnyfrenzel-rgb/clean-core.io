import { engineVersionAtLeast } from '../score-rule';

/**
 * The engine version from which the engine says only what it read (roadmap
 * 3.0.18, item 4a; QA review of 73b8cad63d3e):
 *
 *   - `FILE_OPEN_DIALOG` / `FILE_SAVE_DIALOG` choose a path and transfer no
 *     file: a dialog-only frontend file finding is no upload or download
 *     (`guiFileDirection`, `guiFileSentence`, `extensibility-router.ts`);
 *   - a local RFC call says what it is — a call in this system — and not that
 *     the called function is a released API, which the finding does not show
 *     (`onStackSentences`);
 *   - the Public Edition target is stated as the target's rule, not as a fact
 *     about the analysed code: selecting it does not make the code level A
 *     (`PUBLIC_TARGET_RULE_ASSUMPTION`);
 *   - the Side-by-Side track is not rated "Highly Compatible" or called a fit
 *     for "simple read-only reports" next to a direct write to an SAP standard
 *     table, which moving off the stack does not make valid
 *     (`routeExtensibility`);
 *   - a function module in a reserved `/namespace/` is neither called the
 *     customer's nor SAP's: the name does not say whose it is
 *     (`recommendArchitecture`, `code-assessment.ts`).
 *
 * Each changes what a run signs, so a run made by an older engine keeps the
 * words it was signed with: whatever rebuilds a signed run passes that run's
 * engine version. The corrections go live when `APP_VERSION`
 * (`lib/version.ts`) reaches this version. Same pattern as
 * `PRECISION_FIXES_FROM`.
 *
 * Pure: no imports beyond the version comparison.
 */
export const READ_CLAIMS_FROM = '3.0.18';

/** True when a run of this engine version carries the corrections. A missing or unreadable version does not. */
export function readClaimsApply(engineVersion: string | null | undefined): boolean {
  return engineVersionAtLeast(engineVersion, READ_CLAIMS_FROM);
}
