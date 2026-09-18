import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminSetDoc, adminSetCustomClaim } from './helpers/admin-seed';
import { receiptFor } from './helpers/test-receipt';
import firebaseConfig from '../firebase-config.json';
import { nextOpenPoint } from '../lib/next-step';
import { workflowSteps, workflowSummary } from '../lib/workflow-steps';
import type { Project, TestCase } from '../lib/types';

/**
 * Roadmap 6.5 — "Nächster Schritt": *"regelbasiert der nächste offene Punkt mit
 * Grund, ohne Modellaufruf"*. Three things are checked here, and each is the
 * reason the row exists rather than an incidental property of the code:
 *
 *   - **`nextOpenPoint` invents no second idea of "open".** It is a thin read
 *     of `workflowSummary(workflowSteps(project))` — the one phase contract
 *     the stepper, the rail, the dashboard and delivery already agree on
 *     (roadmap 1.7) — so a project that this suite never constructs still gets
 *     an honest answer instead of a guess this module made up on its own.
 *   - **It never sends a reader at a button that can only fail.** Design,
 *     Transformation, Documentation and Testing cannot produce their own
 *     artefact without a model call; when the next open phase has nothing on
 *     record yet *and* the account has switched that model off, the reason
 *     says so instead of reading like an instruction the reader cannot follow
 *     (roadmap 1.2 / V25-A12, the same rule the stage pages already apply to
 *     their own button).
 *   - **It never calls a model.** The whole point of the roadmap row. Proven
 *     from the source, not trusted from a comment.
 */

/* ------------------------------------------------------------- fixtures */

const draft: TestCase[] = [
  { id: 't1', name: 'Totals', category: 'Unit', description: 'd', priority: 'High' },
  { id: 't2', name: 'Rounding', category: 'Unit', description: 'd', priority: 'Medium' },
];

const SUITE = { code: "import { test } from 'node:test';\ntest('t1', () => {});\n" };

/** A project with an executed suite behind it — verdicts and the server-written receipt. */
const finished = (over: Partial<Project> = {}): Project => {
  const base: Project = {
    name: 'Next step fixture',
    legacyCode: 'REPORT z_done.\n',
    activeRunId: 'run-1',
    cleanCoreScore: 62,
    solutionDesign: '# Target architecture\n',
    approvedByArchitect: true,
    approvedBy: 'architect@example.com',
    generatedCode: 'export const ok = true;\n',
    documentation: '# Blueprint\n',
    testCases: draft.map((t) => ({ ...t, status: 'Passed' as const })),
    testSuite: SUITE,
    ...over,
  };
  return { ...base, testRunReceipt: receiptFor(base), ...over };
};

/* --------------------------------------------------------- the pure module */

