/**
 * The scale of the complexity and criticality scores, said once (roadmap 3.0.21, external code audit of 22.10.2026).
 *
 * `computeComplexityScore` and `computeCriticalityScore` (`lib/abap/code-assessment.ts`) return 1–10, but the audit
 * pack's executive summary and the board deck printed them as "/100", and the deck judged them against 70, 40 and 60
 * — thresholds a 1–10 score never reaches, so every project read "Localized Impact" and no complexity risk row was
 * ever written. The clean core score stays on its own 0–100 scale.
 *
 * An audit pack signs the bytes of each file under its own manifest, so a pack issued before keeps "/100" and still
 * verifies (verification compares each file with the digest its manifest recorded, as for the title change of
 * 01.10.2026, `tests/audit-pack-title.spec.ts`); packs issued from now on print "/10". Pure.
 */

/** The top of the complexity and criticality scale. */
export const TEN_POINT_MAX = 10;

/** "7/10", or "—" where the score was not measured. */
export function formatTenPointScore(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value}/${TEN_POINT_MAX}` : '—';
}

/** The deck's thresholds on the 1–10 complexity score: above 7 high, above 4 moderate; risk row above 6. */
export const COMPLEXITY_HIGH = 7;
export const COMPLEXITY_MODERATE = 4;
export const COMPLEXITY_RISK = 6;
