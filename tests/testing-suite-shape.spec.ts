import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminSetDoc, adminGetDoc } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import {
  checkTestSuiteShape,
  testSuiteRejectionMessage,
} from '../app/(app)/project/[projectId]/testing/test-suite-schema';

/**
 * Roadmap 17.2 — the documentation stage's defect, one stage over.
 *
 * `hooks/useTestGeneration.ts` read `result.testCases || []` off a parsed model
 * answer. `{}` is truthy, so an object passed the fallback, was written with
 * `status: 'testing'`, and `testing/page.tsx` asked it for `.map` on every
 * load. This segment had no `error.tsx`, so the crash reached the root boundary
 * and took the "Generate Test Suite" button — the only way out — off the screen
 * with everything else.
 *
 * Three halves, tested separately:
 *
 *   1. the check runs *before* the write, so a refused answer leaves the
 *      project exactly as it was and the reader is told what happened;
 *   2. a suite that got through anyway — one written by an earlier build —
 *      leaves the stage operable rather than dead;
 *   3. the segment has an error boundary of its own, so that even a genuine
 *      render error keeps the workflow shell and a way out on the screen.
 */

const ROOT = path.resolve(__dirname, '..');
const SEGMENT = path.join(ROOT, 'app', '(app)', 'project', '[projectId]', 'testing');

/** A suite the page can draw: every list is a list, every raw child is text. */
const GOOD_SUITE = {
  testCases: [
    {
      id: 'TC_01',
      name: 'Rejects a negative amount',
      category: 'Validation',
      description: 'A negative amount is classified INVALID.',
      preconditions: 'None',
      steps: ['Call the service with -1', 'Read the verdict'],
      expectedResult: 'INVALID',
      priority: 'High',
      testData: '-1',
      validationPoints: ['verdict === INVALID'],
    },
  ],
  testSuite: { code: "import { test } from 'node:test';\n" },
  manualTestingRequirements: [
    { area: 'Authority checks', reason: 'Not reachable from the sandbox.', verificationSteps: ['Run in the tenant'] },
  ],
  coverageEstimate: { percentage: 70, explanation: 'Core logic covered.', missingCoverage: 'Authority checks.' },
};

/**
 * The defect as it reaches Firestore: `testCases` keyed by id instead of listed.
 * Valid JSON, truthy, and `|| []` waved it straight through to `.map`.
 */
const TEST_CASES_AS_OBJECT = {
  ...GOOD_SUITE,
  testCases: {
    TC_01: { id: 'TC_01', name: 'Rejects a negative amount', category: 'Validation', priority: 'High' },
  },
};

