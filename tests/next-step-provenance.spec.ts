import { test, expect, type Page } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminSetDoc, adminSetCustomClaim } from './helpers/admin-seed';
import { receiptFor } from './helpers/test-receipt';
import firebaseConfig from '../firebase-config.json';
import { NEXT_STEP_PROVENANCE, NOTHING_OPEN, nextOpenPoint, selectionSentence } from '../lib/next-step';
import { workflowSteps, workflowSummary } from '../lib/workflow-steps';
import { PROVENANCE, PROVENANCE_VALUES } from '../lib/provenance';
import type { Project, TestCase } from '../lib/types';

/**
 * Roadmap 6.5, the half that was missing: *"der nächste offene Punkt **mit
 * Grund**"* — and, because every statement in this product has to say where it
 * comes from (`DESIGN.md` §4), with its provenance.
 *
 * `tests/next-step.spec.ts` already proves the module picks the right phase
 * and calls no model. What it cannot prove is that the reader is told **why
 * that phase**, which is the difference between a rule and an opinion: a card
 * that says "Design" and nothing else is indistinguishable from a card that
 * guessed. So four things are checked here, each of them a condition of the
 * roadmap row rather than a property of the code that happens to be true:
 *
 *   - the point carries a **selection sentence** derived from the one phase
 *     contract — which phases stand before it, and how many of them are on
 *     record;
 *   - that sentence **counts nothing that was not measured**: the first phase
 *     has nothing before it, and says so instead of printing a zero
 *     (`lib/workspace-rows.ts`: *null is not zero*), and nothing anywhere in
 *     it is a percentage or a "should";
 *   - the statement's provenance is **`reconstructed`** — one of the nine, and
 *     specifically not *Model proposal*, which would lend the badge that means
 *     "a model said this" to a sentence no model touched;
 *   - **"nothing open" is a claim like any other** and is true of the contract
 *     whenever it is shown, rather than a pleasantry the card falls back to.
 *
 * The rendered block at the bottom is the fourth condition of the brief: the
 * hint has to reach the reader, and it has to name its origin on screen.
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
    name: 'Next step provenance fixture',
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

/** Every shape of project the module has an answer for, open and closed. */
const variants = (): Project[] => [
  null as unknown as Project,
  { name: 'v' } as Project,
  { name: 'v', legacyCode: '' } as Project,
  { name: 'v', legacyCode: 'REPORT z.\n' } as Project,
  { name: 'v', legacyCode: 'REPORT z.\n', activeRunId: 'run-1' } as Project,
  finished({ approvedByArchitect: false, approvedBy: undefined }),
  finished({ generatedCode: undefined }),
  finished({ documentation: undefined }),
  finished({ testCases: [], testSuite: undefined, testRunReceipt: undefined }),
  finished({ testCases: draft, testRunReceipt: undefined }),
  finished(),
];

/* ------------------------------------------------- why this one, and not another */

