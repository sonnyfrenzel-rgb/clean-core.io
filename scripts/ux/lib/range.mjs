/**
 * Where a release review starts: the last reviewed checkpoint; without one, the
 * previous tip of main from the push event. Nothing else — a guessed base would
 * pass as a complete review of code it never read. Pure, so every case is
 * testable without a repository.
 */
export function chooseDeltaBase({ head, override, checkpoint, before, isAncestorOf, exists }) {
  if (override) return { base: override, reason: 'Basis für diesen Lauf vorgegeben' };
  if (checkpoint === head) return { base: head, reason: 'dieser Stand ist bereits geprüft' };
  if (checkpoint && isAncestorOf(checkpoint, head)) return { base: checkpoint, reason: 'letzter geprüfter Stand' };
  if (before && !/^0+$/.test(before) && exists(before) && isAncestorOf(before, head)) {
    return { base: before, reason: checkpoint ? 'Prüfstand nicht im Verlauf — vorheriger main-Stand' : 'noch kein Prüfstand — vorheriger main-Stand' };
  }
  throw new Error('No usable base for a delta review: no reviewed checkpoint in this history and no previous tip. Run the workflow with mode full, or give a base.');
}
