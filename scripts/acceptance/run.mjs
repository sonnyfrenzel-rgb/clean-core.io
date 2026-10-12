#!/usr/bin/env node
/**
 * Acceptance harness: runs the failure-pattern library's generic probes
 * against an unpacked generated delivery package and writes a JSON and a
 * Markdown report (pattern id -> pass / fail / not-applicable / not-runnable,
 * with evidence).
 *
 *   node scripts/acceptance/run.mjs <package-dir>
 *        [--adapter <file>]     how to call the package (default: <package-dir>/acceptance-adapter.json)
 *        [--out <dir>]          where to write acceptance-report.json / .md (default: print JSON only)
 *        [--timeout <ms>]       hard limit per child process (default 20000)
 *        [--trusted-fixture]    the package is self-written; allow execution with the best-effort network guard
 *        [--static-only]        never execute, only scan
 *
 * No network, no model, no install. The package's npm scripts never run. Its
 * modules are imported only inside a sandboxed child process (see
 * lib/sandbox.mjs), which only executes; the probes and their verdicts stay in
 * this process. When the sandbox cannot be made reliable on this Node the
 * dynamic probes are reported as not runnable and only the static scan runs.
 *
 * Catalogue and adapter format: docs/failure-patterns/README.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROBES } from './lib/probes.mjs';
import { copyToTemp, decideExecution, removeTemp, startExecutor } from './lib/sandbox.mjs';
import { staticScan } from './lib/static-scan.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const CATALOGUE_PATH = path.join(HERE, '..', '..', 'docs', 'failure-patterns', 'catalogue.json');

/** Probe type -> the catalogue patterns it judges. The spec keeps this and the catalogue in step. */
export const PROBE_PATTERNS = {
  'import-side-effects': ['FP-TEST-03'],
  'rounding-commercial': ['FP-PREC-02'],
  'decimal-quantity': ['FP-PREC-01'],
  'run-id-collision': ['FP-RUN-02', 'FP-RUN-01'],
  'empty-selection': ['FP-GUARD-04'],
  'lenient-numeric': ['FP-GUARD-03'],
  'csv-escaping': ['FP-GUARD-07'],
  'display-filter': ['FP-SCOPE-01'],
  'recalc-additive': ['FP-MEAN-05'],
  'negative-write': ['FP-GUARD-05'],
};

const SEVERITY = { fail: 3, 'not-runnable': 2, pass: 1, 'not-applicable': 0 };

function parseArgs(argv) {
  const opts = { timeout: 20000, trustedFixture: false, staticOnly: false };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--adapter') opts.adapter = argv[++i];
    else if (a === '--out') opts.out = argv[++i];
    else if (a === '--timeout') opts.timeout = Number(argv[++i]);
    else if (a === '--trusted-fixture') opts.trustedFixture = true;
    else if (a === '--static-only') opts.staticOnly = true;
    else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    else rest.push(a);
  }
  if (rest.length !== 1) throw new Error('expected exactly one package directory');
  if (!Number.isFinite(opts.timeout) || opts.timeout < 500) throw new Error('--timeout must be a number of milliseconds >= 500');
  opts.pkg = path.resolve(rest[0]);
  return opts;
}

function loadAdapter(opts) {
  const file = opts.adapter ? path.resolve(opts.adapter) : path.join(opts.pkg, 'acceptance-adapter.json');
  if (!fs.existsSync(file)) return { adapter: null, file: null };
  const adapter = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!adapter || typeof adapter.modules !== 'object' || !adapter.modules) throw new Error(`adapter ${file} has no "modules" map`);
  for (const [name, rel] of Object.entries(adapter.modules)) {
    const resolved = path.resolve(opts.pkg, rel);
    if (!resolved.startsWith(opts.pkg + path.sep)) throw new Error(`adapter module '${name}' points outside the package`);
    if (!fs.existsSync(resolved)) throw new Error(`adapter module '${name}' (${rel}) does not exist in the package`);
  }
  return { adapter, file };
}

function outcome(pattern, status, evidence, extra = {}) {
  return { pattern, status, evidence, ...extra };
}

/** `{ notRunnable }` from a failed load answer, or null when every module loaded. */
function loadFailure(answer) {
  if (!answer || typeof answer !== 'object') return 'the executor sent no answer to the load request';
  if (typeof answer.failure === 'string') return answer.failure;
  if (typeof answer.transportError === 'string') return answer.transportError;
  return null;
}

/**
 * Run one probe through a fresh sandboxed executor. The probe itself runs here;
 * the executor only loads the package and calls into it. Resolves to
 * `{ result: { outcomes } | { imported } | { notRunnable }, events, timedOut, poisoned, exitCode, stderrTail, durationMs }`.
 */
