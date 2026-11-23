import { parseBpmn, type ProcessMapElement, type ProcessMapModel } from './process-map';
import { readStatements, type AbapStatement } from './abap/statement-reader';
import { readBlocks } from './abap/block-structure';
import { readCallGraphFrom } from './abap/call-graph';
import { reachableWrites, type ProgramWriteKind } from './abap/reachable-writes';
import { extractDataCoupling } from './abap/code-assessment';
import { tableTerm } from './abap/business-glossary';

/**
 * The two charts under the map in Analyze, Business — plan `docs/design/analyze-business-first-plan.md` §4.2, AB-7
 * (mockup `docs/roadmap/analyze-business-first-mockup.html`, states 8 and 9; ADR-114 as the plan words it).
 *
 *   - **How a case can end** (P9): the end events of the map a reader sees, grouped by the step a case stops in. A
 *     case ends at an end event of the top level, or where the code stops it on the way — an error end (`MESSAGE …
 *     TYPE 'E'`, `RAISE`, `LEAVE PROGRAM`) or an early end (`RETURN`, `EXIT`, `STOP`) on any level. The normal end of
 *     a sub-process is no end of the case: the step it draws hands back to the level above. Ends, not paths: paths
 *     multiply with every loop and nested branch.
 *   - **What it changes, what it only reads**: changes are the writes a run reaches (`reachableWrites` — table
 *     writes, posting calls, batch input, `MODIFY ENTITIES`); reads are the tables the data coupling reads
 *     (`extractDataCoupling`) and no reached write changes. A read is not proven reachable — the sentence says so.
 *
 * Every count is the engine's fact, *Reconstructed*, with its lines; every row names the map elements it counts, so
 * a click on it lights them on the map. Nothing here is signed, stored or part of an audit pack: it is computed in
 * the browser from the map the page already drew and from the signed source. Pure: no React, no I/O.
 */

export interface FactChartRow {
  /** Stable within one chart: `end`, `stop:<plane>`, `change:<object>`, `read:<table>`. */
  key: string;
  /** What the row says first — a business word where the dictionary has one, the code's own name otherwise. */
  label: string;
  /** The smaller line under it: the program's own stop texts, or the table and how it is changed. */
  detail: string | null;
  count: number;
  /** The map's element ids this row counts or touches — what a click lights. Empty when none is drawn. */
  elementIds: string[];
  /** The source lines behind the row, ascending. */
  lines: number[];
}

export interface CaseEndsChart {
  /** Every end of a case on the map — the sum of the rows. */
  total: number;
  /** Ends at the program's normal end. */
  normal: number;
  /** Ends where the code stops the case on the way. */
  stopped: number;
  rows: FactChartRow[];
  /** The chart's one sentence. */
  sentence: string;
  lines: number[];
}

export interface DataUseChart {
  changes: FactChartRow[];
  reads: FactChartRow[];
  sentence: string;
  lines: number[];
}

type MapModel = Pick<ProcessMapModel, 'xml' | 'elements' | 'planes'>;

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
const upperFirst = (text: string): string => (text ? text[0].toUpperCase() + text.slice(1) : text);
const sortedLines = (lines: Iterable<number>): number[] => [...new Set(lines)].filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);

/** The engine's name of an element — never a model's (the charts are *Reconstructed*). */
function engineName(element: Pick<ProcessMapElement, 'plainName' | 'technicalName' | 'id'>): string {
  return element.plainName ?? (element.technicalName || element.id);
}

/** The skeleton kind each element was drawn from, read off the map's own file (`cc:trace/@kind`). */
function traceKinds(xml: string): Map<string, string | null> {
  return new Map(parseBpmn(xml).elements.map((e) => [e.id, e.trace?.kind ?? null]));
}

/** How an end event of the map ends the case: at the normal end, by a stop on the way, or not at all (a sub-process returns). */
export function caseEndKind(element: Pick<ProcessMapElement, 'tag' | 'plane' | 'early'>, kind: string | null): 'normal' | 'stop' | null {
  if (element.tag !== 'endEvent') return null;
  if (element.early || kind === 'end-error') return 'stop';
  return element.plane === null ? 'normal' : null;
}

/** The end events of the map that end a case, in the map's order. */
export function caseEndElements(model: MapModel): Array<{ element: ProcessMapElement; how: 'normal' | 'stop' }> {
  const kinds = traceKinds(model.xml);
  const out: Array<{ element: ProcessMapElement; how: 'normal' | 'stop' }> = [];
  for (const element of model.elements) {
    const how = caseEndKind(element, kinds.get(element.id) ?? null);
    if (how) out.push({ element, how });
  }
  return out;
}

