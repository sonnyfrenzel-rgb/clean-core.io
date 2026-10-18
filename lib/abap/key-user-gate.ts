import { engineVersionAtLeast } from '../score-rule';

/**
 * The engine version from which the engine names key-user candidates
 * (roadmap 3.0.19, owner decisions 14.10.2026 and 18.10.2026):
 *
 *   - `buildAbapEvidence` reads the parts of a program SAP's key-user tools
 *     could cover — a custom field, custom logic, a custom CDS view or
 *     analytical query, Adapt UI, a custom business object or configuration —
 *     each with its limit and the lines it replaces, and the parts that stay
 *     code, each with why (`key-user-candidates.ts`, `AbapEvidenceReport.keyUser`);
 *   - the router's key-user checkpoint says what was read instead of being
 *     neutral in every case, the route report carries the reading
 *     (`ExtensibilityRouteReport.keyUser`), and where the whole program is
 *     covered it says that a key-user extension is clean core level A by
 *     construction (`extensibility-router.ts`).
 *
 * Each changes what a rebuilt run shows, so a run made by an older engine keeps
 * what it was signed with: whatever rebuilds a signed run passes that run's
 * engine version. The reading goes live when `APP_VERSION` (`lib/version.ts`)
 * reaches this version. Same pattern as `ENGINE_READS_FROM`.
 *
 * Pure: no imports beyond the version comparison.
 */
export const KEY_USER_FROM = '3.0.19';

/** True when a run of this engine version names key-user candidates. A missing or unreadable version does not. */
export function keyUserApplies(engineVersion: string | null | undefined): boolean {
  return engineVersionAtLeast(engineVersion, KEY_USER_FROM);
}
