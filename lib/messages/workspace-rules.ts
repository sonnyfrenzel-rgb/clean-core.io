/**
 * Interface text of the rule-editing mode (mockup `s2`)
 * and the first insights — components/workspace/
 * BusinessRulesEditor.tsx and the parts of FirstLook.tsx they added.
 *
 * One part of the catalogue in `lib/workspace-messages.ts` (DESIGN.md §3).
 * Plain strings only; a sentence with a number in it is a function beside the
 * object, so where the number goes is the catalogue's business and not the
 * component's.
 */
import type { ElementState } from '../process-states';
import type { StatesReadRefusal } from '../process-states-client';

export const WORKSPACE_RULES_MESSAGES = {
  // BusinessRulesEditor — reading
  'rules.title': 'Business rules',
  // Owner, 03.10.2026: nothing in the code is edited here — the reader decides
  // what the business needs, per rule. The entry and the title say so.
  'rules.edit': 'Decide on rules',
  'rules.review': 'Review rules',
  'rules.noAnswer': 'No answer yet',
  'rules.openFirst': 'Without an answer',
  'rules.answeredGroup': 'Answered',
  'rules.lead':
    'For each rule the code hard-codes, say what the business needs: keep it, change it on purpose, drop it, or ask for clarification. This changes no line of ABAP and nothing in the signed run; it records your answer.',
  'rules.smallPrint':
    'Your answers carry your name and the server time — a self-declaration, not an organisational mandate. Every recording is a new need revision; earlier ones stay.',
  'rules.keepMeaning': 'The new solution must do the same.',
  'rules.changeMeaning': 'The new solution does it differently — say what instead.',
  'rules.dropMeaning': 'No longer needed — say why.',
  'rules.clarifyMeaning': 'Someone else must answer — say who and what.',
  'rules.clarifyMissing': 'Say who should answer and what the question is — the rule stays open until then.',
  'rules.draftKept': 'Your answers are kept in this browser tab until you record or discard them.',
  'rules.draftRestored': 'Your unrecorded answers from earlier in this tab are back.',
  'rules.reading': 'Reading the rules of this program…',
  'rules.sourceLine': 'Source line',
  'rules.notAnswered': 'Nobody has answered for this rule yet.',
  'rules.meaning':
    'Keep, change or drop states what the business needs — it preserves no line of ABAP and changes nothing in the signed run.',
  'rules.noBaseline':
    'Rules can be confirmed once the process has been reconstructed from a signed run of this source. Run the analysis first.',
  'rules.openAnalyze': 'Open Analyze',
  'rules.baselineTooLarge':
    'The process reconstructed from this program is too large to store, so answers cannot be recorded yet. Nothing was changed.',
  'rules.baselineFailed':
    'The as-is process could not be stored just now, so your answers were not recorded. Try again in a moment.',
  // BusinessRulesEditor — editing
  'rules.editingTitle': 'Decide on the business rules',
  'rules.revisionOne': 'revision 1',
  'rules.required': 'required',
  'rules.decisionFor': 'Decision for',
  'rules.newText': 'New rule text',
  'rules.newTextHelp': 'Plain language; becomes the need of the next revision.',
  'rules.dropReason': 'Reason for dropping',
  'rules.dropPlaceholder': 'Why is this rule no longer needed?',
  'rules.dropMissing':
    'Enter why the rule is dropped — the reason is stored with the revision and shown with the rule.',
  'rules.changeMissing': 'Enter the new rule text — a change without it is a decision nobody can review later.',
  'rules.question': 'Who should answer, and the question',
  'rules.clarifyInfo': 'Clarify items stay open and are not counted as confirmed until answered.',
  'rules.goToField': 'Go to the field',
  'rules.draftTitle': 'This draft',
  'rules.notSaved': 'not saved',
  'rules.untouched': 'Untouched',
  'rules.reasonMissing': 'reason missing',
  'rules.valueSourceMissing': 'value source missing',
  'rules.savingTitle': 'What saving does',
  'rules.savingConfirmedA': 'Each kept, changed or dropped rule shows',
  'rules.savingConfirmedB': 'with your name — a self-declaration, not an organisational mandate.',
  'rules.savingNothingElse':
    'Nothing else changes: the signed run, the reconstructed process and the findings stay exactly as they are.',
  'rules.everySave': 'Every save is a revision.',
  'rules.discard': 'Discard',
  'rules.source': 'Where the value comes from',
  'rules.sourceNew': 'Where the new value comes from',
  'rules.sourcePlaceholder': 'Choose a source',
  'rules.sourceMissing': 'Say where the new value comes from — choose Unknown if nobody knows yet.',
  'rules.sourceUnknown': 'Unknown is an answer: it stays visible as an open point of this rule.',
  'rules.sourceNote': 'Which table, document or regulation',
  'rules.sourceNoteHelp': 'Optional — for example the customizing table or the paragraph of a regulation.',
  'rules.appliesTo': 'Also applies to',
  'rules.appliesToHelp': 'Other rules in the code that decide the same field.',
  // FirstLook — the end state of s0 (moment 4)
  'firstLook.showSource': 'Show source',
  'firstLook.hideSource': 'Hide source',
  'firstLook.sourceLabel': 'The lines this card points to',
  'firstLook.confirmNote': 'No model call · your answers are a self-declaration',
  'firstLook.stripTrace': 'Linked to the code',
  'firstLook.stripConfirmed': 'Rules confirmed',
  'firstLook.stripDecisions': 'Decision points',
  'firstLook.stripOpen': 'Not determined',
  'firstLook.stripRules': 'Rules in the code',
  'firstLook.stripNotDetermined': 'not determined',
  'firstLook.stepsLabel': 'The first steps of the process',
  'firstLook.factsTitle': 'What the figures mean',
  // RuleDecisionFlow — roadmap 3.0.20 (business rules as a guided decision)
  'rules.flowLead':
    'The rules by business topic, the weightiest first. Each says what it protects, an example with values from the code and what happens on either side; the engine proposes an answer, and taking it over is one click. Every answer is yours and carries your name.',
  'rules.flowLeadReader':
    'The rules by business topic, the weightiest first. Each says what it protects, an example with values from the code, what happens on either side, and the answer the engine proposes.',
  'rules.protects': 'What it protects',
  'rules.example': 'Example from the code',
  'rules.sides': 'Either side of the limit',
  'rules.where': 'Where it applies',
  'rules.sidesAndWhere': 'Either side of the limit and where it applies',
  'rules.proposal': 'Proposal',
  'rules.proposed': 'Proposed',
  'rules.otherAnswer': 'Your answer',
  'rules.noteOptional': 'Note (optional)',
  'rules.newValue': 'The new value, in plain words',
  'rules.newValueHelp': 'What the rule should say instead — it becomes the need of the next revision.',
  'rules.theCode': 'The code',
  'rules.nextOpen': 'Next open rule',
  'rules.ownerOnly': 'Only the owner can decide or change this.',
  'rules.apart': 'Set apart — not business decisions',
  'rules.recorded': 'Recorded.',
  'rules.goNext': 'Go to the next open rule',
  'rules.impactHigh': 'High impact',
  'rules.impactMedium': 'Medium impact',
  'rules.impactLow': 'Low impact',
  'rules.topicDone': 'Every rule of this topic has a decision.',
  'rules.allDecided': 'Every rule has a decision.',
  'rules.technicalNote': 'Not a business decision',
} as const;

