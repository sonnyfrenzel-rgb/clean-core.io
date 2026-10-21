import { ENGINE_RUNTIME_JS } from './engine-runtime';
import { PROBE_RUNTIME_JS } from './probe-runtime';
import type { SandboxFile } from './files';

/**
 * The probe pass of a generation candidate inside the isolated test runner
 * (`docs/design/engine-led-transformation.md` §13.1, Track C2; roadmap 3.0.12).
 *
 * The failure-pattern probes of the acceptance harness
 * (`scripts/acceptance/lib/probes.mjs`) judge a package against patterns the
 * external reviews found — commercial rounding, exact decimal quantities,
 * colliding run ids, an accepted empty selection, lenient number parsing, CSV
 * escaping, a display filter that leaks into totals, an additive recalculation,
 * a negative write. Their expectations come from the pattern, never from the
 * package.
 *
 * The generated code never runs as a peer of the probes (as in the engine
 * pass, `./engine-suite.ts`). The pass is a driver, written
 * here, deterministically, from the candidate's own `acceptance-adapter.json`
 * (engine-written by the scaffold). It
 *   1. imports the probes and the confinement runtime and takes the stdout
 *      writer — before any generated code exists in the process;
 *   2. loads SES and calls `lockdown()`: every JavaScript intrinsic is frozen,
 *      so no prototype, `JSON`, `Object.keys`, `Date` or `Array.prototype`
 *      method the probes read can be patched;
 *   3. evaluates the adapter's modules — bundled on their own by the core
 *      (`./core.ts`, `PROBE_MODULES_BUNDLE_PATH`) — in a SES compartment
 *      (`createConfinement`): no `process` (a sink stands in for stdout), no
 *      Node module beyond hardened stand-ins, an inert `Function` constructor;
 *   4. runs each mapped probe outside the compartment: the probe's requests
 *      (`call`, `call-many`, `clock`) are answered by the shared probe executor
 *      (`createProbeExecutor`; the harness's executor uses the same) as plain
 *      JSON, across a JSON boundary both ways; the clock is the confinement's
 *      host capability, the global `Date` is never touched;
 *   5. prints one outcome line per probe (`PROBE_OUTCOME_MARKER`).
 * The app reads those lines (`probeVerdicts` below): exactly
 * one line per probe it planned, or the probe is Not run. The generated code
 * cannot reach the probes, their expectations, the outcome writer or the
 * pass's own files (`__cc_probe/` is reserved: no generated file can import
 * it); what it can still do is choose its answers, which is what is being
 * tested. A module that needs something the compartment does not provide makes
 * the probes Not run, with that reason — never a pass.
 *
 * The app and the runner build the same inputs from the same files
 * (`probeRunInputs`), so the app checks the runner's probe report by the hash
 * of every file and of the driver (`verifyProbeReport`, runner protocol 3).
 *
 * `import-side-effects` is not run here: the sandbox neutralises `listen`, so
 * a server started on import cannot be seen; the harness keeps that probe.
 *
 * Pure: strings in, strings out. The runner image copies `lib/test-sandbox/`.
 */

export const PROBE_DIR = '__cc_probe';
export const PROBE_RUNTIME_PATH = '__cc_probe/probes.mjs';
/** The confinement runtime (`scripts/acceptance/child/engine-cases-core.mjs`), the text the engine pass carries. */
export const PROBE_CONFINEMENT_PATH = '__cc_probe/runtime.mjs';
/** What the core writes beside them, never sent over the wire: the adapter's modules bundled on their own, and SES. */
export const PROBE_MODULES_BUNDLE_PATH = '__cc_probe/modules.cjs';
export const PROBE_SES_PATH = '__cc_probe/ses.cjs';
export const PROBE_TEST_PREFIX = 'PRB_';
export const PROBE_MARKER = '[probe]';
export const ADAPTER_PATH = 'acceptance-adapter.json';
/** The driver prints one line per probe: this marker and `{ probe, outcomes } | { probe, notRun, adapter }`. */
export const PROBE_OUTCOME_MARKER = '@@CC-PROBE-OUTCOME ';

