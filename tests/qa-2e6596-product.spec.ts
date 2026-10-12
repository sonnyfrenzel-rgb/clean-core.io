import { test, expect, type Page } from '@playwright/test';
import { seedStageProject, signInThroughForm, type SeededProject } from './helpers/seed-project';
import { adminMergeDoc } from './helpers/admin-seed';
import fs from 'fs';
import path from 'path';
import { engineViaContractOf, viaContractOfRun, type TestRunReceipt } from '../lib/test-receipt';
import { readOriginalContract } from '../lib/abap/original-contract';
import { deriveBusinessRules } from '../lib/abap/business-rule-set';
import { deriveEngineCases, engineCasesFile } from '../lib/testing-engine-cases';
import { deriveEngineCasesOf, engineCaseProvenance } from '../lib/engine-case-provenance';
import { testFactsOf } from '../lib/delivery-facts';
import { sha256Hex } from '../lib/artefact-digest';
import { CODE_DRAFT_BUSINESS_RULES } from '../lib/code-draft-rules';

/**
 * QA review of 2e6596ddbbc8, product side. Server-free: each block pins one
 * finding's fix (or, for a refuted one, the behaviour that refutes it).
 */

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');

test.describe('0019c1b57d65 — call-contract provenance comes from the server, never from a test title', () => {
  test('the session set is what the server answered, and only for an engine pass that ran', () => {
    expect(engineViaContractOf({ ran: true, viaContract: ['TC_ENG_01', 'TC_ENG_02'] })).toEqual(['TC_ENG_01', 'TC_ENG_02']);
    expect(engineViaContractOf({ ran: false, reason: 'Not run — no contract' })).toEqual([]);
    expect(engineViaContractOf({ ran: true, viaContract: ['TC_ENG_01', 7] })).toEqual(['TC_ENG_01']);
    expect(engineViaContractOf(undefined)).toEqual([]);
    expect(engineViaContractOf(null)).toEqual([]);
  });

  test('a recorded run reads the covering receipt; a session run reads the answer; nothing else counts', () => {
    const receipt = { engine: { digest: 'd'.repeat(64), contractModule: 'srv/engine-contract.ts', viaContract: ['TC_ENG_01'] } } as unknown as TestRunReceipt;
    expect([...viaContractOfRun('recorded', receipt, ['TC_ENG_09'])]).toEqual(['TC_ENG_01']);
    expect([...viaContractOfRun('session', receipt, ['TC_ENG_09'])]).toEqual(['TC_ENG_09']);
    expect([...viaContractOfRun('session', null, [])]).toEqual([]);
    expect([...viaContractOfRun('none', receipt, ['TC_ENG_09'])]).toEqual([]);
  });

  test('the Testing page and its hook take the set from the server, and no longer read the marker in a test name', () => {
    const page = read('app/(app)/project/[projectId]/testing/page.tsx');
    expect(page).not.toContain('ENGINE_CONTRACT_MARKER');
    expect(page).toContain('viaContractOfRun(lastRun(project, testResults).kind, coveringTestRunReceipt(project), engineViaContract)');
    const hook = read('hooks/useTestExecution.ts');
    expect(hook).toContain('setEngineViaContract(engineViaContractOf(result.engine));');
    expect(hook).not.toContain('ENGINE_CONTRACT_MARKER');
  });
});