test.describe('nextOpenPoint reads the one phase contract, nothing else', () => {
  test('nothing done: the next open point is Analyze, and says why', () => {
    for (const empty of [null, { name: 'Fresh' } as Project, { name: 'Fresh', legacyCode: '' } as Project]) {
      const point = nextOpenPoint(empty);
      expect(point, 'a project with nothing on it has no open point').not.toBeNull();
      expect(point!.key).toBe('analyze');
      expect(point!.reason).toMatch(/no source staged/i);
      expect(point!.blockedByModelSwitch, 'staging source needs no model call').toBe(false);
    }
  });

  test('something half done: a design generated but not signed off is the open point', () => {
    const point = nextOpenPoint(finished({ approvedByArchitect: false, approvedBy: undefined }));
    expect(point).not.toBeNull();
    expect(point!.key).toBe('design');
    expect(point!.reason).toMatch(/not been confirmed/i);
    expect(point!.blockedByModelSwitch, 'a design already exists — nothing here needs a model call').toBe(false);
  });

  test('a stage switched off: an empty phase names the switch instead of an instruction to press it', () => {
    // A run is on record (Analyze is done) and nothing else is — Design is next,
    // and this account has switched the design stage off.
    const project = { name: 'x', legacyCode: 'REPORT z.\n', activeRunId: 'run-1' } as Project;
    const off = nextOpenPoint(project, { modelStages: { design: false } });
    expect(off).not.toBeNull();
    expect(off!.key).toBe('design');
    expect(off!.blockedByModelSwitch).toBe(true);
    expect(off!.reason).toMatch(/no solution design yet/i);
    expect(off!.reason, 'the switch is named, not only the empty phase').toMatch(/switched off/i);

    // The same project, the switch left on (or the account not known at all):
    // the reason is the phase's own sentence and nothing about a switch.
    const on = nextOpenPoint(project, { modelStages: { design: true } });
    expect(on!.blockedByModelSwitch).toBe(false);
    expect(on!.reason).not.toMatch(/switched off/i);

    const unknown = nextOpenPoint(project);
    expect(unknown!.blockedByModelSwitch, 'no account known reads as every stage on, not as blocked').toBe(false);
  });

  test('a stage switched off does not blank out a phase that already has something on it', () => {
    // Design was generated before the switch was turned off — regenerating is
    // not what stands between this project and the next phase, confirming it
    // is, and confirming needs no model call.
    const project = finished({ approvedByArchitect: false, approvedBy: undefined });
    const point = nextOpenPoint(project, { modelStages: { design: false } });
    expect(point!.key).toBe('design');
    expect(point!.blockedByModelSwitch, 'a generated design is not blocked by the switch behind it').toBe(false);
    expect(point!.reason).not.toMatch(/switched off/i);
  });

  test('Analyze is never reported as blocked by a switch — the zero-LLM path needs no model call', () => {
    const point = nextOpenPoint({ name: 'x' } as Project, { modelStages: { analyze: false } });
    expect(point!.key).toBe('analyze');
    expect(point!.blockedByModelSwitch).toBe(false);
  });

  test('everything done: there is no open point, and none is invented', () => {
    expect(nextOpenPoint(finished())).toBeNull();
  });

  test('Economics is never the open point, even when it is the only thing not done', () => {
    // Every phase workflowSummary can ever call "done" is done; Economics
    // itself can never reach `done` in this release (CR-23 / E12-F02).
    const project = finished();
    const steps = workflowSteps(project);
    expect(steps.find((s) => s.key === 'tco')!.done, 'the fixture is not accidentally finishing tco').toBe(false);
    expect(nextOpenPoint(project), 'Economics parked the reader here instead of reporting "nothing open"').toBeNull();
  });

  test('reports the same phase workflowSummary().next names, never a second guess', () => {
    const variants: Project[] = [
      { name: 'v' } as Project,
      { name: 'v', legacyCode: 'REPORT z.\n' } as Project,
      { name: 'v', legacyCode: 'REPORT z.\n', activeRunId: 'run-1' } as Project,
      finished({ approvedByArchitect: false, approvedBy: undefined }),
      finished({ testCases: draft.map((t) => ({ ...t, status: 'Failed' as const })), testRunReceipt: undefined }),
    ];
    for (const project of variants) {
      const summary = workflowSummary(workflowSteps(project));
      const point = nextOpenPoint(project);
      if (summary.next.done) {
        expect(point).toBeNull();
      } else {
        expect(point).not.toBeNull();
        expect(point!.key).toBe(summary.next.key);
        expect(point!.label).toBe(summary.next.label);
        expect(point!.path).toBe(summary.next.path);
      }
    }
  });

  test('is deterministic — the same project and account give the same answer', () => {
    const project = finished({ approvedByArchitect: false, approvedBy: undefined });
    const account = { modelStages: { design: false } };
    expect(JSON.stringify(nextOpenPoint(project, account))).toBe(
      JSON.stringify(nextOpenPoint(project, account)),
    );
  });
});

/* --------------------------------------------------------------- no model call */

test.describe('no model call', () => {
  const ROOT = path.resolve(__dirname, '..');
  const withoutComments = (s: string) =>
    s
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

  test('the module never reaches the Gemini proxy, the network, or a stage prompt', () => {
    const src = withoutComments(fs.readFileSync(path.join(ROOT, 'lib/next-step.ts'), 'utf8'));
    for (const forbidden of [
      'gemini',
      'Gemini',
      'callModel',
      'buildPrompt',
      'fetch(',
      'XMLHttpRequest',
      'axios',
      "'/api/",
      '`/api/',
      'process.env',
    ]) {
      expect(src, `"${forbidden}" reached lib/next-step.ts`).not.toContain(forbidden);
    }
  });

  test('its only imports are the pure, import-free phase and model-switch contracts', () => {
    const src = fs.readFileSync(path.join(ROOT, 'lib/next-step.ts'), 'utf8');
    const localImports = [...src.matchAll(/from\s+'(\.[^']+)'/g)].map((m) => m[1]);
    expect(localImports.sort()).toEqual(['./model-stages', './types', './workflow-steps']);
  });
});

/* ------------------------------------------------------------- the rendered half */

const firebaseApp = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
const clientAuth = getAuth(firebaseApp);
try {
  connectAuthEmulator(clientAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
} catch {
  /* already connected */
}

const PASSWORD = 'NextStepCard123!';
const unique = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/');
  await page.click('a:has-text("Get Free Access"), button:has-text("Get Free Access")');
  await page.waitForSelector('input[type="email"]');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]:has-text("Sign In")');
  await page.waitForTimeout(4000);
}

