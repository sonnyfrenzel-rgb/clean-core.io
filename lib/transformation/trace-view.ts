/**
 * The Transformation page's reading of a stored engine-led package (roadmap
 * 3.0.12, step E; design §12.1): the file tree grouped the way a reader looks
 * for things — the steps in process order under their names, the
 * engine-written frame, the tests, what to read first — and, for a step's
 * file, the anchor row: its ABAP lines, its rules with the owner's decision,
 * and who wrote the body.
 *
 * Read from the package's own `traceability.json`; a package without one (the
 * single call, a package from before 3.0.12) is not grouped. Pure.
 */

import type { Trace, TraceUnit } from './types';

export function traceOfFiles(files: ReadonlyArray<{ path: string; content: string }>): Trace | null {
  const file = files.find((f) => f.path === 'traceability.json');
  if (!file) return null;
  try {
    const t = JSON.parse(file.content) as Trace;
    return t && t.format === 'clean-core.traceability/1' && Array.isArray(t.units) ? t : null;
  } catch {
    return null;
  }
}

export interface FileGroup {
  key: 'steps' | 'engine' | 'tests' | 'read-first' | 'other';
  label: string;
  files: Array<{ path: string; label: string }>;
}

const READ_FIRST = ['TRACE.md', 'traceability.json', 'STATUS.md'];

/** The tree's groups, in the order a reader goes through them; empty groups are left out. */
export function fileGroups(files: ReadonlyArray<{ path: string }>, trace: Trace): FileGroup[] {
  const taken = new Set<string>();
  const steps: FileGroup['files'] = [];
  for (const u of trace.units) {
    if (u.kind === 'orchestrator') continue;
    if (taken.has(u.file) || !files.some((f) => f.path === u.file)) continue;
    taken.add(u.file);
    steps.push({ path: u.file, label: `${u.unitId} ${u.title}` });
  }
  const orchestrator = trace.units.find((u) => u.kind === 'orchestrator');
  const pick = (test: (p: string) => boolean) =>
    files
      .filter((f) => !taken.has(f.path) && test(f.path))
      .map((f) => {
        taken.add(f.path);
        return { path: f.path, label: f.path === orchestrator?.file ? `${f.path} — main path` : f.path };
      });
  const readFirst = pick((p) => READ_FIRST.includes(p));
  const tests = pick((p) => p.startsWith('test/') || p === 'acceptance-adapter.json' || /\.testclasses\.abap$/.test(p));
  const engine = pick((p) => p.startsWith('srv/') || p.startsWith('src/') || p.startsWith('db/'));
  const other = pick(() => true);
  return [
    { key: 'read-first' as const, label: 'Read first', files: readFirst },
    { key: 'steps' as const, label: 'Steps, in process order', files: steps },
    { key: 'engine' as const, label: 'Engine-written frame', files: engine },
    { key: 'tests' as const, label: 'Tests', files: tests },
    { key: 'other' as const, label: 'Other files', files: other },
  ].filter((g) => g.files.length > 0);
}

/** The units whose function lives in this file (a split routine's parts share one). */
export function unitsOfFile(trace: Trace, path: string): TraceUnit[] {
  return trace.units.filter((u) => u.file === path);
}

/** `L500–L540, L612` — the ABAP lines of a unit. */
export function abapLines(u: Pick<TraceUnit, 'abap'>): string {
  return u.abap.map((a) => (a.lineStart === a.lineEnd ? `L${a.lineStart}` : `L${a.lineStart}–L${a.lineEnd}`)).join(', ');
}
