#!/usr/bin/env node
/**
 * Run the engine cases of a delivery package against its call contract.
 *
 *   node scripts/acceptance/engine-cases.mjs <unpacked-package-dir>
 *        [--cases <file>]          default <package>/test/engine-cases.json
 *        [--out <dir>]             default <package>/engine-cases-report (never inside the copy that runs)
 *        [--timeout <ms>]          hard limit for the child (default 20000)
 *        [--trusted-fixture]       the package is self-written; allow execution with the best-effort network guard
 *        [--static-only]           do not execute anything
 *
 * The engine cases (`test/engine-cases.json`, written by Clean-Core.io from the
 * original without a model — `lib/testing-engine-cases.ts`) carry each example
 * in machine form (`call`). This runner calls the package's call contract
 * (`srv/engine-contract.*`: CONTRACT, validate, simulate, getRun —
 * `lib/engine-call-contract.ts`) with them — no model-written assertion — and
 * writes `engine-cases-report.json`: per case Passed, Failed or Not run, per
 * example the evidence.
 *
 * It executes through the acceptance harness's sandbox (`lib/sandbox.mjs`): the
 * sandboxed executor runs the contract in a locked-down SES compartment, only
 * calls it and reports its answers, and the verdicts are given in this
 * process, which never imports the package. Same
 * rule: a package runs only when the platform denies the child network access,
 * or when the operator states it is a self-written fixture.
 * Otherwise every case reads Not run, with the reason. Never installs, never
 * runs npm scripts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundleModules, copyToTemp, decideExecution, removeTemp, startExecutor } from './lib/sandbox.mjs';
import { writeReportFiles } from './lib/write-report.mjs';
import { CALL_CONTRACT_PATHS, NOT_RUN_NO_CONTRACT, judgeEngineCase } from './child/engine-cases-core.mjs';

export { NOT_RUN_NO_CONTRACT };

function parseArgs(argv) {
  const opts = { timeout: 20000, trustedFixture: false, staticOnly: false, cases: null, out: null, pkg: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--cases') opts.cases = argv[++i];
    else if (a === '--out') opts.out = argv[++i];
    else if (a === '--timeout') opts.timeout = Number(argv[++i]);
    else if (a === '--trusted-fixture') opts.trustedFixture = true;
    else if (a === '--static-only') opts.staticOnly = true;
    else if (!a.startsWith('--') && !opts.pkg) opts.pkg = a;
    else throw new Error(`unknown argument ${a}`);
  }
  if (!opts.pkg) throw new Error('no package directory given');
  return opts;
}

/** The report when nothing ran: every case Not run, with one reason. */
function allNotRun(cases, reason) {
  return cases.map((c) => ({ id: c.id, name: c.name, status: 'Not run', reason, examples: [] }));
}

