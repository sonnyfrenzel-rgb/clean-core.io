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
  'doc.notDeterminedNone': 'Nothing the detectors stepped over. That is the limit of what they check, not a clean bill.',
  'doc.notDeterminedReading': 'Checking what the detectors could not judge…',
  'doc.notDeterminedNoSource': 'No signed source here, so nothing was checked.',

  'doc.sopTitle': 'Business SOP',
  'doc.sopLead': 'Who does what, step by step. Written by a model; steps and lines are the code reading.',
  'doc.sopOutcomeMissing': 'No outcome written',
  'doc.sopNotInProcess': 'Not a step of the process read from the code',
  'doc.sopResponsible': 'Responsible',
  'doc.sopFull': 'Full SOP',
  'doc.sopFullSummary': 'Narrative, exception handling and KPI target per step, and the control checkpoints.',
  'doc.sopNarrative': 'Narrative',
  'doc.sopException': 'If the step cannot be completed',
  'doc.sopKpi': 'KPI target',
  'doc.sopStepColumn': 'Step',
  'doc.controlsTitle': 'Control checkpoints',
  'doc.controlsNone': 'The layer names no control checkpoint.',
  'doc.controlObjective': 'Control objective',
  'doc.controlMitigation': 'Mitigation',
  'doc.controlVerification': 'Verification',

  'doc.raciTitle': 'Who is responsible',
  'doc.raciNoRows': 'The layer assigns no roles.',
  'doc.raciNoGaps': 'Every step has one Accountable and a Responsible.',
  'doc.raciLegend': 'Legend',
  'doc.raciR': 'Responsible',
  'doc.raciA': 'Accountable',
  'doc.raciC': 'Consulted',
  'doc.raciI': 'Informed',
  'doc.raciGapCheck': 'Check',
  'doc.raciGapNoAccountable': 'No Accountable',
  'doc.raciGapSeveralAccountable': 'Several Accountable',
  'doc.raciGapNoResponsible': 'No Responsible',
  'doc.raciOk': 'Complete',
  'doc.raciCaption': 'RACI matrix: process steps by role',

  'doc.businessOfferTitle': 'Business SOP and RACI',
  'doc.businessOfferLead':
    'Who does what at each step, who is accountable, and the controls — proposed by a language model from the process documentation read from your code. The steps and their lines stay the code reading.',
  'doc.businessGenerate': 'Generate the business SOP & RACI',
  'doc.businessBlockedTitle': 'Not yet possible',
  'doc.businessNeedsDocumentation':
    'The business layer is written from the process documentation, and none is saved yet. Read it from the code first; that takes no model call.',
  'doc.businessReadFirst': 'Read the documentation from the code',
  'doc.businessGenerating': 'Writing the SOP and the RACI…',
  'doc.derivationTitle': 'How this was derived',
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
    'no-accountable': 'No Accountable',
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
