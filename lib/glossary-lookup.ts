/**
 * Answering "What is …?" from the glossary — no model call.
 *
 * Roadmap 6.6 and `DESIGN.md` §6.1 ("Glossar in „Ask this case‟"): a question
 * that names a glossary term is answered **from that entry**, never by asking
 * Gemini to restate it. This module is the one place that decides whether a
 * piece of free text names a term, so the ⌘K search (`lib/workspace-search.ts`)
 * and the embedded assistant (`components/GlossaryChatbot.tsx`) read the same
 * answer for the same word — the owner decision of 15.09.2026 was explicit that
 * both surfaces use "dieselbe Quelle wie im Text".
 *
 * Pure and synchronous throughout: nothing here imports `lib/gemini.ts`, and a
 * test can therefore prove "no model call" by checking that this module is
 * never on the stack next to a network request, rather than by trusting a
 * comment.
 */

import { GLOSSARY_ITEMS, type GlossaryItem } from './glossary';

export interface GlossaryMatch {
  /** The key `GLOSSARY_ITEMS` is keyed by — `RAP`, `CAP`, `Clean Core`, … */
  key: string;
  item: GlossaryItem;
}

const normalize = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Finds the glossary entry a query names, if any.
 *
 * Three passes, loosest last, so a query that names a term exactly never loses
 * to one that merely contains it:
 *
 *   1. the query equals a `shortName` or `term`, case- and spacing-insensitive
 *      ("BTP", "sap btp");
 *   2. a `shortName` or `term` is fully contained in the query ("what about
 *      SAP BTP" contains "SAP BTP", and also contains the shorter "BTP" — the
 *      **longer** contained name wins, "SAP BTP", because more of the query
 *      was actually spent naming it);
 *   3. the query is fully contained in a `shortName` — never in a `term`,
 *      which is a descriptive sentence ("Core Data Services View") rather
 *      than a name, and would otherwise let "core" resolve to "CDS View"
 *      before it resolves to "Clean Core". Here the **shorter** matching
 *      `shortName` wins, since it is the tighter, more specific name.
 *
 * Both of the ranked passes compare the length of the field that actually
 * matched *for that candidate*, never a candidate's longest field in the
 * abstract — two entries sharing one descriptive `term` (`BTP` and `SAP BTP`
 * both read "SAP Business Technology Platform" today, a duplication
 * `DESIGN.md` §6.1 already marks for merging) must not tie on that shared
 * field when only one of their `shortName`s is what the query actually named.
 *
 * Pass 3 only accepts a query of at least three characters, so that typing "a"
 * does not "find" every entry whose name happens to contain that letter — the
 * same guard `lib/workspace-search.ts` uses for source-line text search.
 */
export function findGlossaryTerm(query: string): GlossaryMatch | null {
  const q = normalize(query);
  if (!q) return null;

  const entries = Object.entries(GLOSSARY_ITEMS);

  const exact = entries.find(
    ([, item]) => normalize(item.shortName) === q || normalize(item.term) === q,
  );
  if (exact) return { key: exact[0], item: exact[1] };

  /** How much of `q` this candidate's own name accounts for — 0 when it names none of it. */
  const containedInQuery = (item: GlossaryItem): number => {
    const short = normalize(item.shortName);
    const full = normalize(item.term);
    let best = 0;
    if (q.includes(short)) best = Math.max(best, short.length);
    if (q.includes(full)) best = Math.max(best, full.length);
    return best;
  };

  const byLongestMatch = (a: [string, GlossaryItem], b: [string, GlossaryItem]) =>
    containedInQuery(b[1]) - containedInQuery(a[1]);

  const containsTerm = entries.filter(([, item]) => containedInQuery(item) > 0).sort(byLongestMatch)[0];
  if (containsTerm) return { key: containsTerm[0], item: containsTerm[1] };

  if (q.length < 3) return null;
  const containedInTerm = entries
    .filter(([, item]) => normalize(item.shortName).includes(q))
    .sort((a, b) => a[1].shortName.length - b[1].shortName.length)[0];
  return containedInTerm ? { key: containedInTerm[0], item: containedInTerm[1] } : null;
}

