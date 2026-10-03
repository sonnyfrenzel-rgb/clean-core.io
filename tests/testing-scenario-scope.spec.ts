import { test, expect, type Page } from '@playwright/test';
import { seedStageProject, signInThroughForm, type SeededProject } from './helpers/seed-project';
import { adminGetDoc, adminSetDoc } from './helpers/admin-seed';
import { receiptFor } from './helpers/test-receipt';
import {
  NOT_STATED,
  abapMethodMatches,
  countScopes,
  derivedFrom,
  runnerIdOfTitle,
  scenarioFields,
  scenarioScope,
  scenarioTest,
  scopeSummary,
} from '../components/testing/scenario-detail';
import { generationPrerequisites } from '../lib/workflow-steps';

/**
 * The Testing stage's scenarios can be opened, and where each one can be tested
 * is unmistakable (owner 03.10.2026, translated: "You must be able to look at
 * the details of the test scenarios, and it must always be clear what we can
 * test and what only works outside, otherwise the value of the testing tool is
 * too small").
 *
 * Held here:
 *  - every scenario opens its details, and the details show every stored field;
 *  - a field the model left out reads "Not stated by the model" — nothing is
 *    filled in;
 *  - the scope is derived from the route and the stored suite, not guessed from
 *    words: an ABAP Unit scenario needs the reader's SAP system, a scenario with
 *    a test the runner can attribute can be demonstrated here against mocks, and
 *    one without is "not determined";
 *  - the legend and the summary exist, the selection says it is for the mock
 *    run, and nothing in the stage calls a mock result "Proven";
 *  - on a 390 px phone the details open as a sheet and nothing scrolls sideways.
 */

// ── Fixtures: what the testing model writes, on both routes ───────────────────

const ABAP_CLASS = [
  'CLASS ltcl_sales_order DEFINITION FINAL FOR TESTING RISK LEVEL HARMLESS DURATION SHORT.',
  '  PRIVATE SECTION.',
  '    METHODS tc_01_create_valid_order FOR TESTING.',
  '    METHODS tc_02_missing_doc_type FOR TESTING.',
  '    METHODS tc_03_unknown_customer FOR TESTING.',
  '    METHODS tc_04_quantity_zero FOR TESTING.',
  'ENDCLASS.',
  '',
  'CLASS ltcl_sales_order IMPLEMENTATION.',
  '  METHOD tc_01_create_valid_order.',
  "    DATA(lo_cut) = NEW zcl_sd_order_create( ).",
  "    DATA(ls_result) = lo_cut->create( iv_doc_type = 'OR' iv_customer = '0000100001' iv_material = 'MAT-100' iv_quantity = 5 ).",
  '    cl_abap_unit_assert=>assert_not_initial( ls_result-order_id ).',
  '  ENDMETHOD.',
  '',
  '  METHOD tc_02_missing_doc_type.',
  "    DATA(lo_cut) = NEW zcl_sd_order_create( ).",
  "    DATA(ls_result) = lo_cut->create( iv_doc_type = '' iv_customer = '0000100001' iv_material = 'MAT-100' iv_quantity = 5 ).",
  "    cl_abap_unit_assert=>assert_equals( act = ls_result-msg_type exp = 'E' ).",
  '  ENDMETHOD.',
  '',
  '  METHOD tc_03_unknown_customer.',
  "    DATA(lo_cut) = NEW zcl_sd_order_create( ).",
  "    DATA(ls_result) = lo_cut->create( iv_doc_type = 'OR' iv_customer = '9999999999' iv_material = 'MAT-100' iv_quantity = 5 ).",
  "    cl_abap_unit_assert=>assert_equals( act = ls_result-msg_type exp = 'E' ).",
  '  ENDMETHOD.',
  '',
  '  METHOD tc_04_quantity_zero.',
  "    DATA(lo_cut) = NEW zcl_sd_order_create( ).",
  "    DATA(ls_result) = lo_cut->create( iv_doc_type = 'OR' iv_customer = '0000100001' iv_material = 'MAT-100' iv_quantity = 0 ).",
  "    cl_abap_unit_assert=>assert_equals( act = ls_result-msg_type exp = 'E' ).",
  '  ENDMETHOD.',
  'ENDCLASS.',
].join('\n');

