/**
 * Interface text of the frame of the object page — WorkspaceShell, CommandSearch, ToolBar, StatusLine, NextStepCard.
 *
 * One part of the catalogue in `lib/workspace-messages.ts` (DESIGN.md §3,
 * block D, step D.29). Plain strings only; a sentence with a number in it is a
 * function beside the object, so where the number goes is the catalogue's
 * business and not the component's.
 */
export const WORKSPACE_SHELL_MESSAGES = {
  // The shell bar (app/(app)/layout.tsx) — the path and the search slot, §2.1.
  'shell.path': 'Path',
  'shell.myWorkspace': 'My workspace',
  'shell.searchProject': 'Search this project (Ctrl K)',

  // The header of the object page — components/workspace/WorkspaceShell.tsx.
  'page.details': 'Details',
  'page.view': 'View',
  'page.aboutThisView': 'About this view',
  'page.projectStatus': 'Project status',
  'page.nothingOnRecord': 'Nothing on record yet for any of the seven',
  'page.showProjectStatus': 'Show project status',
  'page.hideProjectStatus': 'Hide project status',
  'page.showTipsAgain': 'Show tips again',

  // Search ⌘K — components/workspace/CommandSearch.tsx, roadmap 6.6.
  'search.title': 'Search this project',
  'search.close': 'Close search',
  'search.fieldName': 'Find a process step, a decision, a business rule, a finding, a code line or a glossary term',
  'search.placeholder': 'A step, a rule, a term — or a line like L231',
  'search.footer': 'This project only · Enter jumps to the result · No model call',
  'search.found': 'found',
  'search.nothingMatches': 'Nothing in this project matches',
  'search.results': 'Search results',
  'search.sourceLine': 'Source line',

  // The tools, the status line and "Next step" — ToolBar, StatusLine, NextStepCard.
  'tools.label': 'Tools',
  'status.label': 'Project status',
  'status.open': 'Open',
  'nextStep.title': 'Next step',
} as const;

/** "3 of 7 have something on record" — the folded status row of the Business view. */
export function pageStatusOnRecord(started: number, total: number): string {
  return `${started} of ${total} have something on record`;
}

/** "12 found" / "0 found" — the count beside the search field. */
export function searchFoundLabel(count: number): string {
  return `${count} ${WORKSPACE_SHELL_MESSAGES['search.found']}`;
}

/** Nothing in this project matches “lv_amount”. */
export function searchNothingMatches(query: string): string {
  return `${WORKSPACE_SHELL_MESSAGES['search.nothingMatches']} “${query}”.`;
}

/** "Source line L231" — the accessible name of a hit's line anchor. */
export function searchSourceLineLabel(anchor: string): string {
  return `${WORKSPACE_SHELL_MESSAGES['search.sourceLine']} ${anchor}`;
}

/** "Open Analyze" — a link to a stage, in the status popover and in "Next step". */
export function openStageLabel(stage: string): string {
  return `${WORKSPACE_SHELL_MESSAGES['status.open']} ${stage}`;
}
