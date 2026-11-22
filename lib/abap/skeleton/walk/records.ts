import type { AbapStatement } from '../../statement-reader';
import type { LaneEvidenceKind, NodeAnchor, SkeletonNodeKind } from '../../process-skeleton';
import { anchorOf, tokenIndexOf } from '../anchors';
import type { Walker } from './walker';

/**
 * What the walk records beside the graph — engine 4 phase 3, pass 5 (`docs/design/engine4.md`, "Phase 3"): the lane
 * evidence of roadmap 2.16 (`skeleton/lanes.ts` builds the lanes from it after the walk) and the routines a walked
 * call reaches (`skeleton/not-drawn.ts` reads them). Moved out of `SkeletonBuilder` unchanged; each writes `state`
 * only.
 */

/**
 * One piece of lane evidence, recorded where the walk reads it.
 *
 * Deduplicated by statement, kind and token: a routine performed from three
 * places is walked three times, and one `AUTHORITY-CHECK` written once is one
 * piece of evidence however often the flow passes it.
 */
export function recordEvidence(
  w: Walker,
  kind: LaneEvidenceKind,
  token: string,
  anchor: NodeAnchor,
  statement: AbapStatement,
): void {
  const key = `${anchor.statementIndex}|${kind}|${token}`;
  if (w.state.evidenceSeen.has(key)) return;
  w.state.evidenceSeen.add(key);
  w.state.evidence.push({ kind, token, anchor, statement: statement.keyword });
}

/**
 * What a `CALL FUNCTION` says about who acts — 2.16, three of the four kinds.
 *
 * The *kind* of the node is the evidence for a person: `functionTaskKind`
 * already decided `user-task` from the §5.8 list of function modules a person
 * looks at or answers (ALV, `POPUP_*`, `F4IF_*`), and reading that decision
 * here rather than matching the names a second time keeps one rule in one
 * place. `IN UPDATE TASK`, `IN BACKGROUND TASK` and `DESTINATION` are read off
 * the statement, in the words the source writes them in.
 */
export function readLaneEvidence(
  w: Walker,
  statement: AbapStatement,
  kind: SkeletonNodeKind,
  label: string,
  destination: string | undefined,
): void {
  const text = statement.text;
  if (kind === 'user-task') {
    recordEvidence(w, 'human', label, anchorOf(statement, 2), statement);
  }
  if (/\bIN\s+UPDATE\s+TASK\b/i.test(text)) {
    recordEvidence(w, 'system', 'UPDATE TASK',
      anchorOf(statement, tokenIndexOf(statement, /^UPDATE$/i)), statement);
  }
  if (/\bIN\s+BACKGROUND\s+TASK\b/i.test(text)) {
    recordEvidence(w, 'system', 'BACKGROUND TASK',
      anchorOf(statement, tokenIndexOf(statement, /^BACKGROUND$/i)), statement);
  }
  if (destination) {
    // Recorded, never a lane: another system is a collapsed pool (§5.8), and
    // `lib/bpmn/model.ts` has drawn it as one since 2.6.
    recordEvidence(w, 'foreign-system', destination.toUpperCase(),
      anchorOf(statement, tokenIndexOf(statement, /^DESTINATION$/i) + 1), statement);
  }
}

/** A routine the walk calls runs, and so does everything it calls in turn. */
export function markReached(w: Walker, name: string): void {
  const queue = [name];
  while (queue.length) {
    const next = queue.pop() as string;
    if (w.state.reachedRoutines.has(next)) continue;
    w.state.reachedRoutines.add(next);
    queue.push(...(w.input.performedFrom.get(next) ?? []));
  }
}
