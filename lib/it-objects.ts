import type { CloudReadinessGrade } from './abap/abcd-classification';
import type { ItFindingRow, ItUseRow } from './it-findings';
import type { CodeInventoryItem, DataCouplingEntry } from './types';
import { readStatements } from './abap/statement-reader';
import { readBlocks, type Container } from './abap/block-structure';

/**
 * "Objects & dependencies" of the IT view — one table for what used to be two
 * answers with two counts (ADR-086): the own objects of the program
 * (`codeInventory`, the "from" side, each with its line range) and what the
 * code calls, reads and writes (`uses` from the findings route, plus any table
 * of `dataCoupling` the route did not list — the "to" side).
 *
 * Pure and deterministic. Nothing is guessed:
 *
 *   - **Used by** is the own object whose line range holds the line of the
 *     use — the innermost one where ranges nest. A use on a line no listed
 *     object holds is said to be so, never given to the program by default.
 *     The inventory a run stores (`extractCodeInventory`) names each object
 *     but records no lines, so the range of a subroutine, method, dialog
 *     module, function module or class is read from the source itself
 *     (`readBlocks`), matched by name and kind. A report or include gets no
 *     range: the uploaded file is not proven to be all of it.
 *   - **Owner** has three answers, as `DataCouplingEntry.isStandard` has: your
 *     own (Z/Y or customer namespace), SAP, or not determined — a reserved
 *     namespace (`/ACME/…`) is neither by its name.
 *   - **Successor** is the one a finding on the same object names; without a
 *     finding there is no successor to show, and the cell says so.
 *
 * The count line is honest about what it counts: own objects, distinct tables
 * accessed (read, written or both), distinct objects called. The 3.0 layer
 * counted every table access as a "dependency" and left the calls out.
 */

export type ItObjectOwner = 'own' | 'sap' | 'undetermined';
export type ItObjectUse = 'defined' | 'call' | 'read' | 'write' | 'use';

export interface ItObjectRow {
  /** Stable — the React key and a test's handle. */
  key: string;
  /** The object's name as recorded (upper-cased for uses). */
  object: string;
  /** Inventory type (`Form Routine`) or the use kind (`bapi`, `table`) — worded by the component. */
  kind: string;
  /** Whether the kind is an inventory type or a use kind. */
  side: 'own-object' | 'dependency';
  owner: ItObjectOwner;
  /** The own objects whose lines hold the use; empty for an own object, or when no listed object holds it. */
  usedBy: string[];
  /** Some lines of the use stand outside every listed own object. */
  usedOutside: boolean;
  use: ItObjectUse;
  /** Every line of the use, ascending; for an own object, its first line. */
  lines: number[];
  /** An own object's line range, `null` when not recorded. */
  range: { start: number; end: number | null } | null;
  level: CloudReadinessGrade | null;
  levelBasis: string | null;
  successor: string | null;
  remote: boolean;
  /**
   * A write made through batch input — the transaction writes the table, this
   * program fills its screens (roadmap 3.0.7). `all` when every line of the
   * write is one, `some` when direct writes stand beside it, else `null`.
   */
  batchInput: 'all' | 'some' | null;
  findingIds: string[];
}

