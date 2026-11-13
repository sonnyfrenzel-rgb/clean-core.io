/**
 * Interface text of Analyze in the Business view — `components/analyze/AnalyzeBusiness.tsx`
 * (plan `docs/design/analyze-business-first-plan.md` §4.1, AB-2; mockup
 * `docs/roadmap/analyze-business-first-mockup.html`, states 3, 7 and 17).
 *
 * One part of the catalogue in `lib/workspace-messages.ts`. Plain strings
 * only. What the program does is not here: that sentence is the engine's
 * (`businessInShort`, `lib/program-summary-text.ts`), data like a rule or a
 * line of ABAP.
 */
export const ANALYZE_BUSINESS_MESSAGES = {
  'abiz.lead': 'What this program does, read from its code.',
  'abiz.summaryTitle': 'What this program does',
  'abiz.summaryPending': 'Reading what the program does from its code …',
  'abiz.summaryNone': 'The code does not say in a sentence what this program does. The map below shows what it does step by step.',
  'abiz.walk': 'Walk me through it',
  'abiz.lookAround': "I'll look around myself",
  'abiz.lookAroundLine': 'Look around. The walk-through is here when you want it:',
  'abiz.softGate': 'Best after the business walk-through',
  'abiz.codeTitle': 'The code behind it',
  'abiz.codeClose': 'Close the code',
  'abiz.codeLine': 'The name on the map is written from these lines.',
  'abiz.mapHint': 'Click a step to see its code lines.',
  'abiz.belowTitle': 'More about this program',
  'abiz.loading': 'Loading the project …',
  'abiz.loadFailed': 'This project could not be loaded',
  'abiz.loadFailedBody': 'The read failed, usually because of the connection. Nothing says the project is gone.',
  'abiz.retry': 'Try again',
  // The text around the map — components/analyze/AroundTheMap.tsx (plan AB-6). The sentences are the engine's
  // (lib/around-the-map.ts) or a checked model wording of them; only the frame is here.
  'around.title': 'About this program',
  'around.summaryWriting': 'Reading what the program does from its code …',
  'around.runsTitle': 'How it runs',
  'around.runsWaiting': 'Written step by step from the code …',
  'around.runsNone': 'The code shows no steps with a line to tell this by. The map above shows what it does.',
  'around.youAreHere': 'you are here',
  'around.whyTitle': 'Why it exists',
  'around.whyWaiting': 'Reading the program’s names …',
  'around.whyNone': 'Why the program exists is not written in its code.',
  'around.whyAuthor': 'The header comment says:',
  'around.whoTitle': 'Who is involved',
  'around.whoWaiting': 'Reading the roles …',
  'around.whoNone': 'The code names no one who acts in it.',
  'around.questionsTitle': 'Questions to settle with the business',
  'around.questionsWaiting': 'Collecting the questions the code cannot answer …',
  'around.questionsNone': 'The code raises no question for the business that the engine can name.',
  'around.questionsFor': 'For the process owner. IT has its own questions in the IT view.',
  'around.failed': 'The text around the map could not be read from this source. The map above is not affected.',
  'around.modelNote': 'Worded by the model from the code’s facts and checked against them',
} as const;

/** "And 9 more." — the questions beyond the ones listed; the basket line under them leads into Design. */
export function aroundMoreQuestions(n: number): string {
  return `And ${n} more ${n === 1 ? 'question' : 'questions'}.`;
}