test.describe('0019c1b57d65, rendered — the Testing page labels a session verdict by what the server said', () => {
  test.describe.configure({ mode: 'serial' });
  let account: SeededProject;
  // An engine case whose stored name carries the marker: `testCases` is
  // client-written, and the session verdicts keep the stored name.
  const engineCase = {
    id: 'TC_ENG_01',
    name: `TC_ENG_01: ${'[call contract]'} amount at its largest value`,
    category: 'Boundary',
    description: 'precision',
    priority: 'High',
    origin: 'engine',
    engineCase: {
      kind: 'precision-max',
      family: 'precision',
      trace: { basis: 'declared-type', field: 'gv_amount', lines: [{ start: 3, end: 3 }] },
      examples: [{ input: 'GV_AMOUNT = 9999999999999.99', expected: 'accepted; kept exactly' }],
    },
  };

  test.beforeAll(async () => {
    test.setTimeout(180 * 1000);
    account = await seedStageProject({ prefix: 'qa2e65via', acceptTerms: true, rich: true });
    await adminMergeDoc('projects', account.projectId, {
      testSuite: { code: "import { test } from 'node:test';\ntest('TC_ENG_01: [call contract] forged', () => {});\n" },
      testCases: [engineCase],
    });
  });

  async function runWith(page: Page, engine: Record<string, unknown>) {
    await page.route('**/api/model-stages*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ stages: { analyze: true, design: true, transformation: true, documentation: true, testing: true }, keyAvailable: true, keySource: 'community' }),
      }),
    );
    await page.route('**/api/run-tests', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          output: 'ok 1 - TC_ENG_01: [call contract] forged',
          exitCode: 0,
          testResults: [{ id: 'TC_ENG_01', name: 'TC_ENG_01: [call contract] forged', status: 'Passed' }],
          engine,
        }),
      }),
    );
    await signInThroughForm(page, account);
    await page.goto(`/project/${account.projectId}/testing`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-testing-flow]')).toBeVisible({ timeout: 90000 });
    await page.locator('[data-testing-step="run"]').getByRole('button', { name: 'Run tests against mocks' }).click();
    const row = page.locator('[data-scenario-id="TC_ENG_01"]');
    await expect(row.locator('[data-scenario-verdict="pass"]')).toBeVisible({ timeout: 60000 });
    return row.locator('[data-scenario-assessment]');
  }

  test('a model-written pass with the marker in its name is not a call-contract verdict', async ({ page }) => {
    test.setTimeout(240 * 1000);
    const assessment = await runWith(page, { ran: false, reason: 'Not run — the code does not export the call contract (no srv/engine-contract module)' });
    await expect(assessment).toHaveAttribute('data-scenario-assessment', 'passed-model-stated');
  });

  test('a pass the server reports as decided by the call contract is one', async ({ page }) => {
    test.setTimeout(240 * 1000);
    const assessment = await runWith(page, { ran: true, viaContract: ['TC_ENG_01'] });
    await expect(assessment).toHaveAttribute('data-scenario-assessment', 'unchanged');
  });
});

test.describe('d5f456869f59 — the Node prompt\'s JSON example no longer lists the event publisher unconditionally', () => {
  const page = read('app/(app)/project/[projectId]/transformation/page.tsx');
  // The Node.js prompt: the one whose file list names the event publisher.
  const start = page.indexOf('Return a JSON object with the following structure:', page.indexOf('erp-triggers/zcl_core_event_publisher.clas.abap: S/4HANA-side event trigger'));
  const end = page.indexOf('No conversational text.', start);
  const example = page.slice(start, end);

  test('the structure the model is shown has no erp-triggers entry', () => {
    expect(start).toBeGreaterThan(0);
    const files = example.slice(example.indexOf('"files": ['), example.indexOf('"tests": {'));
    expect(files).toContain('"path": "srv/service.ts"');
    expect(files).not.toContain('erp-triggers/');
  });

  test('the publisher is described as conditional, omitted when a standard event exists', () => {
    expect(example).toContain('The event publisher is conditional and therefore not in the structure above');
    expect(example).toContain('ONLY when SAP has no standard business event for the change');
    expect(example).toContain('When a standard event exists, the files list has no erp-triggers entry at all');
  });
});

