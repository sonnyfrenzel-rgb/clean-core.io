import { test, expect } from '@playwright/test';

/**
 * A page's Twitter card says what the page says.
 *
 * Twenty-two pages set `openGraph` and exactly one set `twitter`, so every other
 * page fell back to the root layout's domain-level card. Sharing the Clean Core
 * guide showed the homepage headline and the homepage summary — the two places
 * where a specific page had a specific audience, and it introduced itself as the
 * site in general.
 *
 * This is a rendered check on purpose. `withTwitterCard` is a convenience, not a
 * guarantee: any page can hand-write a `twitter` block and drift on its own. What
 * matters is the tag that reaches the reader.
 */
const PAGES = [
  '/',
  '/knowledge',
  '/clean-core-explained',
  '/how-it-works',
  '/reference-analysis',
  '/whitepaper',
  '/catalog',
  '/sap-cloudification',
  '/trust',
];

test.describe('every page carries its own social card', () => {
  /**
   * Sixty seconds and one retry, and neither is about the assertion.
   *
   * Locally these navigations hit routes `npm run dev` has not compiled yet. At
   * the tail of a full run, roughly forty compiled routes deep, Next's own memory
   * watchdog fires — "Server is approaching the used memory threshold,
   * restarting..." — and it landed on /whitepaper, the largest compile on the
   * site at ~9,900 modules, in three consecutive runs. The page compiled in 2.8s
   * every time; the server then restarted underneath the in-flight navigation and
   * `page.goto` waited for a response nobody was going to send.
   *
   * CI serves a production build (`npm start`): nothing compiles, nothing
   * accumulates, the watchdog never fires. So this is local-only, and the retry
   * is what a person would do — it cannot mask a wrong meta tag, which fails
   * again immediately.
   */
  test.describe.configure({ timeout: 60_000, retries: 1 });

  for (const route of PAGES) {
    test(`og and twitter agree on ${route}`, async ({ page }) => {
      // `domcontentloaded`, not the default `load`: the tags being checked are in
      // the head and are there the moment the document parses. Waiting for every
      // subresource only buys a timeout on a route the dev server is compiling
      // for the first time.
      await page.goto(route, { waitUntil: 'domcontentloaded' });

      const meta = await page.evaluate(() => {
        const get = (sel: string) =>
          document.querySelector(sel)?.getAttribute('content')?.trim() ?? null;
        return {
          ogTitle: get('meta[property="og:title"]'),
          ogDescription: get('meta[property="og:description"]'),
          twTitle: get('meta[name="twitter:title"]'),
          twDescription: get('meta[name="twitter:description"]'),
        };
      });

      expect(meta.ogTitle, `${route} has no og:title`).toBeTruthy();
      expect(
        meta.twTitle,
        `${route} has no twitter:title — it is inheriting the layout's generic card`,
      ).toBeTruthy();
      expect(
        meta.twTitle,
        `${route} disagrees with itself:\n  og:title      ${meta.ogTitle}\n  twitter:title ${meta.twTitle}`,
      ).toBe(meta.ogTitle);
      expect(
        meta.twDescription,
        `${route} disagrees with itself:\n  og:description      ${meta.ogDescription}\n  twitter:description ${meta.twDescription}`,
      ).toBe(meta.ogDescription);
    });
  }
});
