import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { adminSetDoc } from './helpers/admin-seed';
import { seedStageProject, signInThroughForm, type SeededProject } from './helpers/seed-project';
import { toolMark, workspaceTools } from '../lib/workspace-model';
import { workflowSteps } from '../lib/workflow-steps';
import { hydrateProject } from '../lib/project-loader';
import { analysisRunInputs, buildInputManifest } from '../lib/input-manifest';
import { sha256Hex } from '../lib/artefact-digest';
import { WORKSPACE_MESSAGES } from '../lib/workspace-messages';
import type { Project } from '../lib/types';

/**
 * The workspace's tools, side by side on a wide screen, each with the
 * stepper's mark for its phase — ADR-059, Sonny 02.10.2026: "responsive layout,
 * in desktop mode always side by side, with small green check marks where I
 * have already used it in the project."
 *
 * What holds it:
 *   - the mark is derived from `workflowSteps` alone, the derivation the stepper
 *     reads — green only for `proven`, a tick only for `done`, stale never
 *     ticked — and never from a client-set `status`;
 *   - from breakpoint L the seven are visible in every view without opening a
 *     menu; on a phone (390 px) the bar is the menu and nothing scrolls sideways;
 *   - each mark has its words for a screen reader.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');

const SOURCE = 'REPORT z_toolbar.\nOPEN DATASET lv_f FOR OUTPUT IN TEXT MODE ENCODING UTF-8.\n';
const manifestFor = (source: string) =>
  buildInputManifest(
    analysisRunInputs({
      sourceSha256: sha256Hex(source),
      deploymentTarget: 'private',
      catalogVersion: 'catalog-7.7',
      rulesetVersion: 'levels/1.3',
      engineVersion: '3.0.0',
      model: null,
    }),
  );

/** Analyze done by a signed run on this very source — nothing else on record. */
const analyzedDoc = (uid: string): Record<string, unknown> => ({
  name: 'Toolbar — analysed', userId: uid, createdAt: new Date(),
  legacyCode: SOURCE, s4Deployment: 'private', cleanCoreScore: 62,
  // A client-set status that claims the opposite: the bar must not read it.
  status: 'completed',
});
const analyzedRun = (projectId: string, uid: string, runId: string): Record<string, unknown> => ({
  runId, projectId, userId: uid, createdAt: new Date().toISOString(), status: 'completed',
  cleanCoreScore: 62, inputManifest: manifestFor(SOURCE),
});

/** The run's manifest names a different source: Analyze is stale, and so is what hangs on it. */
const staleDoc = (uid: string): Record<string, unknown> => ({
  ...analyzedDoc(uid), name: 'Toolbar — stale', solutionDesign: '# Target architecture\n',
});
const staleRun = (projectId: string, uid: string, runId: string): Record<string, unknown> => ({
  ...analyzedRun(projectId, uid, runId), inputManifest: manifestFor('REPORT z_earlier_source.\n'),
});

/** What the workspace computes: the document with its run spread over it, exactly as it opens it. */
const expectedSteps = (projectId: string, doc: Record<string, unknown>, runId: string, run: Record<string, unknown>) =>
  workflowSteps(hydrateProject(projectId, { ...doc, activeRunId: runId } as Project, { kind: 'found', data: run }));

/* ------------------------------------------------------------- the derivation */

test.describe('the mark is the stepper\'s reading of the phase', () => {
  test('state and proven come from workflowSteps, for every tool', () => {
    const fixtures: Array<Project | null> = [
      null,
      hydrateProject('a', { ...analyzedDoc('u'), activeRunId: 'r' } as Project, { kind: 'found', data: analyzedRun('a', 'u', 'r') }),
      hydrateProject('s', { ...staleDoc('u'), activeRunId: 'r' } as Project, { kind: 'found', data: staleRun('s', 'u', 'r') }),
    ];
    for (const project of fixtures) {
      const steps = workflowSteps(project);
      const tools = workspaceTools(project);
      expect(tools.map((t) => [t.key, t.state, t.proven])).toEqual(steps.map((s) => [s.key, s.state, s.proven]));
    }
  });

  test('a tick only where the stepper ticks, green only where it is proven, stale never ticked', () => {
    expect(toolMark({ state: 'done', proven: true })).toEqual({ kind: 'check', tone: 'proven', words: 'tools.mark.proven' });
    expect(toolMark({ state: 'done', proven: false })).toEqual({ kind: 'check', tone: 'unproven', words: 'tools.mark.unproven' });
    expect(toolMark({ state: 'partial', proven: false })).toEqual({ kind: 'dot', tone: 'unproven', words: 'tools.mark.started' });
    expect(toolMark({ state: 'stale', proven: false })).toEqual({ kind: 'dot', tone: 'stale', words: 'tools.mark.stale' });
    expect(toolMark({ state: 'empty', proven: false })).toEqual({ kind: 'none', tone: 'none', words: null });
  });

  test('the toolbar never reads a client-set status', () => {
    for (const rel of ['components/workspace/ToolBar.tsx', 'lib/workspace-model.ts']) {
      expect(read(rel)).not.toMatch(/project\??\.status\b/);
    }
  });
});