test.describe('the shape check itself', () => {
  test('a suite the page can draw passes', () => {
    expect(checkTestSuiteShape(GOOD_SUITE)).toEqual({ ok: true, problems: [] });
  });

  test('test cases as an object are named — the case list maps them', () => {
    const result = checkTestSuiteShape(TEST_CASES_AS_OBJECT);
    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toContain('testCases');
  });

  test('a test case that is not an object is caught — the list reads its id', () => {
    const result = checkTestSuiteShape({ ...GOOD_SUITE, testCases: ['TC_01', null] });
    expect(result.ok).toBe(false);
    expect(result.problems).toHaveLength(2);
  });

  test('manual requirements as an object are caught — the panel maps them', () => {
    const result = checkTestSuiteShape({
      ...GOOD_SUITE,
      manualTestingRequirements: { auth: { area: 'Authority checks', reason: 'x' } },
    });
    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toContain('manualTestingRequirements');
  });

  test('a leaf React would choke on is caught, one level below the shapes', () => {
    // The lesson the documentation stage paid for a commit later: checking the
    // containers and not what is in them leaves the same crash one level down.
    // These four are the fields `testing/page.tsx` hands React *raw*, with no
    // `renderSafeValue` between — measured in the page, not taken from
    // `lib/types.ts`.
    const objectArea = checkTestSuiteShape({
      ...GOOD_SUITE,
      manualTestingRequirements: [{ area: { name: 'Authority checks' }, reason: 'x', verificationSteps: [] }],
    });
    expect(objectArea.ok, 'an object where the requirement heading is rendered').toBe(false);
    expect(objectArea.problems.join(' ')).toContain('manualTestingRequirements[0].area');

    const objectStep = checkTestSuiteShape({
      ...GOOD_SUITE,
      manualTestingRequirements: [{ area: 'a', reason: 'b', verificationSteps: ['Run it', { step: 2 }] }],
    });
    expect(objectStep.ok, 'an object inside the verification steps, which are rendered as one raw child').toBe(false);
    expect(objectStep.problems.join(' ')).toContain('verificationSteps[1]');

    const objectExplanation = checkTestSuiteShape({
      ...GOOD_SUITE,
      coverageEstimate: { percentage: 70, explanation: { text: 'Core logic covered.' } },
    });
    expect(objectExplanation.ok, 'an object where "Logic Analysis" is rendered').toBe(false);
    expect(objectExplanation.problems.join(' ')).toContain('coverageEstimate.explanation');

    const objectCode = checkTestSuiteShape({ ...GOOD_SUITE, testSuite: { code: { ts: 'x' } } });
    expect(objectCode.ok, 'an object in the <pre> that prints the suite').toBe(false);
    expect(objectCode.problems.join(' ')).toContain('testSuite.code');

    // And the other half: numbers render, so they are not a defect, and the
    // leaves that only ever reach `renderSafeValue` or a template literal are
    // left alone — refusing those would reject suites the stage can display.
    expect(
      checkTestSuiteShape({
        ...GOOD_SUITE,
        // Every one of these is a test-case field, and every test-case field on
        // this page goes through `renderSafeValue` before it reaches the screen.
        testCases: [{ id: { v: 'TC_01' }, name: { v: 'x' }, description: { v: 'y' }, steps: { a: 'b' } }],
        // `percentage` only lands inside a template literal: `[object Object]%`
        // is wrong on screen and does not take the page down.
        coverageEstimate: { percentage: { value: 70 }, explanation: 'ok', missingCoverage: 'none' },
        manualTestingRequirements: [{ area: 1, reason: 2, verificationSteps: 3 }],
      }).ok,
      'these are cosmetic, and rejecting them would refuse suites the stage can draw',
    ).toBe(true);
  });

  test('absent fields are not a defect — the page already guards for absence', () => {
    expect(checkTestSuiteShape({}).ok).toBe(true);
    expect(checkTestSuiteShape({ testCases: [] }).ok).toBe(true);
  });

  test('an answer that is not an object at all is refused', () => {
    expect(checkTestSuiteShape('a sentence, not JSON').ok).toBe(false);
    expect(checkTestSuiteShape(null).ok).toBe(false);
    expect(checkTestSuiteShape([GOOD_SUITE]).ok).toBe(false);
  });

  test('the message says what was wrong, offers a retry, and invents no cause', () => {
    const text = testSuiteRejectionMessage(checkTestSuiteShape(TEST_CASES_AS_OBJECT).problems);
    expect(text).toContain('nothing was saved');
    expect(text).toContain('Generate again');
    expect(text).toContain('not recorded');
    // No number, no "should", no guess at a cause.
    expect(text).not.toMatch(/\d+\s?%/);
    expect(text).not.toMatch(/\bshould\b/i);
  });
});

