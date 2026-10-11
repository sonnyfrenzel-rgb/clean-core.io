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
  // "no posting" from being said (QA review of 11e3bc7d90e8).
  const dynamicWrites = tables.unresolved
    .filter((u) => u.access === 'write')
    .map((u) => ({ name: u.expression.toUpperCase(), line: u.line }));
  // A call whose target is named at run time could be a posting BAPI: recorded
  // so "no posting" is not said (QA review of 35b97d90c6e1).
  const operand = (text: string, re: RegExp, fallback: string) => (re.exec(text)?.[1] ?? fallback).replace(/\.$/, '').toUpperCase();
  const dynamicCalls = [
    ...calls.functionModules.filter((f) => f.dynamic).map((f) => ({ name: operand(f.text, /\bCALL\s+FUNCTION\s+(\S+)/i, 'a module named at run time'), line: f.lineStart })),
    ...calls.performs.filter((p) => p.dynamic).map((p) => ({ name: operand(p.text, /\bPERFORM\s+(\([^)]*\)|\S+)/i, 'a routine named at run time'), line: p.lineStart })),
  ].sort((a, b) => a.line - b.line);
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
  };
}