/** The probes this pass runs, in the harness's order. */
export const SANDBOX_PROBES = [
  'rounding-commercial',
  'decimal-quantity',
  'run-id-collision',
  'empty-selection',
  'lenient-numeric',
  'csv-escaping',
  'display-filter',
  'recalc-additive',
  'negative-write',
] as const;

export const SANDBOX_PROBE_NOT_RUN: Readonly<Record<string, string>> = {
  'import-side-effects': 'not run in the sandbox: it neutralises listen, so a server started on import cannot be observed (the acceptance harness runs this probe)',
};

export type ProbeRunInputs =
  | {
      ok: true;
      files: SandboxFile[];
      suiteCode: string;
      probes: string[];
      skipped: Array<{ probe: string; reason: string }>;
      /** What the core needs to run the pass confined (`SandboxRunInput.probe`): the adapter's modules, name and path. */
      probe: { modules: Array<[string, string]> };
    }
  | { ok: false; reason: string };

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const norm = (p: string) => p.replace(/\\/g, '/').replace(/^\.\//, '');

/** Every `module` name a probe's config refers to. */
function modulesNamed(config: unknown): string[] {
  const named = new Set<string>();
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (isPlainObject(v)) {
      for (const [k, x] of Object.entries(v)) {
        if (k === 'module' && typeof x === 'string') named.add(x);
        else walk(x);
      }
    }
  };
  walk(config);
  return [...named];
}

/**
 * The driver of the probe pass — the "suite" the core runs in place of a test
 * file. The bundle exports module `i` of `modules` as `m<i>` (`./core.ts`).
 */
export function probeSuiteCode(modules: ReadonlyArray<[string, string]>, run: readonly string[], config: Record<string, unknown>): string {
  const names = Object.fromEntries(modules.map(([name], i) => [name, `m${i}`]));
  return `// The probe pass — written by Clean-Core.io, not by a model (roadmap 3.0.12).
// The adapter's modules ${JSON.stringify(modules.map(([, rel]) => rel))} run bundled as ./${PROBE_MODULES_BUNDLE_PATH}, in a SES compartment.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { LOCKDOWN_OPTIONS, createConfinement, createProbeExecutor } from ${JSON.stringify(`./${PROBE_CONFINEMENT_PATH}`)};
import { PROBES } from ${JSON.stringify(`./${PROBE_RUNTIME_PATH}`)};

// Taken before lockdown and before any generated code exists in this process.
const write = process.stdout.write.bind(process.stdout);
const exit = process.exit.bind(process);
const stringify = JSON.stringify;
const parse = JSON.parse;
const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const bundle = read(${JSON.stringify(`./${PROBE_MODULES_BUNDLE_PATH}`)});
const NAMES = ${JSON.stringify(names)};
const CONFIG = ${JSON.stringify(config)};
const RUN = ${JSON.stringify(run)};

createRequire(import.meta.url)(${JSON.stringify(`./${PROBE_SES_PATH}`)});
globalThis.lockdown(LOCKDOWN_OPTIONS);

const confinement = createConfinement({
  now: () => Date.now(),
  random: () => Math.random(),
  randomUUID: () => crypto.randomUUID(),
  getRandomValues: (array) => crypto.getRandomValues(array),
  structuredClone: (value) => structuredClone(value),
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  nodeEnv: 'test',
  // Sets CC_AUTHORITY_DEMO=grant in the package's environment for this test run, and the run's report records it;
  // srv/lib/authority.ts still denies the checks in the service, and the case with authority: 'denied' runs without the grant.
  authorityGrant: true,
  platform: process.platform,
  version: process.version,
});
const message = (err) => String(err && err.message ? err.message : err).split('\\n')[0].slice(0, 300);
const executor = createProbeExecutor(confinement);
let failure = null;
const loaded = confinement.load(bundle);
if (loaded.failure !== undefined) failure = String(loaded.failure);
else {
  for (const [name, key] of Object.entries(NAMES)) {
    try {
      executor.use(name, loaded.exports[key]);
    } catch (err) {
      failure = 'module ' + name + ' cannot be read: ' + message(err);
      break;
    }
  }
}
// Across a JSON boundary both ways, as the harness's executor answers over its pipe:
// the package gets copies of the probe's arguments, the probe gets plain data back.
const request = async (kind, payload) => parse(stringify(await executor.request(kind, parse(stringify(payload ?? {})))) ?? 'null');
const outcomesOf = (list) =>
  (Array.isArray(list) ? list : []).map((o) => ({ pattern: String(o && o.pattern), status: String(o && o.status), evidence: String(o && o.evidence).slice(0, 2000) }));
const line = (entry) => new Promise((done) => write('\\n' + ${JSON.stringify(PROBE_OUTCOME_MARKER)} + stringify(entry) + '\\n', () => done()));

for (const probe of RUN) {
  let entry;
  if (failure !== null) entry = { probe, notRun: 'the code cannot run in the confined sandbox: ' + failure.slice(0, 300), adapter: false };
  else {
    try {
      entry = { probe, outcomes: outcomesOf(await PROBES[probe](CONFIG[probe], { request })) };
    } catch (err) {
      entry = { probe, notRun: message(err), adapter: Boolean(err && err.adapter) };
    }
  }
  // One line per probe as it ends: a probe that hangs into the timeout leaves the others reported.
  await line(entry);
}
// The exit only once everything is flushed: timers the code left behind do not hold the run open.
write('\\n', () => exit(0));
`;
}

