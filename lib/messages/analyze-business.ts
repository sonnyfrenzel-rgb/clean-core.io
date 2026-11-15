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
} as const;
