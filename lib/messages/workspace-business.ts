/**
 * Interface text of the Business view's map, source column and the head
 * actions of the object page — WorkspaceProcess, HeadActions (mockup s1).
 *
 * One part of the catalogue in `lib/workspace-messages.ts`. Plain strings
 * only; a sentence with a number in it is a function beside the object.
 */
export const WORKSPACE_BUSINESS_MESSAGES = {
  // The map and its source column — components/workspace/WorkspaceProcess.tsx.
  'biz.mapTitle': 'Process, reconstructed from the code',
  'biz.needAndProcess': 'Need & process',
  'biz.mapReading': 'Reading the process out of the source the active run signed…',
  'biz.mapLoadingLabel': 'the process map',
  'biz.mapAbsentTitle': 'No process map yet',
  'biz.mapNoRun':
    'The map is drawn from the source a signed analysis read. This project has source but no analysis yet, so nothing has been drawn.',
  'biz.mapChanged':
    'The map is drawn only from the source the active analysis signed. The source on this project no longer matches it, or the analysis did not record it, so no map is drawn rather than one with wrong line anchors. Run the analysis again to draw it.',
  'biz.openAnalyze': 'Open Analyze',
  'biz.mapSignTitle': 'Your full process map',
  'biz.mapSigning':
    'Signing the reading: the server reads the same source again and records it, without a model call. The map is drawn from that signed run, so every step keeps its line.',
  'biz.mapSignFailed': 'The reading could not be signed, so no map is drawn',
  'biz.mapSignRetry': 'Try again',
  'biz.mapSignLead':
    'The map is drawn only from a signed run, so every step keeps its line. Signing reads the same source again on the server and records it — the engine alone, without a model call.',
  'biz.mapSign': 'Sign the reading and draw the map',
  // The start with the model on (owner decision 03.10.2026, ADR-072).
  'biz.mapSigningModel':
    'Signing: the server reads the same source again and signs it as one run, with the narrative if the model wrote one in time. The map is drawn from that signed run, so every step keeps its line.',
  'biz.mapSignLeadModel':
    'The map is drawn only from a signed run, so every step keeps its line. Signing reads the same source again on the server and asks the model for the analysis narrative, which goes into the same run.',
  'biz.narrativeWriting': 'Writing the narrative (model)…',
  'biz.narrativeContinue': 'Go on without the narrative',
  'biz.narrativeMissingTitle': 'The narrative was not written',
  'biz.narrativeWriteLater': 'Write the narrative in Analyze',
  'biz.columnLabel': 'Source column',
  'biz.tabSource': 'Source',
  'biz.tabNotDetermined': 'Not determined',
  'biz.tabStepsByLine': 'Steps by line',
  'biz.sourceHint':
    'Select a step on the map, in the step list or under Steps by line, and its lines are marked here. A line under Not determined opens here too.',
  'biz.showFullSource': 'Show full source',
  'biz.showMarkedOnly': 'Show only the marked lines',
  'biz.saveNoProject': 'This project could not be identified, so nothing was saved.',
  'biz.saveOvertaken':
    'This process was saved somewhere else while this screen was open, so nothing was saved. The notice at the top says how to go on.',

  // The head of the object page — components/workspace/HeadActions.tsx.
  'biz.eyebrowProject': 'Project',
  'biz.export': 'Export',
  'biz.exportBpmn': 'Process as BPMN 2.0 file',
  'biz.exportBpmnAbsent': 'The BPMN file is written from the source a signed analysis read. There is none for this project yet.',
  'biz.exportPrint': 'Print this view',
  'biz.exportOnePager': 'Steering one-pager (1 page, print or PDF)',
  'biz.exportDelivery': 'Delivery package and audit pack',
  'biz.exportFailed': 'The file could not be written. Nothing was downloaded.',
  'biz.invite': 'Invite to view',
  'biz.manageAccess': 'Manage',

  // The Business order — components/workspace/WorkspaceShell.tsx.
  'biz.moreAboutProcess': 'More about this process',

  // The business-first opening — components/workspace/BusinessOpening.tsx (owner, 03.10.2026).
  // What the program is for, before the steps — components/workspace/ProgramInShort.tsx (owner, 12.10.2026).
  'biz.inShortTitle': 'In short',
  'biz.inShortProposalNote': 'purpose',
  'biz.inShortEngine': 'Read from the code:',
  // First insights in at most five blocks, one screen (roadmap 3.0.21, owner decisions 22.10.2026).
  'biz.firstLookLead': 'What this program does, read from its code. For understanding — nothing to decide here.',
  'biz.startedBy': 'Started by',
  'biz.goesIn': 'Goes in',
  'biz.comesOut': 'Comes out',
  'biz.stepsTitle': 'Step by step',
  'biz.stepsDetailTitle': 'What each step checks, and where it can end',
  'biz.stepsDetailNone': 'No step checks anything a business reader decides on.',
  'biz.toDocumentation': 'In Documentation',
  'biz.toItView': 'In the IT view',
  'biz.storyNamesNote': 'names',
  'biz.storyNone': 'The steps of this program could not be read from the source. The map below shows what could be drawn.',
  'biz.decidesTitle': 'What it decides',
  'biz.decidesNone': 'No value is hard-coded as a rule in this program.',
  'biz.changesTitle': 'What it changes',
  'biz.changesNoData': 'The code shows no change to stored data.',
  'biz.howRead': 'How this was read',

  // "Your next step" — components/workspace/BusinessNextStep.tsx (owner, 03.10.2026).
  'biz.nextRulesLabel': 'Decide on the business rules',
  'biz.nextRulesNote': 'No model call · not counted · your answers are a self-declaration',

  // Answering the steps — components/workspace/WorkspaceProcess.tsx (owner, 03.10.2026).
  'biz.stepNeedTitle': 'Does the business still need this step?',
} as const;

