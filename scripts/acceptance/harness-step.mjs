/**
 * The acceptance suite's harness step (scripts/acceptance/suite.ts): the engine
 * cases (`engine-cases.mjs`) and the failure-pattern probes (`run.mjs`) on one
 * unpacked package, under the harness's own execution rule (`lib/sandbox.mjs`,
 * `decideExecution`) — nothing here loosens it.
 *
 * Why a script of its own: that rule executes a third-party package only when
 * the platform itself refuses a socket under the permission model, which Node
 * does from v25. On an older local Node the suite starts THIS file under a
 * Node 25 binary (`npx --package=node@<HARNESS_NODE_VERSION>`, suite.ts), so the sandbox's child — spawned
 * with `process.execPath` — is a Node 25 process too, and the same rule now
 * says "execute". On Node >= 25 the suite imports it in process.
 *
 *   node scripts/acceptance/harness-step.mjs <package dir> <derived cases> <out.json> [demo case numbers]
 *
 * Writes `{ node, engineCases, probes }` to the out file: counts, verdict words
 * and reasons only, never a package's code. With demo case numbers (3.0.14
 * item 3) also `demoCases`: each named case of the original run through the
 * package (`demoCaseRuns`) and reduced to its output, which the suite compares
 * with the reviewers' sealed scenarios in its own process — the scenarios never
 * reach this step. The out file lives in the gitignored run folder and is
 * removed once read.
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

/** What one demo case's run is reduced to: the state, and of a run only what a scenario can be compared with. */
function caseSummary(r) {
  if (!r || typeof r !== 'object') return { state: 'not-run', reason: 'the case answered nothing' };
  if (r.state === 'not-run') return { state: 'not-run', reason: String(r.reason ?? '') };
  if (r.state === 'threw') return { state: 'threw', message: String(r.message ?? '').slice(0, 300) };
  const o = r.outcome ?? {};
  const st = o.state ?? {};
  const local = st.local && typeof st.local === 'object' ? st.local : {};
  return {
    state: 'ran',
    complete: o.complete === true,
    notFilled: Array.isArray(o.notFilled) ? o.notFilled.map(String) : [],
    refused: Boolean(o.refusal),
    rows: Array.isArray(st.rows) ? st.rows : [],
    result: st.result && typeof st.result === 'object' ? st.result : {},
    issues: Array.isArray(st.issues) ? st.issues.map((i) => String(i?.message ?? i ?? '')) : [],
    // The globals: scalars, structures and tables of plain rows — the original's output often stands in one.
    local,
  };
}

/**
 * The original's demo cases of a Node package, by number (3.0.14 item 3): each through the package's own
 * `runDemoCase` (srv/fixtures.ts) under the same execution rule as the probes — a fresh confined executor, the
 * package's module bundled here and evaluated only there. Answers `{ executed, reason, byNumber }`; a case's run is
 * reduced to its state and its output (`caseSummary`) — data of the package, never the scenarios' expectations,
 * which stay with the suite. Not executed (no Node >= 25, no demo cases, the module refused) says why.
 */
export async function demoCaseRuns(pkgDir, numbers, timeoutMs = 60_000) {
  const out = { executed: false, reason: null, byNumber: {} };
  const wanted = [...new Set(numbers.map(Number).filter((n) => Number.isInteger(n) && n >= 0))];
  if (wanted.length === 0) {
    out.reason = 'no scenario names a demo case of this package';
    return out;
  }
  const demoFile = path.join(pkgDir, 'test', 'fixtures', 'original-demo.json');
  if (!fs.existsSync(demoFile) || !fs.existsSync(path.join(pkgDir, 'srv', 'fixtures.ts'))) {
    out.reason = 'the package carries no demo cases of the original (test/fixtures/original-demo.json)';
    return out;
  }
  let demo;
  try {
    demo = JSON.parse(fs.readFileSync(demoFile, 'utf8'));
  } catch (err) {
    out.reason = `the demo cases cannot be read: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`;
    return out;
  }
  const { bundleModules, copyToTemp, decideExecution, removeTemp, startExecutor } = await import(pathToFileURL(path.join(HERE, 'lib', 'sandbox.mjs')).href);
  const decision = decideExecution({ trustedFixture: false, staticOnly: false });
  if (!decision.execute) {
    out.reason = `not executed: ${decision.reason}`;
    return out;
  }
  const root = copyToTemp(pkgDir, []);
  try {
    const prepared = await bundleModules(root, { fixtures: 'srv/fixtures.ts' }, { reserved: ['test'] });
    if (prepared.failure !== undefined) {
      out.reason = `the demo-case module cannot be prepared: ${prepared.failure}`;
      return out;
    }
    const ex = startExecutor({ root, flag: decision.flag, timeoutMs, nodeEnv: 'test' });
    try {
      const loaded = await ex.request('load', { bundle: prepared.bundle, names: prepared.names });
      if (loaded?.failure) {
        out.reason = `the demo-case module does not load: ${String(loaded.failure).slice(0, 200)}`;
        return out;
      }
      out.executed = true;
      for (const n of wanted) {
        const c = (demo.cases ?? []).find((x) => x.number === n);
        if (!c) {
          out.byNumber[n] = { state: 'not-run', reason: `the package has no demo case ${n}` };
          continue;
        }
        const answer = await ex.request('call', { spec: { module: 'fixtures', export: 'runDemoCase' }, args: [demo, c] });
        if (answer?.threw === false) out.byNumber[n] = caseSummary(answer.value);
        else if (answer?.threw === true) out.byNumber[n] = { state: 'threw', message: String(answer.error ?? '').slice(0, 300) };
        else out.byNumber[n] = { state: 'not-run', reason: String(answer?.sandbox ?? answer?.adapter ?? answer?.transportError ?? 'the executor answered nothing usable').slice(0, 200) };
      }
    } catch (err) {
      out.reason = `the demo-case run stopped: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`;
    } finally {
      await ex.close();
    }
  } finally {
    removeTemp(root);
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [pkgDir, derived, out, cases] = process.argv.slice(2);
  if (!pkgDir || !out || !Number.isFinite(Number(derived))) {
    console.error('usage: node scripts/acceptance/harness-step.mjs <package dir> <derived cases> <out.json> [demo case numbers, comma-separated]');
    process.exit(2);
  }
  const numbers = (cases ?? '').split(',').filter(Boolean).map(Number);
  harnessStep(path.resolve(pkgDir), Number(derived))
    .then(async (r) => (numbers.length > 0 ? { ...r, demoCases: await demoCaseRuns(path.resolve(pkgDir), numbers) } : r))
    .then(
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
