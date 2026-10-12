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
 * It executes through the acceptance harness's sandbox (`lib/sandbox.mjs`) and
 * under its rule: a package runs only when the platform denies the child
 * network access, or when the operator states it is a self-written fixture.
 * Otherwise every case reads Not run, with the reason. Never installs, never
 * runs npm scripts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyToTemp, decideExecution, removeTemp, runChild } from './lib/sandbox.mjs';
import { CALL_CONTRACT_PATHS, caseVerdict, judge } from './child/engine-cases-core.mjs';

export const NOT_RUN_NO_CONTRACT = 'Not run — the code does not export the call contract';

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
    const root = copyToTemp(pkg);
    try {
      const job = { module: contractPath, cases: cases.map((c) => ({ id: c.id, calls: (c.examples ?? []).map((e) => e.call ?? null) })) };
      const run = await runChild({ root, job, nodeEnv: 'test', timeoutMs: opts.timeout, flag: decision.flag, entry: 'engine-cases-child.mjs' });
      report.sandbox.executed = true;
      const result = run.result;
      if (run.timedOut) report.cases = allNotRun(cases, `Not run — the package did not finish within ${opts.timeout} ms`);
      else if (!result) report.cases = allNotRun(cases, `Not run — the child gave no result${run.stderrTail ? ` (${run.stderrTail})` : ''}`);
      else if (result.noContract) report.cases = allNotRun(cases, `${NOT_RUN_NO_CONTRACT}: ${result.noContract}`);
      else if (result.notRunnable || result.error) report.cases = allNotRun(cases, `Not run — ${result.notRunnable ?? result.error}`);
      else {
        report.contract.present = true;
        const byId = new Map((result.cases ?? []).map((c) => [c.id, c]));
        report.cases = cases.map((c) => {
          const outcomes = byId.get(c.id)?.examples ?? [];
          const examples = (c.examples ?? []).map((e, i) =>
            e.call
              ? { input: e.input, ...judge(e.call, outcomes[i]) }
              : { input: e.input, status: 'not-runnable', evidence: 'not expressible through the call contract — asserted by the model\'s test only' },
          );
          const verdict = caseVerdict(examples);
          return { id: c.id, name: c.name, status: verdict.status, ...(verdict.reason ? { reason: verdict.reason } : {}), examples };
        });
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
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'engine-cases-report.json'), `${JSON.stringify(report, null, 2)}\n`);
    const s = report.summary;
    process.stdout.write(`engine cases: ${s.passed} passed, ${s.failed} failed, ${s.notRun} not run (${report.sandbox.mode}) → ${path.join(out, 'engine-cases-report.json')}\n`);
  } catch (err) {
    process.stderr.write(`${err.message}\n\nusage: node scripts/acceptance/engine-cases.mjs <package-dir> [--cases file] [--out dir] [--timeout ms] [--trusted-fixture] [--static-only]\n`);
    process.exit(2);
  }
}
