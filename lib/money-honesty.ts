/**
 * No amount of money without approved cost assumptions (roadmap step 0.4) — for prose as well as fields.
 *
 * Step 0.4 removed every money field from the analysis and every currency formatter outside Economics. Prose
 * was left: a model can still write "Projected annual savings: €5,000" into a value driver, an action plan or
 * the summary, and an analysis stored before 0.4 already carries such sentences. The Analyze stage, the
 * business-analysis report and the Confluence export showed them unchanged next to "costs not determined"
 * (QA review of a0c108513165). Every reader of a stored analysis goes through `readStoredAnalysis`, which
 * replaces each amount with a plain statement that there is none.
 */

export const NO_AMOUNT = '(amount removed: no approved cost assumptions)';

const SCALE = String.raw`(?:\s?(?:k|m|bn|mn|million|millions|thousand|mio\.?|mrd\.?|tsd\.?))?`;
const NUMBER = String.raw`\d[\d.,' ]*\d|\d`;
const SIGN = String.raw`[$€£¥]`;
const CODE = String.raw`(?:EUR|USD|GBP|CHF|JPY)`;
/** Currency written out: "5,000 dollars", "3 million euros" (QA review of bd0f38078c40). */
const WORD = String.raw`(?:dollars?|euros?|pounds?(?:\s+sterling)?|francs?|yen)`;

/** A currency sign, code or word on either side of a number, with an optional scale word: "€5,000", "3.2k $", "USD 40,000", "1,5 Mio. €", "3 million euros". */
const AMOUNT = new RegExp(
  [
    String.raw`${SIGN}\s?(?:${NUMBER})${SCALE}`,
    String.raw`\b${CODE}\s?(?:${NUMBER})${SCALE}`,
    String.raw`(?<![\w.])(?:${NUMBER})${SCALE}\s?(?:${SIGN}|${CODE}\b|${WORD}\b)`,
  ].join('|'),
  'gi',
);

export function withoutUnapprovedMoney(text: string): string {
  return String(text).replace(AMOUNT, NO_AMOUNT);
}

export const containsAmount = (text: string): boolean => new RegExp(AMOUNT.source, 'i').test(String(text));

/** Every string inside arrays and plain objects, recursively; numbers, booleans and null stay as they are. */
export function withoutUnapprovedMoneyDeep<T>(value: T): T {
  if (typeof value === 'string') return withoutUnapprovedMoney(value) as T;
  if (Array.isArray(value)) return value.map((v) => withoutUnapprovedMoneyDeep(v)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, withoutUnapprovedMoneyDeep(v)])) as T;
  }
  return value;
}

/**
 * A stored analysis, as the Analyze stage, its export and the report formatter read it: an object, or a JSON
 * string possibly wrapped in a code fence, possibly an array whose first element is the analysis. Returns null
 * when it is not JSON — the caller then treats it as markdown and masks that text itself.
 */
export function readStoredAnalysis<T = Record<string, unknown>>(raw: unknown): T | null {
  let data: unknown = null;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) data = raw;
  else if (typeof raw === 'string') {
    const cleaned = raw.replace(/^```json\n?/gm, '').replace(/^```\n?/gm, '').trim();
    if (!cleaned.startsWith('{') && !cleaned.startsWith('[')) return null;
    try {
      const parsed = JSON.parse(cleaned);
      data = Array.isArray(parsed) ? parsed[0] : parsed;
    } catch {
      return null;
    }
  }
  return data && typeof data === 'object' ? withoutUnapprovedMoneyDeep(data as T) : null;
}
