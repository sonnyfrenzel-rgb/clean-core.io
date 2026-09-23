import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminSetDoc, adminGetDoc } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import {
  checkBlueprintShape,
  blueprintRejectionMessage,
} from '../app/(app)/project/[projectId]/documentation/blueprint-schema';

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

  test('absent optional levels are not a defect — the page already guards for absence', () => {
    expect(checkBlueprintShape({ l1_domain: { name: 'x' } }).ok).toBe(true);
  });

  test('a missing domain is refused, as it was before', () => {
    expect(checkBlueprintShape({ l4_tasks: [] }).ok).toBe(false);
    expect(checkBlueprintShape('a sentence, not JSON').ok).toBe(false);
  });

  test('the message says what was wrong, offers a retry, and invents no cause', () => {
    const text = blueprintRejectionMessage(checkBlueprintShape(OBJECTS_INSTEAD_OF_LISTS).problems);
    expect(text).toContain('nothing was saved');
    expect(text).toContain('Generate again');
    expect(text).toContain('not recorded');
    // No number, no "should", no guess at a cause.
    expect(text).not.toMatch(/\d+\s?%/);
    expect(text).not.toMatch(/\bshould\b/i);
  });
});

test.describe('the check runs before the write', () => {
  const EMAIL = `docshape-${Date.now()}@cleancore-test.io`;
  const PASSWORD = 'DocShape123!';
  const PROJECT_ID = `doc-shape-${Date.now()}`;
  const BROKEN_PROJECT_ID = `doc-shape-broken-${Date.now()}`;
  const RUN_ID = `doc-shape-run-${Date.now()}`;
  let uid = '';

  const projectFields = (overrides: Record<string, unknown>) => ({
    userId: uid,
    createdAt: new Date(),
    status: 'transformed',
    legacyCode: 'REPORT z_shape.\nSELECT * FROM vbak INTO TABLE @DATA(lt).\n',
    analysis: JSON.stringify({ cleanCoreScore: 62, standardFit: { potential: 'Medium' } }),
    cleanCoreScore: 62,
    solutionDesign: '# Target architecture\n\nSide-by-side on BTP.\n',
    generatedCode: 'export const ok = true;\n',
    activeRunId: RUN_ID,
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

    await adminSetDoc('projects', PROJECT_ID, projectFields({ name: 'Blueprint gate fixture' }));
    await adminSetDoc('projects', BROKEN_PROJECT_ID, projectFields({
      name: 'Stored broken blueprint fixture',
      status: 'documented',
      // Exactly what the old code stored: parsed fine, drew not at all.
      documentation: JSON.stringify(OBJECTS_INSTEAD_OF_LISTS),
    }));

    for (const id of [PROJECT_ID, BROKEN_PROJECT_ID]) {
      await adminSetDoc(`projects/${id}/runs`, RUN_ID, {
        runId: RUN_ID, projectId: id, userId: uid,
        createdAt: new Date().toISOString(), status: 'completed', cleanCoreScore: 62,
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

  /** The stage must believe it may call a model; whether this machine has a key is not the subject. */
  async function pretendTheStageMayGenerate(page: import('@playwright/test').Page) {
    await page.route('**/api/model-stages*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          stages: { analyze: true, design: true, transformation: true, documentation: true, testing: true },
          keyAvailable: true,
          keySource: 'community',
        }),
      }),
    );
  }

  test('a refused answer is not stored, and the reader is told what happened', async ({ page }) => {
    test.setTimeout(120 * 1000);
    await pretendTheStageMayGenerate(page);
    await page.route('**/api/gemini', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          text: '```json\n' + JSON.stringify(OBJECTS_INSTEAD_OF_LISTS) + '\n```',
          receipt: null,
        }),
      }),
    );

    await signIn(page);
    await page.goto(`/project/${PROJECT_ID}/documentation`, { waitUntil: 'domcontentloaded' });

    // Found by its words, not by an attribute this change introduced: the
    // counter-check has to run the old page far enough to store the answer,
    // which is the behaviour under test.
    const generate = page.getByRole('button', { name: /Start Architectural Mapping|Generate a new blueprint/i });
    await expect(generate).toBeVisible({ timeout: 30000 });
    await generate.click({ timeout: 15000 });

    const panel = page.locator('[data-doc-error="rejected"]');
    await expect(panel).toBeVisible({ timeout: 30000 });
    await expect(panel).toContainText('nothing was saved');
    await expect(panel).toContainText('Generate again');
    await expect(panel).toContainText('l4_tasks');

    // The stage is still the stage: the way to try again is on the screen.
    await expect(generate).toBeVisible();

    // And the project is untouched — this is the half that used to be permanent.
    const stored = await adminGetDoc('projects', PROJECT_ID);
    expect(stored?.documentation ?? null).toBeNull();
    expect(stored?.status).toBe('transformed');
  });

  test('a blueprint an earlier build stored leaves the stage operable', async ({ page }) => {
    test.setTimeout(120 * 1000);
    await pretendTheStageMayGenerate(page);
    await signIn(page);
    await page.goto(`/project/${BROKEN_PROJECT_ID}/documentation`, { waitUntil: 'domcontentloaded' });

    const notice = page.locator('[data-stored-blueprint-rejected]');
    await expect(notice).toBeVisible({ timeout: 30000 });
    await expect(notice).toContainText('not shown');
    await expect(notice).toContainText('Generating again replaces it');

    // The whole point of the finding: the button survives.
    await expect(
      page.getByRole('button', { name: /Start Architectural Mapping|Generate a new blueprint/i }),
    ).toBeVisible();
    await expect(page.locator('[data-stage-title]').first()).toBeVisible();
  });
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
