import { engineVersionAtLeast } from '../score-rule';

/**
 * The engine version from which the readings and corrections of the 3.0.21
 * cycle apply.
 *
 * "First insights becomes the strongest page" (owner decisions 22.10.2026):
 *
 *   - a check or a stop on a raw field is said with the program's own message
 *     text on that branch, or left out of the business line and counted
 *     (`lib/abap/branch-messages.ts`, `lib/process-story.ts`);
 *   - loops and set-up steps are not steps of the business story; a stop is
 *     said once, without its message code;
 *   - the purpose the program's names support is wider (approval, priority,
 *     extraction …) and shown whenever it exists (`lib/abap/program-domain.ts`,
 *     `lib/program-summary-text.ts`);
 *   - the header's title line is read as the author's claim
 *     (`lib/program-summary-facts.ts`);
 *   - "What it decides" lists the rules of the business basket, the same
 *     classification the basket line counts (`lib/first-look-plain.ts`).
 *
 * Includes and macros (owner decision 22.10.2026):
 *
 *   - a macro is named where it is used, not only where it is defined
 *     (`assessCoverage`, option `macroUsesNamed`, `coverage.ts`).
 *
 * Engine and transformation (owner decisions 22.10.2026):
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
 * Each changes what the Business view, the Documentation, the analysis prompt
 * or a signed run reads, so a project of an older engine keeps its reading:
 * whatever rebuilds one passes its engine version (`engineVersionOfProject`).
 * The readings go live when `APP_VERSION` (`lib/version.ts`) reaches this
 * version. Same pattern as `ENGINE_READS_3020_FROM`.
 *
 * Pure: no imports beyond the version comparison.
 */
export const ENGINE_READS_3021_FROM = '3.0.21';

/** True when a run of this engine version carries the 3.0.21 readings. A missing or unreadable version does not. */
export function engineReads3021Apply(engineVersion: string | null | undefined): boolean {
  return engineVersionAtLeast(engineVersion, ENGINE_READS_3021_FROM);
}
