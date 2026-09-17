import type { BpmnExportStats } from '@/lib/bpmn/export';
import type { BusinessRule, BusinessRuleSet } from '@/lib/abap/business-rule-set';
import type { CoverageReport } from '@/lib/abap/coverage';
import type { ProcessMapElement, ProcessMapModel } from '@/lib/process-map';
import { STATE_LABELS, type ElementState, type ProcessStates } from '@/lib/process-states';
import {
  NEED_WITHOUT_CODE,
  TARGET_DISCLAIMER,
  buildTargetModel,
  compareIstSoll,
  type Comparison,
  type ComparisonRow,
} from '@/lib/process-target';
import { stripModelMarkdown } from '@/lib/model-text';

/**
 * The Kurzbrief — roadmap 4.4.
 *
 * What somebody sends a colleague who has ten minutes: **the process picture**,
 * **the business rules** and **the open questions**. Its one rule, and the only
 * thing this module is measured on:
 *
 *   > every statement names the lines it was read from, or says that it is
 *   > **not determined** — and never neither, and never both.
 *
 * A statement that cannot name its lines is not left out. Leaving it out would
 * make the brief read as if the process were smaller than it is, which is the
 * same lie as inventing an anchor, told the quiet way. So it stays, marked, with
 * the reason the engine gave for having no line range.
 *
 * Three things this module deliberately does **not** do:
 *
 *   1. **It computes no traceability quote.** The quote is `BpmnExportStats`,
 *      the counting 2.6 did while it wrote the file, and the percentage and the
 *      sentence are the ones `buildProcessMapModel` already derived from those
 *      same counts. Recomputing them here would give a second number for one
 *      fact, and the two would drift the first time either side changed.
 *   2. **It invents no question and no answer.** Every open question comes from
 *      something that is already recorded: an element the reconstruction found
 *      no line for, a statement `lib/abap/coverage.ts` says the detectors did
 *      not judge, a subject an account asked to clarify, a subject nobody has
 *      spoken about, a need somebody drew without code.
 *   3. **It gives a need without code no anchor** — not a neighbour's, not a
 *      parent's (C23-A06). Those rows arrive from `compareIstSoll` with
 *      `anchor === null` and leave this module the same way.
 *
 * `clarify` and `undecided` stay two things, here as in 3.5 and 3.6: a question
 * somebody asked and the absence of any statement are not one fact with two
 * names, and a brief that merges them teaches the reader that nobody looked when
 * somebody did.
 *
 * The brief is a summary, not evidence. It enters no signed run and no audit
 * pack, and nothing in it may be worded as though it did.
 *
 * Pure: no React, no DOM, no network, no clock, no model call. The clock reaches
 * the document through `lib/brief/pdf.ts`, whose caller passes the time in.
 */

/** Bumped when the derived brief changes shape. */
export const PROCESS_BRIEF_FORMAT_VERSION = 1;

/** The words a statement without an anchor carries. One wording, one place. */
export const NOT_DETERMINED = 'Not determined';

/** What this document is, and what it is not. Printed on the first page. */
export const BRIEF_DISCLAIMER =
  'This brief summarises what the engine read out of the source and what accounts have confirmed. '
  + 'It is not evidence: it enters no signed run and no audit pack. Every statement names the lines it '
  + 'was read from, or says that it is not determined.';

export interface BriefAnchor {
  lineStart: number;
  lineEnd: number;
}

/**
 * Where a statement's wording comes from.
 *
 * `model-proposal` is roadmap 2.4's business name or lane standing in the
 * sentence. The reading of the code around it is still the engine's; the name is
 * a proposal and the brief says so rather than letting it pass as a finding.
 */
export type BriefOrigin = 'engine' | 'model-proposal';

/** A confirmation an account made about the statement's subject — 3.5. */
export interface BriefConfirmation {
  state: ElementState;
  /** `STATE_LABELS[state]`, unchanged. */
  label: string;
  account: string;
  /** ISO 8601, the server clock of 3.5. Never re-stamped here. */
  confirmedAt: string;
  revision: number;
  note: string | null;
}