test.describe('9fa3fee29b13 — every packed field of a chained declaration is read', () => {
  test('two packed fields in one DATA chain on one line, with different places', () => {
    const src = "REPORT z.\nDATA: lv_a TYPE p LENGTH 8 DECIMALS 2, lv_b TYPE p LENGTH 8 DECIMALS 3.";
    expect(readOriginalContract(src).decimals.map((d) => [d.name, d.line, d.length, d.decimals])).toEqual([
      ['lv_a', 2, 8, 2],
      ['lv_b', 2, 8, 3],
    ]);
  });

  test('a TYPES chain, a CONSTANTS chain with a literal holding a comma, and the old (n) form', () => {
    const src = [
      'REPORT z.',
      'TYPES: ty_a TYPE p LENGTH 5 DECIMALS 1,',
      '       ty_b TYPE p LENGTH 6 DECIMALS 4.',
      "CONSTANTS: lc_x TYPE p LENGTH 4 DECIMALS 2 VALUE '1,50', lc_y TYPE p LENGTH 3 DECIMALS 1 VALUE '2'.",
      'DATA: lv_old(7) TYPE p DECIMALS 3, lv_i TYPE i, lv_new TYPE p LENGTH 9 DECIMALS 6.',
    ].join('\n');
    expect(readOriginalContract(src).decimals.map((d) => [d.name, d.line, d.length, d.decimals])).toEqual([
      ['ty_a', 2, 5, 1],
      ['ty_b', 3, 6, 4],
      ['lc_x', 4, 4, 2],
      ['lc_y', 4, 3, 1],
      ['lv_old', 5, 7, 3],
      ['lv_new', 5, 9, 6],
    ]);
  });
});

/* ----------------------------------------- engine-case provenance (export, STATUS) */

const WIDE = [
  'REPORT zwide.',
  ...Array.from({ length: 10 }, (_, i) => `DATA gv_${String.fromCharCode(97 + i)} TYPE p LENGTH 8 DECIMALS 2.`),
  'PARAMETERS p_x TYPE p LENGTH 8 DECIMALS 2.',
  'START-OF-SELECTION.',
  '  IF p_x > 100.',
  '    MESSAGE e001(zw).',
  '  ENDIF.',
  '  gv_a = p_x.',
].join('\n');
const NARROW = ['REPORT znarrow.', 'PARAMETERS p_x TYPE p LENGTH 8 DECIMALS 2.', 'START-OF-SELECTION.', '  IF p_x > 100.', '    MESSAGE e001(zw).', '  ENDIF.'].join('\n');

const signedAs = (source: string) => ({ activeRunId: 'run-1', legacyCode: source, inputFingerprint: { sha256: sha256Hex(source) } });
const derived = (source: string) => deriveEngineCases(source, deriveBusinessRules(source).rules);
/** What a Firestore round trip may do to a map: the same data, keys in another order. */
const reordered = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(reordered)
    : value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value as Record<string, unknown>).reverse().map(([k, v]) => [k, reordered(v)]))
      : value;
const asStored = (cases: readonly unknown[]) => cases.map((c) => reordered(JSON.parse(JSON.stringify(c)))) as Array<Record<string, unknown>>;
const testFacts = (project: Record<string, unknown>, phases: Array<{ key: string; state: string }> = []) =>
  testFactsOf(project as unknown as Parameters<typeof testFactsOf>[0], phases as unknown as Parameters<typeof testFactsOf>[1]);

