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
  'biz.exportDelivery': 'Delivery package and audit pack',
  'biz.exportFailed': 'The file could not be written. Nothing was downloaded.',
  'biz.invite': 'Invite to view',
  'biz.manageAccess': 'Manage',

  // The Business order — components/workspace/WorkspaceShell.tsx.
  'biz.notDeterminedRow': 'Not determined',
} as const;

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