export interface BriefStatement {
  /** Stable within one brief: section key, subject, ordinal. */
  id: string;
  /** The element id, the `BR-nnn`, or the coverage gap the statement is about. */
  subject: string;
  text: string;
  /** Empty **exactly** when `undetermined` is set. */
  anchors: BriefAnchor[];
  /** Set **exactly** when `anchors` is empty. */
  undetermined: { label: string; reason: string } | null;
  /**
   * The line under the text: `line 8`, `lines 224 to 232`, or
   * `Not determined — <reason>`. Never empty, so no surface has to decide what
   * to print when there is no anchor.
   */
  evidence: string;
  origin: BriefOrigin;
  /** What an account said about this subject, or null. Never a statement of its own. */
  confirmation: BriefConfirmation | null;
}

export type BriefSectionKey = 'picture' | 'rules' | 'questions';

export interface BriefSection {
  key: BriefSectionKey;
  title: string;
  /** Counted words about this section. Never a claim about the code. */
  lead: string;
  statements: BriefStatement[];
}

export interface BriefCounts {
  statements: number;
  /** Statements that name at least one line range. */
  anchored: number;
  /** Statements that say `Not determined`. `anchored + undetermined === statements`. */
  undetermined: number;
}

/**
 * The traceability quote, carried rather than computed.
 *
 * `flowNodes`, `anchored` and `unanchored` are `BpmnExportStats` verbatim;
 * `percent` and `sentence` are what `buildProcessMapModel` derived from those
 * same counts. Nothing here divides anything.
 */
export interface BriefTraceability {
  flowNodes: number;
  anchored: number;
  unanchored: number;
  percent: number | null;
  sentence: string;
}

export interface ProcessBrief {
  formatVersion: number;
  processName: string;
  /** The file the signed run analysed. */
  fileName: string;
  traceability: BriefTraceability;
  sections: BriefSection[];
  counts: BriefCounts;
  disclaimer: string;
  /** 3.6's sentence about what a target model is. Printed where the open questions are. */
  targetDisclaimer: string;
}

export interface ProcessBriefInput {
  /** `buildProcessMapModel(...)` of the source the active run signed. */
  map: ProcessMapModel;
  /** `BpmnExportStats` of the export that map was built from. The quote is read from here. */
  stats: BpmnExportStats;
  /** `deriveBusinessRules(source)` of the same source. */
  rules: BusinessRuleSet;
  /** `assessCoverage(source)` of the same source. */
  coverage: CoverageReport;
  /** What accounts have confirmed, or null when nothing could be read. */
  states: ProcessStates | null;
}

/* ------------------------------------------------------------------ helpers */

function anchorOf(range: { lineStart: number; lineEnd: number }): BriefAnchor {
  return { lineStart: range.lineStart, lineEnd: range.lineEnd };
}

/** `line 8` / `lines 224 to 232`. The wording `lib/process-target.ts` uses. */
function rangeWords(anchor: BriefAnchor): string {
  return anchor.lineEnd === anchor.lineStart
    ? `line ${anchor.lineStart}`
    : `lines ${anchor.lineStart} to ${anchor.lineEnd}`;
}

function evidenceWords(anchors: BriefAnchor[], reason: string | null): string {
  if (anchors.length === 0) return `${NOT_DETERMINED} — ${reason ?? 'the engine established no line range for this.'}`;
  if (anchors.length === 1) return rangeWords(anchors[0]);
  const shown = anchors.slice(0, 4).map(rangeWords).join(', ');
  return anchors.length > 4 ? `${shown} and ${anchors.length - 4} more` : shown;
}

/**
 * One statement, with the invariant enforced where it is cheapest to enforce.
 *
 * `anchors` and `undetermined` are set from one another rather than by the
 * caller: a caller that could set both is a caller that will, and then the
 * document says a thing has lines and has no lines in the same breath.
 */