/**
 * Pulls the term out of a "What is …?" question — `DESIGN.md` §6.1's own
 * example is "What is a released API?". Returns `null` for anything that is
 * not that shape, so a caller can fall through to its normal handling (a model
 * call, or "no match") rather than mis-reading an unrelated sentence.
 */
const WHAT_IS = /^\s*what(?:'s|\s+is|\s+are)\s+(?:an?\s+|the\s+)?(.+?)\s*\??\s*$/i;

export function parseWhatIsQuestion(text: string): string | null {
  const match = WHAT_IS.exec(text);
  const term = match?.[1]?.trim();
  return term ? term : null;
}

/**
 * The no-model-call answer for an entry — at most two sentences, per ADR-034:
 * what it is, then what it means for the decision at hand. Both sentences are
 * the entry's own words; this function does not compose new prose out of them.
 */
export function glossaryAnswerText(item: GlossaryItem): string {
  return `${item.definition} ${item.cleanCoreImplication}`.trim();
}

/**
 * A single entry point for "does this free-text question have a no-model-call
 * answer", used by both the search dialog and the embedded assistant so
 * neither has to duplicate the "What is …?" parsing.
 */
export function glossaryAnswerFor(question: string): (GlossaryMatch & { answer: string }) | null {
  const named = parseWhatIsQuestion(question);
  const match = named ? findGlossaryTerm(named) : findGlossaryTerm(question);
  if (!match) return null;
  return { ...match, answer: glossaryAnswerText(match.item) };
}

/**
 * Every glossary term named in a piece of running text, with where it sits —
 * the scan behind the underlined Fachwort of `DESIGN.md` §6.1 ("Glossar im
 * Text", ADR-034).
 *
 * Three rules, each there to stop a specific kind of noise:
 *
 *   1. **Whole words only.** `lv_badi` does not name *BAdI* and `scoped` does
 *      not name *Scope item*; an underline on a fragment of an identifier
 *      would teach the reader to distrust every other underline on the page.
 *   2. **The longest name wins.** In "side-by-side extensibility" the reader
 *      is owed that entry, not the shorter *Extensibility* one it contains.
 *   3. **Once per term.** The fifth underline on the same word in one card
 *      is decoration; the first is help.
 *
 * Pure and synchronous, like everything else in this module: marking up text
 * is a lookup, never a model call.
 */
export interface GlossaryMention {
  key: string;
  item: GlossaryItem;
  /** Index of the first character of the mention in the text handed in. */
  start: number;
  /** Index just past its last character. */
  end: number;
}

const WORDISH = /[A-Za-z0-9_]/;

const isBoundary = (text: string, index: number): boolean =>
  index < 0 || index >= text.length || !WORDISH.test(text[index]);

export function findGlossaryMentions(text: string): GlossaryMention[] {
  if (!text) return [];
  const haystack = text.toLowerCase();

  // Longest name first, so rule 2 falls out of the order rather than needing
  // a second pass to undo a shorter match already taken.
  const candidates = Object.entries(GLOSSARY_ITEMS)
    .map(([key, item]) => ({ key, item, needle: item.shortName.toLowerCase() }))
    .filter((candidate) => candidate.needle.length > 0)
    .sort((a, b) => b.needle.length - a.needle.length);

  const found: GlossaryMention[] = [];
  const taken: boolean[] = new Array(text.length).fill(false);

  for (const { key, item, needle } of candidates) {
    let from = 0;
    for (;;) {
      const at = haystack.indexOf(needle, from);
      if (at < 0) break;
      const end = at + needle.length;
      const free = !taken.slice(at, end).some(Boolean);
      if (free && isBoundary(text, at - 1) && isBoundary(text, end)) {
        for (let i = at; i < end; i += 1) taken[i] = true;
        found.push({ key, item, start: at, end });
        break; // rule 3 — only the first mention of this term is marked
      }
      from = at + 1;
    }
  }

  return found.sort((a, b) => a.start - b.start);
}
