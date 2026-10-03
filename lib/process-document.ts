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
 * This file is the **format** and the renderings that need no engine: the
 * types, the section order, the filters that keep the business part readable,
 * the technical trace of a stored document, and the Markdown and Word
 * spellings. The builder is `lib/process-document-build.ts`; the Confluence
 * page is `lib/documentation-export.ts`. The stage, the Confluence page, the
 * Markdown and the `.docx` all render one `ProcessDocument`, so they cannot
 * say different things.
 */

export const PROCESS_DOCUMENT_FORMAT = 'clean-core-process-description';
export const PROCESS_DOCUMENT_FORMAT_VERSION = 1;

/** The sections, in the order every rendering prints them. */
export const PROCESS_DOCUMENT_SECTIONS = [
  { key: 'purpose', title: '1. Purpose and scope' },
  { key: 'trigger', title: '2. Trigger and inputs' },
  { key: 'overview', title: '3. Process overview' },
  { key: 'rules', title: '4. Decision points and business rules' },
  { key: 'exceptions', title: '5. Exceptions and early ends' },
  { key: 'outputs', title: '6. Outputs and effects' },
  { key: 'integrations', title: '7. Integrations' },
  { key: 'controls', title: '8. Controls and audit' },
  { key: 'questions', title: '9. Open questions for the business' },
  { key: 'appendix', title: 'Appendix: technical trace' },
] as const;

export type ProcessDocumentSection = (typeof PROCESS_DOCUMENT_SECTIONS)[number]['key'];

export const sectionTitle = (key: ProcessDocumentSection): string =>
  PROCESS_DOCUMENT_SECTIONS.find((s) => s.key === key)!.title;

/** What the document is, in one paragraph, at the top of every rendering. */
export const PROCESS_DOCUMENT_NOTE =
  'Read by the Clean-Core.io engine from the source the signed run analysed. Every statement names the lines it was read from (L…). '
  + 'What the code cannot answer is asked once, under open questions. Text marked "Model proposal" was worded by a language model; '
  + 'the engine wording stands beside it.';

/** What a section says when the code gives it nothing — a finding, not a default. */
export const EMPTY_SECTION: Readonly<Record<Exclude<ProcessDocumentSection, 'purpose' | 'overview' | 'appendix'>, string>> = {
  trigger: 'The engine found no selection screen and no event block that starts the program.',
  rules: 'The engine found no business rule and no decision point that changes the path.',
  exceptions: 'The engine found no early end and no error message in the code the entry point reaches.',
  outputs: 'The engine found no change of data and no output in the code the entry point reaches.',
  integrations: 'The code the entry point reaches calls no function module, transaction or other program by name.',
  controls: 'The engine found no authorization check, no record of its own and no explicit commit or rollback.',
  questions: 'The engine left no question open.',
};

export const MODEL_PROPOSAL_LABEL = 'Model proposal';

/* ------------------------------------------------------------------ types */

export interface PdText {
  text: string;
  /** Never empty for a statement about the code. */
  anchors: DocAnchor[];
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
  /** "Reads purchase requisition (EBAN). Can end early in 1 place." — counted, not written. */
  facts: string;
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
}

export interface PdException {
  what: string;
  where: string | null;
  /** The message the user sees, as the code writes it; null when the code shows none here. */
  message: string | null;
  outcome: string;
  anchors: DocAnchor[];
}

export interface PdEffect {
  kind: string;
  what: string;
  objects: string[];
  anchors: DocAnchor[];
}

export interface PdIntegration {
  name: string;
  kind: string;
  purpose: string;
  anchors: DocAnchor[];
}

export interface PdControl {
  kind: string;
  text: string;
  ref: string | null;
  anchors: DocAnchor[];
}

