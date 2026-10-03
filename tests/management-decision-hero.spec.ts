import { test, expect, type Page } from '@playwright/test';
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
 *   - its four pillars (need, option, costs, architecture contract) render,
 *     each with a provenance chip;
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

  async function open(page: Page) {
    await signInViaLanding(page, OWNER, PASSWORD);
    await page.goto(`/project/${ID}?view=management`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-decision-card][data-decision-status]')).toBeVisible({ timeout: 90000 });
  }

  test('one decision card, first, never folded, with four pillars and their state', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await open(page);

    const cards = page.locator('[data-decision-card]');
    await expect(cards).toHaveCount(1);
    const card = cards.first();
    // The hero of the panel, and not inside any fold.
    await expect(page.locator('[data-executive-decision] [data-decision-card]')).toHaveCount(1);
    expect(await card.evaluate((el) => Boolean(el.closest('[data-management-fold], [data-cc-disclosure]')))).toBe(false);
    // First: the panel is the first thing of the Management answers, and the
    // decision stands above every fold.
    const firstCard = await page
      .locator('[data-management-view=""]')
      .evaluate((root) => root.querySelector('[data-management-executive] > *')?.hasAttribute('data-executive-decision') ?? false);
    expect(firstCard, 'the decision is not the first card').toBe(true);
    const cardBox = (await card.boundingBox())!;
    for (const fold of await page.locator('[data-management-fold]').all()) {
      expect((await fold.boundingBox())!.y).toBeGreaterThan(cardBox.y);
    }

    // The headline in big type, with the status beside it.
    await expect(card.locator('[data-decision-headline]')).not.toBeEmpty();
    await expect(card.locator('[data-decision-state] [data-cc-object-status]').first()).toBeVisible();

    // Four pillars, each with a state chip and one line.
    const pillars = card.locator('[data-decision-pillar]');
    await expect(pillars).toHaveCount(4);
    for (const key of ['need', 'option', 'cost', 'contract']) {
      const pillar = card.locator(`[data-decision-pillar="${key}"]`);
      await expect(pillar.locator('[data-provenance]').first()).toBeVisible();
      await expect(pillar.locator('a[href]')).toHaveCount(1);
    }
    // Green belongs to proven: no pillar of a decision claims it.
    await expect(card.locator('[data-decision-pillar] [data-provenance="proven"]')).toHaveCount(0);
    // The run keeps its provenance chip; the self-declaration stays.
    await expect(card.locator('[data-decision-binding="run"] [data-provenance]')).toHaveCount(1);
    await expect(card.locator('[data-decision-self-declaration]')).toContainText('self-declaration');
  });

  test('no visible text names a source file of this product, not even the technical fold', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await open(page);
    const shell = page.locator('[data-workspace-shell="management"]');
    expect(await shell.innerText()).not.toMatch(SOURCE_PATH);

    const technical = page.locator('[data-decision-technical] [data-cc-disclosure-trigger]');
    await technical.click();
    await expect(technical).toHaveAttribute('aria-expanded', 'true');
    const text = await shell.innerText();
    expect(text).not.toMatch(SOURCE_PATH);
    expect(text).not.toContain('`');
  });

  test('on a phone at 390 px the card stacks and nothing scrolls sideways', async ({ browser }) => {
    test.setTimeout(240 * 1000);
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    await open(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, 'Management scrolls sideways at 390 px').toBeLessThanOrEqual(0);
    // The pillars form a grid of at most two columns.
    const xs = await page.locator('[data-decision-pillar]').evaluateAll((els) =>
      [...new Set(els.map((el) => Math.round(el.getBoundingClientRect().x)))],
    );
    expect(xs.length).toBeLessThanOrEqual(2);
    // The decision stands above fit to standard.
    const [d, f] = await Promise.all([
      page.locator('[data-executive-decision]').boundingBox(),
      page.locator('#standard-fit').boundingBox(),
    ]);
    expect(f!.y).toBeGreaterThan(d!.y + d!.height - 1);
    // Explanations open by tap.
    await page.locator('button[data-info-popover="decision-reversible"]').tap();
    await expect(page.locator('[data-info-popover-panel="decision-reversible"]')).toBeVisible();
    await context.close();
  });
});
