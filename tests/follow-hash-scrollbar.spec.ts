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
 *
 * Since every choice has one address (owner 11.10.2026, package A) the hook
 * also re-follows a client navigation to a new query, sends `cc:reveal` before
 * it waits, and gives the focus to the place an origin-carrying link named.
 * `next/navigation` is replaced by a stub whose `useSearchParams` reads the
 * address and changes on a `stub-nav` event — what Next's router does on a
 * `Link` to the same page with another query.
 */

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(ROOT, 'tmp', 'follow-hash-scrollbar');
let bundle = '';
let choiceBundle = '';
let shiftBundle = '';

const STUB = `import { useSyncExternalStore } from 'react';
const subscribe = (cb: () => void) => {
  window.addEventListener('stub-nav', cb);
  window.addEventListener('popstate', cb);
  return () => { window.removeEventListener('stub-nav', cb); window.removeEventListener('popstate', cb); };
};
export function useSearchParams() {
  return new URLSearchParams(useSyncExternalStore(subscribe, () => window.location.search, () => ''));
}
`;

/** A page with a place that appears late, a place inside a fold only `useRevealOnHash` opens, and a control in each. */
const CHOICE_ENTRY = `import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useFollowHash } from '@/hooks/useFollowHash';
import { useRevealOnHash } from '@/hooks/useRevealOnHash';
function Fold() {
  const [open, setOpen] = useState(false);
  useRevealOnHash((id) => id === 'folded', () => setOpen(true));
  return <div data-fold={open ? 'open' : 'closed'}>{open ? <section id="folded" style={{ height: 80 }}><button data-choice-focus="">Confirm</button></section> : null}</div>;
}
function App() {
  useFollowHash();
  const [shown, setShown] = useState(false);
  useEffect(() => { const t = setTimeout(() => setShown(true), 100); return () => clearTimeout(t); }, []);
  return (
    <div>
      <div style={{ height: 1500 }} />
      {shown ? <section id="place" style={{ height: 80 }}><p>place</p><button data-choice-focus="">Sign off</button></section> : null}
      <div style={{ height: 1500 }} />
      <section id="plain" style={{ height: 80 }}>plain</section>
      <div style={{ height: 1500 }} />
      <Fold />
      <div style={{ height: 6000 }} />
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
`;

/**
 * Roadmap row "a same-page choice link settles short of its place" (found by
 * `tests/choice-walk.spec.ts`, 11.10.2026). `?inside`: once the place is in
 * view, a block inside it grows above the node the browser anchors to, so the
 * browser scrolls the page by itself and the place, not moved in the document,
 * ends up above the viewport. `?bottom`: the place stands near the end of a page
 * that is still growing under it, so the first bring-into-view stops at the
 * bottom of the page and the place short of the top edge.
 */
const SHIFT_ENTRY = `import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useFollowHash } from '@/hooks/useFollowHash';
function App() {
  useFollowHash();
  const [inner, setInner] = useState(0);
  const [below, setBelow] = useState(location.search.includes('bottom') ? 200 : 6000);
  useEffect(() => {
    const t1 = setTimeout(() => (location.search.includes('bottom') ? setBelow(3000) : setInner(26)), 300);
    const t2 = setTimeout(() => (location.search.includes('bottom') ? setBelow(6000) : setInner(52)), 600);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);
  return (
    <div>
      <div style={{ height: 1500 }} />
      <section id="place">
        <div style={{ height: inner, overflowAnchor: 'none' }} />
        {/* Taller than the viewport for ?inside, so the browser anchors to a node inside the place. */}
        <p style={{ margin: 0, height: location.search.includes('bottom') ? 200 : 2000 }}>the card</p>
      </section>
      <div style={{ height: below }} />
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
`;

/** A client navigation the way Next's router makes one: a new history entry, no load, no `hashchange`. */
const navigate = (page: Page, url: string) =>
  page.evaluate((u) => {
    window.history.pushState(null, '', u);
    window.dispatchEvent(new Event('stub-nav'));
  }, url);

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
  const stub = path.join(OUT, 'navigation-stub.ts');
  fs.writeFileSync(stub, STUB);
  const choiceEntry = path.join(OUT, 'choice-entry.tsx');
  fs.writeFileSync(choiceEntry, CHOICE_ENTRY);
  const shiftEntry = path.join(OUT, 'shift-entry.tsx');
  fs.writeFileSync(shiftEntry, SHIFT_ENTRY);
  const bundleOf = async (file: string) =>
    (
      await build({
        entryPoints: [file],
        bundle: true,
        write: false,
        format: 'iife',
        platform: 'browser',
        jsx: 'automatic',
        alias: { '@': ROOT, 'next/navigation': stub },
        define: { 'process.env.NODE_ENV': '"production"' },
        logLevel: 'silent',
      })
    ).outputFiles[0].text;
  bundle = await bundleOf(entry);
  choiceBundle = await bundleOf(choiceEntry);
  shiftBundle = await bundleOf(shiftEntry);
});

