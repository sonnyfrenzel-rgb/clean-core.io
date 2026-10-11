/**
 * 3.0.9 · own Z/Y table writes cost no Clean Core Score points in Private
 * Edition (owner decisions 10.10. and 11.10.2026, QA full review of v3.0.7,
 * 3a31270a65a0).
 *
 * The route's rationale has called a write to the program's own Z/Y table "not
 * a clean core violation" in Private Edition since CR-04, while the score still
 * charged it 12 points. From engine 3.0.9 the score agrees. Public Cloud keeps
 * the deduction; a namespaced `/NS/` table and SAP standard tables keep theirs
 * in both editions. A run signed before 3.0.9 is recomputed with the rule it
 * was signed with, so Analyze still finds that its score adds up.
 *
 * Serverless: pure functions over text.
 */
import { test, expect } from '@playwright/test';
import { buildAbapEvidence } from '../lib/abap/evidence-model';
import { routeExtensibility } from '../lib/abap/extensibility-router';
import { scoreBreakdown } from '../lib/clean-core-score';
import { engineVersionAtLeast, scoreRuleFor, signedEngineVersionOf } from '../lib/score-rule';
import { signedRouteReport, type SignedRouteProject } from '../lib/signed-route-report';

const OLD = 'v3.0.8';
const NEW = 'v3.0.9';

const OWN_WRITE = [
  'REPORT zcc_own_write.',
  "UPDATE zcc_orders SET status = 'X' WHERE id = '1'.",
].join('\n');

const NAMESPACED_WRITE = [
  'REPORT zcc_ns_write.',
  "UPDATE /acme/orders SET status = 'X' WHERE id = '1'.",
].join('\n');

const STANDARD_WRITE = [
  'REPORT zcc_std_write.',
  "UPDATE mara SET mtart = 'FERT' WHERE matnr = '4711'.",
].join('\n');

function scored(code: string, edition: 'public' | 'private', engine: string | null) {
  const evidence = buildAbapEvidence(code, 'source.abap', edition);
  const route = routeExtensibility(evidence, edition, engine);
  const gaps = evidence.coverage && !evidence.coverage.complete ? evidence.coverage.gaps.length : 0;
  const breakdown = scoreBreakdown(evidence.findings, gaps, scoreRuleFor(edition, engine));
  return { evidence, route, breakdown };
}

const customLine = (b: ReturnType<typeof scoreBreakdown>) => b.lines.find((l) => l.kind === 'custom-table-write');

test.describe('the score rule', () => {
  test('Private Edition from 3.0.9 lets own Z/Y writes go free; everything else is the old rule', () => {
    expect(scoreRuleFor('private', NEW)).toBe('own-custom-writes-free');
    expect(scoreRuleFor('private', '3.0.9')).toBe('own-custom-writes-free');
    expect(scoreRuleFor('private', 'v3.0.10')).toBe('own-custom-writes-free');
    expect(scoreRuleFor('private', 'v3.1.0')).toBe('own-custom-writes-free');
    expect(scoreRuleFor('private', 'v4.0.0')).toBe('own-custom-writes-free');
    expect(scoreRuleFor('private', OLD)).toBe('custom-writes-charged');
    expect(scoreRuleFor('private', 'v2.20.0')).toBe('custom-writes-charged');
    for (const v of [NEW, 'v4.0.0', OLD]) expect(scoreRuleFor('public', v)).toBe('custom-writes-charged');
  });

  test('a missing or unreadable engine version is a run before 3.0.9', () => {
    for (const v of [null, undefined, '', ' ', 'dev', 'v3', '3.0', 'latest']) {
      expect(scoreRuleFor('private', v as string | null), String(v)).toBe('custom-writes-charged');
      expect(engineVersionAtLeast(v, '3.0.9')).toBe(false);
    }
    expect(engineVersionAtLeast(42, '3.0.9')).toBe(false);
  });

  test("the signed engine version is the run's own analyzerVersion first, the model card's second", () => {
    expect(signedEngineVersionOf({ analyzerVersion: NEW, auditMetadata: { modelCard: { engineVersion: OLD } } })).toBe(NEW);
    expect(signedEngineVersionOf({ auditMetadata: { modelCard: { engineVersion: OLD } } })).toBe(OLD);
    expect(signedEngineVersionOf({})).toBeNull();
    expect(signedEngineVersionOf(null)).toBeNull();
    expect(signedEngineVersionOf({ analyzerVersion: 7 })).toBeNull();
  });
});

