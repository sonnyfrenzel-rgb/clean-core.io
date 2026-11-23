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
 *
 * **Skeleton and business statements (3.4.0, engine review of 22.11.2026).** `buildProcessSkeleton` and
 * `buildBusinessStatements` are super-linear today (25k lines: about 19 s and 25 s; 10k → 20k lines: 8.8x and 4.2x)
 * and were unguarded. They are guarded as a measurement of today's curve, so they fail on a regression and not on
 * the curve as it is: doubling 5k lines (median of three after one warm-up), against the factor measured on
 * 22.11.2026 plus a margin for machine noise (`PIPELINE_LIMITS`). Making them linear is its own work item; when it lands,
 * the limits come down to the evidence's 2.4.
 */
import { performance } from 'perf_hooks';
import { buildAbapEvidence } from '../../lib/abap/evidence-model';
import { buildProcessSkeleton } from '../../lib/abap/process-skeleton';
import { buildBusinessStatements } from '../../lib/abap/business-statement';
import { sourceOf } from '../engine4/timing';
import { APP_VERSION } from '../../lib/version';

export const SCALING_LIMIT = 2.4;
export const SCALING_SIZES = [1_000, 10_000, 25_000] as const;

export function evidenceMillis(lines: number, runs = 3): number {
  const source = sourceOf(lines);
  buildAbapEvidence(source, 'z.abap', 'private', undefined, APP_VERSION);
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    buildAbapEvidence(source, 'z.abap', 'private', undefined, APP_VERSION);
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

/**
 * Factors measured on 22.11.2026 for 5k → 10k lines (skeleton 2.79–2.94, business 3.30–3.90 over three runs on a
 * loaded machine), plus a margin for machine noise. The 2.5k point was dropped: it moved by a third between runs.
 */
export const PIPELINE_LIMITS: Record<'skeleton' | 'business', Record<number, number>> = {
  skeleton: { 5_000: 4.0 },
  business: { 5_000: 5.0 },
};

const PIPELINES = {
  skeleton: (source: string) => buildProcessSkeleton(source),
  business: (source: string) => buildBusinessStatements(source),
};

function millis(run: () => unknown, runs: number): number {
  run();
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    run();
    times.push(performance.now() - t0);
  }
  return times.sort((a, b) => a - b)[Math.floor(runs / 2)];
}

export interface PipelineRow extends ScalingRow { pipeline: 'skeleton' | 'business'; limit: number }

/** The skeleton and business-statement rows of the guard. */
export function measurePipelineScaling(runs = 3): PipelineRow[] {
  const rows: PipelineRow[] = [];
  for (const pipeline of ['skeleton', 'business'] as const) {
    for (const [at, limit] of Object.entries(PIPELINE_LIMITS[pipeline])) {
      const lines = Number(at);
      const single = millis(() => PIPELINES[pipeline](sourceOf(lines)), runs);
      const double = millis(() => PIPELINES[pipeline](sourceOf(lines * 2)), runs);
      rows.push({ pipeline, lines, single, double, factor: double / single, limit });
    }
  }
  return rows;
}

if (require.main === module) {
  const at = process.argv.indexOf('--runs');
  const rows = measureScaling(at < 0 ? 3 : Number(process.argv[at + 1]));
  console.log('lines | time | 2x lines | time | factor (limit 2.4)');
  for (const r of rows) console.log(`${r.lines} | ${Math.round(r.single)} ms | ${r.lines * 2} | ${Math.round(r.double)} ms | ${r.factor.toFixed(2)}`);
  const pipelines = measurePipelineScaling(at < 0 ? 3 : Number(process.argv[at + 1]));
  for (const r of pipelines) console.log(`${r.pipeline} ${r.lines} | ${Math.round(r.single)} ms | ${r.lines * 2} | ${Math.round(r.double)} ms | ${r.factor.toFixed(2)} (limit ${r.limit})`);
  if (rows.some((r) => r.factor > SCALING_LIMIT) || pipelines.some((r) => r.factor > r.limit)) process.exit(1);
}
