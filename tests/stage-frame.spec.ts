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
import { LAYERS, workspaceLayers } from '../lib/workspace-model';

/**
 * The seven stages are tools of the workspace (ADR-008, ADR-050, mockup s8).
 *
 * In the workspace a stage opens under a tool header — "Back to workspace ·
 * Business, Need & process", the eyebrow "Tool · <project>", the title — and
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
    expect(workspaceBackHref({ projectId: 'p-1', search })).toBe('/project/p-1?view=business#need');
    expect(stageBackPlace(search)).toBe('Business, Need & process');
    expect(stageBackPlace('?view=it')).toBe('IT');
    expect(stageBackPlace('')).toBeNull();
    // Nothing the workspace does not know is carried or said.
    expect(layerParam('L231')).toBeNull();
    expect(stageHref({ base: '/project/p-1', path: 'tco', view: 'it', layer: '<script>' })).toBe('/project/p-1/tco?view=it');
    expect(stageBackPlace('?view=admin&layer=%3Cscript%3E')).toBeNull();
  });

  test('a demo stage leads back to the demo workspace by the same rule (owner 02.10.2026)', () => {
    const href = stageHref({ base: '/demo', path: 'tco', view: 'it', from: WORKSPACE_RETURN.tools, layer: 'costs' });
    expect(href).toBe('/demo/tco?view=it&from=workspace-tools&layer=costs');
    expect(demoWorkspaceBackHref(href.slice(href.indexOf('?')))).toBe('/demo/workspace?view=it#costs');
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
        els.map((el) => `${el.getAttribute('data-workspace-tool')}:${el.getAttribute('data-phase-state')}:${el.getAttribute('data-phase-tone')}`),
      );
      marks ??= reading;
      expect(reading, `${st}: the bar reads the project differently here`).toEqual(marks);
    }

    // And a link to another tool goes there, with the way back intact.
    await page.locator('[data-stage-tools="open"] a[data-workspace-tool="analyze"]').click();
    await page.waitForURL(`**/project/${acct.projectId}/analyze?view=business&from=workspace-tools&layer=need`, { timeout: 60000 });
    await expect(page.locator('[data-stage-header="analyze"]')).toBeVisible({ timeout: 60000 });
    await expect(page.locator('[data-stage-back]')).toHaveText(/Back to workspace · Business, Need & process/, { timeout: 30000 });
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
    await expect(page.locator('[data-stage-tool]')).toContainText('Tool ·');
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
      // The way back, above the tools, as on a project's stage (owner 02.10.2026).
      const back = page.locator('[data-stage-back]');
      await expect(back, `demo ${st}: the way back`).toHaveCount(1);
      await expect(back).toHaveAttribute('href', '/demo/workspace');
      await expect(back).toHaveText(/Back to workspace/);
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
    await expect(back).toHaveText(/Back to workspace · IT/);
    await back.click();
    await page.waitForURL(/\/demo\/workspace\?view=it/, { timeout: 60000 });
    await expect(page.locator('[data-demo-workspace="it"]')).toBeAttached({ timeout: 90000 });
  });
});
