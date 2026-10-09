/**
 * A usage count counts only when it is a finite number and not negative
 * (roadmap 3.0.6, left open by the 3.0.5 QA loop).
 *
 * The parser rejects a negative count and keeps an absent one as `null`
 * (`lib/abap/usage-parser.ts`), but a stored report can be older or
 * hand-edited: `NaN`, `Infinity`, `-3` or a string can sit where the count is.
 * Read as a number, `-3 > 0` is false and `NaN < 395` is false — so a broken
 * count turned into "zero executions" or "unused long enough to retire".
 * Anything that is not a measured count is no measurement: `null`.
 */
export function measuredCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}
