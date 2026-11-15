import { engineVersionAtLeast } from '../score-rule';

/**
 * The engine version gate of release 3.2.0 — the readings of the engine night of 13.11.2026, developed on the
 * learning halves of the process benchmark and measured once on its test halves
 * (`docs/prozess-benchmark/BERICHT.md`). Deterministic only, all in `lib/abap/process-skeleton.ts` and
 * `lib/abap/method-resolution.ts`:
 *
 *   - **a call the source cannot resolve statically draws every implementation it can reach.** An interface
 *     reference with several implementing classes, a superclass reference whose method a subclass redefines,
 *     and — new — `me->m( )` or a bare `m( )` on a method a subclass of the own class redefines, dispatch at run
 *     time. The call stays an opaque call (D2: the reader does not guess which one runs) and now names its
 *     candidates (`detail.candidates`); each candidate implementation that no other call of the source reaches is
 *     an entry of its own, with the call site as its trigger (`methodEntries`, trigger `candidate`). Before, the
 *     implementations of a strategy, state or template-method pattern were neither drawn nor listed as not
 *     reached: they vanished from the map.
 *   - **AB-15b: interface calls are resolved to the program's own implementations** (`class-hierarchy.ts`). The reading
 *     uses the reference's static type where the program writes it: a factory's return type, a loop over a table of
 *     references, the routine's own declaration, interface composition. An abstract class is never the object. A
 *     typed call with two to four implementations is drawn as its alternatives: a gateway plus one call activity per
 *     class (`walkAlternatives`).
 *
 * Rule ids and rule count do not change. A run of an older engine keeps its map: whatever rebuilds one passes its
 * engine version (`engineVersionOfProject`) to `buildProcessSkeleton`, or holds a skeleton of this release and asks
 * `skeletonReadFor`. The readings go live when `APP_VERSION` (`lib/version.ts`) reaches this version. Same pattern
 * as `ENGINE_READS_310_FROM`: hotfixes 3.0.2x and the 3.1.x releases keep reading as before.
 *
 * **Evidence engine** (QA full review of v3.1.0, `lib/abap/evidence-model.ts`) — these change signed findings:
 *
 *   - **a credential assigned from a backtick literal or a string template is redacted** (`redactCredentials`):
 *     `DATA(lv_password) = |…|` and `` lv_token = `…` `` print the secret no more than `'…'` did. A template is
 *     redacted whole, embedded expressions included.
 *   - **a copied function-module name stops at an overwrite** (`dynamicCallNames`): `lv_fm = c_gui.` followed on
 *     the straight line by another write of `lv_fm` before any call of it no longer makes `c_gui` a called module.
 *
 * Pure: no imports beyond the version comparison.
 */
export const ENGINE_READS_320_FROM = '3.2.0';

/** True when a run of this engine version carries the 3.2.0 readings. A missing or unreadable version does not. */
export function engineReads320Apply(engineVersion: string | null | undefined): boolean {
  return engineVersionAtLeast(engineVersion, ENGINE_READS_320_FROM);
}
