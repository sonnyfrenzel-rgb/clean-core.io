import type { DocAnchor } from '@/lib/process-documentation';
import type { DocBlock } from '@/lib/requirements-export';
import type { OpenQuestionGroup, OpenQuestions } from '@/lib/open-questions';
import { wt } from '@/lib/workspace-messages';
import {
  EMPTY_SECTION,
  MODEL_PROPOSAL_LABEL,
  PROCESS_DOCUMENT_STATUS,
  linesLabel,
  sectionTitle,
  type PdAppendix,
  type PdGate,
  type PdPathEntry,
  type PdPoint,
  type PdQuestion,
  type PdStep,
  type PdText,
  type PdTraceGroup,
  type ProcessDocument,
  type ProcessDocumentSection,
} from '@/lib/process-document';

/**
 * How the process description reads — one outline for every rendering (owner
 * 04.10.2026: "far too long, complex, linguistically complicated and not
 * enterprise-ready … much smarter-looking, to the point and more concise").
 *
 * The stage (`components/documentation/ProcessDocumentView.tsx`), the
 * Confluence page (`lib/documentation-export.ts`), the Markdown and the `.docx`
 * (`processDocumentBlocks` below) all take their headings, their one-line
 * leads, their tables and their order from here. The screen folds what a file
 * cannot fold; a file moves it to its appendix. Nothing is said in one
 * rendering that another leaves out.
 *
 * The shape, top to bottom:
 *
 *   cover        program, source, source version, date, status
 *   at a glance  what it does (2–3 sentences), who starts it, six key figures,
 *                the 3–5 rules and risks to know, the main path in one line
 *   1–9          each section: a one-line lead, then a compact table whose
 *                last column ("Source") carries the program's names and lines;
 *                section 9 is the project's one list of open questions
 *                (ADR-081, `lib/open-questions.ts`) with its end states
 *   appendix     step details, the code's own wording of every shortened row,
 *                the questions about the requirements, and the technical trace
 *
 * Pure: no React, no DOM, no clock.
 */

export type PdSectionKey = Exclude<ProcessDocumentSection, 'appendix'>;

/** A key figure of the summary — each one names the section it counts. */
export interface PdFigure {
  section: PdSectionKey;
  label: string;
  /** `null`: not known to this rendering (the open questions, when the project's list was not passed). */
  value: number | null;
}

/** A row of a table: the plain cells, then the program's names and the lines in a muted source column. */
export interface PdRow {
  cells: string[];
  /** Program names for the source column (`EBAN`, `E001 · ZMM_PO`); null when the row has none. */
  tech: string | null;
  anchors: DocAnchor[];
}

export interface PdTable {
  id: string;
  caption: string;
  head: string[];
  rows: PdRow[];
  /** Rows the stage shows before "Show all" (DESIGN.md §2.11); a file prints every row. */
  first: number;
}

export interface PdOutline {
  title: string;
  /** Cover rows: what this document is about and how far to trust it. */
  cover: Array<[string, string]>;
  note: string;
  glance: { summary: PdText[]; trigger: PdText; figures: PdFigure[]; points: PdPoint[]; path: string };
  /** One line per section — what it holds, counted. */
  leads: Record<PdSectionKey, string>;
  tables: {
    inputs: PdTable | null;
    data: PdTable | null;
    steps: PdTable;
    rules: PdTable | null;
    exceptions: PdTable | null;
    outputs: PdTable | null;
    integrations: PdTable | null;
    controls: PdTable | null;
  };
  /**
   * Section 9 — the project's one list of open questions (ADR-081), passed in
   * by the caller because it reads the project (imports, answers, the rules'
   * state), not only the source. `null` when the rendering was made without
   * it: the section then says so instead of counting.
   */
  questions: {
    list: OpenQuestions | null;
    /** One row per group of the list, with its end state; null without a list or without groups. */
    table: PdTable | null;
    /** The questions about the requirements the engine raised (`doc.questions`) — decided in Design, listed in A.4. */
    requirements: number;
    /** The sentence that points at A.4, or null when there are none. */
    requirementsLine: string | null;
  };
}

