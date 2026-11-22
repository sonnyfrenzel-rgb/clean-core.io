/**
 * Speed of Phase 0 "parse once" (docs/design/engine4.md, "Phase 0").
 *
 *   npx tsx scripts/engine4/timing-parse.ts            # the table
 *   npx tsx scripts/engine4/timing-parse.ts --profile  # plus the share of the evidence pass spent re-reading
 *
 * Inputs: the 1,000-line starter concatenated to 1k, 10k, 25k and 50k lines
 * (`sourceOf` in timing.ts). Median of five runs after one warm-up.
 *
 *   - **one read, old:** `readStatements` + `readBlocks` + `maskLiterals` of
 *     every statement + `maskNonCode` + `maskComments` + `containerAt` for every
 *     line — the products `parseSource` hands over, made the shipping way, once.
 *   - **one read, new:** `parseSource` with every product forced.
 *
 * `--profile` runs `buildAbapEvidence` under the V8 profiler on 1k and 10k lines
 * and sums the self time of the functions in `statement-reader.ts` and
 * `block-structure.ts`: what the evidence pass spends cutting, masking and
 * nesting the same text again, which is the part parse once removes. Read only;
 * nothing here is wired into the product.
 */
import { Session } from 'inspector';
import { performance } from 'perf_hooks';
import { readStatementsShipping as readStatements, maskLiterals, maskNonCode, maskComments } from '../../lib/abap/statement-reader';
import { readBlocks, containerAtScan as containerAt } from '../../lib/abap/block-structure';
import { buildAbapEvidence } from '../../lib/abap/evidence-model';
import { parseSource } from '../../lib/engine4/parsed-source';
import { sourceOf } from './timing';

function median(f: () => void): number {
  f();
  const runs: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now();
    f();
    runs.push(performance.now() - t0);
  }
  return runs.sort((a, b) => a - b)[2];
}

export function oldRead(src: string): number {
  const list = readStatements(src);
  const containers = readBlocks(list).containers;
  let n = 0;
  for (const s of list) n += maskLiterals(s.text).length;
  n += maskNonCode(src).length + maskComments(src).length;
  const lines = src.split('\n').length;
  for (let l = 1; l <= lines; l++) if (containerAt(containers, l)) n += 1;
  return n;
}

export function newRead(src: string): number {
  const p = parseSource(src);
  let n = 0;
  for (let i = 0; i < p.compat.length; i++) n += p.maskedText(i).length;
  n += p.maskNonCode().length + p.maskComments().length;
  for (let l = 1; l <= p.lines.length; l++) if (p.containerAt(l)) n += 1;
  return n;
}

interface ProfileNode { id: number; callFrame: { url: string; functionName: string }; children?: number[] }
interface Profile { nodes: ProfileNode[]; samples: number[]; timeDeltas: number[] }

/** Self time per file of one call, in ms, from the V8 sampling profiler. */
async function profile(run: () => void): Promise<{ total: number; reading: number }> {
  const session = new Session();
  session.connect();
  const post = <T>(method: string, params?: object) => new Promise<T>((resolve, reject) => session.post(method, params ?? {}, (err, res) => (err ? reject(err) : resolve(res as T))));
  await post('Profiler.enable');
  await post('Profiler.setSamplingInterval', { interval: 200 });
  await post('Profiler.start');
  run();
  const { profile: p } = await post<{ profile: Profile }>('Profiler.stop');
  session.disconnect();
  const byId = new Map(p.nodes.map((n) => [n.id, n]));
  let total = 0;
  let reading = 0;
  p.samples.forEach((id, k) => {
    const ms = p.timeDeltas[k] / 1000;
    total += ms;
    const url = byId.get(id)?.callFrame.url ?? '';
    if (/statement-reader|block-structure/.test(url)) reading += ms;
  });
  return { total, reading };
}

if (require.main === module) {
  (async () => {
    console.log('lines | one read, old | one read, new (parseSource) | old/new');
    for (const n of [1000, 10000, 25000, 50000]) {
      const src = sourceOf(n);
      const o = median(() => oldRead(src));
      const w = median(() => newRead(src));
      console.log(`${n} | ${o.toFixed(0)} ms | ${w.toFixed(0)} ms | ${(o / w).toFixed(1)}x`);
    }
    if (process.argv.includes('--profile')) {
      console.log('lines | buildAbapEvidence | of it in statement-reader/block-structure (self time)');
      for (const n of [1000, 10000]) {
        const src = sourceOf(n);
        buildAbapEvidence(src, 'z.abap', 'private');
        const r = await profile(() => buildAbapEvidence(src, 'z.abap', 'private'));
        console.log(`${n} | ${r.total.toFixed(0)} ms | ${r.reading.toFixed(0)} ms (${((100 * r.reading) / r.total).toFixed(0)} %)`);
      }
    }
  })();
}
