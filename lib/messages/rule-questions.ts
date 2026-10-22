/**
 * The words of the questions for the business — `components/design/RuleQuestions.tsx`,
 * `components/workspace/RuleBasketLine.tsx` and the technical rules' one click in
 * the rule register (owner decision 21.10.2026, the new set-up of the business
 * rules). Plain business English; no rule id, no impact tag, no code on top.
 */
export const RULE_QUESTION_MESSAGES = {
  'questions.title': 'Questions for the business',
  'questions.lead':
    'The limits and case distinctions a business sets — amounts, tolerances, types, units, deadlines — as a few questions, the weightiest first. Answer what you can and stop any time; the rest waits here.',
  'questions.leadReader': 'The limits and case distinctions a business sets, as a few questions, with the answers on record.',
  'questions.ownerOnly': 'Only the owner of the project answers; you see the answers on record.',
  'questions.reading': 'Reading the rules…',
  'questions.none': 'The engine found no limit or case distinction in this program that a business sets.',
  'questions.acceptAll': 'Accept all proposals',
  'questions.acceptAllNote':
    'This confirms the code as it stands for every open question — a self-declaration of your account, not a check. Then answer only what differs.',
  'questions.answerYes': 'Yes, that’s right',
  'questions.answerChange': 'No, it should be …',
  'questions.answerDrop': 'We don’t need it any more',
  'questions.answerUnsure': 'I don’t know / someone else',
  'questions.newValue': 'What should it be?',
  'questions.newValueHelp': 'The new value in plain words, for example “300 EUR” or “order types ZOR and ZEX”.',
  'questions.who': 'Who can answer it?',
  'questions.whoHelp': 'A name or a role, for example “accounts payable”.',
  'questions.dropReason': 'Why not (optional)',
  'questions.record': 'Record the answer',
  'questions.cancel': 'Cancel',
  'questions.more': 'More about it',
  'questions.code': 'The code',
  'questions.allAnswered': 'Every question has an answer.',
  'questions.recorded': 'Recorded. You can stop here — the open questions wait in Design.',
  'questions.answeredTitle': 'Answered',
  'questions.yourAnswer': 'Answer on record',
  'questions.changeAnswer': 'Change the answer',
  'questions.architecture': 'Architecture options for IT',
  'questions.architectureLead':
    'For the answered rules, Design proposes where the value lives in the new solution. A proposal, not a decision — IT takes it or leaves it; the business answer stays.',
  'questions.optionConfigure': 'Keep the value in configuration',
  'questions.optionStandard': 'Meet the need with SAP standard',
  'questions.takeOption': 'Take the proposal',
  'questions.optionTaken': 'Taken',
  'questions.register': 'Every rule — technical ones and undetermined ones included — is explained with its lines and code in the rule register of the IT view.',
  'questions.openRegister': 'Open the rule register',
  'questions.openDesign': 'Answer them in Design',
  'questions.undeterminedTag': 'Not determined',
  'questions.recommended': 'Recommended',
  'questions.recommendedReason': 'Why recommended:',
  'questions.itPointer': 'IT checks where these values live:',
  'design.generate': 'Generate the design',
  'design.tryAgain': 'Try again',
  'design.writeWithoutOpen': 'Write it without the open answers',
  'design.writeWithoutOpenNote': 'The design then names these questions as open; answer them later and regenerate.',
  'design.readingQuestions': 'Reading the business questions first…',
  'design.answersMovedTitle': 'Written before the latest business answers',
  'design.answersMoved': 'The business answers changed after this design was written. Regenerate it so the design carries them.',
  'questions.technicalNote':
    'Plausibility checks, technical limits, test data and run options. Confirming them says they stay as coded; it is recorded like any answer and is not counted as confirmed by the business.',
} as const;

/** "3 of 7 questions answered". */
export function questionsAnsweredOf(answered: number, total: number): string {
  return `${answered} of ${total} ${total === 1 ? 'question' : 'questions'} answered`;
}

/** "Answer the 3 open business questions first". */
export function designOpenQuestions(n: number): string {
  return n === 1 ? 'Answer the 1 open business question first' : `Answer the ${n} open business questions first`;
}

/** "3 proposals in the IT view". */
export function itProposals(n: number): string {
  return n === 1 ? '1 proposal in the IT view' : `${n} proposals in the IT view`;
}

/** "4 more questions after these". */
export function questionsLater(n: number): string {
  return n === 1 ? '1 more question after these' : `${n} more questions after these`;
}

/** "7 questions for the business · 6 technical rules stay as coded". */
export function basketLineText(questions: number, technical: number): string {
  const q = questions === 1 ? '1 question for the business' : `${questions} questions for the business`;
  const t = technical === 1 ? '1 technical rule stays as coded' : `${technical} technical rules stay as coded`;
  return `${q} · ${t}`;
}

/** "2 not determined". */
export function basketUndetermined(n: number): string {
  return `${n} not determined`;
}

/** "Technical rules stay as coded (6)". */
export function technicalStayAsCoded(n: number): string {
  return `Technical rules stay as coded (${n})`;
}
