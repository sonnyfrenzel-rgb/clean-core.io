/**
 * Playwright script to capture clean landing-page screenshots
 * without any browser focus outlines or blue borders.
 *
 * Usage:  npx playwright test scripts/capture-screenshots.ts
 *   (or)  npx tsx scripts/capture-screenshots.ts
 */
import { chromium } from 'playwright';
import path from 'path';

const BASE = 'http://localhost:3000';
const OUT  = path.join(__dirname, '..', 'public', 'screenshots');

const PAGES = [
  { file: 'step-1.jpg', route: '/project/ACsZ7Vgf1N7bXuupDFIc/analyze' },
  { file: 'step-2.jpg', route: '/project/ACsZ7Vgf1N7bXuupDFIc/design' },
  { file: 'step-3.jpg', route: '/project/ACsZ7Vgf1N7bXuupDFIc/transformation' },
  { file: 'step-4.jpg', route: '/project/ACsZ7Vgf1N7bXuupDFIc/testing' },
  { file: 'step-5.jpg', route: '/project/ACsZ7Vgf1N7bXuupDFIc/documentation' },
  { file: 'step-6.jpg', route: '/project/ACsZ7Vgf1N7bXuupDFIc/delivery' },
];

/** CSS injected into every page to nuke every possible focus ring */
const NUKE_FOCUS_CSS = `
  *, *::before, *::after,
  *:focus, *:focus-visible, *:focus-within, *:active {
    outline: none !important;
    outline-width: 0 !important;
    outline-style: none !important;
    outline-offset: 0 !important;
    -webkit-focus-ring-color: transparent !important;
    -webkit-tap-highlight-color: transparent !important;
  }
`;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });

  // Inject the anti-focus CSS into every page automatically
  await context.addInitScript(() => {
    const css = `
      *, *::before, *::after,
      *:focus, *:focus-visible, *:focus-within, *:active {
        outline: none !important;
        outline-width: 0 !important;
        outline-style: none !important;
        outline-offset: 0 !important;
        -webkit-focus-ring-color: transparent !important;
        -webkit-tap-highlight-color: transparent !important;
      }
    `;
    const style = document.createElement('style');
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  });

  for (const { file, route } of PAGES) {
    const page = await context.newPage();

    // Navigate and wait for DOM load (networkidle times out on SSE pages)
    await page.goto(`${BASE}${route}`, { waitUntil: 'load', timeout: 60000 });

    // Wait for content to render
    await page.waitForTimeout(3000);

    // Extra safety: inject CSS again + blur active element
    await page.addStyleTag({ content: NUKE_FOCUS_CSS });
    await page.evaluate(() => {
      (document.activeElement as HTMLElement)?.blur();
      document.body.click();
    });

    // Let animations settle
    await page.waitForTimeout(1000);

    // Screenshot – viewport only, no full page
    const dest = path.join(OUT, file);
    await page.screenshot({ path: dest, fullPage: false, type: 'png' });
    console.log(`✅ ${file} → ${dest}`);

    await page.close();
  }

  await browser.close();
  console.log('\nDone – all 6 screenshots captured without focus outlines.');
})();