/** The meta every rendering of the outline takes. */
export interface PdOutlineMeta {
  projectName?: string;
  date?: string;
  /** The project's open questions (`useOpenQuestions`), for section 9. */
  openQuestions?: OpenQuestions | null;
}

/** A key figure as text — a figure this rendering does not know reads *Not determined*, never 0. */
export const figureText = (f: PdFigure): string => (f.value === null ? 'Not determined' : String(f.value));

/** The column every table ends with: the program's names and the lines. */
export const SOURCE_COLUMN = 'Source';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * At most three of the program's names in the body — "CHECK_COST_CENTER,
 * CHECK_BUDGET, READ_CONTRACT +10". The rest are in the appendix (the trace
 * lists every routine, the tables and calls have their own sections).
 */
export function shortTech(tech: string | null | undefined, max = 3): string | null {
  if (!tech) return null;
  const names = tech.split(/,\s*/).filter((n) => n && n !== '…');
  return names.length > max ? `${names.slice(0, max).join(', ')} +${names.length - max}` : tech;
}

/** The source column as text: `EBAN · L61, L98`. */
export function sourceText(row: Pick<PdRow, 'tech' | 'anchors'>): string {
  return [shortTech(row.tech), linesLabel(row.anchors)].filter((x): x is string => !!x).join(' · ') || '—';
}

/** An exception's result in two or three words; the full sentence stands in the appendix. */
export function resultWord(outcome: string): string {
  if (/stops with an error/i.test(outcome)) return 'Run stops (error)';
  if (/terminates/i.test(outcome)) return 'Run terminates';
  if (/^The run ends/i.test(outcome)) return 'Run ends';
  if (/warning/i.test(outcome)) return 'Warning; run continues';
  if (/error path/i.test(outcome)) return 'Error path of the step';
  if (/leaves its normal path/i.test(outcome)) return 'Step leaves its path';
  if (/ends here/i.test(outcome)) return 'Step ends';
  if (/message is shown/i.test(outcome)) return 'Message; run continues';
  return outcome;
}

/** "Q7" — the number a reader sees for a question about the requirements (appendix A.4). */
export const questionNumber = (q: Pick<PdQuestion, 'number'>) => `Q${q.number}`;

/* ------------------------------------------------------- section 9 (ADR-081) */

/** The end state of a group, in the list's own words (`lib/messages/workspace.ts`). */
export function openQuestionState(g: OpenQuestionGroup): string {
  if (g.end === 'resolved') return wt('oq.end.resolved');
  if (g.end === 'answered') return `${wt('oq.end.answered')} — confirmed by the owner, not proven`;
  if (g.end === 'accepted') return wt('oq.end.accepted');
  return g.blocksDecision ? `Open — ${wt('oq.blocks')}` : 'Open';
}

/**
 * What settles a group, or what settled it. An answer is quoted with its date
 * and no account: a file leaves the product, and the address of the person who
 * answered does not travel with it.
 */
export function openQuestionDetail(g: OpenQuestionGroup): string {
  if (g.end === 'resolved') return g.evidence ?? g.resolves;
  if (g.answer && g.end === 'answered') return `“${g.answer.text}” (${g.answer.at.slice(0, 10)})`;
  if (g.answer && g.end === 'accepted') return `Reason: “${g.answer.text}” (${g.answer.at.slice(0, 10)})`;
  return g.resolves;
}

/** `L502` → a line anchor; anything else is not a line. */
function lineAnchor(anchor: string | null): DocAnchor | null {
  const m = anchor ? /^L(\d+)$/.exec(anchor) : null;
  return m ? { lineStart: Number(m[1]), lineEnd: Number(m[1]) } : null;
}

/** The lines a group's questions stand on, for the source column. */
export function openQuestionAnchors(g: OpenQuestionGroup): DocAnchor[] {
  return g.lines.map((l) => lineAnchor(l.anchor)).filter((a): a is DocAnchor => a !== null);
}