test.describe('the "Next step" card, rendered', () => {
  const ADMIN = `${unique('nextstep-admin')}@cleancore-test.io`;
  const EMPTY_ID = unique('nextstep-empty');
  const BLOCKED_ID = unique('nextstep-blocked');
  const DONE_ID = unique('nextstep-done');
  let adminUid = '';

  test.beforeAll(async () => {
    test.setTimeout(180 * 1000);
    const cred = await createUserWithEmailAndPassword(clientAuth, ADMIN, PASSWORD);
    adminUid = cred.user.uid;
    await adminSetCustomClaim(adminUid, { admin: true });
    await adminSetDoc('users', adminUid, {
      firstName: 'Next', lastName: 'Step', email: ADMIN,
      tier: 'pilot', status: 'approved', isAdmin: true, workspaceShell: true,
      // The account itself switched Design off — the card must say so rather
      // than pointing at a button that can only fail.
      modelStages: { design: false },
      transformationsUsed: 1, transformationsLimit: 5, createdAt: new Date(),
    });

    // Nothing on record at all — the open point is Analyze.
    await adminSetDoc('projects', EMPTY_ID, {
      name: 'Nothing has happened here', userId: adminUid,
      createdAt: new Date(), status: 'created',
    });

    // A run is on record; Design has nothing of its own, and this account has
    // switched it off.
    await adminSetDoc('projects', BLOCKED_ID, {
      name: 'Waiting on a switched-off stage', userId: adminUid,
      createdAt: new Date(), status: 'created',
      legacyCode: 'REPORT z_blocked.\n',
      activeRunId: 'run-blocked',
    });

    // Every phase this product can finish already is.
    const executed = {
      activeRunId: 'run-done',
      generatedCode: 'export const ok = true;\n',
      testSuite: SUITE,
      testCases: draft.map((t) => ({ ...t, status: 'Passed' as const })),
    };
    await adminSetDoc('projects', DONE_ID, {
      name: 'Nothing left open', userId: adminUid,
      createdAt: new Date(), status: 'completed',
      legacyCode: 'REPORT z_done.\n',
      cleanCoreScore: 62,
      solutionDesign: '# Target architecture\n',
      approvedByArchitect: true,
      approvedBy: ADMIN,
      documentation: '# Blueprint\n',
      ...executed,
      testRunReceipt: receiptFor(executed),
    });
  });

  test('an empty project: the card names Analyze and its real reason, not only the title', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await signIn(page, ADMIN);
    await page.goto(`/project/${EMPTY_ID}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-workspace-shell]', { timeout: 60000 });

    const card = page.locator('[data-next-step]');
    await expect(card.locator('[data-cc-card-title]')).toHaveText('Next step');
    await expect(card.locator('[data-next-step-state="open"]')).toBeVisible();

    const reason = (await card.locator('[data-next-step-reason]').textContent())?.trim() ?? '';
    expect(reason.length, 'the reason is more than the title repeated').toBeGreaterThan(10);
    expect(reason).not.toBe('Next step');
    expect(reason.toLowerCase()).toMatch(/no source staged/);

    await expect(card.locator('a[data-cc-button]')).toHaveAttribute('href', `/project/${EMPTY_ID}/analyze`);
  });

  test('a phase blocked by the account\'s own switch: the reason names the switch', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await signIn(page, ADMIN);
    await page.goto(`/project/${BLOCKED_ID}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-workspace-shell]', { timeout: 60000 });

    const card = page.locator('[data-next-step]');
    const open = card.locator('[data-next-step-state="open"]');
    await expect(open).toBeVisible();
    await expect(open).toHaveAttribute('data-next-step-key', 'design');

    const reason = (await card.locator('[data-next-step-reason]').textContent())?.trim() ?? '';
    expect(reason.toLowerCase()).toMatch(/switched off/);

    // The button still opens the stage — a navigation cannot fail the way a
    // generation call would, so it is offered regardless of the switch.
    await expect(card.locator('a[data-cc-button]')).toHaveAttribute('href', `/project/${BLOCKED_ID}/design`);
  });

  test('a finished project: the card says plainly that nothing is open', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await signIn(page, ADMIN);
    await page.goto(`/project/${DONE_ID}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-workspace-shell]', { timeout: 60000 });

    const card = page.locator('[data-next-step]');
    await expect(card.locator('[data-cc-card-title]')).toHaveText('Next step');
    const none = card.locator('[data-next-step-state="none"]');
    await expect(none).toBeVisible();
    const text = (await none.textContent())?.trim() ?? '';
    expect(text.toLowerCase()).toMatch(/nothing is open/);
    // No button to press when there is nothing to open.
    await expect(card.locator('a[data-cc-button]')).toHaveCount(0);
  });
});
