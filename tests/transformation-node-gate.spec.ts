import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { typeCheckCandidate, typeCheckedPaths, CANDIDATE_TS_OPTIONS } from '../lib/test-sandbox/type-check';
import { assembleEngineLed, candidateFiles, guardBodyOf, normalizeBodyOf, prepareEngineLed, type EngineLedPrepared } from '../lib/transformation/engine-led';
import { runGeneration, unverifiedOf, type Verify } from '../lib/transformation/orchestrator';
import { createRunnerVerifier, mapTypeFindings, markerSpans, type VerifyRunAnswer } from '../lib/transformation/verify';
import { bundleFills } from '../lib/transformation/fill-prompt';
import { fillOrder } from '../lib/transformation/orchestrator';
import { FOREIGN_LINE_NOTE, markForeignLineRefs } from '../lib/transformation/markers';
import { typeCheckClosureRefusal, typeCheckRecordOf, withTypeCheck, type NodeTypeCheck } from '../lib/transformation/check-words';
import { storedGenerationRecord, storedTypeCheck } from '../lib/transformation/generation-record';
import { draftHeaderLine } from '../lib/transformation/decision-header';
import { againstDecisionOf } from '../lib/transformation-context';
import type { FillRequest } from '../lib/transformation/types';
import { fixture, poDemo, ROOT, runInPackage, writePackage, fileUrl } from './helpers/transformation-scaffold';

/**
 * Roadmap 3.0.13 — the Node route's honest gate (agent 6, "node core").
 *
 *   - A1: the candidate is type-checked with the package's own tsconfig.json (the runner only bundled it with
 *     esbuild, which checks no type); a type error goes back to the function that holds it, and a package with
 *     one is "generated — not runnable", in the record the server writes, whatever the page said.
 *   - A2/A5: "complete" only when the type check, the engine cases and the probes ran in full — a skipped or
 *     not-run case is never evidence; otherwise "generated — not verified: …".
 *   - A3: the original's structures are interfaces, its globals the typed `RunState.local`.
 *   - A4: the original's demo cases (golden master) run through the package's own process.
 *   - B4, B5, B6, B7: SAP identifiers in bodies checked, foreign line references marked, the decision header,
 *     no ABAP cut to fit a prompt.
 *
 * Server-free: the compiler runs in-process, as the routes run it.
 */

const SD_DESKTOP = 'C:/Users/felix/OneDrive/Desktop/SD_LE_Legacy_ABAP.txt';
const PM_DESKTOP = 'C:/Users/felix/OneDrive/Desktop/PM_Legacy_ABAP.txt';
const GM_FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'golden-master', 'three-cases.abap');

function prep(source: string, extra: { against?: { id: string; option: string } | null } = {}): EngineLedPrepared {
  const p = prepareEngineLed({ source, track: 'node', program: null, decisions: [], contextText: 'PLATFORM KNOWLEDGE (test)', ...extra });
  if (!p.ok) throw new Error(p.reason);
  return p;
}

const requestOf = (prompt: string): FillRequest => JSON.parse(prompt.slice(prompt.indexOf('REQUEST (JSON):\n') + 'REQUEST (JSON):\n'.length));

/** A body that type-checks in any step: the steps return StepResult, a predicate a boolean. */
const neutral = (returns: string) => (/boolean/.test(returns) ? 'return false;' : 'return;');

/* ------------------------------------------------------------------ A1, A3 */

