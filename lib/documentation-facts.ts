import { readCallGraph, type CallGraphReport } from '@/lib/abap/call-graph';
import { readTableDependencies, type TableDependencyReport } from '@/lib/abap/table-dependencies';
import type { ProcessSkeleton } from '@/lib/abap/process-skeleton';
import { CAPABILITY_FACTS_VERSION, type CapabilityFacts, type FactCall, type FactObject } from '@/lib/documentation-capabilities';

/**
 * The engine's reading of what a program can do — the input of
 * `capabilityPresence` (`lib/documentation-capabilities.ts`). Built from the
 * same readers the process map, the process description and the Design stage
 * run on the same source: the table reader, the call graph and the skeleton's
 * LUW states. Nothing here is new knowledge; it is kept in one small object so
 * the stored documentation can carry it and the business page, the SOP check
 * and the delivery package can say what the program does not do without the
 * source.
 *
 * Pure: no network, no clock, no React.
 */

const first = (list: FactObject[]): FactObject[] => {
  const seen = new Set<string>();
  const out: FactObject[] = [];
  for (const o of [...list].sort((a, b) => a.line - b.line)) {
    const key = o.name.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name: key, line: o.line });
  }
  return out;
};

export function capabilityFactsOf(
  source: string,
  skeleton: Pick<ProcessSkeleton, 'luw'>,
  readers: { calls?: CallGraphReport; tables?: TableDependencyReport } = {},
): CapabilityFacts {
  const calls = readers.calls ?? readCallGraph(source);
  const tables = readers.tables ?? readTableDependencies(source);
  const rowAccess = tables.dependencies.filter((d) => d.route !== 'type-reference' && d.route !== 'program-global' && !d.possibleTargetOf);
  const reads = first(rowAccess.filter((d) => d.access === 'read').map((d) => ({ name: d.table, line: d.line })));
  const writes = first([
    ...rowAccess.filter((d) => d.access === 'write').map((d) => ({ name: d.table, line: d.line })),
    ...calls.databaseWrites.map((w) => ({ name: w.table, line: w.lineStart })),
  ]);
  const commits = skeleton.luw.events
    .filter((e) => e.kind === 'commit')
    .map((e) => ({ name: e.token, line: e.lineStart }));
  const updateTask = calls.functionModules
    .filter((f) => f.inUpdateTask)
    .map((f) => ({ name: f.name ?? 'a module named at run time', line: f.lineStart }));
  const callList: FactCall[] = [
    ...calls.functionModules.filter((f) => f.name).map((f): FactCall => ({
      name: (f.name as string).toUpperCase(),
      kind: f.bapi ? 'bapi' : 'function',
      line: f.lineStart,
      destination: f.destination ?? null,
    })),
    ...calls.transactions.filter((t) => t.code).map((t): FactCall => ({ name: (t.code as string).toUpperCase(), kind: 'transaction', line: t.lineStart, destination: null })),
    ...calls.submits.filter((s) => s.program).map((s): FactCall => ({ name: (s.program as string).toUpperCase(), kind: 'program', line: s.lineStart, destination: null })),
  ];
  // Classes the code instantiates or calls statically: CL_BCS (mail), CL_BALI_* (log), CL_SWF_* (workflow).
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  lines.forEach((text, i) => {
    if (/^\s*\*/.test(text)) return;
    const code = text.replace(/".*$/, '');
    for (const m of code.matchAll(/\b(CL_BCS|CL_BALI_\w+|CL_SWF_\w+|CL_DOCUMENT_BCS)\b/gi)) {
      callList.push({ name: m[1].toUpperCase(), kind: 'method', line: i + 1, destination: null });
    }
  });
  const seenCall = new Set<string>();
  const uniqueCalls = callList
    .sort((a, b) => a.line - b.line)
    .filter((c) => {
      const key = `${c.kind}:${c.name}:${c.destination ?? ''}`;
      if (seenCall.has(key)) return false;
      seenCall.add(key);
      return true;
    });
  const authority = first(calls.authorityChecks.filter((a) => a.object).map((a) => ({ name: a.object as string, line: a.lineStart })));
  const dynamic = calls.performs.filter((p) => p.dynamic).length
    + calls.functionModules.filter((f) => f.dynamic).length
    + tables.unresolved.length;
  // A change whose table is named at run time: its possible targets are left
  // out of `writes` (never the target, R26), so it is recorded here and keeps
  // "no posting" from being said.
  const dynamicWrites = tables.unresolved
    .filter((u) => u.access === 'write')
    .map((u) => ({ name: u.expression.toUpperCase(), line: u.line }));
  // A call whose target is named at run time could be a posting BAPI: recorded
  // so "no posting" is not said.
  const operand = (text: string, re: RegExp, fallback: string) => (re.exec(text)?.[1] ?? fallback).replace(/\.$/, '').toUpperCase();
  // A read whose table is named at run time could be any table — a ledger
  // table too — so it is recorded and keeps "no ledger table is read" from
  // being said. The values the source shows for it are kept as possible
  // targets, apart from `reads` (never the target, R26).
  const dynamicReads = tables.unresolved
    .filter((u) => u.access === 'read')
    .map((u) => ({ name: u.expression.toUpperCase(), line: u.line }));
  const possibleReads = first(tables.dependencies
    .filter((d) => d.possibleTargetOf && d.access === 'read' && d.route !== 'type-reference' && d.route !== 'program-global')
    .map((d) => ({ name: d.table, line: d.line })));
  const dynamicCalls: Array<FactObject & { destination?: string }> = [
    ...calls.functionModules.filter((f) => f.dynamic).map((f) => ({
      name: operand(f.text, /\bCALL\s+FUNCTION\s+(\S+)/i, 'a module named at run time'),
      line: f.lineStart,
      ...(f.destination ? { destination: f.destination } : {}),
    })),
    ...calls.performs.filter((p) => p.dynamic).map((p) => ({ name: operand(p.text, /\bPERFORM\s+(\([^)]*\)|\S+)/i, 'a routine named at run time'), line: p.lineStart })),
  ].sort((a, b) => a.line - b.line);
  // Hotfix 3.0.22 (HF-d): an approval the program handles in its own code — a value or a name that approves or
  // overrides (`'APPROVED'`, `approve`, `lv_approver`, `'RELEASED'`), outside comments. First line per name. Not
  // "rejected": a rejected sales item is no approval.
  const ownApproval = first(namesInCode(lines, /\b[\w]*(?:APPROV|OVERRID)[\w]*\b|'RELEASED?'/gi));
  const ownAuthorization = ownAuthorizationIn(lines);
  return {
    version: CAPABILITY_FACTS_VERSION,
    reads,
    writes,
    commits,
    updateTask,
    calls: uniqueCalls,
    authority,
    dynamic,
    dynamicWrites,
    dynamicCalls,
    dynamicReads,
    possibleReads,
    ownApproval,
    ownAuthorization,
  };
}