/** A stop's reason in the program's words: the end's name without the word that says it is a stop. */
function stopReason(name: string): string {
  const reason = name.replace(/^(?:stop|stopped)\s*:\s*/i, '').trim() || name;
  // Mid-line in a list of reasons: "Rejected: no material" reads "rejected: no material"; "BACK or CANC" stays.
  return /^[A-Z][a-z]/.test(reason) ? reason[0].toLowerCase() + reason.slice(1) : reason;
}

export function caseEndsOf(model: MapModel): CaseEndsChart | null {
  const ends = caseEndElements(model);
  if (ends.length === 0) return null;
  const byId = new Map(model.elements.map((e) => [e.id, e]));
  const planeOrder = new Map<string | null, number>(model.planes.map((p, i) => [p.id, i]));

  const normal = ends.filter((e) => e.how === 'normal').map((e) => e.element);
  const rows: FactChartRow[] = [];
  if (normal.length) {
    rows.push({
      key: 'end',
      label: 'Runs to its end',
      detail: 'the end of the program’s main flow',
      count: normal.length,
      elementIds: normal.map((e) => e.id),
      lines: sortedLines(normal.flatMap((e) => (e.anchor ? [e.anchor.lineStart] : []))),
    });
  }

  // Stops, by the step (the level) the case stops in, in the map's order of levels.
  const groups = new Map<string | null, ProcessMapElement[]>();
  for (const { element, how } of ends) {
    if (how !== 'stop') continue;
    const held = groups.get(element.plane);
    if (held) held.push(element);
    else groups.set(element.plane, [element]);
  }
  const planes = [...groups.keys()].sort((a, b) => (planeOrder.get(a) ?? 1e9) - (planeOrder.get(b) ?? 1e9));
  for (const plane of planes) {
    const stops = groups.get(plane) ?? [];
    const step = plane ? byId.get(plane) : undefined;
    const reasons = [...new Set(stops.map((s) => stopReason(engineName(s))))];
    rows.push({
      key: `stop:${plane ?? 'top'}`,
      label: step ? `Stopped in “${engineName(step)}”` : 'Stopped in the main flow',
      detail: reasons.join(' · '),
      count: stops.length,
      elementIds: stops.map((s) => s.id),
      lines: sortedLines(stops.flatMap((s) => (s.anchor ? [s.anchor.lineStart] : []))),
    });
  }

  const total = ends.length;
  const stopped = total - normal.length;
  const sentence = stopped === 0
    ? `The map shows ${plural(total, 'end', 'ends')} for a case, all at the program’s normal end, and no stop on the way.`
    : normal.length === 0
      ? `A case can end in ${plural(total, 'way', 'ways')} on the map, every one of them a stop on the way.`
      : `A case can end in ${plural(total, 'way', 'ways')} on the map: ${normal.length} at the program’s normal end, ${stopped} stopped on the way.`;
  return { total, normal: normal.length, stopped, rows, sentence, lines: sortedLines(rows.flatMap((r) => r.lines)) };
}

/* ------------------------------------------------------------------ *
 * What it changes, what it only reads
 * ------------------------------------------------------------------ */

const WRITE_VERB: Record<ProgramWriteKind, string> = {
  'table-write': 'changes table',
  'posting-call': 'posts through',
  'batch-input': 'enters through batch input in',
  'entity-modify': 'changes business object',
};

/**
 * Where the routine behind a call-site element is written (`cc:trace/@secondaryLineStart`), by skeleton node — so a
 * line inside a small routine drawn as one step finds that step.
 */
function routineRanges(xml: string): Map<string, { lineStart: number; lineEnd: number }> {
  const out = new Map<string, { lineStart: number; lineEnd: number }>();
  for (const m of xml.matchAll(/<cc:trace\b[^>]*>/g)) {
    const tag = m[0];
    const node = /\snode="([^"]+)"/.exec(tag)?.[1];
    const start = /\ssecondaryLineStart="(\d+)"/.exec(tag)?.[1];
    const end = /\ssecondaryLineEnd="(\d+)"/.exec(tag)?.[1];
    if (node && start && end) out.set(node, { lineStart: Number(start), lineEnd: Number(end) });
  }
  return out;
}