function statement(input: {
  id: string;
  subject: string;
  text: string;
  anchors: BriefAnchor[];
  /** Used only when `anchors` is empty. */
  reason: string | null;
  origin?: BriefOrigin;
  confirmation?: BriefConfirmation | null;
}): BriefStatement {
  const anchors = input.anchors.filter((a) => Number.isInteger(a.lineStart) && Number.isInteger(a.lineEnd));
  const reason = input.reason ?? null;
  return {
    id: input.id,
    subject: input.subject,
    text: input.text,
    anchors,
    undetermined: anchors.length === 0
      ? { label: NOT_DETERMINED, reason: reason ?? 'the engine established no line range for this.' }
      : null,
    evidence: evidenceWords(anchors, reason),
    origin: input.origin ?? 'engine',
    confirmation: input.confirmation ?? null,
  };
}

function confirmationOf(states: ProcessStates | null, subject: string): BriefConfirmation | null {
  const entry = states?.bySubject[subject];
  if (!entry) return null;
  return {
    state: entry.state,
    label: STATE_LABELS[entry.state],
    account: entry.account.name,
    confirmedAt: entry.confirmedAt,
    revision: entry.revision,
    note: entry.note,
  };
}

/**
 * The name a reader sees for one element.
 *
 * The technical name is always there — a business name stands beside it, never
 * instead of it, which is 2.4's own rule. The business name is model output and
 * goes through `stripModelMarkdown` first: a name that came back as `**Check**`
 * would otherwise print its asterisks into a PDF.
 */
function elementName(element: ProcessMapElement): { name: string; fromModel: boolean } {
  const technical = element.technicalName || element.id;
  if (!element.businessName) return { name: technical, fromModel: false };
  const business = stripModelMarkdown(element.businessName).replace(/\s+/g, ' ').trim();
  if (!business) return { name: technical, fromModel: false };
  return { name: `${business} (${technical})`, fromModel: true };
}

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/* ------------------------------------------------------------------ picture */

/**
 * The process, element by element, in the order the map walks it.
 *
 * Every element of every plane, not the top plane only: a step folded into a
 * sub-process is still a step of the process, and a brief that shows the outline
 * and calls it the process has left out the part where the work happens.
 */
function pictureSection(map: ProcessMapModel, states: ProcessStates | null): BriefSection {
  const planeLabel = new Map(map.planes.map((plane) => [plane.id, plane.label]));
  const statements = map.elements.map((element, index) => {
    const { name, fromModel } = elementName(element);
    const where = element.plane ? ` In ${planeLabel.get(element.plane) ?? element.plane}.` : '';
    const lane = element.lane ? ` Lane proposed: ${element.lane}.` : '';
    return statement({
      id: `picture-${index + 1}`,
      subject: element.id,
      text: `${element.kind}: ${name}.${where}${lane}`,
      anchors: element.anchor ? [anchorOf(element.anchor)] : [],
      reason: element.unanchoredReason
        ?? 'the reconstruction drew this element without a line range of its own.',
      origin: fromModel || element.lane ? 'model-proposal' : 'engine',
      confirmation: confirmationOf(states, element.id),
    });
  });

  return {
    key: 'picture',
    title: 'The process',
    // Not the traceability sentence again: it is on the first page, and a
    // number a reader meets twice is a number they start checking against
    // itself instead of reading.
    lead: `${map.overview} ${count(statements.length, 'element', 'elements')} on `
      + `${count(map.planes.length, 'level', 'levels')}.`,
    statements,
  };
}

/* -------------------------------------------------------------------- rules */

/**
 * The business rules, sentence by sentence.
 *
 * A rule has no line range of its own — `lib/abap/business-rule-set.ts` says
 * why: a rule copied into fourteen routines stands at fourteen places, and a
 * range from the first to the last would claim the nine hundred lines between
 * them. So the rule is not one statement here; each of its sentences is, with
 * the anchors that sentence carries, and one further statement says which
 * process elements the rule decides at — or why it decides at none.
 */
