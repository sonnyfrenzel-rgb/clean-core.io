/**
 * Skeleton neutrality (engine 4 phase 3, engine review §8.5): the process skeleton byte for byte.
 *
 * The frozen digests of `frozen-digests.ts` cover evidence and route; neither carries the skeleton. Phase 3
 * splits `SkeletonBuilder` (`lib/abap/process-skeleton.ts`) into typed passes, and every pass must leave
 * `JSON.stringify(buildProcessSkeleton(source, { engineVersion }))` unchanged for every reading the skeleton
 * knows — key order included, so a pass that only reorders a `detail` object is caught as well. This script
 * digests that string for each source and each engine line that reads differently:
 *
 *   - `v3.0.23` (neither gate), `v3.1.0` (`reads310`), `v3.2.0` (`reads310` + `reads320`).
 *
 * Corpus: the frozen corpus (starter examples, benchmark learn halves concatenated per case, never the holdout,
 * and the probes of `engine-v3.2.0-frozen.json`), each learn file on its own, and deterministic mutations of every
 * file (`parse-once-neutrality.ts` `mutations`, thinned with `--mutations <n>`). An external sample can be added
 * with `--corpus <MANIFEST.json> [--group <g>]`.
 *
 *   npx tsx scripts/engine/skeleton-neutrality.ts capture --out <digests.json> [--mutations n] [--corpus …]
 *   npx tsx scripts/engine/skeleton-neutrality.ts check   --in  <digests.json> [same options as the capture]
 *
 * `tests/fixtures/skeleton-v3.2.0-frozen.json` holds the unmutated in-repository part, checked by
 * `tests/skeleton-frozen-digests.spec.ts`; the mutated and external parts are run by hand before each pass is
 * committed (`docs/design/engine4.md`, "Phase 3").
 */
import { createHash } from 'crypto';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { buildProcessSkeleton } from '../../lib/abap/process-skeleton';
import { frozenCorpus } from './frozen-digests';
import { mutations } from './parse-once-neutrality';
import { manifestCorpus, shadowCorpus } from '../engine4/shadow';

export const SKELETON_ENGINES = ['v3.0.23', 'v3.1.0', 'v3.2.0'] as const;

const ROOT = join(__dirname, '..', '..');
const FIXTURES = join(ROOT, 'tests', 'fixtures');

export interface SkeletonSource { key: string; source: string }

/** The probes the evidence fixture of 3.2.0 freezes — the same text for the skeleton. */
function probes(): Record<string, string> {
  return (JSON.parse(readFileSync(join(FIXTURES, 'engine-v3.2.0-frozen.json'), 'utf8')) as { probes: Record<string, string> }).probes;
}

/** The unmutated in-repository corpus: frozen corpus (cases concatenated) plus every learn file on its own. */
export function skeletonCorpus(): SkeletonSource[] {
  const out: SkeletonSource[] = frozenCorpus(probes()).map((e) => ({ key: e.key, source: e.code }));
  for (const f of shadowCorpus()) {
    if (!f.name.startsWith('starter/')) out.push({ key: `file:${f.name}`, source: f.source });
  }
  return out;
}

/** Every `step`-th mutation of each source (`step` 1 = all 29), the unmutated one excluded. */
export function mutatedCorpus(base: readonly SkeletonSource[], step: number): SkeletonSource[] {
  const out: SkeletonSource[] = [];
  for (const s of base) {
    const all = mutations(s.source).filter((m) => m.mutation !== 'none');
    for (let i = 0; i < all.length; i += step) out.push({ key: `${s.key}~${all[i].mutation}`, source: all[i].source });
  }
  return out;
}

export function skeletonDigest(source: string, engine: string): string {
  let text: string;
  try {
    text = JSON.stringify(buildProcessSkeleton(source, { engineVersion: engine }));
  } catch (err) {
    text = `throw:${(err as Error).message}`;
  }
  return createHash('sha256').update(text).digest('hex');
}

