/**
 * The router's report for the signed run's evidence (audit M-1, 10.10.2026) —
 * the rule the Analyze page uses to decide whether it may draw the route's
 * drivers, assumptions and the usage × risk matrix from a recomputed report.
 *
 * Pure and free of Firebase so a spec can call it (QA review of e8a1245626f4,
 * d9993476ee4e): it used to live inline in the page and was guarded only by
 * reading the page's source.
 *
 * The report is recomputed from the evidence the server read for the signed
 * run, with the run's deployment, and returned only when it arrives at the
 * route and the score that run signed — the same "adds up" rule as the score's
 * deductions — and when the evidence is of the source the run signed: a
 * source changed since can arrive at the same route and score with other
 * drivers (QA ae68c0b99961). Otherwise it is `null`, which the page says as
 * "differs" in the route card, and nothing is drawn from it.
 */
import type { AbapEvidenceReport } from './abap/evidence-model';
import { routeExtensibility, type ExtensibilityRouteReport } from './abap/extensibility-router';
import { IN_APP_ROUTE, SIDE_BY_SIDE_ROUTE } from './sap-naming';
import { signedEngineVersionOf } from './score-rule';
import type { Project } from './types';

/**
 * The route the run recommended, as `/api/runs/create` signed it
 * (`originalRecommendation`). Runs record the route itself; a project an
 * older client wrote may hold `cap` / `rap`. Anything else is not read as a
 * route.
 */
export function signedRecommendationOf(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (v === 'cap' || v === SIDE_BY_SIDE_ROUTE) return SIDE_BY_SIDE_ROUTE;
  if (v === 'rap' || v === IN_APP_ROUTE) return IN_APP_ROUTE;
  return null;
}

/** The fields of the project the rule reads. */
export type SignedRouteProject = Pick<
  Project,
  's4Deployment' | 'originalRecommendation' | 'extensibilityRoute' | 'auditMetadata' | 'analyzerVersion'
>;

export interface SignedRouteReportInput {
  /** The evidence the server read for the signed run, or null while it is not there. */
  evidenceReport: AbapEvidenceReport | null | undefined;
  /** SHA-256 of the source that evidence was built from, or null when unknown. */
  evidenceSourceSha: string | null | undefined;
  project: SignedRouteProject | null | undefined;
  /** The Clean Core Score the run signed, or null when there is none. */
  signedCleanCoreScore: number | null;
}

export function signedRouteReport({
  evidenceReport,
  evidenceSourceSha,
  project,
  signedCleanCoreScore,
}: SignedRouteReportInput): ExtensibilityRouteReport | null {
  if (!evidenceReport || !project) return null;
  const deployment = project.s4Deployment === 'public' ? 'public' : 'private';
  // With the run's own engine version, so a run signed before 3.0.9 is scored
  // by the rule it was signed with and still adds up (lib/score-rule.ts).
  const derived = routeExtensibility(evidenceReport, deployment, signedEngineVersionOf(project));
  const recommended = signedRecommendationOf(project.originalRecommendation) ?? project.extensibilityRoute ?? null;
  // The evidence has to be of the source the run signed: a source changed
  // since can arrive at the same route and score with other drivers
  // (QA ae68c0b99961).
  const signedSourceSha = project.auditMetadata?.inputFingerprint?.sha256;
  const sameSource = !signedSourceSha || evidenceSourceSha === signedSourceSha;
  const addsUp = sameSource && derived.recommendedRoute === recommended && derived.cleanCoreScore === signedCleanCoreScore;
  return addsUp ? derived : null;
}
