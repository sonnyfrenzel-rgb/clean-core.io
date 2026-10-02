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
 * The workspace's tools, side by side on a wide screen, each marked when it has
 * been used in this project — ADR-060, Sonny 02.10.2026: "responsive layout,
 * in desktop mode always side by side, with small green check marks where I
 * have already used it in the project", and the same day: "one has to know what
 * the red dots mean, but I also wanted them to have small green ticks for a
 * tool already used once."
 *
 * What holds it:
 *   - the mark is derived from the phase state in `workflowSteps` alone and
 *     never from a client-set `status`: a green check where something is on
 *     record (`done` or `partial`) and not out of date, an amber dot where it is
 *     `stale`, nothing where nothing is on record;
 *   - the mark says "used", never "proven" or "verified" — proof strength stays
 *     with the stepper and the status chips;
 *   - a legend in text explains both marks, beside "Tools" and at the top of
 *     the phone menu; each mark has its words for a screen reader and a tooltip;
 *   - from breakpoint L the seven are visible in every view without opening a
 *     menu; on a phone (390 px) the bar is the menu and nothing scrolls sideways.
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

  test('a check where the tool was used, a dot where it is out of date, nothing where nothing is on record', () => {
    const used = { kind: 'check', meaning: 'used', words: 'tools.mark.used' };
    expect(toolMark({ state: 'done' })).toEqual(used);
    expect(toolMark({ state: 'partial' })).toEqual(used);
    expect(toolMark({ state: 'stale' })).toEqual({ kind: 'dot', meaning: 'stale', words: 'tools.mark.stale' });
    expect(toolMark({ state: 'empty' })).toEqual({ kind: 'none', meaning: 'none', words: null });
    // Proof strength is not the bar's to say: a proven phase and an unproven one
    // carry the same mark (the stepper and the chips keep telling them apart).
    const proven = { state: 'done' as const, proven: true };
    const unproven = { state: 'done' as const, proven: false };
    expect(toolMark(proven)).toEqual(toolMark(unproven));
  });

  test('the marks and the legend never claim proof', () => {
    const toolWords = Object.entries(WORKSPACE_MESSAGES).filter(([key]) => key.startsWith('tools.'));
    expect(toolWords.map(([key]) => key)).toEqual(
      expect.arrayContaining(['tools.mark.used', 'tools.mark.stale', 'tools.legend.used', 'tools.legend.stale']),
    );
    for (const [key, words] of toolWords) {
      expect(words, `${key} claims proof`).not.toMatch(/prove|proof|verif|confirm|evidence|signed/i);
    }
    // The bar draws no proof: no tone ladder, no `proven` read.
    const bar = read('components/workspace/ToolBar.tsx');
    expect(bar).not.toContain('PHASE_TONE_CLASS');
    expect(bar).not.toMatch(/\.proven\b/);
  });

  test('the toolbar never reads a client-set status', () => {
    for (const rel of ['components/workspace/ToolBar.tsx', 'lib/workspace-model.ts']) {
      expect(read(rel)).not.toMatch(/project\??\.status\b/);
    }
  });
});

/* -------------------------------------------------------------- rendered */

const PASSWORD = 'ToolbarInline123!';

