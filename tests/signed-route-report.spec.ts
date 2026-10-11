/**
 * The rule that decides whether the Analyze page may draw the route's drivers,
 * assumptions and the usage × risk matrix from a recomputed router report
 * (`lib/signed-route-report.ts`, QA review of e8a1245626f4, d9993476ee4e).
 *
 * It used to live inline in the page and was guarded only by reading the
 * page's source. Here it runs: the report is returned only for the evidence of
 * the source the run signed, and only when it arrives at the route and the
 * score the run signed.
 *
 * Serverless: pure functions over text.
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { buildAbapEvidence } from '../lib/abap/evidence-model';
import { routeExtensibility } from '../lib/abap/extensibility-router';
import { IN_APP_ROUTE, SIDE_BY_SIDE_ROUTE } from '../lib/sap-naming';
import { signedRecommendationOf, signedRouteReport, type SignedRouteProject } from '../lib/signed-route-report';

const ROOT = path.resolve(__dirname, '..');
const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);

const PROGRAM = [
  'REPORT zcc_signed_route.',
  'DATA lt_mara TYPE STANDARD TABLE OF mara.',
  'SELECT * FROM mara INTO TABLE lt_mara UP TO 10 ROWS.',
  "UPDATE mara SET mtart = 'FERT' WHERE matnr = '4711'.",
  "CALL FUNCTION 'POPUP_TO_CONFIRM'.",
].join('\n');

const evidence = buildAbapEvidence(PROGRAM, 'zcc_signed_route.abap', 'private');
const privateRoute = routeExtensibility(evidence, 'private');
const publicRoute = routeExtensibility(evidence, 'public');

/** A project as the run signed it for `route`, with the source fingerprint `sha`. */
function signedProject(route = privateRoute, sha: string | null = SHA_A, extra: Partial<SignedRouteProject> = {}): SignedRouteProject {
  return {
    s4Deployment: 'private',
    originalRecommendation: route.recommendedRoute as SignedRouteProject['originalRecommendation'],
    extensibilityRoute: route.recommendedRoute,
    auditMetadata: sha === null ? undefined : ({ inputFingerprint: { sha256: sha } } as SignedRouteProject['auditMetadata']),
    ...extra,
  };
}

