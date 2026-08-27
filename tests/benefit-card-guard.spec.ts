import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { getReferenceAnalysis } from '../lib/reference-analysis';
import { MERGED_TABLE_MAP } from '../lib/abap/catalog-service';

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
    // Naming BPMN 2.0 as something the documentation stage produces is fine and
    // true; drawing a fake one out of divs is what may not come back.
    for (const gone of ['rotate-45', 'circle-end', 'gateway', 'raci', 'const flow']) {
      expect(rendered, `${gone} came back`).not.toContain(gone);
    }
    expect(rendered, 'a RACI table came back').not.toMatch(/<table[\s\S]{0,400}Credit Analyst/);
  });

  test('the business half carries evidence of its own', () => {
    // The criticism the rewrite started from was that the card asserts the
    // differentiator and proves the commodity. If the business block is only
    // prose while the effort block has a bar, three numbers and a roll-call,
    // that inversion is simply reproduced in a new shape.
    const rendered = source().slice(source().indexOf('return ('));
    expect(rendered).toContain('businessDecisions');
    expect(rendered).toContain('d.recommendation');
    // Quoted from the run rather than written for the page — say so.
    expect(rendered).toContain('quoted unedited');
  });

  test('the two voices are visually separated', () => {
    // The card used to say the same thing as a full "Verifiable Integrity"
    // section a thousand pixels below it — same three categories, same three
    // colours — and that section was the louder of the two while being the one
    // without a single number in it. It was merged in here, and the rule that
    // came out of the merge is: computed output looks like computed output.
    //
    // Exactly one dark region on this card, and it is the half holding the
    // evidence. If prose ever goes dark too, the distinction is gone.
    const rendered = source().slice(source().indexOf('return ('));
    expect(rendered).toContain('bg-slate-900');
    expect(rendered.match(/bg-slate-900/g)!.length, 'more than one dark region').toBe(1);
    expect(rendered).toContain('font-mono');
    // Data first on a phone; the arrangement returns to normal from md up.
    expect(rendered).toContain('order-first md:order-none');
    expect(rendered).toContain('order-last md:order-none');
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

test.describe('the merged section does not come back', () => {
  test('the landing page has no separate Verifiable Integrity block', () => {
    const page = fs.readFileSync(path.join(ROOT, 'app/page.tsx'), 'utf8');
    // JSX comments stripped: the note left where the section stood names it on
    // purpose, so the next person knows it was merged rather than lost. Only
    // markup counts here.
    const rendered = page
      .slice(page.indexOf('return ('))
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    expect(rendered).not.toContain('No AI Black-Box Promises');
    expect(rendered).not.toContain('Fully Grounded');
    expect(rendered).not.toContain('Quirk Review');
    expect(rendered).not.toContain('Manual Handover');
  });

  test('the card carries what the section used to say', () => {
    const r = getReferenceAnalysis();
    // Each bucket's meaning is now printed under its number, so it has to exist.
    for (const b of [r.resolved, r.decision, r.handedBack]) {
      expect(b.meaning.length, `${b.label} has no meaning text`).toBeGreaterThan(40);
      expect(b.label.length).toBeGreaterThan(0);
    }
    expect(fs.readFileSync(path.join(ROOT, 'components/BenefitCard.tsx'), 'utf8')).toContain('x.b.meaning');
  });
});

test.describe('the roll-call is derived, not curated', () => {
  test('every pair shown is SAP’s own, not a curated mapping wearing its badge', () => {
    const r = getReferenceAnalysis();
    expect(r.rollCall.length).toBeGreaterThan(0);
    const sapSourced = r.rollCall.filter((o) => o.fromSapData);
    expect(sapSourced.length, 'nothing SAP-sourced to show').toBeGreaterThan(0);

    for (const o of sapSourced) {
      expect(o.successor, `${o.name} is marked SAP-sourced but has no successor`).toBeTruthy();
      // Identifiers only — several finding titles also live in objectName.
      expect(o.name).toMatch(/^[A-Z][A-Z0-9_]{2,29}$|^\/[A-Z0-9]+\/[A-Z0-9_]+$/);
      // The card says these come from SAP's published data, so they have to.
      // The curated layer in sap-api-catalog.ts overrides the repository —
      // VBAK resolves to API_SALES_ORDER_SRV there while SAP says
      // I_SALESDOCUMENT — and reading the finding instead of the repository is
      // exactly how a curated mapping ends up presented as a catalog lookup.
      const repo = MERGED_TABLE_MAP[o.name]?.successors?.[0]?.name;
      expect(o.successor, `${o.name}: shown successor is not the one SAP names`).toBe(repo);
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

      // A pixel ceiling is the wrong instrument for "do not let this balloon": it
      // moves with the text renderer, and a guard that fails on a different
      // machine's fonts teaches people to ignore it. Word count does not move, so
      // that carries the intent and the pixel bound is only a catastrophe check.
      // Raised once, from 420, when the "Verifiable Integrity" section was merged
      // into this card: the three category explanations came with it. The page as
      // a whole got shorter — 13,752px to 13,227px — so this is not the card
      // growing, it is a section arriving. It has not moved since.
      const words = (await card.innerText()).trim().split(/\s+/).filter(Boolean).length;
      expect(words, `card is ${words} words`).toBeLessThan(470);

      const box = await card.boundingBox();
      expect(box!.height, `card is ${Math.round(box!.height)}px tall`).toBeLessThan(2600);
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
