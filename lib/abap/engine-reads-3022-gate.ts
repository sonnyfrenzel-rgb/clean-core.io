import { engineVersionAtLeast } from '../score-rule';

/**
 * The engine version from which the Business view reads the code in business language (concept
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
 * Pure: no imports beyond the version comparison.
 */
export const ENGINE_READS_3022_FROM = '3.0.22';

/** True when a run of this engine version carries the 3.0.22 readings. A missing or unreadable version does not. */
export function engineReads3022Apply(engineVersion: string | null | undefined): boolean {
  return engineVersionAtLeast(engineVersion, ENGINE_READS_3022_FROM);
}
