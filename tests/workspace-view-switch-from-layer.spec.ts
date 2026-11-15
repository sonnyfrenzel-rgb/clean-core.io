import { test, expect, type Page } from './helpers/test';
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

// Since v3.1.0 Business has no layer and is Analyze's page (plan AB-2, ADR-109): an old Business layer
// address opens Analyze, Business with the fragment dropped (`lib/analyze-entry.ts`), and the view switch
// there is the stage header's. The promise is the same: the new view opens, holds, and keeps no fragment.
test('from an old Business layer address, Analyze opens in Business without it, and Management opens and stays', async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInThroughForm(page, account);
  for (const layer of ['evidence']) {
    await page.goto(`/project/${account.projectId}?view=business#${layer}`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(new RegExp(`/project/${account.projectId}/analyze\\?view=business$`), { timeout: 90_000 });
    await page.waitForTimeout(1500);
    expect(new URL(page.url()).hash, `Business kept #${layer}`).toBe('');
    const stageRadio = page.locator('[data-stage-view-switch] button[role="radio"]', { hasText: 'Management' });
    await stageRadio.evaluate((el) => (el as HTMLElement).click());
    await expect(page.locator('[data-stage-view-switch]')).toHaveAttribute('data-stage-view-switch', 'management', { timeout: 30_000 });
    const seen = await page.evaluate(async () => {
      const out = new Set<string>();
      const t0 = performance.now();
      while (performance.now() - t0 < 1500) {
        await new Promise((r) => requestAnimationFrame(r));
        out.add(`${document.querySelector('[data-stage-view-switch]')?.getAttribute('data-stage-view-switch')}|${new URL(location.href).searchParams.get('view')}|${location.hash}`);
      }
      return [...out];
    });
    expect(seen, `from Business #${layer}: Management did not hold`).toEqual(['management|management|']);
  }
});
