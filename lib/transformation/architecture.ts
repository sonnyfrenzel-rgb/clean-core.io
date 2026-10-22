/**
 * The architecture a program's target follows (roadmap 3.0.13, item 5 — "architecture follows the program"),
 * decided once for both routes: a program that writes no database table (a report, a simulation) is
 * read-only; one that writes is a writing program.
 *
 *   - RAP (`scaffold-rap.ts`): read-only → a custom entity with a query provider; writing → a managed business
 *     object run by an action.
 *   - CAP (`cap-shell.ts`): read-only → an unbound `simulate` action returning the result; writing → a `run`
 *     action and an entity, with the operations the original performs, per table it writes.
 *
 * Before engine 3.0.21 the decision reads only the call graph's database writes (`INSERT`, `UPDATE`, `MODIFY`,
 * `DELETE` on a table), the same fact both scaffolds had read inline. From 3.0.21 (`ENGINE_READS_3021_FROM`,
 * external code audit of 22.10.2026) it reads what a run reaches, posting calls, batch input and `MODIFY ENTITIES`
 * included (`reachableWrites`, the fact the extensibility route reads as well): a write in a FORM nothing calls or
 * behind a constant that is always off no longer makes a report a writing program, and a program that posts only
 * through a BAPI is no longer read-only.
 */

import type { CallGraphReport } from '../abap/call-graph';
import type { AbapStatement } from '../abap/statement-reader';
import { reachableWrites } from '../abap/reachable-writes';
import { engineReads3021Apply } from '../abap/engine-reads-3021-gate';
import { APP_VERSION } from '../version';

export type ProgramArchitecture = 'read-only' | 'writing';

type ArchitectureFacts = {
  graph: Pick<CallGraphReport, 'databaseWrites'> & Partial<Pick<CallGraphReport, 'functionModules' | 'transactions' | 'forms' | 'unreachable' | 'reachabilityCertain'>>;
  /** With the source and its statements the decision reads what a run reaches (from 3.0.21). */
  source?: string;
  statements?: readonly AbapStatement[];
  /** The engine the facts were read for (`readEngineFacts`); left out, the current engine. */
  engineVersion?: string | null;
};

/** `writing` when the original writes, else `read-only` — see the file comment. */
export function programArchitecture(facts: ArchitectureFacts): ProgramArchitecture {
  const engine = facts.engineVersion === undefined ? APP_VERSION : facts.engineVersion;
  const g = facts.graph;
  if (engineReads3021Apply(engine) && facts.source !== undefined && facts.statements && g.functionModules && g.transactions && g.forms && g.unreachable && g.reachabilityCertain !== undefined) {
    const graph = { ...g, functionModules: g.functionModules, transactions: g.transactions, forms: g.forms, unreachable: g.unreachable, reachabilityCertain: g.reachabilityCertain };
    return reachableWrites({ source: facts.source, statements: facts.statements, graph }).length > 0 ? 'writing' : 'read-only';
  }
  return g.databaseWrites.length > 0 ? 'writing' : 'read-only';
}
