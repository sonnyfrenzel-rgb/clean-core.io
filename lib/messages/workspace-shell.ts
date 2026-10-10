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
  'shell.searchProject': 'Search this project (Ctrl K)',

  // The header of the object page — components/workspace/WorkspaceShell.tsx.
  'page.details': 'Details',
  'page.metaProject': 'Project',
  'page.metaNoRun': 'No signed run yet — source, engine, rules and catalog are recorded with the first analysis.',
  'page.view': 'View',
  'page.aboutThisView': 'About this view',
  'page.projectStatus': 'Project status',
  'page.nothingOnRecord': 'Nothing on record yet for any of the seven',
  'page.showProjectStatus': 'Show project status',
  'page.hideProjectStatus': 'Hide project status',
  'page.statusTapHint': 'Tap a status to see what it rests on and open the tool behind it.',
  'page.showTipsAgain': 'Show tips again',

  // The central work area under the map — WorkspaceShell, Business (ADR-072).
  'hub.title': 'Work from this process',
  'hub.lead':
    'Your process, reconstructed from the old ABAP, is where everything starts. Take the next step, read the same process as IT or Management, or open a tool.',
  'hub.eyebrow': 'Central work area',
  'hub.nextLabel': 'Continue with',
  'hub.nothingOpen': 'Nothing is open — every phase this product can finish has its own evidence on record.',
  'hub.viewsTitle': 'Read this process as',
  'hub.viewHere': 'You are here',
  'hub.viewBusinessGets': 'The process in plain words: its steps, the business rules hard-coded in it, and what could not be determined.',
  'hub.viewItGets': 'What the code does, line by line: findings, clean core Level A–D and the target profile.',
  'hub.viewManagementGets': 'The decision — keep, rebuild, move to standard or retire — with its cost and risk.',
  'hub.toolsTitle': 'The seven tools',
  'hub.pathLabel': 'Where the seven tools stand',
  'hub.stageNone': 'nothing on record',
  'hub.stageNext': 'next',
  // Until this browser has opened Analyze once (ADR-090): the result is
  // pointed at, never the next step — "Continue with" stays the phase contract's.
  'hub.analysisReadyTitle': 'Your analysis is ready',
  'hub.analysisReadyAction': 'Read the analysis',

  // Search ⌘K — components/workspace/CommandSearch.tsx, roadmap 6.6.
  'search.title': 'Search this project',
  'search.close': 'Close search',
  'search.fieldName': 'Find a process step, a decision point, a business rule, a finding, a code line or a glossary term',
  'search.placeholder': 'A step, a rule, a term — or a line like L231',
  'search.footer': 'This project only · Enter jumps to the result · No model call',
  'search.found': 'found',
  'search.nothingMatches': 'Nothing in this project matches',
  'search.results': 'Search results',
  'search.sourceLine': 'Source line',

  // The tools, the status line and "Next step" — ToolBar, StatusLine, NextStepCard.
  'tools.label': 'Tools',
  // What the mark beside a tool says to a screen reader (ADR-060). It never
  // says how strong the record is — that is the stepper's and the chips'.
  // Owner 03.10.2026: "a check must mean done" — the check is a phase that is
  // done; output that is on record without being done is "started".
  'tools.mark.done': 'done',
  'tools.mark.started': 'started, not done',
  'tools.mark.stale': 'out of date',
  'tools.mark.doneHint': 'Done for this project',
  'tools.mark.startedHint': 'Started — something of this tool is on record, and its work is not done',
  'tools.mark.staleHint': 'Out of date — inputs changed since',
  // The legend beside "Tools" and at the top of the phone menu.
  'tools.legend.label': 'What the marks mean:',
  'tools.legend.done': 'done',
  'tools.legend.started': 'started',
  'tools.legend.stale': 'out of date',
  // Which tool, for what, and which one next (owner 03.10.2026). Guidance,
  // not a mark: kept apart from the `tools.` words, which never speak of proof.
  'toolGuide.next': 'Next',
  'toolGuide.recommended': 'Recommended next step.',
  'toolGuide.othersNeedRun': 'The other tools need a signed run first.',
  'toolGuide.whatTheyDo': 'What the tools do',
  // On the Analyze tool until this browser has opened it once (ADR-090).
  'toolGuide.resultReady': 'Result ready',
  'toolGuide.resultReadyHint': 'Its result is ready and has not been opened in this browser yet.',
  'toolGuide.nothingOpen': 'Nothing is open — every tool this release can finish has its record.',
  'status.label': 'Project status',
  'status.open': 'Open',
  'nextStep.title': 'Next step',
  // While the start run is with the server: the analysis is the step, and it is
  // already happening (owner, 09.10.2026).
  'nextStep.running': 'The analysis is running. This step is done once the run is signed — there is nothing to press.',
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

/** "About Analyze" — the accessible name of an information button. */
export function infoAboutLabel(subject: string): string {
  return `About ${subject}`;
}

/** "Next: Analyze — Reads the code and signs a run." — the hint row under the tools. */
export function toolsNextHint(tool: string, purpose: string): string {
  return `Next: ${tool} — ${purpose}`;
}

/** "Open Analyze" — a link to a stage, in the status popover and in "Next step". */
export function openStageLabel(stage: string): string {
  return `${WORKSPACE_SHELL_MESSAGES['status.open']} ${stage}`;
}

/** "1 of 7 done" — the path of the seven tools in the work area, counted from the phase contract. */
export function hubPathDone(done: number, total: number): string {
  return `${done} of ${total} done`;
}

/** "Step 2 of 7 · Design" — where the next step stands on the path. */
export function hubNextPosition(n: number, total: number, stage: string): string {
  return `Step ${n} of ${total} · ${stage}`;
}

/** "Open as IT" — a view button of the work area. */
export function hubViewLabel(view: string): string {
  return `Open as ${view}`;
}

function findingsPhrase(findings: number, high: number | null, where: string): string {
  const head = `${findings} ${findings === 1 ? 'finding' : 'findings'} ${where}`;
  return high && high > 0 ? `${head}, ${high} of ${findings === 1 ? 'it' : 'them'} high severity.` : `${head}.`;
}

/**
 * The line under "Continue with" until Analyze has been opened (ADR-090):
 * "25 findings in the signed run, 4 of them high severity. Analyze shows each
 * one with its line in the code." Without a worklist it names no figure.
 */
export function hubAnalysisReady(findings: number | null, high: number | null): string {
  if (findings === null) return 'The signed run is on record. Analyze shows what the engine found, with its line in the code.';
  if (findings === 0) return 'The signed run reports no finding. Analyze shows what the engine read and what it could not assess.';
  return `${findingsPhrase(findings, high, 'in the signed run')} Analyze shows each one with its line in the code.`;
}

/** The demo's twin of that line — the demo has an engine reading and never a signed run. */
export function demoAnalysisReady(findings: number, high: number): string {
  const figures = findingsPhrase(findings, high, 'in the example').slice(0, -1);
  return `${figures} — a demo run, unsigned. Analyze shows each one with its line in the code.`;
}
