import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * The landing page has one style, and this is what keeps it that way.
 *
 * It had three eyebrow variants, four heading scales, an emoji on one section,
 * an `h3` where an `h2` belonged, and one section — the seven steps — with no
 * header at all. None of that was decided; it accumulated, because every section
 * carried its own copy of the classes and nothing compared them.
 *
 * Two kinds of check here, and the second is the one that matters:
 *
 *   - A source check that section headers come from `SectionHeader` and nowhere
 *     else, so there is one place to change and one place to read.
 *   - A rendered check that every section heading on the live page resolves to
 *     the same computed font, weight, spacing and colour. Source guards can be
 *     satisfied by a component that quietly takes a `className` override;
 *     computed style cannot.
 *
 * Plus the one that would have caught the defect underneath all of it: a colour
 * class naming a shade that does not exist emits no CSS at all, and the element
 * silently inherits. There were 131 of those.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');

test.describe('one section header, defined once', () => {
  test('the landing page writes no heading of its own', () => {
    const src = read('app/page.tsx');
    // An `h2` in this file is a section heading that escaped the component.
    expect(src, 'app/page.tsx hand-writes an <h2>').not.toMatch(/<h2\b/);
    expect(src).toContain('SectionHeader');
  });

  test('nothing outside the component carries the heading classes', () => {
    const src = read('app/page.tsx');
    // The scale lives in SectionHeader. Finding it here means a copy was made.
    expect(src).not.toContain('md:text-6xl font-black');
  });

  test('the eyebrow pill is defined once', () => {
    const src = read('app/page.tsx');
    const pills = (src.match(/rounded-full text-\[10px\] font-black uppercase/g) || []).length;
    expect(pills, 'eyebrow pill classes copied into app/page.tsx').toBe(0);
    expect(read('components/SectionHeader.tsx')).toMatch(/rounded-full text-\[10px\] font-black uppercase/);
  });
});

test.describe('every section heading renders identically', () => {
  test('same font, weight, spacing and colour across the page', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const headings = await page.locator('[data-section-heading]').evaluateAll((els) =>
      els.map((el) => {
        const s = getComputedStyle(el);
        return {
          text: (el.textContent || '').trim().slice(0, 40),
          // Colour is compared per tone, so it travels separately.
          key: [s.fontFamily, s.fontWeight, s.letterSpacing, s.textTransform].join(' | '),
          color: s.color,
          size: s.fontSize,
        };
      }),
    );

    expect(headings.length, 'no section headings found').toBeGreaterThan(4);

    const keys = [...new Set(headings.map((h) => h.key))];
    expect(
      keys,
      `headings disagree on font/weight/spacing:\n${headings.map((h) => `${h.text} → ${h.key}`).join('\n')}`,
    ).toHaveLength(1);

    const sizes = [...new Set(headings.map((h) => h.size))];
    expect(
      sizes,
      `headings disagree on size:\n${headings.map((h) => `${h.text} → ${h.size}`).join('\n')}`,
    ).toHaveLength(1);

    // Two tones and no more: the page's ink, and white on the dark footer.
    const colors = [...new Set(headings.map((h) => h.color))];
    expect(
      colors.length,
      `headings use ${colors.length} colours: ${colors.join(', ')}`,
    ).toBeLessThanOrEqual(2);
  });

  test('and the eyebrows do too', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const eyebrows = await page.locator('[data-section-eyebrow]').evaluateAll((els) =>
      els
        .map((el) => {
          const s = getComputedStyle(el);
          return [s.fontSize, s.fontWeight, s.letterSpacing, s.textTransform, s.borderRadius].join(' | ');
        }),
    );

    expect(eyebrows.length, 'no eyebrows found').toBeGreaterThan(3);
    expect([...new Set(eyebrows)], `eyebrows disagree:\n${eyebrows.join('\n')}`).toHaveLength(1);
  });
});

