#!/usr/bin/env node
/**
 * The CI shards by duration (release 3.0.21, test-quality measure 2).
 *
 * `--shard=i/6` cuts the suite into six slices of equal *test count*. Tests are
 * not equally long: on the green run 39819463543 the six shards took 17.7,
 * 22.6, 2.3, 19.5, 9.4 and 26.7 minutes, so the whole pipeline waited for the
 * longest one while another sat idle after two minutes. This file distributes
 * whole spec files across the shards greedily by their measured duration
 * (longest first, each onto the shard with the least time so far) and keeps the
 * table in `tests/shard-plan.json`, so the split is reviewable and versioned.
 *
 *   node scripts/test/shard-plan.mjs generate --log <gh run view --log output> [--log …]
 *   node scripts/test/shard-plan.mjs generate --json <playwright json report> [--json …]
 *   node scripts/test/shard-plan.mjs refresh       # re-plan from the stored durations (after adding/removing a spec)
 *   node scripts/test/shard-plan.mjs files <i>     # the spec files shard i runs, space-separated
 *   node scripts/test/shard-plan.mjs show          # expected minutes per shard
 *
 * `files` never lets a spec fall through: a spec file on disk that the plan
 * does not name yet is added to the shard with the least time (at the median
 * duration), and a planned file that no longer exists is left out. The plan
 * spec (tests/shard-plan.spec.ts) still fails on either, so the table is
 * regenerated rather than patched at run time for ever.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PLAN_FILE = 'tests/shard-plan.json';
export const SHARD_COUNT = 6;

/** What Playwright collects with the default testMatch under testDir `./tests`. */
const TEST_FILE = /\.(spec|test)\.(c|m)?[jt]sx?$/;

/** Every test file Playwright would collect, as repo-relative posix paths, sorted. */
export function discoverSpecFiles(root = ROOT) {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      if (e.name === 'node_modules') continue;
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (TEST_FILE.test(e.name)) out.push(rel);
    }
  };
  walk('tests');
  return out.sort();
}

