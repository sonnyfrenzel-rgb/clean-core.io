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
 * The decision reads only the call graph's database writes (`INSERT`, `UPDATE`, `MODIFY`, `DELETE` on a
 * table), the same fact both scaffolds had read inline. Pure, no imports beyond the type.
 */

import type { CallGraphReport } from '../abap/call-graph';

export type ProgramArchitecture = 'read-only' | 'writing';

/** `writing` when the original writes a database table, else `read-only`. */
export function programArchitecture(facts: { graph: Pick<CallGraphReport, 'databaseWrites'> }): ProgramArchitecture {
  return facts.graph.databaseWrites.length > 0 ? 'writing' : 'read-only';
}
