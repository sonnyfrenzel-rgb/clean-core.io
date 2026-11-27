import { test } from './helpers/test';
import fs from 'fs';
import path from 'path';
import { seedStageProject, signInThroughForm } from './helpers/seed-project';
import { pageSettled } from './helpers/design-rendered';

/**
 * Not a test — the before/after pictures of release 3.5.4 "The head of a tool, quieter" for the owner.
 * Skipped unless HEAD_CAPTURE_OUT names the folder:
 *   HEAD_CAPTURE_OUT=<dir> npx playwright test tests/head-354-capture.spec.ts
 * A picture already in the folder is not taken again, so a run that stops can be resumed.
 */
const OUT = process.env.HEAD_CAPTURE_OUT ?? '';
const WIDTHS = [390, 768, 1024, 1440];
const TOOLS: { name: string; path: string }[] = [
  { name: 'analyze-it', path: 'analyze?view=it' },
  { name: 'analyze-business', path: 'analyze?view=business' },
  { name: 'tco', path: 'tco' },
  { name: 'design', path: 'design' },
  { name: 'transformation', path: 'transformation' },
  { name: 'documentation', path: 'documentation' },
  { name: 'testing', path: 'testing' },
  { name: 'delivery', path: 'delivery' },
];

test.describe('head 3.5.4 capture', () => {
  test.skip(!OUT, 'set HEAD_CAPTURE_OUT to run');
  test.describe.configure({ mode: 'serial' });
  let acct: Awaited<ReturnType<typeof seedStageProject>> | null = null;

  for (const tool of TOOLS) {
    test(tool.name, async ({ page }) => {
      test.setTimeout(900 * 1000);
      fs.mkdirSync(OUT, { recursive: true });
      const todo = WIDTHS.filter((w) => !fs.existsSync(path.join(OUT, `${tool.name}-${w}-scrolled.png`)));
      if (!todo.length) return;
      acct ??= await seedStageProject({ prefix: 'head354', acceptTerms: true, rich: true });
      await page.setViewportSize({ width: 1440, height: 900 });
      await signInThroughForm(page, acct);
      for (const width of todo) {
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
            await page.goto(`/project/${acct.projectId}/${tool.path}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
            await page.waitForSelector('[data-stage-title]', { timeout: 120000 });
            await page.waitForFunction(pageSettled, 800, { timeout: 30000 }).catch(() => undefined);
            await page.waitForTimeout(500);
            await page.screenshot({ path: path.join(OUT, `${tool.name}-${width}-rest.png`) });
            await page.mouse.move(width / 2, 400);
            await page.mouse.wheel(0, 700);
            await page.waitForTimeout(900);
            await page.screenshot({ path: path.join(OUT, `${tool.name}-${width}-scrolled.png`) });
            const head = await page.evaluate(() => {
              const visible = (el: Element) => (el as HTMLElement).getBoundingClientRect().height > 0 && getComputedStyle(el).display !== 'none';
              const h = document.querySelector('[data-family-header]') as HTMLElement | null;
              const slim = document.querySelector('[data-stage-head-slim]') as HTMLElement | null;
              return {
                head: h ? Math.round(h.getBoundingClientRect().height) : -1,
                slim: slim ? `${slim.getAttribute('data-shown')}:${Math.round(slim.getBoundingClientRect().height)}` : 'none',
                engineVisible: Array.from(document.querySelectorAll('[data-family-chip="engine"]')).filter(visible).length,
                scrollY: Math.round(window.scrollY),
              };
            });
            fs.appendFileSync(path.join(OUT, 'index.txt'), `${tool.name}-${width}: ${JSON.stringify(head)}\n`);
            break;
          } catch (err) {
            fs.appendFileSync(path.join(OUT, 'index.txt'), `${tool.name}-${width}: FAILED ${String(err instanceof Error ? err.message : err).slice(0, 160)}\n`);
          }
        }
      }
    });
  }
});
