/**
 * Every string the new components own — `DESIGN.md` §3.
 *
 * Not because the product is translated: it is English everywhere and stays
 * English for 3.0 (ADR-009). The keys exist because the German interface comes
 * after 3.0 and a catalogue added later is a rewrite of every component that
 * shipped before it. Adding it now costs one indirection; adding it in 2027
 * costs the whole `components/cc/` tree.
 *
 * Scope is deliberately narrow: strings a component writes *by itself* — a
 * button that always says "Clear filters", the "required" note, the accessible
 * name of a close button. Content that a caller passes in travels as props and
 * is not in here; that text belongs to the screen, not to the component.
 *
 * `tests/cc-style-guard.spec.ts` fails on visible text in `components/cc/` that
 * did not come through `t()` or a prop.
 */

export const CC_MESSAGES = {
  'action.cancel': 'Cancel',
  'action.clearFilters': 'Clear filters',
  'action.close': 'Close',
  'action.retry': 'Retry',
  'action.runWithoutModel': 'Run without model',
  'action.showDetails': 'Details',
  'filter.noMatch': 'No findings match these filters',
  'filter.of': 'of',
  'filter.search': 'Search',
  'form.required': 'required',
  'form.requiredNote': 'required',
  'run.cancelRun': 'Cancel run',
  'run.leaveWarning': 'This run would be lost if you leave the page.',
  'run.serverContinues': 'The run continues on the server. You can come back to it.',
  'run.noModelCall': 'No model call',
  'run.notCounted': 'Not counted',
  'why.label': 'Why',
  'why.basis': 'Based on',
  'why.evidence': 'Evidence',
  'why.recorded': 'Recorded',
} as const;

export type CcMessageKey = keyof typeof CC_MESSAGES;

/**
 * The lookup. Deliberately not clever: no interpolation, no pluralisation, no
 * fallback to the key. A missing key is a build error in TypeScript, which is
 * the moment it is cheapest to fix.
 */
export function t(key: CcMessageKey): string {
  return CC_MESSAGES[key];
}

/**
 * "12 of 42 findings", or "42 findings" when nothing is filtered out.
 *
 * Here rather than inside `CcFilterBar` for one reason: the only word in it
 * — "of" — is a visible string, and a component that builds a sentence out of a
 * literal has a string the catalogue does not know about. When German arrives
 * this function changes; the component does not.
 */
export function countLabel(shown: number, total: number, noun: string): string {
  return shown === total
    ? `${total} ${noun}`
    : `${shown} ${CC_MESSAGES['filter.of']} ${total} ${noun}`;
}