export interface ItObjects {
  rows: ItObjectRow[];
  /** Own objects of the program (the inventory). */
  own: number;
  /** Distinct tables read, written or both. */
  tables: number;
  /** Distinct objects called. */
  calls: number;
  /** Neither the inventory nor the uses were recorded — nothing can be said. */
  recorded: boolean;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** Z/Y and customer namespace are yours; a reserved namespace is not determined; the rest is SAP's. */
export function ownerOfName(name: string, custom?: boolean): ItObjectOwner {
  if (custom === true) return 'own';
  const n = name.trim().toUpperCase();
  if (/^[ZY]/.test(n)) return 'own';
  if (n.startsWith('/')) return 'undetermined';
  return 'sap';
}

function ownerOfTable(entry: DataCouplingEntry): ItObjectOwner {
  if (entry.isCustom === true) return 'own';
  if (entry.isStandard === true) return 'sap';
  if (entry.isStandard === false) return 'undetermined';
  return ownerOfName(str(entry.tableName));
}

interface Range {
  name: string;
  start: number;
  end: number;
}

/** Which container kind of `readBlocks` an inventory type is. */
const CONTAINER_OF_TYPE: Partial<Record<CodeInventoryItem['type'], Container['kind']>> = {
  'Form Routine': 'form',
  'Function Module': 'function',
  Class: 'class',
};

/**
 * The line range of each named container of the source, keyed `kind:NAME` —
 * the first one where a name repeats. Empty without a source.
 */
export function sourceRanges(code: string | null | undefined): Map<string, { start: number; end: number }> {
  const out = new Map<string, { start: number; end: number }>();
  if (typeof code !== 'string' || code.trim().length === 0) return out;
  for (const c of readBlocks(readStatements(code)).containers) {
    if (c.kind === 'event') continue;
    const key = `${c.kind}:${c.name.toUpperCase()}`;
    if (!out.has(key)) out.set(key, { start: c.lineStart, end: c.lineEnd });
  }
  return out;
}

export function itObjects({
  inventory,
  coupling,
  uses,
  findings,
  code,
}: {
  inventory: readonly CodeInventoryItem[] | null | undefined;
  coupling: readonly DataCouplingEntry[] | null | undefined;
  /** `undefined` when the findings route did not record the uses. */
  uses: readonly ItUseRow[] | null | undefined;
  findings: readonly ItFindingRow[] | null | undefined;
  /** The program source, for the line ranges the stored inventory does not record. */
  code?: string | null;
}): ItObjects {
  const fromSource = sourceRanges(code);
  const own = (Array.isArray(inventory) ? inventory : [])
    .filter((i): i is CodeInventoryItem => typeof i === 'object' && i !== null && str(i.objectName).length > 0)
    .map((i): CodeInventoryItem => {
      if (isNum(i.lineStart)) return i;
      const kind = CONTAINER_OF_TYPE[i.type];
      const read = kind ? fromSource.get(`${kind}:${str(i.objectName).toUpperCase()}`) : undefined;
      return read ? { ...i, lineStart: read.start, lineEnd: read.end } : i;
    });
  const tableEntries = (Array.isArray(coupling) ? coupling : []).filter(
    (e): e is DataCouplingEntry => typeof e === 'object' && e !== null && str(e.tableName).length > 0,
  );
  const useRows = Array.isArray(uses) ? uses : [];

  const ranges: Range[] = own
    .filter((i) => isNum(i.lineStart))
    .map((i) => ({ name: str(i.objectName), start: i.lineStart as number, end: isNum(i.lineEnd) ? i.lineEnd : (i.lineStart as number) }));
  /** The innermost listed object holding a line, or `null`. */
  const holder = (line: number): string | null => {
    let best: Range | null = null;
    for (const r of ranges) {
      if (line < r.start || line > r.end) continue;
      if (!best || r.end - r.start < best.end - best.start) best = r;
    }
    return best ? best.name : null;
  };

  const successorOf = new Map<string, string>();
  for (const f of findings ?? []) {
    const name = str(f.objectName).toUpperCase();
    if (name && f.successor && !successorOf.has(name)) successorOf.set(name, f.successor);
  }
  /** The lines at which a finding says a table is changed through batch input. */
  const batchLines = new Map<string, Set<number>>();
  for (const f of findings ?? []) {
    const name = str(f.objectName).toUpperCase();
    if (f.kind !== 'batch-input' || !name) continue;
    batchLines.set(name, (batchLines.get(name) ?? new Set<number>()).add(f.lineStart));
  }
  const batchInputOf = (object: string, use: ItObjectUse, lines: readonly number[]): ItObjectRow['batchInput'] => {
    const at = batchLines.get(object);
    if (use !== 'write' || !at || lines.length === 0) return null;
    const hits = lines.filter((l) => at.has(l)).length;
    return hits === 0 ? null : hits === lines.length ? 'all' : 'some';
  };
  const levelOfOwn = new Map<string, ItUseRow>();
  for (const u of useRows) if (u.level !== null && !levelOfOwn.has(u.object)) levelOfOwn.set(u.object, u);

  // What the code uses first — the route's order, the half the target is
  // decided on — then the program's own objects, the "from" side.
  const ownRows: ItObjectRow[] = [];
  own.forEach((item, i) => {
    const name = str(item.objectName);
    const graded = levelOfOwn.get(name.toUpperCase()) ?? null;
    ownRows.push({
      key: `own-${i}-${name}`,
      object: name,
      kind: str(item.type) || 'Other',
      side: 'own-object',
      owner: 'own',
      usedBy: [],
      usedOutside: false,
      use: 'defined',
      lines: isNum(item.lineStart) ? [item.lineStart] : [],
      range: isNum(item.lineStart) ? { start: item.lineStart, end: isNum(item.lineEnd) ? item.lineEnd : null } : null,
      level: graded?.level ?? null,
      levelBasis: graded?.levelBasis ?? null,
      successor: successorOf.get(name.toUpperCase()) ?? null,
      remote: false,
      batchInput: null,
      findingIds: [],
    });
  });

  const rows: ItObjectRow[] = [];
  const usedByOf = (lines: readonly number[]) => {
    const names = new Set<string>();
    let outside = false;
    for (const line of lines) {
      const h = holder(line);
      if (h) names.add(h);
      else outside = true;
    }
    return { usedBy: [...names], usedOutside: ranges.length > 0 ? outside : lines.length > 0 };
  };

  const listed = new Set<string>();
  for (const u of useRows) {
    listed.add(`${u.object}@${u.use}`);
    const by = usedByOf(u.lines);
    rows.push({
      key: `use-${u.object}@${u.use}`,
      object: u.object,
      kind: u.kind,
      side: 'dependency',
      owner: ownerOfName(u.object, u.custom),
      usedBy: by.usedBy,
      usedOutside: by.usedOutside,
      use: u.use,
      lines: [...u.lines],
      range: null,
      level: u.level,
      levelBasis: u.levelBasis,
      successor: successorOf.get(u.object) ?? null,
      remote: u.remote,
      batchInput: batchInputOf(u.object, u.use, u.lines),
      findingIds: [...u.findingIds],
    });
  }

  // Tables the browser-side reading recorded and the route did not list —
  // a reference (`TYPE kna1`) is not a use and stays out, as in the route.
  for (const entry of tableEntries) {
    const name = str(entry.tableName).toUpperCase();
    const access = entry.accessType;
    const kinds: ItObjectUse[] =
      access === 'Read' ? ['read'] : access === 'Write' ? ['write'] : access === 'Read/Write' ? ['read', 'write'] : [];
    for (const use of kinds) {
      if (listed.has(`${name}@${use}`)) continue;
      listed.add(`${name}@${use}`);
      const lines = (Array.isArray(entry.lineNumbers) ? entry.lineNumbers.filter(isNum) : []).sort((a, b) => a - b);
      const by = usedByOf(lines);
      rows.push({
        key: `table-${name}@${use}`,
        object: name,
        kind: 'table',
        side: 'dependency',
        owner: ownerOfTable(entry),
        usedBy: by.usedBy,
        usedOutside: by.usedOutside,
        use,
        lines,
        range: null,
        level: null,
        levelBasis: null,
        successor: successorOf.get(name) ?? null,
        remote: false,
        batchInput: null,
        findingIds: [],
      });
    }
  }

  const deps = rows;
  return {
    rows: [...deps, ...ownRows],
    own: own.length,
    tables: new Set(deps.filter((r) => r.kind === 'table' && (r.use === 'read' || r.use === 'write')).map((r) => r.object)).size,
    calls: new Set(deps.filter((r) => r.use === 'call').map((r) => r.object)).size,
    recorded: own.length > 0 || Array.isArray(uses) || tableEntries.length > 0,
  };
}
