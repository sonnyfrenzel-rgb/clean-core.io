import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { assembleEngineLed, candidateFiles, guardBodyOf, prepareEngineLed, repairBodyOf, type EngineLedPrepared } from '../lib/transformation/engine-led';
import { runGeneration, type FillModel } from '../lib/transformation/orchestrator';
import { FINAL_PERIOD_NOTE, FINAL_PERIOD_REASON } from '../lib/transformation/markers';
import { withTrace } from '../lib/transformation/trace';
import { SCAFFOLD_VERSION } from '../lib/transformation/types';
import { deriveEngineCases, replacedWhenInitial } from '../lib/testing-engine-cases';
import { testFailureFacts, testFailureFactsBlock } from '../lib/test-failure-facts';
import { geminiTestStubFillText } from '../lib/gemini-test-stub';
import { fileUrl, poDemo, ROOT, runInPackage, writePackage } from './helpers/transformation-scaffold';

/**
 * Roadmap 3.0.17 criterion (3): every defect a trial run shows becomes a fix with a test that fails without it.
 *
 * The trial run of the 1,000-line starter example (ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC, CAP/Node, 18.10.2026):
 *   1. FORM INITIALIZE_RUN clears GT_ORDERS before FORM SELECT_ORDERS fills it by its SELECT; the package seeded the
 *      request's rows at run start, the model ported the CLEAR faithfully, and every valid request ran with no
 *      orders. The rows now reach the table where the SELECT fills it (scaffold version 16).
 *   2. Every verification ran against the fail-closed authorization seam, and every report said "the mapping does
 *      not fit the code". The checks now run with the seam granted for the test, one case proves the seam refuses
 *      without the grant, and a refusal by the authorization check is named as such.
 *   3. "A missing value is not zero" demanded a refusal of a missing P_LIM, which the original replaces itself.
 *   4. A refusal read "L188: L188, L188: p_days LT 0": the line is named once.
 * And the RAP route (QM run on dev, FI holdout): a body whose last statement lacked its period was left a stub; the
 * engine adds the period when that is the only defect, and says so.
 *
 * Server-free.
 */

const EXAMPLE = path.join(ROOT, 'public', 'starter-examples', 'ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap');
const FREIGHT = path.join(ROOT, 'public', 'starter-examples', 'Z_SD_FREIGHT_RATE_CHECK.abap');
const read = (file: string) => fs.readFileSync(file, 'utf8');

function prepared(source: string, track: 'node' | 'rap' = 'node'): EngineLedPrepared {
  const p = prepareEngineLed({ source, track, program: null, decisions: [], contextText: 'PLATFORM KNOWLEDGE (test)' });
  if (!p.ok) throw new Error(p.reason);
  return p;
}

const unitOf = (p: EngineLedPrepared, routine: string) => {
  const u = p.plan.units.find((x) => x.routine?.toUpperCase() === routine);
  if (!u) throw new Error(`no unit for ${routine}`);
  return u;
};

const fileOf = (files: ReadonlyArray<{ path: string; content: string }>, p: string) => {
  const f = files.find((x) => x.path === p);
  if (!f) throw new Error(`no ${p}`);
  return f.content;
};