/** Ten scenarios as the testing model writes them for the ABAP Cloud route. TC_04 leaves two fields out; TC_05 to TC_10 have no method in the class. */
const ABAP_CASES = [
  {
    id: 'TC_01',
    name: 'Create Valid Sales Order',
    category: 'Positive',
    description: 'A standard order with all mandatory fields is created and returns an order number.',
    preconditions: 'Customer 0000100001 exists in sales area 1000/10/00; material MAT-100 is released for sales.',
    testData: "Document type 'OR', customer 0000100001, material MAT-100, quantity 5",
    steps: ['Call create( ) with the test data', 'Read the returned structure'],
    expectedResult: 'An order number is returned and no error message is raised.',
    priority: 'High',
    validationPoints: ['order_id is not initial', 'msg_type is initial'],
  },
  {
    id: 'TC_02',
    name: 'Validation Failure on Missing Doc Type',
    category: 'Negative',
    description: 'An order without a document type is rejected before any database access.',
    preconditions: 'None beyond the standard test double for the order table.',
    testData: "Document type '' (empty), customer 0000100001",
    steps: ['Call create( ) with an empty document type', 'Check the returned message type'],
    expectedResult: "Message type 'E' is returned and no order is created.",
    priority: 'High',
    validationPoints: ["msg_type = 'E'"],
    businessRule: 'Document type is mandatory (L42-48)',
  },
  {
    id: 'TC_03',
    name: 'Unknown Customer Rejected',
    category: 'Negative',
    description: 'A customer number that does not exist leads to an error.',
    preconditions: 'Customer 9999999999 does not exist in the test double.',
    testData: 'Customer 9999999999',
    steps: ['Call create( ) with the unknown customer'],
    expectedResult: "Message type 'E' with the customer number in the text.",
    priority: 'Medium',
    validationPoints: ["msg_type = 'E'"],
  },
  {
    id: 'TC_04',
    name: 'Zero Quantity Rejected',
    category: 'Negative',
    description: 'An item with quantity 0 is not accepted.',
    testData: 'Quantity 0',
    steps: ['Call create( ) with quantity 0'],
    priority: 'Medium',
  },
  ...[
    ['TC_05', 'Credit Block Sets Delivery Block', 'Positive'],
    ['TC_06', 'Authorization Missing for Sales Org', 'Negative'],
    ['TC_07', 'Pricing Condition Applied', 'Positive'],
    ['TC_08', 'Duplicate Purchase Order Number Warned', 'Negative'],
    ['TC_09', 'Partner Functions Copied From Customer', 'Positive'],
    ['TC_10', 'Commit Writes Order and Log Together', 'Positive'],
  ].map(([id, name, category]) => ({
    id,
    name,
    category,
    description: `${name}: checked against the behaviour implementation with test doubles.`,
    preconditions: 'Test doubles for the order and customer tables.',
    testData: 'Standard order data',
    steps: ['Prepare the test double', 'Call the behaviour implementation', 'Compare the result'],
    expectedResult: 'The behaviour matches the legacy program.',
    priority: 'Medium',
    validationPoints: ['Result as expected'],
  })),
];

const NODE_SUITE = [
  "import { test } from 'node:test';",
  "import { strict as assert } from 'node:assert';",
  "import { creditDecision } from './app';",
  '',
  "test('TC_01: approves an order within the credit limit', () => {",
  "  assert.equal(creditDecision({ exposure: 400, limit: 1000 }), 'approve');",
  '});',
  '',
  "test('TC_02: blocks an order above the credit limit', () => {",
  "  assert.equal(creditDecision({ exposure: 1400, limit: 1000 }), 'block');",
  '});',
  '',
  "test('TC_03: treats a missing limit as a block', () => {",
  "  assert.equal(creditDecision({ exposure: 10, limit: undefined }), 'block');",
  '});',
].join('\n');

