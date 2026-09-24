import type { ExtensibilityRouteReport } from '@/lib/abap/extensibility-router';

/**
 * The fields of a model's analysis JSON that the signed run owns.
 *
 * The model is asked for the same fields and sometimes answers with its own
 * numbers. Kept beside the signed ones they become a second, unsigned truth
 * that the screen prints as if it were the run's (QA review of 33471220d6e9,
 * e184fc0c59bf; QA full review of 81810c8, d5a87a5db395).
 *
 * `/api/runs/create` does the same to the copy it signs and stores; this is the
 * browser's copy, shown between the run and the next load. Both end with the
 * router's recommendation, confidence, rationale and target in
 * `extensibilityRouting`, whatever the model wrote there.
 *
 * Pure and import-free apart from a type, so a spec can call it.
 */
const MODEL_MUST_NOT_OWN = ['cleanCoreScore', 'complexityScore', 'criticalityScore'] as const;

export function pinRunOwnedFields(
  obj: Record<string, unknown>,
  routeReport: Pick<ExtensibilityRouteReport, 'recommendedRoute' | 'confidenceScore' | 'rationale' | 'targetArtifact'>,
): Record<string, unknown> {
  for (const owned of MODEL_MUST_NOT_OWN) delete obj[owned];
  const existing = obj.extensibilityRouting;
  const routing: Record<string, unknown> =
    existing && typeof existing === 'object' && !Array.isArray(existing) ? (existing as Record<string, unknown>) : {};
  routing.recommendedRoute = routeReport.recommendedRoute;
  routing.confidenceScore = routeReport.confidenceScore;
  routing.rationale = routeReport.rationale;
  routing.targetArtifact = routeReport.targetArtifact;
  obj.extensibilityRouting = routing;
  return obj;
}