/** The line up to its `"` comment — a `"` inside a literal is text, not a comment. Nothing for a `*` comment line. */
function codeOf(text: string): string {
  if (/^\s*\*/.test(text)) return '';
  let quote: string | null = null;
  for (let k = 0; k < text.length; k++) {
    const ch = text[k];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === "'" || ch === '`') quote = ch;
    else if (ch === '"') return text.slice(0, k);
  }
  return text;
}

function namesInCode(lines: string[], pattern: RegExp): FactObject[] {
  return lines.flatMap((text, i) => [...codeOf(text).matchAll(pattern)].map((m) => ({ name: m[0].replace(/'/g, ''), line: i + 1 })));
}

/**
 * Lines where the program checks who may act in its own code rather than with an SAP authorization object: a name
 * that authorizes or requires a role (`require_role`, `check_role`, `is_authorized`, `'NOT_AUTHORIZED'`), outside
 * comments. Hotfix 3.0.22: owner example A checks a role from its own grant table and raises 'NOT_AUTHORIZED', and the
 * documentation said "The code checks no authorization of its own". `AUTHORITY-CHECK` is not matched here — it is
 * read as an SAP authorization object (`calls.authorityChecks`). First line per name.
 */
export function ownAuthorizationIn(source: string | string[]): FactObject[] {
  const lines = Array.isArray(source) ? source : source.replace(/\r\n?/g, '\n').split('\n');
  return first(namesInCode(lines, /\b\w*AUTHORI[SZ]\w*\b|'\w*AUTHORI[SZ]\w*'|\b(?:\w+_)?(?:require|check|has|assert|verify)_roles?\b/gi));
}