const TEST_LINE = /^\[(\d+)\/(\d+)\] \[[^\]]+\] › (tests\/[^:\s]+):\d+:\d+ › /;
const SUMMARY_LINE = /^\s+\d+ (passed|failed|flaky) \(/;

/**
 * Per-file seconds from the log of a GitHub Actions run (`gh run view <id> --log`).
 * In CI the line reporter prints one `[n/N] [chromium] › tests/file:line:col › …`
 * line when each test starts, one worker per shard, so a test lasts from its own
 * line to the next one of the same job; the last test ends at the summary line.
 * Retries are separate lines and count to their file, as they cost the shard time.
 */
export function durationsFromRunLog(text) {
  const byJob = new Map();
  for (const raw of text.split('\n')) {
    const parts = raw.split('\t');
    if (parts.length < 3) continue;
    const job = parts[0];
    const rest = parts.slice(2).join('\t').replace(/^﻿/, '');
    const m = /^(\d{4}-\d\d-\d\dT[\d:.]+Z) (.*)$/.exec(rest);
    if (!m) continue;
    const t = Date.parse(m[1]);
    const body = m[2];
    const test = TEST_LINE.exec(body);
    const summary = !test && SUMMARY_LINE.test(body);
    if (!test && !summary) continue;
    if (!byJob.has(job)) byJob.set(job, []);
    byJob.get(job).push({ t, file: test ? test[3] : null });
  }
  const seconds = {};
  for (const events of byJob.values()) {
    for (let i = 0; i < events.length - 1; i++) {
      const { file, t } = events[i];
      if (!file) continue;
      seconds[file] = (seconds[file] || 0) + Math.max(0, events[i + 1].t - t) / 1000;
    }
  }
  return roundAll(seconds);
}

/** Per-file seconds from Playwright JSON reports (every attempt, retries included). */
export function durationsFromJsonReport(report) {
  const seconds = {};
  const visit = (suite) => {
    for (const spec of suite.specs || []) {
      const file = toRepoPath(spec.file || suite.file);
      for (const t of spec.tests || []) {
        for (const r of t.results || []) seconds[file] = (seconds[file] || 0) + (r.duration || 0) / 1000;
      }
    }
    for (const s of suite.suites || []) visit(s);
  };
  for (const s of report.suites || []) visit(s);
  return roundAll(seconds);
}

function toRepoPath(file) {
  const posix = String(file).replace(/\\/g, '/');
  return posix.startsWith('tests/') ? posix : `tests/${posix}`;
}

function roundAll(obj) {
  const out = {};
  for (const k of Object.keys(obj).sort()) out[k] = Math.round(obj[k] * 10) / 10;
  return out;
}

export function median(values) {
  const v = [...values].sort((a, b) => a - b);
  if (!v.length) return 1;
  return v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
}

/**
 * Longest-processing-time-first: each file, longest first, onto the shard with
 * the least seconds so far (ties to the lower shard; equal durations by name, so
 * the plan is a pure function of the table).
 */
export function planShards(files, durations, shardCount = SHARD_COUNT) {
  const fallback = median(Object.values(durations));
  const cost = (f) => (f in durations ? durations[f] : fallback);
  const order = [...files].sort((a, b) => cost(b) - cost(a) || (a < b ? -1 : a > b ? 1 : 0));
  const shards = Array.from({ length: shardCount }, () => ({ files: [], seconds: 0 }));
  for (const f of order) {
    let best = 0;
    for (let i = 1; i < shardCount; i++) if (shards[i].seconds < shards[best].seconds) best = i;
    shards[best].files.push(f);
    shards[best].seconds += cost(f);
  }
  return shards.map((s) => ({ files: s.files.sort(), seconds: Math.round(s.seconds) }));
}

/**
 * The files shard `index` (1-based) runs: its planned files that still exist,
 * plus every file on disk no shard plans, each placed on the shard that is
 * lightest at that point. Every file on disk ends up in exactly one shard.
 */
export function shardFiles(plan, onDisk, index) {
  const exists = new Set(onDisk);
  const planned = new Set(plan.shards.flatMap((s) => s.files));
  const fallback = median(Object.values(plan.durations || {}));
  const shards = plan.shards.map((s) => ({
    files: s.files.filter((f) => exists.has(f)),
    seconds: s.files.filter((f) => exists.has(f)).reduce((n, f) => n + (plan.durations?.[f] ?? fallback), 0),
  }));
  for (const f of onDisk.filter((x) => !planned.has(x)).sort()) {
    let best = 0;
    for (let i = 1; i < shards.length; i++) if (shards[i].seconds < shards[best].seconds) best = i;
    shards[best].files.push(f);
    shards[best].seconds += fallback;
  }
  if (!Number.isInteger(index) || index < 1 || index > shards.length) {
    throw new Error(`shard ${index} is not one of 1..${shards.length}`);
  }
  return shards[index - 1].files.sort();
}

/**
 * Playwright reads each CLI file argument as a case-insensitive, unanchored
 * regular expression over the full path. A path that also matched another
 * spec file would run that file in two shards; this returns every such pair.
 */
export function overlappingFilters(files) {
  const clashes = [];
  for (const f of files) {
    const re = new RegExp(f, 'i');
    for (const g of files) if (g !== f && re.test(`/${g}`)) clashes.push([f, g]);
  }
  return clashes;
}

export function readPlan(root = ROOT) {
  return JSON.parse(fs.readFileSync(path.join(root, PLAN_FILE), 'utf8'));
}

function generate(args) {
  const durations = {};
  const sources = [];
  for (let i = 0; i < args.length; i += 2) {
    const kind = args[i];
    const file = args[i + 1];
    if (!file || (kind !== '--log' && kind !== '--json')) throw new Error(`usage: generate --log <file> | --json <file> …`);
    const text = fs.readFileSync(file, 'utf8');
    const d = kind === '--log' ? durationsFromRunLog(text) : durationsFromJsonReport(JSON.parse(text));
    // The reports of one run (one per shard) add up: a file split across two shards counts in both.
    // Pass the reports of a single run only.
    for (const [k, v] of Object.entries(d)) durations[k] = Math.round(((durations[k] || 0) + v) * 10) / 10;
    sources.push(path.basename(file));
  }
  writePlan(durations, sources);
}

/** A new or removed spec: the stored durations, re-planned over the spec files on disk now. */
function refresh() {
  const old = readPlan();
  writePlan(old.durations || {}, old.sources || []);
}

function writePlan(durations, sources) {
  const onDisk = discoverSpecFiles();
  const kept = Object.fromEntries(Object.entries(durations).filter(([f]) => onDisk.includes(f)));
  const shards = planShards(onDisk, kept);
  const plan = {
    $comment:
      'Generated by scripts/test/shard-plan.mjs from measured per-file seconds (a file without a measurement counts at the median). Do not hand-edit: after adding or removing a spec run `node scripts/test/shard-plan.mjs refresh`; to re-measure, `generate --json <the e2e-results.json of every shard of one green run>`. tests/shard-plan.spec.ts fails when the plan is not what the generator makes of this table.',
    sources,
    shardCount: SHARD_COUNT,
    durations: kept,
    shards,
  };
  fs.writeFileSync(path.join(ROOT, PLAN_FILE), `${JSON.stringify(plan, null, 2)}\n`);
  show(plan);
}

function show(plan) {
  plan.shards.forEach((s, i) => console.log(`shard ${i + 1}: ${(s.seconds / 60).toFixed(1)} min, ${s.files.length} files`));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [cmd, ...rest] = process.argv.slice(2);
  try {
    if (cmd === 'generate') generate(rest);
    else if (cmd === 'refresh') refresh();
    else if (cmd === 'show') show(readPlan());
    else if (cmd === 'files') {
      const files = shardFiles(readPlan(), discoverSpecFiles(), Number(rest[0]));
      if (!files.length) throw new Error(`shard ${rest[0]} has no spec file`);
      const clashes = overlappingFilters(discoverSpecFiles());
      if (clashes.length) throw new Error(`a spec path also matches another spec file: ${clashes.map((c) => c.join(' ~ ')).join(', ')}`);
      console.log(files.join(' '));
    } else {
      console.error('usage: shard-plan.mjs generate --log <file>|--json <file> … | refresh | files <i> | show');
      process.exit(2);
    }
  } catch (e) {
    console.error(`shard-plan: ${e.message}`);
    process.exit(1);
  }
}