async function runProbe({ type, root, flag, timeoutMs, nodeEnv, adapter, config }) {
  const ex = startExecutor({ root, flag, timeoutMs, nodeEnv });
  let result;
  try {
    const loaded = await ex.request('load', { modules: adapter.modules });
    const failed = loadFailure(loaded);
    if (failed) {
      result = { notRunnable: failed };
    } else if (type === 'import-side-effects') {
      // Give a listener started from a microtask or a timer a moment to show itself.
      await new Promise((resolve) => setTimeout(resolve, 150));
      result = { imported: Array.isArray(loaded.imported) ? loaded.imported.map(String) : [] };
    } else {
      result = { outcomes: await PROBES[type](config ?? {}, { request: ex.request }) };
    }
  } catch (err) {
    const why = String(err && err.message ? err.message : err).split('\n')[0];
    if (err && err.adapter) result = { notRunnable: `adapter mapping does not fit the package: ${why}` };
    else if (err && err.transport) result = { notRunnable: why };
    else result = { notRunnable: `probe could not run: ${why}` };
  }
  const end = await ex.close();
  // Anything on the channel the harness did not ask for discards the whole run.
  if (end.poisoned && !end.timedOut) result = { notRunnable: `the run was discarded: ${end.poisoned}` };
  return { ...end, result };
}

function importOutcome(run, timeoutMs) {
  const listens = run.events.filter((e) => e.type === 'listen');
  const network = run.events.filter((e) => e.type === 'network');
  const parts = [];
  if (listens.length) parts.push(`importing with NODE_ENV unset calls listen(${listens.map((e) => e.port).join(', ')})`);
  if (network.length) parts.push(`importing attempts network access (${network.map((e) => e.kind).join(', ')})`);
  if (run.timedOut) parts.push(`the import did not finish within ${timeoutMs} ms`);
  if (parts.length && run.result?.notRunnable) parts.push(`and then: ${run.result.notRunnable}`);
  if (parts.length) return outcome('FP-TEST-03', 'fail', parts.join('; '));
  if (!run.result) return outcome('FP-TEST-03', 'not-runnable', `the child ended without a result (exit ${run.exitCode}${run.stderrTail ? `; ${run.stderrTail}` : ''})`);
  if (run.result.notRunnable) return outcome('FP-TEST-03', 'not-runnable', run.result.notRunnable);
  return outcome('FP-TEST-03', 'pass', `${run.result.imported.length} module(s) import with NODE_ENV unset without opening a listener or a connection`);
}

function probeOutcomes(type, run, timeoutMs) {
  const patterns = PROBE_PATTERNS[type];
  const extra = [];
  const listens = run.events.filter((e) => e.type === 'listen');
  if (listens.length) extra.push(`note: listen(${listens.map((e) => e.port).join(', ')}) was called even with NODE_ENV=test`);
  if (run.timedOut) return patterns.map((p) => outcome(p, 'not-runnable', `the probe did not finish within ${timeoutMs} ms`));
  if (!run.result) return patterns.map((p) => outcome(p, 'not-runnable', `the child ended without a result (exit ${run.exitCode}${run.stderrTail ? `; ${run.stderrTail}` : ''})`));
  if (run.result.notRunnable) return patterns.map((p) => outcome(p, 'not-runnable', run.result.notRunnable));
  const byPattern = new Map(run.result.outcomes.map((o) => [o.pattern, o]));
  return patterns.map((p) => {
    const o = byPattern.get(p);
    if (!o) return outcome(p, 'not-runnable', 'the probe returned no verdict for this pattern');
    const status = Object.prototype.hasOwnProperty.call(SEVERITY, o.status) ? o.status : 'not-runnable';
    return outcome(p, status, [o.evidence, ...extra].join('; '));
  });
}