/**
 * The routines of the source (`FORM`, `METHOD`) and the lines that call each — so a line in a routine the map draws
 * inside another small step (a `FORM` called from a `FORM` folded into one step) finds the step its caller is drawn
 * at. Static calls only: `PERFORM name`, `->name(`, `=>name(`, `~name(`, `CALL METHOD … name`.
 */
export interface RoutineCalls {
  /** The lines that call the routine a line stands in; empty outside a routine or for one nothing calls by name. */
  callersOf(line: number): number[];
}

export function routineCallsOf(statements: readonly AbapStatement[]): RoutineCalls {
  const routines: Array<{ name: string; cls: string | null; method: boolean; lineStart: number; lineEnd: number }> = [];
  let open: { name: string; cls: string | null; method: boolean; lineStart: number } | null = null;
  let cls: string | null = null;
  for (const s of statements) {
    const implementation = /^CLASS\s+([\w/]+)\s+IMPLEMENTATION\b/i.exec(s.text);
    if (implementation) cls = implementation[1].toLowerCase();
    else if (/^ENDCLASS\b/i.test(s.text)) cls = null;
    const head = /^(FORM|METHOD)\s+([\w/~]+)/i.exec(s.text);
    if (head && !open) {
      const method = head[1].toUpperCase() === 'METHOD';
      open = { name: head[2].toLowerCase().split('~').pop() ?? '', cls: method ? cls : null, method, lineStart: s.lineStart };
      continue;
    }
    if (open && /^END(?:FORM|METHOD)\b/i.test(s.text)) {
      routines.push({ ...open, lineEnd: s.lineEnd });
      open = null;
    }
  }
  const escape = (name: string) => name.replace(/[/]/g, '\\/');
  // FORMs and methods are named apart: `PERFORM run` reaches no method `run`, and a method `run` makes no FORM `run`
  // ambiguous. Only `PERFORM` calls a FORM.
  const named = new Map<string, number>();
  for (const r of routines) if (r.name && r.method) named.set(r.name, (named.get(r.name) ?? 0) + 1);
  /**
   * The lines that call a routine. A name only one routine here carries is that routine's at every call. A method
   * name several classes here implement is one class's only where the call names that class (`lcl_a=>run(`): an
   * instance call (`lo->run(`) could reach either, and a caller of the other one is no caller of this one.
   */
  const callersOfRoutine = (r: { name: string; cls: string | null; method: boolean }): number[] => {
    const n = escape(r.name);
    if (!r.method) {
      const perform = new RegExp(`^PERFORM\\s+${n}\\b`, 'i');
      return statements.filter((s) => perform.test(s.text)).map((s) => s.lineStart);
    }
    if ((named.get(r.name) ?? 0) <= 1) {
      const pattern = new RegExp(`(?:[>~]${n}\\s*\\(|^CALL\\s+METHOD\\s+(?:[\\w/]+(?:->|=>|~))*${n}\\b)`, 'i');
      return statements.filter((s) => pattern.test(s.text)).map((s) => s.lineStart);
    }
    if (!r.cls) return [];
    const c = escape(r.cls);
    const pattern = new RegExp(`(?:(?:^|[^\\w/])${c}=>${n}\\s*\\(|^CALL\\s+METHOD\\s+${c}=>${n}\\b)`, 'i');
    return statements.filter((s) => pattern.test(s.text)).map((s) => s.lineStart);
  };
  return {
    callersOf(line: number): number[] {
      const inside = routines.filter((r) => r.lineStart <= line && r.lineEnd >= line).sort((a, b) => (a.lineEnd - a.lineStart) - (b.lineEnd - b.lineStart))[0];
      if (!inside || !inside.name) return [];
      return callersOfRoutine(inside).filter((at) => at < inside.lineStart || at > inside.lineEnd);
    },
  };
}

/**
 * The map elements a source line is drawn at: the narrowest elements whose anchor holds the line; where none does,
 * the narrowest step whose routine holds it; where none does either, the elements its routine's callers are drawn
 * at (at most four calls up). Events are left out — a line of a read or a write is a step's.
 */
