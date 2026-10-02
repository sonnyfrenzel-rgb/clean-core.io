/**
 * Whether the generated suite of a project can run here at all — one rule for
 * the Testing page (what it offers) and the execution hook (what it sends).
 *
 * Pure, no imports.
 *
 * The isolated runner (`runner/`, SECURITY.md §7) executes node:test over the
 * generated JavaScript/TypeScript package. On the ABAP Cloud route the testing
 * model writes an ABAP Unit test class against generated ABAP: there is no
 * ABAP system behind this product, so nothing can compile or execute it. Until
 * 02.10.2026 the hook answered a click on "Run" for that route with a run it
 * made up in the browser — every case `Simulated`, no request to any server —
 * and the page reported "10 of 10 produced no result", which reads as a runner
 * that failed. The honest answer is that there is no run, said before the
 * click and not after it.
 */

/** The project's route puts the code on the ABAP stack (RAP), so its suite is ABAP Unit. */
export function isAbapUnitRoute(project: { extensibilityRoute?: string | null } | null | undefined): boolean {
  return (project?.extensibilityRoute || '').includes('ABAP Cloud');
}

/** Why an ABAP Unit suite gets no run here — shown where the run would be offered, and by the hook if asked anyway. */
export const ABAP_UNIT_NOT_RUNNABLE =
  'ABAP Unit test classes run only inside an ABAP system. The isolated runner here executes JavaScript and TypeScript, so these scenarios are not run here — run the class in ADT on your own development system.';
