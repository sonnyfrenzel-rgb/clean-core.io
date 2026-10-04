import type { DocAnchor } from '@/lib/process-documentation';

/**
 * The process description of the Documentation stage (owner 03.10.2026,
 * translated: "Is this really sensible process documentation for Confluence?
 * Nobody can understand that. Endless lists and nothing coherent for
 * successors. Process documentation must be much closer to the real business.
 * What would one really document for posterity?").
 *
 * The ingredients were right and nobody could read them: an 84-row table of
 * BPMN ids and 150 bullets such as "The field ls_bdc-fnam is set to
 * BDC_OKCODE." This document is the same evidence, ordered the way a process
 * owner or a successor reads a process description (an SOP, a Signavio or ARIS
 * process description):
 *
 *   1. purpose and scope            6. outputs and effects
 *   2. trigger and inputs           7. integrations
 *   3. process overview             8. controls and audit
 *   4. decision points and rules    9. open questions for the business
 *   5. exceptions and early ends    appendix: the technical trace
 *
 * Every statement in it was read from the source by the engine and carries
 * the lines it was read from. What the engine cannot say is asked once, in the
 * open questions, and nowhere else. A model's wording appears only where one is
 * stored, marked as a proposal, with the engine's wording kept beside it.
 *
 * Owner, 04.10.2026 (translated): "far too long, complex, linguistically
 * complicated and not enterprise-ready — much smarter-looking, to the point,
 * more concise." So the document opens with a one-page summary (*At a
 * glance*), every section starts with one line that says what it holds, the
 * body speaks in business words with short sentences, and the program's own
 * names (tables, routines, BAPIs, variables) stand only in a muted source
 * column or in the appendix. Nothing the engine read is dropped: what left the
 * body stands in the appendix (`lib/process-document-outline.ts`).
 *
 * This file is the **format**: the types, the section order, the filters that
 * keep the business part readable, and the line labels. The builder is
 * `lib/process-document-build.ts`; how every rendering words and orders the
 * document — the stage, the Confluence page, the Markdown and the `.docx` — is
 * one outline, `lib/process-document-outline.ts`, so they cannot say different
 * things.
 */

export const PROCESS_DOCUMENT_FORMAT = 'clean-core-process-description';
export const PROCESS_DOCUMENT_FORMAT_VERSION = 2;

/** The sections, in the order every rendering prints them. */
export const PROCESS_DOCUMENT_SECTIONS = [
  { key: 'purpose', title: '1. Purpose and scope' },
  { key: 'trigger', title: '2. Trigger and inputs' },
  { key: 'overview', title: '3. Process overview' },
  { key: 'rules', title: '4. Business rules and decision points' },
  { key: 'exceptions', title: '5. Exceptions' },
  { key: 'outputs', title: '6. Outputs and effects' },
  { key: 'integrations', title: '7. Integrations' },
  { key: 'controls', title: '8. Controls' },
  { key: 'questions', title: '9. Open questions' },
  { key: 'appendix', title: 'Appendix: technical trace' },
] as const;

export type ProcessDocumentSection = (typeof PROCESS_DOCUMENT_SECTIONS)[number]['key'];

export const sectionTitle = (key: ProcessDocumentSection): string =>
  PROCESS_DOCUMENT_SECTIONS.find((s) => s.key === key)!.title;

/**
 * What the document is, said once at the top of every rendering — in place of
 * a hedge in every paragraph. Four short sentences.
 */
export const PROCESS_DOCUMENT_NOTE =
  'Reconstructed from the code by the Clean-Core.io engine. Line references (L…) point at the source. '
  + 'What the code cannot answer is asked once, in the open questions. Text marked "Model proposal" was written by a language model.';

/** The provenance of the whole document, for the cover. Never "Proven". */
export const PROCESS_DOCUMENT_STATUS = 'Reconstructed from the code — to be confirmed by the business';

/** What a section says when the code gives it nothing — a finding, not a default. */
export const EMPTY_SECTION: Readonly<Record<Exclude<ProcessDocumentSection, 'purpose' | 'overview' | 'appendix'>, string>> = {
  trigger: 'No selection screen and no event block starts the program.',
  rules: 'No business rule and no decision point changes the path.',
  exceptions: 'No early end and no error message in the code an entry point reaches.',
  outputs: 'No change of data and no output in the code an entry point reaches.',
  integrations: 'No function module, transaction or other program is called by name.',
  controls: 'No authorization check, no record of its own and no explicit save or undo.',
  questions: 'No question is left open.',
};

export const MODEL_PROPOSAL_LABEL = 'Model proposal';