const NODE_CODE = [
  'export function creditDecision(input: { exposure: number; limit?: number }): string {',
  "  if (typeof input.limit !== 'number') return 'block';",
  "  return input.exposure > input.limit ? 'block' : 'approve';",
  '}',
  '',
].join('\n');

/** Four scenarios for the side-by-side route; TC_04 has no test in the suite. Messages as `/api/run-tests` stores them. */
const NODE_CASES = [
  { id: 'TC_01', name: 'Approve within limit', category: 'Positive', description: 'Exposure below the limit is approved.', preconditions: 'Credit limit 1000', testData: 'exposure 400', steps: ['Call creditDecision'], expectedResult: "'approve'", priority: 'High', validationPoints: ['returns approve'], status: 'Passed', message: 'Passed in the Node.js test runner' },
  { id: 'TC_02', name: 'Block above limit', category: 'Negative', description: 'Exposure above the limit is blocked.', preconditions: 'Credit limit 1000', testData: 'exposure 1400', steps: ['Call creditDecision'], expectedResult: "'block'", priority: 'High', validationPoints: ['returns block'], status: 'Failed', message: "Expected values to be strictly equal: 'approve' !== 'block'" },
  { id: 'TC_03', name: 'Missing limit blocks', category: 'Negative', description: 'No limit on record blocks the order.', preconditions: 'No credit limit', testData: 'exposure 10', steps: ['Call creditDecision'], expectedResult: "'block'", priority: 'Medium', validationPoints: ['returns block'], status: 'Passed', message: 'Passed in the Node.js test runner' },
  { id: 'TC_04', name: 'Credit check through the RFC destination', category: 'Positive', description: 'The remote credit system answers within the timeout.', priority: 'Low', status: 'Not run', message: 'The runner finished without reporting on this test — no result to show' },
];

// ── The rule, without a browser ───────────────────────────────────────────────

