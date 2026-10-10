import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminSetDoc, adminGetDoc } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import { sha256Hex } from '../lib/artefact-digest';
import { signInViaLanding } from './helpers/sign-in';
import { TERMS_VERSION } from '../lib/constants';

/**
 * QA findings 0d8443fae823 / 58201e6aaedb — a blueprint with the wrong field
 * types was stored as `documentation` with `status: 'documented'`, and the page
 * then crashed on every load while trying to draw it.
 *
 * Roadmap 3.0.7 ("Documentation lean") retired the rendering of a legacy
 * blueprint: it is one strip now — download it as it was, or replace it with
 * the code reading — so no field of it is read and its shape check
 * (`checkBlueprintShape`) went with the rendering. What is held here: the
 * stage reads the code and stores the engine form; a legacy blueprint, well
 * formed or not, is kept untouched behind the strip; a document in the
 * engine's form the stage cannot read leaves the stage operable; and the
 * segment has an error boundary of its own.
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

test.describe('the documentation is read from the code, and a legacy blueprint is kept behind one strip', () => {
  const EMAIL = `docshape-${Date.now()}@cleancore-test.io`;
  const PASSWORD = 'DocShape123!';
  const PROJECT_ID = `doc-shape-${Date.now()}`;
  const BROKEN_PROJECT_ID = `doc-shape-broken-${Date.now()}`;
  const LEGACY_PROJECT_ID = `doc-shape-legacy-${Date.now()}`;
  const REJECTED_PROJECT_ID = `doc-shape-rejected-${Date.now()}`;
  /** A document that says it is the engine's and is not readable as one. */
  const ENGINE_INVALID = JSON.stringify({ format: 'engine-process-documentation' });
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
      tier: 'pilot', status: 'approved', termsVersionAccepted: TERMS_VERSION,
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
    await adminSetDoc('projects', REJECTED_PROJECT_ID, projectFields({
      name: 'Stored unreadable engine documentation fixture',
      status: 'documented',
      documentation: ENGINE_INVALID,
    }));

    for (const id of [PROJECT_ID, BROKEN_PROJECT_ID, LEGACY_PROJECT_ID, REJECTED_PROJECT_ID]) {
      await adminSetDoc(`projects/${id}/runs`, RUN_ID, {
        runId: RUN_ID, projectId: id, userId: uid,
        createdAt: new Date().toISOString(), status: 'completed', cleanCoreScore: 62,
        inputFingerprint: fingerprint,
      });
    }
  });

  /**
   * The model switched off for this browser: `/api/model-stages` answers with
   * no key, so opening the stage writes only what the engine reads and calls no
   * model (owner 03.10.2026 — the business layer starts on its own only where a
   * model is available).
   */
  async function modelOff(page: import('@playwright/test').Page) {
    await page.route('**/api/model-stages', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ stages: {}, keyAvailable: false, keySource: null }),
    }));
  }

  /** Signs in through the real form, as the other rendered specs do. */
  async function signIn(page: import('@playwright/test').Page) {
    await signInViaLanding(page, EMAIL, PASSWORD);
  }

  test('opening the stage reads the whole source, calls no model and stores the engine form', async ({ page }) => {
    test.setTimeout(180 * 1000);
    let modelCalls = 0;
    await page.route('**/api/gemini', (route) => {
      modelCalls += 1;
      return route.abort();
    });
    await modelOff(page);

    await signIn(page);
    await page.goto(`/project/${PROJECT_ID}/documentation`, { waitUntil: 'domcontentloaded' });

    // Owner 03.10.2026: opening the stage writes the document — no click.
    const view = page.locator('[data-engine-documentation]');
    await expect(view).toBeVisible({ timeout: 90000 });
    await expect(page.locator('[data-process-document]')).toBeVisible();
    // Section 9 is the project's one list of open questions (ADR-081); the
    // engine's questions about the requirements stand in appendix A.4.
    await expect(page.locator('[data-doc-section="questions"] [data-doc-open-question]').first()).toBeVisible();
    await expect(page.locator('[data-doc-requirement-question-list]')).toBeAttached();
    await expect(page.locator('[data-doc-requirement-question-list]')).toContainText('Questions about the requirements');
    await expect(page.locator('[data-doc-section="rules"]')).toContainText('50000.00');
    const stored = await adminGetDoc('projects', PROJECT_ID);
    const doc = JSON.parse(String(stored?.documentation));
    expect(doc.format).toBe('engine-process-documentation');
    expect(doc.sourceSha256).toBe(sha256Hex(SOURCE));
    expect(JSON.stringify(doc)).not.toContain('l1_domain');
    // Roadmap 3.0.7, item 4: the stage writes nothing into the generated
    // package — Delivery adds the documentation file from the field itself.
    expect(stored?.generatedCode).toBe('export const ok = true;\n');
    expect(stored?.status).toBe('documented');
    expect(modelCalls, 'the documentation stage called a model').toBe(0);
  });

  test('a legacy blueprint is one strip: downloaded as it was, never drawn, left untouched', async ({ page }) => {
    test.setTimeout(120 * 1000);
    await modelOff(page);
    await signIn(page);
    await page.goto(`/project/${LEGACY_PROJECT_ID}/documentation`, { waitUntil: 'domcontentloaded' });

    const strip = page.locator('[data-legacy-blueprint]');
    await expect(strip).toBeVisible({ timeout: 30000 });
    await expect(strip).toContainText('from before 3.0.5');
    // Its rendering is gone: none of its fields is on the page.
    await expect(page.locator('body')).not.toContainText('Order to Cash');
    await expect(page.locator('[data-task-card]')).toHaveCount(0);
    // The file, exactly as it was stored.
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30000 }),
      strip.locator('[data-legacy-blueprint-download]').click(),
    ]);
    const file = await download.path();
    expect(fs.readFileSync(file!, 'utf8')).toBe(JSON.stringify(GOOD_BLUEPRINT));
    // The owner may replace it; nothing replaces it by itself.
    await expect(strip.locator('[data-legacy-blueprint-replace]')).toBeVisible();
    await page.waitForTimeout(2000);
    const stored = await adminGetDoc('projects', LEGACY_PROJECT_ID);
    expect(stored?.documentation).toBe(JSON.stringify(GOOD_BLUEPRINT));
  });

  test('a blueprint an earlier build stored with broken lists is kept behind the same strip', async ({ page }) => {
    test.setTimeout(120 * 1000);
    await modelOff(page);
    await signIn(page);
    await page.goto(`/project/${BROKEN_PROJECT_ID}/documentation`, { waitUntil: 'domcontentloaded' });
    // Nothing reads its fields any more, so its shape cannot take the stage down.
    await expect(page.locator('[data-legacy-blueprint]')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('[data-legacy-blueprint-replace]')).toBeVisible();
    await expect(page.locator('[data-stage-title]').first()).toBeVisible();
  });

  test('a document in the engine form the stage cannot read leaves the stage operable', async ({ page }) => {
    test.setTimeout(120 * 1000);
    await modelOff(page);
    await signIn(page);
    await page.goto(`/project/${REJECTED_PROJECT_ID}/documentation`, { waitUntil: 'domcontentloaded' });

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
  const tx = body.slice(body.indexOf('runTransaction('), body.indexOf("...cleanup });"));
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
