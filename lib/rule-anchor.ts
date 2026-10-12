import type { BusinessRule } from './abap/business-rule-set';

/**
 * Where a business rule stands in the source, in words.
 *
 * Moved out of the process-states route so the delivery package's rule
 * register says the same places the Business view says (CO review F16,
 * 12.10.2026): a register row whose evidence read differently from the
 * confirmation screen would be two answers to one question.
 */

/** "line 5", "lines 5 to 9", or null — the wording `lib/process-map.ts` uses. */
export function anchorWords(start: number | null, end: number | null): string | null {
  if (start === null) return null;
  if (end === null || end === start) return `line ${start}`;
  return `lines ${start} to ${end}`;
}

/**
 * Every place a rule stands, and not a range from the first to the last.
 *
 * `BusinessRule` carries no line range on purpose — a rule copied into fourteen
 * routines stands at fourteen places, and one range over them would claim the
 * nine hundred lines in between. So the anchor line names the places, up to six
 * of them, and says how many more there are rather than dropping them silently.
 */
export function ruleAnchor(rule: Pick<BusinessRule, 'sentences'>): string | null {
  const seen = new Set<string>();
  for (const sentence of rule.sentences) {
    for (const anchor of sentence.anchors) {
      const words = anchorWords(anchor.lineStart, anchor.lineEnd);
      if (words) seen.add(words);
    }
  }
  const places = [...seen];
  if (places.length === 0) return null;
  const shown = places.slice(0, 6).join(' · ');
  return places.length > 6 ? `${shown} · ${places.length - 6} more places` : shown;
}
