/**
 * Reach of the engine-led checks on the sources the repository holds (owner,
 * 13.10.2026) — how many of the functions the model writes are actually tested
 * by an engine case or a probe. The method is in `./reach.ts`.
 *
 *   npx tsx scripts/transformation/measure-reach.ts [--only co,pp,sd,po] [--variants empty,stub,reference] [--what-if] [--json]
 *
 *   sources      the hand-written fixtures modelled on the CO, PP and SD review programs
 *                (tests/fixtures/transformation/*-shape.abap) and the PO starter example
 *                (public/starter-examples/Z_MM_PO_APPROVAL.abap); the files are only read
 *   variants     empty      — the scaffold as the engine writes it, every region a stub that throws NotImplementedFill
 *                stub       — the fills the Gemini test stub writes (bodies `return undefined`, predicates `return false`)
 *                reference  — hand-written correct fills (tests/fixtures/transformation/reference-fills/<name>.json),
 *                             standing in for a model that ports the program faithfully; only where the file exists
 *   CC_SES_ROOT  a directory whose node_modules/ses holds SES, when the checkout's node_modules lacks it
 *   --what-if    also an in-memory variant of each source whose obligatory input has no value in the original,
 *                with a selection-screen DEFAULT added (PO: P_BANFN, PP: P_WERKS, SD: P_VKORG). The values are
 *                the measurement's, not the original's: they show what reach a DEFAULT would give. The files on
 *                disk are never changed.
 *
 * Per source and variant: fill regions (functions and predicates), engine cases by scope × outcome, probes
 * run / skipped, REACH (regions whose throwing or wrong-answer mutant changes a check's verdict) and value
 * reach (the wrong-answer mutant alone). No network, no model; the engine and probe passes run in the local
 * sandbox (SES), as the verify route runs them.
 */
import fs from 'node:fs';
import path from 'node:path';
import { caseTable, measureReach, prepared, referenceBodies, stubBodies, type ReachResult } from './reach';

const ROOT = path.join(__dirname, '..', '..');
const FIX = path.join(ROOT, 'tests', 'fixtures', 'transformation');

export interface ReachSource {
  key: string;
  label: string;
  source: string;
  reference: string | null;
}

/** The four sources, and their what-if variants (an obligatory input given a DEFAULT in memory). */
export function reachSources(whatIf: boolean): ReachSource[] {
  const read = (p: string) => fs.readFileSync(p, 'utf8');
  const ref = (name: string) => {
    const f = path.join(FIX, 'reference-fills', `${name}.json`);
    return fs.existsSync(f) ? f : null;
  };
  const co = read(path.join(FIX, 'co-shape.abap'));
  const pp = read(path.join(FIX, 'pp-shape.abap'));
  const sd = read(path.join(FIX, 'sd-shape.abap'));
  const po = read(path.join(ROOT, 'public', 'starter-examples', 'Z_MM_PO_APPROVAL.abap'));
  const out: ReachSource[] = [
    { key: 'co', label: 'CO (co-shape)', source: co, reference: ref('co-shape') },
    { key: 'pp', label: 'PP (pp-shape)', source: pp, reference: ref('pp-shape') },
    { key: 'sd', label: 'SD (sd-shape)', source: sd, reference: ref('sd-shape') },
    { key: 'po', label: 'PO demo', source: po, reference: null },
  ];
  if (whatIf) {
    const withDefault = (src: string, from: RegExp, to: string) => {
      const next = src.replace(from, to);
      if (next === src) throw new Error(`what-if: ${from} not found`);
      return next;
    };
    out.push(
      { key: 'po+default', label: "PO demo + DEFAULT '0010000001' for P_BANFN (what-if)", source: withDefault(po, /p_banfn TYPE eban-banfn OBLIGATORY,/, "p_banfn TYPE eban-banfn OBLIGATORY DEFAULT '0010000001',"), reference: null },
      { key: 'pp+default', label: "PP + DEFAULT '1000' for P_WERKS (what-if)", source: withDefault(pp, /PARAMETERS p_werks TYPE werks_d OBLIGATORY\./, "PARAMETERS p_werks TYPE werks_d OBLIGATORY DEFAULT '1000'."), reference: ref('pp-shape') },
      { key: 'sd+default', label: "SD + DEFAULT '1000' for P_VKORG (what-if)", source: withDefault(sd, /PARAMETERS p_vkorg TYPE vkorg OBLIGATORY\./, "PARAMETERS p_vkorg TYPE vkorg OBLIGATORY DEFAULT '1000'."), reference: ref('sd-shape') },
    );
  }
  return out;
}