/* ------------------------------------------------------------------ types */

export interface PdText {
  text: string;
  /** Never empty for a statement about the code. */
  anchors: DocAnchor[];
  /**
   * The program's own names behind the sentence (`EBAN`, `BAPI_PO_CREATE1`) —
   * a muted second line or the source column, never the sentence itself.
   */
  detail?: string | null;
}

/** One of the 3–5 points the summary names: a weighty rule, or a risk the code shows. */
export interface PdPoint {
  kind: 'rule' | 'risk';
  /** `BR-010` for a rule with an id; null otherwise. */
  ref: string | null;
  text: string;
  detail: string | null;
  anchors: DocAnchor[];
}

/** The one-page summary every rendering opens with. */
export interface PdGlance {
  /** What the process does — two or three short sentences, business words only. */
  summary: PdText[];
  /** Who or what starts it, in one line. */
  trigger: PdText;
  /** At most five: the weightiest business rules first, then risks. */
  points: PdPoint[];
}

/** Model wording — shown as a proposal, the engine's wording kept beside it. */
export interface PdProposal {
  text: string;
  anchors: DocAnchor[];
  origin: 'narrative' | 'statement-proposal';
}

export interface PdSubStep {
  label: string;
  kind: string;
  anchor: DocAnchor | null;
  /** 1 directly inside the step, 2 one level deeper. */
  depth: number;
}

export interface PdStep {
  kind: 'step';
  number: number;
  /** The BPMN element id — the map, the `.bpmn` file and the appendix use it. */
  id: string;
  /** The engine's plain name. */
  name: string;
  /** The routine or token the source writes — secondary. */
  technicalName: string;
  /** The naming stage's business name, a model proposal. */
  businessName: string | null;
  /** The call and, for a routine, its body. Never empty for an anchored element. */
  anchors: DocAnchor[];
  /** "Reads purchase requisition (EBAN). Can end early in 1 place." — counted, not written; the appendix carries it. */
  facts: string;
  /** The same facts in one plain line, without the program's names: "Reads the purchase requisition; can end early." */
  line: string;
  /** The engine's business sentences for this step, trivial ones left out, each sentence once in the document. */
  does: PdText[];
  /** The model's sentence for these lines, when one is stored and does not contradict the code. */
  proposal: PdProposal | null;
  subSteps: PdSubStep[];
  /** Sub-steps not listed here; every one stands in the appendix. */
  moreSubSteps: number;
}

export interface PdGate {
  kind: 'gate';
  id: string;
  label: string;
  anchor: DocAnchor | null;
  outcomes: Array<{ when: string; then: string; ends: boolean }>;
}

export type PdPathEntry = PdStep | PdGate;

export interface PdInput {
  name: string;
  meaning: string;
  kind: 'Parameter' | 'Range' | 'Checkbox';
  required: boolean;
  defaultValue: string | null;
  anchor: DocAnchor;
}

export interface PdData {
  name: string;
  /** The business word, when the glossary knows the table. */
  meaning: string | null;
  owner: 'SAP' | 'Customer';
  anchors: DocAnchor[];
}

export interface PdRule {
  /** `BR-004`, or the kind of decision when the rule set has no id for it. */
  ref: string;
  where: string | null;
  condition: string;
  effect: string;
  anchors: DocAnchor[];
  /** The requirement as the engine worded it, when the row says it shorter — kept for the appendix. */
  full: string | null;
}

export interface PdException {
  what: string;
  where: string | null;
  /** The message in full engine words ("Error E001 of class ZMM_PO: “…”"); null when the code shows none here. */
  message: string | null;
  /** Only the text the user sees, when the code writes it; null otherwise. */
  shown: string | null;
  /** The message's number and class (`E001 · ZMM_PO`) — the source column. */
  messageRef: string | null;
  outcome: string;
  anchors: DocAnchor[];
}

export interface PdEffect {
  kind: string;
  /** In business words; the objects stand in `objects`. */
  what: string;
  objects: string[];
  anchors: DocAnchor[];
  /** The engine's wording, when `what` says it shorter. */
  full: string | null;
}

export interface PdIntegration {
  name: string;
  kind: string;
  /** What it is for, in business words. */
  purpose: string;
  anchors: DocAnchor[];
}

export interface PdControl {
  kind: string;
  /** One plain line; the program's names stand in `detail`. */
  text: string;
  ref: string | null;
  anchors: DocAnchor[];
  detail: string | null;
  /** The engine's sentence (or sentences, for merged rows), kept for the appendix. */
  full: string | null;
}