/** The groups of the list as one table every rendering prints — open first, then the closed ones. */
export function openQuestionsTable(list: OpenQuestions): PdTable | null {
  if (list.groups.length === 0) return null;
  const rows: PdRow[] = list.groups.map((g) => ({
    cells: [g.title, g.owner, String(g.count), openQuestionState(g), openQuestionDetail(g)],
    tech: null,
    anchors: openQuestionAnchors(g),
  }));
  return { id: 'questions', caption: 'Open questions', head: ['Question', 'Owner', 'How many', 'State', 'What settles it'], rows, first: rows.length };
}

/** Section 9's lead: the list's counts in one line of plain words. */
function questionsLead(list: OpenQuestions | null): string {
  if (!list) return 'The open questions are kept with the project and were not passed to this copy.';
  const closed = list.groups.filter((g) => g.end !== 'open').length;
  if (list.open === 0) {
    return list.groups.length
      ? `No open question is left: ${plural(closed, 'group is', 'groups are')} resolved, answered or accepted.`
      : EMPTY_SECTION.questions;
  }
  return `${plural(list.open, 'open question')}; ${list.blocking} ${list.blocking === 1 ? 'blocks' : 'block'} the decision; ${closed} of ${plural(list.groups.length, 'group')} closed.`;
}

export const BLOCKS_WORD: Record<'design' | 'cutover', string> = {
  design: 'Blocks the design',
  cutover: 'Blocks the cutover',
};

/** A decision point between two steps, in one line. */
export function gateLine(gate: PdGate): string {
  return gate.outcomes.map((o) => `${o.when}: ${o.then}`).join('; ');
}

/** A decision point as one sentence of the appendix, with its line. */
export function gateSentence(gate: PdGate): string {
  return `Decision point “${gate.label}”${gate.anchor ? ` (${linesLabel([gate.anchor])})` : ''} — ${gateLine(gate)}.`;
}

/** The step's own name — the model's business name where one is stored, marked by the renderer. */
export const stepName = (step: PdStep) => step.businessName ?? step.name;

/** The main path in one line: "1 Check authority → 2 Read requisition → …". */
export function pathLine(path: readonly PdPathEntry[]): string {
  return path
    .filter((e): e is PdStep => e.kind === 'step')
    .map((s) => `${s.number} ${stepName(s)}`)
    .join(' → ');
}

/* ---------------------------------------------------------------- ordering */

const ruleRank = (r: ProcessDocument['rules'][number]) => {
  if (/^Always/.test(r.condition)) return 3;
  if (!/^BR-\d+$/.test(r.ref)) return 2;
  return /\b(?:above|below|at most|at least|more than|less than|over|under)\b/i.test(r.condition) ? 0 : 1;
};

// What the user sees comes first — errors, then warnings; the run's ends at a
// decision point are on the main path already.
const exceptionRank = (e: ProcessDocument['exceptions'][number]) => {
  if (/stops|terminates/i.test(e.outcome)) return 0;
  if (/warning/i.test(e.outcome)) return 1;
  if (/^The run ends/i.test(e.outcome)) return 2;
  return 3;
};

const effectRank = (e: ProcessDocument['outputs'][number]) => {
  if (/^Creates a document/.test(e.kind)) return 0;
  if (/workflow/i.test(e.kind)) return 1;
  if (/^Changes data/.test(e.kind)) return 2;
  if (/list/i.test(e.kind)) return 4;
  return 3;
};

function sorted<T>(items: readonly T[], rank: (item: T) => number): T[] {
  return items.map((item, i) => ({ item, i })).sort((a, b) => rank(a.item) - rank(b.item) || a.i - b.i).map((x) => x.item);
}

/* ---------------------------------------------------------------- outline */