export interface PdQuestion {
  id: string;
  owner: 'Business' | 'IT operations';
  question: string;
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
  purpose: {
    summary: PdText[];
    users: PdText;
    inScope: PdText[];
    outOfScope: PdText[];
    proposal: PdProposal | null;
  };
  trigger: { start: PdText[]; selection: PdInput[]; data: PdData[] };
  overview: { sentence: string; traceability: string; path: PdPathEntry[] };
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

/** Every text leaf of a document — what a rendering must carry, for the specs and the "one builder" check. */
export function documentTexts(doc: ProcessDocument): string[] {
  const out: string[] = [];
  const add = (t: string | null | undefined) => {
    if (t && t.trim()) out.push(t);
  };
  doc.purpose.summary.forEach((t) => add(t.text));
  add(doc.purpose.users.text);
  doc.purpose.inScope.forEach((t) => add(t.text));
  doc.purpose.outOfScope.forEach((t) => add(t.text));
  add(doc.purpose.proposal?.text);
  doc.trigger.start.forEach((t) => add(t.text));
  doc.trigger.selection.forEach((i) => { add(i.name.toUpperCase()); add(i.meaning); });
  doc.trigger.data.forEach((d) => { add(d.name); add(d.meaning); });
  add(doc.overview.sentence);
  for (const entry of doc.overview.path) {
    if (entry.kind === 'gate') {
      add(entry.label);
      entry.outcomes.forEach((o) => { add(o.when); add(o.then); });
    } else {
      add(entry.name);
      add(entry.businessName);
      add(entry.facts);
      entry.does.forEach((t) => add(t.text));
      add(entry.proposal?.text);
      entry.subSteps.forEach((s) => add(s.label));
    }
  }
  doc.rules.forEach((r) => { add(r.ref); add(r.condition); add(r.effect); });
  doc.exceptions.forEach((e) => { add(e.what); add(e.message); add(e.outcome); });
  doc.outputs.forEach((e) => add(e.what));
  doc.integrations.forEach((i) => { add(i.name); add(i.purpose); });
  doc.controls.forEach((c) => add(c.text));
  doc.questions.forEach((q) => { add(q.question); add(q.why); });
  return out;
}

/** The business part's sentences — everything above the appendix that the engine wrote as a statement. */
export function businessSentences(doc: ProcessDocument): PdText[] {
  const out: PdText[] = [...doc.purpose.summary];
  for (const entry of doc.overview.path) if (entry.kind === 'step') out.push(...entry.does);
  return out;
}

/* ------------------------------------------- Markdown and Word, from blocks */

/**
 * The block list every text rendering is made from — headings, paragraphs and
 * tables in document order. Markdown and the `.docx` spell it out
 * (`lib/requirements-export.ts`); the Confluence page has its own markup
 * because it carries the diagram, and reads the same document.
 */
export type PdBlock =
  | { k: 'h'; level: 1 | 2 | 3 | 4 | 5; text: string }
  | { k: 'p'; text: string; strong?: boolean; em?: boolean }
  | { k: 'note'; text: string }
  | { k: 'table'; head: string[]; rows: string[][] }
  | { k: 'kv'; items: Array<[string, string]> }
  | { k: 'ol'; items: string[] };

const withLines = (text: string, anchors: readonly DocAnchor[]) => (anchors.length ? `${text} (${linesLabel(anchors)})` : text);

/** One step as the numbered list item of the main path. */
export function stepLine(step: PdStep): string {
  const name = step.businessName ? `${step.businessName} (${MODEL_PROPOSAL_LABEL}; engine: ${step.name})` : step.name;
  return `${name} · ${step.anchors.length ? `lines ${linesLabel(step.anchors)}` : 'lines not determined'} · ${step.technicalName}`;
}

/** A decision point between two steps, as one sentence. */
export function gateLine(gate: PdGate): string {
  const outcomes = gate.outcomes.map((o) => `${o.when}: ${o.then}`).join('; ');
  return `Decision point “${gate.label}”${gate.anchor ? ` (${linesLabel([gate.anchor])})` : ''} — ${outcomes}.`;
}

export function processDocumentBlocks(doc: ProcessDocument, meta: { projectName: string; date?: string }): PdBlock[] {
  const b: PdBlock[] = [];
  b.push({ k: 'h', level: 1, text: `Process description — ${meta.projectName}` });
  b.push({ k: 'p', text: `Source: ${doc.fileName} · ${doc.lineCount} lines · SHA-256 ${doc.sourceSha256.slice(0, 16)}…${meta.date ? ` · ${meta.date}` : ''}` });
  b.push({ k: 'note', text: doc.note });

  b.push({ k: 'h', level: 2, text: sectionTitle('purpose') });
  for (const t of doc.purpose.summary) b.push({ k: 'p', text: withLines(t.text, t.anchors) });
  if (doc.purpose.proposal) {
    b.push({ k: 'p', em: true, text: `${MODEL_PROPOSAL_LABEL}: ${withLines(doc.purpose.proposal.text, doc.purpose.proposal.anchors)}` });
  }
  b.push({ k: 'p', text: withLines(doc.purpose.users.text, doc.purpose.users.anchors) });
  b.push({ k: 'p', strong: true, text: 'In scope' });
  b.push({ k: 'ol', items: doc.purpose.inScope.map((t) => withLines(t.text, t.anchors)) });
  b.push({ k: 'p', strong: true, text: 'Not in scope — not in this code' });
  b.push({ k: 'ol', items: doc.purpose.outOfScope.map((t) => withLines(t.text, t.anchors)) });

  b.push({ k: 'h', level: 2, text: sectionTitle('trigger') });
  if (!doc.trigger.start.length && !doc.trigger.selection.length) b.push({ k: 'p', text: EMPTY_SECTION.trigger });
  for (const t of doc.trigger.start) b.push({ k: 'p', text: withLines(t.text, t.anchors) });
  if (doc.trigger.selection.length) {
    b.push({ k: 'p', strong: true, text: 'Selection screen' });
    b.push({
      k: 'table',
      head: ['Field', 'Meaning', 'Kind', 'Required', 'Default', 'Line'],
      rows: doc.trigger.selection.map((i) => [i.name.toUpperCase(), i.meaning, i.kind, i.required ? 'Yes' : 'No', i.defaultValue ?? '—', linesLabel([i.anchor])]),
    });
  }
  if (doc.trigger.data.length) {
    b.push({ k: 'p', strong: true, text: 'Data the process reads' });
    b.push({
      k: 'table',
      head: ['Table', 'Business object', 'Owner', 'Lines'],
      rows: doc.trigger.data.map((d) => [d.name, d.meaning ?? '—', d.owner, linesLabel(d.anchors)]),
    });
  }

  b.push({ k: 'h', level: 2, text: sectionTitle('overview') });
  b.push({ k: 'p', text: doc.overview.sentence });
  b.push({ k: 'p', em: true, text: doc.overview.traceability });
  for (const entry of doc.overview.path) {
    if (entry.kind === 'gate') {
      b.push({ k: 'p', em: true, text: gateLine(entry) });
      continue;
    }
    b.push({ k: 'h', level: 3, text: `${entry.number}. ${entry.businessName ?? entry.name}` });
    b.push({ k: 'p', text: stepLine(entry) });
    if (entry.facts) b.push({ k: 'p', text: entry.facts });
    if (entry.proposal) b.push({ k: 'p', em: true, text: `${MODEL_PROPOSAL_LABEL}: ${withLines(entry.proposal.text, entry.proposal.anchors)}` });
    for (const t of entry.does) b.push({ k: 'p', text: withLines(t.text, t.anchors) });
    if (entry.subSteps.length) {
      b.push({
        k: 'ol',
        items: [
          ...entry.subSteps.map((s) => `${s.depth > 1 ? '– ' : ''}${s.kind}: ${s.label}${s.anchor ? ` (${linesLabel([s.anchor])})` : ''}`),
          ...(entry.moreSubSteps > 0 ? [`and ${entry.moreSubSteps} more — see the appendix`] : []),
        ],
      });
    }
  }

  b.push({ k: 'h', level: 2, text: sectionTitle('rules') });
  if (!doc.rules.length) b.push({ k: 'p', text: EMPTY_SECTION.rules });
  else b.push({ k: 'table', head: ['Rule', 'Where', 'Condition', 'Effect', 'Lines'], rows: doc.rules.map((r) => [r.ref, r.where ?? 'Whole program', r.condition, r.effect, linesLabel(r.anchors)]) });

  b.push({ k: 'h', level: 2, text: sectionTitle('exceptions') });
  if (!doc.exceptions.length) b.push({ k: 'p', text: EMPTY_SECTION.exceptions });
  else b.push({ k: 'table', head: ['What happens', 'Where', 'Message the user sees', 'Outcome', 'Lines'], rows: doc.exceptions.map((e) => [e.what, e.where ?? '—', e.message ?? 'None at this point', e.outcome, linesLabel(e.anchors)]) });

  b.push({ k: 'h', level: 2, text: sectionTitle('outputs') });
  if (!doc.outputs.length) b.push({ k: 'p', text: EMPTY_SECTION.outputs });
  else b.push({ k: 'table', head: ['Effect', 'What', 'Objects', 'Lines'], rows: doc.outputs.map((e) => [e.kind, e.what, e.objects.join(', ') || '—', linesLabel(e.anchors)]) });

  b.push({ k: 'h', level: 2, text: sectionTitle('integrations') });
  if (!doc.integrations.length) b.push({ k: 'p', text: EMPTY_SECTION.integrations });
  else b.push({ k: 'table', head: ['Called', 'Kind', 'Purpose', 'Lines'], rows: doc.integrations.map((i) => [i.name, i.kind, i.purpose, linesLabel(i.anchors)]) });

  b.push({ k: 'h', level: 2, text: sectionTitle('controls') });
  if (!doc.controls.length) b.push({ k: 'p', text: EMPTY_SECTION.controls });
  else b.push({ k: 'table', head: ['Control', 'What the code does', 'Ref', 'Lines'], rows: doc.controls.map((c) => [c.kind, c.text, c.ref ?? '—', linesLabel(c.anchors)]) });

  b.push({ k: 'h', level: 2, text: sectionTitle('questions') });
  if (!doc.questions.length) b.push({ k: 'p', text: EMPTY_SECTION.questions });
  else {
    b.push({ k: 'p', text: 'Not determined from the code. Each question is asked once; the evidence names the lines that raise it.' });
    b.push({ k: 'table', head: ['ID', 'Owner', 'Question', 'Why the code cannot answer it', 'Lines'], rows: doc.questions.map((q) => [q.id, q.owner, q.question, q.why, q.anchors.length ? linesLabel(q.anchors) : 'not in the code']) });
  }

  b.push({ k: 'h', level: 2, text: sectionTitle('appendix') });
  b.push({ k: 'p', em: true, text: appendixLead(doc.appendix) });
  b.push({ k: 'h', level: 3, text: 'A.1 Process elements' });
  b.push({
    k: 'table',
    head: ['Element', 'Kind', 'Name', 'What it does', 'Lines'],
    rows: doc.appendix.elements.map((e) => [e.id, e.kind, e.name, e.does ?? (e.sameAs ? `As at ${e.sameAs}` : ''), e.evidence]),
  });
  b.push({ k: 'h', level: 3, text: 'A.2 Statements by routine' });
  for (const g of doc.appendix.groups) {
    b.push({ k: 'h', level: 4, text: groupTitle(g) });
    b.push({ k: 'ol', items: g.statements.map((s) => withLines(s.text, s.anchors)) });
  }
  if (doc.appendix.luw.length) {
    b.push({ k: 'h', level: 3, text: 'A.3 Saving changes' });
    b.push({ k: 'ol', items: doc.appendix.luw.map((t) => withLines(t.text, t.anchors)) });
  }
  if (doc.appendix.lanes.length) {
    b.push({ k: 'h', level: 3, text: 'A.4 Lanes the code proves' });
    b.push({ k: 'ol', items: doc.appendix.lanes.map((t) => withLines(t.text, t.anchors)) });
  }
  return b;
}

export function appendixLead(appendix: PdAppendix): string {
  return `Every process element and every statement the engine read, grouped by routine. Each sentence is printed once${appendix.merged ? ` (${appendix.merged} repeats merged)` : ''}; nothing is left out.`;
}

export function groupTitle(g: PdTraceGroup): string {
  const name = g.label && g.label.toLowerCase() !== g.routine.toLowerCase() ? `${g.label} — ${g.routine}` : g.routine;
  return `${name}${g.anchor ? ` (${linesLabel([g.anchor])})` : ''}${g.reached ? '' : ' — not reached by any entry point'}`;
}

/** The file name of the Markdown and the Word export. */
export function processDocumentFileName(projectName: string | undefined, ext: 'md' | 'docx'): string {
  const base = (projectName || 'Project').replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'Project';
  return `${base}_process_description.${ext}`;
}
