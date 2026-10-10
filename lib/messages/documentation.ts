/**
 * Interface text of the Documentation stage's business view — the glance band,
 * the SOP step strip and the RACI matrix (`components/documentation/BusinessGlance.tsx`,
 * `components/documentation/BusinessLayer.tsx`), owner 03.10.2026.
 *
 * One part of the catalogue in `lib/workspace-messages.ts`. Plain strings
 * only; a sentence with a number or a name in it is a function beside the object.
 */
import type { BusinessCallout, GlanceHeadline, GlanceObject, RaciLetter, RaciStepGap } from '@/lib/business-summary';

export const DOCUMENTATION_MESSAGES = {
  'doc.glanceLabel': 'For the business',
  'doc.glanceTitle': 'What this process does for the business',
  'doc.glanceReading': 'Reading the process out of the code…',
  'doc.glanceNone': 'The process has not been read from a signed analysis yet.',
  'doc.glanceDerived': 'Counted from the code. Each point names its line or rule.',
  'doc.levelPending': 'level',
  'doc.directWriteLevels': 'Clean-core level of the SAP data it changes:',
  'doc.notDeterminedNone': 'Nothing the detectors stepped over. That is the limit of what they check, not a clean bill.',
  'doc.notDeterminedReading': 'Checking what the detectors could not judge…',
  'doc.notDeterminedNoSource': 'No signed source here, so nothing was checked.',

  'doc.sopTitle': 'Business SOP',
  'doc.sopLead': 'Who does what, step by step. Written by a model; steps and lines are the code reading.',
  'doc.sopOutcomeMissing': 'No outcome written',
  'doc.sopNotInProcess': 'Not a step of the process read from the code',
  'doc.sopResponsible': 'Responsible',
  'doc.sopFull': 'Full SOP',
  'doc.sopFullSummary': 'Narrative and exception handling per step.',
  'doc.sopNarrative': 'Narrative',
  'doc.sopException': 'If the step cannot be completed',
  'doc.sopStepColumn': 'Step',

  'doc.raciTitle': 'Who is responsible',
  'doc.raciNoRows': 'The layer assigns no roles.',
  'doc.raciNoGaps': 'Every step has one Accountable and a Responsible.',
  'doc.raciLegend': 'Legend',
  'doc.raciR': 'Responsible',
  'doc.raciA': 'Accountable',
  'doc.raciC': 'Consulted',
  'doc.raciI': 'Informed',
  'doc.raciGapCheck': 'Check',
  'doc.raciGapNoAccountable': 'No Accountable named — to clarify',
  'doc.raciGapSeveralAccountable': 'Several Accountable',
  'doc.raciGapNoResponsible': 'No Responsible',
  'doc.raciOk': 'Complete',
  'doc.raciCaption': 'RACI matrix: process steps by role',
  'doc.raciMoreRoles': 'More roles the proposal names',
  'doc.raciKey': 'Role names',
  'doc.raciProposalNote': 'The roles are a proposal for the business to confirm.',
  'doc.businessRegenerate': 'Regenerate SOP and RACI',

  'doc.businessOfferTitle': 'Business SOP and RACI',
  'doc.businessOfferLead':
    'Who does what at each step, who is accountable, and the controls — proposed by a language model from the process documentation read from your code. The steps and their lines stay the code reading.',
  'doc.businessGenerate': 'Generate the business SOP & RACI',
  'doc.businessBlockedTitle': 'Not yet possible',
  'doc.businessNeedsDocumentation':
    'The business layer is written from the process documentation, and none is saved yet. Read it from the code first; that takes no model call.',
  'doc.businessReadFirst': 'Read the documentation from the code',
  'doc.businessGenerating': 'Writing the SOP and the RACI (model)…',
  'doc.derivationTitle': 'How this was derived',

  // Roadmap 3.0.7, "Documentation lean" — one card for the model proposals.
  'doc.proposalsTitle': 'Model proposals',
  'doc.proposalsLead':
    'Written by a language model on top of the process description: who does what at each step, and business wording for the code reading. The steps, their lines and the controls stay the code reading.',
  'doc.proposalsSentencesTitle': 'Business sentences',
  'doc.sopControlsFromCode': 'Controls are read from the code — section 8 of the process description. The model proposes no controls and no KPI targets.',

  // The rules table's filter (it replaced the drawer's "Rules outside the process").
  'doc.rulesFilterLabel': 'Show the rules',
  'doc.rulesOutsideCaption': 'Rules outside the process',
  'doc.rulesOutsideLead': 'Values and conditions the code holds that take effect at no step of the drawn process.',
  'doc.rulesOutsideNone': 'None — every rule the code holds decides at a step.',

  // Section 9 — the project's one list of open questions (ADR-081).
  'doc.questionsAnswerInWorkspace': 'Answer them, or accept them as known open, in the workspace',

  // The Export menu in the stage header (ADR-078's menu, roadmap 3.0.7).
  'doc.exportBpmnCaveat': 'BPMN 2.0: import into SAP Signavio or SAP Build has not been verified yet.',
  'doc.exportPrintCaveat': 'Print / PDF prints the process description from the browser, every row of every table.',
  'doc.exportStale': 'Stale — regenerate first',

  // A model-written blueprint from before 3.0.5 (roadmap 3.0.7: its rendering retired, its data kept).
  'doc.legacyStrip': 'A model-written blueprint from before 3.0.5 is stored for this project. It is kept as it was and no longer shown here.',
  'doc.legacyDownload': 'Download it as it was',
  'doc.legacyReplace': 'Replace with the code reading',
  'doc.legacyReaderNote': 'The owner of this project can replace it with the description read from the code.',
} as const;

