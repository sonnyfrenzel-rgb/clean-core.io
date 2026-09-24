import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminSetDoc, adminGetDoc } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import { checkBlueprintShape } from '../app/(app)/project/[projectId]/documentation/blueprint-schema';
import { sha256Hex } from '../lib/artefact-digest';

/**
 * QA findings 0d8443fae823 / 58201e6aaedb — a blueprint with the wrong field
 * types was stored as `documentation` with `status: 'documented'`, and the page
 * then crashed on every load while trying to draw it.
 *
 * Two halves, tested separately:
 *
 *   1. the check runs *before* the write, so a refused answer leaves the
 *      project exactly as it was and the reader is told what happened;
 *   2. a document that got through anyway — one written by an earlier build —
 *      leaves the stage operable rather than dead, and the segment has an error
 *      boundary of its own so that even a genuine render error keeps the
 *      workflow shell and a way out on the screen.
 */

const ROOT = path.resolve(__dirname, '..');
const SEGMENT = path.join(ROOT, 'app', '(app)', 'project', '[projectId]', 'documentation');

/** A blueprint the page can draw: every list is a list. */
const GOOD_BLUEPRINT = {
  l1_domain: { name: 'Order to Cash', strategicGoal: 'Clean core', owner: 'Process Owner' },
  l2_group: { name: 'Sales', processArea: 'Order handling', kpis: ['Cycle time'] },
  l3_flow: [
    { id: 'Start', name: 'Trigger', type: 'startEvent', role: 'System', next: ['Task1'] },
    { id: 'Task1', name: 'Check order', type: 'serviceTask', role: 'System', next: ['End'] },
    { id: 'End', name: 'Done', type: 'endEvent', role: 'System', next: [] },
  ],
  l4_tasks: [
    {
      stepId: 'Task1',
      name: 'Check order',
      description: 'Checks the order.',
      inputs: ['Order'],
      outputs: ['Result'],
      systems: ['SAP S/4HANA'],
      complexity: 'Low',
    },
  ],
};

/**
 * The same blueprint as a model actually returned it in the finding: the two
 * lists the page reads with `.map`, `.find` and `.join` came back as objects
 * keyed by step id. It is valid JSON, it has `l1_domain`, and `{}` is truthy —
 * which is exactly why every guard on the page waved it through.
 */
const OBJECTS_INSTEAD_OF_LISTS = {
  l1_domain: { name: 'Order to Cash', strategicGoal: 'Clean core', owner: 'Process Owner' },
  l2_group: { name: 'Sales', processArea: 'Order handling', kpis: { first: 'Cycle time' } },
  l3_flow: [
    { id: 'Start', name: 'Trigger', type: 'startEvent', role: 'System', next: ['Task1'] },
    { id: 'Task1', name: 'Check order', type: 'serviceTask', role: 'System', next: ['End'] },
  ],
  l4_tasks: {
    Task1: { stepId: 'Task1', name: 'Check order', description: 'Checks the order.' },
  },
};