export async function runHarness(opts) {
  const catalogue = JSON.parse(fs.readFileSync(CATALOGUE_PATH, 'utf8'));
  const byId = new Map(catalogue.patterns.map((p) => [p.id, p]));
  if (!fs.existsSync(opts.pkg) || !fs.statSync(opts.pkg).isDirectory()) throw new Error(`no package directory at ${opts.pkg}`);
  const { adapter, file: adapterFile } = loadAdapter(opts);
  const decision = decideExecution({ trustedFixture: opts.trustedFixture, staticOnly: opts.staticOnly });
  const scan = staticScan(opts.pkg);

  const probes = [];
  const types = Object.keys(PROBE_PATTERNS);
  if (!adapter) {
    for (const type of types) probes.push({ probe: type, outcomes: PROBE_PATTERNS[type].map((p) => outcome(p, 'not-runnable', 'no adapter maps this package')) });
  } else if (!decision.execute) {
    for (const type of types) probes.push({ probe: type, outcomes: PROBE_PATTERNS[type].map((p) => outcome(p, 'not-runnable', `not executed: ${decision.reason}`)) });
  } else {
    const root = copyToTemp(opts.pkg);
    try {
      for (const type of types) {
        const mapped = type === 'import-side-effects' ? {} : adapter.probes?.[type];
        if (mapped === undefined || mapped === null) {
          probes.push({ probe: type, outcomes: PROBE_PATTERNS[type].map((p) => outcome(p, 'not-applicable', 'the adapter does not map this probe')) });
          continue;
        }
        if (mapped.notApplicable) {
          probes.push({ probe: type, outcomes: PROBE_PATTERNS[type].map((p) => outcome(p, 'not-applicable', String(mapped.notApplicable))) });
          continue;
        }
        const isImport = type === 'import-side-effects';
        const run = await runProbe({
          type,
          root,
          flag: decision.flag,
          timeoutMs: opts.timeout,
          // The import probe runs as CI runs `npm test`: NODE_ENV unset.
          nodeEnv: isImport ? undefined : 'test',
          adapter,
          config: mapped,
        });
        probes.push({
          probe: type,
          durationMs: run.durationMs,
          outcomes: isImport ? [importOutcome(run, opts.timeout)] : probeOutcomes(type, run, opts.timeout),
        });
      }
    } finally {
      removeTemp(root);
    }
  }

  const patterns = {};
  for (const probe of probes) {
    for (const o of probe.outcomes) {
      const entry = patterns[o.pattern] ?? {
        title: byId.get(o.pattern)?.title ?? '(not in catalogue)',
        class: byId.get(o.pattern)?.class ?? 'unknown',
        status: o.status,
        evidence: [],
        staticFindings: 0,
      };
      // Several probes may judge one pattern; the worst verdict stands.
      if (SEVERITY[o.status] > SEVERITY[entry.status]) entry.status = o.status;
      entry.evidence.push(`[${probe.probe}] ${o.evidence}`);
      patterns[o.pattern] = entry;
    }
  }
  for (const f of scan.findings) {
    if (patterns[f.pattern]) patterns[f.pattern].staticFindings++;
  }
  const summary = { pass: 0, fail: 0, 'not-applicable': 0, 'not-runnable': 0 };
  for (const p of Object.values(patterns)) summary[p.status]++;

  let pkgName = path.basename(opts.pkg);
  try {
    const pj = JSON.parse(fs.readFileSync(path.join(opts.pkg, 'package.json'), 'utf8'));
    if (typeof pj.name === 'string' && pj.name) pkgName = pj.name;
  } catch {
    // no or unreadable package.json: the directory name stands in
  }

  return {
    harness: { name: 'clean-core acceptance harness', catalogueVersion: catalogue.version, node: process.version, generatedAt: new Date().toISOString() },
    package: { name: pkgName, path: opts.pkg, adapter: adapterFile },
    sandbox: { executed: Boolean(adapter) && decision.execute, mode: adapter ? decision.mode : 'not-executed', reason: adapter ? decision.reason : 'no adapter', permissionFlag: decision.flag, timeoutMs: opts.timeout },
    summary,
    patterns,
    probes,
    static: scan,
  };
}

function cell(text) {
  return String(text).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

export function toMarkdown(report) {
  const lines = [];
  lines.push(`# Acceptance report: ${cell(report.package.name)}`);
  lines.push('');
  lines.push(`Generated ${report.harness.generatedAt} on Node ${report.harness.node}, catalogue v${report.harness.catalogueVersion}.`);
  lines.push('');
  lines.push(`**Execution:** ${report.sandbox.executed ? 'executed' : 'not executed'} (${report.sandbox.mode}). ${cell(report.sandbox.reason)}`);
  lines.push('');
  const s = report.summary;
  lines.push(`**Summary:** ${s.pass} pass, ${s.fail} fail, ${s['not-runnable']} not runnable, ${s['not-applicable']} not applicable.`);
  lines.push('');
  lines.push('| Pattern | Class | Status | Evidence | Static hits |');
  lines.push('|---|---|---|---|---|');
  for (const [id, p] of Object.entries(report.patterns)) {
    lines.push(`| ${id} ${cell(p.title)} | ${p.class} | **${p.status}** | ${cell(p.evidence.join(' / '))} | ${p.staticFindings} |`);
  }
  lines.push('');
  lines.push(`## Static scan (${report.static.files} source files, read only)`);
  lines.push('');
  if (report.static.limits?.length) {
    lines.push(`**Incomplete:** ${cell(report.static.limits.join('; '))} — the scan covers only the files it reached.`);
    lines.push('');
  }
  if (report.static.findings.length === 0) {
    lines.push('No static signals.');
  } else {
    lines.push('| Pattern | Check | Where | Line |');
    lines.push('|---|---|---|---|');
    for (const f of report.static.findings) lines.push(`| ${f.pattern} | ${f.check} | ${cell(f.file)}:${f.line} | \`${cell(f.excerpt).replace(/`/g, "'")}\` |`);
  }
  lines.push('');
  return lines.join('\n');
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${err.message}\n\nusage: node scripts/acceptance/run.mjs <package-dir> [--adapter file] [--out dir] [--timeout ms] [--trusted-fixture] [--static-only]\n`);
    process.exit(2);
  }
  let report;
  try {
    report = await runHarness(opts);
  } catch (err) {
    process.stderr.write(`acceptance harness: ${err.message}\n`);
    process.exit(2);
  }
  if (opts.out) {
    fs.mkdirSync(opts.out, { recursive: true });
    fs.writeFileSync(path.join(opts.out, 'acceptance-report.json'), `${JSON.stringify(report, null, 2)}\n`);
    fs.writeFileSync(path.join(opts.out, 'acceptance-report.md'), toMarkdown(report));
    process.stdout.write(`${path.join(opts.out, 'acceptance-report.json')}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
