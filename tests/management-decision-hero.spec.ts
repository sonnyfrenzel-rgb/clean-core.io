import { test, expect, type Page } from './helpers/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminSetDoc, adminSetCustomClaim } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import { signInViaLanding } from './helpers/sign-in';

/**
 * The decision is the first thing in Management (owner, 03.10.2026):
 * "Management: the decision must be shown, placed prominently, and at the same
 * time be graphically appealing."
 *
 * Before, the decision record sat inside a fold "Options and the decision" as
 * a wall of text that cited this product's own source files to a manager. This
 * spec holds what replaced it, on the rendered page:
 *
 *   - since ADR-145 the decision is the Decide page itself: four options as one choice, not inside a fold;
 *   - there is exactly one decision card;
 *   - its four foundations (need, option, costs, architecture contract) render
 *     as one list "What it rests on: n of 4 in place", each with a provenance
 *     chip and one action of its own, the open conditions nested under them
 *     (ADR-087);
 *   - the answer names the option once, at the top; the card does not repeat
 *     it as a headline;
 *   - no visible text in Management names a source file of this product —
 *     not even with the technical fold open;
 *   - nothing scrolls sideways at 390 px.
 *
 * Seeded the way `management-overview.spec.ts` seeds its project: a source and
 * an active run, so the decision route derives a draft.
 */