test.describe('the point says why it is this one', () => {
  test('every open point carries a selection sentence, and it is not the reason repeated', () => {
    const seen = new Set<string>();
    for (const project of variants()) {
      const point = nextOpenPoint(project);
      if (point === null) continue;
      seen.add(point.key);
      expect(point.selection.trim().length, `${point.key} gives no selection sentence`).toBeGreaterThan(20);
      expect(point.selection, `${point.key} repeats its reason instead of saying why it was picked`).not.toBe(
        point.reason,
      );
      expect(point.selection, `${point.key} does not name itself`).toContain(point.label);
    }
    expect(
      [...seen].sort(),
      'the fixtures stopped covering the open phases — the loop would pass on an empty set',
    ).toEqual(['analyze', 'design', 'documentation', 'testing', 'transformation']);
  });

  test('what stands before it is the phase contract\'s own list, not a second tally', () => {
    // Design generated, not signed off: Analyze alone stands before it.
    const halfway = finished({ approvedByArchitect: false, approvedBy: undefined });
    const point = nextOpenPoint(halfway)!;
    const steps = workflowSteps(halfway);
    const at = steps.findIndex((s) => s.key === point.key);
    expect(at, 'the fixture no longer stops at Design').toBe(1);
    expect(point.selection).toContain(`The one phase before it, ${steps[0].label}, is on record`);
    expect(point.selection).toMatch(/first in the workflow order that is not/i);

    // Three phases on record, Documentation open: the plural form, counted.
    const later = finished({ documentation: undefined });
    const point3 = nextOpenPoint(later)!;
    expect(point3.key).toBe('documentation');
    const before3 = workflowSteps(later).findIndex((s) => s.key === 'documentation');
    expect(point3.selection).toContain(`All ${before3} phases before it are on record`);
  });

  test('a phase that is skipped is named and given its reason, never silently dropped', () => {
    // Driven through the rule itself rather than through a project: Delivery
    // standing open behind an unfinished Economics is a state the contract
    // does not produce today, and a branch that only says the truth on the
    // projects somebody remembered to build is not a rule.
    const steps = workflowSteps(finished());
    const delivery = steps.find((s) => s.key === 'delivery')!;
    const sentence = selectionSentence(steps, delivery);
    const skipped = steps.slice(0, steps.length - 1).filter((s) => !s.done);

    expect(skipped.map((s) => s.key), 'Economics finished — the skipped branch is no longer exercised').toEqual(['tco']);
    for (const step of skipped) {
      expect(sentence, `${step.key} is missing from the count without being named`).toContain(step.label);
    }
    expect(sentence).toContain(`${steps.length - 1 - skipped.length} of the ${steps.length - 1} phases before it`);
    expect(sentence).toMatch(/nothing in this release can complete it/i);
  });

  test('the first phase has nothing before it — and says so, instead of counting zero', () => {
    for (const empty of [null, { name: 'Fresh' } as Project, { name: 'Fresh', legacyCode: '' } as Project]) {
      const point = nextOpenPoint(empty)!;
      expect(point.key).toBe('analyze');
      expect(point.selection).toMatch(/nothing comes before it/i);
      expect(point.selection, 'an empty set was printed as a measurement').not.toMatch(/\b0 of\b/);
    }
  });

  test('no percentage, no "should", no cause the rules cannot see', () => {
    let checked = 0;
    for (const project of variants()) {
      const point = nextOpenPoint(project);
      if (point === null) continue;
      checked += 1;
      const text = `${point.reason} ${point.selection}`;
      expect(text, `${point.key} states a percentage`).not.toMatch(/\d\s*%|percent/i);
      expect(text, `${point.key} advises instead of stating`).not.toMatch(/\bshould\b|\bprobably\b|\blikely\b/i);
    }
    expect(checked, 'no open point was examined — the loop would pass on an empty set').toBeGreaterThan(4);
    // `NOTHING_OPEN` is held to the same rule.
    expect(NOTHING_OPEN).not.toMatch(/\d\s*%|percent|\bshould\b/i);
  });
});

/* ------------------------------------------------------------------ provenance */

test.describe('the hint names its origin, in the one vocabulary', () => {
  test('it is Reconstructed — one of the nine, and not the model\'s badge', () => {
    expect(PROVENANCE_VALUES).toContain(NEXT_STEP_PROVENANCE);
    expect(NEXT_STEP_PROVENANCE, 'a rule-derived sentence is not a model proposal').toBe('reconstructed');
    expect(PROVENANCE[NEXT_STEP_PROVENANCE].label).toBe('Reconstructed');
    // Green is reserved for `proven`; a reading of records is not a proof.
    expect(PROVENANCE[NEXT_STEP_PROVENANCE].state).not.toBe('success');
  });

  test('every point carries it, whatever the project looks like', () => {
    let carried = 0;
    for (const project of variants()) {
      const point = nextOpenPoint(project);
      if (point === null) continue;
      carried += 1;
      // Against the list and against the literal, not only against the
      // constant: `expect(point.provenance).toBe(NEXT_STEP_PROVENANCE)` is
      // satisfied by a point that carries no provenance at all and a constant
      // that does not exist — undefined equals undefined, and the test passes
      // on a module that states nothing.
      expect(PROVENANCE_VALUES, `${point.key} states no provenance`).toContain(point.provenance);
      expect(point.provenance, `${point.key} states the wrong one`).toBe('reconstructed');
      expect(point.provenance).toBe(NEXT_STEP_PROVENANCE);
    }
    expect(carried, 'no point was examined — the loop would pass on an empty set').toBeGreaterThan(4);
  });
});

/* ------------------------------------------------------------- nothing is open */