const servePage = (page: Page, bodyStyle = 'margin:0', code = () => bundle) =>
  page.route('http://follow.test/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html><body style="${bodyStyle}"><div id="root"></div><script>${code().replace(/<\/script/g, '<\\/script')}</script></body></html>`,
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

test.describe("a choice's address: re-follow, reveal, focus (package A)", () => {
  const serveChoice = (page: Page) => servePage(page, 'margin:0', () => choiceBundle);
  const topOf = (page: Page, id: string) =>
    page.evaluate((i) => { const el = document.getElementById(i); return el ? Math.round(el.getBoundingClientRect().top) : null; }, id);
  const activeIn = (page: Page, id: string) =>
    page.evaluate((i) => Boolean(document.getElementById(i)?.contains(document.activeElement)), id);

  test("a client navigation to a new query and place is followed, and the place's control takes the focus", async ({ page }) => {
    await serveChoice(page);
    await page.setViewportSize({ width: 1000, height: 700 });
    await page.goto('http://follow.test/?view=it');
    await page.waitForSelector('#place');
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    await navigate(page, '/?view=management&origin=it.next-step#place');
    await expect.poll(() => topOf(page, 'place')).toBe(0);
    // Settled: the control marked for the arrival has the focus, the place is
    // marked, and taking the focus scrolled nothing.
    await expect.poll(() => page.evaluate(() => document.activeElement?.textContent)).toBe('Sign off');
    await expect(page.locator('#place')).toHaveAttribute('data-arrived', '');
    expect(await topOf(page, 'place')).toBe(0);
  });

  test('a place inside a closed fold is revealed before the follow waits for it', async ({ page }) => {
    await serveChoice(page);
    await page.setViewportSize({ width: 1000, height: 700 });
    await page.goto('http://follow.test/?view=it');
    await page.waitForSelector('#place');
    await expect(page.locator('[data-fold]')).toHaveAttribute('data-fold', 'closed');

    await navigate(page, '/?view=it&origin=management.options#folded');
    await expect(page.locator('[data-fold]')).toHaveAttribute('data-fold', 'open');
    await expect.poll(() => topOf(page, 'folded')).toBe(0);
    await expect.poll(() => activeIn(page, 'folded')).toBe(true);
  });

  test('the fold opens for an address the page is loaded with, too', async ({ page }) => {
    await serveChoice(page);
    await page.setViewportSize({ width: 1000, height: 700 });
    await page.goto('http://follow.test/?origin=management.options#folded');
    await expect(page.locator('[data-fold]')).toHaveAttribute('data-fold', 'open');
    await expect.poll(() => topOf(page, 'folded')).toBe(0);
  });

  test('without an origin the place is followed but the focus stays where it was', async ({ page }) => {
    await serveChoice(page);
    await page.setViewportSize({ width: 1000, height: 700 });
    await page.goto('http://follow.test/#place');
    await expect.poll(() => topOf(page, 'place')).toBe(0);
    await page.waitForTimeout(1200);
    expect(await activeIn(page, 'place')).toBe(false);
    expect(await page.locator('#place').getAttribute('data-arrived')).toBeNull();
    // An origin that is not on the list is no origin.
    await navigate(page, '/?origin=//evil#plain');
    await expect.poll(() => topOf(page, 'plain')).toBe(0);
    await page.waitForTimeout(1200);
    expect(await activeIn(page, 'plain')).toBe(false);
  });

  test('a view switch that keeps its subject fragment is not followed again', async ({ page }) => {
    await serveChoice(page);
    await page.setViewportSize({ width: 1000, height: 700 });
    await page.goto('http://follow.test/?view=it#place');
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(1000);
    await page.waitForTimeout(800);
    // The switch opens the new view at its top (setView), keeping the subject.
    await page.evaluate(() => window.scrollTo(0, 0));
    await navigate(page, '/?view=business#place');
    await page.waitForTimeout(1000);
    expect(await page.evaluate(() => window.scrollY), 'the view switch was followed back down').toBe(0);
  });

  test("a reader's scroll still ends a re-follow, and then no focus is taken", async ({ page }) => {
    await serveChoice(page);
    await page.setViewportSize({ width: 1000, height: 700 });
    await page.goto('http://follow.test/?view=it');
    await page.waitForSelector('#place');
    await navigate(page, '/?view=it&origin=it.next-step#plain');
    // In view, still inside the half second the follow waits before it settles.
    await expect.poll(() => page.evaluate(() => window.scrollY), { intervals: [20] }).toBeGreaterThan(2000);
    await page.evaluate(() => window.dispatchEvent(new WheelEvent('wheel')));
    await page.waitForTimeout(1500);
    expect(await activeIn(page, 'plain')).toBe(false);
  });
});

test.describe('a page that moves by itself is not the reader (settles short, roadmap after 3.0.10)', () => {
  const settledTop = async (page: Page) => {
    // Settled: the follow ends half a second after the last move, at most five seconds in.
    await page.waitForTimeout(2500);
    return page.evaluate(() => Math.round(document.getElementById('place')!.getBoundingClientRect().top));
  };

  test('growth inside the place that the browser anchors away is followed, not read as a scroll', async ({ page }) => {
    await servePage(page, 'margin:0', () => shiftBundle);
    await page.setViewportSize({ width: 1000, height: 700 });
    await page.goto('http://follow.test/?inside#place');
    expect(Math.abs(await settledTop(page)), 'the place settled off its top edge').toBeLessThanOrEqual(1);
  });

  test('a place that first stops at the bottom of a growing page is brought to its top edge', async ({ page }) => {
    await servePage(page, 'margin:0', () => shiftBundle);
    await page.setViewportSize({ width: 1000, height: 700 });
    await page.goto('http://follow.test/?bottom#place');
    expect(Math.abs(await settledTop(page)), 'the place settled short of its top edge').toBeLessThanOrEqual(1);
  });

  test('and a scrollbar drag during such growth still ends the follow', async ({ page }) => {
    await servePage(page, 'margin:0', () => shiftBundle);
    await page.setViewportSize({ width: 1000, height: 700 });
    await page.goto('http://follow.test/?inside#place');
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(1000);
    await page.evaluate(async () => {
      for (let i = 0; i < 10; i++) {
        window.scrollTo(0, 0);
        await new Promise((r) => requestAnimationFrame(r));
      }
    });
    await page.waitForTimeout(1500);
    expect(await page.evaluate(() => window.scrollY), 'the follow pulled the reader back').toBe(0);
  });
});
