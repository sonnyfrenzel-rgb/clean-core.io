import { countSourceLines } from '@/lib/source-lines';

/**
 * The two pieces of `lib/analysis-run.ts` a screen needs before any run starts.
 *
 * The workspace list report shows the scope of a run in each row and has to
 * recognise a cancelled one, so it needs `runScope` and `AnalysisRunCancelled`
 * on its first render. `runAnalysis` itself it needs only when someone presses
 * Run — and `analysis-run.ts` imports the evidence engine, which reads the
 * ~4.5 MB SAP catalog. Kept here, importing nothing but the dependency-free
 * line counter (`lib/source-lines.ts`), the list can load
 * these two statically and fetch the run (engine and catalog with it) on the
 * click (external audit PERF-01, 02.10.2026). `analysis-run.ts` throws this
 * same class and re-exports both, so no other caller changes.
 */

/** Thrown when the caller's `AbortSignal` fired. Not an error to report as one. */
export class AnalysisRunCancelled extends Error {
  constructor() {
    super('The analysis was cancelled in this browser.');
    this.name = 'AnalysisRunCancelled';
  }
}

/** "1 program, 668 lines" — the scope sentence §2.8 asks for before a long run. */
export function runScope(legacyCode: string): string {
  const lines = countSourceLines(legacyCode);
  return `Reading 1 program, ${new Intl.NumberFormat('en').format(lines)} lines`;
}
