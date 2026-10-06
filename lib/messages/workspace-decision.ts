/**
 * Interface text of the four-option decision block of the Management view
 * (`components/workspace/DecisionOptions.tsx`, ADR-079).
 *
 * One part of the catalogue in `lib/workspace-messages.ts`. The option names and
 * their meanings are data of `lib/decision-options.ts`, and the readings per
 * option are sentences of `lib/decision-option-signals.ts`; this part holds only
 * the frame the component writes itself.
 */
export const WORKSPACE_DECISION_MESSAGES = {
  'decide.optionsLabel': 'The four options',
  'decide.evidence': 'What the evidence says',
  'decide.effort': 'Effort',
  'decide.cost': 'Cost',
  'decide.proposed': 'Proposed by the evidence',
  'decide.chosen': 'Chosen',
  'decide.choose': 'Choose…',
  'decide.chooseInDesign': 'Sign off the route in Design',
  'decide.notOwner': 'Only the owner of the project chooses.',
  'decide.noRun': 'Choosing needs a signed run.',
  'decide.reading': 'Reading the decision on record…',
  'decide.unreadable': 'The decision on record could not be read, so nothing can be chosen right now. Reload the page to try again.',
  'decide.demo': 'A demo is never signed, so nothing is chosen here.',
  'decide.chooseConfirm': 'Choose this option',
  'decide.selfDeclaration':
    'Your account chooses this option — a self-declaration, not an organisational mandate.',
  'decide.replaces': 'It replaces any option chosen before, a route signed off in Design included.',
  'decide.thenConfirm': 'The decision is then a draft. You confirm it below, once nothing blocks it.',
  'decide.reasonLabel': 'Why this option',
  'decide.reasonHelp': 'Kept with the decision. Required: the engine’s route is a rebuild, so another option needs your reason on the record.',
  'decide.reasonMissing': 'Write a reason first.',
  'decide.refused': 'Nothing was chosen.',
  'decide.answerLost': 'No answer came back. The decision was read again.',
  'decide.openEconomics': 'Open in Economics',
  'decide.place.design': 'Open Design',
  'decide.place.tco': 'Open Economics',
  'decide.place.analyze': 'Open Analyze',
  'decide.place.business': 'Check in the Business view',
  'decide.place.it': 'Check in the IT view',
  'decide.place.fit': 'See what stands in the way',
  'decide.statusFacet': 'Decision',
  'decide.otherEdition': 'The other edition',
} as const;

/** "Choose Keep?" */
export function decideChooseTitle(label: string): string {
  return `Choose ${label}?`;
}
