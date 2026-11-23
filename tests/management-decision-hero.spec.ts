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
 *   - the decision card is the hero of the first card, not inside a fold;
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
   * Since ADR-143 (owner request 23.11.2026) the decision is taken on Re-design, its step 2, where the decision card
   * (ADR-092) stands unchanged; Analyze's Management view puts the decision first as its answer card and shows it
   * read-only.
   */
  async function open(page: Page) {
    await signInViaLanding(page, OWNER, PASSWORD);
    await page.goto(`/project/${ID}/redesign`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-decision-card][data-decision-status]')).toBeVisible({ timeout: 90000 });
  }

  test('one decision card, first, never folded, with four pillars and their state', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await open(page);

    const cards = page.locator('[data-decision-card]');
    await expect(cards).toHaveCount(1);
    const card = cards.first();
    // In the decision step of Re-design, and not inside any fold.
    await expect(page.locator('#decide [data-redesign-record] [data-decision-card]')).toHaveCount(1);
    expect(await card.evaluate((el) => Boolean(el.closest('[data-management-fold], [data-cc-disclosure]')))).toBe(false);

    // The record row keeps its status, and no headline repeats the answer (ADR-087).
    await expect(card.locator('[data-decision-headline], [data-decision-why]')).toHaveCount(0);
    await expect(card.locator('[data-decision-record] [data-decision-state] [data-cc-object-status]').first()).toBeVisible();
    // Who confirmed is said once, beside the answer — never a second line in the card.
    await expect(card.locator('[data-decision-confirmed-by]')).toHaveCount(0);

    // Four foundations in one list, each with a state chip, one line and one action.
    await expect(card.locator('[data-decision-rests-on-title]')).toHaveText(/^What it rests on: [0-4] of 4 in place$/);
    const pillars = card.locator('[data-decision-pillar]');
    await expect(pillars).toHaveCount(4);
    for (const key of ['need', 'option', 'cost', 'contract']) {
      const pillar = card.locator(`[data-decision-pillar="${key}"]`);
      await expect(pillar.locator('[data-provenance]').first()).toBeVisible();
      await expect(pillar.locator('[data-decision-pillar-action][href]')).toHaveCount(1);
    }
    // Green belongs to proven: no pillar of a decision claims it.
    await expect(card.locator('[data-decision-pillar] [data-provenance="proven"]')).toHaveCount(0);
    // The run keeps its provenance chip (in the technical fold, an auditor's
    // fact); the self-declaration stays.
    await expect(card.locator('[data-decision-technical] [data-decision-binding="run"] [data-provenance]')).toHaveCount(1);
    await expect(card.locator('[data-decision-self-declaration]')).toContainText('self-declaration');

    // First in Management: the answer card asks the decision's question, directly under the header, and its one
    // primary action leads to Re-design. Nothing is decided there (no second card).
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
    await expect(page.locator('[data-decision-card]')).toHaveCount(0);
  });

  test('no visible text names a source file of this product, not even the technical fold', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await open(page);
    const shell = page.locator('[data-redesign="ready"]');
    expect(await shell.innerText()).not.toMatch(SOURCE_PATH);

    const technical = page.locator('[data-decision-technical] [data-cc-disclosure-trigger]');
    await technical.click();
    await expect(technical).toHaveAttribute('aria-expanded', 'true');
    const text = await shell.innerText();
    expect(text).not.toMatch(SOURCE_PATH);
    expect(text).not.toContain('`');

    // Analyze's Management view, read the same way.
    await page.goto(`/project/${ID}/analyze?view=management`, { waitUntil: 'domcontentloaded' });
    const management = page.locator('[data-analyze-management="ready"]');
    await expect(management).toBeVisible({ timeout: 90000 });
    const mtext = await management.innerText();
    expect(mtext).not.toMatch(SOURCE_PATH);
    expect(mtext).not.toContain('`');
  });

  test('on a phone at 390 px the card stacks and nothing scrolls sideways', async ({ browser }) => {
    test.setTimeout(240 * 1000);
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    await open(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, 'Re-design scrolls sideways at 390 px').toBeLessThanOrEqual(0);
    // The foundations are one list: one column, rows under each other.
    const xs = await page.locator('[data-decision-pillar]').evaluateAll((els) =>
      [...new Set(els.map((el) => Math.round(el.getBoundingClientRect().x)))],
    );
    expect(xs.length).toBe(1);
    // Explanations open by tap.
    await page.locator('button[data-info-popover="decision-reversible"]').tap();
    await expect(page.locator('[data-info-popover-panel="decision-reversible"]')).toBeVisible();

    // Analyze's Management view on the same phone.
    await page.goto(`/project/${ID}/analyze?view=management`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-analyze-management="ready"]')).toBeVisible({ timeout: 90000 });
    const overflowM = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflowM, 'Management scrolls sideways at 390 px').toBeLessThanOrEqual(0);
    await context.close();
  });
});