test.describe('0297134b3b87 — a client-written case with origin engine is not exported as derived by Clean-Core.io', () => {
  const engine = derived(NARROW).cases;
  const forgedExpectation = (() => {
    const stored = asStored(engine);
    const c = stored[0] as { engineCase: { examples: Array<{ expected: string }> } };
    c.engineCase.examples[0].expected = 'accepted; whatever the client wants';
    return stored;
  })();
  const invented = {
    id: 'TC_ENG_99',
    name: 'invented',
    origin: 'engine',
    engineCase: { kind: 'guard-breaks-one', family: 'guard', trace: { basis: 'business-rule', lines: [] }, examples: [{ input: 'x', expected: 'y' }] },
  };

  test('stored cases that match the derivation from the signed source are verified, whatever their key order', () => {
    const p = engineCaseProvenance(asStored(engine), deriveEngineCasesOf(NARROW));
    expect(p.unverified).toEqual([]);
    expect(p.verified.map((c) => c.id)).toEqual(engine.map((c) => c.id));
  });

  test('an edited expectation and an invented id are unverified; the export ships only the recomputed cases and names the rest', () => {
    const stored = [...forgedExpectation, invented];
    const p = engineCaseProvenance(stored, deriveEngineCasesOf(NARROW));
    expect(p.unverified).toEqual([engine[0].id, 'TC_ENG_99']);
    const file = JSON.parse(engineCasesFile(p.verified, p.unverified)!);
    expect(file.cases.map((c: { id: string }) => c.id)).toEqual(engine.slice(1).map((c) => c.id));
    expect(JSON.stringify(file.cases)).not.toContain('whatever the client wants');
    expect(file.unverified.ids).toEqual([engine[0].id, 'TC_ENG_99']);
    expect(file.unverified.note).toContain('not reproduced from the signed original source');
  });

  test('without a signed source nothing is verified', () => {
    const p = engineCaseProvenance(asStored(engine), deriveEngineCasesOf(null));
    expect(p.verified).toEqual([]);
    expect(p.unverified).toEqual(engine.map((c) => c.id));
  });

  test('the delivery page builds the file from the provenance, not from the stored list', () => {
    const page = read('app/(app)/project/[projectId]/delivery/page.tsx');
    expect(page).toContain('engineCaseProvenance(');
    expect(page).toContain('deriveEngineCasesOf(signedSourceOf(project as HandoverProject)?.source ?? null)');
    // QA e04537f4bb66: no cast any more — engineCasesFile takes only VerifiedEngineCase, which the provenance alone produces.
    expect(page).toContain('engineCasesFile(provenance.verified, provenance.unverified)');
    expect(page).not.toContain('engineCasesFile(project.testCases');
  });

  test('STATUS counts a forged case as not derived by Clean-Core.io and names it', () => {
    const text = testFacts({ testCases: [...forgedExpectation, invented], ...signedAs(NARROW) }).detail.join('\n');
    expect(text).toContain(
      `2 stored as engine cases are not reproduced from the signed source and counted as not derived by Clean-Core.io: ${engine[0].id}, TC_ENG_99.`,
    );
    expect(text).toContain(`2 cases written by the testing model · ${engine.length - 1} derived by Clean-Core.io from the original`);
  });
});

test.describe('3ea38fd51acf — the cases past the caps are counted from the source the stored cases came from', () => {
  test('cases and signed source agree: the count is said', () => {
    expect(derived(WIDE).notCovered.precision).toBeGreaterThan(0);
    const text = testFacts({ testCases: asStored(derived(WIDE).cases), ...signedAs(WIDE) }).detail.join('\n');
    expect(text).toMatch(/Engine cases past the caps \(20 precision, 20 guard\): \d+ more not covered/);
  });

  test('cases from a previous source, a new run signed on a wider one: no count from the current source, and why', () => {
    const text = testFacts({ testCases: asStored(derived(NARROW).cases), ...signedAs(WIDE) }).detail.join('\n');
    expect(text).not.toContain('more not covered');
    expect(text).toContain('Engine cases past the caps: not counted — the engine cases on record do not match the signed source.');
  });

  test('a stale test phase: no count, and why', () => {
    const text = testFacts({ testCases: asStored(derived(WIDE).cases), ...signedAs(WIDE) }, [{ key: 'testing', state: 'stale' }]).detail.join('\n');
    expect(text).not.toContain('more not covered');
    expect(text).toContain('Engine cases past the caps: not counted — the scenarios on record were built for a previous source.');
  });

  test('a source changed after the run (nothing signed): no count, and why', () => {
    const text = testFacts({
      testCases: asStored(derived(NARROW).cases),
      activeRunId: 'run-1',
      legacyCode: WIDE,
      inputFingerprint: { sha256: sha256Hex(NARROW) },
    }).detail.join('\n');
    expect(text).not.toContain('more not covered');
    expect(text).toContain('Engine cases past the caps: not counted — there is no signed source to count them from.');
  });
});

test.describe('4e9d1315469d — rule 15 lets a check on a derived value keep its place', () => {
  test('raw-input checks first; a data-dependent check keeps the original order and may compute its inputs', () => {
    expect(CODE_DRAFT_BUSINESS_RULES).toContain('Checks on the raw input run on the whole input BEFORE any business calculation');
    expect(CODE_DRAFT_BUSINESS_RULES).toContain(
      "a check on a derived value (e.g. the sum of quotas) keeps the original's order and scope, and computing the values it needs first is allowed",
    );
    expect(CODE_DRAFT_BUSINESS_RULES).not.toContain('run on the whole input BEFORE any calculation');
    expect(CODE_DRAFT_BUSINESS_RULES.length).toBeLessThan(6_000);
  });
});
