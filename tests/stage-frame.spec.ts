import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { seedStageProject, signInThroughForm } from './helpers/seed-project';
import {
  demoWorkspaceBackHref,
  LAYER_LABELS,
  layerParam,
  stageBackPlace,
  stageHref,
  workspaceBackHref,
  WORKSPACE_RETURN,
} from '../lib/workspace-back-href';
import { LAYER_ADDRESSES, LAYERS, toolMark, workspaceLayers } from '../lib/workspace-model';
import { buildDemoProject } from '../lib/demo-project';
import type { PhaseKey, PhaseState } from '../lib/workflow-steps';

/**
 * The seven stages are tools of the workspace (ADR-008, ADR-050, mockup s8).
 *
 * In the workspace a stage opens under a tool header — "Back to project
 * workspace · <project> · Business view, Standard fit", the eyebrow "Tool · <project>", the title — and
 * without the old seven-circle stepper: how far each phase has got is said once,
 * in the workspace, and the tools bar carries its marks. Until roadmap 3.0.1 an
 * account without the workspace kept the stepper and its rail; since then
 * (ADR-061) every account has the workspace, the stepper, the rail and the
 * linear footer are gone, and every account gets the same tool header and bar.
 * Checked here on the rendered page, for an administrator and for an ordinary
 * account alike.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');
const DEMO_RAIL = buildDemoProject().rail;
const STAGES = ['analyze', 'design', 'transformation', 'documentation', 'testing', 'tco', 'delivery'];

test.describe('the way back names the view and the layer', () => {
  test('the layer names are the Anchor Bar\'s own', () => {
    const fromModel = Object.fromEntries(workspaceLayers(null).map((l) => [l.key, l.label]));
    // Every address a way back may carry has a name — the retired
    // *Changes & commitments* (ADR-087) included, which no bar shows any more.
    const { changes, ...live } = LAYER_LABELS;
    expect(changes).toBe('Changes & commitments');
    expect(live).toEqual(fromModel);
    expect(Object.keys(live).sort()).toEqual([...LAYERS].sort());
    expect(Object.keys(LAYER_LABELS).sort()).toEqual([...LAYER_ADDRESSES].sort());
  });

  test('a layer travels into the stage and back, and is said in words', () => {
    const href = stageHref({ base: '/project/p-1', path: 'testing', view: 'it', from: WORKSPACE_RETURN.tools, layer: '#need' });
    expect(href).toBe('/project/p-1/testing?view=it&from=workspace-tools&layer=need');
    const search = href.slice(href.indexOf('?'));
    // The layer wins over the control: the workspace holds the layer in its
    // fragment. IT has no layers since ADR-086, so a stage opened from one
    // (a link from before 3.0.7) returns to where that content lives now —
    // Need & process to the Business map — and says so.
    expect(workspaceBackHref({ projectId: 'p-1', search })).toBe('/project/p-1?view=business#process-map');
    expect(stageBackPlace(search)).toBe('Business view, Process map');
    const itBack = (layer: string) => workspaceBackHref({ projectId: 'p-1', search: `?view=it&from=workspace-tools&layer=${layer}` });
    expect(itBack('standard')).toBe('/project/p-1?view=business#standard');
    expect(itBack('architecture')).toBe('/project/p-1?view=it#it-objects');
    expect(itBack('evidence')).toBe('/project/p-1?view=it#it-trust');
    expect(itBack('changes')).toBe('/project/p-1?view=management#decision-card');
    // Costs live in a tool; a way back never leads into a tool, so it returns
    // to the IT view at the control it left by.
    expect(itBack('costs')).toBe('/project/p-1?view=it#workspace-tools');
    expect(stageBackPlace('?view=it&layer=architecture')).toBe('IT view, Objects & dependencies');
    expect(stageBackPlace('?view=it&layer=changes')).toBe('Management view, Decision');
    expect(stageBackPlace('?view=it&layer=costs')).toBe('IT view');
    // Management has no layers since ADR-087: a stage opened from one returns
    // to where that content lives now — the costs to the Costs row of the
    // decision, the changes to the decision, the rest to Business and IT.
    const mgmtBack = (layer: string) =>
      workspaceBackHref({ projectId: 'p-1', search: `?view=management&from=workspace-tools&layer=${layer}` });
    expect(mgmtBack('costs')).toBe('/project/p-1?view=management#decision-rests-on-cost');
    expect(mgmtBack('changes')).toBe('/project/p-1?view=management#decision-card');
    expect(mgmtBack('need')).toBe('/project/p-1?view=business#process-map');
    expect(mgmtBack('standard')).toBe('/project/p-1?view=business#standard');
    expect(mgmtBack('architecture')).toBe('/project/p-1?view=it#it-objects');
    expect(mgmtBack('evidence')).toBe('/project/p-1?view=it#it-trust');
    expect(stageBackPlace('?view=management&layer=costs')).toBe('Management view, Costs');
    expect(stageBackPlace('?view=management&layer=architecture')).toBe('IT view, Objects & dependencies');
    // Business has no Need & process since ADR-080: a link from before it
    // returns to the map, and says so.
    const old = '?view=business&from=workspace-tools&layer=need';
    expect(workspaceBackHref({ projectId: 'p-1', search: old })).toBe('/project/p-1?view=business#process-map');
    expect(stageBackPlace(old)).toBe('Business view, Process map');
    expect(workspaceBackHref({ projectId: 'p-1', search: '?view=business&layer=standard' })).toBe('/project/p-1?view=business#standard');
    expect(stageBackPlace('?view=it')).toBe('IT view');
    expect(stageBackPlace('')).toBeNull();
    // Nothing the workspace does not know is carried or said.
    expect(layerParam('L231')).toBeNull();
    expect(stageHref({ base: '/project/p-1', path: 'tco', view: 'it', layer: '<script>' })).toBe('/project/p-1/tco?view=it');
    expect(stageBackPlace('?view=admin&layer=%3Cscript%3E')).toBeNull();
  });

  test('a demo stage leads back to the demo workspace by the same rule (owner 02.10.2026)', () => {
    const href = stageHref({ base: '/demo', path: 'tco', view: 'it', from: WORKSPACE_RETURN.tools, layer: 'costs' });
    expect(href).toBe('/demo/tco?view=it&from=workspace-tools&layer=costs');
    // IT has no Costs section since ADR-086: back to the control it left by.
    expect(demoWorkspaceBackHref(href.slice(href.indexOf('?')))).toBe('/demo/workspace?view=it#workspace-tools');
    // Management has no layers since ADR-087; the demo's way back follows the
    // workspace's rule (the demo's costs card carries the Costs row's address).
    expect(demoWorkspaceBackHref('?view=management&layer=costs')).toBe('/demo/workspace?view=management#decision-rests-on-cost');
    expect(demoWorkspaceBackHref('?view=it&from=workspace-tools')).toBe('/demo/workspace?view=it#workspace-tools');
    expect(demoWorkspaceBackHref('')).toBe('/demo/workspace');
    expect(demoWorkspaceBackHref('?view=admin&layer=%3Cscript%3E')).toBe('/demo/workspace');
  });

  test('no stage draws a stepper, a rail or a linear footer — for any account', () => {
    // Roadmap 3.0.1 (ADR-061): the stepper and its rail were the way across for
    // an account without the workspace. Every account has the workspace now,
    // so they are gone, and the footer is the way back and nothing else.
    for (const gone of ['components/StageProgress.tsx', 'components/Stepper.tsx', 'components/VerificationRail.tsx', 'components/NavigationButtons.tsx']) {
      expect(fs.existsSync(path.resolve(ROOT, gone)), `${gone} came back`).toBe(false);
    }
    const footer = read('components/StageFooter.tsx');
    expect(footer).toContain('export default function StageFooter() {');
    expect(footer, 'the footer offers a way forward again').not.toMatch(/proceedPath|proceedLabel|Proceed to|Continue to/);
    for (const st of STAGES) {
      const src = read(`app/(app)/project/[projectId]/${st}/page.tsx`);
      expect(src, `${st} imports the stepper itself`).not.toContain("from '@/components/Stepper'");
      expect(src, `${st} renders the old footer itself`).not.toContain('<NavigationButtons');
      expect(src, `${st} draws a progress frame`).not.toContain('<StageProgress');
      expect(src, `${st} hands the footer a way forward`).not.toContain('proceedPath=');
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
      await page.goto(`/project/${acct.projectId}/${st}?view=business&from=workspace-tools&layer=standard`, {
        waitUntil: 'domcontentloaded',
      });
      await page.waitForSelector('[data-stage-title]', { timeout: 60000 });
      const back = page.locator('[data-stage-back]');
      await expect(back, `${st}: the way back`).toHaveText(/Back to project workspace\s·\s.+\s·\sBusiness view, Standard fit/, { timeout: 30000 });
      await expect(back).toHaveAttribute('href', `/project/${acct.projectId}?view=business#standard`);
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
        `/project/${acct.projectId}/${other}?view=business&from=workspace-tools&layer=standard`,
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
            el.querySelectorAll('[data-workspace-tool-mark="half"]').length,
          ].join(':'),
        ),
      );
      marks ??= reading;
      expect(reading, `${st}: the bar reads the project differently here`).toEqual(marks);
      // Each mark is the tools-bar rule (ADR-060, owner 02.10.2026): a check
      // where the tool was used, a dot where it is out of date, nothing else.
      for (const r of reading) {
        const [key, state, meaning, checks, dots, halves] = r.split(':');
        const want = toolMark({ key: key as PhaseKey, state: state as PhaseState });
        expect(`${key}:${meaning}:${checks}:${dots}:${halves}`, `${st}: ${key}`).toBe(
          `${key}:${want.meaning}:${want.kind === 'check' ? 1 : 0}:${want.kind === 'dot' ? 1 : 0}:${want.kind === 'half' ? 1 : 0}`,
        );
      }
      // The legend stands beside "Tools" on every stage.
      await expect(bar.locator('[data-tools-legend="bar"]'), `${st}: the legend`).toBeVisible();
    }

    // And a link to another tool goes there, with the way back intact.
    await page.locator('[data-stage-tools="open"] a[data-workspace-tool="analyze"]').click();
    await page.waitForURL(`**/project/${acct.projectId}/analyze?view=business&from=workspace-tools&layer=standard`, { timeout: 60000 });
    await expect(page.locator('[data-stage-header="analyze"]')).toBeVisible({ timeout: 60000 });
    await expect(page.locator('[data-stage-back]')).toHaveText(/Back to project workspace\s·\s.*Business view, Standard fit/, { timeout: 30000 });
    await expect(page.locator('[data-stage-tools="open"] a[aria-current="page"]')).toHaveAttribute('data-workspace-tool', 'analyze');
  });

  test('an ordinary account gets the same tool header and bar — no stepper, no rail (3.0.1)', async ({ page }) => {
    test.setTimeout(180 * 1000);
    // No admin claim, no `isAdmin`: the account every community member has.
    const acct = await seedStageProject({ prefix: 'stageframe-plain', acceptTerms: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInThroughForm(page, acct);
    await page.goto(`/project/${acct.projectId}/documentation`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-stage-title]', { timeout: 60000 });
    await expect(page.locator('[data-stage-back]')).toHaveAttribute('href', `/project/${acct.projectId}`, { timeout: 30000 });
    // The eyebrow names the project once it is read; the way back does not wait for it.
    await expect(page.locator('[data-stage-tool]')).toContainText('Tool ·', { timeout: 60000 });
    const bar = page.locator('[data-stage-tools="open"]');
    await expect(bar).toBeVisible({ timeout: 30000 });
    await expect(bar.locator('a[data-workspace-tool]')).toHaveCount(7);
    await expect(bar.locator('a[data-workspace-tool="documentation"]')).toHaveAttribute('aria-current', 'page');
    // One way across, not two: the bar is the one navigation here.
    await expect(page.locator('nav[aria-label="Workflow phases"]')).toHaveCount(0);
    await expect(page.locator('[aria-label^="Workflow progress"], [data-rail-phase]')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText(/Proceed to |Continue to /);
    // And the footer leads back to the workspace, like the header.
    await expect(page.locator('[data-stage-footer] a')).toHaveAttribute('href', `/project/${acct.projectId}`);
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
        await expect(link.locator('[data-workspace-tool-mark="half"]'), `demo ${st}: ${step.key} started`).toHaveCount(want.kind === 'half' ? 1 : 0);
        await expect(link, `demo ${st}: ${step.key} claims proof`).not.toHaveAccessibleName(/prove|proof|verif/i);
      }
      // The way back, above the tools, as on a project's stage (owner 02.10.2026).
      const back = page.locator('[data-stage-back]');
      await expect(back, `demo ${st}: the way back`).toHaveCount(1);
      await expect(back).toHaveAttribute('href', '/demo/workspace');
      await expect(back).toHaveText(/Back to project workspace/);
      const [backTop, barTop] = await Promise.all([
        back.evaluate((el) => el.getBoundingClientRect().top),
        bar.evaluate((el) => el.getBoundingClientRect().top),
      ]);
      expect(backTop, `demo ${st}: the way back stands above the tools`).toBeLessThan(barTop);
    }
    await page.locator('[data-stage-tools="open"] a[data-workspace-tool="design"]').click();
    await page.waitForURL('**/demo/design', { timeout: 60000 });
    await expect(page.locator('[data-stage-tools="open"] a[aria-current="page"]')).toHaveAttribute('data-workspace-tool', 'design');

    // On a phone the link is there too, above the "Tools" menu.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/demo/tco', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-demo-ready="true"]')).toBeAttached({ timeout: 60000 });
    await expect(page.locator('[data-stage-back]')).toBeVisible();
    await expect(page.locator('[data-stage-back]')).toHaveAttribute('href', '/demo/workspace');

    // Signed out, the demo workspace asks for an account and returns there.
    await page.locator('[data-stage-back]').click();
    await page.waitForURL(/auth=signin&next=%2Fdemo%2Fworkspace/, { timeout: 60000 });
  });

  test('from the demo workspace into a demo stage and back, in the same view', async ({ page }) => {
    test.setTimeout(240 * 1000);
    const acct = await seedStageProject({ prefix: 'stageframe-demo', acceptTerms: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInThroughForm(page, acct);
    await page.goto('/demo/workspace?view=it', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-demo-workspace="it"][data-demo-ready="true"]')).toBeAttached({ timeout: 90000 });
    await page.locator('[data-demo-stages] a', { hasText: 'Economics' }).click();
    await page.waitForURL(/\/demo\/tco\?view=it&from=workspace-tools/, { timeout: 60000 });
    const back = page.locator('[data-stage-back]');
    await expect(back).toHaveCount(1, { timeout: 60000 });
    await expect(back).toHaveText(/Back to project workspace\s·\s.*IT view/);
    await back.click();
    await page.waitForURL(/\/demo\/workspace\?view=it/, { timeout: 60000 });
    await expect(page.locator('[data-demo-workspace="it"]')).toBeAttached({ timeout: 90000 });
  });
});

/**
 * One frame for every stage (owner 02.10.2026, translated: "when I switch from
 * analyze to design the whole screen has moved to the left, all screens have
 * to feel the same for each form factor"; ADR-063).
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