export function documentOutline(doc: ProcessDocument, meta: PdOutlineMeta = {}): PdOutline {
  const steps = doc.overview.path.filter((e): e is PdStep => e.kind === 'step');
  const list = meta.openQuestions ?? null;
  const brRules = doc.rules.filter((r) => /^BR-\d+$/.test(r.ref) && !/^Always/.test(r.condition)).length;
  const fixedRules = doc.rules.filter((r) => /^Always/.test(r.condition)).length;
  const decisionRows = doc.rules.length - brRules - fixedRules;

  const figures: PdFigure[] = [
    { section: 'overview', label: 'Steps', value: steps.length },
    { section: 'overview', label: 'Decision points', value: doc.overview.decisions },
    { section: 'rules', label: 'Business rules', value: doc.rules.length },
    { section: 'exceptions', label: 'Exceptions', value: doc.exceptions.length },
    { section: 'integrations', label: 'Integrations', value: doc.integrations.length },
    { section: 'questions', label: 'Open questions', value: list ? list.open : null },
  ];

  const stops = doc.exceptions.filter((e) => exceptionRank(e) === 0).length;
  const warns = doc.exceptions.filter((e) => exceptionRank(e) === 1).length;
  const ends = doc.exceptions.length - stops - warns;
  const integrationKinds = new Map<string, number>();
  for (const i of doc.integrations) {
    const k = /BAPI/.test(i.kind) ? 'BAPI' : /Transaction/.test(i.kind) ? 'transaction' : /File/.test(i.kind) ? 'file' : /Workflow/.test(i.kind) ? 'workflow' : /Program/.test(i.kind) ? 'program' : 'function';
    integrationKinds.set(k, (integrationKinds.get(k) ?? 0) + 1);
  }
  const KIND_PLURAL: Record<string, string> = { BAPI: 'BAPIs', transaction: 'transactions', file: 'files', workflow: 'workflow events', program: 'programs', function: 'functions' };

  const leads: Record<PdSectionKey, string> = {
    purpose: `What this description covers, and the ${plural(doc.purpose.outOfScope.length, 'topic', 'topics')} it leaves to others.`,
    trigger: doc.trigger.selection.length || doc.trigger.data.length
      ? `${plural(doc.trigger.selection.length, 'input')} on the selection screen; it reads ${plural(doc.trigger.data.length, 'table')}.`
      : EMPTY_SECTION.trigger,
    overview: doc.overview.sentence,
    rules: doc.rules.length
      ? `${plural(doc.rules.length, 'rule')}: ${plural(brRules, 'business rule')}, ${plural(decisionRows, 'decision point')}, ${plural(fixedRules, 'fixed value')}.`
      : EMPTY_SECTION.rules,
    exceptions: doc.exceptions.length
      ? `${plural(stops, 'case stops', 'cases stop')} the run with an error; ${plural(warns, 'warns', 'warn')} and continue; ${plural(ends, 'ends', 'end')} a step or the run early.`
      : EMPTY_SECTION.exceptions,
    outputs: doc.outputs.length
      ? `${plural(doc.outputs.length, 'effect')} on data and documents, the weightiest first.`
      : EMPTY_SECTION.outputs,
    integrations: doc.integrations.length
      ? `${plural(doc.integrations.length, 'call')} to other functions: ${[...integrationKinds].map(([k, n]) => (n === 1 ? `1 ${k}` : `${n} ${KIND_PLURAL[k]}`)).join(', ')}.`
      : EMPTY_SECTION.integrations,
    controls: doc.controls.length
      ? `${plural(doc.controls.length, 'control')} in the code: ${doc.controls.map((c) => c.kind.replace(/\b([A-Z])([a-z])/g, (_, a: string, b: string) => `${a.toLowerCase()}${b}`)).join(', ')}.`
      : EMPTY_SECTION.controls,
    questions: questionsLead(list),
  };

  const t = doc.trigger;
  const table = (id: string, caption: string, head: string[], rows: PdRow[], first = 5): PdTable | null =>
    rows.length ? { id, caption, head, rows, first } : null;

  const stepRows: PdRow[] = doc.overview.path.map((entry) =>
    entry.kind === 'gate'
      ? { cells: ['◇', `Decision: ${entry.label}`, gateLine(entry)], tech: null, anchors: entry.anchor ? [entry.anchor] : [] }
      : {
          cells: [String(entry.number), `${stepName(entry)}${entry.businessName ? ` (${MODEL_PROPOSAL_LABEL})` : ''}`, entry.line || '—'],
          tech: entry.technicalName,
          anchors: entry.anchors,
        },
  );

  return {
    title: `Process description — ${meta.projectName || doc.program}`,
    cover: [
      ['Program', doc.program],
      ['Source', `${doc.fileName} · ${doc.lineCount} lines`],
      ['Source version', `SHA-256 ${doc.sourceSha256.slice(0, 16)}…`],
      ...(meta.date ? [['Date', meta.date] as [string, string]] : []),
      ['Status', PROCESS_DOCUMENT_STATUS],
    ],
    note: doc.note,
    glance: { summary: doc.glance.summary, trigger: doc.glance.trigger, figures, points: doc.glance.points, path: pathLine(doc.overview.path) },
    leads,
    tables: {
      inputs: table('inputs', 'Selection screen', ['Input', 'Required', 'Default'],
        t.selection.map((i) => ({ cells: [i.meaning, i.required ? 'Yes' : 'No', i.defaultValue ?? '—'], tech: i.name.toUpperCase(), anchors: [i.anchor] }))),
      data: table('data', 'Data it reads', ['Business object', 'Owner'],
        t.data.map((d) => ({ cells: [d.meaning ?? (d.owner === 'Customer' ? 'Custom table' : 'SAP table'), d.owner], tech: d.name, anchors: d.anchors }))),
      steps: { id: 'steps', caption: 'Main path', head: ['No.', 'Step', 'What happens'], rows: stepRows, first: stepRows.length },
      rules: table('rules', 'Business rules and decision points', ['Rule', 'When', 'Then', 'Step'],
        sorted(doc.rules, ruleRank).map((r) => ({ cells: [r.ref, r.condition, r.effect, r.where ?? 'Whole program'], tech: null, anchors: r.anchors })), 6),
      exceptions: table('exceptions', 'Exceptions', ['What happens', 'Step', 'The user sees', 'Result'],
        sorted(doc.exceptions, exceptionRank).map((e) => ({ cells: [e.what, e.where ?? '—', e.shown ? `“${e.shown}”` : '—', resultWord(e.outcome)], tech: e.messageRef, anchors: e.anchors })), 6),
      outputs: table('outputs', 'Outputs and effects', ['Effect', 'What'],
        sorted(doc.outputs, effectRank).map((e) => ({ cells: [e.kind, e.what], tech: e.objects.join(', ') || null, anchors: e.anchors }))),
      integrations: table('integrations', 'Integrations', ['Purpose', 'Kind'],
        doc.integrations.map((i) => ({ cells: [i.purpose, i.kind], tech: i.name, anchors: i.anchors })), 8),
      controls: table('controls', 'Controls', ['Control', 'What the code does'],
        doc.controls.map((c) => ({ cells: [c.kind, c.text], tech: [c.detail, c.ref].filter(Boolean).join(' · ') || null, anchors: c.anchors })), 8),
    },
    questions: {
      list,
      table: list ? openQuestionsTable(list) : null,
      requirements: doc.questions.length,
      requirementsLine: doc.questions.length
        ? `${plural(doc.questions.length, 'question', 'questions')} about the requirements ${doc.questions.length === 1 ? 'is a decision' : 'are decisions'} of the requirements workspace in Design; ${REQUIREMENT_QUESTIONS} lists them.`
        : null,
    },
  };
}

