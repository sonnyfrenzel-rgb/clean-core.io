import { engineVersionAtLeast } from '../score-rule';

/**
 * The engine version from which the engine says only what it read (roadmap
 * 3.0.18 item 4):
 *
 *   - a constant gate stops a routine only where it is reached on every path
 *     through it: a gate inside another block (an `IF`, a loop, a `TRY`) locks
 *     away the rest of that block, never the rest of the routine, and a `RAISE`
 *     inside a `TRY` ends nothing a `CATCH` may take up; a FORM or method
 *     parameter of the constant's name shadows it (`constant-gates.ts`);
 *   - the server's date and time decide under `IS [NOT] INITIAL` and through a
 *     plain copy (`lv_date = sy-datum.`); a hook is delegated only when every
 *     statement in it is a call of the class or object it hands its work to;
 *     a `CO_` class is a consumer proxy only where a `TRY` that catches a proxy
 *     fault uses it; a proxy class the source only defines is not said to be
 *     called (`engine-rules.ts`, `evidence-model.ts`);
 *   - a second CDS view with a BOPF annotation is reported beside the first
 *     (`legacy-technology.ts`);
 *   - a file-picker dialog is a path selection, not an upload or a download
 *     (`evidence-model.ts`);
 *   - a constant names a function module only where a dynamic `CALL FUNCTION`
 *     uses it; `PRD`, `CLNT` and `SYS` at the front of a literal are a system
 *     name only where no letter follows; credit words are read in the code and
 *     the called module's name, not in other literals (`evidence-model.ts`);
 *   - the security review: a file-name validation with `EXCEPTIONS` covers a
 *     path only when its failure cannot reach the access, `INSERT REPORT` with a
 *     literal name is a generated program, and a clean overwrite of the very
 *     component a dynamic clause reads clears it (`security-review.ts`).
 *
 * Each changes what a run signs, so a run made by an older engine keeps the
 * evidence it was signed with: whatever rebuilds a signed run passes that run's
 * engine version (`engineVersionOfProject`). The corrections go live when
 * `APP_VERSION` (`lib/version.ts`) reaches this version. Same pattern as
 * `PRECISION_FIXES_FROM`.
 *
 * Pure: no imports beyond the version comparison.
 */
export const ENGINE_READS_FROM = '3.0.18';

/** True when a run of this engine version carries the corrections. A missing or unreadable version does not. */
export function engineReadsApply(engineVersion: string | null | undefined): boolean {
  return engineVersionAtLeast(engineVersion, ENGINE_READS_FROM);
}