test.describe('the engine', () => {
  test('Private Edition, new run: a write to an own Z table costs nothing', () => {
    const before = scored(OWN_WRITE, 'private', OLD);
    const after = scored(OWN_WRITE, 'private', NEW);
    // Not vacuous: the write is found, and the old rule charged it.
    expect(after.evidence.findings.some((f) => f.kind === 'custom-table-write' && f.objectName === 'ZCC_ORDERS')).toBe(true);
    expect(customLine(before.breakdown)?.points).toBe(12);

    expect(customLine(after.breakdown)).toBeUndefined();
    expect(after.breakdown.freeOwnTableWrites).toBe(1);
    expect(after.route.cleanCoreScore).toBe(before.route.cleanCoreScore + 12);
    expect(after.breakdown.score).toBe(after.route.cleanCoreScore);
    // The route and its rationale are not the score's to change.
    expect(after.route.recommendedRoute).toBe(before.route.recommendedRoute);
    expect(after.route.rationale).toBe(before.route.rationale);
  });

  test('Public Cloud keeps the deduction, new run or old', () => {
    const before = scored(OWN_WRITE, 'public', OLD);
    const after = scored(OWN_WRITE, 'public', NEW);
    expect(customLine(after.breakdown)?.points).toBe(12);
    expect(after.breakdown.freeOwnTableWrites).toBe(0);
    expect(after.route.cleanCoreScore).toBe(before.route.cleanCoreScore);
  });

  test('a namespaced table is not the customer\'s own by its name: charged in Private Edition too', () => {
    const after = scored(NAMESPACED_WRITE, 'private', NEW);
    expect(after.evidence.findings.some((f) => f.kind === 'custom-table-write')).toBe(true);
    expect(customLine(after.breakdown)?.points).toBe(12);
    expect(after.route.cleanCoreScore).toBe(scored(NAMESPACED_WRITE, 'private', OLD).route.cleanCoreScore);
  });

  test('a write to an SAP standard table is charged as before, in both editions', () => {
    for (const edition of ['private', 'public'] as const) {
      const before = scored(STANDARD_WRITE, edition, OLD);
      const after = scored(STANDARD_WRITE, edition, NEW);
      expect(after.breakdown.lines.find((l) => l.kind === 'standard-table-write')?.points, edition).toBe(20);
      expect(after.route.cleanCoreScore, edition).toBe(before.route.cleanCoreScore);
      expect(after.breakdown).toEqual(before.breakdown);
    }
  });
});

test.describe('a signed run is recomputed with the rule it was signed with', () => {
  const evidence = buildAbapEvidence(OWN_WRITE, 'source.abap', 'private');
  const signedOld = routeExtensibility(evidence, 'private', OLD);
  const signedNew = routeExtensibility(evidence, 'private', NEW);

  function project(route: typeof signedOld, extra: Partial<SignedRouteProject>): SignedRouteProject {
    return {
      s4Deployment: 'private',
      originalRecommendation: route.recommendedRoute as SignedRouteProject['originalRecommendation'],
      extensibilityRoute: route.recommendedRoute,
      ...extra,
    };
  }

  function addsUp(p: SignedRouteProject, signedScore: number) {
    const report = signedRouteReport({ evidenceReport: evidence, evidenceSourceSha: null, project: p, signedCleanCoreScore: signedScore });
    const gaps = evidence.coverage && !evidence.coverage.complete ? evidence.coverage.gaps.length : 0;
    // As the Analyze page computes its breakdown.
    const breakdown = scoreBreakdown(evidence.findings, gaps, scoreRuleFor('private', signedEngineVersionOf(p)));
    return { report, breakdownAddsUp: breakdown.score === signedScore };
  }

  test('the two rules really give two scores here', () => {
    expect(signedNew.cleanCoreScore).toBe(signedOld.cleanCoreScore + 12);
  });

  test('a Private Edition run signed by 3.0.8 still adds up', () => {
    const p = project(signedOld, { analyzerVersion: OLD });
    const { report, breakdownAddsUp } = addsUp(p, signedOld.cleanCoreScore);
    expect(report).toEqual(signedOld);
    expect(breakdownAddsUp).toBe(true);
  });

  test('so does one whose version only the model card carries', () => {
    const p = project(signedOld, { auditMetadata: { modelCard: { engineVersion: OLD } } as SignedRouteProject['auditMetadata'] });
    const { report, breakdownAddsUp } = addsUp(p, signedOld.cleanCoreScore);
    expect(report).toEqual(signedOld);
    expect(breakdownAddsUp).toBe(true);
  });

  test('a run without an engine version is read by the old rule', () => {
    const p = project(signedOld, {});
    const { report, breakdownAddsUp } = addsUp(p, signedOld.cleanCoreScore);
    expect(report).toEqual(signedOld);
    expect(breakdownAddsUp).toBe(true);
    expect(addsUp(p, signedNew.cleanCoreScore).report).toBeNull();
  });

  test('a run signed by 3.0.9 adds up by the new rule, and only by it', () => {
    const p = project(signedNew, { analyzerVersion: NEW });
    const { report, breakdownAddsUp } = addsUp(p, signedNew.cleanCoreScore);
    expect(report).toEqual(signedNew);
    expect(breakdownAddsUp).toBe(true);
    expect(addsUp(p, signedOld.cleanCoreScore).report).toBeNull();
  });
});
