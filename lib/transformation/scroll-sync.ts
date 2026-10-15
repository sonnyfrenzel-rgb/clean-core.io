/**
 * Side by side scrolls by the trace, not by percent (roadmap 3.0.14, item 6;
 * owner decision 15.10.2026).
 *
 * The two panes of the Transformation page used to keep the same scroll
 * percentage, so line 1051 of the original sat next to whatever part of the
 * open file happened to be at the same height. The package's
 * `traceability.json` says which ABAP lines every function stands for; this
 * module turns that into the two mappings the panes need:
 *
 *   - a line of the original → the unit whose ABAP lines contain it (the
 *     narrowest, or the nearest preceding one) → the first line of that unit's
 *     function in the open file, when the file holds it;
 *   - a line of the open file → the function it stands in → that function's
 *     unit → the unit's first ABAP line.
 *
 * A file that holds no traced function (TRACE.md, metadata, configuration,
 * package.json) or a package without traceability does not sync, and says so.
 *
 * Pure: no DOM, no network. The page measures the lines; this only maps them.
 */

import type { Trace, TraceUnit } from './types';

/** A function or method declared in the open file, with its 1-based line. */
export interface SyncFunction {
  name: string;
  line: number;
  /** The unit it implements, or null for an engine-written helper with no unit. */
  unitId: string | null;
}

/** The open file, read for syncing: its declarations in line order. */
export interface FileSync {
  path: string;
  functions: SyncFunction[];
}

export type SyncScope =
  | { applies: true; file: FileSync }
  | { applies: false; reason: 'no-trace' | 'no-link' };

/** Where the other pane should go: the line, and the unit it belongs to. */
export interface SyncTarget {
  unitId: string;
  line: number;
}

const TS_FUNCTION = /^export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/;
const ABAP_METHOD = /^\s*METHOD\s+([\w~]+)\s*\./i;

/** Every function (TypeScript) or method (ABAP) the file declares, in line order. */
function declarations(path: string, content: string): Array<{ name: string; line: number }> {
  const abap = /\.abap$/i.test(path);
  const ts = /\.(ts|mts|js|mjs)$/i.test(path);
  if (!abap && !ts) return [];
  const re = abap ? ABAP_METHOD : TS_FUNCTION;
  const out: Array<{ name: string; line: number }> = [];
  content.replace(/\r\n?/g, '\n').split('\n').forEach((text, index) => {
    const m = re.exec(text);
    if (m) out.push({ name: m[1], line: index + 1 });
  });
  return out;
}

const sameName = (path: string, a: string, b: string) => (/\.abap$/i.test(path) ? a.toLowerCase() === b.toLowerCase() : a === b);

/** The first ABAP line a unit stands for, or null when it names none. */
export function firstAbapLine(unit: Pick<TraceUnit, 'abap'>): number | null {
  if (!unit.abap.length) return null;
  return Math.min(...unit.abap.map((a) => a.lineStart));
}

/**
 * Whether the open file syncs with the original, and its declarations when it does.
 * `trace` null: the package has no traceability (the single call, a package from before 3.0.12).
 */
export function syncScopeOf(trace: Trace | null, path: string, content: string): SyncScope {
  if (!trace) return { applies: false, reason: 'no-trace' };
  const units = trace.units.filter((u) => u.file === path && u.abap.length > 0);
  if (!units.length) return { applies: false, reason: 'no-link' };
  const functions = declarations(path, content).map((d) => ({
    ...d,
    unitId: units.find((u) => sameName(path, u.fn, d.name))?.unitId ?? null,
  }));
  if (!functions.some((f) => f.unitId !== null)) return { applies: false, reason: 'no-link' };
  return { applies: true, file: { path, functions } };
}

/**
 * The unit a line of the original belongs to: the narrowest ABAP range that holds it, or,
 * between units, the one whose range ended last before it. Null before the first unit.
 */
export function unitAtAbapLine(trace: Trace, line: number): TraceUnit | null {
  let containing: { unit: TraceUnit; width: number } | null = null;
  let preceding: { unit: TraceUnit; end: number } | null = null;
  for (const unit of trace.units) {
    for (const a of unit.abap) {
      if (a.lineStart <= line && line <= a.lineEnd) {
        const width = a.lineEnd - a.lineStart;
        if (!containing || width < containing.width) containing = { unit, width };
      } else if (a.lineEnd < line && (!preceding || a.lineEnd > preceding.end)) {
        preceding = { unit, end: a.lineEnd };
      }
    }
  }
  return containing?.unit ?? preceding?.unit ?? null;
}

/** The line of the open file to bring to the top for a line of the original, or null. */
export function targetLineForAbapLine(trace: Trace, file: FileSync, abapLine: number): SyncTarget | null {
  const unit = unitAtAbapLine(trace, abapLine);
  if (!unit) return null;
  const fn = file.functions.find((f) => f.unitId === unit.unitId);
  return fn ? { unitId: unit.unitId, line: fn.line } : null;
}

/** The line of the original to bring to the top for a line of the open file, or null. */
export function abapLineForTargetLine(trace: Trace, file: FileSync, targetLine: number): SyncTarget | null {
  const fn = file.functions.filter((f) => f.line <= targetLine).at(-1);
  if (!fn || !fn.unitId) return null;
  // A split routine's parts share one function: go to the earliest of their lines.
  const lines = trace.units
    .filter((u) => u.file === file.path && sameName(file.path, u.fn, fn.name))
    .map(firstAbapLine)
    .filter((l): l is number => l !== null);
  if (!lines.length) return null;
  return { unitId: fn.unitId, line: Math.min(...lines) };
}

/** The short sentence beside the toggle — honest about when the panes follow each other. */
export function syncNote(scope: SyncScope, options: { on: boolean; stacked: boolean; fileName: string }): string {
  if (options.stacked) return 'On a narrow screen the panes are stacked and scroll on their own.';
  if (!scope.applies) {
    return scope.reason === 'no-trace'
      ? 'Sync does not apply: this package has no traceability, so the panes scroll on their own.'
      : `Sync does not apply to ${options.fileName || 'this file'}: no function in it is traced to the original.`;
  }
  return options.on
    ? 'A line of the original brings its function to the top, and a function brings its lines.'
    : 'The panes scroll on their own.';
}
