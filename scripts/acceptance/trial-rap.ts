/**
 * The SAP trial stage of the acceptance suite (roadmap 3.0.18 item 13: "the ADT trial runner joins the acceptance
 * suite — every RAP package imported, activated and run in ABAP Unit on the trial without hand work").
 *
 * For each RAP package the suite kept (`--keep-packages`), or each package folder named with `--trial-from`:
 *
 *   1. push `.abapgit.xml` and `src/` to the package's private trial repository (force, one commit) — after the
 *      checks the trial applies anyway: object names within 30 characters, ABAP lines within 255;
 *   2. pull it into the package's original ABAP package with the ADT runner (`adt.mjs pull`): abapGit cannot move
 *      an object between packages, so each program keeps its package (3.0.17 acceptance);
 *   3. activate every inactive object of the package (`adt.mjs activate <stem>`, a second pass for what the first
 *      left inactive);
 *   4. run ABAP Unit on every class with a test include (`adt.mjs unit <class>`), and count per test class.
 *
 * The counts keep apart what the acceptance counts (C(7), owner decision 18.10.2026): the engine's test classes
 * (`ltc_engine_cases`, `ltc_golden_master`, `ltc_counterparts`) are evidence; a class the testing model wrote
 * (`ltcl_…`) is a proposal, and a red method of it reads "AI-generated, red in SAP: <message>" — never passed,
 * never counted with the engine's (`splitSapUnitRun`, lib/testing-abap-unit.ts).
 *
 * The runner is the owner's local tool outside the repository (it holds the trial's OAuth tokens; nothing here
 * reads them): `--trial-runner <dir>` or CCIO_ADT_RUNNER, default `~/ccio-trial/adt-runner`. Every SAP and Git
 * step goes through `TrialRunner`, so the stage is tested with a mocked runner, server-free.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { isEngineTestClass, splitSapUnitRun, type SapUnitMethod } from '../../lib/testing-abap-unit';

/** Where a program's package lives on the trial: its ABAP package and the private repository abapGit pulls. */
export interface TrialTarget {
  sapPackage: string;
  repo: string;
}

/** The 3.0.17 acceptance's packages and repositories (owner's trial, 18.10.2026). */
export const TRIAL_TARGETS: Readonly<Record<string, TrialTarget>> = {
  'sd-return-credit-recon': { sapPackage: 'ZCCIO_SF_TEST', repo: 'ccio-trial-sd' },
  'pm-shutdown-slot-plan': { sapPackage: 'ZCCIO_SF_PM', repo: 'ccio-trial-pm' },
  'qm-inspection-evidence': { sapPackage: 'ZCCIO_SF_QM', repo: 'ccio-trial-qm' },
};

/** Programs deliberately not imported, with the reason (the 3.0.17 CHANGELOG). */
export const TRIAL_NOT_IMPORTED: Readonly<Record<string, string>> = {
  'fi-journal-review': 'not imported: the BTP ABAP trial shows every import to all trial users (owner decision, 3.0.17)',
};

export interface PullOutcome {
  ok: boolean;
  /** abapGit's status letter of the repository after the pull (S, W, E …), or null when none was read. */
  status: string | null;
  text: string;
}

export interface ActivationOutcome {
  ok: boolean;
  /** Objects the call activated (named in its request). */
  activated: number;
  success: boolean | null;
  errors: string[];
  warnings: number;
  stillInactive: string[];
  /** The command's own error, when it failed. */
  failure: string | null;
}

export type UnitKind = 'green' | 'red' | 'skipped';

export interface UnitMethod {
  testClass: string;
  method: string;
  kind: UnitKind;
  message: string;
}

export interface UnitOutcome {
  ok: boolean;
  methods: UnitMethod[];
  failure: string | null;
}

/** Every SAP and Git step of the stage. */
export interface TrialRunner {
  push(pkgDir: string, target: TrialTarget, label: string): { ok: boolean; reason: string | null };
  pull(sapPackage: string): PullOutcome;
  activate(namePart: string): ActivationOutcome;
  unit(className: string): UnitOutcome;
}

export interface UnitTally {
  green: number;
  red: number;
  skipped: number;
}