/** "12 of 30 decided". */
export function rulesDecidedOf(decided: number, total: number): string {
  return `${decided} of ${total} decided`;
}

/** "Take over: Move to configuration". */
export function rulesTakeOver(label: string): string {
  return `Take over: ${label}`;
}

/** "Record: Drop". */
export function rulesRecordDecision(label: string): string {
  return `Record: ${label}`;
}

/** "Keep all 2 technical settings". */
export function rulesKeepTechnical(n: number): string {
  return n === 1 ? 'Keep the technical setting' : `Keep all ${n} technical settings`;
}

/** "Why early: stops the process, decides 2 steps". */
export function rulesWhyEarly(reasons: readonly string[]): string {
  return reasons.length ? `Why it comes early: ${reasons.join(', ')}` : '';
}

/** "Asked by Controller A". */
export function rulesAskedBy(name: string): string {
  return `Asked by ${name}`;
}

/** "The engine proposed: Keep". */
export function rulesProposalWas(label: string): string {
  return `The engine proposed: ${label}`;
}

/** "3 answers" — the size of a session. */
export function rulesSessionAnswers(n: number): string {
  return n === 1 ? '1 answer' : `${n} answers`;
}

/** "Since the session before" — the line under the latest session when there was one. */
export function rulesSincePrevious(hasPrevious: boolean): string {
  return hasPrevious ? 'Answered or changed since the session before, on' : 'The first session on record.';
}

/** "4 decisions". */
export function rulesDecisionCount(n: number): string {
  return n === 1 ? '1 decision' : `${n} decisions`;
}

const DECISION_LABEL: Record<ElementState, string> = {
  keep: 'Keep',
  change: 'Change deliberately',
  drop: 'Drop',
  clarify: 'Clarify',
};

/** The word of one decision. `short` for the draft summary, where "Change" is enough. */
export function rulesDecisionLabel(state: ElementState, short = false): string {
  return short && state === 'change' ? 'Change' : DECISION_LABEL[state];
}

/** "3 of 11 answered" — the progress line of the answering screen. */
export function rulesAnsweredOf(answered: number, total: number): string {
  return `${answered} of ${total} answered`;
}

/** The primary action of the answering screen: what it records. */
export function rulesRecordAnswers(n: number): string {
  return n === 0 ? 'Record answers' : `Record ${n} ${n === 1 ? 'answer' : 'answers'}`;
}

/** "as need revision 2" — beside the primary action, what the recording becomes. */
export function rulesRecordAs(revision: number): string {
  return `Saved as need revision ${revision}, with your name.`;
}

/** The done state of the rules: "All 11 rules are confirmed" / "The one rule is confirmed". */
export function rulesAllConfirmed(total: number): string {
  return total === 1 ? 'The one rule is confirmed' : `All ${total} rules are confirmed`;
}