/** The appendix section that lists the engine's questions about the requirements. */
export const REQUIREMENT_QUESTIONS = 'A.4 Questions about the requirements';

/** The tables whose rows go past what the body shows — printed whole in the appendix. */
export function longTables(o: PdOutline): PdTable[] {
  const t = o.tables;
  return [t.inputs, t.data, t.rules, t.exceptions, t.outputs, t.integrations, t.controls]
    .filter((x): x is PdTable => !!x && x.rows.length > x.first);
}

/** The appendix section that carries every row of a long table. */
export const COMPLETE_TABLES = 'A.2 Complete tables';

/** What a file says under a table it shortened. */
export function moreRowsLine(t: PdTable): string {
  return `The ${t.first} most important of ${t.rows.length} rows. All ${t.rows.length} are in the appendix, ${COMPLETE_TABLES}.`;
}

/* ---------------------------------------------------------------- appendix */

export function appendixLead(appendix: PdAppendix): string {
  return `What the body says shorter, in the code's own words, then every process element and statement the engine read. Each sentence is printed once${appendix.merged ? ` (${appendix.merged} repeats merged)` : ''}; nothing is left out.`;
}

export function groupTitle(g: PdTraceGroup): string {
  const name = g.label && g.label.toLowerCase() !== g.routine.toLowerCase() ? `${g.label} — ${g.routine}` : g.routine;
  return `${name}${g.anchor ? ` (${linesLabel([g.anchor])})` : ''}${g.reached ? '' : ' — not reached by any entry point'}`;
}