export function digestAll(corpus: readonly SkeletonSource[], progress = false): Record<string, string> {
  const out: Record<string, string> = {};
  const started = Date.now();
  corpus.forEach((s, i) => {
    const at = Date.now();
    for (const e of SKELETON_ENGINES) out[`${s.key}@${e}`] = skeletonDigest(s.source, e);
    const took = Date.now() - at;
    if (progress && took > 3000) process.stderr.write(`slow ${took} ms ${s.key}\n`);
    if (progress && (i + 1) % 1000 === 0) process.stderr.write(`${i + 1}/${corpus.length} ${((Date.now() - started) / 1000).toFixed(0)} s\n`);
  });
  return out;
}

function corpusFromArgv(argv: string[]): SkeletonSource[] {
  const arg = (name: string) => { const i = argv.indexOf(name); return i < 0 ? undefined : argv[i + 1]; };
  let base = skeletonCorpus();
  const manifest = arg('--corpus');
  if (manifest) {
    base = manifestCorpus(manifest, arg('--group')).map((f) => ({ key: `ext:${f.name}`, source: f.source }));
  }
  const step = arg('--mutations');
  return step ? [...base, ...mutatedCorpus(base, Number(step))] : base;
}

export const SKELETON_FIXTURE = join(FIXTURES, 'skeleton-v3.2.0-frozen.json');

export interface SkeletonFrozenFile {
  note: string;
  engines: string[];
  commit: string;
  captured: string;
  digests: Record<string, string>;
}

/** The keys of the frozen skeleton file whose digest moved, and how many were compared. */
export function checkSkeletonFrozen(): { compared: number; moved: string[]; missing: string[] } {
  const frozen = JSON.parse(readFileSync(SKELETON_FIXTURE, 'utf8')) as SkeletonFrozenFile;
  const corpus = new Map(skeletonCorpus().map((s) => [s.key, s.source]));
  const moved: string[] = [];
  const missing: string[] = [];
  let compared = 0;
  for (const [key, expected] of Object.entries(frozen.digests)) {
    const at = key.lastIndexOf('@');
    const source = corpus.get(key.slice(0, at));
    if (source === undefined) { missing.push(key); continue; }
    compared += 1;
    if (skeletonDigest(source, key.slice(at + 1)) !== expected) moved.push(key);
  }
  return { compared, moved, missing };
}

if (require.main === module) {
  const argv = process.argv;
  const arg = (name: string) => { const i = argv.indexOf(name); return i < 0 ? undefined : argv[i + 1]; };
  if (argv[2] === 'freeze') {
    const commit = arg('--commit');
    if (!commit) throw new Error('freeze needs --commit');
    const file: SkeletonFrozenFile = {
      note: `SHA-256 of JSON.stringify(buildProcessSkeleton(source, { engineVersion })) for each engine line the skeleton reads differently, captured from lib/ at ${commit} before engine 4 phase 3 split SkeletonBuilder into passes. Corpus: starter examples, benchmark learn halves (concatenated per case and file by file; never the holdout), the probes of engine-v3.2.0-frozen.json. Never regenerate (scripts/engine/skeleton-neutrality.ts).`,
      engines: [...SKELETON_ENGINES],
      commit,
      captured: new Date().toISOString().slice(0, 10),
      digests: digestAll(skeletonCorpus()),
    };
    writeFileSync(SKELETON_FIXTURE, `${JSON.stringify(file, null, 1)}\n`);
    console.log(`${SKELETON_FIXTURE}: ${Object.keys(file.digests).length} digests`);
    process.exit(0);
  }
  const started = Date.now();
  const corpus = corpusFromArgv(argv);
  const digests = digestAll(corpus, true);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (argv[2] === 'capture') {
    const out = arg('--out');
    if (!out) throw new Error('capture needs --out');
    writeFileSync(out, `${JSON.stringify(digests, null, 1)}\n`);
    console.log(`${out}: ${Object.keys(digests).length} digests over ${corpus.length} sources in ${seconds} s`);
  } else {
    const input = arg('--in');
    if (!input) throw new Error('check needs --in');
    const expected = JSON.parse(readFileSync(input, 'utf8')) as Record<string, string>;
    const moved = Object.keys(expected).filter((k) => digests[k] !== expected[k]);
    const extra = Object.keys(digests).filter((k) => !(k in expected));
    console.log(`compared ${Object.keys(expected).length}, moved ${moved.length}, new ${extra.length} (${seconds} s)`);
    for (const k of moved.slice(0, 30)) console.log(`  moved ${k}`);
    if (moved.length || extra.length) process.exitCode = 1;
  }
}
