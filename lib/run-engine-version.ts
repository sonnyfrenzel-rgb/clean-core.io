import { signedEngineVersionOf } from '@/lib/score-rule';
import { APP_VERSION } from '@/lib/version';

/**
 * The engine version to rebuild a project's evidence and route with
 * (roadmap 3.0.12).
 *
 * Every engine change that alters what a run signs is gated on the engine
 * version (`GUIDELINE_CHECKS_FROM`, `ON_STACK_CONSTRUCTS_FROM`,
 * `GUI_FILE_NO_ROUTE_DRIVER_FROM`, `OWN_TABLE_WRITES_FREE_FROM`,
 * `PRECISION_FIXES_FROM`), so a run
 * signed by an older engine re-renders exactly what it signed. Whatever
 * rebuilds the evidence or the route of an existing project therefore passes
 * the version this returns:
 *
 *   - the signed run's own version (`signedEngineVersionOf`: the run's
 *     `analyzerVersion`, else the model card's copy on the project document);
 *   - `null` for a project that has a run but no stamp — a run signed before
 *     the stamp existed, which the gates read as the oldest engine;
 *   - `APP_VERSION` for a project with no run at all: there is nothing signed
 *     to stay faithful to, and what the screen shows is what a run made now
 *     would sign.
 *
 * A caller that produces a new run passes `APP_VERSION` itself.
 */
export function engineVersionOfProject(project: object | null | undefined): string | null {
  // A hydrated `Project` and a raw project document (`Record<string, unknown>`)
  // both arrive here; the fields are read as unknowns either way.
  const p = (project ?? null) as {
    activeRunId?: unknown;
    analyzerVersion?: unknown;
    auditMetadata?: { modelCard?: { engineVersion?: unknown } | null } | null;
  } | null;
  const signed = signedEngineVersionOf(p);
  if (signed) return signed;
  const card = p?.auditMetadata && typeof p.auditMetadata === 'object' ? p.auditMetadata.modelCard : undefined;
  const hasRun =
    (typeof p?.activeRunId === 'string' && p.activeRunId.trim() !== '') ||
    (card !== undefined && card !== null);
  return hasRun ? null : APP_VERSION;
}