test.describe('the shape check itself', () => {
  test('a blueprint the page can draw passes', () => {
    expect(checkBlueprintShape(GOOD_BLUEPRINT)).toEqual({ ok: true, problems: [] });
  });

  test('the fields the page reads as lists are named when they are not lists', () => {
    const result = checkBlueprintShape(OBJECTS_INSTEAD_OF_LISTS);
    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toContain('l4_tasks');
    expect(result.problems.join(' ')).toContain('l2_group.kpis');
  });

  test('a task whose inputs are not a list is caught — the drawer maps them', () => {
    const result = checkBlueprintShape({
      ...GOOD_BLUEPRINT,
      l4_tasks: [{ stepId: 'Task1', name: 'x', inputs: { a: 'Order' } }],
    });
    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toContain('l4_tasks[0].inputs');
  });

  test('a flow element that is not an object is caught — ProcessFlow reads its id and role', () => {
    const result = checkBlueprintShape({ ...GOOD_BLUEPRINT, l3_flow: ['Start', null] });
    expect(result.ok).toBe(false);
    expect(result.problems).toHaveLength(2);
  });

  test('a leaf React would choke on is caught, one level below the shapes', () => {
    // The first version of this gate checked the containers and not what is in
    // them, which left the same crash one level down: a flow node with a string
    // `id` and an array `next` passed, and then `<span>{data.label}</span>` got
    // an object and React threw *Objects are not valid as a React child* — same
    // stage, same stored document, same dead end (QA review of 0cb64a5bd6e5,
    // bc2a0948dafe).
    const objectRole = checkBlueprintShape({
      ...GOOD_BLUEPRINT,
      l3_flow: [{ id: 'n1', name: 'Check credit', role: { title: 'Clerk' }, next: [] }],
    });
    expect(objectRole.ok, 'an object where a swimlane label is rendered').toBe(false);
    expect(objectRole.problems.join(' ')).toContain('l3_flow[0].role');

    const objectCaption = checkBlueprintShape({
      ...GOOD_BLUEPRINT,
      l3_flow: [{ id: 'n1', name: { text: 'Check credit' }, next: [] }],
    });
    expect(objectCaption.ok, 'an object where the element caption is rendered').toBe(false);

    // A KPI is rendered on its own inside a pill.
    const objectKpi = checkBlueprintShape({
      ...GOOD_BLUEPRINT,
      l2_group: { kpis: ['Lead time', { value: 42 }] },
    });
    expect(objectKpi.ok, 'an object in the KPI list').toBe(false);
    expect(objectKpi.problems.join(' ')).toContain('l2_group.kpis[1]');

    // A successor that is not a name never matches a node, so the diagram loses
    // an edge silently — wrong to store as a drawing of this process.
    const badSuccessor = checkBlueprintShape({
      ...GOOD_BLUEPRINT,
      l3_flow: [{ id: 'n1', name: 'Start', next: ['n2', { id: 'n3' }] }],
    });
    expect(badSuccessor.ok).toBe(false);
    expect(badSuccessor.problems.join(' ')).toContain('l3_flow[0].next[1]');

    // And the other half: numbers render, so they are not a defect, and the
    // leaves that only ever reach `.join()` or a template literal are left
    // alone — refusing those would reject blueprints the stage can draw.
    expect(
      checkBlueprintShape({
        ...GOOD_BLUEPRINT,
        l2_group: { kpis: [98, 'Lead time'] },
        l3_flow: [{ id: 'n1', name: 42, role: 7, next: [] }],
      }).ok,
      'a number is a thing React renders',
    ).toBe(true);
  });

  test('absent optional levels are not a defect — the page already guards for absence', () => {
    expect(checkBlueprintShape({ l1_domain: { name: 'x' } }).ok).toBe(true);
  });

  test('a missing domain is refused, as it was before', () => {
    expect(checkBlueprintShape({ l4_tasks: [] }).ok).toBe(false);
    expect(checkBlueprintShape('a sentence, not JSON').ok).toBe(false);
  });

  test('nothing writes this form any more — the model generator is gone from the stage', () => {
    // Roadmap 3.0.5, Weg C: the check guards the read side only. The page reads
    // the whole source through the engine; the prompt that sliced 1,000
    // characters out of three artefacts and asked for L1–L4 is not in it.
    const page = fs.readFileSync(path.join(SEGMENT, 'page.tsx'), 'utf8');
    expect(page).not.toContain('.substring(0, 1000)');
    expect(page).not.toContain('"l1_domain": {');
    expect(page).toContain("import('@/lib/process-documentation-build')");
    expect(fs.readFileSync(path.join(SEGMENT, 'blueprint-schema.ts'), 'utf8')).not.toContain('blueprintRejectionMessage');
  });
});