test.describe('signedRouteReport', () => {
  test('nothing to draw from without evidence or without a project', () => {
    expect(signedRouteReport({ evidenceReport: null, evidenceSourceSha: SHA_A, project: signedProject(), signedCleanCoreScore: privateRoute.cleanCoreScore })).toBeNull();
    expect(signedRouteReport({ evidenceReport: undefined, evidenceSourceSha: SHA_A, project: signedProject(), signedCleanCoreScore: privateRoute.cleanCoreScore })).toBeNull();
    expect(signedRouteReport({ evidenceReport: evidence, evidenceSourceSha: SHA_A, project: null, signedCleanCoreScore: privateRoute.cleanCoreScore })).toBeNull();
    expect(signedRouteReport({ evidenceReport: evidence, evidenceSourceSha: SHA_A, project: undefined, signedCleanCoreScore: privateRoute.cleanCoreScore })).toBeNull();
  });

  test('the evidence of the signed source, at the signed route and score, gives the router report', () => {
    const report = signedRouteReport({ evidenceReport: evidence, evidenceSourceSha: SHA_A, project: signedProject(), signedCleanCoreScore: privateRoute.cleanCoreScore });
    expect(report).toEqual(privateRoute);
  });

  test('evidence of another source is not drawn from, even at the same route and score (QA ae68c0b99961)', () => {
    expect(signedRouteReport({ evidenceReport: evidence, evidenceSourceSha: SHA_B, project: signedProject(), signedCleanCoreScore: privateRoute.cleanCoreScore })).toBeNull();
  });

  test('evidence whose source is unknown is not drawn from when the run signed one', () => {
    expect(signedRouteReport({ evidenceReport: evidence, evidenceSourceSha: null, project: signedProject(), signedCleanCoreScore: privateRoute.cleanCoreScore })).toBeNull();
    expect(signedRouteReport({ evidenceReport: evidence, evidenceSourceSha: undefined, project: signedProject(), signedCleanCoreScore: privateRoute.cleanCoreScore })).toBeNull();
  });

  test('a run that recorded no source fingerprint falls back to route and score alone', () => {
    for (const project of [signedProject(privateRoute, null), signedProject(privateRoute, ''), signedProject(privateRoute, SHA_A, { auditMetadata: {} as SignedRouteProject['auditMetadata'] })]) {
      expect(signedRouteReport({ evidenceReport: evidence, evidenceSourceSha: null, project, signedCleanCoreScore: privateRoute.cleanCoreScore })).toEqual(privateRoute);
      expect(signedRouteReport({ evidenceReport: evidence, evidenceSourceSha: SHA_B, project, signedCleanCoreScore: privateRoute.cleanCoreScore })).toEqual(privateRoute);
    }
  });

  test('a score other than the signed one is not drawn from', () => {
    expect(signedRouteReport({ evidenceReport: evidence, evidenceSourceSha: SHA_A, project: signedProject(), signedCleanCoreScore: privateRoute.cleanCoreScore - 1 })).toBeNull();
    expect(signedRouteReport({ evidenceReport: evidence, evidenceSourceSha: SHA_A, project: signedProject(), signedCleanCoreScore: null })).toBeNull();
  });

  test('a route other than the signed one is not drawn from', () => {
    const other = privateRoute.recommendedRoute === SIDE_BY_SIDE_ROUTE ? IN_APP_ROUTE : SIDE_BY_SIDE_ROUTE;
    const project = signedProject(privateRoute, SHA_A, { originalRecommendation: other as SignedRouteProject['originalRecommendation'], extensibilityRoute: other });
    expect(signedRouteReport({ evidenceReport: evidence, evidenceSourceSha: SHA_A, project, signedCleanCoreScore: privateRoute.cleanCoreScore })).toBeNull();
    // No recommendation recorded at all
    const none = signedProject(privateRoute, SHA_A, { originalRecommendation: undefined, extensibilityRoute: undefined });
    expect(signedRouteReport({ evidenceReport: evidence, evidenceSourceSha: SHA_A, project: none, signedCleanCoreScore: privateRoute.cleanCoreScore })).toBeNull();
  });

  test('the signed recommendation wins over a route switched afterwards', () => {
    const other = privateRoute.recommendedRoute === SIDE_BY_SIDE_ROUTE ? IN_APP_ROUTE : SIDE_BY_SIDE_ROUTE;
    const switched = signedProject(privateRoute, SHA_A, { extensibilityRoute: other });
    expect(signedRouteReport({ evidenceReport: evidence, evidenceSourceSha: SHA_A, project: switched, signedCleanCoreScore: privateRoute.cleanCoreScore })).toEqual(privateRoute);
  });

  test('without a readable signed recommendation the stored route is compared', () => {
    for (const originalRecommendation of [undefined, 'retire', 'integration']) {
      const project = signedProject(privateRoute, SHA_A, { originalRecommendation: originalRecommendation as SignedRouteProject['originalRecommendation'] });
      expect(signedRouteReport({ evidenceReport: evidence, evidenceSourceSha: SHA_A, project, signedCleanCoreScore: privateRoute.cleanCoreScore })).toEqual(privateRoute);
    }
  });

  test('an older client\'s cap / rap is read as the route it stands for', () => {
    const legacy = privateRoute.recommendedRoute === SIDE_BY_SIDE_ROUTE ? 'cap' : 'rap';
    const project = signedProject(privateRoute, SHA_A, { originalRecommendation: legacy, extensibilityRoute: undefined });
    expect(signedRouteReport({ evidenceReport: evidence, evidenceSourceSha: SHA_A, project, signedCleanCoreScore: privateRoute.cleanCoreScore })).toEqual(privateRoute);
  });

  test('the router runs with the run\'s deployment: public only when the project says public', () => {
    const asPublic = signedProject(publicRoute, SHA_A, { s4Deployment: 'public' });
    expect(signedRouteReport({ evidenceReport: evidence, evidenceSourceSha: SHA_A, project: asPublic, signedCleanCoreScore: publicRoute.cleanCoreScore })).toEqual(publicRoute);
    const unset = signedProject(privateRoute, SHA_A, { s4Deployment: undefined });
    expect(signedRouteReport({ evidenceReport: evidence, evidenceSourceSha: SHA_A, project: unset, signedCleanCoreScore: privateRoute.cleanCoreScore })).toEqual(privateRoute);
  });

  test('a public run is not matched against the private router\'s answer', () => {
    // Only meaningful when the two deployments answer differently for this source.
    expect(publicRoute.cleanCoreScore !== privateRoute.cleanCoreScore || publicRoute.recommendedRoute !== privateRoute.recommendedRoute, 'the fixture distinguishes the deployments').toBe(true);
    const publicProjectPrivateFacts = signedProject(privateRoute, SHA_A, { s4Deployment: 'public' });
    expect(signedRouteReport({ evidenceReport: evidence, evidenceSourceSha: SHA_A, project: publicProjectPrivateFacts, signedCleanCoreScore: privateRoute.cleanCoreScore })).toBeNull();
  });
});

test.describe('signedRecommendationOf', () => {
  test('reads the stored route and an older client\'s cap / rap, nothing else', () => {
    expect(signedRecommendationOf(SIDE_BY_SIDE_ROUTE)).toBe(SIDE_BY_SIDE_ROUTE);
    expect(signedRecommendationOf(IN_APP_ROUTE)).toBe(IN_APP_ROUTE);
    expect(signedRecommendationOf(`  ${IN_APP_ROUTE} `)).toBe(IN_APP_ROUTE);
    expect(signedRecommendationOf('cap')).toBe(SIDE_BY_SIDE_ROUTE);
    expect(signedRecommendationOf('rap')).toBe(IN_APP_ROUTE);
    for (const value of ['retire', 'integration', 'event', '', 'CAP', null, undefined, 42, {}]) {
      expect(signedRecommendationOf(value)).toBeNull();
    }
  });
});

test('the Analyze page decides its route report with this rule, not a copy of it', () => {
  const page = fs.readFileSync(path.resolve(ROOT, 'app/(app)/project/[projectId]/analyze/page.tsx'), 'utf8');
  expect(page).toContain("import { signedRecommendationOf, signedRouteReport } from '@/lib/signed-route-report';");
  expect(page.match(/signedRouteReport\(/g) ?? []).toHaveLength(1);
  expect(page).toMatch(/const routeReport = useMemo\(\s*\(\) => signedRouteReport\(\{ evidenceReport, evidenceSourceSha, project, signedCleanCoreScore \}\),/);
  expect(page, 'no second, inline copy of the rule').not.toContain('inputFingerprint?.sha256');
  expect(page).not.toMatch(/function signedRecommendationOf/);
  const lib = fs.readFileSync(path.resolve(ROOT, 'lib/signed-route-report.ts'), 'utf8');
  expect(lib, 'pure: a spec can import it').not.toMatch(/from ['"](?:firebase|@\/lib\/firebase|\.\/firebase)/);
});
