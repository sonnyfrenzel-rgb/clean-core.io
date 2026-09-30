/**
 * Interface text of the demo workspace — components/demo/DemoWorkspaceShell.tsx, DemoTourStop.tsx.
 *
 * One part of the catalogue in `lib/workspace-messages.ts` (DESIGN.md §3,
 * block D, step D.29). Plain strings only; a sentence with a number in it is a
 * function beside the object, so where the number goes is the catalogue's
 * business and not the component's.
 *
 * The marks of the demo (`lib/demo-marks.ts`) and the stations of the tour
 * (`lib/demo-tour.ts`) are not in here: they are data with their own guards.
 */
export const DEMO_WORKSPACE_MESSAGES = {
  // DemoWorkspaceShell — header
  'demo.loading': 'Loading the demo…',
  'demo.pathNav': 'Path',
  'demo.myWorkspace': 'My workspace',
  'demo.lines': 'lines',
  'demo.catalog': 'catalog',
  'demo.viewLabel': 'View',
  'demo.stagesNav': 'Stages',

  // DemoWorkspaceShell — Business
  'demo.processMap': 'Process map',
  'demo.levels': 'Levels of this process',
  'demo.rules': 'Rules in this code',
  'demo.readingRules': 'Reading the rules out of the source…',
  'demo.thisBrowser': 'this browser',
  'demo.sourceLine': 'Source line',
  'demo.withdraw': 'Withdraw',
  'demo.confirm': 'Confirm',
  'demo.standardFit': 'Standard fit',
  'demo.standardFitLead':
    'Successors SAP names for objects this code uses, with the evidence level the catalog gives them.',
  'demo.evidence': 'evidence:',
  'demo.notStated': 'not stated',
  'demo.firstFiveOf': 'The first 5 of',
  'demo.allInPlan': 'All of them in the transformation plan',

  // DemoWorkspaceShell — Management
  'demo.notDetermined': 'not determined',
  'demo.costsTitle': 'Costs appear only as a simulation',
  'demo.costsNoAssumptions':
    'No assumptions have been entered for this demo, so there is no amount to show. A forecast needs a day rate and an investment, and it is always labelled as a simulation with the assumptions it rests on.',
  'demo.startingPoint': 'The measured starting point is the Clean Core Score of this demo run:',
  'demo.enterAssumptions': 'Enter assumptions in Economics',
  'demo.openDecision': 'Open decision',
  'demo.proposedFromEvidence': 'Proposed from the evidence:',
  'demo.realProjectNote':
    'On a real project a confirmation records your account against a signed run. Here there is no run and no account, so it binds nothing and stays in this browser.',
  'demo.confirmedWithdraw': 'Confirmed in this browser · withdraw',
  'demo.handoverTitle': 'What a real handover would still need',
  'demo.openDelivery': 'Open the delivery stage',

  // The tour — status line and stops
  'tour.tour': 'Tour',
  'tour.pausedAt': 'Tour paused at',
  'tour.continuesIn': 'continues in the',
  'tour.view': 'view.',
  'tour.resume': 'Resume tour',
  'tour.goThere': 'Go there',
  'tour.restart': 'Restart tour',
  'tour.invitationLead':
    'An example costs nothing and is analysed by the same engine as this demo. Your own code stays yours.',
  'tour.end': 'End tour',
  'tour.continue': 'Continue tour',
  'tour.next': 'Next',
  'tour.pause': 'Pause tour',
} as const;

type DemoKey = keyof typeof DEMO_WORKSPACE_MESSAGES;
const m = (key: DemoKey): string => DEMO_WORKSPACE_MESSAGES[key];

/** The line under the demo's title: subject · file · 1000 lines · catalog 2026-09. */
export function demoSubtitle(subject: string, sourceFile: string, totalLines: number, catalogVersion: string): string {
  return `${subject} · ${sourceFile} · ${totalLines} ${m('demo.lines')} · ${m('demo.catalog')} ${catalogVersion}`;
}

/** The accessible name of a line anchor: "Source line 42". */
export function demoSourceLineLabel(line: number | string): string {
  return `${m('demo.sourceLine')} ${line}`;
}

/** "evidence: high" — or "evidence: not stated" when the catalog gives none. */
export function demoEvidence(provenance: string | null | undefined): string {
  return `${m('demo.evidence')} ${provenance ?? m('demo.notStated')}`;
}

/** "The first 5 of 12." under a shortened list. */
export function demoFirstFiveOf(total: number): string {
  return `${m('demo.firstFiveOf')} ${total}.`;
}

/** One figure of a management answer, with its reason when it has no value. */
export function demoFigure(label: string, value: string | number | null | undefined, absentReason?: string | null): string {
  return `${label}: ${value ?? absentReason ?? m('demo.notDetermined')}`;
}

/** "The measured starting point is the Clean Core Score of this demo run: 42." */
export function demoStartingPoint(score: number | string): string {
  return `${m('demo.startingPoint')} ${score}.`;
}

/** The route button before it is confirmed: "Confirm Side-by-side". */
export function demoConfirmRoute(route: string): string {
  return `${m('demo.confirm')} ${route}`;
}

/** "Tour paused at 3 of 12." */
export function tourPausedAt(position: string): string {
  return `${m('tour.pausedAt')} ${position}.`;
}

/** "Tour · 3 of 12 continues in the IT view." */
export function tourContinuesIn(position: string, viewLabel: string): string {
  return `${m('tour.tour')} · ${position} ${m('tour.continuesIn')} ${viewLabel} ${m('tour.view')}`;
}

/** "Tour · 3 of 12" over a station. */
export function tourPosition(position: string): string {
  return `${m('tour.tour')} · ${position}`;
}

/** The spoken name of a station: "Tour, 3 of 12: <title>". */
export function tourStationLabel(position: string, title: string): string {
  return `${m('tour.tour')}, ${position}: ${title}`;
}
