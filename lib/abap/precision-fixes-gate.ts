import { engineVersionAtLeast } from '../score-rule';

/**
 * The engine version from which the corrections of roadmap 3.0.13 run:
 *
 *   - `DESTINATION 'NONE'` is read as the whole literal: `'NONE''X'` (the
 *     destination NONE'X) is another destination, and the backtick literal
 *     `` `NONE` `` is the local one, as the router already reads it
 *     (`rfcDestinationOf` in `evidence-model.ts`, `rfcCallTarget` in
 *     `extensibility-router.ts`);
 *   - a direct write to an SAP standard table is named in the route's
 *     rationale and the In-App track whichever finding chose the route — an
 *     outbound RFC, a modification or a custom-table write no longer hides it
 *     (`extensibility-router.ts`);
 *   - a `FILE_VALIDATE_NAME` / `FILE_GET_NAME` call covers a file path only
 *     when its failure stops the program: without `EXCEPTIONS` (an unhandled
 *     exception ends the program), or with them and the very next statement
 *     deciding on sy-subrc (`security-review.ts`);
 *   - the result of an AUTHORITY-CHECK counts as evaluated only when the next
 *     statement decides on sy-subrc (`IF`, `CHECK`, `CASE`, `ASSERT`, …), not
 *     when it merely mentions it (`decidesOnSubrc`, `security-review.ts`);
 *   - the flow from input to a dynamic clause or a path is followed to a fixed
 *     point, not for eight passes (`taintedNames`, `security-review.ts`);
 *   - a copy of sy-subrc (`lv_rc = sy-subrc.`) counts as deciding on it only
 *     when the very next statement decides on the copy (`decidesOnSubrcAt`),
 *     and a tainted name the source overwrites unconditionally with a value
 *     from no input before a dynamic clause or a path no longer reaches it
 *     (`overwrittenCleanBefore`, `security-review.ts`; hotfix 2);
 *   - RESB beside AUFK alone is a reservation, and AFRU counts as a
 *     production-order table for RESB too (`successorInContext`,
 *     `sap-api-catalog.ts`);
 *   - the IDoc sentence of the architecture recommendation says SAP's
 *     classification only of SAP's modules, never of one in a customer or
 *     partner namespace (`recommendArchitecture`, `code-assessment.ts`);
 *   - a finding in code a constant gate locks away (`IF gc_live_probe <> 'X'.
 *     MESSAGE … TYPE 'E'.` with the constant blank) carries `unreachable`, and
 *     the score table labels it — still charged (SD review of 14.10.2026,
 *     CR-A6; `constant-gates.ts`, `evidence-model.ts`).
 *
 * Each changes what a run signs, so a run made by an older engine keeps the
 * evidence and the route it was signed with: whatever rebuilds a signed run
 * passes that run's engine version (`engineVersionOfProject`). The corrections
 * go live when `APP_VERSION` (`lib/version.ts`) reaches this version. Same
 * pattern as `GUIDELINE_CHECKS_FROM`; `tests/engine-version-rebuild.spec.ts`
 * holds a run of engine 3.0.12 to what that engine answered.
 *
 * Pure: no imports beyond the version comparison.
 */
export const PRECISION_FIXES_FROM = '3.0.13';

/** True when a run of this engine version carries the corrections. A missing or unreadable version does not. */
export function precisionFixesApply(engineVersion: string | null | undefined): boolean {
  return engineVersionAtLeast(engineVersion, PRECISION_FIXES_FROM);
}