/** The themes the open questions are grouped by, in the order a reader works through them. */
export const QUESTION_THEMES = [
  { key: 'rules', title: 'Business rules' },
  { key: 'source', title: 'Missing source' },
  { key: 'takeover', title: 'Data takeover and retention' },
  { key: 'cutover', title: 'Cutover' },
  { key: 'ownership', title: 'Ownership and purpose' },
  { key: 'audit', title: 'Audit and authorizations' },
  { key: 'operations', title: 'Operations and failure' },
] as const;

export type PdQuestionTheme = (typeof QUESTION_THEMES)[number]['key'];

export const questionThemeTitle = (key: PdQuestionTheme): string => QUESTION_THEMES.find((t) => t.key === key)!.title;

export interface PdQuestion {
  /** The first source id (`TBD-07`, `TBC-02`, `Q-01`) — stable, for the trace; the reader sees `number`. */
  id: string;
  /** Q1, Q2 … in the order the document lists them. */
  number: number;
  /** Every source id this question stands for — two near-identical questions are asked once. */
  refs: string[];
  theme: PdQuestionTheme;
  /** What it holds up: the target design, the cutover, or neither. */
  blocks: 'design' | 'cutover' | null;
  owner: 'Business' | 'IT operations';
  /** One plain line, no ABAP and no variable names. */
  question: string;
  /** The program's names the plain line leaves out (`ZMM_PO_APPR, ZMM_PO_ATTACH`). */
  detail: string | null;
  /** The engine's wording of every merged question, for the appendix. */
  original: string[];
  why: string;
  /** Empty only when the code is silent on it. */
  anchors: DocAnchor[];
}

export interface PdTraceElement {
  id: string;
  kind: string;
  name: string;
  anchor: DocAnchor | null;
  /** `line 8` / `Not determined — …`. */
  evidence: string;
  /** The engine's sentence at this element; null when it stands at an earlier element (`sameAs`). */
  does: string | null;
  sameAs: string | null;
}

export interface PdTraceGroup {
  routine: string;
  /** "Check authority" — the step that runs this routine, when the map has one. */
  label: string | null;
  anchor: DocAnchor | null;
  reached: boolean;
  statements: PdText[];
}

export interface PdAppendix {
  elements: PdTraceElement[];
  groups: PdTraceGroup[];
  /** Sentences that appeared more than once and are printed once. */
  merged: number;
  luw: PdText[];
  lanes: PdText[];
}

export interface ProcessDocument {
  format: typeof PROCESS_DOCUMENT_FORMAT;
  formatVersion: number;
  program: string;
  fileName: string;
  lineCount: number;
  sourceSha256: string;
  note: string;
  /** The one-page summary: what it does, who starts it, the 3–5 points to know. */
  glance: PdGlance;
  purpose: {
    users: PdText;
    inScope: PdText[];
    outOfScope: PdText[];
    proposal: PdProposal | null;
  };
  trigger: { start: PdText[]; selection: PdInput[]; data: PdData[] };
  overview: { sentence: string; traceability: string; path: PdPathEntry[]; decisions: number };
  rules: PdRule[];
  exceptions: PdException[];
  outputs: PdEffect[];
  integrations: PdIntegration[];
  controls: PdControl[];
  questions: PdQuestion[];
  appendix: PdAppendix;
}

/* ------------------------------------------------------- the business part */

/**
 * A sentence a business reader learns nothing from — kept in the appendix,
 * left out of the business part (owner 03.10.2026: "The field ls_bdc-fnam is
 * set to BDC_OKCODE." is not process documentation).
 */
const TRIVIAL: readonly RegExp[] = [
  /^The field \S+ is set to /i,
  /\bthe field \S+ is set to \S+/i,
  /^A row is added\b/i,
  /^A row is added to /i,
  /The output only proves that this point in the code was reached/i,
  /^The subroutines? .+ (?:is|are) called\b/i,
  /^The local structure contains /i,
  /^A matching row is searched for in the table /i,
  /^The (?:error |status )?message \S+ is output\.?$/i,
  /^The warning \S+ is output\.?$/i,
  /^COMMIT WORK persists the change\.?$/i,
  /^The result contains /i,
  /^The report needs the include /i,
  /^Records from \S+ are selected\.?$/i,
];

export function isTrivialStatement(text: string): boolean {
  return TRIVIAL.some((pattern) => pattern.test(text.trim()));
}

/**
 * A sentence that leans on a program variable (`gs_eban-frgkz`, `lv_fm_name`,
 * `p_file`): correct, and unreadable without the source open. The business
 * part says the same thing in the step's facts, its sub-steps and the rules
 * table; the sentence stays in the appendix.
 */