/** The files and the suite of the probe pass, or why there is none. */
export function probeRunInputs(generated: readonly SandboxFile[]): ProbeRunInputs {
  const adapterFile = generated.find((f) => norm(f.path) === ADAPTER_PATH);
  if (!adapterFile) return { ok: false, reason: 'Failure-pattern probes not run: the candidate has no acceptance-adapter.json.' };
  let adapter: unknown;
  try {
    adapter = JSON.parse(adapterFile.content);
  } catch {
    return { ok: false, reason: 'Failure-pattern probes not run: acceptance-adapter.json is not JSON.' };
  }
  if (!isPlainObject(adapter) || !isPlainObject(adapter.modules)) {
    return { ok: false, reason: 'Failure-pattern probes not run: acceptance-adapter.json has no "modules" map.' };
  }
  // The pass's own directory is never the candidate's: a file there is dropped, never trusted or imported.
  const own = generated.filter((f) => !norm(f.path).startsWith(`${PROBE_DIR}/`));
  const paths = new Set(own.map((f) => f.path));
  const modules = new Map<string, string>();
  for (const [name, rel] of Object.entries(adapter.modules)) {
    // Only a file of the candidate itself, named exactly as it stands.
    if (typeof rel === 'string' && paths.has(rel) && /^[A-Za-z0-9_][A-Za-z0-9_./-]*\.(?:ts|mts|mjs|js)$/.test(rel) && !rel.includes('..')) {
      modules.set(name, rel);
    }
  }
  const probesCfg = isPlainObject(adapter.probes) ? adapter.probes : {};
  const run: string[] = [];
  const skipped: Array<{ probe: string; reason: string }> = Object.entries(SANDBOX_PROBE_NOT_RUN).map(([probe, reason]) => ({ probe, reason }));
  const config: Record<string, unknown> = {};
  for (const probe of SANDBOX_PROBES) {
    const cfg = probesCfg[probe];
    if (!isPlainObject(cfg)) {
      skipped.push({ probe, reason: 'not applicable: the adapter does not map this probe' });
      continue;
    }
    if (typeof cfg.notApplicable === 'string' || cfg.notApplicable === true) {
      skipped.push({ probe, reason: `not applicable: ${String(cfg.notApplicable)}` });
      continue;
    }
    const absent = modulesNamed(cfg).filter((m) => !modules.has(m));
    if (absent.length > 0) {
      skipped.push({ probe, reason: `not runnable: the adapter names module${absent.length === 1 ? '' : 's'} ${absent.join(', ')} that the candidate does not hold` });
      continue;
    }
    run.push(probe);
    config[probe] = cfg;
  }
  if (run.length === 0) return { ok: false, reason: 'Failure-pattern probes not run: the adapter maps no probe this candidate can run.' };

  const moduleList = [...modules.entries()];
  return {
    ok: true,
    files: [...own, { path: PROBE_RUNTIME_PATH, content: PROBE_RUNTIME_JS }, { path: PROBE_CONFINEMENT_PATH, content: ENGINE_RUNTIME_JS }],
    suiteCode: probeSuiteCode(moduleList, run, config),
    probes: run,
    skipped,
    probe: { modules: moduleList },
  };
}