test.describe('the check runs before the write', () => {
  const EMAIL = `testshape-${Date.now()}@cleancore-test.io`;
  const PASSWORD = 'TestShape123!';
  const PROJECT_ID = `test-shape-${Date.now()}`;
  const BROKEN_PROJECT_ID = `test-shape-broken-${Date.now()}`;
  const RUN_ID = `test-shape-run-${Date.now()}`;
  let uid = '';

  const projectFields = (overrides: Record<string, unknown>) => ({
    userId: uid,
    createdAt: new Date(),
    status: 'documented',
    legacyCode: 'REPORT z_shape.\nSELECT * FROM vbak INTO TABLE @DATA(lt).\n',
    analysis: JSON.stringify({ cleanCoreScore: 62, standardFit: { potential: 'Medium' } }),
    cleanCoreScore: 62,
    solutionDesign: '# Target architecture\n\nSide-by-side on BTP.\n',
    generatedCode: 'export const ok = true;\n',
    documentation: JSON.stringify({ l1_domain: { name: 'Order to Cash' } }),
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
      firstName: 'Test', lastName: 'Shape', email: EMAIL,
      tier: 'pilot', status: 'approved',
      transformationsUsed: 1, transformationsLimit: 50, createdAt: new Date(),
    });

    await adminSetDoc('projects', PROJECT_ID, projectFields({ name: 'Test suite gate fixture' }));
    await adminSetDoc('projects', BROKEN_PROJECT_ID, projectFields({
      name: 'Stored broken suite fixture',
      status: 'testing',
      // Exactly what the old code stored: parsed fine, rendered not at all.
      testCases: TEST_CASES_AS_OBJECT.testCases,
      testSuite: GOOD_SUITE.testSuite,
      coverageEstimate: GOOD_SUITE.coverageEstimate,
      manualTestingRequirements: GOOD_SUITE.manualTestingRequirements,
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
        body: JSON.stringify({ text: JSON.stringify(TEST_CASES_AS_OBJECT), receipt: null }),
      }),
    );

    await signIn(page);
    await page.goto(`/project/${PROJECT_ID}/testing`, { waitUntil: 'domcontentloaded' });

    // Found by its words, not by an attribute this change introduced: the
    // counter-check has to run the old page far enough to store the answer,
    // which is the behaviour under test.
    const generate = page.getByRole('button', { name: /Generate Test Suite/i });
    await expect(generate).toBeVisible({ timeout: 30000 });
    await generate.click({ timeout: 15000 });

    const notice = page.locator('[data-test-generation-error]');
    await expect(notice).toBeVisible({ timeout: 30000 });
    await expect(notice).toContainText('nothing was saved');
    await expect(notice).toContainText('Generate again');
    await expect(notice).toContainText('testCases');

    // The stage is still the stage: the way to try again is on the screen.
    await expect(generate).toBeVisible();

    // And the project is untouched — this is the half that used to be permanent.
    const stored = await adminGetDoc('projects', PROJECT_ID);
    expect(stored?.testCases ?? null).toBeNull();
    expect(stored?.status).toBe('documented');
  });

  test('a suite an earlier build stored leaves the stage operable', async ({ page }) => {
    test.setTimeout(120 * 1000);
    await pretendTheStageMayGenerate(page);
    await signIn(page);
    await page.goto(`/project/${BROKEN_PROJECT_ID}/testing`, { waitUntil: 'domcontentloaded' });

    const notice = page.locator('[data-stored-test-suite-rejected]');
    await expect(notice).toBeVisible({ timeout: 30000 });
    await expect(notice).toContainText('not shown');
    await expect(notice).toContainText('Generating again replaces it');

    // The whole point of the finding: the button survives.
    await expect(page.getByRole('button', { name: /Generate Test Suite/i })).toBeVisible();
    await expect(page.locator('[data-stage-title]').first()).toBeVisible();
    // And the root boundary never fired — the stage is on the screen, not a crash card.
    await expect(page.locator('[data-testing-error-boundary]')).toHaveCount(0);
  });
});

test.describe('the testing segment has an error boundary of its own', () => {
  test('error.tsx sits in the segment, not only at the root', () => {
    const boundary = path.join(SEGMENT, 'error.tsx');
    expect(fs.existsSync(boundary), `missing: ${boundary}`).toBe(true);

    const src = fs.readFileSync(boundary, 'utf8');
    expect(src.startsWith("'use client'")).toBe(true);
    // The two things a boundary is for: retrying, and getting out.
    expect(src).toContain('reset()');
    expect(src).toContain('data-testing-error-retry');
    expect(src).toContain('data-testing-error-back');
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
