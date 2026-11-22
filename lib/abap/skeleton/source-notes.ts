import type { AbapStatement } from '../statement-reader';
import type { BlockStructure } from '../block-structure';
import type { ControlFlowReport } from '../control-flow';
import type { CallGraphReport } from '../call-graph';
import type { SkeletonGraph } from './graph';

/**
 * Pass "not-read notes" — engine 4 phase 3, before the entries (`docs/design/engine4.md`, "Phase 3").
 *
 * What the reader saw and does not read: an `INCLUDE`, native SQL, a commit boundary, a chained branch, a
 * container nothing closes, a `PERFORM` whose target is computed. Reads the facts only; writes notes, in that
 * order. No reading gate.
 */
export interface SourceNotesInput {
  statements: readonly AbapStatement[];
  structure: BlockStructure;
  control: ControlFlowReport;
  calls: CallGraphReport;
}

export function noteWhatIsNotRead(graph: SkeletonGraph, input: SourceNotesInput): void {
  for (const statement of input.statements) {
    if (statement.keyword === 'INCLUDE' && !/^INCLUDE\s+STRUCTURE\b/i.test(statement.text)) {
      graph.note('include-not-read', statement,
        'The text of an INCLUDE is not part of this source, so whatever it contributes to the process is not in this skeleton.');
    }
    if (statement.nativeSql) {
      graph.note('native-sql', statement,
        'Native SQL is passed through to the database unread. What it touches is not drawn.');
    }
    if (statement.keyword === 'COMMIT' || statement.keyword === 'ROLLBACK') {
      graph.note('commit-boundary', statement,
        'A commit boundary is IT knowledge and belongs in the Technical overlay, not in the flow. What it does to an update registration — dispatched or discarded — is recorded as a state of the process model.');
    }
  }
  for (const branch of input.control.notHandled) {
    if (branch.reason !== 'chained-branch') continue;
    graph.notes.push({ ...branch, reason: 'chained-branch' });
  }
  for (const open of input.structure.unterminated) {
    const statement = input.statements.find((s) => s.lineStart === open.lineStart);
    if (!statement) continue;
    graph.note('unterminated-container', statement,
      `No closing statement ends this ${open.kind}. Everything read inside it runs to the end of the file and is a guess, not an anchor.`);
  }
  for (const perform of input.calls.performs) {
    if (!perform.dynamic) continue;
    const statement = input.statements.find(
      (s) => s.lineStart === perform.lineStart && s.text === perform.text,
    );
    if (statement) {
      graph.note('dynamic-call', statement,
        'The name of the routine is computed at run time. The call is drawn, its target is not claimed.');
    }
  }
}