const withLines = (text: string, anchors: readonly DocAnchor[]) => (anchors.length ? `${text} (${linesLabel(anchors)})` : text);

/** One step of the appendix's step details, as lines of text. */
export function stepDetailLines(step: PdStep): string[] {
  const out: string[] = [];
  out.push(`Technical: ${step.technicalName} · ${step.anchors.length ? linesLabel(step.anchors) : 'lines not determined'}${step.businessName ? ` · engine name: ${step.name}` : ''}`);
  if (step.facts) out.push(step.facts);
  if (step.proposal) out.push(`${MODEL_PROPOSAL_LABEL}: ${withLines(step.proposal.text, step.proposal.anchors)}`);
  for (const d of step.does) out.push(withLines(d.text, d.anchors));
  for (const s of step.subSteps) out.push(`${s.depth > 1 ? '– ' : ''}${s.kind}: ${s.label}${s.anchor ? ` (${linesLabel([s.anchor])})` : ''}`);
  if (step.moreSubSteps > 0) out.push(`and ${step.moreSubSteps} more sub-steps — see the process elements below`);
  return out;
}

/** What the body says shorter, beside what the code's reading said — so nothing is lost by the shortening. */
export function wordingRows(doc: ProcessDocument): string[][] {
  const rows: string[][] = [];
  for (const r of doc.rules) if (r.full) rows.push([sectionTitle('rules'), r.ref, r.full, linesLabel(r.anchors)]);
  for (const e of doc.exceptions) rows.push([sectionTitle('exceptions'), e.what, [e.message, e.outcome].filter(Boolean).join(' — '), linesLabel(e.anchors)]);
  for (const o of doc.outputs) if (o.full) rows.push([sectionTitle('outputs'), o.kind, o.full, linesLabel(o.anchors)]);
  for (const c of doc.controls) if (c.full) rows.push([sectionTitle('controls'), c.kind, c.full, linesLabel(c.anchors)]);
  for (const s of doc.trigger.start) rows.push([sectionTitle('trigger'), 'Start', s.text, linesLabel(s.anchors)]);
  // The summary prints its sentences without their names; the names stand here.
  for (const s of [...doc.glance.summary, doc.glance.trigger]) if (s.detail) rows.push(['At a glance', s.text, s.detail, linesLabel(s.anchors)]);
  for (const s of [doc.purpose.users, ...doc.purpose.inScope, ...doc.purpose.outOfScope]) {
    if (s.detail && shortTech(s.detail) !== s.detail) rows.push([sectionTitle('purpose'), s.text, s.detail, linesLabel(s.anchors)]);
  }
  for (const q of doc.questions) if (q.detail && shortTech(q.detail) !== q.detail) rows.push([sectionTitle('questions'), questionNumber(q), q.detail, linesLabel(q.anchors)]);
  rows.push([sectionTitle('overview'), 'Traceability', doc.overview.traceability, '']);
  return rows;
}