export type DocumentationMessageKey = keyof typeof DOCUMENTATION_MESSAGES;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function objectWords(objects: GlanceObject[]): string {
  const shown = objects.slice(0, 2).map((o) => (o.plain ? `${o.plain.charAt(0).toLowerCase()}${o.plain.slice(1)} (${o.name})` : o.name));
  const rest = objects.length - shown.length;
  if (rest > 0) return `${shown.join(', ')} and ${rest} more`;
  return shown.length === 2 ? `${shown[0]} and ${shown[1]}` : shown.join('');
}

/** "Reads purchase requisition (EBAN) and 4 more, changes …, calls … — in 11 steps." */
export function glanceHeadlineSentence(h: GlanceHeadline): string {
  const parts: string[] = [];
  if (h.reads.length) parts.push(`reads ${objectWords(h.reads)}`);
  if (h.writes.length) parts.push(`changes ${objectWords(h.writes)}`);
  if (h.calls.length) parts.push(`calls ${objectWords(h.calls)}`);
  const what = parts.length
    ? `${parts.join(', ').replace(/^./, (c) => c.toUpperCase())}`
    : 'Reads and changes no table by name';
  const rules = h.rules > 0 ? `, decided by ${plural(h.rules, 'business rule', 'business rules')} in the code` : '';
  return `${what} — in ${plural(h.steps, 'step', 'steps')}${rules}.`;
}

/** The title of one callout — the point a reader takes away. */
export function calloutTitle(c: BusinessCallout): string {
  switch (c.kind) {
    case 'direct-write': {
      const first = c.evidence[0];
      return c.count === 1 && first
        ? `Writes directly to ${first.label === first.ref ? first.ref : `${first.label.charAt(0).toLowerCase()}${first.label.slice(1)} (${first.ref})`}`
        : `Writes directly to ${c.count} tables outside your own namespace`;
    }
    case 'hard-coded-rules':
      return `${plural(c.count, 'business rule is', 'business rules are')} hard-coded in the program`;
    case 'early-end':
      return `Can end early in ${plural(c.count, 'place', 'places')}`;
    case 'not-determined':
      return `${plural(c.count, 'point', 'points')} not determined`;
    default:
      return '';
  }
}

/** One line under the title: why it matters, in business words. */
export function calloutWhy(c: BusinessCallout): string {
  switch (c.kind) {
    case 'direct-write':
      return 'Bypasses the application that owns these records; a direct write to an SAP table is level D.';
    case 'hard-coded-rules':
      return 'Values and conditions fixed in the code, not in customizing.';
    case 'early-end':
      return 'A case stops here without reaching the end of the process.';
    case 'not-determined':
      return 'Constructs the engine cannot judge from the code alone.';
    default:
      return '';
  }
}

export function moreEvidence(n: number): string {
  return `and ${n} more`;
}

export function raciLetterWord(letter: RaciLetter): string {
  return { R: 'Responsible', A: 'Accountable', C: 'Consulted', I: 'Informed' }[letter];
}

export function raciGapWord(gap: RaciStepGap): string {
  return {
    'no-accountable': 'No Accountable named — to clarify',
    'several-accountable': 'Several Accountable',
    'no-responsible': 'No Responsible',
  }[gap];
}

/** "2 steps need a check", "Purchasing Clerk is Responsible on 9 of 12 steps" — one line each. */
export function raciGapLines(gapSteps: number, overloaded: Array<{ name: string; r: number }>, total: number): string[] {
  const lines: string[] = [];
  if (gapSteps > 0) lines.push(`${plural(gapSteps, 'step needs', 'steps need')} a check`);
  for (const role of overloaded) lines.push(`${role.name} is Responsible on ${role.r} of ${total} steps`);
  return lines;
}

export function sopStepsCount(n: number): string {
  return plural(n, 'step', 'steps');
}

export function stepNumberLabel(n: number, name: string): string {
  return `Step ${n}: ${name}`;
}

/** The rules table's filter — all rows. */
export function docRulesFilterAll(n: number): string {
  return `All (${n})`;
}

/** The rules table's filter — the rules that decide at no step. */
export function docRulesFilterOutside(n: number): string {
  return `Outside the process (${n})`;
}

/** The step column of a rule outside the process that the table has no row for. */
export function docRulesOutsideNotInTable(reason: 'declaration-only' | 'unreached' | 'technical-helper' | 'not-in-skeleton'): string {
  return {
    'declaration-only': 'Outside the process — declaration only',
    unreached: 'Outside the process — not reached',
    'technical-helper': 'Outside the process — technical helper',
    'not-in-skeleton': 'Outside the process',
  }[reason];
}

/**
 * The one cost line of the model proposals card (DESIGN.md §2.8): what each
 * proposal costs, said before any click. Every part is a fact of the page —
 * the model it names is the one the business layer is asked of, the key is
 * the one `/api/model-stages` reports.
 */
export function docProposalsCostLine(model: string, byok: boolean): string {
  return `One model call per proposal (${model}${byok ? ', with your own Gemini key' : ''}). Opening Documentation writes the SOP and RACI once when none is on record; the business sentences only when asked for. They are not counted against your analysis runs; each counts toward the hourly limit on model calls of this account.`;
}

/** The file name of a legacy blueprint, downloaded as it was stored. */
export function docLegacyFileName(projectName: string | undefined): string {
  const base = (projectName || 'Project').replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'Project';
  return `${base}_blueprint_before_3.0.5.json`;
}
