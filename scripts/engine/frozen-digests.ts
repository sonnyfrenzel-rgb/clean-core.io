/**
 * Frozen digests per release (roadmap 3.5.0 item 2, moved to 3.4.0 items (3) and (4); engine review §4.2 C).
 *
 * What an engine answered — `SHA-256(JSON.stringify({ evidence, route }))`,
 * exactly as `tests/engine-version-rebuild.spec.ts` digests it — for a fixed
 * corpus in both editions, captured once from the engine of a release and never
 * regenerated from a later one. `tests/engine-frozen-digests.spec.ts` checks
 * every such file on every CI run, so any change that leaks past its gate, and
 * any refactor that is not neutral (parse once), moves a digest.
 *
 *   npx tsx scripts/engine/frozen-digests.ts capture --engine v3.4.0 --commit <sha>
 *       writes tests/fixtures/engine-<engine>-frozen.json (refuses to overwrite) and the release's engine digest
 *       into lib/engine-releases.json (refuses to change an entry) — the release step of
 *       .github/workflows/engine-release-capture.yml, run on every push to main whose version has no fixture yet
 *   npx tsx scripts/engine/frozen-digests.ts check [--file <fixture>]
 *       recomputes every format-2 and format-3 fixture and lists the keys that moved
 *
 * Corpus (formats 2 and 3): the starter examples, the benchmark **learn** halves
 * (`split.json` `learn` + `w3_learn`, never the holdout) and the probes of the
 * v3.0.12 fixture. The older fixtures (v3.0.11, v3.0.12) also cover the holdout
 * and stay with the rebuild spec.
 *
 * Format 3 (from 3.4.0): as format 2, plus `engineDigest` (the release's `scripts/engine/engine-digest.cjs` digest)
 * and, per program and probe, the digest of the process skeleton (`buildProcessSkeleton(code, { engineVersion })`,
 * key `<entry>:skeleton`) and of the business statements (`buildBusinessStatements(code)`, key `<entry>:business`),
 * so a change to either that leaks past its gate moves a digest too. A fixture is never extended after the fact:
 * format 2 stays format 2.
 */
import { createHash } from 'crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { buildAbapEvidence } from '../../lib/abap/evidence-model';
import { routeExtensibility } from '../../lib/abap/extensibility-router';
import { buildProcessSkeleton } from '../../lib/abap/process-skeleton';
import { buildBusinessStatements } from '../../lib/abap/business-statement';
import { computeEngineDigest } from './engine-digest.cjs';

const ROOT = join(__dirname, '..', '..');
const FIXTURES = join(ROOT, 'tests', 'fixtures');
const STARTERS = join(ROOT, 'public', 'starter-examples');
const BENCH = join(ROOT, 'tests', 'prozess-benchmark');
const RELEASES = join(ROOT, 'lib', 'engine-releases.json');
const DEPLOYMENTS = ['private', 'public'] as const;

export interface FrozenFile {
  note: string;
  format: 2 | 3;
  engine: string;
  /** Format 3: the release's engine digest (`scripts/engine/engine-digest.cjs`). */
  engineDigest?: string;
  commit: string;
  captured: string;
  probes: Record<string, string>;
  digests: Record<string, string>;
}

