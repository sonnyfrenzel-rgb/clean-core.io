import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { createGalleryAdmin, openGallery, type GalleryAdmin } from './helpers/cc-gallery';
import { ratioOf } from './helpers/contrast';
import {
  SEVERITY,
  SEVERITY_VALUES,
  compareSeverity,
  isSeverityValue,
  normaliseSeverity,
  severityRank,
  type SeverityValue,
} from '../lib/severity';
import {
  CATEGORICAL_CHART_COLORS,
  SEQUENTIAL_CHART_COLORS,
  STATE_CHART_COLORS,
  categoricalChartColor,
  levelChartColor,
  severityChartColor,
} from '../lib/chart-colors';
import type { ItFindingRow } from '../lib/it-findings';
import type { EvidenceFinding } from '../lib/abap/evidence-model';

/**
 * Severity as the fifth fixed list, and the chart palettes — block D, step D.5d.
 *
 * `DESIGN.md` §4.1 (the severity row), §1.8 (charts) and ADR-049. What is held:
 *
 *   - the list is the one the engine writes, not a second one beside it — the
 *     types are checked against `ItFindingRow` and `EvidenceFinding` at compile
 *     time, so a sixth severity in the engine fails `npm run typecheck` here;
 *   - a severity is an identifier with its word, 12 px / 600, in the colour of
 *     its state and never green, readable at 4.5 : 1, and still a rectangle
 *     with a word under `forced-colors` and on paper;
 *   - a chart that counts states paints from the fixed list, every other chart
 *     from the categorical or sequential palette, all through tokens, none green.
 *
 * `cc-provenance-guard.spec.ts` holds the other half: that the five vocabularies
 * do not look like one another, and that nothing in the new namespace paints a
 * severity of its own.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');
const DEMO = '[data-cc-demo="severity-charts"]';

/* The engine's two severity types and this list are one type, both ways round. */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const itRowIsTheList: Same<ItFindingRow['severity'], SeverityValue> = true;
const engineIsTheList: Same<EvidenceFinding['severity'], SeverityValue> = true;

/** Custom properties declared in the `:root` block of `app/globals.css`. */
function declaredTokens(): Map<string, string> {
  const css = read('app/globals.css');
  const out = new Map<string, string>();
  for (const m of css.matchAll(/^\s*(--cc-[\w-]+):\s*([^;]+);/gm)) {
    if (!out.has(m[1])) out.set(m[1], m[2].trim());
  }
  return out;
}

test.describe('the list is the engine’s list', () => {
  test('the same five words, in the order of severity', () => {
    expect(itRowIsTheList && engineIsTheList).toBe(true);
    expect(SEVERITY_VALUES).toEqual(['Critical', 'High', 'Medium', 'Low', 'Info']);
    expect(SEVERITY_VALUES.map(severityRank)).toEqual([0, 1, 2, 3, 4]);
    const shuffled: SeverityValue[] = ['Low', 'Info', 'Critical', 'Medium', 'High'];
    expect([...shuffled].sort(compareSeverity)).toEqual(SEVERITY_VALUES);
  });

  test('no severity is green, and Critical and High differ only in the word', () => {
    for (const value of SEVERITY_VALUES) {
      expect(SEVERITY[value].state as string, `${value} is green`).not.toBe('success');
    }
    expect(SEVERITY.Critical.state).toBe(SEVERITY.High.state);
    expect(SEVERITY.Critical.label).not.toBe(SEVERITY.High.label);
    expect(new Set(SEVERITY_VALUES.map((v) => SEVERITY[v].label)).size).toBe(5);
  });

  test('the normaliser takes every spelling the app writes, and nothing else', () => {
    // The engine, `lib/abap/usage-model.ts` (`'high'`), and a stored row with space around it.
    expect(normaliseSeverity('High')).toBe('High');
    expect(normaliseSeverity('high')).toBe('High');
    expect(normaliseSeverity('critical')).toBe('Critical');
    expect(normaliseSeverity(' MEDIUM ')).toBe('Medium');
    expect(normaliseSeverity('info')).toBe('Info');
    // Other vocabularies are not severities, and a guess is not a value.
    for (const other of ['error', 'warning', 'warn', 'information', 'not-supported', 'partial', 'blocks', '', '  ']) {
      expect(normaliseSeverity(other), `"${other}" was read as a severity`).toBeNull();
    }
    for (const junk of [null, undefined, 3, {}, ['High']]) {
      expect(normaliseSeverity(junk)).toBeNull();
    }
    expect(isSeverityValue('High')).toBe(true);
    expect(isSeverityValue('high'), 'the type guard is exact; normalise first').toBe(false);
  });
});