/** "Analyze (used)" — the name and, in brackets, the mark's words. */
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
        meaning: el.getAttribute('data-workspace-tool-mark-meaning'),
        kind: el.getAttribute('data-workspace-tool-mark-kind'),
        title: el.querySelector('[title]')?.getAttribute('title') ?? null,
        checks: el.querySelectorAll('[data-workspace-tool-mark="check"]').length,
        dots: el.querySelectorAll('[data-workspace-tool-mark="dot"]').length,
      })),
    );
  }

  test('desktop: seven tools side by side in every view, no menu to open; each used tool carries a green check, with its words and the legend', async ({
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
      expect(marks.map((m) => [m.key, m.state, m.meaning, m.kind])).toEqual(
        steps.map((s) => [s.key, s.state, toolMark(s).meaning, toolMark(s).kind]),
      );
      // A check exactly where something is on record — Analyze (signed run)
      // and Economics (its estimate from the analysis, `partial`) — and a dot
      // nowhere, since nothing here is out of date.
      expect(
        marks.filter((m) => m.checks === 1 && m.dots === 0).map((m) => m.key),
        `${view}: the checks are not where the tools were used`,
      ).toEqual(steps.filter((s) => s.state === 'done' || s.state === 'partial').map((s) => s.key));
      expect(marks.filter((m) => m.checks > 0).map((m) => m.key)).toEqual(['analyze', 'tco']);
      expect(marks.filter((m) => m.dots > 0).map((m) => m.key), `${view}: a dot on a project with nothing out of date`).toEqual([]);
      for (const m of marks) {
        expect(m.title, `${view}: ${m.key} has no tooltip, or one on an untouched tool`).toBe(
          m.checks ? WORKSPACE_MESSAGES['tools.mark.usedHint'] : null,
        );
      }

      // The legend says what the marks mean, in text, beside "Tools".
      const legend = bar.locator('[data-tools-legend="bar"]');
      await expect(legend, `${view}: the legend`).toBeVisible();
      await expect(legend).toContainText(WORKSPACE_MESSAGES['tools.legend.used']);
      await expect(legend).toContainText(WORKSPACE_MESSAGES['tools.legend.stale']);

      // No tool is ever named proven or verified here.
      const names = await links.evaluateAll((els) => els.map((el) => (el.textContent || '').trim()));
      for (const name of names) expect(name, `${view}: a tool claims proof`).not.toMatch(/prove|proof|verif/i);
    }

    // The check is green — the success token, not a near-green — and the words say why.
    const analyze = page.locator('[data-workspace-tools="open"] a[data-workspace-tool="analyze"]');
    await expect(analyze).toHaveAccessibleName(named('Analyze', 'tools.mark.used'));
    await expect(page.locator('[data-workspace-tools="open"] a[data-workspace-tool="tco"]')).toHaveAccessibleName(
      named('Economics', 'tools.mark.used'),
    );
    const [tick, legendTick, success] = await analyze.evaluate((el) => {
      const toRgb = (value: string) => {
        const probe = document.createElement('span');
        probe.style.color = value;
        document.body.appendChild(probe);
        const rgb = getComputedStyle(probe).color;
        probe.remove();
        return rgb;
      };
      return [
        getComputedStyle(el.querySelector('[data-workspace-tool-mark="check"]') as Element).color,
        getComputedStyle(document.querySelector('[data-tools-legend="bar"] svg') as Element).color,
        toRgb(getComputedStyle(document.documentElement).getPropertyValue('--cc-success').trim()),
      ];
    });
    expect(success, 'the token never reached the browser').not.toBe('');
    expect(tick).toBe(success);
    expect(tick).toBe('rgb(4, 120, 87)');
    expect(legendTick, 'the legend shows another check than the bar').toBe(tick);
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

  test('a stale Analyze: no check, the amber dot, "out of date" in words and tooltip; a used Design keeps its check', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signInThroughForm(page, acct);

    const steps = expectedSteps(STALE, staleDoc(acct.uid), RUN_S, staleRun(STALE, acct.uid, RUN_S));
    expect(steps.find((s) => s.key === 'analyze')?.state, 'the fixture is not stale').toBe('stale');

    await open(page, STALE, 'business');
    const marks = await shown(page, '[data-workspace-tools="open"]');
    expect(marks.map((m) => [m.key, m.state, m.meaning, m.kind])).toEqual(
      steps.map((s) => [s.key, s.state, toolMark(s).meaning, toolMark(s).kind]),
    );
    const staleKeys = steps.filter((s) => s.state === 'stale').map((s) => s.key);
    expect(staleKeys, 'the fixture has nothing stale').toContain('analyze');
    expect(marks.filter((m) => m.dots === 1 && m.checks === 0).map((m) => m.key), 'a stale tool without its dot').toEqual(staleKeys);
    for (const m of marks.filter((x) => x.dots > 0)) {
      expect(m.title, `${m.key}: the dot explains itself`).toBe(WORKSPACE_MESSAGES['tools.mark.staleHint']);
    }
    expect(
      marks.filter((m) => m.checks > 0).map((m) => m.key),
      'a check on an out-of-date tool, or none on a used one',
    ).toEqual(steps.filter((s) => s.state === 'done' || s.state === 'partial').map((s) => s.key));
    expect(marks.find((m) => m.key === 'design')?.checks, 'Design is on record and current').toBe(1);

    const analyze = page.locator('[data-workspace-tools="open"] a[data-workspace-tool="analyze"]');
    await expect(analyze.locator('[data-workspace-tool-mark="dot"]')).toHaveCount(1);
    await expect(analyze).toHaveAccessibleName(named('Analyze', 'tools.mark.stale'));
    await expect(page.locator('[data-workspace-tools="open"] a[data-workspace-tool="design"]')).toHaveAccessibleName(
      named('Design', 'tools.mark.used'),
    );
    // The dot is the warning mark, and the legend shows the same one.
    const [dot, legendDot] = await analyze.evaluate((el) => [
      getComputedStyle(el.querySelector('[data-workspace-tool-mark="dot"]') as Element).backgroundColor,
      getComputedStyle(document.querySelector('[data-tools-legend="bar"] span[aria-hidden]') as Element).backgroundColor,
    ]);
    expect(dot).not.toBe('rgba(0, 0, 0, 0)');
    expect(legendDot).toBe(dot);
  });

  test('a phone at 390: the menu, no sideways scroll, the legend on top and the check inside it', async ({ browser }) => {
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
    // The legend first, before the first tool, in text.
    const legend = panel.locator('[data-tools-legend="menu"]');
    await expect(legend).toBeVisible();
    await expect(legend).toContainText(WORKSPACE_MESSAGES['tools.legend.used']);
    await expect(legend).toContainText(WORKSPACE_MESSAGES['tools.legend.stale']);
    expect(
      await panel.evaluate((el) => el.firstElementChild?.getAttribute('data-tools-legend')),
      'the legend is not at the top of the menu',
    ).toBe('menu');
    await expect(panel.locator('a[data-workspace-tool="analyze"]')).toHaveAccessibleName(named('Analyze', 'tools.mark.used'));
    await expect(panel.locator('a[data-workspace-tool="analyze"] [data-workspace-tool-mark="check"]')).toBeVisible();
    await expect(panel.locator('a[data-workspace-tool="design"]')).toHaveAccessibleName('Design');
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