test.describe('the documentation is read from the code, and a legacy blueprint stays readable', () => {
  const EMAIL = `docshape-${Date.now()}@cleancore-test.io`;
  const PASSWORD = 'DocShape123!';
  const PROJECT_ID = `doc-shape-${Date.now()}`;
  const BROKEN_PROJECT_ID = `doc-shape-broken-${Date.now()}`;
  const LEGACY_PROJECT_ID = `doc-shape-legacy-${Date.now()}`;
  const RUN_ID = `doc-shape-run-${Date.now()}`;
  let uid = '';

  // The shipped example, so the rule after character 1,000 is a real one
  // (QA24-A10): the 50,000 EUR emergency limit stands on line 422.
  const SOURCE = fs.readFileSync(path.join(ROOT, 'public', 'starter-examples', 'Z_MM_PO_APPROVAL.abap'), 'utf8')
    .replace(/\r\n/g, '\n');
  const fingerprint = {
    sha256: sha256Hex(SOURCE),
    fileName: 'Z_MM_PO_APPROVAL.abap',
    lineCount: SOURCE.split('\n').length,
    byteSize: SOURCE.length,
    objectType: 'Report',
    uploadedAt: new Date().toISOString(),
  };

  const projectFields = (overrides: Record<string, unknown>) => ({
    userId: uid,
    createdAt: new Date(),
    status: 'transformed',
    legacyCode: SOURCE,
    analysis: JSON.stringify({ cleanCoreScore: 62, standardFit: { potential: 'Medium' } }),
    cleanCoreScore: 62,
    solutionDesign: '# Target architecture\n\nSide-by-side on BTP.\n',
    generatedCode: 'export const ok = true;\n',
    activeRunId: RUN_ID,
    inputFingerprint: fingerprint,
    ...overrides,
  });

  test.beforeAll(async () => {
    const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
    const auth = getAuth(app);
    try {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    } catch { /* already connected */ }

    const cred = await createUserWithEmailAndPassword(auth, EMAIL, PASSWORD);
    uid = cred.user.uid;

    await adminSetDoc('users', uid, {
      firstName: 'Doc', lastName: 'Shape', email: EMAIL,
      tier: 'pilot', status: 'approved',
      transformationsUsed: 1, transformationsLimit: 50, createdAt: new Date(),
    });

    await adminSetDoc('projects', PROJECT_ID, projectFields({ name: 'Engine documentation fixture' }));
    await adminSetDoc('projects', BROKEN_PROJECT_ID, projectFields({
      name: 'Stored broken blueprint fixture',
      status: 'documented',
      // Exactly what the old code stored: parsed fine, drew not at all.
      documentation: JSON.stringify(OBJECTS_INSTEAD_OF_LISTS),
    }));
    await adminSetDoc('projects', LEGACY_PROJECT_ID, projectFields({
      name: 'Stored legacy blueprint fixture',
      status: 'documented',
      documentation: JSON.stringify(GOOD_BLUEPRINT),
    }));

    for (const id of [PROJECT_ID, BROKEN_PROJECT_ID, LEGACY_PROJECT_ID]) {
      await adminSetDoc(`projects/${id}/runs`, RUN_ID, {
        runId: RUN_ID, projectId: id, userId: uid,
        createdAt: new Date().toISOString(), status: 'completed', cleanCoreScore: 62,
        inputFingerprint: fingerprint,
      });
    }
  });

  /** Signs in through the real form, as the other rendered specs do. */
  async function signIn(page: import('@playwright/test').Page) {
    await page.goto('/');
    await page.click('a:has-text("Get Free Access"), button:has-text("Get Free Access")');
    await page.waitForSelector('input[type="email"]');
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]:has-text("Sign In")');
    await page.waitForTimeout(4000);
  }

  test('the button reads the whole source, calls no model and stores the engine form', async ({ page }) => {
    test.setTimeout(180 * 1000);
    let modelCalls = 0;
    await page.route('**/api/gemini', (route) => {
      modelCalls += 1;
      return route.abort();
    });

    await signIn(page);
    await page.goto(`/project/${PROJECT_ID}/documentation`, { waitUntil: 'domcontentloaded' });

    // Nothing is written by opening the stage.
    const generate = page.locator('[data-generate-blueprint]');
    await expect(generate).toBeEnabled({ timeout: 60000 });
    expect((await adminGetDoc('projects', PROJECT_ID))?.documentation ?? null).toBeNull();

    await generate.click();
    const view = page.locator('[data-engine-documentation]');
    await expect(view).toBeVisible({ timeout: 60000 });
    await expect(page.locator('[data-doc-gaps]')).toContainText('Process owner');
    await expect(page.locator('[data-doc-statements]')).toContainText('50000.00');

    const stored = await adminGetDoc('projects', PROJECT_ID);
    const doc = JSON.parse(String(stored?.documentation));
    expect(doc.format).toBe('engine-process-documentation');
    expect(doc.sourceSha256).toBe(sha256Hex(SOURCE));
    expect(JSON.stringify(doc)).not.toContain('l1_domain');
    expect(String(stored?.generatedCode)).toContain('docs/process-blueprint.md');
    expect(stored?.status).toBe('documented');
    expect(modelCalls, 'the documentation stage called a model').toBe(0);
  });

  test('a legacy blueprint is shown as the earlier form and left untouched', async ({ page }) => {
    test.setTimeout(120 * 1000);
    await signIn(page);
    await page.goto(`/project/${LEGACY_PROJECT_ID}/documentation`, { waitUntil: 'domcontentloaded' });

    const notice = page.locator('[data-legacy-blueprint]');
    await expect(notice).toBeVisible({ timeout: 30000 });
    await expect(notice).toContainText('Earlier form');
    await expect(page.locator('[data-stage-output="documentation"]')).toContainText('Order to Cash');
    const stored = await adminGetDoc('projects', LEGACY_PROJECT_ID);
    expect(stored?.documentation).toBe(JSON.stringify(GOOD_BLUEPRINT));
  });

  test('a blueprint an earlier build stored leaves the stage operable', async ({ page }) => {
    test.setTimeout(120 * 1000);
    await signIn(page);
    await page.goto(`/project/${BROKEN_PROJECT_ID}/documentation`, { waitUntil: 'domcontentloaded' });

    const notice = page.locator('[data-stored-blueprint-rejected]');
    await expect(notice).toBeVisible({ timeout: 30000 });
    await expect(notice).toContainText('not shown');
    await expect(notice).toContainText('Generating again replaces it');

    // The whole point of the finding: the button survives.
    await expect(page.locator('[data-generate-blueprint]')).toBeVisible();
    await expect(page.locator('[data-stage-title]').first()).toBeVisible();
  });
});