function ruleStatements(rule: BusinessRule, states: ProcessStates | null, from: number): BriefStatement[] {
  const confirmation = confirmationOf(states, rule.id);
  const out: BriefStatement[] = [];
  let n = from;

  rule.sentences.forEach((sentence) => {
    n += 1;
    out.push(statement({
      id: `rules-${n}`,
      subject: rule.id,
      text: `${rule.id} · ${sentence.text}`,
      anchors: sentence.anchors.map(anchorOf),
      reason: 'the rule reader produced this sentence without a place in the source.',
      confirmation,
    }));
  });

  n += 1;
  const places = rule.processElements;
  out.push(statement({
    id: `rules-${n}`,
    subject: rule.id,
    text: places.length > 0
      ? `${rule.id} decides at ${count(places.length, 'process element', 'process elements')}: `
        + `${places.map((place) => place.label).join(', ')}.`
      : `${rule.id} decides at no process element.`,
    anchors: places.map(anchorOf),
    reason: rule.withoutProcessElement
      ? rule.withoutProcessElement.detail
      : 'the rule names no place in the drawn process.',
    confirmation,
  }));

  return out;
}

function rulesSection(rules: BusinessRuleSet, states: ProcessStates | null): BriefSection {
  const statements: BriefStatement[] = [];
  for (const rule of rules.rules) {
    statements.push(...ruleStatements(rule, states, statements.length));
  }

  const c = rules.counts;
  const lead = c.rules === 0
    ? 'The engine derived no business rule from this source.'
    : `${count(c.rules, 'business rule', 'business rules')} out of ${count(c.candidates, 'candidate', 'candidates')}: `
      + `${count(c.byType.rule, 'rule', 'rules')} and ${count(c.byType.control, 'control', 'controls')}. `
      + `${c.withProcessElement} of them decide at a process element. Every value stands in the ABAP source.`;

  return { key: 'rules', title: 'The business rules', lead, statements };
}

/* ---------------------------------------------------------------- questions */

/**
 * Why a comparison row carries no line range, in the reader's words.
 *
 * `unknown` is the rule case and is not a gap in the reading: a rule stands at
 * as many places as it was copied to, and those places are in the rules section
 * above. Saying so is more useful than repeating `Unanchored`.
 */
function openReason(row: ComparisonRow): string {
  if (row.anchorBasis === 'need') return NEED_WITHOUT_CODE;
  if (row.anchorBasis === 'unknown') {
    return 'a business rule has no line range of its own; its places are listed with the rule above.';
  }
  return row.unanchoredReason ?? 'the reconstruction drew this element without a line range of its own.';
}

function openRowStatement(row: ComparisonRow, id: string, states: ProcessStates | null): BriefStatement {
  return statement({
    id,
    subject: row.subject,
    text: `${row.what}: ${row.label}. ${row.sentence}`,
    anchors: row.anchor ? [anchorOf(row.anchor)] : [],
    reason: openReason(row),
    confirmation: confirmationOf(states, row.subject),
  });
}

/**
 * What is not determined.
 *
 * Five kinds, and each one is something already on record rather than a question
 * this module thought of:
 *
 *   1. an element the reconstruction found no line range for — *where is this
 *      step in the code?*
 *   2. a statement `assessCoverage` filed as `dynamic-target` — *which table or
 *      type does this line use?* The line is known; the answer is not.
 *   3. a subject an account asked to clarify.
 *   4. a subject nobody has said anything about.
 *   5. a need that exists only in the target model, which carries no anchor and
 *      is given none (C23-A06).
 *
 * Three and four are counted and listed apart, because a question somebody asked
 * and the absence of any statement are two facts.
 */