const firebaseApp = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
const clientAuth = getAuth(firebaseApp);
try {
  connectAuthEmulator(clientAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
} catch {
  /* already connected */
}

const PASSWORD = 'DecisionHero123!';
const unique = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const SOURCE = `REPORT z_decision_hero.
DATA: lt_ekpo TYPE TABLE OF ekpo.
SELECT * FROM ekpo INTO TABLE lt_ekpo.
UPDATE ekpo SET loekz = 'L' WHERE ebeln = '1'.
CALL FUNCTION 'BAPI_PO_CREATE1'.
`;

/** Visible text only — `innerText` leaves out what a closed fold hides. */
const SOURCE_PATH = /\b(?:lib|app|components)\/[\w./-]+|\b[\w-]+\.tsx?\b/;

test.describe('Management: the decision first, prominent and plain', () => {
  const OWNER = `${unique('decision-hero')}@cleancore-test.io`;
  const ID = unique('decision-hero');

  test.beforeAll(async () => {
    test.setTimeout(180 * 1000);
    const cred = await createUserWithEmailAndPassword(clientAuth, OWNER, PASSWORD);
    await adminSetCustomClaim(cred.user.uid, { admin: true });
    await adminSetDoc('users', cred.user.uid, {
      firstName: 'Decision', lastName: 'Hero', email: OWNER,
      tier: 'pilot', status: 'approved', isAdmin: true,
      transformationsUsed: 1, transformationsLimit: 5, createdAt: new Date(),
    });
    await adminSetDoc('projects', ID, {
      name: 'Decision hero', userId: cred.user.uid, createdAt: new Date(), status: 'analyzed',
      legacyCode: SOURCE, s4Deployment: 'private', activeRunId: 'run-1',
    });
    await adminSetDoc(`projects/${ID}/runs`, 'run-1', {
      runId: 'run-1', userId: cred.user.uid, createdAt: '2026-10-01T10:00:00.000Z', cleanCoreScore: 58,
      rulesetVersion: 'rules-v1.0', analyzerVersion: '2.9.0', sapApiCatalogVersion: 'cat-2026-08',
    });
  });

  /**
   * Since ADR-145 (owner decisions 25.11.2026) the decision is taken on the Decide page in one go: the four options as
   * one choice, nothing pre-selected, and one dialog. The decision card of ADR-092 is no longer drawn there; what it
   * rested on is listed in the dialog, its bindings and timeline fold into the result. Analyze's Management view puts the
   * decision first as its answer card and shows it read-only.
   */
  async function open(page: Page) {
    await signInViaLanding(page, OWNER, PASSWORD);
    await page.goto(`/project/${ID}/redesign`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-decide-state="choosing"] [data-decide]')).toBeVisible({ timeout: 90000 });
  }

  test('the decision is the page: one choice of four, nothing pre-selected, no card of its own', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await open(page);

    // One radio group of four, in the one order, nothing chosen; the analysis' indication a tag, never a choice.
    const options = page.locator('[role="radiogroup"] [data-decide-option]');
    await expect(options).toHaveCount(4);
    expect(await options.evaluateAll((els) => els.map((el) => el.getAttribute('data-decide-option')))).toEqual(['keep', 'rebuild', 'standard', 'retire']);
    await expect(page.locator('[data-decide-option][aria-checked="true"]')).toHaveCount(0);
    // The old decision card and its second confirmation are gone from the page.
    await expect(page.locator('[data-decision-card], [data-decision-confirm], [data-option-choose]')).toHaveCount(0);
    // Not inside any fold: the choice is the page.
    expect(await options.first().evaluate((el) => Boolean(el.closest('[data-cc-disclosure]')))).toBe(false);
    // Green belongs to proven: no option claims it.
    await expect(page.locator('[data-decide] [data-provenance="proven"]')).toHaveCount(0);

    // First in Management: the answer card asks the decision's question, directly under the header, and its one
    // primary action leads to the Decide page. Nothing is decided there (no second card).
    await page.goto(`/project/${ID}/analyze?view=management`, { waitUntil: 'domcontentloaded' });
    const answer = page.locator('#management-answer');
    await expect(answer).toContainText('Keep, rebuild or retire: what does this program need?', { timeout: 90000 });
    const top = (await answer.boundingBox())!;
    const sections = page.locator('[data-analyze-management="ready"] section[id]:not(#management-answer section)');
    expect(await sections.count()).toBeGreaterThan(0);
    for (const section of await sections.all()) {
      const id = await section.getAttribute('id');
      if (id === 'management-answer') continue;
      expect((await section.boundingBox())!.y, `#${id} stands above the decision`).toBeGreaterThan(top.y);
    }
    await expect(page.locator('[data-analyze-management-redesign]')).toHaveAttribute('href', `/project/${ID}/redesign`);
    await expect(page.locator('[data-analyze-management-redesign]')).toContainText('Decide what happens to it');
    await expect(page.locator('[data-decision-card]')).toHaveCount(0);
  });

  test('no visible text names a source file of this product, not even in the dialog', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await open(page);
    const shell = page.locator('[data-redesign="ready"]');
    expect(await shell.innerText()).not.toMatch(SOURCE_PATH);

    await page.locator('[data-decide-option="keep"]').click();
    await page.locator('[data-decide-reason] textarea').fill('The plant keeps its own procurement process until 2028.');
    await page.locator('[data-decide-record]').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Record: Keep?');
    const text = await dialog.innerText();
    expect(text).not.toMatch(SOURCE_PATH);
    expect(text).not.toContain('`');
    await dialog.getByRole('button', { name: 'Cancel' }).click();

    // Analyze's Management view, read the same way.
    await page.goto(`/project/${ID}/analyze?view=management`, { waitUntil: 'domcontentloaded' });
    const management = page.locator('[data-analyze-management="ready"]');
    await expect(management).toBeVisible({ timeout: 90000 });
    const mtext = await management.innerText();
    expect(mtext).not.toMatch(SOURCE_PATH);
    expect(mtext).not.toContain('`');
  });

  test('on a phone at 390 px the options stack and nothing scrolls sideways', async ({ browser }) => {
    test.setTimeout(240 * 1000);
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    await open(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, 'Decide scrolls sideways at 390 px').toBeLessThanOrEqual(0);
    // The four options are one column, under each other.
    const xs = await page.locator('[data-decide-option]').evaluateAll((els) =>
      [...new Set(els.map((el) => Math.round(el.getBoundingClientRect().x)))],
    );
    expect(xs.length).toBe(1);
    // A choice by tap; the bar stays in reach.
    await page.locator('[data-decide-option="retire"]').tap();
    await expect(page.locator('[data-decide-option="retire"]')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('[data-decide-bar]')).toBeVisible();

    // Analyze's Management view on the same phone.
    await page.goto(`/project/${ID}/analyze?view=management`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-analyze-management="ready"]')).toBeVisible({ timeout: 90000 });
    const overflowM = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflowM, 'Management scrolls sideways at 390 px').toBeLessThanOrEqual(0);
    await context.close();
  });
});
