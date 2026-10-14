/**
 * The acceptance suite's harness step (scripts/acceptance/suite.ts): the engine
 * cases (`engine-cases.mjs`) and the failure-pattern probes (`run.mjs`) on one
 * unpacked package, under the harness's own execution rule (`lib/sandbox.mjs`,
 * `decideExecution`) — nothing here loosens it.
 *
 * Why a script of its own: that rule executes a third-party package only when
 * the platform itself refuses a socket under the permission model, which Node
 * does from v25. On an older local Node the suite starts THIS file under a
 * Node 25 binary (`npx --package=node@25`), so the sandbox's child — spawned
 * with `process.execPath` — is a Node 25 process too, and the same rule now
 * says "execute". On Node >= 25 the suite imports it in process.
 *
 *   node scripts/acceptance/harness-step.mjs <package dir> <derived cases> <out.json>
 *
 * Writes `{ node, engineCases, probes }` to the out file: counts, verdict words
 * and reasons only, never a package's code or values.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** `{ node, engineCases, probes }` for one package directory, as the suite's RunRecord carries them. */
export async function harnessStep(pkgDir, derived) {
  // Each harness is loaded inside its try: a harness that cannot be loaded is a check that did not run, with the
  // reason, never a stopped suite.
  const engineCases = { derived, passed: 0, failed: 0, notRun: derived, reason: null };
  if (fs.existsSync(path.join(pkgDir, 'test', 'engine-cases.json'))) {
    try {
      const engine = await import(pathToFileURL(path.join(HERE, 'engine-cases.mjs')).href);
      const r = await engine.runEngineCases({ pkg: pkgDir, timeout: 20_000, trustedFixture: false, staticOnly: false });
      Object.assign(engineCases, r.summary);
      engineCases.reason = r.summary.notRun > 0 ? (r.cases.find((c) => c.reason)?.reason ?? r.sandbox.reason) : null;
    } catch (err) {
      engineCases.reason = `the case run stopped: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`;
    }
  } else engineCases.reason = 'the package carries no test/engine-cases.json';
  const probes = { pass: 0, fail: 0, notRunnable: 0, notApplicable: 0, executed: false, reason: null, byPattern: {} };
  try {
    const harness = await import(pathToFileURL(path.join(HERE, 'run.mjs')).href);
    const r = await harness.runHarness({ pkg: pkgDir, timeout: 20_000, trustedFixture: false, staticOnly: false });
    probes.pass = r.summary.pass ?? 0;
    probes.fail = r.summary.fail ?? 0;
    probes.notRunnable = r.summary['not-runnable'] ?? 0;
    probes.notApplicable = r.summary['not-applicable'] ?? 0;
    probes.executed = r.sandbox.executed;
    probes.reason = r.sandbox.executed ? null : r.sandbox.reason;
    for (const [id, p] of Object.entries(r.patterns)) probes.byPattern[id] = p.status;
  } catch (err) {
    probes.reason = `the probe run stopped: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`;
  }
  return { node: process.version, engineCases, probes };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [pkgDir, derived, out] = process.argv.slice(2);
  if (!pkgDir || !out || !Number.isFinite(Number(derived))) {
    console.error('usage: node scripts/acceptance/harness-step.mjs <package dir> <derived cases> <out.json>');
    process.exit(2);
  }
  harnessStep(path.resolve(pkgDir), Number(derived)).then(
    (r) => {
      fs.writeFileSync(out, `${JSON.stringify(r)}\n`);
      process.exit(0);
    },
    (err) => {
      console.error(`harness step: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    },
  );
}
