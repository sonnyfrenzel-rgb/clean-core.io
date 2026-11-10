/**
 * Interface text of the guided tour on the process map —
 * `components/workspace/ProcessTour.tsx` and its entry `ProcessTourEntry.tsx`
 * (owner decision 21.10.2026: a tour for understanding, on the map, in plain
 * business words; it replaced the walk-through of "3.0.20 — with it", part 1).
 *
 * One part of the catalogue in `lib/workspace-messages.ts`. Plain strings
 * only; a sentence with a number in it is a function beside the object. The
 * sentences about each step are not here: they are the engine's
 * (`lib/process-walk-guide.ts`, `lib/process-tour.ts`), data like a rule or a
 * line of ABAP.
 */
export const WORKSPACE_WALK_MESSAGES = {
  'walk.eyebrow': 'Guided tour',
  'walk.title': 'Walk through the process',
  'walk.entryLead': 'A short tour on the process map: first what the process is about, then each part in plain business words, one step at a time.',
  'walk.entryOpen': 'Walk through the process',
  'walk.preparing': 'Reading the steps out of the code…',
  'walk.unavailable': 'The tour could not be read in this browser. Close it and open it again.',
  'walk.mapUnavailable': 'The map could not be drawn in this browser. The card still says each step.',
  'walk.close': 'Close the tour',
  'walk.back': 'Back',
  'walk.next': 'Next',
  'walk.toEnd': 'To the end',
  'walk.chaptersLabel': 'Parts of the process',
  'walk.chapterSelect': 'Part of the process',
  // The overview before the first station (owner decision 22.10.2026): not counted as a step.
  'walk.overview': 'Overview',
  'walk.overviewTitle': 'What this process is about',
  'walk.overviewEmpty': 'The program as a whole is not put into words here: the steps of the tour are what the code shows.',
  'walk.more': 'More about it',
  'walk.backToMap': 'Back to the map',
  'walk.cases': 'The cases, one by one',
  'walk.decides': 'What decides it',
  'walk.data': 'What data it touches',
  'walk.lines': 'Lines in the code',
  'walk.engineReading': 'How the engine reads these lines',
  'walk.noLines': 'This step has no line range of its own in the code.',
  'walk.endTitle': 'That was the process',
  'walk.toDesign': 'Answer the questions for the business in Design',
  'walk.again': 'Start again',
  'walk.keys': 'Arrow keys move between the steps, and on a touch screen a swipe across the card does; Escape closes the tour.',
  'walk.empty': 'The code shows no business step to walk through. The map below shows the whole process.',
  'walk.demoNote': 'Demo: the same tour your own project gets.',
  // Plain wording of the engine's sentences (3.0.20, owner decision 2)
  'walk.worded': 'worded',
  'walk.asRead': 'As read from the code',
  'walk.asReadLead': 'The engine’s own sentences, read from the code. The plain wording above says the same; a model proposed it, and the engine kept only what these sentences hold.',
} as const;

/** "Step 4 of 9". */
export function walkStepOf(index: number, total: number): string {
  return `Step ${index} of ${total}`;
}

/** What a screen reader hears for the map: "Process map, highlighted: Check stock." */
export function walkMapLabel(title: string | null): string {
  return title ? `Process map, highlighted: ${title}` : 'Process map, the whole process';
}

/** "Checks: Material given · Plant 1000" — what a step checks, as the First insights' story said it (moved into the tour, 22.10.2026). */
export function walkChecks(checks: readonly string[]): string {
  return `Checks: ${checks.join(' · ')}`;
}

/** "Can end here: no material" — where a step can end the run. */
export function walkStops(stops: readonly string[]): string {
  return `Can end here: ${stops.join(' · ')}`;
}

/** "Around “Check price”:" — the story step the lines under it belong to, where it is not the station itself. */
export function walkStoryStep(step: string): string {
  return `Around “${step}”:`;
}

/** "Lines 69–72" — the label of a line anchor. */
export function walkLinesLabel(start: number, end: number): string {
  return start === end ? `Line ${start}` : `Lines ${start}–${end}`;
}
