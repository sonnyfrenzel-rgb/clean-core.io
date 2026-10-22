/**
 * The guided fit-to-standard check and the workshop package — stage 2 of the
 * fit-to-standard approach (owner decision 22.10.2026; research report §3 (d),
 * (e1) and §4).
 *
 * From the stage-1 reading (`lib/standard-touch.ts`) and the business rules
 * the engine derived, one question per rule from a fixed catalogue — still
 * needed, configuration, key user, organisational, open. An answer is the
 * account's own statement and is recorded the way every rule answer is: as a
 * need revision of `process-states` (keep / change / drop / clarify), through
 * the same choice the rule decisions use (`choiceOf`, `lib/rule-decision-flow.ts`).
 * The to-be and the as-is/to-be comparison then come from `lib/process-target.ts`
 * like any other need revision.
 *
 * What stays open becomes a condition of the decision *Move to SAP standard*,
 * shown with it in Management — a display, never written into the decision
 * record, so no fingerprint of a stored decision moves.
 *
 * The workshop package takes the reconstructed process (BPMN 2.0), the
 * departures with their lines and the open questions into the customer's own
 * workshop — in SAP Signavio or SAP Cloud ALM, under the customer's licence.
 * No SAP content is imported here, and no model is called.
 *
 * Pure: no React, no network.
 */
import type { ItFindingRow } from './it-findings';
import type { ProcessStateView, StateChoiceInput, StateEntry } from './process-states';
import { choiceOf, decisionKindOf, RULE_DECISION_LABELS, shownNote, type RuleDecisionKind } from './rule-decision-flow';
import type { DocBlock } from './requirements-export';
import {
  DEPARTURE_LABELS,
  GATE_CLASS_LABELS,
  STANDARD_TOUCH_LIMITS,
  anchorText,
  type DepartureKind,
  type StandardTouch,
  type TouchDeparture,
} from './standard-touch';

export const FIT_CHECK_ANSWERS = ['not-needed', 'configuration', 'key-user', 'organisational', 'open'] as const;
export type FitCheckAnswer = (typeof FIT_CHECK_ANSWERS)[number];

/** The question every rule is asked. */
export const FIT_CHECK_QUESTION = 'Does the business still need this, and if so, how is it met without custom code?';

export const FIT_CHECK_LABELS: Readonly<Record<FitCheckAnswer, string>> = {
  'not-needed': 'Not needed any more',
  configuration: 'Configuration in SAP standard',
  'key-user': 'Key user extensibility',
  organisational: 'Organisational change',
  open: 'Open — for the workshop',
};

/**
 * The note each answer is recorded with. The words are the marker an answer is
 * read back by, so they are fixed; the reader sees the label, the record keeps
 * the sentence.
 */
export const FIT_CHECK_NOTES: Readonly<Record<FitCheckAnswer, string>> = {
  'not-needed': 'Not needed any more (fit-to-standard check).',
  configuration: 'Met by configuration in SAP standard (fit-to-standard check).',
  'key-user': 'Key user extensibility (fit-to-standard check).',
  organisational: 'Met by an organisational change, not in software (fit-to-standard check).',
  open: 'Open for the fit-to-standard workshop.',
};

/** How each answer is recorded as a need revision. */
const ANSWER_KIND: Readonly<Record<FitCheckAnswer, RuleDecisionKind>> = {
  'not-needed': 'drop',
  configuration: 'configure',
  'key-user': 'keep',
  organisational: 'drop',
  open: 'clarify',
};

/** The choice the `process-states` route stores for an answer. Nothing it does not already accept. */
export function fitCheckChoice(ruleId: string, answer: FitCheckAnswer): StateChoiceInput {
  return choiceOf(ruleId, ANSWER_KIND[answer], FIT_CHECK_NOTES[answer]);
}

/** The check's answer an entry carries, or null when it was answered another way (or not at all). */
export function fitCheckAnswerOf(entry: StateEntry | null | undefined): FitCheckAnswer | null {
  if (!entry) return null;
  const note = (entry.note ?? '').trim();
  for (const answer of FIT_CHECK_ANSWERS) {
    if (note === FIT_CHECK_NOTES[answer] && decisionKindOf(entry) === ANSWER_KIND[answer]) return answer;
  }
  return null;
}