export function elementsAtLines(model: MapModel, lines: readonly number[], calls?: RoutineCalls): string[] {
  const steps = model.elements.filter((e) => !e.event && e.tag !== 'boundaryEvent');
  const routines = routineRanges(model.xml);
  const out = new Set<string>();
  const narrowest = (pairs: Array<{ id: string; span: number }>) => {
    if (!pairs.length) return false;
    const min = Math.min(...pairs.map((p) => p.span));
    for (const p of pairs) if (p.span === min) out.add(p.id);
    return true;
  };
  const place = (line: number, depth: number, seen: Set<number>) => {
    if (seen.has(line)) return;
    seen.add(line);
    const direct = steps
      .filter((e) => e.anchor && e.anchor.lineStart <= line && e.anchor.lineEnd >= line)
      .map((e) => ({ id: e.id, span: (e.anchor as { lineStart: number; lineEnd: number }).lineEnd - (e.anchor as { lineStart: number }).lineStart }));
    if (narrowest(direct)) return;
    const viaRoutine = steps
      .map((e) => ({ e, r: e.nodeId ? routines.get(e.nodeId) : undefined }))
      .filter((x): x is { e: ProcessMapElement; r: { lineStart: number; lineEnd: number } } => !!x.r && x.r.lineStart <= line && x.r.lineEnd >= line)
      .map((x) => ({ id: x.e.id, span: x.r.lineEnd - x.r.lineStart }));
    if (narrowest(viaRoutine)) return;
    if (!calls || depth >= 4) return;
    for (const caller of calls.callersOf(line)) place(caller, depth + 1, seen);
  };
  for (const line of lines) place(line, 0, new Set());
  // In the map's order, so the light reads along the flow.
  return model.elements.filter((e) => out.has(e.id)).map((e) => e.id);
}

/** A table's business word with its name, or the name alone (`tableTerm` never guesses). */
function tableLabel(table: string): { label: string; known: boolean } {
  const term = tableTerm(table);
  return term ? { label: upperFirst(term.singular), known: true } : { label: table, known: false };
}

/** `engineVersion`: the engine of the project's run (`engineVersionOfProject`) — the data coupling is read for it. */
export function dataUseOf(source: string, model: MapModel, engineVersion: string | null): DataUseChart | null {
  const statements = readStatements(source);
  const graph = readCallGraphFrom(statements, readBlocks(statements));
  const writes = reachableWrites({ source, statements, graph });
  const calls = routineCallsOf(statements);

  const changeGroups = new Map<string, { kind: ProgramWriteKind; object: string; lines: number[] }>();
  for (const w of writes) {
    const key = `${w.kind}:${w.object}`;
    const held = changeGroups.get(key);
    if (held) held.lines.push(w.lineStart);
    else changeGroups.set(key, { kind: w.kind, object: w.object, lines: [w.lineStart] });
  }
  const changes: FactChartRow[] = [...changeGroups.values()].sort((a, b) => Math.min(...a.lines) - Math.min(...b.lines)).map((g) => {
    const table = g.kind === 'table-write' ? tableLabel(g.object) : null;
    const lines = sortedLines(g.lines);
    return {
      key: `change:${g.kind}:${g.object}`,
      label: table ? table.label : g.object,
      detail: table && !table.known ? WRITE_VERB[g.kind] : `${WRITE_VERB[g.kind]} ${g.object}`,
      count: lines.length,
      elementIds: elementsAtLines(model, lines, calls),
      lines,
    };
  });
  const changedTables = new Set([...changeGroups.values()].filter((g) => g.kind === 'table-write').map((g) => g.object));

  const coupling = extractDataCoupling(source, engineVersion);
  const reads: FactChartRow[] = coupling
    .filter((c) => (c.accessType === 'Read' || c.accessType === 'Read/Write') && !c.possibleTargetOf?.length)
    .filter((c) => !changedTables.has(c.tableName.toUpperCase()))
    .sort((a, b) => Math.min(...(a.lineNumbers ?? [Infinity])) - Math.min(...(b.lineNumbers ?? [Infinity])) || a.tableName.localeCompare(b.tableName))
    .map((c) => {
      const table = tableLabel(c.tableName);
      const lines = sortedLines(c.lineNumbers ?? []);
      return {
        key: `read:${c.tableName}`,
        label: table.label,
        detail: table.known ? `reads table ${c.tableName}` : 'reads this table',
        count: c.readCount ?? lines.length,
        elementIds: elementsAtLines(model, lines, calls),
        lines,
      };
    });

  if (changes.length === 0 && reads.length === 0) return null;
  const kinds = (n: number) => plural(n, 'kind of record', 'kinds of records');
  const sentence = changes.length === 0
    ? `It changes nothing a run reaches and reads ${kinds(reads.length)}.`
    : reads.length === 0
      ? `It changes ${kinds(changes.length)} and reads nothing else.`
      : `It changes ${kinds(changes.length)} and only reads ${reads.length} others.`;
  return { changes, reads, sentence, lines: sortedLines([...changes, ...reads].flatMap((r) => r.lines)) };
}
