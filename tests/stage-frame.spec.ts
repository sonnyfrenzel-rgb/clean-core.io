import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { seedStageProject, signInThroughForm } from './helpers/seed-project';
import {
  LAYER_LABELS,
  layerParam,
  stageBackPlace,
  stageHref,
  workspaceBackHref,
  WORKSPACE_RETURN,
} from '../lib/workspace-back-href';
import { LAYERS, toolMark, workspaceLayers } from '../lib/workspace-model';
import { buildDemoProject } from '../lib/demo-project';
import type { PhaseState } from '../lib/workflow-steps';

/**
 * The seven stages are tools of the workspace (ADR-008, ADR-050, mockup s8).
 *
 * In the workspace a stage opens under a tool header — "Back to workspace ·
 * Business, Need & process", the eyebrow "Tool · <project>", the title — and
 * without the old seven-circle stepper: how far each phase has got is said once,
 * in the workspace. An account without the workspace (until roadmap 3.0.1)
 * keeps the stepper and its rail, because the dashboard is its only way between
 * stages. Both halves are checked here, on the rendered page.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');
const DEMO_RAIL = buildDemoProject().rail;
const STAGES = ['analyze', 'design', 'transformation', 'documentation', 'testing', 'tco', 'delivery'];

test.describe('the way back names the view and the layer', () => {
  test('the layer names are the Anchor Bar\'s own', () => {
    const fromModel = Object.fromEntries(workspaceLayers(null).map((l) => [l.key, l.label]));
    expect(LAYER_LABELS).toEqual(fromModel);
    expect(Object.keys(LAYER_LABELS).sort()).toEqual([...LAYERS].sort());
  });

  test('a layer travels into the stage and back, and is said in words', () => {
    const href = stageHref({ base: '/project/p-1', path: 'testing', view: 'business', from: WORKSPACE_RETURN.tools, layer: '#need' });
    expect(href).toBe('/project/p-1/testing?view=business&from=workspace-tools&layer=need');
    const search = href.slice(href.indexOf('?'));
    // The layer wins over the control: the workspace holds the layer in its fragment.
    expect(workspaceBackHref({ projectId: 'p-1', shell: true, search })).toBe('/project/p-1?view=business#need');
    expect(stageBackPlace(search)).toBe('Business, Need & process');
    expect(stageBackPlace('?view=it')).toBe('IT');
    expect(stageBackPlace('')).toBeNull();
    // Nothing the workspace does not know is carried or said.
    expect(layerParam('L231')).toBeNull();
    expect(stageHref({ base: '/project/p-1', path: 'tco', view: 'it', layer: '<script>' })).toBe('/project/p-1/tco?view=it');
    expect(stageBackPlace('?view=admin&layer=%3Cscript%3E')).toBeNull();
  });

  test('the stepper is drawn by one component, and only without the workspace', () => {
    const progress = read('components/StageProgress.tsx');
    expect(progress).toMatch(/if \(loading \|\| workspaceShellEnabled\(profile\)\) return null;/);
    const footer = read('components/StageFooter.tsx');
    expect(footer).toContain('if (!shell) return <NavigationButtons {...props} />;');
    for (const st of STAGES) {
      const src = read(`app/(app)/project/[projectId]/${st}/page.tsx`);
      expect(src, `${st} imports the stepper itself`).not.toContain("from '@/components/Stepper'");
      expect(src, `${st} renders the old footer itself`).not.toContain('<NavigationButtons');
    }
  });
});

test.describe('a stage as a tool, rendered', () => {
  test.describe.configure({ mode: 'serial' });

  test('in the workspace: tool header, no stepper, no rail', async ({ page }) => {
    test.setTimeout(420 * 1000);
    const acct = await seedStageProject({ prefix: 'stageframe', admin: true, acceptTerms: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInThroughForm(page, acct);
    let marks: string[] | undefined;
    for (const st of STAGES) {
      await page.goto(`/project/${acct.projectId}/${st}?view=business&from=workspace-tools&layer=need`, {
        waitUntil: 'domcontentloaded',
      });
      await page.waitForSelector('[data-stage-title]', { timeout: 60000 });
      const back = page.locator('[data-stage-back]');
      await expect(back, `${st}: the way back`).toHaveText(/Back to workspace · Business, Need & process/, { timeout: 30000 });
      await expect(back).toHaveAttribute('href', `/project/${acct.projectId}?view=business#need`);
      await expect(page.locator('[data-stage-tool]'), `${st}: the tool eyebrow`).toContainText('Tool ·');
      await expect(page.locator('nav[aria-label="Workflow phases"]'), `${st}: the old stepper`).toHaveCount(0);
      await expect(page.locator('[aria-label^="Workflow progress"], [data-rail-phase]'), `${st}: the rail`).toHaveCount(0);
      await expect(page.locator('body'), `${st}: linear-flow footer`).not.toContainText(/Proceed to |Continue to /);

      // The way across (ADR-060, Sonny 02.10.2026): the seven tools under the
      // way back, the current one marked, every other one a link that keeps
      // the view, the origin and the layer — so the next stage's way back
      // still leads to where the reader left the workspace.
      const bar = page.locator('[data-stage-tools="open"]');
      await expect(bar, `${st}: the tools bar`).toBeVisible({ timeout: 30000 });
      await expect(page.locator('[data-stage-tools="menu"]'), `${st}: a menu beside the open bar`).toBeHidden();
      const tools = bar.locator('a[data-workspace-tool]');
      await expect(tools).toHaveCount(7);
      await expect(bar.locator('a[aria-current="page"]'), `${st}: the current tool`).toHaveCount(1);
      await expect(bar.locator(`a[data-workspace-tool="${st}"]`)).toHaveAttribute('aria-current', 'page');
      const other = STAGES.find((s) => s !== st)!;
      await expect(bar.locator(`a[data-workspace-tool="${other}"]`)).toHaveAttribute(
        'href',
        `/project/${acct.projectId}/${other}?view=business&from=workspace-tools&layer=need`,
      );
      // One project, one reading: every stage shows the same marks.
      const reading = await tools.evaluateAll((els) =>
        els.map((el) =>
          [
            el.getAttribute('data-workspace-tool'),
            el.getAttribute('data-phase-state'),
            el.getAttribute('data-workspace-tool-mark-meaning'),
            el.querySelectorAll('[data-workspace-tool-mark="check"]').length,
            el.querySelectorAll('[data-workspace-tool-mark="dot"]').length,
          ].join(':'),
        ),
      );
      marks ??= reading;
      expect(reading, `${st}: the bar reads the project differently here`).toEqual(marks);
      // Each mark is the tools-bar rule (ADR-060, owner 02.10.2026): a check
      // where the tool was used, a dot where it is out of date, nothing else.
      for (const r of reading) {
        const [key, state, meaning, checks, dots] = r.split(':');
        const want = toolMark({ state: state as PhaseState });
        expect(`${key}:${meaning}:${checks}:${dots}`, `${st}: ${key}`).toBe(
          `${key}:${want.meaning}:${want.kind === 'check' ? 1 : 0}:${want.kind === 'dot' ? 1 : 0}`,
        );
      }
      // The legend stands beside "Tools" on every stage.
      await expect(bar.locator('[data-tools-legend="bar"]'), `${st}: the legend`).toBeVisible();
    }

    // And a link to another tool goes there, with the way back intact.
    await page.locator('[data-stage-tools="open"] a[data-workspace-tool="analyze"]').click();
    await page.waitForURL(`**/project/${acct.projectId}/analyze?view=business&from=workspace-tools&layer=need`, { timeout: 60000 });
    await expect(page.locator('[data-stage-header="analyze"]')).toBeVisible({ timeout: 60000 });
    await expect(page.locator('[data-stage-back]')).toHaveText(/Back to workspace · Business, Need & process/, { timeout: 30000 });
    await expect(page.locator('[data-stage-tools="open"] a[aria-current="page"]')).toHaveAttribute('data-workspace-tool', 'analyze');
  });

  test('without the workspace: the stepper stays', async ({ page }) => {
    test.setTimeout(180 * 1000);
    const acct = await seedStageProject({ prefix: 'stageframe-plain', acceptTerms: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInThroughForm(page, acct);
    await page.goto(`/project/${acct.projectId}/documentation`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('nav[aria-label="Workflow phases"] [data-phase]')).toHaveCount(7, { timeout: 60000 });
    await expect(page.locator('[data-stage-tool]')).toHaveCount(0);
    // One way across, not two: the stepper is the one navigation here.
    await expect(page.locator('[data-stage-tools]')).toHaveCount(0);
  });

  test('the demo stages carry the same bar instead of the stepper', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const st of STAGES) {
      await page.goto(`/demo/${st}`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('[data-demo-ready="true"]')).toBeAttached({ timeout: 60000 });
      const bar = page.locator('[data-stage-tools="open"]');
      await expect(bar, `demo ${st}: the tools bar`).toBeVisible();
      await expect(bar.locator('a[data-workspace-tool]')).toHaveCount(7);
      await expect(bar.locator(`a[data-workspace-tool="${st}"]`)).toHaveAttribute('aria-current', 'page');
      await expect(page.locator('nav[aria-label="Workflow phases"]'), `demo ${st}: a second navigation`).toHaveCount(0);
      // The same rule on the demo's own rail: a check where it has something on
      // record, a dot where it is out of date, nothing else — and the legend.
      await expect(bar.locator('[data-tools-legend="bar"]'), `demo ${st}: the legend`).toBeVisible();
      for (const step of DEMO_RAIL) {
        const link = bar.locator(`a[data-workspace-tool="${step.key}"]`);
        const want = toolMark(step);
        await expect(link.locator('[data-workspace-tool-mark="check"]'), `demo ${st}: ${step.key} check`).toHaveCount(want.kind === 'check' ? 1 : 0);
        await expect(link.locator('[data-workspace-tool-mark="dot"]'), `demo ${st}: ${step.key} dot`).toHaveCount(want.kind === 'dot' ? 1 : 0);
        await expect(link, `demo ${st}: ${step.key} claims proof`).not.toHaveAccessibleName(/prove|proof|verif/i);
      }
    }
    await page.locator('[data-stage-tools="open"] a[data-workspace-tool="design"]').click();
    await page.waitForURL('**/demo/design', { timeout: 60000 });
    await expect(page.locator('[data-stage-tools="open"] a[aria-current="page"]')).toHaveAttribute('data-workspace-tool', 'design');
  });
});

/**
 * One frame for every stage (owner 02.10.2026: "wenn ich von analyze zu design
 * schalte ist der ganze bildschirm nach links gerückt, alle screens müssen je
 * nach formfaktor sich gleich anfühlen"; ADR-063).
 *
 * Each stage used to pick its own container — Analyze `max-w-5xl mx-auto`,
 * Transformation and Delivery `max-w-7xl mx-auto`, Design and Documentation the
 * shell's wide frame, the rest the shell's narrow one — so the way back, the
 * tools bar, the title and the content started at a different x on every tool,
 * and switching tools moved the whole page sideways. Now every stage renders
 * inside `StageFrame` (`[data-stage-frame]`) and the shell gives every stage the
 * same width. Checked on the rendered page, signed in and in the demo, at the
 * five form factors: the left edge of the frame, the way back, the tools bar
 * and the title line, and the frame's width, are the same on all fourteen
 * pages to the pixel. The title is measured by its line (the `h1` and the
 * neutral icon some stages set before it), because the icon belongs to the
 * title, not to its own column.
 */
test.describe('one frame for every stage, rendered', () => {
  test.describe.configure({ mode: 'serial' });
  const WIDTHS = [390, 768, 1024, 1440, 1920];

  type Box = { left: number; width: number } | null;
  type Measure = { frame: Box; header: Box; back: Box; bar: Box; title: Box };

  async function measure(page: import('@playwright/test').Page): Promise<Measure> {
    return page.evaluate(() => {
      const box = (el: Element | null | undefined) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return r.width === 0 && r.height === 0 ? null : { left: Math.round(r.left), width: Math.round(r.width) };
      };
      return {
        frame: box(document.querySelector('[data-stage-frame]')),
        header: box(document.querySelector('[data-stage-header]')),
        back: box(document.querySelector('[data-stage-back]')),
        bar: box(document.querySelector('[data-stage-toolbar]')),
        title: box(document.querySelector('[data-stage-title]')?.parentElement),
      };
    });
  }

  test('every stage and every demo stage stands in the same frame at every width', async ({ page }) => {
    test.setTimeout(900 * 1000);
    const acct = await seedStageProject({ prefix: 'stageframe-x', admin: true, acceptTerms: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInThroughForm(page, acct);

    const pages = [
      ...STAGES.map((st) => ({ name: st, url: `/project/${acct.projectId}/${st}?view=business&from=workspace-tools&layer=need`, demo: false })),
      ...STAGES.map((st) => ({ name: `demo ${st}`, url: `/demo/${st}`, demo: true })),
    ];
    const seen: Record<number, Array<{ name: string; m: Measure }>> = {};
    for (const p of pages) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(p.url, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-stage-title]', { timeout: 60000 });
      if (p.demo) await expect(page.locator('[data-demo-ready="true"]')).toBeAttached({ timeout: 60000 });
      else await expect(page.locator('[data-stage-back]'), `${p.name}: the way back`).toBeVisible({ timeout: 90000 });
      // The page settled: the tools bar drawn and, in the product, the project read
      // (the eyebrow names it) — a stage still loading has a header of its own.
      await expect(page.locator('[data-stage-toolbar]'), `${p.name}: the tools bar`).toBeVisible({ timeout: 90000 });
      if (!p.demo) await expect(page.locator('[data-stage-tool]'), `${p.name}: the project read`).toContainText('Tool ·', { timeout: 60000 });
      for (const w of WIDTHS) {
        await page.setViewportSize({ width: w, height: 900 });
        // Let the layout follow the new width before reading it.
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        (seen[w] ??= []).push({ name: p.name, m: await measure(page) });
      }
    }

    // Soft, so one run names every page that is out of line, not only the first.
    const near = (a: number | undefined, b: number | undefined) => (a === undefined || b === undefined ? Infinity : Math.abs(a - b));
    for (const w of WIDTHS) {
      const rows = seen[w];
      const first = rows[0];
      for (const { name, m } of rows) {
        const at = `${name} at ${w}px`;
        // Across pages: the header block at the same x as on the first stage.
        expect.soft(near(m.title?.left, first.m.title?.left), `${at}: title x vs ${first.name}`).toBeLessThanOrEqual(1);
        expect.soft(near(m.bar?.left, first.m.bar?.left), `${at}: tools bar x vs ${first.name}`).toBeLessThanOrEqual(1);
        if (m.back && first.m.back) expect.soft(near(m.back.left, first.m.back.left), `${at}: way back x vs ${first.name}`).toBeLessThanOrEqual(1);
        // The content: one frame, the same x and the same width everywhere.
        expect.soft(m.frame, `${at}: no [data-stage-frame]`).not.toBeNull();
        expect.soft(near(m.frame?.left, first.m.frame?.left), `${at}: frame x vs ${first.name}`).toBeLessThanOrEqual(1);
        expect.soft(near(m.frame?.width, first.m.frame?.width), `${at}: frame width vs ${first.name}`).toBeLessThanOrEqual(1);
        // Inside one page: the header block starts where the content starts.
        expect.soft(near(m.header?.left, m.frame?.left), `${at}: header vs frame`).toBeLessThanOrEqual(1);
        expect.soft(near(m.title?.left, m.frame?.left), `${at}: title vs frame`).toBeLessThanOrEqual(1);
        expect.soft(near(m.bar?.left, m.frame?.left), `${at}: tools bar vs frame`).toBeLessThanOrEqual(1);
        if (m.back) expect.soft(near(m.back.left, m.frame?.left), `${at}: way back vs frame`).toBeLessThanOrEqual(1);
      }
    }
  });
});