function questionsSection(
  map: ProcessMapModel,
  coverage: CoverageReport,
  comparison: Comparison | null,
  states: ProcessStates | null,
): BriefSection {
  const statements: BriefStatement[] = [];
  const next = () => `questions-${statements.length + 1}`;

  for (const element of map.elements) {
    if (element.anchor) continue;
    const { name } = elementName(element);
    statements.push(statement({
      id: next(),
      subject: element.id,
      text: `Where does this ${element.kind.toLowerCase()} stand in the code? ${name}.`,
      anchors: [],
      reason: element.unanchoredReason
        ?? 'the reconstruction drew this element without a line range of its own.',
      confirmation: confirmationOf(states, element.id),
    }));
  }

  for (const construct of coverage.unassessed) {
    if (construct.gap !== 'dynamic-target') continue;
    statements.push(statement({
      id: next(),
      subject: `coverage-${construct.gap}-${construct.line}`,
      text: `Which table or type does this statement use? ${NOT_DETERMINED}. ${construct.why}`,
      anchors: [{ lineStart: construct.line, lineEnd: construct.line }],
      reason: null,
    }));
  }

  if (!comparison) {
    statements.push(statement({
      id: next(),
      subject: 'states',
      text: 'What has been confirmed for this process? Nothing could be read, so nothing is stated here.',
      anchors: [],
      reason: 'the confirmations of this process could not be read.',
    }));
  } else {
    // Somebody's question first, then a need drawn without code, and the
    // subjects nobody has spoken about last. All of them, in every case — but a
    // reader with ten minutes should meet the questions that have an owner
    // before the long tail of "nobody has looked at this yet".
    const clarify = comparison.byVerdict.open.filter((row) => row.openReason === 'clarify');
    const undecided = comparison.byVerdict.open.filter((row) => row.openReason === 'undecided');
    for (const row of [...clarify, ...comparison.byVerdict.added, ...undecided]) {
      statements.push(openRowStatement(row, next(), states));
    }
  }

  const unanchored = map.elements.filter((element) => !element.anchor).length;
  const dynamic = coverage.unassessed.filter((c) => c.gap === 'dynamic-target').length;
  const lead = comparison
    ? `${count(statements.length, 'open question', 'open questions')}: ${unanchored} without a line anchor, `
      + `${dynamic} where the table or type is named at runtime, ${comparison.counts.clarify} asked to be clarified, `
      + `${comparison.counts.undecided} nobody has decided, and ${comparison.counts.added} needed without code.`
    : `${count(statements.length, 'open question', 'open questions')}: ${unanchored} without a line anchor and `
      + `${dynamic} where the table or type is named at runtime. No confirmation could be read.`;

  return { key: 'questions', title: 'Open questions', lead, statements };
}

/* --------------------------------------------------------------- the brief */

/**
 * The brief, out of one reading of one source.
 *
 * `states` decides how much of the third section there is, and nothing else: a
 * project nobody has confirmed anything in still gets a picture, its rules and
 * every question the engine can put, with the confirmations simply absent.
 */
export function buildProcessBrief(input: ProcessBriefInput): ProcessBrief {
  const { map, stats, rules, coverage, states } = input;

  // 3.6's two derivations, not a third one written here. The rule ids are handed
  // in so a rule nobody has spoken about counts as undecided like an element.
  const comparison = states
    ? compareIstSoll(map, buildTargetModel(map, states, rules.rules.map((rule) => rule.id)))
    : null;

  const sections: BriefSection[] = [
    pictureSection(map, states),
    rulesSection(rules, states),
    questionsSection(map, coverage, comparison, states),
  ];

  const all = sections.flatMap((section) => section.statements);
  const anchored = all.filter((s) => s.anchors.length > 0).length;

  return {
    formatVersion: PROCESS_BRIEF_FORMAT_VERSION,
    processName: map.processName,
    fileName: map.fileName,
    traceability: {
      // Straight out of the export's own counting — see the head of this file.
      flowNodes: stats.flowNodes,
      anchored: stats.anchored,
      unanchored: stats.unanchored,
      percent: map.traceability.percent,
      sentence: map.traceability.sentence,
    },
    sections,
    counts: {
      statements: all.length,
      anchored,
      undetermined: all.length - anchored,
    },
    disclaimer: BRIEF_DISCLAIMER,
    targetDisclaimer: TARGET_DISCLAIMER,
  };
}

/** Every statement of the brief, in the order it is printed. */
export function briefStatements(brief: ProcessBrief): BriefStatement[] {
  return brief.sections.flatMap((section) => section.statements);
}
