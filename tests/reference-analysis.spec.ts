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
 *
 * They assert them by mapping and not by counting (roadmap 0.17, QA review
 * d163622eab8e). A count is satisfied by any set of the right size: the settled
 * band could be counted from findings that name no successor, the roll call
 * could pair an object with the curated successor while the card says the name
 * is SAP's own, and a business decision could quote another finding's
 * recommendation — all three with every figure on the page still correct. So
 * every claim below is checked against the finding it is attached to.
 */
import { test, expect } from '@playwright/test';
import { getReferenceAnalysis, getReferenceSource } from '../lib/reference-analysis';
import { MERGED_TABLE_MAP } from '../lib/abap/catalog-service';
import type { EvidenceFinding } from '../lib/abap/evidence-model';

/**
 * The bucket rule and the identifier rule, restated rather than imported.
 *
 * `bucketOf` and `OBJECT_NAME` are private to `lib/reference-analysis.ts`, and
 * importing them would only prove the module agrees with itself. Written out
 * here they are a second statement of the same property, so the two have to
 * keep agreeing — which is the point of the comparison below.
 */
const HANDED_BACK_KINDS = new Set(['dynpro', 'modification', 'native-sql']);
const PROVENANCE = new Set(['Catalog Match', 'Verified']);
const OBJECT_NAME = /^[A-Z][A-Z0-9_]{2,29}$|^\/[A-Z0-9]+\/[A-Z0-9_]+$/;

const hasProvenance = (f: EvidenceFinding) => PROVENANCE.has(f.sapReplacement?.confidence ?? '');
const bucketOf = (f: EvidenceFinding): 'resolved' | 'decision' | 'handedBack' =>
  HANDED_BACK_KINDS.has(f.kind) ? 'handedBack' : hasProvenance(f) ? 'resolved' : 'decision';

const identity = (x: { title: string; lineStart: number }) => `${x.title}@${x.lineStart}`;

test.describe('published reference analysis', () => {
  test('the three buckets partition every finding, with nothing lost', () => {
    const r = getReferenceAnalysis();
    expect(r.totalFindings).toBeGreaterThan(0);
    expect(r.resolved.count + r.decision.count + r.handedBack.count).toBe(r.totalFindings);
  });

  test('every finding the settled count claims is one that names a successor', () => {
    const r = getReferenceAnalysis();
    const byBucket: Record<'resolved' | 'decision' | 'handedBack', EvidenceFinding[]> = {
      resolved: [],
      decision: [],
      handedBack: [],
    };
    for (const f of r.findings) byBucket[bucketOf(f)].push(f);

    // Membership, not cardinality (QA review d163622eab8e). This used to read
    // `resolved.count <= (findings that name a successor)`, which says nothing
    // about WHICH findings were counted: a count of zero satisfies it, and so
    // does a count that has drifted away from the findings behind it. The
    // number on the landing page is the number of these findings, exactly.
    expect(r.resolved.count).toBe(byBucket.resolved.length);
    expect(r.decision.count).toBe(byBucket.decision.length);
    expect(r.handedBack.count).toBe(byBucket.handedBack.length);
    expect(r.resolved.count, 'the settled band is empty — the page would claim nothing').toBeGreaterThan(0);

    for (const f of byBucket.resolved) {
      expect(f.sapReplacement, `${identity(f)} is counted as settled without a successor`).toBeTruthy();
      expect(f.sapReplacement!.objectName.length).toBeGreaterThan(0);
      // The catalog version identifies SAP's published release data, so it may
      // only appear on a finding that actually came from it. Hanging it on a
      // curated mapping is what made hand-written pairings read as citations.
      if (f.sapReplacement!.confidence === 'Catalog Match') {
        expect(f.sapReplacement!.catalogVersion).toBeTruthy();
      } else {
        expect(f.sapReplacement!.catalogVersion).toBeUndefined();
      }
    }
    // The other direction: an inference is never counted as settled, and a
    // finding that does carry a provenance is never quietly left out of the band.
    for (const f of byBucket.decision) {
      expect(hasProvenance(f), `${identity(f)} names a successor but is not counted as settled`).toBe(false);
    }
  });

  test('each name in the roll call carries the successor SAP names for that name', () => {
    const r = getReferenceAnalysis();
    expect(r.rollCall.length).toBeGreaterThan(0);

    // The card sets these pairs next to the words "SAP's own release data", so
    // the pairing is the claim — not the number of pairs. A roll call that took
    // the finding's own successor would look identical and be a different
    // statement: VBAK resolves to API_SALES_ORDER_SRV in the curated layer while
    // SAP's own data says I_SALESDOCUMENT.
    const findingsByName = new Map<string, EvidenceFinding[]>();
    for (const f of r.findings) {
      if (!f.objectName) continue;
      findingsByName.set(f.objectName, [...(findingsByName.get(f.objectName) ?? []), f]);
    }

    for (const o of r.rollCall) {
      const owners = findingsByName.get(o.name);
      expect(owners, `${o.name} is in the roll call but in no finding of this run`).toBeTruthy();
      expect(
        owners!.map((f) => f.objectType || 'Object'),
        `${o.name} is labelled ${o.objectType}, which no finding on it says`,
      ).toContain(o.objectType);

      const sapsOwn = MERGED_TABLE_MAP[o.name]?.successors?.[0]?.name ?? null;
      expect(o.successor, `${o.name}: the roll call names a successor SAP's data does not`).toBe(sapsOwn);
      expect(o.fromSapData, `${o.name}: fromSapData does not match the lookup`).toBe(sapsOwn !== null);
    }

    // No object of the run is dropped on the way to the card: leaving out the
    // ones without a successor would turn "these are the objects it touched"
    // into "these are the ones we could answer".
    const touched = [...new Set(r.findings.map((f) => f.objectName).filter((n): n is string => !!n && OBJECT_NAME.test(n)))];
    expect(r.rollCall.map((o) => o.name).sort()).toEqual(touched.sort());
    expect(r.rollCall.some((o) => o.fromSapData), 'no row came from SAP data — the card would cite nothing').toBe(true);
  });

  test('each business decision quotes the recommendation of the finding it names', () => {
    const r = getReferenceAnalysis();
    const flagged = r.findings.filter((f) => f.needsBusinessDecision === true);
    expect(flagged.length, 'the run flags no business decision — the card\'s business half is empty').toBeGreaterThan(0);

    // The card prints title, line number and recommendation as one paragraph and
    // says "quoted unedited". A recommendation under the wrong title is that
    // sentence falsified while every count stays right, which is why this is
    // matched pair by pair rather than counted.
    const expected = flagged.map((f) => ({ title: f.title, lineStart: f.lineStart, recommendation: f.recommendation }));
    expect(r.businessDecisions).toEqual(expected);

    const flaggedById = new Map(flagged.map((f) => [identity(f), f]));
    for (const d of r.businessDecisions) {
      const owner = flaggedById.get(identity(d));
      expect(owner, `${identity(d)} is presented as a business call the engine never flagged`).toBeTruthy();
      expect(d.recommendation, `the recommendation under "${d.title}" belongs to another finding`).toBe(owner!.recommendation);
      expect(d.recommendation.length).toBeGreaterThan(0);
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
