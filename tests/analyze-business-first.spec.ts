import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from './helpers/test';
import { adminMergeDoc } from './helpers/admin-seed';
import { seedStageProject, signInThroughForm } from './helpers/seed-project';
import { seedLayoutProject } from './helpers/analyze-layout';
import { analyzeEntryHref, analyzeHref, analyzeLinesFromHash } from '../lib/analyze-entry';
import { BUSINESS_MAP_ID } from '../lib/business-layers';

/**
 * Analyze opens business first: the map is the page (plan
 * `docs/design/analyze-business-first-plan.md` §4.1, AB-2; ADR-109; mockup
 * `docs/roadmap/analyze-business-first-mockup.html`, states 3, 7 and 17).
 *
 * The pure half holds the entry's address rules (`lib/analyze-entry.ts`); the
 * source half holds what Business on Analyze must not show — no score, no
 * findings, no code before a click — and where the project opens; the rendered
 * half opens a seeded project with a signed run (the PO approval example) and
 * reads the page: the map is the first block under the summary at 1440 × 900,
 * `#L42` opens the code panel beside it, an old workspace link lands on the
 * map, the one primary button is "Walk me through it", and an invited reader
 * sees the map with no "Edit" and asks no model (P8).
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const BUSINESS = read('components/analyze/AnalyzeBusiness.tsx');
const ROUTE = read('app/(app)/project/[projectId]/analyze/page.tsx');

test.describe('the entry: where /project/<id> goes, and what a line address opens', () => {
  test('Business, or no view, goes to Analyze, keeping view, first, from and origin', () => {
    expect(analyzeEntryHref({ projectId: 'p1', search: '', hash: '' })).toBe('/project/p1/analyze');
    expect(analyzeEntryHref({ projectId: 'p1', search: '?view=business', hash: '' })).toBe('/project/p1/analyze?view=business');
    expect(analyzeEntryHref({ projectId: 'p1', search: 'first=1', hash: '' })).toBe('/project/p1/analyze?first=1');
    expect(
      analyzeEntryHref({ projectId: 'p1', search: 'view=business&first=1&from=next-step&origin=it.next-step&other=x', hash: '' }),
    ).toBe('/project/p1/analyze?view=business&first=1&from=next-step&origin=it.next-step');
    expect(analyzeHref('a b')).toBe('/project/a%20b/analyze');
  });

  test('IT and Management stay on the workspace until AB-9/AB-10', () => {
    expect(analyzeEntryHref({ projectId: 'p1', search: 'view=it', hash: '#L42' })).toBeNull();
    expect(analyzeEntryHref({ projectId: 'p1', search: 'view=management', hash: '' })).toBeNull();
  });

  test('a line and the map are kept; a workspace place is dropped, because the map is the page', () => {
    expect(analyzeEntryHref({ projectId: 'p1', search: '', hash: '#L42' })).toBe('/project/p1/analyze#L42');
    expect(analyzeEntryHref({ projectId: 'p1', search: 'view=business', hash: '#L40-48' })).toBe('/project/p1/analyze?view=business#L40-48');
    expect(analyzeEntryHref({ projectId: 'p1', search: '', hash: `#${BUSINESS_MAP_ID}` })).toBe(`/project/p1/analyze#${BUSINESS_MAP_ID}`);
    expect(analyzeEntryHref({ projectId: 'p1', search: '', hash: '#workspace-head-tools' })).toBe('/project/p1/analyze');
    expect(analyzeEntryHref({ projectId: 'p1', search: '', hash: '#evidence' })).toBe('/project/p1/analyze');
  });

  test('#L42, #L40-48 and #L40-L48 read as line ranges; anything else does not', () => {
    expect(analyzeLinesFromHash('#L42')).toEqual({ lineStart: 42, lineEnd: 42 });
    expect(analyzeLinesFromHash('L40-48')).toEqual({ lineStart: 40, lineEnd: 48 });
    expect(analyzeLinesFromHash('#L40-L48')).toEqual({ lineStart: 40, lineEnd: 48 });
    expect(analyzeLinesFromHash('#L40–48')).toEqual({ lineStart: 40, lineEnd: 48 });
    for (const no of ['', '#', '#L', '#L0', '#L48-40', '#need', '#process-map', '#Lx', null, undefined]) {
      expect(analyzeLinesFromHash(no as string | null | undefined), String(no)).toBeNull();
    }
  });
});

test.describe('the source: Business on Analyze is the map, not the score', () => {
  test('the route renders Business by default and today\'s score page for IT and Management', () => {
    expect(ROUTE).toContain("if (view === 'business' && !working && typeof projectId === 'string') {");
    expect(ROUTE).toContain('<AnalyzeBusiness key={projectId} projectId={projectId} first={first} draftHolder={processDraft} fallback={<AnalyzeScorePage />} />');
    expect(ROUTE).toContain('function AnalyzeScorePage() {');
    // A working address of today's page keeps opening it.
    expect(ROUTE).toContain("params.has('reason') || params.has('add')");
  });

  test('no score, no findings, no code before a click in Business', () => {
    for (const absent of [
      'CleanCoreScore',
      'AnalysisAnswer',
      'EvidenceFindingsTable',
      'RouteCard',
      'useProjectEvidence',
      'AbcdClassificationPanel',
      'CodeSurface',
    ]) {
      expect(BUSINESS, `${absent} in Analyze, Business`).not.toContain(absent);
    }
    // The code speaks on demand: the map's own panel, opened by a step or a line, closed by its button.
    expect(BUSINESS).toContain('codeOnClick');
    const process = read('components/workspace/WorkspaceProcess.tsx');
    expect(process).toContain('const codePanel =\n    codeOnClick && marked ? (');
    expect(process).toContain('{model && !codeOnClick ? column : null}');
  });

  test('one primary button: "Walk me through it"; the start run is signed here on a first visit', () => {
    const primaries = BUSINESS.match(/variant="primary"/g) ?? [];
    expect(primaries).toHaveLength(1);
    const at = BUSINESS.indexOf('variant="primary"');
    expect(BUSINESS.slice(at, at + 200)).toContain('data-analyze-walk=""');
    expect(BUSINESS).toContain("auto: state === 'ready' && autoStart === true");
    expect(BUSINESS).toContain('setAutoStart(first && !firstLookSeen(projectId));');
  });

  test('the interim until v3.2.0: today\'s First insights blocks and Next step stand below the map, unchanged', () => {
    const map = BUSINESS.indexOf('<WorkspaceProcess');
    const look = BUSINESS.indexOf('<FirstLook');
    const next = BUSINESS.indexOf('<BusinessNextStep');
    expect(map).toBeGreaterThan(BUSINESS.indexOf('data-analyze-summary'));
    expect(look).toBeGreaterThan(map);
    expect(next).toBeGreaterThan(look);
    // In their end state: the paced build-up retired with v3.1.0 (AB-3), so there is nothing to switch off.
    expect(BUSINESS).not.toContain('buildUp');
    expect(fs.existsSync(path.join(ROOT, 'components/workspace/FirstLookBuildUp.tsx'))).toBe(false);
    expect(fs.existsSync(path.join(ROOT, 'lib/first-look-buildup.ts'))).toBe(false);
    expect(fs.existsSync(path.join(ROOT, 'lib/first-look-excerpt.ts'))).toBe(false);
    expect(read('components/workspace/FirstLook.tsx')).not.toMatch(/buildUp|FirstLookBuildUp|firstLookExcerpt/);
  });

  test('the first visit is marked seen once the project is ready here, not when it was asked for', () => {
    // Carried from the retired `first-look-buildup-view` spec (a QA finding of 3.0.x): marked when it was
    // asked for, before the project loaded, a failed load cost the reader their first visit.
    expect(BUSINESS.match(/markFirstLookSeen\(/g) ?? []).toHaveLength(1);
    expect(BUSINESS).toContain("if (state === 'ready' && autoStart === true) markFirstLookSeen(projectId);");
  });

  test('the project opens there: the starter examples and the own-code import send it to Analyze', () => {
    expect(read('components/StarterExamples.tsx')).toContain('router.push(`/project/${docRef.id}/analyze?first=1`);');
    expect(read('components/workspace/OwnCodeImport.tsx')).toContain('router.push(`/project/${docRef.id}/analyze?first=1`);');
    const workspace = read('app/(app)/project/[projectId]/page.tsx');
    expect(workspace).toContain('analyzeEntryHref({');
    // The workspace starts no run of its own since v3.1.0: the start run is Analyze, Business's.
    expect(workspace).not.toMatch(/useStartRun|markFirstLookSeen|buildUp/);
  });
});

/**
 * The reading order as drawn: the summary, the map, the first insights, then "Next step", each
 * starting below the one before, and the keyboard reaching them in the same order. The source
 * guard (`tests/a11y-source-guard.spec.ts`) holds the DOM order; this holds what the reader sees.
 */