/**
 * The wait for the start's narrative, in seconds actually waited — never a
 * percentage, because nothing knows how far a model is.
 */
export function bizNarrativeWaited(seconds: number, ceilingSeconds: number): string {
  return `${seconds} s so far. The run is signed after ${ceilingSeconds} s at the latest, with the narrative or without it.`;
}

/** What "Go on without the narrative" does, said beside it. */
export function bizNarrativeContinueNote(): string {
  return 'Signs the engine’s reading now. The model call already sent still finishes on the server; it uses none of your analysis runs.';
}

/** What writing the narrative later costs: a second run of the same source, with the model. */
export function bizNarrativeLaterCost(quota: string): string {
  return `Analyze runs the analysis again with the model and signs a new run: ${quota} · Calls the model.`;
}

/** "L380 to L412", spoken. */
export function bizLinesLabel(start: number, end: number): string {
  return start === end ? `Source line ${start}` : `Source lines ${start} to ${end}`;
}

/** Under a window of the source. */
export function bizShowingLines(first: number, last: number): string {
  return `Showing lines ${first} to ${last}`;
}

/** "Read access: only you" — the owner's own line in the head. */
export function bizReadAccess(readers: number): string {
  if (readers === 0) return 'Read access: only you';
  return `Read access: you and ${readers} ${readers === 1 ? 'reader' : 'readers'}`;
}

/** "+2" after the initials shown. */
export function bizMoreReaders(more: number): string {
  return `+${more}`;
}

/** Why the rules come first: how many of the hard-coded rules have no answer yet. */
export function bizNextRulesReason(open: number, total: number): string {
  if (total === 1) return 'The one rule the code hard-codes has no answer yet. Say whether the business still needs it — keep, change, drop or clarify.';
  if (open === total) return `None of the ${total} rules the code hard-codes has an answer yet. Say for each whether the business still needs it — keep, change, drop or clarify.`;
  return `${open} of the ${total} rules the code hard-codes ${open === 1 ? 'has' : 'have'} no answer yet. Say for each whether the business still needs it.`;
}

/** The one primary action while rules are open: "Decide on 3 rules". */
export function bizNextRulesAction(open: number): string {
  return `Decide on ${open} ${open === 1 ? 'rule' : 'rules'}`;
}

/** What follows the rules — the next phase from the one phase contract. */
export function bizNextThen(label: string, action: string): string {
  return `After that: ${label} — ${action}.`;
}

/** "For each trip:" — the loop a step of the story runs in. */
export function bizStoryWithin(loop: string): string {
  return `${loop}:`;
}

/** What a step checks, in the plain labels of its decision points. */
export function bizStoryChecks(checks: readonly string[], more: number): string {
  return `Checks: ${checks.join(' · ')}${more > 0 ? ` and ${more} more` : ''}`;
}

/** Where a step can end the run. */
export function bizStoryStops(stops: readonly string[]): string {
  return `Can end here: ${stops.join(' · ')}`;
}

/**
 * The technical checks of a step, counted and folded — roadmap 3.0.20 (owner
 * report 21.10.2026: "Checks: Call failed or no day · Code given · … and 23 more").
 */
export function bizStoryTechnical(n: number, alone: boolean): string {
  const what = `${n} technical ${n === 1 ? 'check' : 'checks'} (data found, input filled, run options)`;
  return alone ? `${what.charAt(0).toUpperCase()}${what.slice(1)} — no business decision.` : `Plus ${what} — no business decision.`;
}

/** The program's own demo cases, set apart from the steps (3.0.20). */
export function bizTestData(cases: number): string {
  return cases > 0
    ? `When its demo switch is on, the program runs on ${cases} test ${cases === 1 ? 'case' : 'cases'} of its own. This is test data for trying it out.`
    : 'When its demo switch is on, the program runs on test data of its own, for trying it out.';
}

/** The technical settings among the rules, counted — "What it decides" lists business rules only (3.0.20). */
export function bizTechnicalSettings(n: number): string {
  return `Technical settings, ${n} — caps, decimals and other settings of the program itself; not business decisions.`;
}

/**
 * "What it decides" when the code holds rules but none is a question for the
 * business (3.0.21) — never "no value is hard-coded" while the basket line
 * under it counts technical rules.
 */
export function bizDecidesNoQuestion(technical: number, undetermined: number): string {
  if (technical > 0 && undetermined === 0) {
    return `No question for the business: the ${technical === 1 ? 'one value' : `${technical} values`} fixed in the code ${technical === 1 ? 'is a technical setting' : 'are technical settings'}.`;
  }
  return 'No question for the business could be read from the values fixed in the code.';
}

/** "and 7 more". */
export function bizMoreItems(n: number): string {
  return `and ${n} more`;
}