test.describe('what a scenario holds and where it can be tested', () => {
  test('every asked-for field appears, a missing one as null, and extra stored fields are kept', () => {
    const fields = scenarioFields(ABAP_CASES[3]);
    const byKey = Object.fromEntries(fields.map((f) => [f.key, f.value]));
    expect(byKey.preconditions).toBeNull();
    expect(byKey.expectedResult).toBeNull();
    expect(byKey.validationPoints).toBeNull();
    expect(byKey.testData).toBe('Quantity 0');
    expect(byKey.steps).toEqual(['Call create( ) with quantity 0']);
    expect(byKey.category).toBe('Negative');
    // An extra key the model wrote is shown under its own name; status and message are the run's, not the scenario's.
    const extra = scenarioFields({ id: 'X', name: 'n', riskNote: 'touches VBAK', status: 'Passed', message: 'm' });
    expect(extra.find((f) => f.key === 'riskNote')).toEqual({ key: 'riskNote', label: 'Risk note', value: 'touches VBAK' });
    expect(extra.find((f) => f.key === 'status' || f.key === 'message')).toBeUndefined();
    // An empty string is the same absence as a missing key; an object is text, never [object Object].
    expect(scenarioFields({ preconditions: '  ' }).find((f) => f.key === 'preconditions')!.value).toBeNull();
    expect(scenarioFields({ testData: { qty: 0 } }).find((f) => f.key === 'testData')!.value).toBe('{"qty":0}');
    expect(NOT_STATED).toBe('Not stated by the model');
  });

  test('what a scenario derives from is read only where the model wrote it, with its line anchors', () => {
    expect(derivedFrom(ABAP_CASES[0])).toBeNull();
    expect(derivedFrom(ABAP_CASES[1])).toEqual({ text: 'Document type is mandatory (L42-48)', anchors: ['L42-48'] });
    expect(derivedFrom({ sourceLines: 'lines 120–131, line 140' })!.anchors).toEqual(['L120-131', 'L140']);
  });

  test('an ABAP Unit method is matched by the id in its name, and tc_1 is not tc_10', () => {
    expect(abapMethodMatches('tc_01_create_valid_order', 'TC_01')).toBe(true);
    expect(abapMethodMatches('TC01_CREATE', 'TC_01')).toBe(true);
    expect(abapMethodMatches('tc_10_commit', 'TC_1')).toBe(false);
    expect(abapMethodMatches('tc_010', 'TC_01')).toBe(false);
    const found = scenarioTest(ABAP_CLASS, 'TC_02', true);
    expect(found.kind).toBe('found');
    if (found.kind === 'found') {
      expect(found.name).toBe('tc_02_missing_doc_type');
      expect(found.code.trim().startsWith('METHOD tc_02_missing_doc_type.')).toBe(true);
      expect(found.code.trim().endsWith('ENDMETHOD.')).toBe(true);
      expect(found.startLine).toBe(16);
    }
    expect(scenarioTest(ABAP_CLASS, 'TC_10', true).kind).toBe('not-found');
    expect(scenarioTest('', 'TC_01', true).kind).toBe('no-suite');
  });

  test('a node:test is matched the way the runner reads its id — the first token of the title', () => {
    expect(runnerIdOfTitle('TC_01: approves')).toBe('TC_01');
    expect(runnerIdOfTitle('TC-001 approves')).toBe('TC-001');
    const found = scenarioTest(NODE_SUITE, 'TC_03', false);
    expect(found.kind).toBe('found');
    if (found.kind === 'found') {
      expect(found.code.startsWith("test('TC_03:")).toBe(true);
      expect(found.code.endsWith('});')).toBe(true);
    }
    // `TC_0` is not `TC_01`: the runner compares the whole id.
    expect(scenarioTest(NODE_SUITE, 'TC_0', false).kind).toBe('not-found');
    expect(scenarioTest(NODE_SUITE, 'TC_04', false).kind).toBe('not-found');
  });

  test('the scope comes from the route and the suite, never from the words of the scenario', () => {
    const scopes = ABAP_CASES.map((c) => scenarioScope(scenarioTest(ABAP_CLASS, c.id, true), true).scope);
    expect(new Set(scopes)).toEqual(new Set(['your-system']));
    // "Authorization" in its name does not move a scenario anywhere on the side-by-side route.
    const nodeScopes = NODE_CASES.map((c) => scenarioScope(scenarioTest(NODE_SUITE, c.id, false), false).scope);
    expect(nodeScopes).toEqual(['here-mock', 'here-mock', 'here-mock', 'not-determined']);
    expect(scopeSummary(countScopes(scopes))).toBe('10 need your SAP system');
    expect(scopeSummary(countScopes(nodeScopes))).toBe('3 can be demonstrated here (mock) · 1 not determined');
    expect(scopeSummary(countScopes(['your-system']))).toBe('1 needs your SAP system');
  });
});

// ── Rendered (emulators and a production build) ───────────────────────────────

async function cloneProject(account: SeededProject, suffix: string, over: Record<string, unknown>): Promise<string> {
  const base = await adminGetDoc('projects', account.projectId);
  const id = `${account.projectId}-${suffix}`;
  await adminSetDoc('projects', id, { ...base, ...over, activeRunId: account.runId, createdAt: new Date() });
  const run = await adminGetDoc(`projects/${account.projectId}/runs`, account.runId);
  await adminSetDoc(`projects/${id}/runs`, account.runId, { ...run, projectId: id });
  return id;
}