export async function runEngineCases(opts) {
  const pkg = path.resolve(opts.pkg);
  const casesFile = path.resolve(opts.cases ?? path.join(pkg, 'test', 'engine-cases.json'));
  const parsed = JSON.parse(fs.readFileSync(casesFile, 'utf8'));
  const cases = Array.isArray(parsed?.cases) ? parsed.cases : [];
  const contractPath = CALL_CONTRACT_PATHS.find((p) => fs.existsSync(path.join(pkg, p))) ?? null;
  const decision = decideExecution({ trustedFixture: opts.trustedFixture, staticOnly: opts.staticOnly });
  const report = {
    format: 'clean-core.engine-cases-report/1',
    package: path.basename(pkg),
    contract: { path: contractPath, present: false },
    sandbox: { executed: false, mode: decision.mode, reason: decision.reason },
    cases: [],
  };

  if (!contractPath) {
    report.cases = allNotRun(cases, `${NOT_RUN_NO_CONTRACT} (none of ${CALL_CONTRACT_PATHS.join(', ')})`);
  } else if (!decision.execute) {
    report.cases = allNotRun(cases, `Not run — ${decision.reason}`);
  } else {
    const skipped = [];
    const root = copyToTemp(pkg, skipped);
    if (skipped.length > 0) report.sandbox.skippedSymlinks = skipped;
    try {
      // The executor collects the contract's answers in the sandbox; the verdicts are given here,
      // by the same runtime's judge, against the cases this process read itself.
      // The cases — inputs and expectations — are never part of what the contract can import:
      // the package's own copy (test/engine-cases.json, or the --cases file when it
      // lies inside the package) is removed from the run copy and reserved in the bundler.
      const inPackage = path.relative(pkg, casesFile);
      const reserved = ['test/engine-cases.json'];
      if (!inPackage.startsWith('..') && !path.isAbsolute(inPackage)) reserved.push(inPackage);
      for (const rel of reserved) fs.rmSync(path.join(root, rel), { force: true });
      // The contract module and what it imports, bundled here; evaluated only in the executor's compartment.
      const prepared = await bundleModules(root, { contract: contractPath }, { reserved });
      const ex = startExecutor({ root, nodeEnv: 'test', timeoutMs: opts.timeout, flag: decision.flag });
      report.sandbox.executed = true;
      const judged = [];
      let stopped = null;
      try {
        const loaded = prepared.failure !== undefined ? { failure: prepared.failure } : await ex.request('engine-load', { bundle: prepared.bundle, key: prepared.names.contract });
        if (!loaded || typeof loaded !== 'object' || loaded.failure !== undefined || loaded.transportError !== undefined) {
          stopped = String(loaded?.failure ?? loaded?.transportError ?? 'the executor did not load the contract module') || 'the contract module failed to load without saying why';
        } else {
          for (const c of cases) {
            const kase = { id: c.id, examples: c.examples ?? [] };
            const answer = await ex.request('engine-case', { kase });
            if (!answer || typeof answer !== 'object' || !('collected' in answer)) {
              stopped = String(answer?.transportError ?? 'the executor reported nothing for a case');
              break;
            }
            const r = judgeEngineCase(kase, answer.collected);
            judged.push({ id: c.id, name: c.name, status: r.status, ...(r.reason ? { reason: r.reason } : {}), examples: r.examples });
          }
        }
      } catch (err) {
        stopped = String(err && err.message ? err.message : err);
      }
      const end = await ex.close();
      if (end.timedOut) report.cases = allNotRun(cases, `Not run — the package did not finish within ${opts.timeout} ms`);
      else if (end.poisoned) report.cases = allNotRun(cases, `Not run — the run was discarded: ${end.poisoned}`);
      else if (stopped) report.cases = allNotRun(cases, `Not run — ${stopped}${end.stderrTail ? ` (${end.stderrTail})` : ''}`);
      else {
        report.cases = judged;
        report.contract.present = !report.cases.some((c) => String(c.reason ?? '').startsWith(NOT_RUN_NO_CONTRACT));
      }
    } finally {
      removeTemp(root);
    }
  }
  report.summary = {
    passed: report.cases.filter((c) => c.status === 'Passed').length,
    failed: report.cases.filter((c) => c.status === 'Failed').length,
    notRun: report.cases.filter((c) => c.status === 'Not run').length,
  };
  return report;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    const opts = parseArgs(process.argv.slice(2));
    const report = await runEngineCases(opts);
    const out = path.resolve(opts.out ?? path.join(opts.pkg, 'engine-cases-report'));
    // The default directory is inside the package: a link there is refused, never followed.
    const [written] = writeReportFiles(out, { 'engine-cases-report.json': `${JSON.stringify(report, null, 2)}\n` });
    const s = report.summary;
    process.stdout.write(`engine cases: ${s.passed} passed, ${s.failed} failed, ${s.notRun} not run (${report.sandbox.mode}) → ${written}\n`);
  } catch (err) {
    process.stderr.write(`${err.message}\n\nusage: node scripts/acceptance/engine-cases.mjs <package-dir> [--cases file] [--out dir] [--timeout ms] [--trusted-fixture] [--static-only]\n`);
    process.exit(2);
  }
}