/* -------------------------------------------------------------- rendered */

const PASSWORD = 'ToolbarInline123!';

/** "Analyze (done and verified)" — the name and, in brackets, the mark's words. */
const named = (label: string, key: keyof typeof WORKSPACE_MESSAGES) =>
  new RegExp(`^${label}\\s*\\(${WORKSPACE_MESSAGES[key]}\\)$`);

test.describe('the toolbar, rendered', () => {
  test.describe.configure({ mode: 'serial' });

  let acct: SeededProject;
  const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const ANALYZED = `toolbar-analysed-${tag}`;
  const STALE = `toolbar-stale-${tag}`;
  const RUN_A = `toolbar-run-a-${tag}`;
  const RUN_S = `toolbar-run-s-${tag}`;

  test.beforeAll(async () => {
    test.setTimeout(180 * 1000);
    acct = await seedStageProject({ prefix: 'toolbar', admin: true, acceptTerms: true, password: PASSWORD });
    await adminSetDoc('projects', ANALYZED, { ...analyzedDoc(acct.uid), activeRunId: RUN_A });
    await adminSetDoc(`projects/${ANALYZED}/runs`, RUN_A, analyzedRun(ANALYZED, acct.uid, RUN_A));
    await adminSetDoc('projects', STALE, { ...staleDoc(acct.uid), activeRunId: RUN_S });
    await adminSetDoc(`projects/${STALE}/runs`, RUN_S, staleRun(STALE, acct.uid, RUN_S));
  });

  async function open(page: Page, projectId: string, view: 'business' | 'it' | 'management'): Promise<void> {
    await page.goto(`/project/${projectId}?view=${view}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator(`[data-workspace-shell="${view}"]`)).toBeVisible({ timeout: 60000 });
  }

  /** Each tool's state and mark as the page shows them. */
  async function shown(page: Page, scope: string) {
    return page.locator(`${scope} a[data-workspace-tool]`).evaluateAll((els) =>
      els.map((el) => ({
        key: el.getAttribute('data-workspace-tool'),
        state: el.getAttribute('data-phase-state'),
        tone: el.getAttribute('data-phase-tone'),
        kind: el.getAttribute('data-workspace-tool-mark-kind'),
        checks: el.querySelectorAll('[data-workspace-tool-mark="check"]').length,
        dots: el.querySelectorAll('[data-workspace-tool-mark="dot"]').length,
      })),
    );
  }

  test('desktop: seven tools side by side in every view, no menu to open; Analyze alone carries a tick, in green, with its words', async ({
    page,
  }) => {
    test.setTimeout(300 * 1000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signInThroughForm(page, acct);

    const steps = expectedSteps(ANALYZED, analyzedDoc(acct.uid), RUN_A, analyzedRun(ANALYZED, acct.uid, RUN_A));
    expect(steps.find((s) => s.key === 'analyze')).toMatchObject({ state: 'done', proven: true });

    for (const view of ['business', 'it', 'management'] as const) {
      await open(page, ANALYZED, view);
      const bar = page.locator('[data-workspace-tools="open"]');
      await expect(bar, `${view}: the open bar`).toBeVisible();
      await expect(page.locator('[data-workspace-tools="menu"]'), `${view}: a menu beside the open bar`).toBeHidden();
      const links = bar.locator('a[data-workspace-tool]');
      await expect(links).toHaveCount(7);
      for (let i = 0; i < 7; i++) await expect(links.nth(i), `${view}: tool ${i + 1} is not visible`).toBeVisible();
      // Workflow order, from the one contract.
      expect(await links.evaluateAll((els) => els.map((el) => el.getAttribute('data-workspace-tool')))).toEqual(
        steps.map((s) => s.key),
      );
      // Nothing was opened to see them.
      await expect(page.locator('[data-workspace-tools-panel]')).toHaveCount(0);

      const marks = await shown(page, '[data-workspace-tools="open"]');
      expect(marks.map((m) => [m.key, m.state, m.tone])).toEqual(
        steps.map((s) => [s.key, s.state, toolMark(s).tone]),
      );
      expect(
        marks.filter((m) => m.checks > 0).map((m) => m.key),
        `${view}: a tick on a tool with no finished phase`,
      ).toEqual(['analyze']);
    }

    // The tick is green — the token, not a near-green — and the words say why.
    const analyze = page.locator('[data-workspace-tools="open"] a[data-workspace-tool="analyze"]');
    await expect(analyze).toHaveAccessibleName(named('Analyze', 'tools.mark.proven'));
    const [tick, success] = await analyze.evaluate((el) => [
      getComputedStyle(el.querySelector('[data-workspace-tool-mark="check"]') as Element).color,
      getComputedStyle(document.documentElement).getPropertyValue('--cc-success').trim(),
    ]);
    expect(success, 'the token never reached the browser').not.toBe('');
    expect(tick).toBe('rgb(4, 120, 87)');
    // A tool with nothing on record says nothing extra.
    await expect(page.locator('[data-workspace-tools="open"] a[data-workspace-tool="design"]')).toHaveAccessibleName('Design');

    // Keyboard: real links, reached by Tab, with the visible focus ring.
    await analyze.focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(analyze).toBeFocused();
    const ring = await analyze.evaluate((el) => {
      const s = getComputedStyle(el);
      return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
    });
    expect(ring.style).toBe('solid');
    expect(ring.width).toBeGreaterThanOrEqual(2);
  });

  test('a stale Analyze shows what the stepper shows: no tick, the stale dot, "out of date" in words', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signInThroughForm(page, acct);

    const steps = expectedSteps(STALE, staleDoc(acct.uid), RUN_S, staleRun(STALE, acct.uid, RUN_S));
    expect(steps.find((s) => s.key === 'analyze')?.state, 'the fixture is not stale').toBe('stale');

    await open(page, STALE, 'business');
    const marks = await shown(page, '[data-workspace-tools="open"]');
    expect(marks.map((m) => [m.key, m.state, m.tone, m.kind])).toEqual(
      steps.map((s) => [s.key, s.state, toolMark(s).tone, toolMark(s).kind]),
    );
    expect(marks.filter((m) => m.checks > 0).map((m) => m.key), 'a stale phase is never done').toEqual([]);
    const analyze = page.locator('[data-workspace-tools="open"] a[data-workspace-tool="analyze"]');
    await expect(analyze.locator('[data-workspace-tool-mark="dot"]')).toHaveCount(1);
    await expect(analyze).toHaveAccessibleName(named('Analyze', 'tools.mark.stale'));
  });

  test('a phone at 390: the menu, no sideways scroll, and the tick travels into the menu', async ({ browser }) => {
    test.setTimeout(240 * 1000);
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await signInThroughForm(page, acct);
    for (const view of ['business', 'it'] as const) {
      await open(page, ANALYZED, view);
      await expect(page.locator('[data-workspace-tools="open"]'), `${view}: the open bar on a phone`).toBeHidden();
      await expect(page.locator('[data-workspace-tools="menu"]')).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${view}: the page scrolls sideways at 390 px`).toBeLessThanOrEqual(0);
    }
    await page.locator('[data-workspace-tools="menu"] button[aria-expanded]').click();
    const panel = page.locator('[data-workspace-tools-panel]');
    await expect(panel.locator('a[data-workspace-tool]')).toHaveCount(7);
    await expect(panel.locator('a[data-workspace-tool="analyze"]')).toHaveAccessibleName(named('Analyze', 'tools.mark.proven'));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, 'the open menu pushes the page sideways').toBeLessThanOrEqual(0);
    await context.close();
  });

  test('between the breakpoints Business keeps the menu (M, 900 px)', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 900, height: 1000 });
    await signInThroughForm(page, acct);
    await open(page, ANALYZED, 'business');
    await expect(page.locator('[data-workspace-tools="open"]')).toBeHidden();
    await expect(page.locator('[data-workspace-tools="menu"]')).toBeVisible();
  });
});
