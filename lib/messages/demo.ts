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
import { successorSourceNote } from '@/lib/successor-source';

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
  'demo.notDeterminedPoints': 'What the engine could not determine',
  'demo.needLayerMap': 'process map',
  'demo.levels': 'Levels of this process',
  'demo.rules': 'Rules in this code',
  'demo.readingRules': 'Reading the rules out of the source…',
  'demo.thisBrowser': 'this browser',
  'demo.sourceLine': 'Source line',
  'demo.withdraw': 'Withdraw',
  'demo.confirm': 'Confirm',
  'demo.standardFit': 'Standard fit',
  'demo.standardFitLead':
    "Successors named for objects this code uses, each with its source: SAP's catalog or Clean-Core.io's curated mapping.",
  'demo.evidence': 'source:',
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
  'demo.noDecisionRecord': 'A demo keeps no decision record; the route the evidence proposes is further down and stays in this browser.',
  'demo.costsNotEntered': 'No assumptions have been entered for this demo.',
  'demo.answersDetail': 'The answers in detail',
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

/**
 * The catalogue a reader is told about: "2024.FPS02, SAP release list of
 * 2026-09-15 (25,467 entries)". The traceability string the engine records —
 * "2024.FPS02 + CR:latest@407843e4 (25467 entries, fetched 2026-09-15)" — is a
 * revision key with a hash in it; it stays in the run and in a tooltip, and the
 * screen says what it means. A string of another shape is shown as it is.
 */
export function catalogForReader(catalogVersion: string): string {
  const parts = /^(\S+) \+ CR:[^@\s]+@[0-9a-f]+ \((\d+) entries, fetched (\d{4}-\d{2}-\d{2})\)$/.exec(catalogVersion.trim());
  if (!parts) return catalogVersion;
  const [, base, entries, day] = parts;
  return `${base}, SAP release list of ${day} (${Number(entries).toLocaleString('en-US')} entries)`;
}

/** The line under the demo's title: subject · file · 1000 lines · catalog 2024.FPS02, SAP release list of … */
export function demoSubtitle(subject: string, sourceFile: string, totalLines: number, catalogVersion: string): string {
  return `${subject} · ${sourceFile} · ${totalLines} ${m('demo.lines')} · ${m('demo.catalog')} ${catalogForReader(catalogVersion)}`;
}

/** The count on the Need & process layer of the demo: "11 rules". */
export function demoRuleCount(n: number): string {
  return `${n} ${n === 1 ? 'rule' : 'rules'}`;
}

/** The accessible name of a line anchor: "Source line 42". */
export function demoSourceLineLabel(line: number | string): string {
  return `${m('demo.sourceLine')} ${line}`;
}

/**
 * "source: SAP catalog", "source: Clean-Core.io curated mapping" — or "source:
 * not stated" when the engine recorded none. A curated pairing is never read as
 * SAP's (`lib/successor-source.ts`, external audit PRV-01).
 */
export function demoEvidence(provenance: string | null | undefined): string {
  return `${m('demo.evidence')} ${provenance ? successorSourceNote(provenance) : m('demo.notStated')}`;
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
