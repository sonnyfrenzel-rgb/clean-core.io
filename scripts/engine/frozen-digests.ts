/**
 * Frozen digests per release (roadmap 3.5.0 item 2; engine review §4.2 C).
 *
 * What an engine answered — `SHA-256(JSON.stringify({ evidence, route }))`,
 * exactly as `tests/engine-version-rebuild.spec.ts` digests it — for a fixed
 * corpus in both editions, captured once from the engine of a release and never
 * regenerated from a later one. `tests/engine-frozen-digests.spec.ts` checks
 * every such file on every CI run, so any change that leaks past its gate, and
 * any refactor that is not neutral (parse once), moves a digest.
 *
 *   npx tsx scripts/engine/frozen-digests.ts capture --engine v3.2.0 --commit <sha>
 *       writes tests/fixtures/engine-<engine>-frozen.json (refuses to overwrite)
 *   npx tsx scripts/engine/frozen-digests.ts check [--file <fixture>]
 *       recomputes every format-2 fixture and lists the keys that moved
 *
 * Corpus (format 2): the starter examples, the benchmark **learn** halves
 * (`split.json` `learn` + `w3_learn`, never the holdout) and the probes of the
 * v3.0.12 fixture. The older fixtures (v3.0.11, v3.0.12) also cover the holdout
 * and stay with the rebuild spec.
 */
import { createHash } from 'crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { buildAbapEvidence } from '../../lib/abap/evidence-model';
import { routeExtensibility } from '../../lib/abap/extensibility-router';

const ROOT = join(__dirname, '..', '..');
const FIXTURES = join(ROOT, 'tests', 'fixtures');
const STARTERS = join(ROOT, 'public', 'starter-examples');
const BENCH = join(ROOT, 'tests', 'prozess-benchmark');
const DEPLOYMENTS = ['private', 'public'] as const;

export interface FrozenFile {
  note: string;
  format: 2;
  engine: string;
  commit: string;
  captured: string;
  probes: Record<string, string>;
  digests: Record<string, string>;
}

export interface CorpusEntry { key: string; code: string; file: string }

/** Starter examples, learn cases and probes, in a fixed order. */
export function frozenCorpus(probes: Record<string, string>): CorpusEntry[] {
  const out: CorpusEntry[] = [];
  for (const name of readdirSync(STARTERS).filter((n) => /\.(abap|txt)$/.test(n)).sort()) {
    out.push({ key: `starter:${name}`, code: readFileSync(join(STARTERS, name), 'utf8'), file: name });
  }
  const split = JSON.parse(readFileSync(join(BENCH, 'split.json'), 'utf8')) as { learn: string[]; w3_learn: string[] };
  for (const id of [...split.learn, ...split.w3_learn].sort()) {
    const dir = join(BENCH, 'cases', id);
    if (!existsSync(dir)) continue;
    const abap = readdirSync(dir).filter((n) => n.endsWith('.abap')).sort();
    if (!abap.length) continue;
    out.push({ key: `case:${id}`, code: abap.map((f) => readFileSync(join(dir, f), 'utf8')).join('\n'), file: abap[0] });
  }
  for (const name of Object.keys(probes).sort()) out.push({ key: `probe:${name}`, code: probes[name], file: `${name}.abap` });
  return out;
}

export function digestOf(code: string, file: string, deployment: 'private' | 'public', engine: string): string {
  const evidence = buildAbapEvidence(code, file, deployment, undefined, engine);
  const route = routeExtensibility(evidence, deployment, engine);
  return createHash('sha256').update(JSON.stringify({ evidence, route })).digest('hex');
}

export function frozenFiles(): string[] {
  return readdirSync(FIXTURES).filter((n) => /^engine-v[\d.]+-frozen\.json$/.test(n)).sort()
    .filter((n) => (JSON.parse(readFileSync(join(FIXTURES, n), 'utf8')) as { format?: number }).format === 2);
}

/** The keys whose digest moved, and how many were compared. */
export function checkFrozen(name: string): { compared: number; moved: string[]; missing: string[] } {
  const frozen = JSON.parse(readFileSync(join(FIXTURES, name), 'utf8')) as FrozenFile;
  const corpus = new Map(frozenCorpus(frozen.probes).map((e) => [e.key, e]));
  const moved: string[] = [];
  const missing: string[] = [];
  let compared = 0;
  for (const [key, expected] of Object.entries(frozen.digests)) {
    const at = key.lastIndexOf(':');
    const entry = corpus.get(key.slice(0, at));
    if (!entry) { missing.push(key); continue; }
    compared += 1;
    if (digestOf(entry.code, entry.file, key.slice(at + 1) as 'private' | 'public', frozen.engine) !== expected) moved.push(key);
  }
  return { compared, moved, missing };
}

function capture(engine: string, commit: string): void {
  const target = join(FIXTURES, `engine-${engine}-frozen.json`);
  if (existsSync(target)) throw new Error(`${target} exists: a frozen file is never regenerated`);
  const probes = (JSON.parse(readFileSync(join(FIXTURES, 'engine-v3.0.12-frozen.json'), 'utf8')) as { probes: Record<string, string> }).probes;
  const digests: Record<string, string> = {};
  for (const e of frozenCorpus(probes)) {
    for (const d of DEPLOYMENTS) digests[`${e.key}:${d}`] = digestOf(e.code, e.file, d, engine);
  }
  const file: FrozenFile = {
    note: `SHA-256 of JSON.stringify({ evidence, route }) as the ${engine} engine answered (lib/ at ${commit}); evidence by buildAbapEvidence(code, file, deployment, undefined, "${engine}"), route by routeExtensibility(evidence, deployment, "${engine}"). Corpus: starter examples, benchmark learn halves (never the holdout), probes. Never regenerate from a later engine (scripts/engine/frozen-digests.ts).`,
    format: 2,
    engine,
    commit,
    captured: new Date().toISOString().slice(0, 10),
    probes,
    digests,
  };
  writeFileSync(target, `${JSON.stringify(file, null, 1)}\n`);
  console.log(`${target}: ${Object.keys(digests).length} digests`);
}

if (require.main === module) {
  const arg = (name: string) => { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1]; };
  if (process.argv[2] === 'capture') {
    const engine = arg('--engine');
    const commit = arg('--commit');
    if (!engine || !commit) throw new Error('capture needs --engine and --commit');
    capture(engine, commit);
  } else {
    const only = arg('--file');
    let bad = false;
    for (const name of only ? [only] : frozenFiles()) {
      const r = checkFrozen(name);
      console.log(`${name}: compared ${r.compared}, moved ${r.moved.length}, missing ${r.missing.length}`);
      for (const k of [...r.moved, ...r.missing].slice(0, 20)) console.log(`  ${k}`);
      bad ||= r.moved.length > 0 || r.missing.length > 0;
    }
    if (bad) process.exit(1);
  }
}
