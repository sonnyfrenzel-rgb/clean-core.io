import { engineVersionAtLeast } from '../score-rule';

/**
 * The engine version gate of release 3.4.0, the engine release (owner decision 22.11.2026; roadmap row
 * "3.4.0 — the engine release", item (2); engine review ER-03). One reading, in the evidence engine
 * (`lib/abap/evidence-model.ts`), and it changes signed findings:
 *
 *   - **the class gap is closed.** Every SAP class, interface and exception class the source names — `TYPE REF TO`,
 *     `x=>m`, `NEW x( )`, `CAST x( )`, `CREATE OBJECT … TYPE x`, `INHERITING FROM`, `INTERFACES`, `CATCH`,
 *     `RAISE EXCEPTION TYPE`, `RAISING`, written as a name (never a name resolved from a variable) — and that SAP's synced files grade at level C or D
 *     (`gradeSapObject`, `lib/abap/catalog-service.ts`) becomes **one finding per object**, kind
 *     `unreleased-class`, listing every line it stands on (`lines`). The names come from the L4 reference table
 *     (`lib/engine4/references.ts`, read through `sap-class-references.ts`; ADR-141 extends ADR-133 for it).
 *     A name the source defines itself, a customer name, any name read from a variable (static references only), and an object
 *     another finding of the same run already names are left out. Before, the engine named 7 of 925 such
 *     references in the corpus. The finding costs no score points; on the ABAP Cloud route it is rework on-stack
 *     (`extensibility-router.ts`, `ON_STACK_REWORK`), like an unreleased function module.
 *
 * The DDIC types the catalog grades are not findings: the IT view groups them by level (`lib/it-findings-build.ts`,
 * `ddicTypes`), display only and never signed.
 *
 * A run of an older engine keeps what it signed: whatever rebuilds evidence passes the run's engine version to
 * `buildAbapEvidence` and `routeExtensibility`. The reading goes live when `APP_VERSION` (`lib/version.ts`) reaches
 * this version; the frozen digests of every earlier release stay as they are (`tests/engine-frozen-digests.spec.ts`).
 *
 * Pure: no imports beyond the version comparison.
 */
export const ENGINE_READS_340_FROM = '3.4.0';

/** True when a run of this engine version carries the 3.4.0 reading. A missing or unreadable version does not. */
export function engineReads340Apply(engineVersion: string | null | undefined): boolean {
  return engineVersionAtLeast(engineVersion, ENGINE_READS_340_FROM);
}
