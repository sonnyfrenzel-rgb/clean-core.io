import type { CoverageGap } from './abap/coverage';
import type { NotDeterminedItem } from './workspace-model';

/**
 * What the engine could not settle, for a manager — grouped by kind, each kind
 * explained once in one plain sentence (owner, 04.10.2026, on the Management
 * view: eleven open cards, "the same long sentence six times" — "keep that
 * folded").
 *
 * The engine's own sentence (`lib/abap/coverage.ts`) stays with every item and
 * is what the IT view prints line by line; this module adds no finding and
 * drops none: every item lands in exactly one group, with its line anchor.
 * A kind this table does not know falls back to the engine's sentence of its
 * first item rather than to a guess.
 */
export const NOT_DETERMINED_PLAIN: Record<CoverageGap, string> = {
  'local-function-call': 'Whether SAP offers a released replacement for these calls was not checked.',
  'include-not-read': 'These parts of the program were not uploaded, so what they do is unknown.',
  'file-io': 'Whether these file reads and writes on the server still work in the target was not checked.',
  'dynamic-invocation': 'What is called is decided only while the program runs, so the code alone cannot name it.',
  'dynamic-target': 'Which table is used is decided only while the program runs, so the code alone cannot name it.',
  'classic-list-output': 'An old-style list output that ABAP Cloud does not offer; it is noted here, not scored.',
  macro: 'Shorthand blocks whose content the engine does not read.',
  'generated-code': 'The program writes more code while it runs, and that code cannot be read in advance.',
};

export interface NotDeterminedGroup {
  key: string;
  label: string;
  /** One plain sentence for the kind. */
  plain: string;
  count: number;
  /** Every line anchor of the kind, in source order — none is dropped. */
  anchors: string[];
}

/** One group per kind, in the order each kind first occurs. */
export function groupNotDetermined(items: readonly NotDeterminedItem[]): NotDeterminedGroup[] {
  const groups = new Map<string, NotDeterminedGroup>();
  for (const item of items) {
    const key = item.gap ?? item.label;
    const group = groups.get(key) ?? {
      key,
      label: item.label,
      plain: (item.gap && NOT_DETERMINED_PLAIN[item.gap]) || item.why,
      count: 0,
      anchors: [],
    };
    group.count += 1;
    if (!group.anchors.includes(item.anchor)) group.anchors.push(item.anchor);
    groups.set(key, group);
  }
  return [...groups.values()];
}
