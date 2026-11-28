import { test, expect, type Page } from './helpers/test';
import fs from 'fs';
import path from 'path';
import { seedStageProject, signInThroughForm } from './helpers/seed-project';
import { TOOL_LEADS } from '../lib/family-frame';
import { PHASES } from '../lib/workflow-steps';

/**
 * The head of a tool stays quiet (release 3.5.4, owner walk-through 26.11.2026: M1, Q2, Q4, Q5).
 *
 * The head had grown one line at a time — a legend at the end of the tool row, a "From the engine" chip on every
 * block, a lead on some tools and not on others — and nothing measured it. This spec does, on every tool at a desktop
 * and a phone width:
 *
 *   - **M1** at rest the head stays within a height bound; scrolled past the title, one slim line stands under the
 *     shell bar (`[data-stage-head-slim]`), one line high, with the program's name in it.
 *   - **Q4** the legend "done · started · out of date" is not in the page until it is asked for; the toggle at the
 *     end of the tool row opens it.
 *   - **Q5** one "From the engine" for the page, in the head; no other engine chip drawn unless it departs (imported
 *     from your system, or an engine proposal beside the reader's own figure in Economics), and no *Reconstructed* —
 *     the same statement in the older vocabulary — drawn in a block.
 *   - **Q2** every tool has its lead under the title (`[data-stage-lead]`), from the one table when a page names none.
 *
 * The bounds are measured, not wished (`REST_MAX`); a head that grows back past them fails here first.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');

const TOOLS = ['analyze?view=it', 'analyze?view=business', 'tco', 'design', 'transformation', 'documentation', 'testing', 'delivery'];
// Measured on 3.5.4 at rest: 189–210 px at 1440; 256–300 px at 390 on the one-page tools, 342–441 px on Analyze and
// Design, whose view switch takes a row of its own on a phone (Design's three stage actions wrap under the lead).
const REST_MAX: Record<number, number> = { 1440: 220, 390: 450 };
const SLIM_MAX = 48;

test.describe('the head of a tool, by its source', () => {
  test('one lead per tool, in one table, and the header falls back to it', () => {
    for (const phase of PHASES) {
      expect(TOOL_LEADS[phase.key], `${phase.key} has no lead`).toMatch(/\S.{20,}/);
    }
    const header = read('components/StageHeader.tsx');
    expect(header).toContain('TOOL_LEADS[');
    expect(header).toContain('data-stage-lead');
    expect(header).toContain('data-stage-head-slim');
  });

  test('the legend is on request in the tool row, never a standing row', () => {
    const bar = read('components/workspace/ToolBar.tsx').replace(/\/\*[\s\S]*?\*\//g, '');
    const strip = bar.slice(bar.indexOf('function FamilyToolStrip'), bar.indexOf('export default function WorkspaceToolBar'));
    expect(strip, 'FamilyToolStrip is not where it was').not.toBe('');
    expect(strip).toContain('hook="tools-legend"');
    expect(strip).not.toMatch(/<ToolsLegend\s*\/>/);
  });
});

async function measure(page: Page) {
  return page.evaluate(() => {
    const visible = (el: Element) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    const head = document.querySelector('[data-family-header]') as HTMLElement | null;
    const slim = document.querySelector('[data-stage-head-slim]') as HTMLElement | null;
    return {
      head: head ? head.getBoundingClientRect().height : -1,
      slimShown: slim?.getAttribute('data-shown') ?? null,
      slimVisible: slim ? visible(slim) : false,
      pageEngine: Array.from(document.querySelectorAll('[data-stage-page-provenance] [data-family-chip="engine"]')).filter(visible).length,
      keptNotImported: Array.from(document.querySelectorAll('[data-family-chip="engine"][data-chip-keep]'))
        .filter((el) => visible(el) && !el.closest('[data-stage-page-provenance]') && !el.closest('[data-effort-chip], [data-baseline-chip], [data-deferral-chip]'))
        .filter((el) => !/imported/.test(el.textContent ?? '')).length,
      engineOutsideHead: Array.from(document.querySelectorAll('[data-family-chip="engine"]:not([data-chip-keep])')).filter(visible).length,
      reconstructed: Array.from(document.querySelectorAll('[data-provenance="reconstructed"]')).filter(
        (el) => visible(el) && !el.closest('[data-cc-why-popover], [data-process-map-legend]'),
      ).length,
      legend: document.querySelectorAll('[data-tools-legend]').length,
      lead: (document.querySelector('[data-stage-header] [data-stage-lead]')?.textContent ?? '').trim(),
    };
  });
}

test.describe('the head of a tool, rendered', () => {
  test.describe.configure({ mode: 'serial' });

  for (const width of [1440, 390]) {
    test(`quiet at ${width}: bounded at rest, one line scrolled, legend on request, one engine chip, a lead`, async ({ page }) => {
      test.setTimeout(420 * 1000);
      const acct = await seedStageProject({ prefix: `headdensity${width}`, acceptTerms: true, rich: true });
      await page.setViewportSize({ width: 1440, height: 900 });
      await signInThroughForm(page, acct);
      await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
      const off: string[] = [];
      for (const tool of TOOLS) {
        await page.goto(`/project/${acct.projectId}/${tool}`, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('[data-stage-title]').first()).toBeVisible({ timeout: 90_000 });
        await expect(page.locator('[data-stage-header] [data-stage-page-provenance]')).toBeVisible({ timeout: 60_000 });
        await page.waitForTimeout(1500);

        const rest = await measure(page);
        if (rest.head > REST_MAX[width]) off.push(`${tool} @${width}: the head is ${Math.round(rest.head)} px at rest (bound ${REST_MAX[width]})`);
        if (rest.slimShown !== 'false' || rest.slimVisible) off.push(`${tool} @${width}: the slim line stands at rest`);
        if (rest.legend !== 0) off.push(`${tool} @${width}: the legend stands open unasked`);
        if (rest.engineOutsideHead !== 0) off.push(`${tool} @${width}: ${rest.engineOutsideHead} "From the engine" chip(s) outside the head`);
        // Exactly one says it for the page; any other drawn engine chip is a departure that keeps itself (imported).
        if (rest.pageEngine !== 1) off.push(`${tool} @${width}: ${rest.pageEngine} "From the engine" chips in the head`);
        if (rest.keptNotImported > 0) off.push(`${tool} @${width}: ${rest.keptNotImported} kept engine chip(s) outside the head that are not imported`);
        if (rest.reconstructed !== 0) off.push(`${tool} @${width}: ${rest.reconstructed} "Reconstructed" chip(s) shown`);
        if (rest.lead.length < 20) off.push(`${tool} @${width}: no lead under the title`);

        // Q4: the toggle opens the key.
        const toggle = page.locator('[data-stage-tools="open"] [data-info-popover="tools-legend"]');
        await expect(toggle, `${tool}: the legend toggle`).toBeVisible();
        await toggle.click();
        await expect(page.locator('[data-tools-legend="request"] [data-tools-legend-entry]')).toHaveCount(3);
        await page.keyboard.press('Escape');
        await expect(page.locator('[data-tools-legend]')).toHaveCount(0);

        // M1: scrolled past the title, one slim line.
        const title = (await page.locator('[data-stage-title]').first().textContent())?.trim() ?? '';
        await page.evaluate(() => window.scrollTo(0, 900));
        const slim = page.locator('[data-stage-head-slim]');
        // A page too short to carry its title under the shell bar has nothing to shrink — the slim line must then stay
        // away, and the rest of this check has no subject.
        const titleGone = await page.locator('[data-stage-title]').first().evaluate((el) => {
          const r = el.getBoundingClientRect();
          return (r.top + r.bottom) / 2 < 56;
        });
        if (!titleGone) {
          await expect(slim, `${tool} @${width}: a slim line while the title is in view`).toHaveAttribute('data-shown', 'false');
          await page.evaluate(() => window.scrollTo(0, 0));
          continue;
        }
        await expect(slim, `${tool} @${width}: no slim line scrolled`).toHaveAttribute('data-shown', 'true', { timeout: 10_000 });
        await expect(slim).toBeVisible();
        const box = await slim.boundingBox();
        if (!box || box.height > SLIM_MAX) off.push(`${tool} @${width}: the slim line is ${box?.height} px (bound ${SLIM_MAX})`);
        const lines = await slim.locator('[data-stage-head-slim-title]').evaluate((el) => {
          const lh = parseFloat(getComputedStyle(el).lineHeight) || 20;
          return Math.round(el.getBoundingClientRect().height / lh);
        });
        if (lines > 1) off.push(`${tool} @${width}: the slim title runs to ${lines} lines`);
        await expect(slim.locator('[data-stage-head-slim-title]')).toHaveText(title);
        // It stands under the shell bar, inside the window.
        if (box && (box.y < 50 || box.y > 70)) off.push(`${tool} @${width}: the slim line stands at y=${Math.round(box.y)}`);
        // Back at the top, it goes.
        await page.evaluate(() => window.scrollTo(0, 0));
        await expect(slim).toHaveAttribute('data-shown', 'false', { timeout: 10_000 });
      }
      expect(off, off.join('\n')).toEqual([]);
    });
  }
});
