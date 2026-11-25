import { engineVersionAtLeast } from '../score-rule';

/**
 * The engine version gate of release 3.5.2 for two QA fixes, named apart from the engine 4 switch that the engine 4
 * strand gates at the same release (`engine-reads-352-gate.ts` there): two corrections of the process skeleton's
 * reading found by the QA review of 3645b6175. Both change the map, the rules and the story read off it, never a signed finding:
 *
 *   - **a call site that only becomes collapsed re-opens the routine above it** (`collapseSmallRegions`,
 *     `skeleton/collapse.ts`): the pass repeats until nothing moves, and a call site whose `collapsed` state changed
 *     while its kind stayed `sub-process` (a routine that calls itself) now counts as a move. Before, only a changed
 *     kind did, so a parent visited before its child kept a phase the child no longer was.
 *   - **`IN PROGRAM` is read in the statement, not in its literals** (`performSitesOf`, `lib/abap/luw-states.ts`):
 *     `PERFORM update USING 'IN PROGRAM'.` is a local call. Before, the words inside the literal made it external, and
 *     the unit-of-work reading lost that caller's path.
 *
 * A run of an older engine keeps the map it drew: whatever draws a map passes the run's engine version to
 * `buildProcessSkeleton`, and the business statements read `buildBusinessStatements(…, { engineVersion })`. The
 * non-functional requirements read the release's own engine. The readings go live when `APP_VERSION` (`lib/version.ts`)
 * reaches this version; the frozen digests of every earlier release stay as they are
 * (`tests/skeleton-frozen-digests.spec.ts`). Where engine 4 draws the map, today's skeleton builder — and with it the
 * collapse reading — is not reached for that engine; the unit-of-work reading of the business statements and the
 * non-functional requirements still is.
 * Repro spec: `tests/engine-352-fixes-skeleton-readings.spec.ts`.
 *
 * Pure: no imports beyond the version comparison.
 */
export const ENGINE_READS_352_FIXES_FROM = '3.5.2';

/** True when a run of this engine version carries the 3.5.2 readings. A missing or unreadable version does not. */
export function engineReads352FixesApply(engineVersion: string | null | undefined): boolean {
  return engineVersionAtLeast(engineVersion, ENGINE_READS_352_FIXES_FROM);
}
