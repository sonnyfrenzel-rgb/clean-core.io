import { engineVersionAtLeast } from '../score-rule';

/**
 * The engine version from which the checks taken over from the DSAG ABAP
 * guideline review (owner decision 13.10.2026, roadmap 3.0.12) run:
 *
 *   - security review tasks (`security-review.ts`),
 *   - the copied-SAP-code review task (`sap-code-copy.ts`),
 *   - classic programming models in the uploaded code (`legacy-technology.ts`),
 *   - the classic ALV, Dynpro, SAP GUI navigation and GUI file findings worded
 *     by SAP Note 3578329 (level B through listed classic APIs), the table-read
 *     texts in level wording, and the IDoc justification (`code-assessment.ts`),
 *   - the RFC finding read from the statement's own DESTINATION addition only
 *     (`rfcDestinationOf` in `evidence-model.ts`).
 *
 * Every one of them changes what a run signs, so a run made by an older engine
 * keeps the evidence it was signed with: whatever rebuilds the evidence of a
 * signed run passes that run's engine version (`signedEngineVersionOf`) and
 * gets the old output. Same pattern as `GUI_FILE_NO_ROUTE_DRIVER_FROM` in
 * `extensibility-router.ts`. The checks go live when `APP_VERSION`
 * (`lib/version.ts`) reaches this version.
 *
 * Pure: no imports beyond the version comparison.
 */
export const GUIDELINE_CHECKS_FROM = '3.0.12';

/** True when a run of this engine version carries the guideline checks. A missing or unreadable version does not. */
export function guidelineChecksApply(engineVersion: string | null | undefined): boolean {
  return engineVersionAtLeast(engineVersion, GUIDELINE_CHECKS_FROM);
}
