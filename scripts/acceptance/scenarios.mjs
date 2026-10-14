#!/usr/bin/env node
/**
 * The reviewers' scenarios of the acceptance suite, kept sealed.
 *
 *   node scripts/acceptance/scenarios.mjs check [--plain <dir>]          validate plaintext scenario files (no key needed)
 *   node scripts/acceptance/scenarios.mjs seal  [--plain <dir>] [--env-file f]   plaintext -> scripts/acceptance/scenarios/<id>.enc.json
 *   node scripts/acceptance/scenarios.mjs open  [--plain <dir>] [--env-file f]   sealed -> plaintext (to review or edit)
 *
 * The external reviews and the scenario data taken from them are not public
 * (docs/failure-patterns/README.md: "the scenario data itself stays with the
 * case"). So the data is committed only sealed: AES-256-GCM (scripts/qa/lib/crypto.mjs)
 * under ACCEPTANCE_SEAL_KEY, or QA_REVIEW_KEY when that is unset — the key the
 * maintainer's .env.local already holds. The plaintext lives in `.acceptance/scenarios-plain/`
 * (gitignored) and nowhere else.
 *
 * A scenario file (schema 1) is a faithful transcription: every scenario names its
 * source line (`source.where`), keeps prose as prose (`expectedForm: "prose"`),
 * and never carries a value the source does not state.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { open, seal } from '../qa/lib/crypto.mjs';
import { loadDotEnv } from '../qa/lib/store.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..', '..');
export const SEALED_DIR = path.join(HERE, 'scenarios');
export const PLAIN_DIR = path.join(ROOT, '.acceptance', 'scenarios-plain');
export const PROGRAMS_PATH = path.join(HERE, 'programs.json');

export function loadPrograms() {
  return JSON.parse(fs.readFileSync(PROGRAMS_PATH, 'utf8')).programs;
}

/** The sealing key: the environment first, then the given .env file, then the repository's .env.local. */
export function sealKey(envFile) {
  const env = { ...loadDotEnv(path.join(ROOT, '.env.local')), ...(envFile ? loadDotEnv(envFile) : {}), ...process.env };
  return env.ACCEPTANCE_SEAL_KEY || env.QA_REVIEW_KEY || null;
}

const GROUPS = new Set(['probe', 'reference', 'acceptance', 'check', 'section-5']);

/** Problems of one plaintext scenario file; an empty list when it holds. */
export function validateScenarioFile(doc, programIds) {
  const out = [];
  if (!doc || doc.schema !== 1) out.push('schema must be 1');
  if (!programIds.includes(doc?.program)) out.push(`program "${doc?.program}" is not in programs.json`);
  const prov = new Set((doc?.provenance ?? []).map((p) => p.id));
  if (prov.size === 0) out.push('no provenance');
  for (const p of doc?.provenance ?? []) if (!p.id || !p.kind || !p.document) out.push(`provenance ${p.id ?? '?'}: id, kind and document are required`);
  const ids = new Set();
  for (const s of doc?.scenarios ?? []) {
    const at = `scenario ${s.id ?? '?'}`;
    if (!s.id) out.push(`${at}: no id`);
    if (ids.has(s.id)) out.push(`${at}: duplicate id`);
    ids.add(s.id);
    if (!GROUPS.has(s.group)) out.push(`${at}: unknown group "${s.group}"`);
    if (!['machine', 'prose'].includes(s.expectedForm)) out.push(`${at}: expectedForm must be machine or prose`);
    if (s.expectedForm === 'machine' && (s.expected === null || typeof s.expected !== 'object')) out.push(`${at}: a machine expectation must be an object`);
    if (s.expected === undefined || s.expected === null || s.expected === '') out.push(`${at}: no expected outcome`);
    if (!s.source || !prov.has(s.source.ref) || !s.source.where) out.push(`${at}: source.ref must name a provenance entry and source.where a place`);
  }
  if ((doc?.scenarios ?? []).length === 0) out.push('no scenarios');
  return out;
}

/** The sealed scenarios of one program, opened; null when the program has none. Throws without a key. */
export function openScenarios(program, key) {
  if (!program.scenarios?.sealed) return null;
  const file = path.join(HERE, program.scenarios.sealed);
  if (!fs.existsSync(file)) throw new Error(`${program.id}: ${path.relative(ROOT, file)} is missing`);
  if (!key) throw new Error('no sealing key (ACCEPTANCE_SEAL_KEY or QA_REVIEW_KEY)');
  return open(JSON.parse(fs.readFileSync(file, 'utf8')), key);
}

function parseArgs(argv) {
  const a = { cmd: argv[0], plain: PLAIN_DIR, envFile: null };
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '--plain') a.plain = path.resolve(argv[++i]);
    else if (argv[i] === '--env-file') a.envFile = path.resolve(argv[++i]);
    else throw new Error(`unknown argument ${argv[i]}`);
  }
  if (!['check', 'seal', 'open'].includes(a.cmd)) throw new Error('usage: scenarios.mjs check|seal|open [--plain dir] [--env-file file]');
  return a;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const programs = loadPrograms();
  const ids = programs.map((p) => p.id);
  if (args.cmd === 'open') {
    const key = sealKey(args.envFile);
    fs.mkdirSync(args.plain, { recursive: true });
    for (const p of programs) {
      const doc = openScenarios(p, key);
      if (!doc) continue;
      fs.writeFileSync(path.join(args.plain, `${p.id}.json`), `${JSON.stringify(doc, null, 2)}\n`);
      console.log(`${p.id}: ${doc.scenarios.length} scenarios opened`);
    }
    return 0;
  }
  let bad = 0;
  const docs = [];
  for (const p of programs) {
    if (!p.scenarios?.sealed) continue;
    const file = path.join(args.plain, `${p.id}.json`);
    if (!fs.existsSync(file)) {
      console.log(`${p.id}: no plaintext file (${path.relative(ROOT, file)})`);
      if (args.cmd === 'seal') bad++;
      continue;
    }
    const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
    const problems = validateScenarioFile(doc, ids);
    const machine = doc.scenarios?.filter((s) => s.expectedForm === 'machine').length ?? 0;
    console.log(`${p.id}: ${doc.scenarios?.length ?? 0} scenarios (${machine} machine, ${(doc.scenarios?.length ?? 0) - machine} prose)${problems.length ? ` — ${problems.length} problem(s)` : ''}`);
    for (const pr of problems) console.log(`  - ${pr}`);
    if (problems.length) bad++;
    docs.push([p, doc]);
  }
  if (args.cmd === 'seal') {
    if (bad) {
      console.error('nothing sealed: fix the problems above first');
      return 1;
    }
    const key = sealKey(args.envFile);
    if (!key) {
      console.error('no sealing key: set ACCEPTANCE_SEAL_KEY or QA_REVIEW_KEY (environment, --env-file or .env.local)');
      return 1;
    }
    fs.mkdirSync(SEALED_DIR, { recursive: true });
    for (const [p, doc] of docs) {
      fs.writeFileSync(path.join(HERE, p.scenarios.sealed), `${JSON.stringify(seal(doc, key))}\n`);
      console.log(`${p.id}: sealed into scripts/acceptance/${p.scenarios.sealed}`);
    }
  }
  return bad ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exit(main());
  } catch (err) {
    console.error(`scenarios: ${err.message}`);
    process.exit(2);
  }
}
