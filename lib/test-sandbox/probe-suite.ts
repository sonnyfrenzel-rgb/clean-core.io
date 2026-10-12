import { PROBE_RUNTIME_JS } from './probe-runtime';
import type { SandboxFile } from './files';

/**
 * The probe pass of a generation candidate inside the isolated test runner
 * (`docs/design/engine-led-transformation.md` §13.1, Track C2; roadmap 3.0.12).
 *
 * The failure-pattern probes of the acceptance harness
 * (`scripts/acceptance/child/probes.mjs`) judge a package against patterns the
 * external reviews found — commercial rounding, exact decimal quantities,
 * colliding run ids, an accepted empty selection, lenient number parsing, CSV
 * escaping, a display filter that leaks into totals, an additive recalculation,
 * a negative write. Their expectations come from the pattern, never from the
 * package. The harness runs them in a child process on a developer's machine;
 * here they run as an ordinary suite of the sandbox — the same executor, the
 * same hash-bound report — so a candidate is checked where generated code is
 * allowed to execute and nowhere else.
 *
 * The suite is written here, deterministically, from the candidate's own
 * `acceptance-adapter.json` (engine-written by the scaffold): one static
 * import per adapter module (the bundler includes only what is imported
 * statically), the probes as `__cc_probe/probes.mjs`, and one `node:test`
 * test per mapped probe, titled `PRB_<probe>: … [probe]`. A probe whose
 * positive control does not hold (the adapter does not fit) is skipped with
 * the reason — never a silent pass. `import-side-effects` is not run here: the
 * sandbox neutralises `listen`, so a server started on import cannot be seen;
 * the harness keeps that probe.
 *
 * Pure: strings in, strings out.
 */

export const PROBE_RUNTIME_PATH = '__cc_probe/probes.mjs';
export const PROBE_TEST_PREFIX = 'PRB_';
export const PROBE_MARKER = '[probe]';
export const ADAPTER_PATH = 'acceptance-adapter.json';

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
  const paths = new Set(generated.map((f) => f.path));
  const modules = new Map<string, string>();
  const missing = new Set<string>();
  for (const [name, rel] of Object.entries(adapter.modules)) {
    // Only a file of the candidate itself, named exactly as it stands.
    if (typeof rel === 'string' && paths.has(rel) && /^[A-Za-z0-9_][A-Za-z0-9_./-]*\.(?:ts|mts|mjs|js)$/.test(rel) && !rel.includes('..')) {
      modules.set(name, rel);
    } else missing.add(name);
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

  const imports = [...modules.entries()].map(([, rel], i) => `import * as m${i} from ${JSON.stringify(`./${rel}`)};`);
  const table = [...modules.keys()].map((name, i) => `  ${JSON.stringify(name)}: m${i},`);
  const suiteCode = `// The probe pass — written by Clean-Core.io, not by a model (roadmap 3.0.12).
import { test } from 'node:test';
import { PROBES } from ${JSON.stringify(`./${PROBE_RUNTIME_PATH}`)};
${imports.join('\n')}

const MODULES = {
${table.join('\n')}
};
const CONFIG = ${JSON.stringify(config)};
const load = async (name) => {
  if (!Object.prototype.hasOwnProperty.call(MODULES, name)) throw Object.assign(new Error('adapter names no module ' + name), { adapter: true });
  return MODULES[name];
};

for (const name of ${JSON.stringify(run)}) {
  test(${JSON.stringify(PROBE_TEST_PREFIX)} + name + ': failure-pattern probe ' + name + ' ${PROBE_MARKER}', async (t) => {
    let outcomes;
    try {
      outcomes = await PROBES[name](CONFIG[name], { load });
    } catch (err) {
      const why = String(err && err.message ? err.message : err).split('\\n')[0];
      t.skip((err && err.adapter ? 'not runnable: adapter mapping does not fit the package: ' : 'not runnable: ') + why);
      return;
    }
    const failed = (outcomes || []).filter((o) => o && o.status === 'fail');
    if (failed.length > 0) throw new Error(failed.map((o) => o.pattern + ': ' + o.evidence).join(' | '));
  });
}
`;
  return {
    ok: true,
    files: [...generated.filter((f) => f.path !== PROBE_RUNTIME_PATH), { path: PROBE_RUNTIME_PATH, content: PROBE_RUNTIME_JS }],
    suiteCode,
    probes: run,
    skipped,
  };
}
