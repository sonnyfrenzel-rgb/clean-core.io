import { engineVersionAtLeast } from '../score-rule';

/**
 * The engine version from which the process map draws what a process owner misses first (release 3.5.0, built on
 * the branch `next`; owner decision 06.11.2026: no user release 3.0.22, hotfixes on dev/main may still carry
 * 3.0.22, 3.0.23 … and must keep reading as before). Deterministic only, all in `lib/abap/process-skeleton.ts`:
 *
 *   - **the outcome of an arm that draws no step** (`armOutcome`): the call of a technical helper in it
 *     (`PERFORM add_issue …`), failing that a flag a later decision reads (`gv_approved = abap_true`) — so a
 *     decision no longer shows two ways out that run to the same next step;
 *   - **a routine that builds a table while it decides or iterates is a calculation** (`buildsWhileDeciding`), not a
 *     technical helper folded into its caller with every decision in it;
 *   - **a loop level begins at a start event of its own** on its `LOOP` line (the ADR-054 follow-up decided
 *     27.09.2026).
 *
 * Rule ids and rule count do not change; a rule's `processElements` can name the new steps. A run of an older
 * engine keeps its map: whatever rebuilds one passes its engine version (`engineVersionOfProject`) to
 * `buildProcessSkeleton`, or holds a skeleton of this release and asks `skeletonReadFor`. The readings go live when
 * `APP_VERSION` (`lib/version.ts`) reaches this version.
 *
 * Pure: no imports beyond the version comparison.
 */
export const ENGINE_READS_350_FROM = '3.5.0';

/** True when a run of this engine version carries the 3.5.0 readings. A missing or unreadable version does not. */
export function engineReads350Apply(engineVersion: string | null | undefined): boolean {
  return engineVersionAtLeast(engineVersion, ENGINE_READS_350_FROM);
}