test.describe('the scaffold alone type-checks with its own tsconfig.json, with typed structures and globals', () => {
  const sources: Array<[string, () => string]> = [
    ['PO demo', poDemo],
    ['co-shape', () => fixture('co-shape')],
    ['pp-shape', () => fixture('pp-shape')],
    ['sd-shape', () => fixture('sd-shape')],
    ['golden-master three-cases', () => fs.readFileSync(GM_FIXTURE, 'utf8')],
  ];
  for (const [name, source] of sources) {
    test(`${name}: 0 type errors`, () => {
      const p = prep(source());
      const r = typeCheckCandidate(p.scaffold.files);
      expect(r.ran, r.ran ? '' : r.reason).toBe(true);
      if (!r.ran) return;
      expect(r.files).toBe(typeCheckedPaths(p.scaffold.files).length);
      expect(r.findings, JSON.stringify(r.findings.slice(0, 5))).toEqual([]);
      expect(r.errors).toBe(0);
    });
  }

  // The real review programs live outside the repository (the SD source, and the PM holdout): checked where they are.
  for (const [name, file] of [['SD source', SD_DESKTOP], ['PM holdout', PM_DESKTOP]] as const) {
    test(`${name} (local file): 0 type errors`, () => {
      test.skip(!fs.existsSync(file), `${file} is not on this machine — the repository's fixtures above stand for it`);
      const p = prep(fs.readFileSync(file, 'utf8'));
      const r = typeCheckCandidate(p.scaffold.files);
      expect(r.ran && r.errors).toBe(0);
    });
  }

  test('the compiler options are the package’s own tsconfig.json', () => {
    const p = prep(poDemo());
    const tsconfig = JSON.parse(p.scaffold.files.find((f) => f.path === 'tsconfig.json')!.content);
    expect(tsconfig.compilerOptions).toEqual(JSON.parse(JSON.stringify(CANDIDATE_TS_OPTIONS)));
  });

  test('typed records per source structure, typed globals, a fresh state per run', () => {
    const p = prep(fixture('sd-shape'));
    const types = p.scaffold.files.find((f) => f.path === 'srv/lib/types.ts')!.content;
    // RunState.local is no longer Record<string, unknown>.
    expect(types).toContain('  local: Locals;');
    expect(types).not.toMatch(/local: Record<string, unknown>/);
    expect(types).toMatch(/export interface Locals \{[\s\S]*?\n\}/);
    expect(types).toContain('export function initialLocals(): Locals {');
    // Every structure of the original is an interface; every record field names its structure.
    const structures = [...fixture('sd-shape').matchAll(/BEGIN OF (\w+)/gi)].map((m) => m[1].toLowerCase());
    expect(structures.length).toBeGreaterThan(0);
    for (const s of new Set(structures)) expect(types, s).toMatch(new RegExp(`/\\*\\* ${s.toUpperCase()} — the original's structure, L\\d+–\\d+`));
    const rec = /export interface Rec \{([\s\S]*?)\n\}/.exec(types)![1];
    for (const line of rec.split('\n').filter((l) => l.includes('/**'))) expect(line).toMatch(/, of [A-Z_]+\. \*\//);
    // A run starts every global at its initial value.
    const process = p.scaffold.files.find((f) => f.path === 'srv/process.ts')!.content;
    expect(process).toContain('local: { ...initialLocals(), ...seed }');
  });

  test('a body that reads a field its row does not have is a type error — the typed globals make it one', () => {
    const p = prep(fs.readFileSync(GM_FIXTURE, 'utf8'));
    const types = p.scaffold.files.find((f) => f.path === 'srv/lib/types.ts')!.content;
    expect(types).toMatch(/gtClaims: \w+\[\];/);
    const step = p.fillUnits.find((u) => /StepResult/.test(u.function.signature))!;
    const bodies = new Map([[step.unitId, 'const first = st.local.gtClaims[0];\n  if (first && first.pirce) return;\n  return;']]);
    const r = typeCheckCandidate(candidateFiles(p, bodies));
    expect(r.ran && r.findings.map((f) => f.code)).toContain('TS2551');
  });
});

/* -------------------------------------------- A1: the error is the unit's repair reason */

test('a body with a type error makes the generation not runnable, and the error is that unit’s repair reason', async () => {
  const p = prep(fixture('sd-shape'));
  const broken = p.fillUnits.find((u) => /StepResult/.test(u.function.signature) && !(p.scaffold.required[u.unitId]?.length))!;
  expect(broken).toBeTruthy();
  const repairsSeen: string[] = [];
  // The route's half, in-process: the type check of every candidate, cases and probes passed (not the subject here).
  const runOnRunner = async (files: readonly { path: string; content: string }[]): Promise<VerifyRunAnswer> => {
    const t = typeCheckCandidate(files);
    return {
      mode: 'verify',
      buildError: null,
      types: t.ran ? { ran: true, typescript: t.typescript, files: t.files, failedFiles: t.failedFiles, errors: t.errors, findings: t.findings } : t,
      engine: { ran: true, results: [{ id: 'TC_ENG_1', status: 'Passed' }], cases: [{ id: 'TC_ENG_1', ruleId: null, scope: 'fills' }] },
      probes: { ran: true, results: [{ id: 'PRB_x', status: 'Passed' }], skipped: [] },
    };
  };
  let last: Parameters<NonNullable<Parameters<typeof createRunnerVerifier>[0]['onTypeCheck']>>[0] = null;
  const verify = createRunnerVerifier({
    track: 'node',
    candidate: (bodies) => candidateFiles(p, bodies),
    units: p.fillUnits.map((u) => ({ unitId: u.unitId, rules: u.rules.map((r) => r.id) })),
    runOnRunner,
    onTypeCheck: (t) => {
      last = t;
    },
  });
  const result = await runGeneration({
    units: p.fillUnits,
    plan: p.plan.units,
    bundleOptions: { track: 'node', program: p.plan.program, context: 'x' },
    model: async (prompt) => {
      const req = requestOf(prompt);
      for (const r of req.repair ?? []) repairsSeen.push(`${r.unitId}: ${r.failure}`);
      return JSON.stringify({
        units: req.units.map((u) => ({
          unitId: u.unitId,
          body: u.unitId === broken.unitId ? "const total: number = sel;\n  void total;\n  return;" : neutral(u.function.returns),
          needs: [],
        })),
      });
    },
    guardBody: guardBodyOf(p),
    verify,
    mustRun: ['types', 'cases', 'probes'],
    budget: 48,
    sleep: async () => {},
  });
  const u = result.units.find((x) => x.unitId === broken.unitId)!;
  expect(u.state).toBe('written');
  expect(u.failures.join('\n')).toMatch(/^types: the TypeScript compiler \(the package's own tsconfig\.json\) does not accept this body — 1 type error: body line 1 — TS2322 /m);
  // The repair round sent exactly that reason back to the model, for that unit only.
  expect(repairsSeen.some((r) => r.startsWith(`${broken.unitId}: `) && /^types: the TypeScript compiler .* TS2322 /m.test(r))).toBe(true);
  expect(repairsSeen.every((r) => r.startsWith(`${broken.unitId}: `) || !r.includes('TS2322'))).toBe(true);
  expect(result.status).not.toBe('complete');
  // The package: not runnable, whatever else holds.
  const pkg = assembleEngineLed(p, result, { checks: [], budget: 48, typeCheck: typeCheckRecordOf(last) });
  expect(pkg.summary.status).toBe('not-runnable');
  expect(pkg.files.find((f) => f.path === 'TRACE.md')!.content).toContain('generated — not runnable');
});

test('the verifier maps a type error by its body line; one in engine code is a scaffold finding', () => {
  const p = prep(fixture('co-shape'));
  const u = p.fillUnits[0];
  const files = candidateFiles(p, new Map([[u.unitId, 'return;']]));
  // The unit's own body, not one of its checks' predicates (those are named by the check since 3.0.14).
  const span = markerSpans(files).find((s) => s.unitId === u.unitId && !s.guard)!;
  const failures = mapTypeFindings(
    [
      { path: span.path, line: span.beginLine + 1, code: 'TS2339', message: "Property 'x' does not exist on type 'Selection'." },
      { path: 'srv/app.ts', line: 3, code: 'TS2304', message: "Cannot find name 'y'." },
    ],
    markerSpans(files),
  );
  expect(failures[0]).toEqual({ unitId: u.unitId, check: 'types', failure: expect.stringContaining("body line 1 — TS2339 Property 'x' does not exist") });
  expect(failures[1]).toMatchObject({ unitId: null, check: 'types' });
});

/* ------------------------------------------------- A2, A5: not run is never complete */

test.describe('cases and probes that did not run keep the generation from complete', () => {
  const written = (verify: Verify, mustRun?: Array<'types' | 'cases' | 'probes'>) =>
    runGeneration({
      units: [{ unitId: 'U01', function: { name: 'f', file: 'srv/f.ts', signature: 'export function f(): void', returns: 'void' }, abap: { ranges: [{ lineStart: 1, lineEnd: 2, routine: 'F' }], text: '0001 FORM f.' }, rules: [], guards: [], facts: { decimals: [] }, available: { helpers: [], callees: [] } }],
      bundleOptions: { track: 'node', program: 'Z', context: '' },
      model: async (prompt) => JSON.stringify({ units: requestOf(prompt).units.map((x) => ({ unitId: x.unitId, body: 'return;', needs: [] })) }),
      guardBody: () => null,
      verify,
      ...(mustRun ? { mustRun } : {}),
      budget: 8,
      sleep: async () => {},
    });

  test('the runner not reachable: cases and probes not run — partial, and said', async () => {
    const verify = createRunnerVerifier({
      track: 'node',
      candidate: () => [],
      units: [{ unitId: 'U01', rules: [] }],
      runOnRunner: async () => {
        throw new Error('ECONNREFUSED');
      },
    });
    const r = await written(verify, ['types', 'cases', 'probes']);
    expect(r.units[0].state).toBe('written');
    expect(r.status).toBe('partial');
    expect(r.unverified).toEqual([
      'type check not run — Type check not run: the verify route did not answer (ECONNREFUSED)',
      'engine cases not run — Engine cases and probes not run: the test runner is not reachable (ECONNREFUSED). Run them in Testing',
      'failure-pattern probes not run — Engine cases and probes not run: the test runner is not reachable (ECONNREFUSED). Run them in Testing',
    ]);
    // The gate is the list of checks that must run: without it the old rule held, and this read "complete".
    expect((await written(verify)).status).toBe('complete');
  });

  test('skipped engine cases ran only in part — never evidence', async () => {
    const verify: Verify = async () => ({
      checks: [
        { kind: 'types', total: 3, failed: 0, passed: 3, notRun: 0, ms: 1 },
        { kind: 'cases', scope: 'fills', total: 26, failed: 0, passed: 0, notRun: 26, notRunReason: 'no valid base value known for P_BANFN', ms: 1 },
        { kind: 'probes', scope: 'fills', total: 2, failed: 0, passed: 2, notRun: 0, ms: 1 },
      ],
      failures: [],
      notRun: [],
    });
    const r = await written(verify, ['types', 'cases', 'probes']);
    expect(r.status).toBe('partial');
    expect(r.unverified).toEqual(['engine cases: 26 of 26 not run — no valid base value known for P_BANFN']);
  });

  test('everything ran in full: complete', () => {
    expect(
      unverifiedOf(['types', 'cases', 'probes'], [
        { kind: 'types', total: 3, failed: 0, passed: 3, notRun: 0, ms: 1 },
        { kind: 'cases', total: 2, failed: 0, passed: 2, notRun: 0, ms: 1 },
        { kind: 'probes', total: 1, failed: 0, passed: 1, notRun: 0, ms: 1 },
      ], []),
    ).toEqual([]);
  });

  test('the package of such a run is "generated — not verified", and its words say what did not run', async () => {
    // A program whose functions call no check themselves: every body here is spliced, nothing is a stub.
    const p = prep(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'transformation', 'probe-shape.abap'), 'utf8'));
    const result = await runGeneration({
      units: p.fillUnits,
      plan: p.plan.units,
      bundleOptions: { track: 'node', program: p.plan.program, context: 'x' },
      model: async (prompt) => JSON.stringify({ units: requestOf(prompt).units.map((u) => ({ unitId: u.unitId, body: neutral(u.function.returns), needs: [] })) }),
      guardBody: () => null,
      verify: async () => ({ checks: [{ kind: 'types', total: 1, failed: 0, passed: 1, notRun: 0, ms: 1 }], failures: [], notRun: [{ kind: 'cases', reason: 'Engine cases not run: the runner is not configured.' }] }),
      mustRun: ['types', 'cases'],
      budget: 48,
      sleep: async () => {},
    });
    const tc: NodeTypeCheck = { v: 1, typescript: '5.9.3', config: 'shipped', files: 1, failedFiles: 0, errors: 0, runnable: true, findings: [] };
    const pkg = assembleEngineLed(p, result, { checks: [], budget: 48, typeCheck: tc });
    expect(pkg.summary.status).toBe('not-verified');
    expect(pkg.summary.unverified).toEqual(['engine cases not run — Engine cases not run: the runner is not configured']);
    expect(pkg.files.find((f) => f.path === 'TRACE.md')!.content).toContain('generated — not verified: engine cases not run');
    // The shipped engine-case test says a case that did not run is not evidence.
    expect(p.scaffold.files.find((f) => f.path === 'test/engine-cases.test.mjs')!.content).toContain("t.skip('NOT RUN - not evidence: ' + r.reason)");
  });
});

/* ------------------------------------------------ the server's record and Testing */

test.describe('the server type-checks the stored Node package; its result is the status', () => {
  const engine = { status: 'complete', notWritten: [], checks: [{ kind: 'tsc', total: 9, failed: 0 }], notRun: [] as Array<{ kind: string; reason: string }> };
  const failing: NodeTypeCheck = { v: 1, typescript: '5.9.3', config: 'shipped', files: 40, failedFiles: 2, errors: 3, runnable: false, findings: [{ path: 'srv/steps/u01.ts', line: 9, code: 'TS2339', message: 'x' }] };

  test('errors make it not runnable whatever the page sent; a check that did not run leaves it not verified', () => {
    expect(withTypeCheck(engine, failing).status).toBe('not-runnable');
    expect(withTypeCheck(engine, failing).checks).toEqual([{ kind: 'tsc', total: 40, failed: 2, passed: 38, notRun: 0 }]);
    const notRun = withTypeCheck(engine, null, 'Type check not run: the compiler could not be loaded.');
    expect(notRun.status).toBe('not-verified');
    expect(notRun.notRun).toEqual([{ kind: 'tsc', reason: 'Type check not run: the compiler could not be loaded.' }]);
    // The page said not runnable, the server compiles it: the functions' status again.
    expect(withTypeCheck({ ...engine, status: 'not-runnable' }, { ...failing, errors: 0, failedFiles: 0, runnable: true }).status).toBe('complete');
  });

  test('the store route runs it on an engine-led Node package; the record reads it back; Testing cannot be closed on it', () => {
    const route = fs.readFileSync(path.join(ROOT, 'app', 'api', 'projects', '[projectId]', 'contract', 'route.ts'), 'utf8');
    expect(route).toContain("(await import('@/lib/test-sandbox/type-check')).typeCheckCandidate(");
    expect(route).toContain('words.withTypeCheck(record.engine, typeCheck, typed.ran ? null : typed.reason)');
    const binding = { path: 'engine-led', engine: { ...engine, status: 'not-runnable', units: 1, written: 1, repaired: 0, failing: [], scaffoldFindings: [], callsUsed: 1, budget: 4, rounds: 0, stop: 'passed', scaffoldVersion: 1, scaffoldDigest: 'a'.repeat(64), planDigest: 'b'.repeat(64) }, typeCheck: failing };
    expect(storedTypeCheck(binding)).toEqual(failing);
    expect(storedGenerationRecord(binding)?.engine?.status).toBe('not-runnable');
    expect(typeCheckClosureRefusal(storedTypeCheck(binding))).toMatch(/^Testing cannot be closed: the stored package is generated — not runnable: 3 type errors in 2 files \(TypeScript 5\.9\.3/);
  });

  test('the verify route type-checks a Node candidate before it asks the runner, and keeps the check when the runner cannot run', () => {
    const route = fs.readFileSync(path.join(ROOT, 'app', 'api', 'run-tests', 'route.ts'), 'utf8');
    const fn = route.slice(route.indexOf('async function verifyCandidateResponse'));
    expect(fn.indexOf('typeCheckCandidate(candidate)')).toBeGreaterThan(fn.indexOf('if (isAbapPackage(candidate))'));
    expect(fn.indexOf('typeCheckCandidate(candidate)')).toBeLessThan(fn.indexOf("resolveRunnerTarget('mock'"));
    expect((fn.match(/\btypes,\r?\n/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  test('the compiler and the Node types are production dependencies: the server loads them at run time', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));
    for (const name of ['typescript', '@types/node']) {
      expect(pkg.dependencies[name], name).toBeTruthy();
      expect(pkg.devDependencies?.[name], name).toBeUndefined();
      expect(lock.packages[`node_modules/${name}`].dev, name).toBeUndefined();
      expect(lock.packages[`node_modules/${name}`].devOptional, name).toBeUndefined();
    }
  });
});

/* ------------------------------------------------------------- B7 */

test.describe('no unit loses ABAP text to fit a prompt (B7)', () => {
  const ordered = (p: EngineLedPrepared) => fillOrder(p.plan.units).map((id) => p.fillUnits.find((u) => u.unitId === id)!).filter(Boolean);
  const context = Array.from({ length: 40 }, (_, i) => `- platform fact ${i}: ${'k'.repeat(50)}`).join('\n');

  for (const [name, source] of [['PO demo', poDemo], ['sd-shape', () => fixture('sd-shape')], ['pp-shape', () => fixture('pp-shape')]] as const) {
    test(`${name}: every unit's whole slice in its call`, () => {
      const p = prep(source());
      for (const b of bundleFills(ordered(p), { track: 'node', program: p.plan.program, context })) {
        for (const u of b.request.units) expect(u.abap.text).toBe(p.fillUnits.find((x) => x.unitId === u.unitId)!.abap.text);
        expect(b.prompt).not.toContain('cut to fit the prompt budget');
      }
    });
  }

  test('SD source (local file): no unit loses ABAP text, none loses platform knowledge', () => {
    test.skip(!fs.existsSync(SD_DESKTOP), `${SD_DESKTOP} is not on this machine`);
    const p = prep(fs.readFileSync(SD_DESKTOP, 'utf8'));
    const bundles = bundleFills(ordered(p), { track: 'node', program: p.plan.program, context });
    expect(bundles.flatMap((b) => b.unitIds).sort()).toEqual(p.fillUnits.map((u) => u.unitId).sort());
    for (const b of bundles) {
      for (const u of b.request.units) expect(u.abap.text, u.unitId).toBe(p.fillUnits.find((x) => x.unitId === u.unitId)!.abap.text);
      expect(b.trimmed, b.unitIds.join(',')).toEqual([]);
      expect(b.prompt).toContain('platform fact 39');
    }
  });
});

/* ------------------------------------------------------------- B5, B6, B4 */

test('B5: a line reference outside the function’s lines is marked in its comment; code and strings stay', () => {
  const allowed = new Set([500, 501, 502, 540]);
  const body = "// L500–540: the totals (L812 is the caller)\nconst rule = 'L812';\n/* see line 501 and L77 */\nreturn;";
  const r = markForeignLineRefs(body, 'node', allowed);
  expect(r.marked).toEqual(['L812', 'L77']);
  expect(r.body).toBe(`// L500–540: the totals (L812${FOREIGN_LINE_NOTE} is the caller)\nconst rule = 'L812';\n/* see line 501 and L77${FOREIGN_LINE_NOTE} */\nreturn;`);
  expect(markForeignLineRefs(r.body, 'node', allowed).body).toBe(r.body);
  const abap = markForeignLineRefs("\" checks L900\nIF lv_x = 'L900'. ENDIF.", 'rap', allowed);
  expect(abap.body).toBe(`" checks L900${FOREIGN_LINE_NOTE}\nIF lv_x = 'L900'. ENDIF.`);
  // The orchestrator's hook uses the lines the unit was given.
  const p = prep(fixture('co-shape'));
  const u = p.fillUnits[0];
  const first = u.abap.ranges[0].lineStart;
  expect(normalizeBodyOf(p)(u.unitId, `// L${first} and L99999\nreturn;`)).toBe(`// L${first} and L99999${FOREIGN_LINE_NOTE}\nreturn;`);
});

test('B6: a rebuild against a live decision on record says so in the first line of every main file, on both routes', () => {
  const decision = { decisionId: 'DR-7', revision: 2, status: 'confirmed', summary: 's', bindings: [{ key: 'option', revision: 'Retire the program' }] };
  const against = againstDecisionOf(decision);
  expect(against).toEqual({ id: 'DR-7', option: 'retire' });
  const p = prep(fixture('co-shape'), { against });
  for (const f of p.scaffold.files.filter((x) => /\.(?:ts|mjs)$/.test(x.path))) expect(f.content.split('\n')[0], f.path).toBe('// DRAFT AGAINST THE DECISION ON RECORD (DR-7): retire');
  expect(typeCheckCandidate(p.scaffold.files)).toMatchObject({ ran: true, errors: 0 });
  const rap = prepareEngineLed({ source: fixture('co-shape'), track: 'rap', program: null, decisions: [], contextText: '', against });
  if (!rap.ok) throw new Error(rap.reason);
  for (const f of rap.scaffold.files.filter((x) => x.path.endsWith('.abap'))) expect(f.content.split('\n')[0], f.path).toBe(draftHeaderLine(against!, '"'));
  // A rebuild decided on record writes no such line.
  expect(againstDecisionOf({ ...decision, bindings: [{ key: 'option', revision: 'Rebuild on BTP' }] })).toBeNull();
  expect(prep(fixture('co-shape')).scaffold.files.some((f) => f.content.startsWith('// DRAFT AGAINST'))).toBe(false);
});

test('B4: an SAP identifier a body names that SAP’s sources do not confirm is a finding of that function', async () => {
  const p = prep(fixture('co-shape'));
  const u = p.fillUnits.find((x) => /StepResult/.test(x.function.signature))!;
  const result = await runGeneration({
    units: p.fillUnits,
    plan: p.plan.units,
    bundleOptions: { track: 'node', program: p.plan.program, context: 'x' },
    model: async (prompt) =>
      JSON.stringify({
        units: requestOf(prompt).units.map((x) => ({ unitId: x.unitId, body: x.unitId === u.unitId ? '// Replaced by the Fiori app F9999 (Manage Credit Limits)\nreturn;' : neutral(x.function.returns), needs: [] })),
      }),
    guardBody: () => null,
    verify: async () => ({ checks: [], failures: [], notRun: [] }),
    budget: 48,
    sleep: async () => {},
  });
  const pkg = assembleEngineLed(p, result, { checks: [], budget: 48 });
  expect(pkg.summary.sapIds).toEqual([expect.objectContaining({ unitId: u.unitId, id: 'F9999' })]);
  expect(pkg.files.find((f) => f.path === 'TRACE.md')!.content).toContain('SAP identifiers to check: F9999');
});

/* ------------------------------------------------------------- A4 */

test('A4: the original’s demo cases are the package’s fixture, and each runs through the package’s own process', () => {
  const source = fs.readFileSync(GM_FIXTURE, 'utf8');
  const p = prep(source);
  const json = JSON.parse(p.scaffold.files.find((f) => f.path === 'test/fixtures/original-demo.json')!.content);
  expect(json.format).toBe('clean-core.original-demo/1');
  expect(json.cases.map((c: { number: number }) => c.number)).toEqual([0, 1, 2]);
  expect(p.scaffold.files.find((f) => f.path === 'test/original-demo.test.mjs')!.content).toContain('(from the original, confirm once)');
  // Run on the scaffold as it is: every function a stub, so each case runs into one — run, not complete.
  const files = candidateFiles(p, new Map());
  const dir = writePackage(files, 'cc-node-demo-');
  try {
    const runs = runInPackage<Array<{ n: number; state: string; complete?: boolean; notFilled?: string[]; claims?: number }>>(
      dir,
      `const f = await import(${JSON.stringify(fileUrl(dir, 'srv/fixtures.ts'))});
       // srv/fixtures.ts reads no file since 3.0.14 (item 3): the case data is the JSON beside the test.
       const demo = JSON.parse((await import('node:fs')).readFileSync(new URL(${JSON.stringify(fileUrl(dir, 'test/fixtures/original-demo.json'))}), 'utf8'));
       console.log(JSON.stringify(demo.cases.map((c) => { const r = f.runDemoCase(demo, c); return { n: c.number, state: r.state, ...(r.state === 'ran' ? { complete: r.outcome.complete, notFilled: r.outcome.notFilled, claims: r.outcome.state.local.gtClaims.length } : {}) }; })));`,
    );
    expect(runs.map((r) => r.state)).toEqual(['ran', 'ran', 'ran']);
    expect(runs.every((r) => r.complete === false && (r.notFilled ?? []).length > 0)).toBe(true);
    // The case's tables are the run's globals: the baseline holds three claims.
    expect(runs[0].claims).toBe(3);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