// QA review of 4b4586aff273: the transaction wrote the document and
// `status: 'documented'` without asking whether the project still stood on the
// run the document was built from.
test('the documentation is written only onto the run and source it was built from', () => {
  const page = fs.readFileSync(path.join(ROOT, 'app', '(app)', 'project', '[projectId]', 'documentation', 'page.tsx'), 'utf8');
  const start = page.indexOf('const generateDocumentation = useCallback(');
  const body = page.slice(start, page.indexOf('}, [projectId, project, signedSource', start));
  const tx = body.slice(body.indexOf('runTransaction('), body.indexOf("status: 'documented' });"));
  expect(tx, 'the transaction does not compare the run').toContain('current.activeRunId !== builtFromRun');
  expect(tx, 'the transaction does not compare the source').toContain('current.legacyCode !== signedSource.source');
  expect(tx.indexOf('throw new Error('), 'a moved run is written anyway').toBeLessThan(tx.indexOf('tx.update('));
  // And the page shows the document only after it is stored.
  expect(body.indexOf('setDocumentation(stored)')).toBeGreaterThan(body.indexOf('runTransaction('));
});

test.describe('the documentation segment has an error boundary of its own', () => {
  test('error.tsx sits in the segment, not only at the root', () => {
    const boundary = path.join(SEGMENT, 'error.tsx');
    expect(fs.existsSync(boundary), `missing: ${boundary}`).toBe(true);

    const src = fs.readFileSync(boundary, 'utf8');
    expect(src.startsWith("'use client'")).toBe(true);
    // The two things a boundary is for: retrying, and getting out.
    expect(src).toContain('reset()');
    expect(src).toContain('data-documentation-error-retry');
    expect(src).toContain('data-documentation-error-back');
    // Scoped to the page: a full-screen card here would hide the workflow shell
    // exactly the way the root boundary did.
    expect(src).not.toContain('min-h-screen');
  });

  test('the root boundary is left alone', () => {
    const root = fs.readFileSync(path.join(ROOT, 'app', 'error.tsx'), 'utf8');
    expect(root).toContain('Something went wrong!');
    expect(root).toContain('min-h-screen');
  });
});
