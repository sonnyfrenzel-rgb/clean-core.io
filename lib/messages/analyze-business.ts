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
  // After the walk-through (plan AB-4, mockup states 5, 6, 9, 9b, 10 and 17; ADR-111).
  'abiz.walkContinue': 'Continue the walk-through',
  'abiz.walkAgain': 'Walk through again',
  'abiz.endingsLabel': 'Ways on',
  'abiz.endTitle': 'That was the process.',
  'abiz.endLead': 'You can stop here. It stays in your workspace.',
  'abiz.redesignTitle': 'Re-design this program',
  'abiz.redesignHappens': 'The Decide page prices the options and takes your decision. For a rebuild it asks the program’s business questions, for each rule whether to keep, change or drop it, and Design then drafts a new clean-core version from your answers; keep, move to standard or retire builds nothing.',
  'abiz.redesignShort': 'Decide in one go: the options priced, each business rule kept, changed or dropped.',
  'abiz.redesignNothingInSap': 'Nothing changes in SAP. The draft stays in your workspace.',
  'abiz.redesignNothingInSapShort': 'Nothing changes in SAP.',
  'abiz.redesignOpen': 'Open Decide',
  'abiz.redesignReader': 'The owner can re-design it.',
  'abiz.whatHappens': 'What happens:',
  'abiz.whatYouDo': 'What you do:',
  'abiz.anotherTitle': 'Analyze another Z program',
  'abiz.anotherLead': 'Upload another program, or start from one of the examples.',
  'abiz.anotherShort': 'Upload one, or start from an example.',
  'abiz.anotherOpen': 'Choose a program',
  'abiz.nextTitle': 'What you can do next',
  'abiz.nextHide': 'Hide',
  'abiz.nextShow': 'What you can do next',
  'abiz.nextViews': 'The other views',
  'abiz.nextViewsNote': 'Same program, same analysis. Use the view switch above.',
  'abiz.nextViewIt': 'the code behind each step, the findings and the clean core level',
  'abiz.nextViewManagement': 'what it costs, the risk and what to decide',
  'abiz.nextTools': 'The other tools',
  'abiz.nextToolsOptional': '(optional)',
  'abiz.gateTitle': 'You have not walked through the process yet.',
  'abiz.gateWalk': 'Walk through first',
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
  'around.questionsFor': 'The technical questions are in the IT view.',
  'around.failed': 'The text around the map could not be read from this source. The map above is not affected.',
  'around.modelNote': 'Worded by the model from the code’s facts and checked against them',
} as const;

/** "What you do: one decision per business rule, 7 rules." (P6: a figure only where it is counted; no duration.) */
export function redesignYouDo(rules: number | null): string {
  if (rules === null) return 'decide on each business rule.';
  if (rules === 0) return 'decide what the new version should do; the code hard-codes no business rule.';
  return `one decision per business rule, ${rules} ${rules === 1 ? 'rule' : 'rules'}.`;
}

/** "You walked through all 9 steps" — right after the walk-through (mockup state 9). */
export function walkedAll(steps: number): string {
  return steps === 1 ? 'You walked through the one step' : `You walked through all ${steps} steps`;
}

/**
 * "Welcome back · you walked through it before" — a later visit (mockup state 17). No day: the browser keeps only
 * that the walk-through was done, not when (privacy policy 1.3; the mockup's dated line is retired).
 */
export const WALKED_BEFORE = 'Welcome back · you walked through it before';

/** "It makes Design easier to follow." — the soft-gate note (mockup state 10), without a duration (O7). */
export function gateBody(tool: string): string {
  return `It makes ${tool} easier to follow.`;
}

/** "Continue to Design". */
export function gateContinue(tool: string): string {
  return `Continue to ${tool}`;
}

/** "Before you open Design" — the note's name for a screen reader. */
export function gateLabel(tool: string): string {
  return `Before you open ${tool}`;
}

/** "And 9 more." — the questions beyond the ones listed; the basket line under them leads into Design. */
export function aroundMoreQuestions(n: number): string {
  return `And ${n} more ${n === 1 ? 'question' : 'questions'}.`;
}
