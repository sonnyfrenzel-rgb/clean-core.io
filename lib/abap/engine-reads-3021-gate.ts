import { engineVersionAtLeast } from '../score-rule';

/**
 * The engine version from which the readings of the 3.0.21 cycle apply:
 *
 *   - a constant the code filters its reads with or writes into what it creates is a business decision, not
 *     "declared, not used" (`business-rule-set-explain.ts`, `constantUsesOf`);
 *   - the program's writes are read from what the run reaches, with its posting calls and batch input
 *     (`reachable-writes.ts`): the target architecture (`lib/transformation/architecture.ts`) and the
 *     extensibility route (`extensibility-router.ts`) read the same fact;
 *   - an `rfc-call` whose destination is a constant this source declares carries where it goes (`evidence-model.ts`);
 *   - the BPMN reconstruction is drawn at the business level — a routine once, a run of guard checks as one step
 *     (`lib/bpmn/model.ts`, read for the exporter version).
 *
 * Each changes what a run shows or signs, so a run made by an older engine keeps the reading it was made with:
 * whatever rebuilds a run passes that run's engine version (`engineVersionOfProject`). The readings go live when
 * `APP_VERSION` (`lib/version.ts`) reaches this version. Same pattern as `ENGINE_READS_3020_FROM`.
 *
 * Pure: no imports beyond the version comparison.
 */
export const ENGINE_READS_3021_FROM = '3.0.21';

/** True when a run of this engine version carries the 3.0.21 readings. A missing or unreadable version does not. */
export function engineReads3021Apply(engineVersion: string | null | undefined): boolean {
  return engineVersionAtLeast(engineVersion, ENGINE_READS_3021_FROM);
}