export interface TrialRecord {
  program: string;
  run: number;
  sapPackage: string | null;
  repo: string | null;
  state: 'ran' | 'not-run' | 'failed';
  reason: string | null;
  /** Objects in the package (src/, without the package itself). */
  objects: number;
  pull: PullOutcome | null;
  activation: { passes: number; activated: number; errors: number; warnings: number; stillInactive: string[]; messages: string[] } | null;
  /** C(7): the engine's test classes — what the acceptance counts. */
  engineUnit: UnitTally;
  /** The testing model's classes (ltcl_…): a proposal, not evidence. */
  modelUnit: UnitTally;
  /** Every red method, engine and model, with SAP's message ("AI-generated, red in SAP: …" for a model method). */
  red: string[];
  classes: Array<{ name: string; ok: boolean; failure: string | null } & UnitTally>;
}

/* ------------------------------------------------------------- the output of adt.mjs */

export function parsePull(stdout: string): PullOutcome {
  const segments = stdout.split(/[\r\n]+/).map((s) => s.trim()).filter((s) => s && !/^\(see the import log/.test(s));
  const last = segments.at(-1) ?? '';
  const m = /^([A-Z])\b\s*(.*)$/.exec(last);
  return { ok: true, status: m ? m[1] : null, text: (m ? m[2] : last).slice(0, 200) };
}

export function parseActivation(stdout: string): ActivationOutcome {
  const out: ActivationOutcome = { ok: true, activated: 0, success: null, errors: [], warnings: 0, stillInactive: [], failure: null };
  for (const line of stdout.split(/\r?\n/)) {
    let m: RegExpExecArray | null;
    if ((m = /^activating (\d+):/.exec(line))) out.activated = Number(m[1]);
    else if (/^no inactive object containing/.test(line)) out.success = true;
    else if (/^activation: success/.test(line)) out.success = true;
    else if (/^activation: FAILED/.test(line)) out.success = false;
    else if ((m = /^still inactive: (.*)$/.exec(line))) out.stillInactive = m[1].split(',').map((s) => s.trim()).filter(Boolean);
    else if ((m = /^ {2}([EAW])\s+(.*)$/.exec(line))) {
      if (m[1] === 'W') out.warnings++;
      else out.errors.push(m[2].trim().slice(0, 240));
    }
  }
  return out;
}

export function parseUnit(stdout: string): UnitOutcome {
  const methods: UnitMethod[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const m = /^(green|red|skipped)\s+([\w/]+)=>([\w/]+)(?:\s+—\s+(.*))?$/.exec(line.trimEnd());
    if (m) methods.push({ kind: m[1] as UnitKind, testClass: m[2].toLowerCase(), method: m[3].toLowerCase(), message: (m[4] ?? '').slice(0, 300) });
  }
  return { ok: true, methods, failure: null };
}

/* ------------------------------------------------------------- the default runner */

const run = (cmd: string, args: string[], cwd: string, timeout = 900_000) => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout, windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
  return { code: r.status ?? (r.error ? -1 : 0), stdout: r.stdout ?? '', stderr: `${r.stderr ?? ''}${r.error ? r.error.message : ''}` };
};
const firstLine = (s: string) => s.split(/\r?\n/).find((l) => l.trim()) ?? '';
/** The line that says what failed: git's `error:`/`fatal:` before its warnings. */
const errorLine = (s: string) => s.split(/\r?\n/).find((l) => /^(?:error|fatal):/i.test(l)) ?? firstLine(s);

/** The pre-push checks the trial applies anyway (`folder-repo.sh` of the 3.0.17 acceptance). */
export function pushProblems(pkgDir: string): string[] {
  const problems: string[] = [];
  if (!fs.existsSync(path.join(pkgDir, '.abapgit.xml'))) problems.push('no .abapgit.xml');
  const src = path.join(pkgDir, 'src');
  if (!fs.existsSync(src)) return [...problems, 'no src/'];
  for (const f of fs.readdirSync(src)) {
    const name = f.split('.')[0];
    if (name !== 'package' && name.length > 30) problems.push(`object name over 30 characters: ${name}`);
    if (/\.abap$/i.test(f)) {
      const long = fs.readFileSync(path.join(src, f), 'utf8').split(/\r?\n/).findIndex((l) => l.length > 255);
      if (long >= 0) problems.push(`line over 255 characters: ${f}:${long + 1}`);
    }
  }
  return problems;
}

