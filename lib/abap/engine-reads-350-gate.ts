import { engineVersionAtLeast } from '../score-rule';

/**
 * The one engine version gate of release 3.5.0 (built on the branch `next`). Two groups of readings live behind it.
 *
 * **1. The Business view in business language** — the version from which the Business view reads the code in business language (concept
 * "Business-Lesbarkeit" of 05.11.2026, owner decisions E1–E4 of 06.11.2026). Deterministic only — no model call, no
 * new source of words:
 *
 *   - **decision points are asked as questions** (E1, `lib/abap/plain-language.ts`): a negated question is asked the
 *     positive way round with its branches swapped ("Authorized?" instead of "Not authorized?"); the result check
 *     after a BAPI asks "Did SAP report an error?"; a compound condition too long for a label is said by its first
 *     part and how many follow, never as "Condition met?"; a `CASE sy-subrc` asks for the outcome of the step that
 *     set it;
 *   - **an internal table is named after where its rows come from**: the database table it is selected from or
 *     typed as, in the glossary's words ("Any notifications?" for `gt_mel` filled from QMEL) — and a table the
 *     engine cannot word is said as the code it is ("For each entry of VBEP"), never as a made-up plural;
 *   - **the program's own texts** (E2): a stop says the message's `WITH` text before a reading of its condition;
 *   - **technique stays one level down** (`lib/bpmn/model.ts`, `foldTechnique`): at the business level a lock, its
 *     release and the set-up of a list are folded into the step beside them, and a run of identically named steps
 *     is drawn as one — every folded line stays on the element that carries it;
 *   - **"In short" says what a run changes** from what a run reaches (`reachable-writes.ts`): batch input and a
 *     posting call are a change, and a report it starts is a change the code does not show
 *     (`lib/program-summary-facts.ts`).
 *
 * Rule ids, rule derivation, the signed payload and the audit pack do not change: only labels and sentences. A
 * project of an older engine keeps its picture: whatever rebuilds one passes its engine version
 * (`engineVersionOfProject`). The readings go live when `APP_VERSION` (`lib/version.ts`) reaches this version. Same
 * pattern as `ENGINE_READS_3021_FROM`.
 *
 * Owner decision 06.11.2026: there is no user release 3.0.22. Everything after 3.0.21 is built on the release branch
 * `next` and ships as v3.5.0; hotfixes on dev/main may be 3.0.22, 3.0.23 … and must keep the 3.0.21 reading. So the
 * gate is 3.5.0 — a run signed by a 3.0.x hotfix is never read as carrying these readings.
 *
 * **2. The process map draws what a process owner misses first** — the version from which the process map draws what a process owner misses first (release 3.5.0, built on
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
