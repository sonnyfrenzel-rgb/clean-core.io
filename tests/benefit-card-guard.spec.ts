import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { getReferenceAnalysis } from '../lib/reference-analysis';
import { MERGED_TABLE_MAP } from '../lib/abap/catalog-service';

/**
 * The reference run on the landing page — "Verify it yourself".
 *
 * Until 3.0 this was the benefit card (`components/BenefitCard.tsx`). Roadmap
 * 3.0.6 rebuilt the landing page along the accepted mockup and the card went
 * with it, deliberately (the roadmap row names this change). What the card's
 * guard established survives here, pinned to the section that carries it now:
 *
 *   - every figure is the reference run's, computed from the file — never typed;
 *   - the one piece of prose from the run, the engine's recommendation, is
 *     quoted unedited and says so;
 *   - the object roll-call shows SAP's own successors, not a curated mapping
 *     wearing their badge;
 *   - it fits a phone.
 */
const ROOT = path.resolve(__dirname, '..');
const page = () => fs.readFileSync(path.join(ROOT, 'app/page.tsx'), 'utf8');

test.describe('the reference run is read, not typed', () => {
  test('the section renders the run from lib/reference-analysis.ts', () => {
    const s = page();
    expect(s).toContain("from '@/lib/reference-analysis'");
    for (const field of ['reference.linesOfCode', 'reference.totalFindings', 'reference.resolved', 'reference.decision', 'reference.handedBack', 'reference.rollCall', 'reference.businessDecisions']) {
      expect(s, `${field} is not read`).toContain(field);
    }
    // Quoted from the run rather than written for the page — say so.
    expect(s).toContain('quoted');
    expect(s).toContain('recommendation');
  });

  test('the merged "Verifiable Integrity" block does not come back', () => {
    const rendered = page().slice(page().lastIndexOf('return (')).replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    for (const gone of ['No AI Black-Box Promises', 'Fully Grounded', 'Quirk Review', 'Manual Handover']) {
      expect(rendered).not.toContain(gone);
    }
  });

  test('every bucket carries its meaning', () => {
    const r = getReferenceAnalysis();
    for (const b of [r.resolved, r.decision, r.handedBack]) {
      expect(b.meaning.length, `${b.label} has no meaning text`).toBeGreaterThan(40);
      expect(b.label.length).toBeGreaterThan(0);
    }
  });

  test('the rendered numbers are the run’s numbers', async ({ page: browser }) => {
    test.setTimeout(240_000);
    const r = getReferenceAnalysis();
    await browser.goto('/', { waitUntil: 'domcontentloaded', timeout: 200_000 });
    const card = await browser.locator('[data-landing-reference]').innerText();
    expect(card).toContain(r.linesOfCode.toLocaleString('en-US'));
    for (const b of [r.resolved, r.decision, r.handedBack]) {
      expect(card).toContain(String(b.count));
      expect(card).toContain(b.label);
    }
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

test.describe('the section fits a phone', () => {
  for (const width of [360, 390]) {
    test(`no horizontal overflow in the reference run at ${width}px`, async ({ page: browser }) => {
      test.setTimeout(240_000);
      await browser.setViewportSize({ width, height: 900 });
      await browser.goto('/', { waitUntil: 'domcontentloaded', timeout: 200_000 });
      const section = browser.locator('#verify');
      await section.scrollIntoViewIfNeeded();
      const overflow = await section.evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(overflow, `#verify scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(0);
    });
  }
});