const pct = (n: number, d: number) => (d === 0 ? '—' : `${Math.round((100 * n) / d)} %`);

export function reachRow(r: ReachResult): string {
  const t = caseTable(r.baseline);
  const cases = (s: { passed: number; failed: number; notRun: number }) => `${s.passed}/${s.failed}/${s.notRun}`;
  const probesRun = r.baseline.probes.filter((p) => p.status !== 'Skipped').length;
  const probesFills = r.perRegion.some((p) => [...p.throwBy, ...p.wrongBy].some((id) => id.startsWith('PRB_')));
  return [
    r.label.padEnd(54),
    r.variant.padEnd(9),
    `${r.regions} (${r.units} fn + ${r.predicates} pred)`.padEnd(20),
    `fills ${cases(t.fills)}`.padEnd(16),
    `engine ${cases(t['engine-code'])}`.padEnd(17),
    `probes ${probesRun} run${probesFills ? ' (reach fills)' : ''}, ${r.baseline.probesSkipped.length} skipped`.padEnd(34),
    `REACH ${r.reached}/${r.regions} = ${pct(r.reached, r.regions)}`.padEnd(20),
    `value ${r.valueReached}/${r.regions} = ${pct(r.valueReached, r.regions)}`,
  ].join(' ');
}

async function main() {
  // The sandbox reads SES from <cwd>/node_modules/ses (lib/test-sandbox/core.ts); a checkout without it can point here.
  if (process.env.CC_SES_ROOT) process.chdir(process.env.CC_SES_ROOT);
  const args = process.argv.slice(2);
  const opt = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : null;
  };
  const only = opt('--only')?.split(',') ?? null;
  const variants = (opt('--variants') ?? 'empty,stub,reference').split(',');
  const json = args.includes('--json');
  const detail = args.includes('--detail');
  const sources = reachSources(args.includes('--what-if')).filter((s) => !only || only.includes(s.key));
  if (!json) process.stdout.write('source / variant / regions / cases passed/failed/not run (fills, engine code) / probes / REACH / value reach\n');
  for (const s of sources) {
    const prep = prepared(s.source);
    for (const v of variants) {
      if (v === 'reference' && !s.reference) continue;
      const bodies = v === 'empty' ? new Map<string, string>() : v === 'stub' ? stubBodies(prep) : referenceBodies(s.reference!, prep);
      const r = await measureReach(s.label, s.source, v, bodies, { prep });
      if (json) {
        process.stdout.write(
          `${JSON.stringify({
            source: s.key,
            variant: v,
            regions: r.regions,
            units: r.units,
            predicates: r.predicates,
            cases: caseTable(r.baseline),
            casesNotRun: r.baseline.casesNotRun,
            notRunReasons: [...new Set(r.baseline.cases.filter((c) => c.status === 'Not run').map((c) => c.reason))],
            probes: r.baseline.probes.map((p) => `${p.id}:${p.status}`),
            probesSkipped: r.baseline.probesSkipped.map((p) => p.probe),
            reached: r.reached,
            valueReached: r.valueReached,
            perRegion: r.perRegion,
          })}\n`,
        );
      } else {
        process.stdout.write(`${reachRow(r)}\n`);
        if (detail) {
          for (const p of r.perRegion) process.stdout.write(`    ${p.regionId.padEnd(10)} throw→${p.throwBy.length ? p.throwBy.join(',') : '-'}  wrong→${p.wrongBy.length ? p.wrongBy.join(',') : '-'}\n`);
          const reasons = [...new Set(r.baseline.cases.filter((c) => c.status !== 'Passed').map((c) => `${c.id} ${c.status}: ${(c.reason ?? '').slice(0, 140)}`))];
          for (const x of reasons) process.stdout.write(`    ${x}\n`);
        }
      }
    }
  }
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.stack : String(err)}\n`);
    process.exit(1);
  });
}