export interface ReleaseRegistry {
  note: string;
  releases: Record<string, { digest: string; commit: string; captured: string; how?: string }>;
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

/** Format 3: the digest of the process skeleton a release's engine reads from one source. */
export function skeletonDigestOf(code: string, engine: string): string {
  return createHash('sha256').update(JSON.stringify(buildProcessSkeleton(code, { engineVersion: engine }))).digest('hex');
}

/** Format 3: the digest of the business statements read from one source (they carry no engine gate of their own). */
export function businessDigestOf(code: string): string {
  return createHash('sha256').update(JSON.stringify(buildBusinessStatements(code))).digest('hex');
}

/** The engine digest of this working tree. */
export function currentEngineDigest(): string {
  return computeEngineDigest(ROOT).digest;
}

export function readReleases(): ReleaseRegistry {
  return JSON.parse(readFileSync(RELEASES, 'utf8')) as ReleaseRegistry;
}

/** The frozen fixtures the check reads: every file of format 2 or 3 (v3.0.11 and v3.0.12 stay with the rebuild spec). */
export function frozenFiles(): string[] {
  return readdirSync(FIXTURES).filter((n) => /^engine-v[\d.]+-frozen\.json$/.test(n)).sort()
    .filter((n) => [2, 3].includes((JSON.parse(readFileSync(join(FIXTURES, n), 'utf8')) as { format?: number }).format ?? 0));
}

export function readFrozen(name: string): FrozenFile {
  return JSON.parse(readFileSync(join(FIXTURES, name), 'utf8')) as FrozenFile;
}

/** The keys whose digest moved, and how many were compared. */
export function checkFrozen(name: string): { compared: number; moved: string[]; missing: string[] } {
  const frozen = readFrozen(name);
  const corpus = new Map(frozenCorpus(frozen.probes).map((e) => [e.key, e]));
  const moved: string[] = [];
  const missing: string[] = [];
  let compared = 0;
  for (const [key, expected] of Object.entries(frozen.digests)) {
    const at = key.lastIndexOf(':');
    const entry = corpus.get(key.slice(0, at));
    if (!entry) { missing.push(key); continue; }
    compared += 1;
    const what = key.slice(at + 1);
    const now = what === 'skeleton'
      ? skeletonDigestOf(entry.code, frozen.engine)
      : what === 'business'
        ? businessDigestOf(entry.code)
        : digestOf(entry.code, entry.file, what as 'private' | 'public', frozen.engine);
    if (now !== expected) moved.push(key);
  }
  return { compared, moved, missing };
}

function capture(engine: string, commit: string): void {
  const target = join(FIXTURES, `engine-${engine}-frozen.json`);
  if (existsSync(target)) throw new Error(`${target} exists: a frozen file is never regenerated`);
  const releases = readReleases();
  if (releases.releases[engine]) throw new Error(`lib/engine-releases.json already holds ${engine}: a release digest is never changed`);
  const probes = (JSON.parse(readFileSync(join(FIXTURES, 'engine-v3.0.12-frozen.json'), 'utf8')) as { probes: Record<string, string> }).probes;
  const engineDigest = currentEngineDigest();
  const digests: Record<string, string> = {};
  for (const e of frozenCorpus(probes)) {
    for (const d of DEPLOYMENTS) digests[`${e.key}:${d}`] = digestOf(e.code, e.file, d, engine);
    digests[`${e.key}:skeleton`] = skeletonDigestOf(e.code, engine);
    digests[`${e.key}:business`] = businessDigestOf(e.code);
  }
  const file: FrozenFile = {
    note: `SHA-256 of JSON.stringify({ evidence, route }) as the ${engine} engine answered (lib/ at ${commit}); evidence by buildAbapEvidence(code, file, deployment, undefined, "${engine}"), route by routeExtensibility(evidence, deployment, "${engine}"); key suffix :skeleton = buildProcessSkeleton(code, { engineVersion: "${engine}" }), :business = buildBusinessStatements(code); engineDigest by scripts/engine/engine-digest.cjs. Corpus: starter examples, benchmark learn halves (never the holdout), probes. Never regenerate from a later engine (scripts/engine/frozen-digests.ts).`,
    format: 3,
    engine,
    engineDigest,
    commit,
    captured: new Date().toISOString().slice(0, 10),
    probes,
    digests,
  };
  writeFileSync(target, `${JSON.stringify(file, null, 1)}\n`);
  releases.releases[engine] = { digest: engineDigest, commit, captured: file.captured };
  writeFileSync(RELEASES, `${JSON.stringify(releases, null, 2)}\n`);
  console.log(`${target}: ${Object.keys(digests).length} digests; engine digest ${engineDigest}`);
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