async function expectReadingOrder(page: Page): Promise<void> {
  const blocks = ['[data-analyze-summary]', '[data-analyze-map]', '[data-analyze-interim] [data-first-look]', '[data-analyze-interim] [data-next-step]'];
  for (const sel of blocks) await expect(page.locator(sel).first(), `${sel} is not shown`).toBeVisible({ timeout: 60000 });
  const tops = await Promise.all(blocks.map(async (sel) => (await page.locator(sel).first().boundingBox())?.y ?? NaN));
  for (let i = 1; i < tops.length; i++) {
    expect(tops[i], `${blocks[i]} is drawn above ${blocks[i - 1]}`).toBeGreaterThan(tops[i - 1]);
  }
  // Focus order: every focusable control of a later block comes after every one of an earlier block.
  const misordered = await page.evaluate((sels) => {
    const focusable = [...document.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter(
      (el) => el.tabIndex >= 0 && el.offsetParent !== null,
    );
    const blockOf = (el: HTMLElement) => sels.findIndex((sel) => !!el.closest(sel));
    let last = -1;
    const out: string[] = [];
    for (const el of focusable) {
      const b = blockOf(el);
      if (b < 0) continue;
      if (b < last) out.push(`${sels[b]} after ${sels[last]}: ${el.outerHTML.slice(0, 80)}`);
      last = Math.max(last, b);
    }
    return out;
  }, blocks);
  expect(misordered, 'the keyboard reaches a block out of reading order').toEqual([]);
}

test.describe('rendered: the seeded PO approval project in Analyze, Business', () => {
  test.describe.configure({ mode: 'serial' });

  test('the map is the first block under the summary at 1440 × 900; no score; one primary; #L42 opens the code beside the map', async ({ page }) => {
    test.setTimeout(360 * 1000);
    const seeded = await seedLayoutProject('ab2-first');
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInThroughForm(page, seeded);
    await page.goto(`/project/${seeded.po}/analyze`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-analyze-business="ready"] [data-workspace-process="ready"] [data-process-map]')).toBeVisible({
      timeout: 120000,
    });
    await page.evaluate(() => window.scrollTo(0, 0));

    // The summary, then the map: nothing between them, and the map starts in the first screen.
    const [summary, map] = await Promise.all([
      page.locator('[data-analyze-summary]').boundingBox(),
      page.locator('[data-analyze-map]').boundingBox(),
    ]);
    expect(summary && map, 'summary or map missing').toBeTruthy();
    expect(map!.y).toBeGreaterThan(summary!.y + summary!.height - 1);
    expect(map!.y, 'the map starts below the first screen').toBeLessThan(900);
    const between = await page.evaluate(() => {
      const a = document.querySelector('[data-analyze-summary]')!;
      const b = document.querySelector('[data-analyze-map]')!;
      let n = a.nextElementSibling;
      const seen: string[] = [];
      while (n && n !== b) {
        if ((n as HTMLElement).offsetHeight > 0) seen.push(n.outerHTML.slice(0, 80));
        n = n.nextElementSibling;
      }
      return seen;
    });
    expect(between, 'something stands between the summary and the map').toEqual([]);
    await expectReadingOrder(page);

    // No score, no findings, no code before a click.
    await expect(page.locator('[data-analyze-score]')).toHaveCount(0);
    await expect(page.locator('[data-analysis-answer]')).toHaveCount(0);
    await expect(page.locator('[data-analyze-code-panel]')).toHaveCount(0);

    // One primary button in the first screen: the invitation. (Today's "Next step" bar, with its own
    // primary, stands far below the map until AB-4 replaces it with the two endings.)
    const primaries = await page.evaluate(() =>
      [...document.querySelectorAll('main [data-cc-button="primary"]')]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && r.top < window.innerHeight;
        })
        .map((el) => el.hasAttribute('data-analyze-walk')),
    );
    expect(primaries).toEqual([true]);

    // `#L42` opens the code beside the map, never over it; its button closes it.
    await page.goto(`/project/${seeded.po}/analyze#L42`, { waitUntil: 'domcontentloaded' });
    const panel = page.locator('[data-analyze-code-panel]');
    await expect(panel).toBeVisible({ timeout: 120000 });
    await expect(panel).toContainText('42');
    const [card, side] = await Promise.all([page.locator('[data-analyze-map] [data-process-map]').boundingBox(), panel.boundingBox()]);
    const overlaps = !!card && !!side && card.x < side.x + side.width && side.x < card.x + card.width && card.y < side.y + side.height && side.y < card.y + card.height;
    expect(overlaps, 'the code panel covers the map').toBe(false);
    await page.locator('[data-analyze-code-close]').click();
    await expect(panel).toHaveCount(0);
  });

  test('an old workspace link `/project/<id>?view=business#need` lands on the map in Analyze', async ({ page }) => {
    test.setTimeout(240 * 1000);
    const seeded = await seedLayoutProject('ab2-old-link');
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInThroughForm(page, seeded);
    await page.goto(`/project/${seeded.po}?view=business#need`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(new RegExp(`/project/${seeded.po}/analyze\\?view=business#${BUSINESS_MAP_ID}$`), { timeout: 60000 });
    await expect(page.locator(`#${BUSINESS_MAP_ID} [data-workspace-process="ready"]`)).toBeVisible({ timeout: 120000 });
    // IT stays on the workspace until AB-9.
    await page.goto(`/project/${seeded.po}?view=it`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-workspace-shell="it"]')).toBeVisible({ timeout: 90000 });
    expect(new URL(page.url()).pathname).toBe(`/project/${seeded.po}`);
  });

  test('an invited reader sees the map, no "Edit", and asks no model (P8)', async ({ browser }) => {
    test.setTimeout(300 * 1000);
    const seeded = await seedLayoutProject('ab2-owner');
    const reader = await seedStageProject({ prefix: 'ab2-reader', acceptTerms: true });
    await adminMergeDoc('projects', seeded.po, { readers: [reader.uid] });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const model: string[] = [];
    page.on('request', (req) => {
      // Reading the stored names (GET) is not asking for them; a model call, an ask for names or a signing is.
      const asksNames = req.url().includes('/process-naming') && req.method() !== 'GET';
      if (req.url().includes('/api/gemini') || asksNames || req.url().includes('/api/runs/create')) model.push(`${req.method()} ${req.url()}`);
    });
    await signInThroughForm(page, reader);
    await page.goto(`/project/${seeded.po}/analyze`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-analyze-business="ready"] [data-workspace-process="ready"] [data-process-map]')).toBeVisible({
      timeout: 120000,
    });
    await expect(page.locator('[data-process-edit-toggle]')).toBeDisabled();
    await page.waitForTimeout(5000);
    expect(model, 'a reader\'s visit asked a model or signed a run').toEqual([]);
    await page.close();
  });

  test('on a phone: the map stands, the invitation is there, the page does not scroll sideways', async ({ page }) => {
    test.setTimeout(240 * 1000);
    const seeded = await seedLayoutProject('ab2-phone');
    await page.setViewportSize({ width: 390, height: 844 });
    await signInThroughForm(page, seeded);
    await page.goto(`/project/${seeded.po}/analyze`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-analyze-business="ready"] [data-workspace-process="ready"]')).toBeVisible({ timeout: 120000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, 'the page scrolls sideways on a phone').toBeLessThanOrEqual(1);
    await expect(page.locator('[data-analyze-walk=""]')).toBeVisible();
    await expectReadingOrder(page);
  });
});