/** The head of appendix A.4. */
export const REQUIREMENT_QUESTION_HEAD = ['No.', 'Question', 'Owner', 'Priority', 'Source ids', 'Why the code cannot answer it', 'As the engine asked'];

/**
 * The engine's questions about the requirements (`doc.questions`): what the
 * code cannot answer about a rule, the data takeover, the cutover or the
 * operations. They are decided in Design's requirements workspace (ADR-078);
 * the description lists them once, here, with where each came from.
 */
export function requirementQuestionRows(doc: ProcessDocument): string[][] {
  return doc.questions.map((q) => [
    questionNumber(q),
    q.question,
    q.owner,
    q.blocks ? BLOCKS_WORD[q.blocks] : '—',
    q.refs.join(', '),
    q.why,
    q.original.join(' / '),
  ]);
}

/* ---------------------------------------------------- Markdown and Word blocks */

export type PdBlock = DocBlock;

/** A table of the outline as a block: the plain columns, then the source column. `whole` prints every row. */
function tableBlock(t: PdTable, whole = true): PdBlock {
  const rows = whole ? t.rows : t.rows.slice(0, t.first);
  return { k: 'table', head: [...t.head, SOURCE_COLUMN], rows: rows.map((r) => [...r.cells, sourceText(r)]), muted: [t.head.length] };
}

/**
 * The document as blocks — headings, paragraphs, lists and tables in reading
 * order. Markdown and the `.docx` spell them out (`lib/requirements-export.ts`):
 * the headings become Word's heading styles, the tables real tables, and the
 * appendix starts on a page of its own.
 */
