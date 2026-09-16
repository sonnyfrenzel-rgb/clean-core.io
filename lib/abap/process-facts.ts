import { readStatements, type AbapStatement } from './statement-reader';
import { readBlocks, type BlockStructure } from './block-structure';
import { readControlFlowFrom, type ControlFlowReport } from './control-flow';
import { readCallGraphFrom, type CallGraphReport } from './call-graph';

/**
 * Everything roadmap 2.1 and 2.2 read out of one ABAP source, in one call.
 *
 * This is the seam the process skeleton of 2.3 builds on: it needs the branches
 * (gateways), the calls (tasks, call activities, send tasks), the blocks (a
 * `LOOP AT` is a multi-instance marker) and the containers (a subroutine with an
 * effect is a sub-process) — and it needs them to agree with each other, which
 * they only do if they were read from the same statement list. Reading the source
 * twice is how two line numbers for the same `IF` get into one diagram.
 *
 * Deterministic and complete before any model is asked anything: no network, no
 * key, no Gemini. Nothing here goes into the signed run — the run's fields are
 * recorded in `docs/registers/preservation-register.json`, and 2.3 is where the
 * skeleton is wired in.
 */
export interface ProcessFacts {
  /** Statements in source order, each with its own line range. */
  statements: AbapStatement[];
  /** Block nesting and the named regions a line can be attributed to. */
  structure: BlockStructure;
  /** Roadmap 2.1 — IF/ELSEIF/ELSE and CASE/WHEN with condition text and range. */
  control: ControlFlowReport;
  /** Roadmap 2.2 — the FORM/PERFORM graph, the calls, the checks, the writes. */
  calls: CallGraphReport;
}

export function buildProcessFacts(source: string): ProcessFacts {
  const statements = readStatements(source);
  const structure = readBlocks(statements);
  return {
    statements,
    structure,
    control: readControlFlowFrom(statements, structure),
    calls: readCallGraphFrom(statements, structure),
  };
}