export function adtRunner(opts: { runnerDir: string; owner: string; workRoot: string; email: string | null }): TrialRunner {
  const adt = path.join(opts.runnerDir, 'adt.mjs');
  const call = (args: string[]) => run(process.execPath, [adt, ...args], opts.runnerDir);
  return {
    push(pkgDir, target, label) {
      const problems = pushProblems(pkgDir);
      if (problems.length) return { ok: false, reason: problems.slice(0, 5).join('; ') };
      const work = path.join(opts.workRoot, target.repo);
      fs.rmSync(work, { recursive: true, force: true });
      fs.mkdirSync(work, { recursive: true });
      fs.copyFileSync(path.join(pkgDir, '.abapgit.xml'), path.join(work, '.abapgit.xml'));
      fs.cpSync(path.join(pkgDir, 'src'), path.join(work, 'src'), { recursive: true });
      const who = ['-c', 'user.name=Clean-Core.io acceptance', ...(opts.email ? ['-c', `user.email=${opts.email}`] : [])];
      for (const args of [
        ['init', '-q', '-b', 'main'],
        ['add', '-A'],
        [...who, 'commit', '-q', '-m', `${target.repo}: ${label}`],
        ['push', '-q', '-f', `https://github.com/${opts.owner}/${target.repo}.git`, 'main'],
      ]) {
        // The bytes as the package has them (no line-ending conversion), and a work folder deeper than Windows' 260 characters.
        const r = run('git', ['-c', 'core.autocrlf=false', '-c', 'core.longpaths=true', ...args], work, 300_000);
        if (r.code !== 0) return { ok: false, reason: `git ${args.find((a) => !a.startsWith('-') && !a.includes('=')) ?? ''}: ${errorLine(r.stderr).slice(0, 200)}` };
      }
      return { ok: true, reason: null };
    },
    pull(sapPackage) {
      const r = call(['pull', sapPackage]);
      if (r.code !== 0) return { ok: false, status: null, text: firstLine(r.stderr).slice(0, 200) };
      return parsePull(r.stdout);
    },
    activate(part) {
      const r = call(['activate', part]);
      const out = parseActivation(r.stdout);
      if (r.code !== 0) return { ...out, ok: false, failure: firstLine(r.stderr).slice(0, 200) };
      return out;
    },
    unit(cls) {
      const r = call(['unit', cls]);
      if (r.code !== 0) return { ok: false, methods: parseUnit(r.stdout).methods, failure: firstLine(r.stderr).slice(0, 200) };
      return parseUnit(r.stdout);
    },
  };
}

/* ------------------------------------------------------------- the stage */

/** `<program>-rap-<run>` → its parts; null for any other folder. */
export function keptPackageOf(dirName: string): { program: string; run: number } | null {
  const m = /^(.+)-rap-(\d+)$/.exec(dirName);
  return m ? { program: m[1], run: Number(m[2]) } : null;
}

/** A method of the runner's output as a method of an SAP run. */
export const sapMethodOf = (m: UnitMethod): SapUnitMethod => ({
  testClass: m.testClass,
  method: m.method,
  outcome: m.kind === 'green' ? 'passed' : m.kind === 'red' ? 'failed' : 'skipped',
  message: m.message || null,
});

const tally = (ms: readonly UnitMethod[]): UnitTally => ({
  green: ms.filter((m) => m.kind === 'green').length,
  red: ms.filter((m) => m.kind === 'red').length,
  skipped: ms.filter((m) => m.kind === 'skipped').length,
});