export function processDocumentBlocks(doc: ProcessDocument, meta: PdOutlineMeta = {}): PdBlock[] {
  const o = documentOutline(doc, meta);
  const b: PdBlock[] = [];
  const lead = (key: PdSectionKey) => b.push({ k: 'p', em: true, text: o.leads[key] });
  const h2 = (key: ProcessDocumentSection) => b.push({ k: 'h', level: 2, text: sectionTitle(key) });
  const add = (t: PdTable | null) => {
    if (!t) return;
    b.push(tableBlock(t, false));
    if (t.rows.length > t.first) b.push({ k: 'p', em: true, text: moreRowsLine(t) });
  };

  b.push({ k: 'h', level: 1, text: o.title });
  b.push({ k: 'table', head: ['', ''], rows: o.cover.map(([k, v]) => [k, v]), muted: [] });
  b.push({ k: 'note', text: o.note });

  b.push({ k: 'h', level: 2, text: 'At a glance' });
  for (const s of o.glance.summary) b.push({ k: 'p', text: s.text });
  b.push({ k: 'p', text: `Started by: ${o.glance.trigger.text}` });
  b.push({ k: 'table', head: o.glance.figures.map((f) => f.label), rows: [o.glance.figures.map(figureText)], muted: [] });
  if (o.glance.points.length) {
    b.push({ k: 'p', strong: true, text: 'Rules and risks to know' });
    b.push({ k: 'ul', items: o.glance.points.map((p) => `${p.ref ? `${p.ref}: ` : ''}${p.text} (${[p.detail, linesLabel(p.anchors)].filter(Boolean).join(' · ')})`) });
  }
  b.push({ k: 'p', text: `Main path: ${o.glance.path}` });
  b.push({ k: 'pagebreak' });

  h2('purpose');
  lead('purpose');
  if (doc.purpose.proposal) b.push({ k: 'p', em: true, text: `${MODEL_PROPOSAL_LABEL}: ${withLines(doc.purpose.proposal.text, doc.purpose.proposal.anchors)}` });
  b.push({ k: 'p', text: `${doc.purpose.users.text} (${sourceText({ tech: doc.purpose.users.detail ?? null, anchors: doc.purpose.users.anchors })})` });
  b.push({
    k: 'table',
    head: ['Scope', 'What', SOURCE_COLUMN],
    rows: [
      ...doc.purpose.inScope.map((s) => ['In scope', s.text, sourceText({ tech: s.detail ?? null, anchors: s.anchors })]),
      ...doc.purpose.outOfScope.map((s) => ['Outside this code', s.text, sourceText({ tech: s.detail ?? null, anchors: s.anchors })]),
    ],
    muted: [2],
  });

  h2('trigger');
  lead('trigger');
  add(o.tables.inputs);
  add(o.tables.data);

  h2('overview');
  lead('overview');
  b.push(tableBlock(o.tables.steps));

  for (const key of ['rules', 'exceptions', 'outputs', 'integrations', 'controls'] as const) {
    h2(key);
    lead(key);
    add(o.tables[key]);
  }

  h2('questions');
  lead('questions');
  if (o.questions.table) b.push(tableBlock(o.questions.table));
  if (o.questions.list?.limits) b.push({ k: 'p', em: true, text: o.questions.list.limits });
  if (o.questions.requirementsLine) b.push({ k: 'p', text: o.questions.requirementsLine });

  b.push({ k: 'pagebreak' });
  h2('appendix');
  b.push({ k: 'p', em: true, text: appendixLead(doc.appendix) });
  b.push({ k: 'h', level: 3, text: 'A.1 Step details' });
  for (const entry of doc.overview.path) {
    if (entry.kind === 'gate') {
      b.push({ k: 'p', em: true, text: gateSentence(entry) });
      continue;
    }
    b.push({ k: 'h', level: 4, text: `${entry.number}. ${stepName(entry)}` });
    b.push({ k: 'ul', items: stepDetailLines(entry) });
  }
  const long = longTables(o);
  if (long.length) {
    b.push({ k: 'h', level: 3, text: COMPLETE_TABLES });
    for (const t of long) {
      b.push({ k: 'h', level: 4, text: `${t.caption} (${t.rows.length})` });
      b.push(tableBlock(t));
    }
  }
  b.push({ k: 'h', level: 3, text: 'A.3 Wording as read from the code' });
  b.push({ k: 'table', head: ['Section', 'Item', 'As read from the code', 'Lines'], rows: wordingRows(doc), muted: [3] });
  if (doc.questions.length) {
    b.push({ k: 'h', level: 3, text: REQUIREMENT_QUESTIONS });
    b.push({ k: 'table', head: REQUIREMENT_QUESTION_HEAD, rows: requirementQuestionRows(doc), muted: [4] });
  }
  b.push({ k: 'h', level: 3, text: 'A.5 Process elements' });
  b.push({
    k: 'table',
    head: ['Element', 'Kind', 'Name', 'What it does', 'Lines'],
    rows: doc.appendix.elements.map((e) => [e.id, e.kind, e.name, e.does ?? (e.sameAs ? `As at ${e.sameAs}` : ''), e.evidence]),
    muted: [0],
  });
  b.push({ k: 'h', level: 3, text: 'A.6 Statements by routine' });
  for (const g of doc.appendix.groups) {
    b.push({ k: 'h', level: 4, text: groupTitle(g) });
    b.push({ k: 'ul', items: g.statements.map((s) => withLines(s.text, s.anchors)) });
  }
  if (doc.appendix.luw.length) {
    b.push({ k: 'h', level: 3, text: 'A.7 Saving changes' });
    b.push({ k: 'ul', items: doc.appendix.luw.map((t) => withLines(t.text, t.anchors)) });
  }
  if (doc.appendix.lanes.length) {
    b.push({ k: 'h', level: 3, text: 'A.8 Lanes the code proves' });
    b.push({ k: 'ul', items: doc.appendix.lanes.map((t) => withLines(t.text, t.anchors)) });
  }
  return b;
}