test.describe('the trial run of the 1,000-line starter example (3.0.17 criterion 3)', () => {
  test('defect 1: the request\'s orders and items reach the steps although the run clears the tables first', () => {
    test.setTimeout(180_000);
    expect(SCAFFOLD_VERSION).toBe(16);
    const p = prepared(read(EXAMPLE));
    const orchestrator = p.plan.units.find((u) => u.kind === 'orchestrator')!;
    const selectOrders = unitOf(p, 'SELECT_ORDERS');
    const selectItems = unitOf(p, 'SELECT_ITEMS');
    // The frame of each step that holds the SELECT puts the rows there — after the step's own entry check (G-0251).
    const items = fileOf(p.scaffold.files, selectItems.file);
    expect(fileOf(p.scaffold.files, selectOrders.file)).toContain("if (st.handedIn.gtOrders) { st.local.gtOrders = st.handedIn.gtOrders.map((r) => ({ ...r })); st.placed.add(\"gtOrders\"); }");
    expect(items.indexOf('stop_G0251(sel, st, null)')).toBeLessThan(items.indexOf('if (st.handedIn.gtItems) { st.local.gtItems'));
    expect(items.indexOf('if (st.handedIn.gtItems)')).toBeLessThan(items.indexOf(`@cc-fill BEGIN ${selectItems.id}`));
    const contract = fileOf(p.scaffold.files, 'srv/lib/input-contract.ts');
    expect(contract).toContain('return { gtOrders: inputs.orders, gtItems: inputs.items };');
    expect(contract).toMatch(/export function seedOf\(inputs: Inputs\): Partial<Locals> \{\n {2}return \{ dbMara: inputs\.mara/);

    // The model's run order, as it wrote it on the trial: the CLEAR of FORM INITIALIZE_RUN, then the SELECT steps.
    const bodies = new Map<string, string>([
      [
        orchestrator.id,
        [
          'st.local.gtOrders = [];',
          'st.local.gtItems = [];',
          `let res = ${selectOrders.fn}(sel, st);`,
          'if (res) return res;',
          `res = ${selectItems.fn}(sel, st);`,
          'if (res) return res;',
          'st.result.orders = st.local.gtOrders.map((o) => o.vbeln);',
          'st.result.items = st.local.gtItems.map((i) => i.posnr);',
        ].join('\n'),
      ],
      [selectOrders.id, 'return;'],
      [selectItems.id, 'return;'],
    ]);
    for (const id of [orchestrator.id, selectOrders.id, selectItems.id]) expect(guardBodyOf(p)(id, bodies.get(id)!, []), id).toBeNull();
    const dir = writePackage(candidateFiles(p, bodies), 'cc-3017-select-');
    try {
      type Answer = { ok: boolean; errors: unknown[]; result: { orders?: string[]; items?: string[] } | null };
      const answer = runInPackage<Answer>(
        dir,
        [
          `const { CONTRACT } = await import(${JSON.stringify(fileUrl(dir, 'srv/engine-contract.ts'))});`,
          `const { simulateRequest } = await import(${JSON.stringify(fileUrl(dir, 'srv/simulate.ts'))});`,
          `const { createRunStore } = await import(${JSON.stringify(fileUrl(dir, 'srv/lib/run-store.ts'))});`,
          "const request = { ...CONTRACT.baseRequest, orders: [{ vbeln: '0000000001' }, { vbeln: '0000000002' }], items: [{ vbeln: '0000000001', posnr: '000010' }, { vbeln: '0000000002', posnr: '000020' }] };",
          'const a = simulateRequest(request, createRunStore());',
          'console.log(JSON.stringify({ ok: a.ok, errors: a.errors, result: a.run ? a.run.result.result : null }));',
        ].join('\n'),
      );
      expect(answer.errors).toEqual([]);
      expect(answer.ok).toBe(true);
      expect(answer.result?.orders).toEqual(['0000000001', '0000000002']);
      expect(answer.result?.items).toEqual(['000010', '000020']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('defect 1: TRACE.md and STATUS.md say where the rows go and that the SELECT\'s WHERE is not applied; a folded SELECT keeps the start', () => {
    const p = prepared(read(EXAMPLE));
    const { files } = withTrace(p.plan, p.scaffold, p.scaffold.files, []);
    const trace = fileOf(files, 'TRACE.md');
    expect(trace).toContain("- Input lists a SELECT of the original fills — the request's rows stand for what it reads: orders ← GT_ORDERS: its rows reach the table where the SELECT fills it (L228 in selectOrders, U04)");
    expect(trace).toContain('The handed-in rows are not filtered by the SELECT\'s WHERE (its selection, date or row limit)');
    const status = fs.readFileSync(path.join(ROOT, 'lib', 'delivery-package.ts'), 'utf8');
    expect(status).toContain("The SELECT's WHERE (its selection, date or row limit) is not applied to rows handed in");

    // The side-by-side example reads its deliveries in a routine folded into the run order: they start the run, as before.
    const f = prepared(read(FREIGHT));
    const contract = fileOf(f.scaffold.files, 'srv/lib/input-contract.ts');
    expect(contract).toMatch(/export function seedOf\(inputs: Inputs\): Partial<Locals> \{\n {2}return \{ gtDeliveries: inputs\.deliveries,/);
    expect(contract).toMatch(/export function handedInOf\(inputs: Inputs\): Partial<Locals> \{\n {2}void inputs;\n {2}return \{\};/);
    const freightTrace = fileOf(withTrace(f.plan, f.scaffold, f.scaffold.files, []).files, 'TRACE.md');
    expect(freightTrace).toContain('deliveries ← GT_DELIVERIES: its rows start the run in the table — the SELECT at L104 is in a routine folded into the run order (runSteps, U00), which has no step of its own');
  });

  test('defect 2: the checks run with the seam granted, the seam refuses without it, and a refusal names the authorization check', () => {
    test.setTimeout(180_000);
    // Every driver grants explicitly; the generated test says so in its output.
    for (const rel of ['lib/test-sandbox/engine-suite.ts', 'lib/test-sandbox/probe-suite.ts', 'scripts/acceptance/child/executor.mjs']) {
      expect(fs.readFileSync(path.join(ROOT, rel), 'utf8'), rel).toContain('authorityGrant: true,');
    }
    const p = prepared(read(EXAMPLE));
    const cases = JSON.parse(fileOf(p.scaffold.files, 'test/engine-cases.json')).cases as Array<{ id: string; name: string; kind: string }>;
    const seam = cases.find((c) => c.kind === 'guard-authority-closed');
    expect(seam?.name).toBe('Without the authorization, the AUTHORITY-CHECK at L197 (object V_VBAK_VKO) refuses the run (the check at L200)');
    const testFile = fileOf(p.scaffold.files, 'test/engine-cases.test.mjs');
    expect(testFile).toContain("process.env.CC_AUTHORITY_DEMO = 'grant';");
    expect(testFile).toContain('# authorization: every AUTHORITY-CHECK of the original is granted for this test run');
    // A package without AUTHORITY-CHECK grants nothing.
    const noChecks = prepared(read(path.join(ROOT, 'tests', 'fixtures', 'transformation', 'sd-shape.abap')));
    expect(fileOf(noChecks.scaffold.files, 'test/engine-cases.test.mjs')).not.toContain('CC_AUTHORITY_DEMO');

    // The refusal names its check once (defect 4 too).
    const guards = fileOf(p.scaffold.files, 'srv/lib/guards.ts');
    expect(guards).toContain(`message: "L200: the authorization check at L197 (AUTHORITY-CHECK OBJECT 'V_VBAK_VKO', srv/lib/authority.ts) refused — sy-subrc <> 0 — MESSAGE e001 WITH 'Missing sales order authorization'"`);

    // Run the cases the way the generated test does, with and without the grant.
    const authority = unitOf(p, 'AUTHORITY_CHECK');
    const orchestrator = p.plan.units.find((u) => u.kind === 'orchestrator')!;
    const bodies = new Map<string, string>([
      [orchestrator.id, `const res = ${authority.fn}(sel, st);\nif (res) return res;`],
      [
        authority.id,
        [
          'const denied = guard_G0200(sel, st, null, { sySubrc: authority_L197() });',
          'if (denied) return denied;',
          'if (sel.upd) {',
          '  const change = guard_G0208(sel, st, null, { sySubrc: authority_L205() });',
          '  if (change) return change;',
          '}',
        ].join('\n'),
      ],
    ]);
    expect(guardBodyOf(p)(authority.id, bodies.get(authority.id)!, [])).toBeNull();
    for (const g of p.plan.guards.filter((x) => x.unitId === authority.id && x.regionId && p.scaffold.regions.some((r) => r.regionId === x.regionId))) bodies.set(g.regionId!, 'return values.sySubrc !== 0;');
    const dir = writePackage(candidateFiles(p, bodies), 'cc-3017-auth-');
    try {
      type Verdict = { status: string; reason?: string };
      const run = (env: string) =>
        runInPackage<{ seam: Verdict; first: Verdict }>(
          dir,
          [
            env,
            `const { createEngineState, runEngineCase } = await import(${JSON.stringify(fileUrl(dir, 'test/engine-runtime.mjs'))});`,
            `const contract = await import(${JSON.stringify(fileUrl(dir, 'srv/engine-contract.ts'))});`,
            "const fs = await import('node:fs');",
            `const { cases } = JSON.parse(fs.readFileSync(new URL(${JSON.stringify(fileUrl(dir, 'test/engine-cases.json'))}), 'utf8'));`,
            'const state = createEngineState();',
            "const seam = await runEngineCase(contract, cases.find((c) => c.kind === 'guard-authority-closed'), state);",
            "const first = await runEngineCase(contract, cases.find((c) => c.examples.some((e) => e.call && e.call.op === 'simulate')), state);",
            'console.log(JSON.stringify({ seam: { status: seam.status, reason: seam.reason }, first: { status: first.status, reason: first.reason } }));',
          ].join('\n'),
        );
      const denied = run('delete process.env.CC_AUTHORITY_DEMO;');
      // Not "the mapping does not fit the code": the authorization check refused, and the report says so.
      expect(denied.first.status).toBe('Not run');
      expect(denied.first.reason).toContain("the contract's baseRequest is refused by the original's authorization check (L200: the authorization check at L197");
      expect(denied.first.reason).toContain('this run did not grant it (CC_AUTHORITY_DEMO=grant, test only)');
      expect(denied.first.reason).not.toContain('mapping does not fit');
      const granted = run("process.env.CC_AUTHORITY_DEMO = 'grant';");
      expect(granted.seam).toEqual({ status: 'Passed' });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('defect 2: the probe and the AI test analysis name the authorization refusal', async () => {
    const probes = fs.readFileSync(path.join(ROOT, 'scripts', 'acceptance', 'lib', 'probes.mjs'), 'utf8');
    expect(probes).toContain("the request is refused by the original's authorization check (${authority})");
    const output = `{"ok":false,"runId":null,"records":0,"errors":[{"field":null,"rule":"L200","message":"L200: the authorization check at L197 (AUTHORITY-CHECK OBJECT 'V_VBAK_VKO', srv/lib/authority.ts) refused — sy-subrc <> 0"}]}`;
    const facts = testFailureFacts(output);
    expect(facts).toHaveLength(1);
    expect(facts[0]).toContain("refused by the original's authorization check at L197 (AUTHORITY-CHECK OBJECT 'V_VBAK_VKO', srv/lib/authority.ts), rule L200");
    expect(facts[0]).toContain('A refused request has no run and therefore no run id');
    // The seam's own issue, as packages before scaffold version 16 say it.
    expect(testFailureFacts("L197 AUTHORITY-CHECK OBJECT 'V_VBAK_VKO' (VKORG, ACTVT): denied - this package checks no authorization yet (fail closed, srv/lib/authority.ts).")[0]).toContain('AUTHORITY-CHECK at L197 (object V_VBAK_VKO) was denied');
    expect(testFailureFactsBlock('AssertionError: expected 3, got 2')).toBe('');
    const hook = fs.readFileSync(path.join(ROOT, 'hooks', 'useTestExecution.ts'), 'utf8');
    expect(hook).toContain('const facts = testFailureFactsBlock(`${rawOutput}\\n${errorOutput}`);');
    expect(hook).toContain('const prompt = `${facts}The following test execution failed.');
  });

  test('defect 3: a missing value is not claimed "not zero" where the original replaces the initial value itself', () => {
    const source = read(EXAMPLE);
    expect([...replacedWhenInitial(source).keys()]).toEqual(['P_LIM', 'P_FILE']);
    const kase = deriveEngineCases(source, []).cases.find((c) => c.engineCase.kind === 'contract-null-not-zero')!;
    const inputs = kase.engineCase.examples.map((e) => e.input);
    expect(inputs).toContain('P_DAYS missing (null)');
    expect(inputs).not.toContain('P_LIM missing (null)');
    expect(inputs).toContain('P_LIM = 0');
    expect(kase.description).toContain('P_LIM (L185: the original replaces an initial P_LIM with 5000 at L186)');
  });

  test('defect 4: the CAP service names the line once', () => {
    const p = prepared(read(EXAMPLE));
    const guards = fileOf(p.scaffold.files, 'srv/lib/guards.ts');
    expect(guards).toContain(`message: "L188: p_days LT 0 — MESSAGE e001 WITH 'Days cannot be negative'"`);
    expect(guards).not.toMatch(/"L(\d+), L\1: /);
    expect(fileOf(p.scaffold.files, 'srv/service.ts')).toContain("e.message.startsWith(e.rule + ':') || e.message.startsWith(e.rule + ',') ? e.message : e.rule + ': ' + e.message");
  });
});

test.describe('the RAP route: a body without its final period (3.0.17 criterion 3)', () => {

  async function generate(prep: EngineLedPrepared, model: FillModel) {
    return runGeneration({
      units: prep.fillUnits,
      plan: prep.plan.units,
      bundleOptions: { track: prep.scaffold.track, program: prep.plan.program, context: 'PLATFORM KNOWLEDGE (test)' },
      model,
      guardBody: guardBodyOf(prep),
      repairBody: repairBodyOf(prep),
      verify: async () => ({ failures: [], checks: [], notRun: [] }),
      budget: 48,
      sleep: async () => {},
    });
  }

  /** A function whose body the checks ask nothing of but itself: no check to call, no AUTHORITY-CHECK. */
  const plainUnit = (prep: EngineLedPrepared) => {
    const u = prep.fillUnits.find((x) => x.abap.ranges.length > 0 && (prep.scaffold.required[x.unitId] ?? []).length === 0 && !prep.scaffold.authority?.[x.unitId]?.length && !(x.guards ?? []).some((g) => g.placement === 'body'));
    if (!u) throw new Error('no plain function in the PO demo');
    return u;
  };

  /** The stub's answer with one unit's body changed by `edit`. */
  const editing = (unitId: string, edit: (body: string) => string): FillModel => async (prompt) => {
    const answer = JSON.parse(geminiTestStubFillText(prompt)) as { units: Array<{ unitId: string; body: string }> };
    for (const u of answer.units) if (u.unitId === unitId) u.body = edit(u.body);
    return JSON.stringify(answer);
  };

  test('the only defect a missing final period: the engine adds it, the same checks pass, TRACE.md says so', async () => {
    const prep = prepared(poDemo(), 'rap');
    const target = plainUnit(prep);
    const body = JSON.parse(geminiTestStubFillText(`REQUEST (JSON):\n${JSON.stringify({ track: 'rap', units: [{ unitId: target.unitId }] })}`)).units[0].body as string;
    const cut = body.replace(/\.(\s*)$/, '$1');
    expect(cut).not.toBe(body);
    // The checks alone refuse it for exactly that reason; the repair gives back the body with its period.
    expect(guardBodyOf(prep)(target.unitId, cut, [])).toBe(FINAL_PERIOD_REASON);
    expect(repairBodyOf(prep)(target.unitId, cut, [])).toEqual({ body: body.replace(/\s+$/, ''), note: FINAL_PERIOD_NOTE });

    const result = await generate(prep, editing(target.unitId, (b) => b.replace(/\.(\s*)$/, '$1')));
    const unit = result.units.find((u) => u.unitId === target.unitId)!;
    expect(unit.state).toBe('written');
    expect(unit.repairs).toEqual([FINAL_PERIOD_NOTE]);
    const pkg = assembleEngineLed(prep, result, { checks: [], budget: 48 });
    expect(pkg.summary.notWritten.map((n) => n.unitId)).not.toContain(target.unitId);
    expect(fileOf(pkg.files, 'TRACE.md')).toContain(FINAL_PERIOD_NOTE);
  });

  // The acceptance run of 18.10.2026: U12 of QM and U17 of FI — CSV quoting, `'"'` in a literal — were refused for a
  // period they had: the check cut each line at its first `"`, literal or not.
  test('a double quote inside a literal is no comment: a body that ends with its period is not refused for one', () => {
    const prep = prepared(poDemo(), 'rap');
    const target = plainUnit(prep);
    const body = JSON.parse(geminiTestStubFillText(`REQUEST (JSON):\n${JSON.stringify({ track: 'rap', units: [{ unitId: target.unitId }] })}`)).units[0].body as string;
    const quoting = `${body.replace(/\s+$/, '')}\nDATA(lv_q) = |a"b|.\nREPLACE ALL OCCURRENCES OF '"' IN lv_q WITH '""'.`;
    expect(guardBodyOf(prep)(target.unitId, quoting, [])).not.toBe(FINAL_PERIOD_REASON);
    // And a real end comment after the period is still read as one.
    expect(guardBodyOf(prep)(target.unitId, `${body.replace(/\s+$/, '')} " done.`, [])).not.toBe(FINAL_PERIOD_REASON);
  });

  test('a body with another defect is still refused, period or not', async () => {
    const prep = prepared(poDemo(), 'rap');
    const target = plainUnit(prep);
    // A semicolon where ABAP ends a statement, and no final period: two refusals — nothing is repaired.
    const broken = (b: string) => `${b.replace(/\.(\s*)$/, '$1')}\nRETURN;\nRETURN`;
    expect(repairBodyOf(prep)(target.unitId, broken('RETURN.'), [])).toBeNull();
    const result = await generate(prep, editing(target.unitId, broken));
    const unit = result.units.find((u) => u.unitId === target.unitId)!;
    expect(unit.state).toBe('not-written');
    expect(unit.reason).toContain('a semicolon where ABAP ends a statement');
    // The Node route repairs nothing.
    const node = prepared(poDemo());
    expect(repairBodyOf(node)(node.fillUnits[0].unitId, 'return', [])).toBeNull();
  });
});