/** One kept package on the trial. */
export function trialRapPackage(pkgDir: string, program: string, runNo: number, runner: TrialRunner, opts: { targets?: Readonly<Record<string, TrialTarget>>; label: string }): TrialRecord {
  const targets = opts.targets ?? TRIAL_TARGETS;
  const target = targets[program] ?? null;
  const src = path.join(pkgDir, 'src');
  const files = fs.existsSync(src) ? fs.readdirSync(src) : [];
  const objects = new Set(files.map((f) => f.split('.')[0].toLowerCase()).filter((n) => n !== 'package')).size;
  const rec: TrialRecord = {
    program,
    run: runNo,
    sapPackage: target?.sapPackage ?? null,
    repo: target?.repo ?? null,
    state: 'not-run',
    reason: null,
    objects,
    pull: null,
    activation: null,
    engineUnit: { green: 0, red: 0, skipped: 0 },
    modelUnit: { green: 0, red: 0, skipped: 0 },
    red: [],
    classes: [],
  };
  if (!target) {
    rec.reason = TRIAL_NOT_IMPORTED[program] ?? `no trial package and repository for ${program} (TRIAL_TARGETS)`;
    return rec;
  }
  const logic = files.find((f) => /^zcl_\w+_logic\.clas\.abap$/i.test(f));
  if (!logic) {
    rec.reason = 'no logic class in src/: not a RAP package of the scaffold';
    return rec;
  }
  const stem = /^zcl_(\w+)_logic\./i.exec(logic)![1].toUpperCase();
  const pushed = runner.push(pkgDir, target, opts.label);
  if (!pushed.ok) {
    rec.state = 'failed';
    rec.reason = `push to ${target.repo} failed: ${pushed.reason}`;
    return rec;
  }
  rec.pull = runner.pull(target.sapPackage);
  if (!rec.pull.ok) {
    rec.state = 'failed';
    rec.reason = `pull into ${target.sapPackage} failed: ${rec.pull.text}`;
    return rec;
  }
  // Mass activation; a second pass for what the first left inactive (an object whose dependency activated with it).
  const passes: ActivationOutcome[] = [runner.activate(stem)];
  if (passes[0].ok && passes[0].stillInactive.length > 0) passes.push(runner.activate(stem));
  const lastPass = passes.at(-1)!;
  rec.activation = {
    passes: passes.length,
    activated: passes.reduce((s, p) => s + p.activated, 0),
    errors: lastPass.errors.length,
    warnings: lastPass.warnings,
    stillInactive: lastPass.stillInactive,
    messages: lastPass.errors.slice(0, 10),
  };
  if (!lastPass.ok) {
    rec.state = 'failed';
    rec.reason = `activation failed: ${lastPass.failure}`;
    return rec;
  }
  // `adt.mjs activate` exits 0 when SAP refuses the activation: it prints `activation: FAILED`, the errors and what
  // stayed inactive. ABAP Unit would then run on the objects active before.
  if (lastPass.success === false || lastPass.errors.length > 0 || lastPass.stillInactive.length > 0) {
    rec.state = 'failed';
    const what = [
      lastPass.success === false ? 'SAP refused it' : null,
      lastPass.errors.length ? `${lastPass.errors.length} error(s), first: ${lastPass.errors[0]}` : null,
      lastPass.stillInactive.length ? `still inactive: ${lastPass.stillInactive.slice(0, 5).join(', ')}` : null,
    ].filter(Boolean);
    rec.reason = `activation failed: ${what.join('; ')}`;
    return rec;
  }
  const testClasses = files.filter((f) => /\.clas\.testclasses\.abap$/i.test(f)).map((f) => f.split('.')[0]).sort();
  const all: UnitMethod[] = [];
  for (const cls of testClasses) {
    const u = runner.unit(cls.toUpperCase());
    all.push(...u.methods);
    rec.classes.push({ name: cls, ok: u.ok, failure: u.failure, ...tally(u.methods) });
  }
  rec.engineUnit = tally(all.filter((m) => isEngineTestClass(m.testClass)));
  rec.modelUnit = tally(all.filter((m) => !isEngineTestClass(m.testClass)));
  // The words of lib/testing-abap-unit.ts: a red method of the model's class is "AI-generated, red in SAP: …".
  rec.red = splitSapUnitRun(all.map(sapMethodOf)).red;
  rec.state = rec.classes.some((c) => !c.ok) ? 'failed' : 'ran';
  if (rec.state === 'failed') rec.reason = `ABAP Unit did not run on ${rec.classes.filter((c) => !c.ok).map((c) => c.name).join(', ')}: ${rec.classes.find((c) => !c.ok)!.failure}`;
  return rec;
}

