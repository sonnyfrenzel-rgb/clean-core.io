import { engineVersionAtLeast } from '../score-rule';

/**
 * The engine version gate of release 3.5.0 (roadmap row "3.5.0 — with it: engine and benchmark", version-gated).
 *
 * Two readings in the evidence engine (`lib/abap/evidence-model.ts`, through `readTableDependencies`); both change
 * signed findings:
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
 *   - **a method's formal parameters are read in the definition that declares the method** (option
 *     `declaringDefinition` of `readTableDependencies`, `declaringParameters` in `table-dependencies.ts`): an
 *     implementation `zif_x~m` reads interface `zif_x`, a redefinition or an inherited method the superclass chain.
 *     Before, both fell back to every `METHODS m` of the source, so a same-named parameter of an unrelated class hid
 *     a global constant used as a dynamic table name, and the write it closes went unreported. A declaring
 *     definition that is not in the source keeps the lookup of the engines before.
 *
 * Six readings in the process skeleton (`lib/abap/process-skeleton.ts`, `SkeletonReadings.reads350`); they change
 * the map, the rules and the story read off it, never a signed finding:
 *
 *   - **`sy-tabix` with its own polarity** in the technical-gateway fold (`conditionAsserts`,
 *     `skeleton/technical-gateways.ts`): `sy-tabix = 0` found no row, `sy-tabix > 0` found one. Before, it was read
 *     like `sy-subrc`, and the arm that found a row was hung on the boundary event as the failure.
 *   - **a `WAIT UNTIL` joins only the tasks it waits for** (`WalkReaders.waitJoins`): the join of a parallel group
 *     is drawn when every task names a callback `FORM` that writes a field the condition reads. Before, any
 *     `WAIT UNTIL` behind the calls was the join of every task.
 *   - **an ALV `IT_EVENTS` row filled only after the call is not its callback** (`filledAfterCall`,
 *     `skeleton/walk/callbacks.ts`): a fill is lifted through the `PERFORM`s of its form to the call's routine, and a
 *     fill that runs only behind the call registers nothing. Source order alone decides nothing: the table is often
 *     filled in a form written below the call and performed before it.
 *   - **`PERFORM … ON COMMIT` / `ON ROLLBACK` runs where the unit of work ends** (`walkLuwEnd`, `notePendingLuwForms`,
 *     `skeleton/walk/calls.ts`): the form is drawn at the next walked `COMMIT WORK` / `ROLLBACK WORK`, anchored at its
 *     `PERFORM` with `detail.runsAt`; one no walked statement runs is a `commit-boundary` note. Before, it was drawn
 *     at the `PERFORM`, as an immediate step before the writes that precede the commit.
 *   - **`LEAVE PROGRAM` is a normal end of the run** (`walkStatement`, `detail.leaveProgram`), not an error end.
 *   - **a `CALL SCREEN n` names the dialog modules of screen n** (`linkScreenModules`, `skeleton/screen-modules.ts`):
 *     `detail.screenModules` on the user task and `detail.screen` on each module's start, by SAP's naming convention
 *     (the screen number in the module name). Before, the user task stood apart from the modules it shows.
 *
 * The call graph (`lib/abap/call-graph.ts`, with `callback-registrations.ts`) does not consult this gate; its output
 * is unchanged.
 *
 * A run of an older engine keeps what it signed and the map it drew: whatever rebuilds evidence passes the run's
 * engine version to `buildAbapEvidence`, whatever draws a map passes it to `buildProcessSkeleton`. The readings go
 * live when `APP_VERSION` (`lib/version.ts`) reaches this version; the frozen digests of every earlier release stay
 * as they are (`tests/engine-frozen-digests.spec.ts`, `tests/skeleton-frozen-digests.spec.ts`). Repro specs:
 * `tests/engine-350-database-write-forms.spec.ts`, `tests/engine-350-method-parameters.spec.ts`,
 * `tests/engine-350-skeleton-readings.spec.ts`.
 *
 * Pure: no imports beyond the version comparison.
 */
export const ENGINE_READS_350_FROM = '3.5.0';

/** True when a run of this engine version carries the 3.5.0 reading. A missing or unreadable version does not. */
export function engineReads350Apply(engineVersion: string | null | undefined): boolean {
  return engineVersionAtLeast(engineVersion, ENGINE_READS_350_FROM);
}
