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
 * (rule 23). Customer function modules (`Z*`, `Y*`) the original calls get no
 * method; neither do the job, popup and ALV modules (the delivery choice reads
 * those) nor the commit modules (the RAP framework owns the LUW). A customer
 * table the original reads does (3.0.13, acceptance run 14.10.2026): the
 * package does not ship its definition, so a body's `SELECT` on it could not
 * compile — it is read through `read_<table>` like an SAP table, and a body that
 * selects from it is refused with that method's name (`markers.ts`). One the
 * original writes gets `write_<table>` (acceptance run 4, 14.10.2026), and a
 * body's INSERT, MODIFY, UPDATE or DELETE on it is refused the same way.
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
  /** A customer table (`Z*`, `Y*`) of the original's system: not in the package, read or written through the layer all the same. */
  customer?: boolean;
}

/** At most this many methods: an original touching more is listed in the interface's ABAP Doc. */
export const MAX_ACCESS_POINTS = 20;
/** Customer tables read or written, listed besides the SAP objects (3.0.13). */
export const MAX_CUSTOMER_READS = 10;

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

/**
 * `customerWrites`: whether a customer table the original writes gets a write method (the RAP route, acceptance
 * run 4). The CAP shell leaves it out: it writes those tables as entities of its own service (`cap-shell.ts`).
 */
export function accessPointsOf(
  facts: { statements: readonly AbapStatement[]; graph: CallGraphReport },
  options: { customerWrites?: boolean } = {},
): { points: AccessPoint[]; more: string[] } {
  const byKey = new Map<string, AccessPoint>();
  const add = (kind: AccessPoint['kind'], object: string, line: number) => {
    // A customer table the original reads is not part of the package either (acceptance run 14.10.2026, PO:
    // the body wrote `SELECT … FROM zmm_vend_block` and the class did not compile): it is read through the layer.
    // One it writes too (acceptance run 4, 14.10.2026, PO: `INSERT zmm_po_appr FROM ls_appr`): written through
    // `write_<table>`, its rows typed by the structure the contract declares under the table's name. Customer
    // function modules stay the package's own business, as before.
    const customer = CUSTOMER.test(object);
    if (customer && (kind === 'call' || (kind === 'write' && !options.customerWrites))) return;
    const verb = kind === 'read' ? 'read' : kind === 'write' ? 'write' : 'call';
    const key = `${verb}:${object}`;
    const hit = byKey.get(key);
    if (hit) {
      if (!hit.lines.includes(line)) hit.lines.push(line);
      return;
    }
    byKey.set(key, { method: methodName(verb, object), kind, object, lines: [line], ...(customer ? { customer: true } : {}) });
  };
  for (const s of facts.statements) for (const t of tablesRead(s.text)) add('read', t, s.lineStart);
  for (const w of facts.graph.databaseWrites) add('write', w.table, w.lineStart);
  for (const f of facts.graph.functionModules) if (f.name && !NOT_ACCESS.test(f.name)) add('call', f.name, f.lineStart);
  // The SAP objects up to the cap; the customer tables read (up to their own cap) on top — a body cannot reach
  // them any other way, so they never give way to an SAP object (the PO demo touches 20 SAP objects already).
  const byLine = (a: AccessPoint, b: AccessPoint) => a.lines[0] - b.lines[0] || a.method.localeCompare(b.method);
  const sap = [...byKey.values()].filter((p) => !p.customer).sort(byLine);
  const customer = [...byKey.values()].filter((p) => p.customer).sort(byLine);
  const listed = [...sap.slice(0, MAX_ACCESS_POINTS), ...customer.slice(0, MAX_CUSTOMER_READS)].sort(byLine);
  const more = [...sap.slice(MAX_ACCESS_POINTS), ...customer.slice(MAX_CUSTOMER_READS)].sort(byLine);
  // Two objects that cut to the same method name keep the first; the second is numbered.
  const seen = new Set<string>();
  for (const p of [...listed, ...more]) {
    p.lines.sort((a, b) => a - b);
    let name = p.method;
    for (let i = 2; seen.has(name); i++) name = `${p.method.slice(0, 27)}_${i}`;
    p.method = name;
    seen.add(name);
  }
  return { points: listed, more: more.map((p) => p.object) };
}