/** Every kept RAP package under `packagesDir` (`<program>-rap-<run>` folders), in name order. */
export function keptRapPackages(packagesDir: string): Array<{ dir: string; program: string; run: number }> {
  if (!fs.existsSync(packagesDir)) return [];
  return fs
    .readdirSync(packagesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => ({ dir: path.join(packagesDir, d.name), ...keptPackageOf(d.name) }))
    .filter((x): x is { dir: string; program: string; run: number } => typeof x.program === 'string')
    .sort((a, b) => a.dir.localeCompare(b.dir));
}

export function trialTotals(records: readonly TrialRecord[]) {
  const ran = records.filter((r) => r.state === 'ran');
  return {
    packages: records.length,
    ran: ran.length,
    activated: ran.reduce((s, r) => s + (r.activation?.activated ?? 0), 0),
    activationErrors: records.reduce((s, r) => s + (r.activation?.errors ?? 0), 0),
    engine: { green: ran.reduce((s, r) => s + r.engineUnit.green, 0), red: ran.reduce((s, r) => s + r.engineUnit.red, 0), skipped: ran.reduce((s, r) => s + r.engineUnit.skipped, 0) },
    model: { green: ran.reduce((s, r) => s + r.modelUnit.green, 0), red: ran.reduce((s, r) => s + r.modelUnit.red, 0), skipped: ran.reduce((s, r) => s + r.modelUnit.skipped, 0) },
  };
}

const cell = (s: unknown) => String(s ?? '—').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

/** The report section: the numbers the CHANGELOG records per release (criterion 13). */
export function trialMarkdown(records: readonly TrialRecord[]): string[] {
  const L: string[] = ['## On the SAP trial (ADT runner)', ''];
  if (records.length === 0) return [...L, 'No RAP package was kept.', ''];
  const t = trialTotals(records);
  L.push(
    `**${t.ran} of ${t.packages} package(s) imported, activated and run · ${t.activated} object(s) activated, ${t.activationErrors} activation error(s) · ABAP Unit, engine classes (counted, C(7)): ${t.engine.green} green, ${t.engine.red} red, ${t.engine.skipped} skipped · the testing model's classes (a proposal, not evidence): ${t.model.green} green, ${t.model.red} red, ${t.model.skipped} skipped**`,
    '',
    '| Program | Run | Package · repository | Objects | Pull | Activated (passes) · errors | Engine green / red / skipped | AI-generated green / red / skipped | State |',
    '|---|---|---|---|---|---|---|---|---|',
  );
  for (const r of records) {
    const a = r.activation;
    L.push(
      `| ${r.program} | ${r.run} | ${r.sapPackage ?? '—'} · ${r.repo ?? '—'} | ${r.objects} | ${r.pull ? `${r.pull.status ?? '?'} ${cell(r.pull.text)}` : '—'} | ${a ? `${a.activated} (${a.passes}) · ${a.errors}${a.stillInactive.length ? `, still inactive ${a.stillInactive.length}` : ''}` : '—'} | ${r.engineUnit.green} / ${r.engineUnit.red} / ${r.engineUnit.skipped} | ${r.modelUnit.green} / ${r.modelUnit.red} / ${r.modelUnit.skipped} | ${r.state}${r.reason ? ` — ${cell(r.reason)}` : ''} |`,
    );
  }
  const reds = records.flatMap((r) => r.red.map((x) => `${r.program}: ${x}`));
  const errors = records.flatMap((r) => (r.activation?.messages ?? []).map((x) => `${r.program}: ${x}`));
  if (errors.length) L.push('', 'Activation errors:', ...errors.slice(0, 30).map((x) => `- ${cell(x)}`));
  if (reds.length) L.push('', 'Red methods:', ...reds.slice(0, 60).map((x) => `- ${cell(x)}`));
  L.push('');
  return L;
}
