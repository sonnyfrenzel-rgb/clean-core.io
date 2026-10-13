/**
 * The SAP objects an original reads, writes or calls — the methods of the RAP
 * scaffold's access layer (roadmap 3.0.12, DSAG ABAP guide review B4; code-draft
 * rule 25).
 *
 * The DSAG ABAP guide (abap/modern_development.md, "Verwendung von SAP Code")
 * asks for SAP code — released APIs included — to be wrapped in an own class,
 * with data access injectable for ABAP Unit and return codes turned into
 * exceptions. The scaffold writes one interface method per SAP object the
 * original touches, named after what it does there (`read_ekko`,
 * `call_bapi_po_create1`), never after an API the package does not call
 * (rule 23). Customer objects (`Z*`, `Y*`) are the package's own and get no
 * method; neither do the job, popup and ALV modules (the delivery choice reads
 * those) nor the commit modules (the RAP framework owns the LUW).
 *
 * Pure, no network, no model.
 */

import type { CallGraphReport } from '../abap/call-graph';
import type { AbapStatement } from '../abap/statement-reader';

export interface AccessPoint {
  /** The method name in the access interface, ≤ 30 characters. */
  method: string;
  kind: 'read' | 'write' | 'call';
  /** The SAP object as the original names it, upper case. */
  object: string;
  /** Lines of the original where it happens, ascending. */
  lines: number[];
}

/** At most this many methods: an original touching more is listed in the interface's ABAP Doc. */
export const MAX_ACCESS_POINTS = 20;

const CUSTOMER = /^(?:[ZY]|\/[ZY])/;
const NOT_ACCESS = /^(?:JOB_OPEN|JOB_SUBMIT|JOB_CLOSE|POPUP_|REUSE_ALV_|BAPI_TRANSACTION_COMMIT$|BAPI_TRANSACTION_ROLLBACK$)/;

const methodName = (verb: string, object: string) =>
  `${verb}_${object.toLowerCase().replace(/^\/([^/]+)\//, '$1_').replace(/[^a-z0-9_]/g, '_')}`.slice(0, 30).replace(/_+$/, '');

/** Every SAP table a statement reads: after `FROM` and `JOIN` of a `SELECT`. */
function tablesRead(text: string): string[] {
  if (!/^(?:SELECT|OPEN\s+CURSOR)\b/i.test(text)) return [];
  const out: string[] = [];
  for (const m of text.matchAll(/\b(?:FROM|JOIN)\s+(\/?[A-Za-z][\w/]*)/gi)) out.push(m[1].toUpperCase());
  return out;
}

export function accessPointsOf(facts: { statements: readonly AbapStatement[]; graph: CallGraphReport }): { points: AccessPoint[]; more: string[] } {
  const byKey = new Map<string, AccessPoint>();
  const add = (kind: AccessPoint['kind'], object: string, line: number) => {
    if (CUSTOMER.test(object)) return;
    const verb = kind === 'read' ? 'read' : kind === 'write' ? 'write' : 'call';
    const key = `${verb}:${object}`;
    const hit = byKey.get(key);
    if (hit) {
      if (!hit.lines.includes(line)) hit.lines.push(line);
      return;
    }
    byKey.set(key, { method: methodName(verb, object), kind, object, lines: [line] });
  };
  for (const s of facts.statements) for (const t of tablesRead(s.text)) add('read', t, s.lineStart);
  for (const w of facts.graph.databaseWrites) add('write', w.table, w.lineStart);
  for (const f of facts.graph.functionModules) if (f.name && !NOT_ACCESS.test(f.name)) add('call', f.name, f.lineStart);
  const all = [...byKey.values()].sort((a, b) => a.lines[0] - b.lines[0] || a.method.localeCompare(b.method));
  // Two objects that cut to the same method name keep the first; the second is numbered.
  const seen = new Set<string>();
  for (const p of all) {
    p.lines.sort((a, b) => a - b);
    let name = p.method;
    for (let i = 2; seen.has(name); i++) name = `${p.method.slice(0, 27)}_${i}`;
    p.method = name;
    seen.add(name);
  }
  return { points: all.slice(0, MAX_ACCESS_POINTS), more: all.slice(MAX_ACCESS_POINTS).map((p) => p.object) };
}
