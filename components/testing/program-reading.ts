import { assessCoverage } from '@/lib/abap/coverage';
import { readCallGraph } from '@/lib/abap/call-graph';
import type { HandCheckGap } from './HandChecks';
import type { StripBand, StripMark } from './ProgramStrip';

/**
 * What the Testing tool reads from the source itself — the engine's coverage
 * report and the program's routines. Pure and cheap (no catalog), so the page
 * can compute it on render; the findings for the strip's ticks come from the
 * full evidence engine, which the page loads on its own.
 */
export interface ProgramReading {
  lines: number;
  gaps: HandCheckGap[];
  marks: StripMark[];
  bands: StripBand[];
}

export function readProgram(source: string | null | undefined): ProgramReading | null {
  const code = typeof source === 'string' ? source : '';
  if (!code.trim()) return null;
  const coverage = assessCoverage(code);
  const whyOf = (gap: string) => coverage.unassessed.find((u) => u.gap === gap)?.why;
  let bands: StripBand[] = [];
  try {
    bands = readCallGraph(code).forms.map((f) => ({ name: f.name, lineStart: f.lineStart, lineEnd: f.lineEnd }));
  } catch {
    // A source the call-graph reader cannot follow still has its coverage report.
    bands = [];
  }
  return {
    lines: code.split('\n').length,
    gaps: coverage.gaps.map((g) => ({ label: g.label, count: g.count, firstLine: g.firstLine, why: whyOf(g.gap) })),
    // One mark per kind, at its first line — the rows of the list above the strip.
    marks: coverage.gaps.map((g) => ({ line: g.firstLine, label: `${g.count} × ${g.label.toLowerCase()}` })),
    bands,
  };
}
