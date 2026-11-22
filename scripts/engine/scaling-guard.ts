/**
 * The pipeline scaling guard of roadmap 3.5.0 item 2 (engine review §4.3, §11
 * phase 0): doubling the input may at most multiply the time of
 * `buildAbapEvidence` by 2.4, measured at 1k, 10k and 25k lines (each against
 * twice its size). Input: the 1,000-line starter concatenated (`sourceOf` in
 * scripts/engine4/timing.ts). Median of `--runs` (default 3) after one warm-up.
 *
 *   npx tsx scripts/engine/scaling-guard.ts            # the table, exit 1 on a breach
 *   npx tsx scripts/engine/scaling-guard.ts --runs 5
 *
 * `tests/engine-scaling-guard.spec.ts` runs the same measurement.
 */
import { performance } from 'perf_hooks';
import { buildAbapEvidence } from '../../lib/abap/evidence-model';
import { sourceOf } from '../engine4/timing';

export const SCALING_LIMIT = 2.4;
export const SCALING_SIZES = [1_000, 10_000, 25_000] as const;

export function evidenceMillis(lines: number, runs = 3): number {
  const source = sourceOf(lines);
  buildAbapEvidence(source, 'z.abap', 'private');
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    buildAbapEvidence(source, 'z.abap', 'private');
    times.push(performance.now() - t0);
  }
  return times.sort((a, b) => a - b)[Math.floor(runs / 2)];
}

export interface ScalingRow { lines: number; single: number; double: number; factor: number }

export function measureScaling(runs = 3, sizes: readonly number[] = SCALING_SIZES): ScalingRow[] {
  return sizes.map((lines) => {
    const single = evidenceMillis(lines, runs);
    const double = evidenceMillis(lines * 2, runs);
    return { lines, single, double, factor: double / single };
  });
}

if (require.main === module) {
  const at = process.argv.indexOf('--runs');
  const rows = measureScaling(at < 0 ? 3 : Number(process.argv[at + 1]));
  console.log('lines | time | 2x lines | time | factor (limit 2.4)');
  for (const r of rows) console.log(`${r.lines} | ${Math.round(r.single)} ms | ${r.lines * 2} | ${Math.round(r.double)} ms | ${r.factor.toFixed(2)}`);
  if (rows.some((r) => r.factor > SCALING_LIMIT)) process.exit(1);
}