const VARIABLE = /\b[a-z][a-z0-9]*_[a-z0-9_]*[a-z0-9]\b/;

export function isTechnicalSentence(text: string): boolean {
  return VARIABLE.test(text);
}

/** Business-part filter: neither trivial nor written in variables. */
export function isBusinessStatement(text: string): boolean {
  return !isTrivialStatement(text) && !isTechnicalSentence(text);
}

/** One spelling for comparing two sentences. */
export function sentenceKey(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

/* ------------------------------------------------------------------ words */

/** `L42`, `L95–114`, four at most, then a count. */
export function linesLabel(anchors: readonly DocAnchor[]): string {
  if (anchors.length === 0) return '';
  const seen = new Set<string>();
  const words: string[] = [];
  for (const a of anchors) {
    const w = a.lineEnd > a.lineStart ? `L${a.lineStart}–${a.lineEnd}` : `L${a.lineStart}`;
    if (seen.has(w)) continue;
    seen.add(w);
    words.push(w);
  }
  return words.length > 4 ? `${words.slice(0, 4).join(', ')} and ${words.length - 4} more` : words.join(', ');
}

/**
 * Every text leaf of a document — what an export must carry, in its body or its
 * appendix, for the specs and the "one outline" check: nothing the builder
 * wrote may be lost on the way to a file.
 */
export function documentTexts(doc: ProcessDocument): string[] {
  const out: string[] = [];
  const add = (t: string | null | undefined) => {
    if (t && t.trim()) out.push(t);
  };
  doc.glance.summary.forEach((t) => { add(t.text); add(t.detail); });
  add(doc.glance.trigger.text);
  doc.glance.points.forEach((p) => { add(p.text); add(p.detail); });
  add(doc.purpose.users.text);
  add(doc.purpose.users.detail);
  doc.purpose.inScope.forEach((t) => { add(t.text); add(t.detail); });
  doc.purpose.outOfScope.forEach((t) => { add(t.text); add(t.detail); });
  add(doc.purpose.proposal?.text);
  doc.trigger.start.forEach((t) => add(t.text));
  doc.trigger.selection.forEach((i) => { add(i.name.toUpperCase()); add(i.meaning); });
  doc.trigger.data.forEach((d) => { add(d.name); add(d.meaning); });
  add(doc.overview.traceability);
  for (const entry of doc.overview.path) {
    if (entry.kind === 'gate') {
      add(entry.label);
      entry.outcomes.forEach((o) => { add(o.when); add(o.then); });
    } else {
      add(entry.name);
      add(entry.businessName);
      add(entry.line);
      add(entry.facts);
      entry.does.forEach((t) => add(t.text));
      add(entry.proposal?.text);
      entry.subSteps.forEach((s) => add(s.label));
    }
  }
  doc.rules.forEach((r) => { add(r.ref); add(r.condition); add(r.effect); add(r.full); });
  doc.exceptions.forEach((e) => { add(e.what); add(e.shown); add(e.message); add(e.outcome); });
  doc.outputs.forEach((e) => { add(e.what); add(e.full); });
  doc.integrations.forEach((i) => { add(i.name); add(i.purpose); });
  doc.controls.forEach((c) => { add(c.text); add(c.full); });
  doc.questions.forEach((q) => { add(q.question); add(q.why); q.original.forEach(add); q.refs.forEach(add); });
  return out;
}

/** The engine statements the business part prints — the step sentences, each of which must be readable and said once. */
export function businessSentences(doc: ProcessDocument): PdText[] {
  const out: PdText[] = [...doc.glance.summary];
  for (const entry of doc.overview.path) if (entry.kind === 'step') out.push(...entry.does);
  return out;
}

/** Words in a text, as a reader counts them: line references (`L42`, `L95–114`) and punctuation are not words. */
export function wordCount(text: string): number {
  return text
    .replace(/[|#*>`]+/g, ' ')
    .split(/\s+/)
    .filter((w) => /[A-Za-z0-9]/.test(w) && !/^\(?L\d+(?:[–-]\d+)?[),.;:]*$/.test(w))
    .length;
}

/** The sentences of a plain text — for the "≤ 20 words" budget. */
export function sentencesOf(text: string): string[] {
  return text.split(/(?<=[.!?])\s+(?=[A-Z“"(])/).map((s) => s.trim()).filter(Boolean);
}

/** The file name of the Markdown and the Word export. */
export function processDocumentFileName(projectName: string | undefined, ext: 'md' | 'docx'): string {
  const base = (projectName || 'Project').replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'Project';
  return `${base}_process_description.${ext}`;
}
