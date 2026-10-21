/**
 * Interface text of the guided walk-through on the Business view —
 * `components/workspace/ProcessWalkThrough.tsx` and its entry card
 * `ProcessWalkEntry.tsx` (roadmap "3.0.20 — with it", part 1).
 *
 * One part of the catalogue in `lib/workspace-messages.ts`. Plain strings
 * only; a sentence with a number in it is a function beside the object. The
 * sentences about each step are not here: they are the engine's
 * (`lib/process-walk-guide.ts`), data like a rule or a line of ABAP.
 */
export const WORKSPACE_WALK_MESSAGES = {
  'walk.eyebrow': 'Guided walk-through',
  'walk.title': 'Walk through the process in plain words',
  'walk.lead':
    'Step by step, each part of the program said for the business: what happens, why it matters, what decides it, what data it touches and what changes if it goes. The code stays one fold down, every sentence with its lines.',
  'walk.entryLead':
    'Read the process step by step in plain words, then say for each step whether the business still needs it.',
  'walk.entryOpen': 'Open the walk-through',
  'walk.start': 'Start the walk-through',
  'walk.continue': 'Continue the walk-through',
  'walk.read': 'Read the walk-through',
  'walk.preparing': 'Reading the steps out of the code…',
  'walk.preparingLabel': 'the walk-through',
  'walk.close': 'Close',
  'walk.back': 'Back',
  'walk.next': 'Next',
  'walk.toSummary': 'To the summary',
  'walk.phasesLabel': 'Phases of the walk-through',
  'walk.happens': 'What happens here',
  'walk.matters': 'Why it matters',
  'walk.decides': 'What decides it',
  'walk.decidesNone': 'Nothing decides it: it runs every time this part of the process runs.',
  'walk.data': 'What data it touches',
  'walk.dataNone': 'It reads and changes no data in the system itself.',
  'walk.ifGone': 'If it goes',
  'walk.code': 'The code behind this step',
  'walk.engineReading': 'How the engine reads these lines',
  'walk.noCode': 'This step has no line range of its own in the code.',
  'walk.question': 'Does the business still need this step?',
  'walk.questionNote': 'Your answer is a self-declaration on the reconstructed process; the signed run stays as it is.',
  'walk.readerNote': 'Only the owner of the project answers. You can read every step.',
  'walk.notAnswerable': 'This step cannot be answered yet: the reconstructed process is read again first. Answer any step on the map to start.',
  'walk.technicalTitle': 'Technical steps — answered once',
  'walk.technicalLead':
    'These steps keep the program running rather than carry a business rule. One answer covers all of them; each can still be answered on its own on the map.',
  'walk.technicalQuestion': 'Does the business still need what these technical steps do?',
  'walk.technicalSubject': 'All technical steps',
  'walk.technicalDetail': 'One answer for the group',
  'walk.summaryTitle': 'What the business still needs',
  'walk.summaryLead': 'The answers on record, step by step. Open points stay open until they are answered.',
  'walk.summaryKeep': 'Still needed',
  'walk.summaryChange': 'Needed, but changed',
  'walk.summaryDrop': 'No longer needed',
  'walk.summaryClarify': 'To clarify',
  'walk.summaryOpen': 'Not answered yet',
  'walk.summaryNone': 'None.',
  'walk.summaryFirstOpen': 'Go to the first open step',
  'walk.technicalTag': 'Technical',
  // Plain wording of the engine's sentences (3.0.20, owner decision 2)
  'walk.worded': 'worded',
  'walk.asRead': 'As read from the code',
  'walk.asReadLead': 'The engine’s own sentences, read from the code. The plain wording above says the same; a model proposed it, and the engine kept only what these sentences hold.',
  // The public demo (3.0.20, owner decision 7)
  'walk.demoNote': 'Demo: nothing is saved. In your own project the answer is recorded here, with your name.',
  'walk.demoAnswersLabel': 'The answers, shown but not available in the demo',
} as const;

/** "Step 4 of 31". */
export function walkStepOf(index: number, total: number): string {
  return `Step ${index} of ${total}`;
}

/** "Phase 2 of 9: Check requisition". */
export function walkPhaseOf(index: number, total: number, label: string): string {
  return `Phase ${index} of ${total}: ${label}`;
}

/** "31 business steps in 9 phases · 12 technical steps answered once". */
export function walkShape(business: number, phases: number, technical: number): string {
  const steps = `${business} business ${business === 1 ? 'step' : 'steps'} in ${phases} ${phases === 1 ? 'phase' : 'phases'}`;
  return technical > 0 ? `${steps} · ${technical} technical ${technical === 1 ? 'step' : 'steps'} answered once` : steps;
}

/** "12 of 43 steps answered". */
export function walkAnswered(answered: number, total: number): string {
  return `${answered} of ${total} ${total === 1 ? 'step' : 'steps'} answered`;
}

/** "12 steps answered so far." */
export function walkAnsweredSoFar(answered: number): string {
  return `${answered} ${answered === 1 ? 'step' : 'steps'} answered so far.`;
}

/** "Lines 69–72" — the label of a line anchor. */
export function walkLinesLabel(start: number, end: number): string {
  return start === end ? `Line ${start}` : `Lines ${start}–${end}`;
}

/** "3 of 12 technical steps answered". */
export function walkTechnicalAnswered(answered: number, total: number): string {
  return `${answered} of ${total} technical ${total === 1 ? 'step' : 'steps'} answered`;
}

/** "Check requisition · 2/5" — a phase in the row of phases, with how many of its steps are answered. */
export function walkPhaseChip(label: string, answered: number, total: number): string {
  return `${label} · ${answered}/${total}`;
}

/** "Logging and statistics (4)". */
export function walkGroupTitle(label: string, count: number): string {
  return `${label} (${count})`;
}
