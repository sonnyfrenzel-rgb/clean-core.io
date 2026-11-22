/**
 * Skeleton timing (engine 4 phase 3): `buildProcessFacts` and the skeleton build on top of it, separately, on the
 * 1,000-line starter concatenated (`sourceOf` in scripts/engine4/timing.ts). Median of `--runs` (default 3) after
 * one warm-up.
 *
 *   npx tsx scripts/engine/skeleton-timing.ts [--runs 3] [--sizes 1000,5000,10000,25000]
 */
import { performance } from 'perf_hooks';
import { buildProcessFacts } from '../../lib/abap/process-facts';
import { buildProcessSkeletonFrom } from '../../lib/abap/process-skeleton';
import { sourceOf } from '../engine4/timing';

function median(xs: number[]): number {
  return [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
}

export function skeletonMillis(lines: number, runs = 3): { facts: number; skeleton: number } {
  const source = sourceOf(lines);
  buildProcessSkeletonFrom(buildProcessFacts(source));
  const facts: number[] = [];
  const skeleton: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    const f = buildProcessFacts(source);
    const t1 = performance.now();
    buildProcessSkeletonFrom(f);
    const t2 = performance.now();
    facts.push(t1 - t0);
    skeleton.push(t2 - t1);
  }
  return { facts: median(facts), skeleton: median(skeleton) };
}

if (require.main === module) {
  const arg = (name: string) => { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1]; };
  const runs = Number(arg('--runs') ?? 3);
  const sizes = (arg('--sizes') ?? '1000,5000,10000,25000').split(',').map(Number);
  console.log('lines | facts | skeleton');
  for (const lines of sizes) {
    const r = skeletonMillis(lines, runs);
    console.log(`${lines} | ${Math.round(r.facts)} ms | ${Math.round(r.skeleton)} ms`);
  }
}
