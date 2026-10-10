import { test, expect, type Page } from '@playwright/test';
import { seedStageProject, signInThroughForm } from './helpers/seed-project';
import { COACH_MARK_IDS, COACH_MARK_STORAGE_KEY } from '../lib/coach-marks';

/**
 * QA review of 7fecaa0102eb (6ec03d013196): Business keeps its layers
 * (`#standard`, `#evidence`), and a view switch drops that fragment. The
 * Management redirect read the layer from state, which on the first render of
 * Management is still Business's — so a switch from Business `#standard` was
 * sent straight back to Business, and from `#evidence` on to IT. Business and
 * IT already read the address as it is; Management now does too.
 *
 * Held in a browser: from each Business layer, Management opens and stays,
 * with no fragment, sampled every frame for a second and a half.
 */

const radio = (page: Page, name: string) =>
  page.locator('[data-cc-segmented][aria-label="View"] button[role="radio"]', { hasText: name });
const shell = (page: Page) => page.locator('[data-workspace-shell]');

let account: Awaited<ReturnType<typeof seedStageProject>>;

test.beforeAll(async () => {
  test.setTimeout(240_000);
  account = await seedStageProject({ prefix: 'viewlayer', acceptTerms: true });
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ([key, ids]) => window.localStorage.setItem(key as string, JSON.stringify(ids)),
    [COACH_MARK_STORAGE_KEY, [...COACH_MARK_IDS]] as const,
  );
});

test('from a Business layer, Management opens and stays', async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInThroughForm(page, account);
  for (const layer of ['standard', 'evidence']) {
    await page.goto(`/project/${account.projectId}?view=business#${layer}`, { waitUntil: 'domcontentloaded' });
    await expect(shell(page)).toHaveAttribute('data-workspace-shell', 'business', { timeout: 90_000 });
    await page.waitForTimeout(1500);
    expect(new URL(page.url()).hash, `Business kept #${layer}`).toBe(`#${layer}`);
    await radio(page, 'Management').evaluate((el) => (el as HTMLElement).click());
    await expect(shell(page)).toHaveAttribute('data-workspace-shell', 'management', { timeout: 30_000 });
    const seen = await page.evaluate(async () => {
      const out = new Set<string>();
      const t0 = performance.now();
      while (performance.now() - t0 < 1500) {
        await new Promise((r) => requestAnimationFrame(r));
        out.add(`${document.querySelector('[data-workspace-shell]')?.getAttribute('data-workspace-shell')}|${new URL(location.href).searchParams.get('view')}|${location.hash}`);
      }
      return [...out];
    });
    expect(seen, `from Business #${layer}: Management did not hold`).toEqual(['management|management|']);
  }
});
