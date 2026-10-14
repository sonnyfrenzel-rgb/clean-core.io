import { engineVersionAtLeast } from '../score-rule';

/**
 * The engine version from which a finding in code no run reaches carries the
 * mark `unreachable` (roadmap 3.0.13, SD review of 14.10.2026, CR-A6).
 *
 * The score stays conservative: such a finding still costs its points — the
 * code is shipped, and a constant is one edit away from opening it — but the
 * evidence says which findings stand behind a constant gate
 * (`constant-gates.ts`), so the deduction table can label them instead of
 * presenting reads the program never makes as reads it makes.
 *
 * The mark is part of the findings a run signs, so a run of an older engine
 * keeps the findings it was signed with: whatever rebuilds the evidence of a
 * signed run passes that run's engine version and gets no mark. Same pattern as
 * `GUIDELINE_CHECKS_FROM`. Goes live when `APP_VERSION` reaches this version.
 *
 * Pure: no imports beyond the version comparison.
 */
export const UNREACHABLE_CODE_FROM = '3.0.13';

/** True when a run of this engine version marks findings in unreachable code. A missing or unreadable version does not. */
export function unreachableCodeMarked(engineVersion: string | null | undefined): boolean {
  return engineVersionAtLeast(engineVersion, UNREACHABLE_CODE_FROM);
}