/** One probe's result as the verify answer carries it (the shape `parseTapOutput` gave before). */
export interface ProbeVerdict {
  id: string;
  name: string;
  status: 'Passed' | 'Failed' | 'Skipped';
  message?: string;
}

/**
 * The verdicts of the probe pass, read from the driver's outcome lines for the
 * probes the app itself planned (`probeRunInputs(...).probes`). Nothing else in
 * the output counts — TAP, a line without the marker, a line for a probe that
 * was not planned. A probe without exactly one outcome line is Not run (the
 * pass did not finish it, or something besides the driver printed one), a
 * probe the driver could not run is Not run with its reason, and only a probe
 * whose every outcome is `pass` or `not-applicable`, with at least one `pass`,
 * is Passed.
 */
export function probeVerdicts(stdout: string, probes: readonly string[]): ProbeVerdict[] {
  const reported = new Map<string, unknown[]>();
  for (const raw of stdout.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (!line.startsWith(PROBE_OUTCOME_MARKER)) continue;
    let entry: unknown;
    try {
      entry = JSON.parse(line.slice(PROBE_OUTCOME_MARKER.length));
    } catch {
      continue;
    }
    const probe = isPlainObject(entry) ? entry.probe : undefined;
    if (typeof probe !== 'string') continue;
    reported.set(probe, [...(reported.get(probe) ?? []), entry]);
  }
  return probes.map((probe): ProbeVerdict => {
    const id = `${PROBE_TEST_PREFIX}${probe}`;
    const name = `${id}: failure-pattern probe ${probe} ${PROBE_MARKER}`;
    const notRun = (message: string): ProbeVerdict => ({ id, name, status: 'Skipped', message: message.slice(0, 2000) });
    const lines = reported.get(probe) ?? [];
    if (lines.length === 0) return notRun('not run: the probe pass reported no outcome for this probe (it did not finish in the sandbox)');
    if (lines.length > 1) return notRun(`not run: the probe pass reported this probe ${lines.length} times — something besides the probe driver printed an outcome line, so none is judged`);
    const entry = lines[0] as Record<string, unknown>;
    if (typeof entry.notRun === 'string') {
      return notRun(`${entry.adapter === true ? 'not runnable: adapter mapping does not fit the package: ' : 'not runnable: '}${entry.notRun}`);
    }
    const outcomes = Array.isArray(entry.outcomes) ? entry.outcomes.filter(isPlainObject) : [];
    if (outcomes.length === 0) return notRun('not run: the probe reported no outcome');
    const failed = outcomes.filter((o) => o.status === 'fail');
    if (failed.length > 0) {
      return { id, name, status: 'Failed', message: failed.map((o) => `${String(o.pattern)}: ${String(o.evidence)}`).join(' | ').slice(0, 2000) };
    }
    if (outcomes.some((o) => o.status !== 'pass' && o.status !== 'not-applicable')) return notRun('not run: the probe reported an outcome of an unknown status');
    if (!outcomes.some((o) => o.status === 'pass')) return notRun('not applicable: every pattern of this probe is not applicable to the package');
    return { id, name, status: 'Passed' };
  });
}