test.describe('no colour class that emits nothing', () => {
  test('every shade used is a default or defined in the theme', () => {
    // Tailwind's default shades. Anything else has to be declared in @theme, or
    // the utility is never generated and the element inherits its colour — which
    // is what `text-gray-955`, `bg-gray-150`, `border-green-150`,
    // `text-slate-650` and four more were doing in 131 places, invisibly.
    const DEFAULT_SHADES = new Set([
      '50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950',
    ]);

    const css = read('app/globals.css');
    const declared = new Set(
      [...css.matchAll(/--color-([a-z]+)-(\d+)\s*:/g)].map((m) => `${m[1]}-${m[2]}`),
    );

    const PALETTES =
      'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
    const UTILITIES =
      'text|bg|border|ring|divide|outline|decoration|accent|caret|fill|stroke|shadow|from|via|to|placeholder';
    const pattern = new RegExp(`\\b(?:${UTILITIES})-(${PALETTES})-(\\d{2,3})\\b`, 'g');

    const offenders = new Set<string>();
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
          walk(full);
          continue;
        }
        if (!/\.(tsx|ts)$/.test(entry.name)) continue;
        const src = fs.readFileSync(full, 'utf8');
        for (const m of src.matchAll(pattern)) {
          const shade = `${m[1]}-${m[2]}`;
          if (!DEFAULT_SHADES.has(m[2]) && !declared.has(shade)) {
            offenders.add(`${shade} (${path.relative(ROOT, full)})`);
          }
        }
      }
    };
    walk(path.join(ROOT, 'app'));
    walk(path.join(ROOT, 'components'));

    expect(
      [...offenders].sort(),
      'these colour classes generate no CSS — declare them in @theme or use a default shade',
    ).toEqual([]);
  });
});


/**
 * How wide the document is beyond the viewport, and what is doing it.
 *
 * A failure that says only "the page is 21px too wide" costs an afternoon; one
 * that names the element does not. Elements inside a scroller are skipped —
 * a snap rail is 700px wide by design and its parent clips it, so listing it
 * names five innocent elements and buries the guilty one.
 */
async function measureOverflow(page: Page, viewportWidth: number) {
  return page.evaluate((vw) => {
    const doc = document.documentElement;
    const overflow = doc.scrollWidth - doc.clientWidth;
    if (overflow <= 1) return { overflow, culprits: [] as string[] };

    const isContained = (el: Element) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        if (getComputedStyle(p).overflowX !== 'visible') return true;
      }
      return false;
    };

    const culprits = Array.from(document.querySelectorAll('body *'))
      .map((el) => ({ el, rect: el.getBoundingClientRect() }))
      .filter(({ el, rect }) => rect.width > 0 && rect.right > vw + 1 && !isContained(el))
      .sort((a, b) => b.rect.right - a.rect.right)
      .slice(0, 5)
      .map(({ el, rect }) => {
        const cls = (el.getAttribute('class') || '').split(/\s+/).slice(0, 4).join(' ');
        const text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
        return `<${el.tagName.toLowerCase()} class="${cls}"> right ${Math.round(rect.right)}px, width ${Math.round(rect.width)}px — "${text}"`;
      });

    return { overflow, culprits };
  }, viewportWidth);
}

test.describe('the page does not scroll sideways', () => {
  /**
   * What this exists for: a 340px label carrying `whitespace-nowrap`, sitting
   * between two `flex-1` rules. It could not shrink, so on a narrow viewport it
   * pushed the document wider than the window and the whole page slid sideways.
   *
   * It survived because it fit — on the machine it was looked at on. A 1440px
   * screenshot says nothing about 320px, and the one width nobody opens is the
   * width every phone uses.
   */
  for (const width of [320, 390, 768]) {
    test(`no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');

      // Measured twice: once while the header still shows its auth skeleton, and
      // once after the real button has replaced it. They are different widths,
      // and a page that slides sideways for half a second before settling is
      // still a page that slid sideways.
      const loading = await measureOverflow(page, width);
      await page
        .locator('header')
        .getByRole('link', { name: /Get Free Access/i })
        .waitFor({ state: 'visible', timeout: 20_000 });
      const settled = await measureOverflow(page, width);

      const worst = loading.overflow >= settled.overflow ? loading : settled;
      const phase = worst === loading ? 'while the header was still loading' : 'once the header had settled';

      expect(
        worst.overflow,
        `the page is ${worst.overflow}px wider than the ${width}px viewport ${phase}:\n${worst.culprits.join('\n')}`,
      ).toBeLessThanOrEqual(1);
    });
  }
});
