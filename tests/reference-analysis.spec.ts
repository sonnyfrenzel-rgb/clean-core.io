/**
 * The published reference run is a public claim, so it needs a guard.
 *
 * The landing page, the whitepaper and /reference-analysis all state the same
 * split — how much of a real run the tool settles, how much needs an architect,
 * how much is handed back. Those numbers are computed from a file in this
 * repository at request time, which stops them drifting into marketing copy but
 * also means an engine change moves them silently.
 *
 * These tests do not freeze the numbers (they SHOULD move when the engine gets
 * better). They assert the properties that make the claim honest: the buckets
 * partition the findings exactly, nothing lands in "settled" without a real
 * catalog lookup, and the handed-back set is never silently emptied — an empty
 * red band would read as "we can transform everything", which is the one thing
 * the page must never say.
 */
import { test, expect } from '@playwright/test';
import { getReferenceAnalysis, getReferenceSource } from '../lib/reference-analysis';

test.describe('published reference analysis', () => {
  test('the three buckets partition every finding, with nothing lost', () => {
    const r = getReferenceAnalysis();
    expect(r.totalFindings).toBeGreaterThan(0);
    expect(r.resolved.count + r.decision.count + r.handedBack.count).toBe(r.totalFindings);
  });

  test('a settled finding always has a real catalog match behind it', () => {
    const r = getReferenceAnalysis();
    const settled = r.findings.filter(
      (f) => f.sapReplacement?.confidence === 'Catalog Match',
    );
    // Everything counted as settled is a lookup, never an inference.
    expect(r.resolved.count).toBeLessThanOrEqual(settled.length);
    for (const f of settled) {
      expect(f.sapReplacement!.objectName.length).toBeGreaterThan(0);
      expect(f.sapReplacement!.catalogVersion).toBeTruthy();
    }
  });

  test('the handed-back bucket is never empty, and names what is in it', () => {
    const r = getReferenceAnalysis();
    // The reference file deliberately contains untransformable patterns. If this
    // ever reaches zero, either the file changed or the engine started guessing.
    expect(r.handedBack.count).toBeGreaterThan(0);
    expect(r.handedBackKinds.length).toBeGreaterThan(0);
    for (const k of r.handedBackKinds) {
      expect(['dynpro', 'modification', 'native-sql']).toContain(k);
    }
  });

  test('the run reports the facts the pages quote', () => {
    const r = getReferenceAnalysis();
    expect(r.linesOfCode).toBeGreaterThan(500);
    expect(r.durationMs).toBeGreaterThan(0);
    expect(r.cleanCoreScore).toBeGreaterThanOrEqual(5);
    expect(r.cleanCoreScore).toBeLessThanOrEqual(100);
    expect(r.recommendedRoute.length).toBeGreaterThan(0);
    expect(r.catalogVersion.length).toBeGreaterThan(0);
  });

  test('the downloadable file is the one the run used', () => {
    const source = getReferenceSource();
    const r = getReferenceAnalysis();
    const loc = source.split(/\r?\n/).filter((l) => l.trim() && !/^\s*\*/.test(l)).length;
    // A second copy of the file would eventually drift and quietly falsify the page.
    expect(loc).toBe(r.linesOfCode);
  });
});
