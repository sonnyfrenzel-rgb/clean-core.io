/**
 * The narrative's `gaps`, read the one way every reader reads them.
 *
 * The analysis prompt (`lib/analysis-prompt.ts`) asks the model for a *list* of
 * functional gaps. Measured on the 1,000-line starter example, the product's
 * default model answered with a single object instead in two of three runs, and
 * other models do it too. Every reader then checked `Array.isArray` (or did not
 * and threw), and the one gap the model had named fell out of the worklist
 * without a word.
 *
 * Decided 24.09.2026: a single object is a list of exactly that one entry. Every
 * other shape the model may send — text, a number, an object without a title, a
 * list with entries that have none — is not guessed at and not dropped in
 * silence either: `unreadable` says what arrived, and the reader shows
 * `gapsUnreadableSentence()` where the gaps would otherwise be. An absent or
 * `null` field is no gaps and nothing to report.
 *
 * Pure and import-free: the analyze page, the analysis run in the browser, the
 * signing route and the Markdown export all call it. The entries that pass are
 * returned as the same objects, untouched, so a well-formed answer reads exactly
 * as it did before.
 */

export interface ModelGap {
  title: string;
  severity?: unknown;
  strategy?: unknown;
  rationale?: unknown;
  complexity?: unknown;
  [key: string]: unknown;
}

export interface ModelGapsReading {
  gaps: ModelGap[];
  /** Null when everything the model sent was read; otherwise what could not be. */
  unreadable: string | null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isGap(value: unknown): value is ModelGap {
  return isPlainObject(value) && typeof value.title === 'string' && value.title.trim().length > 0;
}

function describe(value: unknown): string {
  if (typeof value === 'string') return 'text instead of a list';
  if (typeof value === 'number') return 'a number instead of a list';
  if (typeof value === 'boolean') return 'true/false instead of a list';
  if (isPlainObject(value)) return 'an object without a title';
  return `a value of type ${typeof value}`;
}

export function readModelGaps(value: unknown): ModelGapsReading {
  if (value === undefined || value === null) return { gaps: [], unreadable: null };

  if (Array.isArray(value)) {
    const gaps = value.filter(isGap);
    const rejected = value.length - gaps.length;
    if (rejected === 0) return { gaps, unreadable: null };
    return {
      gaps,
      unreadable:
        rejected === value.length
          ? `${rejected === 1 ? 'one entry' : `all ${rejected} entries`} without a title`
          : `${rejected} of ${value.length} entries without a title`,
    };
  }

  if (isGap(value)) return { gaps: [value], unreadable: null };

  return { gaps: [], unreadable: describe(value) };
}

/** The sentence a reader shows where the gaps would otherwise be. */
export function gapsUnreadableSentence(reason: string): string {
  return `The model returned gaps in a form that could not be read (${reason}); they are not in the worklist.`;
}