test.describe('the chart palettes are tokens, and never green', () => {
  test('a chart that counts states reads its colour from the fixed list', () => {
    expect(severityChartColor('Critical').token).toBe('--cc-error');
    expect(severityChartColor('High').token).toBe('--cc-error');
    expect(severityChartColor('Medium').token).toBe('--cc-warning');
    expect(severityChartColor('Low').token).toBe('--cc-neutral');
    expect(severityChartColor('Info').token).toBe('--cc-information');
    // §1.8 / ADR-024: A blue, never green.
    expect(levelChartColor('A').token).toBe('--cc-information');
    expect(levelChartColor('B').token).toBe('--cc-neutral');
    expect(levelChartColor('C').token).toBe('--cc-warning');
    expect(levelChartColor('D').token).toBe('--cc-error');
    expect(Object.keys(STATE_CHART_COLORS).sort()).toEqual(['error', 'information', 'neutral', 'warning']);
  });

  test('every other chart takes the categorical or sequential palette of §1.8', () => {
    const tokens = declaredTokens();
    const design = read('DESIGN.md');
    const section = design.slice(design.indexOf('### 1.8 Diagramme'), design.indexOf('## 2. Struktur'));
    const hexes = (s: string) => [...s.matchAll(/`(#[0-9a-f]{6})`/gi)].map((m) => m[1].toLowerCase());
    const [categorical, sequential] = [
      hexes(section.slice(0, section.indexOf('Sequenziell'))),
      hexes(section.slice(section.indexOf('Sequenziell'))),
    ];
    expect(CATEGORICAL_CHART_COLORS.map((c) => tokens.get(c.token)?.toLowerCase())).toEqual(categorical);
    expect(SEQUENTIAL_CHART_COLORS.map((c) => tokens.get(c.token)?.toLowerCase())).toEqual(sequential);
    expect(categoricalChartColor(0).token).toBe('--cc-chart-1');
    expect(categoricalChartColor(5).token, 'the sixth series wraps to the first').toBe('--cc-chart-1');
    expect(() => categoricalChartColor(-1)).toThrow();
  });

  test('every colour names a declared token, a Tailwind colour and its var()', () => {
    const tokens = declaredTokens();
    const css = read('app/globals.css');
    const all = [
      ...Object.values(STATE_CHART_COLORS),
      ...CATEGORICAL_CHART_COLORS,
      ...SEQUENTIAL_CHART_COLORS,
    ];
    for (const c of all) {
      expect(tokens.has(c.token), `${c.token} is not declared in app/globals.css`).toBe(true);
      expect(c.value).toBe(`var(${c.token})`);
      const name = c.token.replace(/^--/, '');
      // A class Tailwind does not know emits nothing — the bar would take its parent's colour.
      expect(css, `--color-${name} is missing from @theme`).toContain(`--color-${name}: var(${c.token})`);
      expect(c.bg).toBe(`bg-${name}`);
      expect(c.fill).toBe(`fill-${name}`);
      expect(c.stroke).toBe(`stroke-${name}`);
    }
    const success = new Set(
      [...tokens].filter(([k]) => k.startsWith('--cc-success')).map(([, v]) => v.toLowerCase()),
    );
    for (const c of all) {
      expect(c.token, 'a chart colour is a success token').not.toMatch(/success/);
      expect(success.has((tokens.get(c.token) || '').toLowerCase()), `${c.token} has the value of green`).toBe(false);
    }
    // And the module cannot hand out a hex of its own.
    expect(read('lib/chart-colors.ts').replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});

/* ------------------------------------------------------------------ rendered */

/** A token's value as the browser resolves it — `rgb(…)`, whatever its spelling. */
async function resolve(page: Page, token: string): Promise<string> {
  return page.evaluate((t) => {
    const probe = document.createElement('span');
    probe.style.color = `var(${t})`;
    document.body.appendChild(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  }, token);
}

test.describe('severity and charts, rendered', () => {
  let admin: GalleryAdmin;

  test.beforeAll(async () => {
    admin = await createGalleryAdmin('ccd5d');
  });

  test('every severity is its word, 12 px / 600, in its state and at 4.5 : 1', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await openGallery(page, admin);

    const rendered = await page.locator('[data-cc-identifier="severity"]').evaluateAll((els) =>
      els.map((el) => {
        const s = getComputedStyle(el);
        return {
          value: el.getAttribute('data-cc-value') || '',
          text: (el.textContent || '').trim(),
          size: s.fontSize,
          weight: s.fontWeight,
          radius: s.borderTopLeftRadius,
          borderWidth: s.borderTopWidth,
          borderStyle: s.borderTopStyle,
          borderColor: s.borderTopColor,
          color: s.color,
          background: s.backgroundColor,
          icons: el.querySelectorAll('svg').length,
        };
      }),
    );
    // The five in the severity card, and the five again in the chart's table.
    expect(rendered.length).toBeGreaterThanOrEqual(10);
    expect(new Set(rendered.map((r) => r.value))).toEqual(new Set(SEVERITY_VALUES));

    const expected: Record<string, { text: string; bg: string; line: string }> = {
      error: { text: '--cc-error', bg: '--cc-error-bg', line: '--cc-error' },
      warning: { text: '--cc-warning', bg: '--cc-warning-bg', line: '--cc-warning-line' },
      neutral: { text: '--cc-neutral', bg: '--cc-neutral-bg', line: '--cc-neutral' },
      information: { text: '--cc-information', bg: '--cc-information-bg', line: '--cc-information' },
    };
    const success = await resolve(page, '--cc-success');
    for (const r of rendered) {
      const state = SEVERITY[r.value as SeverityValue].state;
      expect(r.text, 'the word is the value, always printed').toBe(r.value);
      expect(r.size).toBe('12px');
      expect(r.weight).toBe('600');
      expect(r.radius).toBe('4px');
      expect(r.borderStyle).toBe('solid');
      expect(parseFloat(r.borderWidth)).toBeGreaterThan(0);
      expect(r.icons).toBe(0);
      expect(r.color, `${r.value} text`).toBe(await resolve(page, expected[state].text));
      expect(r.background, `${r.value} fill`).toBe(await resolve(page, expected[state].bg));
      expect(r.borderColor, `${r.value} edge`).toBe(await resolve(page, expected[state].line));
      expect(r.color, `${r.value} is green`).not.toBe(success);
      const text = ratioOf(r.color, r.background);
      expect(text, `${r.value}: text on its fill`).not.toBeNull();
      expect(text!, `${r.value}: text below 4.5 : 1`).toBeGreaterThanOrEqual(4.5);
      const edge = ratioOf(r.borderColor, 'rgb(255, 255, 255)');
      expect(edge!, `${r.value}: the edge is below 3 : 1 against the surface`).toBeGreaterThanOrEqual(3);
    }
  });

  test('the state charts paint from the list, and every number is also text', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await openGallery(page, admin);

    const bar = page.locator(`${DEMO} [data-chart="severity"]`);
    await expect(bar).toHaveAttribute('role', 'img');
    const label = (await bar.getAttribute('aria-label')) || '';
    for (const value of SEVERITY_VALUES) expect(label, `${value} is missing from the chart's label`).toMatch(new RegExp(`${value} \\d+`));

    const segments = await bar.locator('[data-chart-segment]').evaluateAll((els) =>
      els.map((el) => ({ key: el.getAttribute('data-chart-segment') || '', bg: getComputedStyle(el).backgroundColor })),
    );
    expect(segments.map((s) => s.key)).toEqual([...SEVERITY_VALUES]);
    for (const s of segments) {
      expect(s.bg, `${s.key} segment`).toBe(await resolve(page, severityChartColor(s.key as SeverityValue).token));
    }

    const levels = await page
      .locator(`${DEMO} [data-chart="level"] [data-chart-segment]`)
      .evaluateAll((els) => els.map((el) => ({ key: el.getAttribute('data-chart-segment') || '', bg: getComputedStyle(el).backgroundColor })));
    expect(levels.map((s) => s.key)).toEqual(['A', 'B', 'C', 'D']);
    for (const s of levels) {
      expect(s.bg, `level ${s.key}`).toBe(await resolve(page, levelChartColor(s.key as 'A' | 'B' | 'C' | 'D').token));
    }
    // The table under the severity chart carries every figure a second time.
    const table = page.locator(`${DEMO} table`).first();
    for (const value of SEVERITY_VALUES) await expect(table).toContainText(value);
  });

  test('the categorical palette resolves as classes and as an SVG attribute, none of it green', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await openGallery(page, admin);

    for (const [i, c] of CATEGORICAL_CHART_COLORS.entries()) {
      const want = await resolve(page, c.token);
      const swatch = await page
        .locator(`${DEMO} [data-chart-swatch="${c.token}"]`)
        .evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(swatch, `${c.token} as a class`).toBe(want);
      // The way a charting library hands a colour to a shape: `fill="var(--cc-chart-1)"`.
      const svg = await page
        .locator(`${DEMO} [data-chart-svg="${categoricalChartColor(i).token}"]`)
        .evaluate((el) => getComputedStyle(el).fill);
      expect(svg, `${c.token} as an SVG fill attribute`).toBe(want);
    }
    for (const c of SEQUENTIAL_CHART_COLORS) {
      const swatch = await page
        .locator(`${DEMO} [data-chart-swatch="${c.token}"]`)
        .evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(swatch, `${c.token} as a class`).toBe(await resolve(page, c.token));
    }

    const success = await resolve(page, '--cc-success');
    const green = await page
      .locator(`${DEMO} [data-chart-segment], ${DEMO} [data-chart-swatch], ${DEMO} [data-chart-svg]`)
      .evaluateAll(
        (els, target) =>
          els
            .filter((el) => {
              const s = getComputedStyle(el);
              return s.backgroundColor === target || s.fill === target;
            })
            .map((el) => el.outerHTML.slice(0, 80)),
        success,
      );
    expect(green, 'a chart painted green (DESIGN.md §1.8)').toEqual([]);
  });

  test('under forced-colors a severity is still a rectangle with its word, and a segment a box', async ({ browser }) => {
    test.setTimeout(180 * 1000);
    const context = await browser.newContext({ forcedColors: 'active' });
    const page = await context.newPage();
    await openGallery(page, admin);

    const severities = await page.locator(`${DEMO} [data-cc-demo-severities] [data-cc-identifier="severity"]`).evaluateAll((els) =>
      els.map((el) => {
        const s = getComputedStyle(el);
        return {
          text: (el.textContent || '').trim(),
          radius: s.borderTopLeftRadius,
          width: s.borderTopWidth,
          style: s.borderTopStyle,
          border: s.borderTopColor,
          background: s.backgroundColor,
        };
      }),
    );
    expect(severities.map((s) => s.text), 'the five words are what tells them apart here').toEqual([...SEVERITY_VALUES]);
    for (const s of severities) {
      expect(s.radius, `${s.text} lost its identifier form`).toBe('4px');
      expect(s.style).toBe('solid');
      expect(parseFloat(s.width), `${s.text} lost its edge`).toBeGreaterThan(0);
      expect(s.border, `${s.text}: the edge vanished into the surface`).not.toBe(s.background);
    }

    const segments = await page.locator(`${DEMO} [data-chart-segment]`).evaluateAll((els) =>
      els.map((el) => ({ width: getComputedStyle(el).borderTopWidth, style: getComputedStyle(el).borderTopStyle })),
    );
    expect(segments.length).toBeGreaterThan(0);
    for (const s of segments) {
      expect(s.style, 'a chart segment without its box under forced-colors').toBe('solid');
      expect(parseFloat(s.width)).toBeGreaterThan(0);
    }
    await context.close();
  });

  test('and on paper the word stays', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await openGallery(page, admin);
    await page.emulateMedia({ media: 'print' });
    const words = await page
      .locator(`${DEMO} [data-cc-demo-severities] [data-cc-identifier="severity"]`)
      .evaluateAll((els) =>
        els.map((el) => ({
          text: (el.textContent || '').trim(),
          visible: getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden',
          width: parseFloat(getComputedStyle(el).borderTopWidth),
        })),
      );
    expect(words.map((w) => w.text)).toEqual([...SEVERITY_VALUES]);
    for (const w of words) {
      expect(w.visible, `${w.text} is not printed`).toBe(true);
      expect(w.width, `${w.text} lost its edge on paper`).toBeGreaterThan(0);
    }
    await page.emulateMedia({ media: 'screen' });
  });
});
