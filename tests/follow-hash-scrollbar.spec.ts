import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { build } from 'esbuild';

/**
 * QA review of 7fecaa0102eb (d29f4fcf9481): `useFollowHash` holds a deep-linked
 * place in view while the blocks above it are still growing, and a wheel, a
 * touch or a key by the reader ends it. Dragging the scrollbar sends none of
 * those, so the follow pulled the reader back to the place they had just
 * scrolled away from. Now a page that moved while the place did not is the
 * reader's scroll, by whatever means, and ends the follow.
 *
 * Server-free: the real hook is bundled with esbuild into a page Playwright
 * serves from a route, with a block above the place that keeps growing. The
 * "drag" is `window.scrollTo` over a few frames — a scroll with no wheel, no
 * touch and no key, which is what the scrollbar produces.
 */

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(ROOT, 'tmp', 'follow-hash-scrollbar');
let bundle = '';

test.beforeAll(async () => {
  test.setTimeout(120_000);
  fs.mkdirSync(OUT, { recursive: true });
  const entry = path.join(OUT, 'entry.tsx');
  fs.writeFileSync(
    entry,
    `import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useFollowHash } from '@/hooks/useFollowHash';
function App() {
  useFollowHash();
  const [grow, setGrow] = useState(0);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShown(true), 100);
    // ?frame: the block grows on every frame, so no frame of a drag is free of a move of the place.
    if (location.search.includes('frame')) {
      let raf = 0;
      const step = () => { setGrow((g) => g + 4); raf = requestAnimationFrame(step); };
      raf = requestAnimationFrame(step);
      return () => { clearTimeout(t); cancelAnimationFrame(raf); };
    }
    const i = setInterval(() => setGrow((g) => g + 40), 60);
    return () => { clearTimeout(t); clearInterval(i); };
  }, []);
  return (
    <div>
      <div style={{ height: 1500 + grow }} />
      {shown ? <div id="place" style={{ height: 50 }}>place</div> : null}
      <div style={{ height: 6000 }} />
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
`,
  );
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    alias: { '@': ROOT },
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'silent',
  });
  bundle = result.outputFiles[0].text;
});

const servePage = (page: Page, bodyStyle = 'margin:0') =>
  page.route('http://follow.test/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html><body style="${bodyStyle}"><div id="root"></div><script>${bundle.replace(/<\/script/g, '<\\/script')}</script></body></html>`,
    }),
  );

test('a scroll by the scrollbar ends the follow of a deep-linked place', async ({ page }) => {
  await servePage(page);
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.goto('http://follow.test/#place');
  // The follow has brought the place into view.
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(1000);
  // And holds it there while the block above grows: the growth is no scroll by the reader.
  await page.waitForTimeout(500);
  const held = await page.evaluate(() => [window.scrollY, Math.round(document.getElementById('place')!.getBoundingClientRect().top)]);
  expect(held[0]).toBeGreaterThan(1500);
  expect(Math.abs(held[1])).toBeLessThanOrEqual(40);

  // The reader drags the scrollbar to the top, over a few frames.
  await page.evaluate(async () => {
    for (let i = 0; i < 10; i++) {
      window.scrollTo(0, 0);
      await new Promise((r) => requestAnimationFrame(r));
    }
  });
  // The block above keeps growing; the page stays where the reader put it.
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

// QA review of d939fb5b056b (2c33889165f6): the place is still moving in every
// frame of the drag. Without scroll anchoring the follow is still re-scrolling
// when the reader starts, so the drag happens while the follow is active.
test('a scroll by the scrollbar ends the follow while the place is still moving', async ({ page }) => {
  await servePage(page, 'margin:0;overflow-anchor:none');
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.goto('http://follow.test/?frame#place');
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(1000);
  // Still following: the place keeps moving down and the page keeps up with it.
  const before = await page.evaluate(() => window.scrollY);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before + 20);

  await page.evaluate(async () => {
    for (let i = 0; i < 10; i++) {
      window.scrollTo(0, 0);
      await new Promise((r) => requestAnimationFrame(r));
    }
  });
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => window.scrollY), 'the follow pulled the reader back').toBe(0);
});
