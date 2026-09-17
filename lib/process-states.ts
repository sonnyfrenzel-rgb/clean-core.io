/**
 * ────────────────────────────────────────────────────────────────────────────
 * PLACEHOLDER — this file belongs to roadmap step 3.5, not to 3.6.
 *
 * 3.5 ("beibehalten · bewusst ändern · entfallen · klären") and 3.6 ("Ist und
 * Soll") were built at the same time on two branches. So that 3.6 did not have
 * to wait for 3.5's store, its routes and its screens, the three shapes below
 * were fixed as a contract beforehand, and 3.6 was written against the
 * contract.
 *
 * **Whoever merges the two branches replaces this file with 3.5's real one.**
 * Nothing here holds state, reads Firestore or validates anything: it is types
 * and nothing else, so replacing it can only add, never collide. If 3.5's file
 * differs in a field name, `lib/process-target.ts` is the only thing in 3.6
 * that reads these shapes, and the mismatch surfaces as a type error rather
 * than as a wrong number on a screen.
 * ────────────────────────────────────────────────────────────────────────────
 */

/** What an account says should happen to one element or one rule. */
export type ElementState = 'keep' | 'change' | 'drop' | 'clarify';

/**
 * One account's statement about one subject.
 *
 * A statement, not a measurement: it says what somebody holds to be necessary,
 * and it is never evidence about the code.
 */
export interface StateEntry {
  /** A stable BPMN element id (2.6) or a rule id `BR-nnn` (3.4). */
  subject: string;
  kind: 'element' | 'rule';
  state: ElementState;
  note: string | null;
  account: { uid: string; name: string };
  /** ISO 8601, from the server's clock. */
  confirmedAt: string;
  revision: number;
}

/**
 * Every statement about one project's model, by subject.
 *
 * **A subject that is not in `bySubject` is undecided** — that absence is the
 * whole point of the shape, and it is why nothing here carries an "undecided"
 * entry: a row somebody wrote saying nothing would be indistinguishable from a
 * row somebody wrote saying "clarify this".
 */
export interface ProcessStates {
  bySubject: Record<string, StateEntry>;
  counts: { keep: number; change: number; drop: number; clarify: number; undecided: number };
}
