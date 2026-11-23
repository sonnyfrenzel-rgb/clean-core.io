import { engineVersionAtLeast } from '../score-rule';

/**
 * The engine version gate of release 3.5.0 (roadmap row "3.5.0 — with it: engine and benchmark", version-gated).
 * One reading, in the evidence engine (`lib/abap/evidence-model.ts`, through `readTableDependencies`), and it
 * changes signed findings:
 *
 *   - **a write form that only ABAP SQL has names a database table, whatever the source declares under that name**
 *     (`databaseOnlyWriteForm`, `lib/abap/open-sql-discrimination.ts`; option `databaseWriteForms` of
 *     `readTableDependencies`). Before, only `UPDATE` was read that way; every other write whose target shared its
 *     name with a local data object (`DATA zlog TYPE zlog.`) was taken for an internal-table step. From 3.5.0 the
 *     forms with no internal-table counterpart are writes to the table as well: `DELETE FROM tab`,
 *     `DELETE tab FROM TABLE itab`, `INSERT INTO tab VALUES wa`, `INSERT tab FROM wa` / `FROM TABLE itab` (no `INTO`
 *     in the statement), and `MODIFY tab FROM TABLE itab`. The forms ABAP shares with internal tables
 *     (`MODIFY itab FROM wa`, `DELETE itab FROM idx`, `DELETE itab WHERE …`, `INSERT wa INTO …`) keep the
 *     local-name reading.
 *
 * The process skeleton (`lib/abap/skeleton/effects.ts`) and the call graph (`lib/abap/call-graph.ts`) do not consult
 * this gate; their output is unchanged.
 *
 * A run of an older engine keeps what it signed: whatever rebuilds evidence passes the run's engine version to
 * `buildAbapEvidence`. The reading goes live when `APP_VERSION` (`lib/version.ts`) reaches this version; the frozen
 * digests of every earlier release stay as they are (`tests/engine-frozen-digests.spec.ts`).
 *
 * Pure: no imports beyond the version comparison.
 */
export const ENGINE_READS_350_FROM = '3.5.0';

/** True when a run of this engine version carries the 3.5.0 reading. A missing or unreadable version does not. */
export function engineReads350Apply(engineVersion: string | null | undefined): boolean {
  return engineVersionAtLeast(engineVersion, ENGINE_READS_350_FROM);
}
