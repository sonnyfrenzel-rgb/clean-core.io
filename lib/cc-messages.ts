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
  'action.open': 'Open',
  'action.retry': 'Retry',
  'action.runAnalysis': 'Run analysis',
  'action.runWithoutModel': 'Run without model',
  'action.showDetails': 'Details',
  'filter.noMatch': 'No findings match these filters',
  'filter.of': 'of',
  'filter.search': 'Search',
  'form.required': 'required',
  'state.loading': 'Loading',
  'form.requiredNote': 'required',
  'run.cancelRun': 'Cancel run',
  'run.cancelReach':
    'Cancelling stops this page waiting. A request already sent runs to completion on the server: a model call under way is not stopped, and a run that reached the server is created and signed.',
  'run.failed': 'The analysis did not finish.',
  'run.leaveWarning': 'This run would be lost if you leave the page.',
  'run.serverContinues': 'The run continues on the server. You can come back to it.',
  'run.noModelCall': 'No model call',
  'run.notCounted': 'Not counted',
  'why.label': 'Why',
  'why.basis': 'Based on',
  'why.evidence': 'Evidence',
  'why.recorded': 'Recorded',

  // The Message Popover of the edit footer — DESIGN.md §2.6, §2.3 item 6.
  'checks.title': 'Checks',
  'checks.open': 'open',
  'checks.hintsNotBlocks': 'hints, not blocks',
  'checks.none': 'No open checks.',
  'checks.goTo': 'Go to',

  // Loading, folding and table limits — block D, step D.5c (DESIGN.md §2.8, §2.11).
  'disclosure.show': 'Show',
  'disclosure.hide': 'Hide',
  'table.showAll': 'Show all',
  'table.showFirst': 'Show the first',
  'date.none': 'no date recorded',

  // A state said in words, for a mark that is only colour and shape (§1.1).
  'state.error': 'Error',
  'state.warning': 'Warning',
  'state.information': 'Information',
  'state.success': 'Success',

  // "My workspace" as a List Report — roadmap 1.8, DESIGN.md §2.2, mockup s7.
  'workspace.title': 'My workspace',
  'workspace.lead': 'Every project is one case. The demo is the same for every account.',
  'workspace.projects': 'Projects',
  'workspace.noun': 'projects',
  'workspace.newProject': 'New project',
  'workspace.yourTurn': 'Your turn',
  'workspace.yourTurnBody':
    'Start with an example or with your own code. The demo in the table is a finished case to read — it belongs to no account, and nothing done in it is saved.',
  'workspace.demoNote':
    'The demo is the same for every account and always on the current release. It produces no signed run, runs no test, and nothing done in it is saved.',
  'workspace.demoStatus': 'A demo run — unsigned. It produces no signed run and executes no test.',
  'workspace.demoLastChange': 'rebuilt on every visit',
  'workspace.emptyTitle': 'No projects yet',
  'workspace.emptyBody':
    'A project is one piece of ABAP taken from not understood to a decision you can show someone. Nothing is analysed until you start a run.',
  'workspace.noMatch': 'No projects match these filters',
  'workspace.noMatchReason': 'Every project you have is still here — the filters are hiding them.',
  'workspace.filterStatus': 'Status',
  'workspace.anyStatus': 'Any status',
  'workspace.colProject': 'Project',
  'workspace.colLines': 'Lines',
  'workspace.colFindings': 'Findings',
  'workspace.colStatus': 'Status',
  'workspace.colLastChange': 'Last change',
  'workspace.colActions': 'Row actions',
  'workspace.notStaged': 'not staged',
  'workspace.notAnalysed': 'not analysed',
  'workspace.linesStaged': 'staged, not analysed',
  'workspace.noDate': 'no date recorded',
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

/**
 * "Show all 42" and "Show the first 5" — the button under a limited `CcTable`
 * (§2.11). A function for the same reason as `countLabel`: the number goes
 * into the sentence, and where it goes is the catalogue's business.
 */
export function showAllLabel(total: number): string {
  return `${CC_MESSAGES['table.showAll']} ${total}`;
}

export function showFirstLabel(limit: number): string {
  return `${CC_MESSAGES['table.showFirst']} ${limit}`;
}