test.describe('"nothing is open" is a claim, and it is checked', () => {
  test('it is stated once, in the module, and says what Economics is', () => {
    expect(NOTHING_OPEN).toMatch(/nothing is open/i);
    expect(NOTHING_OPEN, 'the one phase that never finishes goes unmentioned').toMatch(/economics/i);
  });

  test('wherever it would be shown, the phase contract agrees with it', () => {
    let shown = 0;
    for (const project of variants()) {
      if (nextOpenPoint(project) !== null) continue;
      shown += 1;
      const steps = workflowSteps(project);
      const unfinished = steps.filter((s) => !s.done && s.key !== 'tco').map((s) => s.key);
      expect(unfinished, 'the card would claim nothing is open with a phase still open').toEqual([]);
      expect(
        workflowSummary(steps).next.done,
        'the card would claim nothing is open while the cursor sits on an unfinished phase',
      ).toBe(true);
    }
    expect(shown, 'no fixture ever reaches the "nothing open" state — the claim is untested').toBeGreaterThan(0);
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

const PASSWORD = 'NextStepProv123!';
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

test.describe('the card, as the reader sees it', () => {
  const ADMIN = `${unique('nsprov-admin')}@cleancore-test.io`;
  const OPEN_ID = unique('nsprov-open');
  const DONE_ID = unique('nsprov-done');
  let adminUid = '';

  test.beforeAll(async () => {
    test.setTimeout(180 * 1000);
    const cred = await createUserWithEmailAndPassword(clientAuth, ADMIN, PASSWORD);
    adminUid = cred.user.uid;
    await adminSetCustomClaim(adminUid, { admin: true });
    await adminSetDoc('users', adminUid, {
      firstName: 'Prov', lastName: 'Reader', email: ADMIN,
      tier: 'pilot', status: 'approved', isAdmin: true, workspaceShell: true,
      transformationsUsed: 1, transformationsLimit: 5, createdAt: new Date(),
    });

    // A signed run and nothing after it: Design is open, and Analyze — one
    // phase — stands before it on record.
    await adminSetDoc('projects', OPEN_ID, {
      name: 'One phase on record', userId: adminUid,
      createdAt: new Date(), status: 'created',
      legacyCode: 'REPORT z_open.\n',
      activeRunId: 'run-open',
      cleanCoreScore: 62,
    });

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
    // The runs the projects name have to exist. Since roadmap 3.0.2 an id
    // without a readable run is "could not be read", not a finished Analyze;
    // these fixtures named runs they never created. `userId` sits on the run
    // because the rule for runs reads it there.
    await adminSetDoc(`projects/${OPEN_ID}/runs`, 'run-open', {
      userId: adminUid, status: 'completed', createdAt: new Date(), cleanCoreScore: 62,
    });
    await adminSetDoc(`projects/${DONE_ID}/runs`, 'run-done', {
      userId: adminUid, status: 'completed', createdAt: new Date(), cleanCoreScore: 62,
    });
  });

  test('an open point arrives with its reason, its "why this one", and a Reconstructed chip', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await signIn(page, ADMIN);
    await page.goto(`/project/${OPEN_ID}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-workspace-shell]', { timeout: 60000 });

    const card = page.locator('[data-next-step]');
    await expect(card.locator('[data-next-step-state="open"]')).toHaveAttribute('data-next-step-key', 'design');

    const selection = card.locator('[data-next-step-selection]');
    await expect(selection).toBeVisible();
    const text = (await selection.textContent())?.trim() ?? '';
    // Analyze is the one phase before Design, and it is on record.
    expect(text).toContain('The one phase before it, Analyze, is on record');
    expect(text).toContain('Design');
    expect(text, 'the reader is shown a share instead of a fact').not.toMatch(/\d\s*%/);

    const chip = card.locator('[data-provenance]');
    await expect(chip).toHaveAttribute('data-provenance', 'reconstructed');
    await expect(chip.locator('[data-cc-provenance-label]')).toHaveText('Reconstructed');
    await expect(chip).toHaveAttribute('data-cc-form', 'outline');
  });

  test('a finished project: the card says nothing is open, and still says where that comes from', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await signIn(page, ADMIN);
    await page.goto(`/project/${DONE_ID}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-workspace-shell]', { timeout: 60000 });

    const card = page.locator('[data-next-step]');
    const none = card.locator('[data-next-step-state="none"]');
    await expect(none).toBeVisible();
    await expect(none).toHaveText(NOTHING_OPEN);
    await expect(card.locator('[data-provenance]')).toHaveAttribute('data-provenance', 'reconstructed');
    // Nothing to open, so nothing to press, and no selection sentence about a
    // phase that does not exist.
    await expect(card.locator('a[data-cc-button]')).toHaveCount(0);
    await expect(card.locator('[data-next-step-selection]')).toHaveCount(0);
  });
});