async function seedBoth(prefix: string): Promise<{ account: SeededProject; abapId: string; nodeId: string }> {
  const account = await seedStageProject({ prefix, acceptTerms: true, rich: true });
  const abapId = await cloneProject(account, 'abap', {
    name: 'ZSD_ORDER_CREATE — Sales order creation',
    extensibilityRoute: 'In-App Extension (ABAP Cloud)',
    generatedCode: 'CLASS zcl_sd_order_create DEFINITION PUBLIC FINAL CREATE PUBLIC.\nENDCLASS.\nCLASS zcl_sd_order_create IMPLEMENTATION.\nENDCLASS.\n',
    testSuite: { code: ABAP_CLASS },
    testCases: ABAP_CASES,
    manualTestingRequirements: [
      { area: 'Authorization checks', reason: 'AUTHORITY-CHECK on the sales organisation needs real roles.', verificationSteps: ['Run with a user without V_VBAK_VKO', 'Expect the authorization message'] },
      { area: 'Update task and commit', reason: 'The order and its log are written in one LUW.', verificationSteps: 'Create an order and check both tables after COMMIT WORK' },
    ],
    coverageEstimate: { percentage: 62, explanation: 'Validation logic is covered; persistence is mocked.', missingCoverage: 'Authorization, update task, real pricing.' },
  });
  const nodeProject = {
    extensibilityRoute: 'Side-by-Side (SAP BTP)',
    generatedCode: NODE_CODE,
    testSuite: { code: NODE_SUITE },
    testCases: NODE_CASES,
  };
  const nodeId = await cloneProject(account, 'node', {
    ...nodeProject,
    name: 'ZCREDIT_CHECK — Credit decision',
    testRunReceipt: receiptFor({ activeRunId: account.runId, ...nodeProject }, NODE_CASES.map((c) => ({ id: c.id, status: c.status as 'Passed' | 'Failed' | 'Not run' }))),
  });
  return { account, abapId, nodeId };
}

async function openTesting(page: Page, projectId: string) {
  await page.goto(`/project/${projectId}/testing`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-testing-flow]')).toBeVisible({ timeout: 90000 });
}

