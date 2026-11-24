/**
 * Short on top, complete underneath — for a long engine or model paragraph.
 *
 * Owner feedback 24.11.2026: the texts the product shows are too long, but no
 * content may go missing. This splits a paragraph into the sentences that stand
 * on top and the rest, which the page folds (`components/FoldedText.tsx`) — it
 * never shortens, rewords or drops anything: `lead + ' ' + rest` is the text.
 *
 * Display only. A signed run, an audit pack or an export keeps the whole text;
 * nothing here is stored.
 */

/** Sentences shown on top by default. */
export const LEAD_SENTENCES = 2;

/** A rest shorter than this is not worth a fold: the paragraph stands whole. */
export const MIN_REST_WORDS = 12;

const ABBREVIATIONS = /(?:\b(?:e\.g|i\.e|etc|vs|approx|incl|cf|no|Nr|z\.B|ca)\.|\b[A-Z]\.)$/i;

/** Word count as the length budgets count it: runs of letters or digits. */
export function wordCount(text: string): number {
  return (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’._/-]*/gu) ?? []).length;
}

/**
 * The paragraph's sentences, in order, each with its own trailing space removed.
 * A full stop ends a sentence only before white space and an upper-case letter,
 * a digit or an opening quote/bracket — so "2024.FPS02", "L1.", "e.g. a" and
 * "(2×)." mid-sentence do not split it.
 */
export function sentencesOf(text: string): string[] {
  const out: string[] = [];
  const re = /[.!?](?=["”’)]?\s+["“‘(\[]?[\p{Lu}\p{N}])/gu;
  let start = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const end = m.index + 1;
    const piece = text.slice(start, end);
    if (ABBREVIATIONS.test(piece)) continue;
    // Keep a closing quote or bracket with its sentence.
    const close = /^["”’)]*/.exec(text.slice(end))?.[0] ?? '';
    out.push(text.slice(start, end + close.length).trim());
    start = end + close.length;
  }
  const tail = text.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}

export interface TextFold {
  /** What stands on top. */
  lead: string;
  /** What the fold holds, or null when the paragraph stands whole. */
  rest: string | null;
  /** How many sentences the fold holds — its count on the closed state. */
  restSentences: number;
}

/**
 * The first `sentences` sentences on top and the rest in the fold. The rest is
 * null when it would be shorter than {@link MIN_REST_WORDS} words: a fold for
 * half a sentence costs the reader more than it saves.
 */
export function foldText(text: string, sentences: number = LEAD_SENTENCES): TextFold {
  const clean = text.replace(/\s+/g, ' ').trim();
  const all = sentencesOf(clean);
  if (all.length <= sentences) return { lead: clean, rest: null, restSentences: 0 };
  const lead = all.slice(0, sentences).join(' ');
  const restParts = all.slice(sentences);
  const rest = restParts.join(' ');
  if (wordCount(rest) < MIN_REST_WORDS) return { lead: clean, rest: null, restSentences: 0 };
  return { lead, rest, restSentences: restParts.length };
}
