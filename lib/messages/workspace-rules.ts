/**
 * Interface text of the rule-editing mode (mockup `s2`), the standard-fit table
 * (`s3`) and the first look's build-up (`s0`) — components/workspace/
 * BusinessRulesEditor.tsx, StandardFitTable.tsx, FirstLookBuildUp.tsx and the
 * parts of FirstLook.tsx they added.
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
  'rules.edit': 'Edit rules',
  'rules.reading': 'Reading the rules of this program…',
  'rules.sourceLine': 'Source line',
  'rules.notAnswered': 'Nobody has answered for this rule yet.',
  'rules.meaning':
    'Keep, change or drop states what the business needs — it preserves no line of ABAP and changes nothing in the signed run.',
  'rules.noBaseline':
    'Rules can be confirmed once the process has been reconstructed from a signed run of this source. Run the analysis first.',
  'rules.openAnalyze': 'Open Analyze',
  // BusinessRulesEditor — editing
  'rules.editingTitle': 'Business rules — editing',
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
  'rules.question': 'Question to clarify',
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
  // StandardFitTable
  'fit.reading': 'Comparing the rules with SAP standard…',
  'fit.title': 'Standard fit by capability',
  'fit.titleNote': 'a missing catalog hit proves nothing',
  'fit.legend': 'Legend',
  'fit.sortByLevel': 'Sort by evidence',
  'fit.sortByOrder': 'Sort by order in the code',
  'fit.colCapability': 'Capability',
  'fit.colRules': 'Rules',
  'fit.colCandidate': 'Standard candidate',
  'fit.colEvidence': 'Evidence',
  'fit.colFit': 'Fit',
  'fit.colNext': 'Next',
  'fit.ruleChanged': 'changed',
  'fit.ruleDropped': 'dropped',
  'fit.noCatalogHit': 'No catalog hit',
  'fit.detailSubject': 'Decides on',
  'fit.detailObjects': 'Reads or writes',
  'fit.detailNoObjects': 'The routines of these rules read or write no SAP object.',
  'fit.detailNext': 'Next:',
  'fit.noCapabilities':
    'No business rule with a readable subject, so there is no capability to compare. That is the boundary of the rule reader, not a statement about your process.',
  'fit.scopeItemsNotDetermined':
    'Scope items: not determined — no scope-item catalogue is connected, and none is guessed.',
  'fit.unassigned': 'the field these rules decide could not be read, so they belong to no capability.',
  'fit.usersTitle': 'What changes for users',
  'fit.futureNotDetermined': 'Where it moves to: not determined.',
  'fit.scenariosTitle': 'Counter-check scenarios',
  'fit.tasksTitle': 'Check tasks',
  'fit.tasksLead': 'Open points become tasks, not verdicts.',
  'fit.tasksNone': 'Nothing is open — every construct fell inside what the detectors judge.',
  'fit.complianceTitle': 'Compliance hints',
  'fit.complianceNote': 'from tables read',
  'fit.complianceNone':
    'No table the program reads belongs to a family that usually calls for a compliance check.',
  'fit.complianceLead': 'Each hint is a check to make, not a classification.',
  // FirstLookBuildUp
  'buildUp.names': 'names',
  'buildUp.plainNames': 'plain names',
  'buildUp.codeLabel': 'The source, as it is being read',
  'buildUp.processLabel': 'The process, growing out of the lines that were read',
  'buildUp.legendNode': 'process node',
  'buildUp.legendData': 'table read or written',
  'buildUp.railLabel': 'What the reading does, in order',
  'buildUp.railNamesPlain': 'plain names, no model',
  'buildUp.railNamesProposed': 'names proposed by a model',
  'buildUp.railMapDrawn': 'drawn from the signed run',
  'buildUp.railMapRunning': 'signing the reading',
  'buildUp.railMapFailed': 'not signed',
  'buildUp.railMapUnsigned': 'needs a signed run',
  'buildUp.reading': 'Reading…',
  'buildUp.mapTitle': 'Your full process map',
  'buildUp.mapDrawn':
    'Signed: the server read the same source again and recorded it, without a model call. The full map stands right under your process.',
  'buildUp.mapRunning':
    'The server reads the same source again and signs the reading — no model call. The map is drawn from that signed run, so every step keeps its line.',
  'buildUp.mapFailed':
    'The reading could not be signed, so the full map is not drawn. The reason and a way to try again stand where the map goes.',
  'buildUp.mapUnsigned':
    'The full map is drawn only from a signed run, so every step keeps its line. Where it goes, the page says how to get one.',
  // FirstLook — the end state of s0 (moment 4)
  'firstLook.showSource': 'Show source',
  'firstLook.hideSource': 'Hide source',
  'firstLook.sourceLabel': 'The lines this card points to',
  'firstLook.processTitle': 'Main line of the process',
  'firstLook.processLabel': 'The main line of the process, each step with the line it was read from',
  'firstLook.processNone': 'The main line could not be drawn from this source.',
  'firstLook.openMap': 'Open the full map',
  'firstLook.confirmNote': 'No model call · your answers are a self-declaration',
  'firstLook.stripTrace': 'Linked to the code',
  'firstLook.stripConfirmed': 'Rules confirmed',
  'firstLook.stripDecisions': 'Decisions',
  'firstLook.stripOpen': 'Not determined',
  'firstLook.stripRules': 'Rules in the code',
  'firstLook.stripNotDetermined': 'not determined',
  'firstLook.stepsLabel': 'The first steps of the process',
  'firstLook.factsTitle': 'What the figures mean',
} as const;

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

/* ------------------------------------------------------------ standard fit */