export interface FitCheckQuestion {
  /** The rule id, `BR-004`. */
  ruleId: string;
  label: string;
  detail: string;
  anchor: string | null;
  /** The departures whose lines this rule stands on — empty for a rule beside no departure. */
  departures: DepartureKind[];
  /** The check's answer on record, or null. */
  answer: FitCheckAnswer | null;
  /** The rule answered elsewhere (Design's rule questions), in that flow's words — or null. */
  answeredElsewhere: string | null;
  /** Open: no answer at all, or the check's "Open". */
  open: boolean;
}

export interface FitCheck {
  questions: FitCheckQuestion[];
  /** Departures no rule stands on — always on the workshop's agenda. */
  unlinked: TouchDeparture[];
  /** The revision the answers were read from (the `baseRevision` of a save). */
  revision: number;
}

/**
 * The questions: the rules beside a departure first, in the order of their
 * departures, then every other rule. One per rule — the rules are what the
 * process-states route records.
 */
export function fitCheck(touch: StandardTouch, rows: readonly ItFindingRow[], view: ProcessStateView | null): FitCheck {
  const rules = (view?.subjects ?? []).filter((s) => s.kind === 'rule');
  const latest: Record<string, StateEntry> = {};
  for (const e of view?.entries ?? []) {
    if (e.kind !== 'rule') continue;
    const held = latest[e.subject];
    if (!held || e.revision > held.revision) latest[e.subject] = e;
  }

  // Which departures each rule stands beside: the rules covering the line of a departure finding,
  // or, where none covers it, the rules of the routine the departure stands in.
  const byRule = new Map<string, Set<DepartureKind>>();
  const linkedLines = new Set<string>();
  for (const d of touch.departures) {
    const lines = new Set(d.anchors.map((a) => a.lineStart));
    for (const r of rows) {
      if (!lines.has(r.lineStart)) continue;
      for (const id of r.rulesCoveringLine.length > 0 ? r.rulesCoveringLine : r.rulesInRoutine) {
        byRule.set(id, (byRule.get(id) ?? new Set()).add(d.kind));
        linkedLines.add(`${d.kind}@${r.lineStart}`);
      }
    }
  }

  const questions: FitCheckQuestion[] = rules.map((s) => {
    const entry = latest[s.subject] ?? null;
    const answer = fitCheckAnswerOf(entry);
    const kind = decisionKindOf(entry);
    const elsewhere = entry && answer === null && kind ? describeElsewhere(kind, entry) : null;
    return {
      ruleId: s.subject,
      label: s.label,
      detail: s.detail,
      anchor: s.anchor,
      departures: [...(byRule.get(s.subject) ?? [])],
      answer,
      answeredElsewhere: elsewhere,
      open: answer === 'open' || (answer === null && (kind === null || kind === 'clarify')),
    };
  });
  questions.sort((a, b) => Number(b.departures.length > 0) - Number(a.departures.length > 0));

  const unlinked = touch.departures
    .map((d) => ({ ...d, anchors: d.anchors.filter((a) => !linkedLines.has(`${d.kind}@${a.lineStart}`)) }))
    .filter((d) => d.anchors.length > 0);

  return { questions, unlinked, revision: view?.revision ?? 0 };
}

function describeElsewhere(kind: RuleDecisionKind, entry: StateEntry): string {
  const note = shownNote(entry.note);
  return note ? `${RULE_DECISION_LABELS[kind]} — ${note}` : RULE_DECISION_LABELS[kind];
}

/**
 * What stays open for *Move to SAP standard*: every open question of a rule
 * beside a departure, and every departure no rule stands on. Each is a
 * condition of that decision — shown with it, never attested away.
 */
export function standardConditions(check: FitCheck): string[] {
  const out: string[] = [];
  for (const q of check.questions) {
    if (!q.open || q.departures.length === 0) continue;
    out.push(`${q.ruleId}: ${q.label} — still open in the fit-to-standard check.`);
  }
  for (const d of check.unlinked) {
    out.push(`${d.label} (${d.anchors.map(anchorText).join(', ')}) — to be discussed in the workshop.`);
  }
  return out;
}

