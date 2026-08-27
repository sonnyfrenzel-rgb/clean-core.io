import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { getReferenceAnalysis } from '../lib/reference-analysis';

/**
 * The benefit card, and the one rule its rewrite established.
 *
 * The previous version made its argument with a layout: the business question on
 * the left and larger, the effort question on the right and smaller. Below
 * 1024px those halves stacked, so the comparison never happened — and the
 * closing sentence still said "the question on the right" to a reader whose
 * phone had no right. Measured: 2231px at 360px wide, two and a half screens.
 *
 * So: the argument is carried by a sentence, never by the layout. These tests
 * pin that, the honesty of the one hand-written element, and the height.
 */
const ROOT = path.resolve(__dirname, '..');
const source = () => fs.readFileSync(path.join(ROOT, 'components/BenefitCard.tsx'), 'utf8');

test.describe('the card does not depend on where things sit', () => {
  test('no copy refers to a column position', () => {
    // Everything after the props block — comments explaining the history are
    // allowed to say "left" and "right", rendered copy is not.
    const s = source();
    const rendered = s.slice(s.indexOf('return ('));
    expect(rendered, 'rendered copy names a column position').not.toMatch(
      /question on the (left|right)|on the left|on the right|left-hand|right-hand/i,
    );
  });

  test('the mockup elements stay deleted', () => {
    const s = source();
    // Only what renders — the doc comment above deliberately names both, so that
    // the next person knows they were removed on purpose rather than lost.
    const rendered = s.slice(s.indexOf('export default function'));
    // A CSS-drawn BPMN flow and a hand-written RACI table were the two elements
    // that made the card read as a mockup beside genuinely computed figures.
    for (const gone of ['BPMN', 'RACI', 'raci', 'gateway', 'circle-end']) {
      expect(rendered, `${gone} came back`).not.toContain(gone);
    }
  });

  test('the hand-written sample is labelled as hand-written', () => {
    // The one element on the card that is not computed. Saying so is what keeps
    // it from being the mockup problem, and the reader can check it themselves.
    const s = source();
    expect(s).toContain('Written by hand');
    expect(s).toContain('/reference-analysis/source');
  });

  test('the market claim is checkable and carries no invented figure', () => {
    const rendered = source().slice(source().indexOf('return ('));
    // The genre a whole release was spent removing.
    expect(rendered).not.toMatch(/\d+\s*%/);
    expect(rendered).not.toMatch(/faster|save (you )?(days|weeks|hours)|ROI|TCO by/i);
  });
});

test.describe('the roll-call is derived, not curated', () => {
  test('it names real objects with catalog successors', () => {
    const r = getReferenceAnalysis();
    expect(r.rollCall.length).toBeGreaterThan(0);
    const catalog = r.rollCall.filter((o) => o.fromCatalog);
    expect(catalog.length, 'no catalog-backed object to show').toBeGreaterThan(0);
    for (const o of catalog) {
      expect(o.successor, `${o.name} is catalog-backed but has no successor`).toBeTruthy();
      // Identifiers only — several finding titles also live in objectName.
      expect(o.name).toMatch(/^[A-Z][A-Z0-9_]{2,29}$|^\/[A-Z0-9]+\/[A-Z0-9_]+$/);
    }
  });

  test('every roll-call entry comes from a finding of the same run', () => {
    const r = getReferenceAnalysis();
    const namesInFindings = new Set(r.findings.map((f) => f.objectName).filter(Boolean));
    for (const o of r.rollCall) {
      expect(namesInFindings.has(o.name), `${o.name} is not in the findings`).toBe(true);
    }
  });
});

test.describe('the card fits a phone', () => {
  for (const width of [360, 390]) {
    test(`no horizontal overflow and under two screens at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      const card = page.locator('section[aria-labelledby="benefit-heading"]');
      await card.scrollIntoViewIfNeeded();

      // Scoped to the card on purpose. An earlier version asserted document-level
      // overflow and failed on CI for something else entirely: two pre-existing
      // landing-page elements — an S/4HANA sandbox badge and a test-code sample —
      // push the page sideways once Linux font metrics make them wider than they
      // are here. That is a real defect and it is not this component's, so it
      // does not belong in this component's guard.
      const cardOverflow = await card.evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(cardOverflow, `card scrolls sideways by ${cardOverflow}px`).toBeLessThanOrEqual(0);

      const past = await card.evaluate((el) => {
        const edge = el.getBoundingClientRect().right;
        return Array.from(el.querySelectorAll<HTMLElement>('*'))
          .filter((d) => d.getBoundingClientRect().right > edge + 1)
          .map((d) => `<${d.tagName.toLowerCase()}> "${(d.textContent || '').trim().slice(0, 30)}"`)
          .slice(0, 4);
      });
      expect(past, `content past the card edge: ${past.join(', ')}`).toEqual([]);

      const box = await card.boundingBox();
      // Was 2231px at 360, and 1722px after the rewrite. The ceiling leaves room
      // for a taller text renderer than this one while still catching the BPMN
      // row and RACI table coming back, which cost roughly 500px between them.
      expect(box!.height, `card is ${Math.round(box!.height)}px tall`).toBeLessThan(2050);
    });
  }

  test('both questions are answered before the closing line', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto('/');
    const card = page.locator('section[aria-labelledby="benefit-heading"]');
    const text = await card.innerText();
    // The differentiation is a sentence in the header, not an arrangement.
    expect(text).toContain('None of them tells the business what the work is');
    expect(text).toContain('Do we still need this program?');
    expect(text).toContain('What will it cost us to move it?');
  });
});
