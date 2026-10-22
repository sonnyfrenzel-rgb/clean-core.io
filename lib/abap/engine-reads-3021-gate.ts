import { engineVersionAtLeast } from '../score-rule';

/**
 * The engine version from which the corrections of the 3.0.21 cycle apply:
 *
 *   - a macro is named where it is used, not only where it is defined
 *     (`assessCoverage`, option `macroUsesNamed`, `coverage.ts`).
 *
 * Each changes what a run signs, so a run made by an older engine keeps the
 * evidence it was signed with: whatever rebuilds a signed run passes that run's
 * engine version (`engineVersionOfProject`). The corrections go live when
 * `APP_VERSION` (`lib/version.ts`) reaches this version. Same pattern as
 * `ENGINE_READS_3020_FROM`.
 *
 * Pure: no imports beyond the version comparison.
 */
export const ENGINE_READS_3021_FROM = '3.0.21';

/** True when a run of this engine version carries the corrections. A missing or unreadable version does not. */
export function engineReads3021Apply(engineVersion: string | null | undefined): boolean {
  return engineVersionAtLeast(engineVersion, ENGINE_READS_3021_FROM);
}