/** Who confirmed, for the done state: "by you", "by Mara Weber", "by you and 2 others". */
export function rulesConfirmedBy(names: readonly string[], you: boolean): string {
  const others = names.length - (you ? 1 : 0);
  if (you) return others === 0 ? 'by you' : `by you and ${others} ${others === 1 ? 'other' : 'others'}`;
  if (names.length === 1) return `by ${names[0]}`;
  return `by ${names[0]} and ${names.length - 1} ${names.length === 2 ? 'other' : 'others'}`;
}

/** The word of a recorded answer in the rules card: Kept, Changed, Dropped, Clarify. */
export function rulesRecordedWord(state: ElementState): string {
  switch (state) {
    case 'keep':
      return 'Keep';
    case 'change':
      return 'Changed';
    case 'drop':
      return 'Dropped';
    case 'clarify':
      return 'Clarify — open';
  }
}

/** "Rules confirmed 3 of 7." */
export function rulesConfirmedOf(confirmed: number, total: number): string {
  return `Rules confirmed ${confirmed} of ${total}.`;
}

/** Why the confirmations could not be read, in the reader's words — or nothing while they load. */
export function rulesReadRefusal(code: StatesReadRefusal | null): string {
  switch (code) {
    case null:
      return '';
    case 'no-baseline':
      return 'No rule has been confirmed yet.';
    case 'source-moved':
      return 'The source changed since the process was reconstructed, so earlier confirmations do not apply to it.';
    case 'no-source':
      return 'This project has no source, so there are no rules to confirm.';
    case 'source-too-large':
      return 'This source is too large to confirm rules in one request.';
    case 'format-version':
      return 'The confirmations were written in a shape this build cannot read.';
    case 'not-found':
    case 'unreachable':
      return 'What has been confirmed could not be read just now.';
  }
}

/** "Need revision 2 was not saved." */
export function rulesNotSaved(revision: number): string {
  return `Need revision ${revision} was not saved.`;
}

/** The sentence of the error strip: how many fields, which first, and that nothing was lost. */
export function rulesAttention(fields: number, firstRuleId: string): string {
  return `${fields === 1 ? 'One field needs' : `${fields} fields need`} attention, starting with ${firstRuleId}. Nothing was lost — your other changes are still here.`;
}

/** "Save as need revision 2". */
export function rulesSaveAs(revision: number): string {
  return `Save as need revision ${revision}`;
}

/** The first line of "What saving does". */
export function rulesSavingCreates(revision: number): string {
  return `Creates need revision ${revision} with your account and the server's time. Earlier revisions and the reconstructed process stay unchanged.`;
}

/** The warning under a changed rule's text. */
export function rulesDeviates(anchor: string | null): string {
  return anchor
    ? `Deviates from the code at ${anchor}. The program keeps deciding as written until it is changed.`
    : 'Deviates from the code. The program keeps deciding as written until it is changed.';
}

/** "Unsaved changes · 3 rules". */
export function rulesUnsaved(n: number): string {
  return n === 0 ? 'No unsaved changes' : `Unsaved changes · ${n} ${n === 1 ? 'rule' : 'rules'}`;
}

/** "BR-006 and BR-007 untouched · they stay as reconstructed." */
export function rulesUnchangedLine(ids: readonly string[]): string {
  if (ids.length === 0) return 'Every rule has an answer in this draft.';
  const list = ids.length === 1 ? ids[0] : `${ids.slice(0, -1).join(', ')} and ${ids[ids.length - 1]}`;
  return `${list} untouched · ${ids.length === 1 ? 'it stays' : 'they stay'} as reconstructed.`;
}

/* --------------------------------------------------------------- first look */

/**
 * The rule action of the first look outside Business, where no "Next step"
 * strip carries it — the count of rules still without an answer, never the
 * total (owner, 03.10.2026: "Confirm the rule" stood over a confirmed rule).
 */
export function firstLookConfirmRules(open: number, owner: boolean): string {
  if (!owner) return 'Review the rules';
  return `Decide on ${open} ${open === 1 ? 'rule' : 'rules'}`;
}

/** "3 of 7". */
export function firstLookOf(part: number, whole: number): string {
  return `${part} of ${whole}`;
}

const VALUE_SOURCE_WORDS = {
  customizing: 'Customizing table',
  'business-requirement': 'Business requirement',
  'legal-regulatory': 'Legal or regulatory',
  unknown: 'Unknown',
} as const;

/** The word of a value source. */
export function rulesValueSourceLabel(kind: keyof typeof VALUE_SOURCE_WORDS): string {
  return VALUE_SOURCE_WORDS[kind];
}

/** "Value source: Customizing table · T16FS release strategy". */
export function rulesValueSourceLine(kind: keyof typeof VALUE_SOURCE_WORDS, note: string | null): string {
  return `Value source: ${VALUE_SOURCE_WORDS[kind]}${note ? ` · ${note}` : ''}`;
}

/** "Also applies to BR-010, BR-011". */
export function rulesAppliesToLine(ids: readonly string[]): string {
  return `Also applies to ${ids.join(', ')}`;
}
