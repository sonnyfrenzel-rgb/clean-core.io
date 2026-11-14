/**
 * Which benchmark cases a measurement reads (`evaluate.ts`): `BM_RANGE=a-b` keeps the numbers from a to b, and
 * `BM_SPLIT=learn` keeps only the learning halves of `split.json` (waves 1+2 and wave 3) — a test-half id is never
 * selected then, so neither its source nor its expected answer is opened. Pure: no file is read here.
 */
export interface BenchmarkSplit {
  learn: readonly string[];
  w3_learn: readonly string[];
}

export function selectBenchmarkIds(
  all: readonly string[],
  options: { range?: string | undefined; split?: string | undefined; readSplit: () => BenchmarkSplit },
): string[] {
  if (options.split && options.split !== 'learn') throw new Error(`BM_SPLIT=${options.split}: only "learn" is supported`);
  const only = options.range?.split('-').map(Number);
  const split = options.split ? options.readSplit() : null;
  const learn = split ? new Set<string>([...split.learn, ...split.w3_learn]) : null;
  return (only ? all.filter((id) => Number(id.slice(3)) >= only[0] && Number(id.slice(3)) <= only[1]) : [...all]).filter(
    (id) => !learn || learn.has(id),
  );
}
