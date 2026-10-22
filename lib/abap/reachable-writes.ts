import type { AbapStatement, SourceRange } from './statement-reader';
import type { CallGraphReport } from './call-graph';
import { readConstantGates, isUnreachableLine } from './constant-gates';

/**
 * What a program writes, read from what a run reaches (roadmap 3.0.21, external code audit of 22.10.2026).
 *
 * The target architecture (`lib/transformation/architecture.ts`) counted the call graph's database writes as
 * written — a write in a FORM nothing calls, or behind a constant that is always off, made a report a "writing
 * program" — and a program that posts only through a BAPI, batch input or `MODIFY ENTITIES` was "read-only". One
 * fact for both readers instead:
 *
 *   - `table-write` — `INSERT`, `UPDATE`, `MODIFY`, `DELETE` on a table (the call graph's `databaseWrites`);
 *   - `posting-call` — a BAPI that is not a read or a transaction step (the reading list of `rap-save.ts`), and any
 *     function module called `IN UPDATE TASK`;
 *   - `batch-input` — `CALL TRANSACTION … USING`, and the batch input session modules (`BDC_INSERT`);
 *   - `entity-modify` — `MODIFY ENTITIES OF …` (EML).
 *
 * A write is left out where no run reaches it: in a FORM no entry point reaches (only where reachability is certain
 * — no `PERFORM (name)` — and the source is a program with an entry of its own, as `evidence-model.ts` reads it), or
 * in lines a constant gate locks away (`constant-gates.ts`). Pure: statements and the call graph in.
 */

export type ProgramWriteKind = 'table-write' | 'posting-call' | 'batch-input' | 'entity-modify';

export interface ProgramWrite extends SourceRange {
  kind: ProgramWriteKind;
  /** The table, function module, transaction or business object, upper case. */
  object: string;
}

/** A BAPI that reads or only steers the transaction is no write (the same reading as `rap-save.ts`). */
const READING_BAPI = /^BAPI_TRANSACTION_|_(?:GET\w*|GETDETAIL\w*|GETLIST|LIST\w*|READ\w*|EXISTENCECHECK|DISPLAY\w*|CHECK\w*)$/;
const BDC_MODULE = /^BDC_(?:INSERT|OPEN_GROUP)$/;

/** Every write of the program, reached or not, in source order. */
export function programWrites(facts: { statements: readonly AbapStatement[]; graph: Pick<CallGraphReport, 'databaseWrites' | 'functionModules' | 'transactions'> }): ProgramWrite[] {
  const out: ProgramWrite[] = [];
  const at = (s: SourceRange) => ({ lineStart: s.lineStart, lineEnd: s.lineEnd });
  for (const w of facts.graph.databaseWrites) {
    if (/^ENTIT(?:Y|IES)$/i.test(w.table)) continue;
    out.push({ ...at(w), kind: 'table-write', object: w.table.toUpperCase() });
  }
  for (const f of facts.graph.functionModules) {
    const name = (f.name ?? '').toUpperCase();
    if (!name) continue;
    const bare = name.replace(/^\/\w+\//, '');
    if (BDC_MODULE.test(bare)) out.push({ ...at(f), kind: 'batch-input', object: name });
    else if ((f.bapi && !READING_BAPI.test(bare)) || f.inUpdateTask) out.push({ ...at(f), kind: 'posting-call', object: name });
  }
  for (const t of facts.graph.transactions) {
    if (t.batchInput) out.push({ ...at(t), kind: 'batch-input', object: (t.code ?? t.codeExpression).toUpperCase() });
  }
  for (const s of facts.statements) {
    const bo = /^MODIFY\s+ENTITIES\s+OF\s+([\w/]+)/i.exec(s.text);
    if (bo) out.push({ ...at(s), kind: 'entity-modify', object: bo[1].toUpperCase() });
  }
  return out.sort((a, b) => a.lineStart - b.lineStart);
}

/** The writes a run of the program reaches — see the file comment. */
export function reachableWrites(facts: {
  source: string;
  statements: readonly AbapStatement[];
  graph: Pick<CallGraphReport, 'databaseWrites' | 'functionModules' | 'transactions' | 'forms' | 'unreachable' | 'reachabilityCertain'>;
}): ProgramWrite[] {
  const all = programWrites(facts);
  if (all.length === 0) return all;
  const hasEntry = facts.statements.some((s) => /^\s*(?:REPORT|PROGRAM)\b/i.test(s.text));
  const dead = hasEntry && facts.graph.reachabilityCertain ? facts.graph.forms.filter((f) => facts.graph.unreachable.includes(f.name)) : [];
  const gates = readConstantGates(facts.source, { engineReads: true });
  return all.filter((w) => !dead.some((f) => w.lineStart >= f.lineStart && w.lineStart <= f.lineEnd) && !isUnreachableLine(gates, w.lineStart));
}