/** "EBAN → released successor API_PURCHASEREQ — to verify". */
export function fitCandidateLine(object: string, successor: string): string {
  return `${object} → released successor ${successor} — to verify`;
}

/** Why a fit is not determined, in five words. The full reason is in the legend. */
export function fitNotDeterminedShort(reason: 'no-evidence' | 'pointer-only' | null): string {
  return reason === 'pointer-only' ? 'a catalog hit is not a fit' : 'no hit proves nothing either way';
}

/** The next task, short — the engine's full sentence is in the row's details. */
export function fitNextShort(level: 'E0' | 'E1' | 'E2' | 'E3' | 'E4'): string {
  switch (level) {
    case 'E0':
      return 'Name a standard process to compare';
    case 'E1':
      return 'Follow the catalog pointer';
    case 'E2':
      return 'Run a counter-check scenario';
    case 'E3':
      return 'Accept in the target system';
    case 'E4':
      return 'Nothing open';
  }
}

/** "BR-003 is dropped — no standard needed." */
export function fitDroppedLine(ids: readonly string[]): string {
  return `${ids.join(', ')} ${ids.length === 1 ? 'is' : 'are'} dropped — no standard needed.`;
}

/** The counts under the table. */
export function fitCountsLine(withCandidate: number, notDetermined: number, consulted: boolean): string {
  if (!consulted) return 'No catalog was consulted, so no candidate is shown.';
  return `Counts: ${withCandidate} ${withCandidate === 1 ? 'capability has' : 'capabilities have'} a candidate from the catalog (SAP's data or Clean-Core.io's curated mapping); the fit of ${notDetermined} is not determined.`;
}

/** Why the table could not be built. */
export function fitReadRefusal(code: 'no-source' | 'source-too-large' | 'unreachable'): string {
  switch (code) {
    case 'no-source':
      return 'No source is staged on this project, so nothing was compared.';
    case 'source-too-large':
      return 'This source is larger than one comparison reads. Analyse the object in parts.';
    case 'unreachable':
      return 'The comparison with SAP standard could not be read just now.';
  }
}

/** The collapsed row of "What changes for users". */
export function fitUsersSummary(total: number, pointers: number, training: number): string {
  if (total === 0) return 'The code names no screen, transaction or report a user works with.';
  return `${total} ${total === 1 ? 'place' : 'places'} where users meet this program · ${pointers} with a catalog pointer · ${training} training ${training === 1 ? 'hint' : 'hints'} · how many people: not determined.`;
}

/** The collapsed row of "Counter-check scenarios". */
export function fitScenariosSummary(total: number, runnable: number, blocked: number): string {
  if (total === 0) return 'No rule produced a scenario that could be written down.';
  return `${runnable} of ${total} can be prepared as written · ${blocked} need a field named first · none has been run.`;
}

/** "Local function-module call (6)". */
export function fitTasksCount(label: string, n: number): string {
  return n > 1 ? `${label} (${n})` : label;
}

/* --------------------------------------------------------------- first look */

const BUILD_UP_STAGES = {
  'code-read': 'Code read',
  'process-recognised': 'Process recognised',
  'business-language': 'In business language',
  rules: 'Rules in the code',
  'not-determined': 'Not determined',
  map: 'Process map',
} as const;

/** The stage's name in the build-up header — the labels of DESIGN.md §5.2. */
export function buildUpStageLabel(stage: keyof typeof BUILD_UP_STAGES): string {
  return BUILD_UP_STAGES[stage];
}

/** "Reading Z_MM_PO_APPROVAL.abap, 668 lines · FORM CHECK_LIMIT". */
export function buildUpLive(sourceName: string, lines: number, container: string | null): string {
  return `Reading ${sourceName}, ${lines} lines${container ? ` · ${container}` : ''}`;
}

/** One counter of the build-up. */
export function buildUpCounter(kind: 'lines' | 'tables' | 'nodes' | 'decisions', n: number, of?: number): string {
  switch (kind) {
    case 'lines':
      return `Lines ${n} of ${of ?? n}`;
    case 'tables':
      return `Tables ${n}`;
    case 'nodes':
      return `Process nodes ${n}`;
    case 'decisions':
      return `Decisions ${n}`;
  }
}

/** The rail's result for "Code read": "98 lines · 2 tables". */
export function buildUpRailRead(lines: number, tables: number): string {
  return `${lines.toLocaleString('en')} ${lines === 1 ? 'line' : 'lines'} · ${tables} ${tables === 1 ? 'table' : 'tables'}`;
}

/** The rail's result for "Process recognised": "10 nodes · 1 decision". */
export function buildUpRailProcess(nodes: number, decisions: number): string {
  return `${nodes} ${nodes === 1 ? 'node' : 'nodes'} · ${decisions} ${decisions === 1 ? 'decision' : 'decisions'}`;
}

/** The rail's result for the rules: "3 hard-coded" or "none hard-coded". */
export function buildUpRailRules(n: number): string {
  return n === 0 ? 'none hard-coded' : `${n} hard-coded`;
}

/** The rail's result for the open points: "7 points" or "none". */
export function buildUpRailOpen(n: number): string {
  return n === 0 ? 'none' : `${n} ${n === 1 ? 'point' : 'points'}`;
}

/** "grows out of L87". */
export function buildUpGrowsOut(anchor: string): string {
  return `grows out of ${anchor}`;
}

/** "+ 20 more names". */
export function buildUpMoreNames(n: number): string {
  return `+ ${n} more ${n === 1 ? 'name' : 'names'}`;
}

/** The primary action of the first look's end state. */
export function firstLookConfirmRules(n: number, owner: boolean): string {
  const rules = n === 1 ? 'the rule' : `the ${n} rules`;
  return owner ? `Confirm ${rules}` : `Review ${rules}`;
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
