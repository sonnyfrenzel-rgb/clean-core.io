/**
 * Interface text of the First-insights block "What the code gives away"
 * (roadmap 3.0.21, owner decisions 22.10.2026) — the sentences
 * `lib/first-look-findings.ts` writes for each reading, and the block's own
 * lines.
 *
 * One part of the catalogue in `lib/workspace-messages.ts`. Plain strings
 * only; a sentence with a number or a name in it is a function beside the
 * object. Every finding sentence ends in a question: the block prints who to
 * ask beside it ("Question for IT / the users / the business"), and none of
 * them claims more than the reading proved — code no run reaches is said only
 * where reachability is certain, input order is "in the code", and an
 * authorization check may stand in a calling program.
 */
export const FIRST_LOOK_FINDINGS_MESSAGES = {
  'gives.title': 'What the code gives away',
  'gives.chip': 'Read from the code',
  'gives.none': 'None of the seven signs found.',
  'gives.askIt': 'Question for IT',
  'gives.askUsers': 'Question for the users',
  'gives.askBusiness': 'Question for the business',
} as const;

/** The number of signs the block looks for — "none of the seven signs found". */
export const GIVES_AWAY_SIGNS = 7;

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

/** "+ 2 more" — the link to Documentation and IT. */
export function givesMore(n: number): string {
  return `+ ${n} more`;
}

/* ---------------------------------------------------- 1. unreachable code */

/** A switch fixed in the code turns lines off: a constant gate. */
export function givesUnreachableBySwitch(lines: number): string {
  return `${lines} ${plural(lines, 'line', 'lines')} of code never run, because a switch fixed in the code turns them off. Is that part still needed?`;
}

/** Routines nothing in this program calls. "In this program": another program may still call them. */
export function givesUnreachableUncalled(routines: number, lines: number): string {
  return routines === 1
    ? `One routine of ${lines} ${plural(lines, 'line', 'lines')} is never called from anywhere in this program. Is it still needed?`
    : `${routines} routines with ${lines} lines are never called from anywhere in this program. Are they still needed?`;
}

/* ---------------------------------------------------- 2. ignored input */

/** A start-screen entry no statement reads. `label` is a plain word or null. */
export function givesSelectionUnused(label: string | null, others: number): string {
  const what = label ? `asks for “${label}”` : 'asks for an entry';
  const more = others > 0 ? ` (and ${others} more)` : '';
  return `The start screen ${what}${more}, yet nothing in the code uses it. Does that entry matter to the users?`;
}

/** What a pop-up hands back is never read, or overwritten first — in source order. */
export function givesDialogAnswerIgnored(): string {
  return 'A pop-up asks the user for a value, and in the code the answer is never used. Is that entry meant to count?';
}

/** A pop-up is handed a list of another row type than its interface names. */
export function givesDialogWrongList(): string {
  return 'In the code, a pop-up is handed the wrong kind of list, so it may show the wrong fields. Is that known?';
}

/* ---------------------------------------------------- 3. test switch */

/** The program's own test cases, switched on from its start screen. */
export function givesTestSwitch(cases: number): string {
  return cases > 0
    ? `The program carries its own ${cases} test ${plural(cases, 'case', 'cases')}, switched on from its start screen. Should that stay in production code?`
    : 'The program has a demo switch on its start screen that runs it on test data. Should that stay in production code?';
}

/* ---------------------------------------------------- 4. fixed scope */

/**
 * A read restricted by a value written into the code. `data` is the plain
 * word of what is read ("purchase orders") or null; `field` the plain word of
 * the field ("company code") or null; `value` as written, without quotes, or null.
 */
export function givesFixedScope(data: string | null, field: string | null, value: string | null): string {
  const what = data ?? 'data';
  if (field && value) return `The code reads ${what} only for ${field} ${value}, fixed in the code rather than chosen on screen. Does that still hold?`;
  if (value) return `The code reads ${what} only for the value ${value}, fixed in the code rather than chosen on screen. Does that still hold?`;
  return `The code reads ${what} only for one value fixed in the code, not chosen on screen. Does that still hold?`;
}

/* ---------------------------------------------------- 5. header contradiction */

export type HeaderContradiction = 'claims-change' | 'denies-change' | 'claims-mail' | 'claims-approval' | 'names-other-data';

export function givesHeaderContradiction(kind: HeaderContradiction): string {
  switch (kind) {
    case 'claims-change':
      return 'The header comment says the program changes data, but the code changes none. Which one is right?';
    case 'denies-change':
      return 'The header comment says the program changes no data, but the code does. Which one is right?';
    case 'claims-mail':
      return 'The header comment says the program sends mail, but the code sends none. Which one is right?';
    case 'claims-approval':
      return 'The header comment speaks of an approval, but the code runs none. Which one is right?';
    case 'names-other-data':
      return 'The header comment names data the code never reads or changes. Is the comment out of date?';
  }
}

/* ---------------------------------------------------- 6. SAP table writes */

/** A direct write to SAP's own tables. `word` is the plain plural ("sales orders") or null. */
export function givesSapTableWrite(word: string | null, others: number): string {
  const what = word ? `SAP's own ${word}` : "one of SAP's own tables";
  const more = others > 0 ? ` and ${others} more SAP ${plural(others, 'table', 'tables')}` : '';
  return `The code changes ${what}${more} directly, not through SAP's checked functions. Is that known and agreed?`;
}

/* ---------------------------------------------------- 7. authority */

/** Only the lower value of a range entered on the start screen is checked. */
export function givesAuthorityLowOnly(): string {
  return 'The authorization check looks only at the first value of a range entered on screen. Can users select more than they may?';
}

/** The check asks for display only while the program changes data. */
export function givesAuthorityDisplayOnly(): string {
  return 'The code checks only whether the user may display, yet it changes data. Is the change permission checked elsewhere?';
}

/** No authorization check in this code at all, and a direct write. It may stand in a calling program. */
export function givesAuthorityNone(): string {
  return 'The code changes data without an authorization check of its own. Is the check made in a calling program?';
}
