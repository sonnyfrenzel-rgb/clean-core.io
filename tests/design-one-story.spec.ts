import { test, expect, type Page } from '@playwright/test';
import { designAnswer, storedRouteOf } from '../lib/design-recommendation';
import { recommendedArchitecture } from '../lib/project-commands';
import { contractOfProject } from '../lib/contract-build';
import { SIDE_BY_SIDE_ROUTE, isSideBySideRoute } from '../lib/sap-naming';
import { RICH_LEGACY, seedStageProject, signInThroughForm } from './helpers/seed-project';
import { adminMergeDoc } from './helpers/admin-seed';

/**
 * The Design stage tells one story about where the code should run.
 *
 * It told two. The decision card's title came from the route stored on the
 * project (`originalRecommendation`, else `extensibilityRoute`) while its
 * sentence, the canvas, the route figure and the alternatives came from the
 * architecture contract the server derives from the code now. On the seeded
 * ZCREDIT_CHECK the card read "Recommended: Side-by-Side Extensibility (CAP)"
 * above "… Developer Extensibility (RAP) is the recommended path", beside
 * alternatives calling side-by-side CAP "Rejected as a setting".
 *
 * Not only the seed: the Analyze stage's route switch writes
 * `extensibilityRoute` from the browser, a project from before signed runs has
 * no `originalRecommendation`, and a run's recommendation was routed with the
 * rules of its day. So the contract answers, and a stored value that differs is
 * shown as what it is.
 */

const RAP = 'Developer Extensibility (RAP / ABAP Cloud)';
const CAP = 'Side-by-Side Extensibility (CAP / Node.js)';

test.describe('the answer, as a rule', () => {
  test('the contract names the target; a stored value that differs is named, not promoted', () => {
    const route = { recommended: 'in-app-rap' as const, chosen: 'in-app-rap' as const, deviation: false };
    expect(designAnswer({ evidence: 'ready', route, stored: { code: 'cap', source: 'setting' } })).toEqual({
      kind: 'recommended',
      code: 'rap',
      storedDiffers: { code: 'cap', source: 'setting' },
    });
    expect(designAnswer({ evidence: 'ready', route, stored: { code: 'rap', source: 'run' } }).storedDiffers).toBeNull();
  });

  test('a declared deviation is named as chosen, and the stored basis it departed from is not a disagreement', () => {
    const route = { recommended: 'in-app-rap' as const, chosen: 'side-by-side-cap' as const, deviation: true };
    expect(designAnswer({ evidence: 'ready', route, stored: { code: 'rap', source: 'run' } })).toEqual({
      kind: 'chosen',
      code: 'cap',
      storedDiffers: null,
    });
  });

  test('while the contract is read nothing is named; without one the stored value is labelled as stored', () => {
    const stored = { code: 'cap' as const, source: 'setting' as const };
    expect(designAnswer({ evidence: 'loading', route: null, stored }).kind).toBe('loading');
    expect(designAnswer({ evidence: 'ready', route: null, stored })).toEqual({ kind: 'stored', code: 'cap', storedDiffers: null });
    expect(designAnswer({ evidence: 'absent', route: null, stored: null }).kind).toBe('none');
  });

  test('the run’s recommendation is told apart from the route switch', () => {
    expect(storedRouteOf({ originalRecommendation: 'In-App (ABAP Cloud)', extensibilityRoute: SIDE_BY_SIDE_ROUTE }, recommendedArchitecture))
      .toEqual({ code: 'rap', source: 'run' });
    expect(storedRouteOf({ extensibilityRoute: SIDE_BY_SIDE_ROUTE }, recommendedArchitecture)).toEqual({ code: 'cap', source: 'setting' });
    expect(storedRouteOf({}, recommendedArchitecture)).toBeNull();
  });
});

test('the seeded side-by-side project is side-by-side by the engine as well', () => {
  // The fixture stores "Side-by-Side"; the engine has to agree, or every
  // screenshot of the Design stage shows two answers.
  const built = contractOfProject({ legacyCode: RICH_LEGACY, s4Deployment: 'private' }, null);
  expect(built.ok).toBe(true);
  if (!built.ok) return;
  expect(built.contract.route.recommended).toBe('side-by-side-cap');
  expect(isSideBySideRoute(SIDE_BY_SIDE_ROUTE)).toBe(true);
});

async function openDesign(page: Page, projectId: string) {
  await page.goto(`/project/${projectId}/design`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-design-canvas-stage]')).toBeVisible({ timeout: 120_000 });
  // The contract has been read once the alternatives are listed.
  await expect(page.locator('[data-design-alternative]').first()).toBeVisible({ timeout: 120_000 });
}

test.describe('on screen', () => {
  test.describe.configure({ mode: 'serial' });

  test('a route setting that disagrees with the code is shown as the reader’s setting, not as the recommendation', async ({ page }) => {
    test.setTimeout(300_000);
    // The plain fixture's code reads a standard table and nothing drives it off
    // the stack: the engine recommends in-app RAP. The switch says side-by-side.
    const seeded = await seedStageProject({ prefix: 'onestory-set', acceptTerms: true });
    await adminMergeDoc('projects', seeded.projectId, { extensibilityRoute: SIDE_BY_SIDE_ROUTE });

    await signInThroughForm(page, seeded);
    await openDesign(page, seeded.projectId);

    const card = page.locator('[data-design-answer]');
    await expect(card).toHaveAttribute('data-design-answer', 'recommended');
    await expect(card).toHaveAttribute('data-design-answer-code', 'rap');
    await expect(page.locator('#design-answer')).toHaveText(RAP);
    await expect(page.locator('[data-design-alternative][data-verdict="chosen"]')).toHaveAttribute('data-design-alternative', 'in-app-rap');
    await expect(page.locator('[data-design-kpi="Route"]')).toContainText('In-app · RAP');
    const note = page.locator('[data-design-stored-route="setting"]');
    await expect(note).toBeVisible();
    await expect(note).toContainText(`Your route setting is ${CAP}`);
    // Nothing in the card calls side-by-side the recommendation.
    await expect(card.locator('#design-answer')).not.toContainText('Side-by-Side');
  });

  test('a run that recorded another route is named as the run’s, with the way to bring it up to date', async ({ page }) => {
    test.setTimeout(300_000);
    const seeded = await seedStageProject({ prefix: 'onestory-run', acceptTerms: true });
    await adminMergeDoc(`projects/${seeded.projectId}/runs`, seeded.runId, { originalRecommendation: SIDE_BY_SIDE_ROUTE });

    await signInThroughForm(page, seeded);
    await openDesign(page, seeded.projectId);

    await expect(page.locator('#design-answer')).toHaveText(RAP);
    const note = page.locator('[data-design-stored-route="run"]');
    await expect(note).toContainText(`The analysis run on record recommended ${CAP}`);
    await expect(note).toContainText('run the analysis again');
  });

  test('the seeded side-by-side project says side-by-side everywhere and names no stored disagreement', async ({ page }) => {
    test.setTimeout(300_000);
    const seeded = await seedStageProject({ prefix: 'onestory-rich', acceptTerms: true, rich: true });

    await signInThroughForm(page, seeded);
    await openDesign(page, seeded.projectId);

    await expect(page.locator('#design-answer')).toHaveText(CAP);
    await expect(page.locator('[data-design-kpi="Route"]')).toContainText('Side-by-side · CAP');
    await expect(page.locator('[data-design-alternative][data-verdict="chosen"]')).toHaveAttribute('data-design-alternative', 'side-by-side-cap');
    await expect(page.locator('[data-design-stored-route]')).toHaveCount(0);
  });
});