/** The workshop agenda as document blocks — written out as Markdown or Word by `lib/requirements-export.ts`. */
export function workshopAgendaBlocks(input: {
  projectName: string;
  fileName: string;
  date: string;
  touch: StandardTouch;
  check: FitCheck;
}): DocBlock[] {
  const { touch, check } = input;
  const blocks: DocBlock[] = [];
  blocks.push({ k: 'h', level: 1, text: `Fit-to-standard workshop — ${input.projectName}` });
  blocks.push({ k: 'p', text: `Prepared from ${input.fileName} on ${input.date}. For your own workshop in SAP Signavio or SAP Cloud ALM.` });
  blocks.push({ k: 'note', text: STANDARD_TOUCH_LIMITS });

  blocks.push({ k: 'h', level: 2, text: '1. Where this program touches SAP standard' });
  blocks.push({ k: 'p', text: touch.sentence });
  if (touch.gate.outcome === 'offered') {
    blocks.push({ k: 'ul', items: touch.gate.signals.map((s) => `${GATE_CLASS_LABELS[s.cls]}: ${s.text} (${s.anchors.map(anchorText).join(', ')})`) });
  }
  if (touch.areas.length > 0) {
    blocks.push({
      k: 'table',
      head: ['SAP area', 'SAP objects of the program'],
      rows: touch.areas.map((a) => [a.component, a.objects.join(', ')]),
    });
  }

  blocks.push({ k: 'h', level: 2, text: '2. How it departs from SAP standard' });
  if (touch.departures.length === 0) {
    blocks.push({ k: 'p', text: 'The engine read no departure of these kinds.' });
  } else {
    blocks.push({
      k: 'table',
      head: ['Departure', 'Lines', 'SAP objects'],
      rows: touch.departures.map((d) => [d.label, d.anchors.map(anchorText).join(', '), d.objects.join(', ') || '—']),
    });
  }

  blocks.push({ k: 'h', level: 2, text: '3. Questions for the workshop' });
  blocks.push({ k: 'p', text: FIT_CHECK_QUESTION });
  const open = check.questions.filter((q) => q.open);
  const answered = check.questions.filter((q) => !q.open);
  if (open.length === 0 && check.unlinked.length === 0) {
    blocks.push({ k: 'p', text: 'No question is open.' });
  } else {
    blocks.push({
      k: 'table',
      head: ['Rule', 'What the code does', 'Departure', 'Lines'],
      rows: [
        ...open.map((q) => [q.ruleId, `${q.label} — ${q.detail}`, q.departures.map((k) => DEPARTURE_LABELS[k]).join('; ') || '—', q.anchor ?? '—']),
        ...check.unlinked.map((d) => ['—', 'No rule stands on these lines.', d.label, d.anchors.map(anchorText).join(', ')]),
      ],
    });
  }

  blocks.push({ k: 'h', level: 2, text: '4. Answers already given' });
  blocks.push({ k: 'p', text: "The account's own statements, not a confirmation by SAP." });
  if (answered.length === 0) {
    blocks.push({ k: 'p', text: 'None yet.' });
  } else {
    blocks.push({
      k: 'table',
      head: ['Rule', 'Answer'],
      rows: answered.map((q) => [q.ruleId, q.answer ? FIT_CHECK_LABELS[q.answer] : (q.answeredElsewhere ?? '—')]),
    });
  }

  blocks.push({ k: 'h', level: 2, text: '5. The process' });
  blocks.push({
    k: 'p',
    text: 'The reconstructed process is attached as a BPMN 2.0 file. Open it in your own tool and lay it beside the SAP process you compare it with.',
  });
  return blocks;
}

/** `<name>_fit_to_standard_workshop.<ext>`. */
export function workshopFileName(projectName: string, ext: 'md' | 'docx' | 'bpmn'): string {
  const base = projectName.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'project';
  return ext === 'bpmn' ? `${base}_fit_to_standard_process.bpmn` : `${base}_fit_to_standard_workshop.${ext}`;
}