async function noSidewaysScroll(page: Page, what: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${what}: sideways scroll`).toBeLessThanOrEqual(0);
}

/** Every text a field shows — a list shows each item. */
function shownValues(value: string | string[] | null): string[] {
  return value === null ? [NOT_STATED] : Array.isArray(value) ? value : [value];
}

test.describe('the scenarios on the page', () => {
  test.describe.configure({ mode: 'serial' });
  let seeded: Awaited<ReturnType<typeof seedBoth>>;

  test.beforeAll(async () => {
    test.setTimeout(180 * 1000);
    seeded = await seedBoth('tscope');
  });

  test('ABAP Unit: every scenario opens its details with every stored field, and all of them need your SAP system', async ({ page }) => {
    test.setTimeout(300 * 1000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInThroughForm(page, seeded.account);
    await openTesting(page, seeded.abapId);

    const section = page.locator('[data-testing-scenarios]');
    // The summary at the top and the legend, once for the stage.
    await expect(section.locator('[data-scope-summary]')).toContainText('10 need your SAP system');
    const legend = page.locator('[data-testing-scope-legend]');
    await expect(legend).toHaveCount(1);
    for (const scope of ['here-mock', 'your-system', 'tenant']) await expect(legend.locator(`[data-scope-entry="${scope}"]`)).toHaveCount(1);
    await expect(legend.locator('[data-scope-entry="tenant"]')).toContainText('locked');
    await expect(legend.locator('[data-scope-entry="your-system"]')).toContainText('ADT');
    // What to do next, in one line, and the class to take there.
    await expect(section.locator('[data-testing-next]')).toContainText('ADT');
    await expect(section.getByRole('button', { name: 'Copy test class' })).toBeVisible();
    await expect(section.getByRole('button', { name: 'Download for ADT' })).toBeVisible();
    // Nothing to select on this route: there is no mock run to select for.
    await expect(section.getByRole('checkbox')).toHaveCount(0);

    const rows = section.locator('[data-scenario-row]');
    await expect(rows).toHaveCount(ABAP_CASES.length);
    await expect(section.locator('[data-scenario-scope="your-system"]')).toHaveCount(ABAP_CASES.length);

    for (const [i, tc] of ABAP_CASES.entries()) {
      const row = rows.nth(i);
      const toggle = row.locator('[data-scenario-toggle]');
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      const details = row.locator('[data-scenario-details]');
      await expect(details).toBeVisible();
      // Model proposal stays visible on the details.
      await expect(details.locator('[data-provenance="proposed"]').first()).toBeVisible();
      for (const field of scenarioFields(tc)) {
        const shown = details.locator(`[data-scenario-field="${field.key}"]`);
        await expect(shown, `${tc.id} ${field.key}`).toHaveCount(1);
        for (const text of shownValues(field.value)) await expect(shown, `${tc.id} ${field.key}`).toContainText(text);
      }
      // The method, or the honest absence of one.
      const method = details.locator('[data-scenario-test]');
      const test = scenarioTest(ABAP_CLASS, tc.id, true);
      await expect(method).toHaveAttribute('data-scenario-test', test.kind);
      if (test.kind === 'found') await expect(method).toContainText(`METHOD ${test.name}.`);
      else await expect(method).toContainText('cannot be matched');
      await expect(details.locator('[data-scenario-where]')).toContainText('copy the test class into ADT');
      await toggle.click();
      await expect(details).toHaveCount(0);
    }

    // A missing field: "Not stated by the model", never a stand-in.
    const tc04 = rows.nth(3);
    await tc04.locator('[data-scenario-toggle]').click();
    await expect(tc04.locator('[data-scenario-field="preconditions"]')).toContainText(NOT_STATED);
    await expect(tc04.locator('[data-scenario-field="expectedResult"]')).toContainText(NOT_STATED);
    await expect(tc04.locator('[data-scenario-derived]')).toContainText(NOT_STATED);
    // What the model named as the rule, with its anchor.
    const tc02 = rows.nth(1);
    await tc02.locator('[data-scenario-toggle]').click();
    await expect(tc02.locator('[data-scenario-derived]')).toContainText('Document type is mandatory');
    await expect(tc02.locator('[data-scenario-derived] [data-cc-anchor]')).toContainText('L42-48');

    // The areas the model says only your system can test are on the page without a run.
    await expect(page.locator('[data-manual-requirements]')).toContainText('Authorization checks');
    await expect(page.locator('main')).not.toContainText(/\bProven\b/);
    await noSidewaysScroll(page, '1440 ABAP');
  });

  test('side-by-side: the selection is for the mock run, and a mock pass is demonstrated, never proven', async ({ page }) => {
    test.setTimeout(300 * 1000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInThroughForm(page, seeded.account);
    await openTesting(page, seeded.nodeId);

    const section = page.locator('[data-testing-scenarios]');
    await expect(section.locator('[data-scope-summary]')).toContainText('3 can be demonstrated here (mock) · 1 not determined');
    await expect(section.locator('[data-scenario-scope="here-mock"]')).toHaveCount(3);
    await expect(section.locator('[data-scenario-scope="not-determined"]')).toHaveCount(1);
    await expect(section.getByRole('checkbox', { name: 'Include TC_01 in the next mock run' })).toBeChecked();
    await expect(section.locator('[data-selection-for]')).toContainText('mock run');
    await expect(section.locator('[data-testing-next]')).toContainText('mock');

    const rows = section.locator('[data-scenario-row]');
    await rows.nth(0).locator('[data-scenario-toggle]').click();
    const first = rows.nth(0).locator('[data-scenario-details]');
    await expect(first.locator('[data-scenario-last-run]')).toContainText('Demonstrated · mock');
    await expect(first.locator('[data-scenario-last-run]')).toContainText('Passed in the Node.js test runner');
    await expect(first.locator('[data-scenario-test]')).toContainText("test('TC_01:");
    await rows.nth(1).locator('[data-scenario-toggle]').click();
    await expect(rows.nth(1).locator('[data-scenario-last-run]')).toContainText('Failed');
    await expect(rows.nth(1).locator('[data-scenario-last-run]')).toContainText("'approve' !== 'block'");
    await rows.nth(3).locator('[data-scenario-toggle]').click();
    await expect(rows.nth(3).locator('[data-scenario-test]')).toHaveAttribute('data-scenario-test', 'not-found');
    await expect(rows.nth(3).locator('[data-scenario-where]')).toContainText('not determined');

    // Green and "Proven" belong to what a real system established; nothing in the stage says it of a mock run.
    await expect(page.locator('main')).not.toContainText(/\bProven\b/);
    await noSidewaysScroll(page, '1440 side-by-side');
  });

  test('on a 390 px phone the details open as a sheet and nothing scrolls sideways', async ({ page }) => {
    test.setTimeout(300 * 1000);
    // Signed in on a desktop width, as the other testing specs do; then the phone.
    await signInThroughForm(page, seeded.account);
    await page.setViewportSize({ width: 390, height: 844 });
    for (const id of [seeded.abapId, seeded.nodeId]) {
      await openTesting(page, id);
      await expect(page.locator('[data-scope-summary]')).toBeVisible();
      await noSidewaysScroll(page, `390 ${id}`);
      const row = page.locator('[data-scenario-row]').first();
      await row.locator('[data-scenario-toggle]').click();
      const sheet = page.getByRole('dialog');
      await expect(sheet).toBeVisible();
      await expect(sheet.locator('[data-scenario-details]')).toBeVisible();
      await expect(sheet.locator('[data-scenario-field="expectedResult"]')).toBeVisible();
      const box = (await sheet.boundingBox())!;
      expect(box.width, 'the sheet fills the phone').toBeGreaterThanOrEqual(370);
      await noSidewaysScroll(page, `390 ${id} sheet`);
      await page.keyboard.press('Escape');
      await expect(sheet).toBeHidden();
      // The focus goes back to the row that opened it.
      await expect(row.locator('[data-scenario-toggle]')).toBeFocused();
    }
  });

  test('the demo Testing stage says what can be tested where', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await signInThroughForm(page, seeded.account);
    await page.goto('/demo/testing', { waitUntil: 'domcontentloaded' });
    const legend = page.locator('[data-testing-scope-legend]');
    await expect(legend).toBeVisible({ timeout: 90000 });
    for (const scope of ['here-mock', 'your-system', 'tenant']) await expect(legend.locator(`[data-scope-entry="${scope}"]`)).toHaveCount(1);
    await expect(page.locator('main')).not.toContainText(/\bProven\b/);
  });
});

// ── Generating never does nothing (owner report 03.10.2026, v3.0.1) ───────────

/**
 * "Generate scenarios" was enabled while an input was missing or stale, and its
 * click returned without a word. Every missing input is now a sentence beside
 * the button with one action, the button is disabled while one is missing and
 * points at the sentences, and an enabled click starts or says why it did not.
 */
test.describe('generating the scenarios names what is missing', () => {
  test.describe.configure({ mode: 'serial' });
  let account: SeededProject;
  let noCodeId = '';
  let nothingId = '';
  let readyId = '';

  test('the rule: testing needs a design and generated code', () => {
    const base = { legacyCode: 'REPORT z.', analysis: '{}', solutionDesign: '# D', generatedCode: 'export const ok = true;' } as never;
    expect(generationPrerequisites(base, 'testing')).toEqual([]);
    const noCode = generationPrerequisites({ ...(base as object), generatedCode: '' } as never, 'testing');
    expect(noCode.map((p) => p.id)).toEqual(['code']);
    expect(noCode[0].action).toEqual({ label: 'Open Transformation', stage: 'transformation' });
  });

  test.beforeAll(async () => {
    test.setTimeout(180 * 1000);
    account = await seedStageProject({ prefix: 'tprereq', acceptTerms: true });
    noCodeId = await cloneProject(account, 'nocode', { testCases: [], generatedCode: '' });
    nothingId = await cloneProject(account, 'nothing', { testCases: [], generatedCode: '', solutionDesign: '' });
    readyId = await cloneProject(account, 'ready', { testCases: [] });
  });

  async function modelOn(page: Page) {
    await page.route('**/api/model-stages*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ stages: { analyze: true, design: true, transformation: true, documentation: true, testing: true }, keyAvailable: true, keySource: 'community' }),
      }),
    );
  }

  test('each missing input is a sentence with one action, and the button is disabled and says where', async ({ page }) => {
    test.setTimeout(300 * 1000);
    await modelOn(page);
    await signInThroughForm(page, account);
    for (const [width, height] of [[1440, 900], [390, 844]] as const) {
      await page.setViewportSize({ width, height });
      await openTesting(page, noCodeId);
      const why = page.locator('#testing-generate-why');
      await expect(why).toBeVisible();
      await expect(why.locator('[data-generation-prerequisite]')).toHaveCount(1);
      const code = why.locator('[data-generation-prerequisite="code"]');
      await expect(code).toContainText('No generated code yet');
      await expect(code.getByRole('link', { name: 'Open Transformation' })).toHaveAttribute('href', `/project/${noCodeId}/transformation`);
      const button = page.locator('[data-generate-scenarios]');
      await expect(button).toBeDisabled();
      await expect(button).toHaveAttribute('aria-describedby', 'testing-generate-why');
      await expect(button).not.toHaveAttribute('title', /./);
      await noSidewaysScroll(page, `${width} prerequisites`);

      await openTesting(page, nothingId);
      await expect(page.locator('#testing-generate-why [data-generation-prerequisite]')).toHaveCount(2);
      await expect(page.locator('#testing-generate-why [data-generation-prerequisite="design"]')).toBeVisible();
      await expect(page.locator('[data-generate-scenarios]')).toBeDisabled();
    }
  });

  test('with everything on record the button is enabled, and a click starts or says why it did not', async ({ page }) => {
    test.setTimeout(300 * 1000);
    await modelOn(page);
    // No model is called: the proxy answers with a refusal.
    await page.route('**/api/gemini', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'The model is not available in this test.' }) }));
    await signInThroughForm(page, account);
    await openTesting(page, readyId);
    await expect(page.locator('#testing-generate-why')).toHaveCount(0);
    const button = page.locator('[data-generate-scenarios]');
    await expect(button).toBeEnabled();
    await expect(button).not.toHaveAttribute('aria-describedby', /./);
    await button.click();
    await expect(page.locator('[data-test-generation-error]')).toBeVisible({ timeout: 30000 });
  });
});

// ── Pictures for a before/after sheet (`TSCOPE_SHOT=<dir>`, `TSCOPE_PHASE=before|after`); off in CI ──
test.describe('pictures', () => {
  test.skip(!process.env.TSCOPE_SHOT, 'pictures only on request');

  test('ABAP Unit, side-by-side and the demo, desktop and phone', async ({ page }) => {
    test.setTimeout(900 * 1000);
    const dir = process.env.TSCOPE_SHOT!;
    const phase = process.env.TSCOPE_PHASE || 'after';
    const { account, abapId, nodeId } = await seedBoth('tscope-shot');
    await page.route('**/api/model-stages*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ stages: { analyze: true, design: true, transformation: true, documentation: true, testing: true }, keyAvailable: true, keySource: 'community' }),
      }),
    );
    await signInThroughForm(page, account);
    const shots: Array<[string, string]> = [['abap', `/project/${abapId}/testing`], ['node', `/project/${nodeId}/testing`], ['demo', '/demo/testing']];
    for (const [name, url] of shots) {
      for (const [width, height] of [[1440, 900], [390, 844]] as const) {
        await page.setViewportSize({ width, height });
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('[data-stage-title]').first()).toBeVisible({ timeout: 90000 });
        await page.waitForTimeout(2500);
        await page.screenshot({ path: `${dir}/testing-scope-${phase}-${name}-${width}.png`, fullPage: true });
        const scenarios = page.locator('[data-testing-scenarios]');
        if (name !== 'demo' && (await scenarios.count()) > 0) {
          await scenarios.scrollIntoViewIfNeeded();
          await page.screenshot({ path: `${dir}/testing-scope-${phase}-${name}-${width}-scenarios.png` });
          const toggle = page.locator('[data-scenario-row]').nth(1).locator('[data-scenario-toggle]');
          if (phase === 'after' && (await toggle.count()) > 0) {
            await toggle.click();
            await page.waitForTimeout(500);
            if (width < 640) {
              await page.screenshot({ path: `${dir}/testing-scope-${phase}-${name}-${width}-details.png` });
              await page.keyboard.press('Escape');
            } else {
              await page.locator('[data-scenario-row]').nth(1).scrollIntoViewIfNeeded();
              await page.screenshot({ path: `${dir}/testing-scope-${phase}-${name}-${width}-details.png`, fullPage: true });
            }
          }
        }
      }
    }
  });
});
