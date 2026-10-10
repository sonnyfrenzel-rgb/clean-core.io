import type { DocAnchor } from '@/lib/process-documentation';
import type { DocBlock } from '@/lib/requirements-export';
import type { OpenQuestionGroup, OpenQuestions } from '@/lib/open-questions';
import { wt } from '@/lib/workspace-messages';
import { DECISION_TABLE_HEAD, decisionRowWhen, decisionTableHitPolicy, decisionTableTaskName, type DecisionTableView } from '@/lib/decision-tables';
import {
  EMPTY_SECTION,
  MODEL_PROPOSAL_LABEL,
  PROCESS_DOCUMENT_STATUS,
  PROCESS_DOCUMENT_SUBTITLE,
  linesLabel,
  sectionTitle,
  stepRef,
  type PdActor,
  type PdProposal,
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
 *   title        "<project> — <PROGRAM>", "Process description" under it (ADR-084)
 *   cover        program, source, source version, date, status
 *   at a glance  what it does (2–3 sentences), who starts it, six key figures,
 *                the reader questions that lead to the sections ("Go to"), the
 *                3–5 rules and risks to know, what it covers and leaves out,
 *                the main path in one line
 *   sections     each a one-line lead, then a compact table whose last column
 *                ("Source") carries the program's names and lines; how a run
 *                starts opens the process section, the data it reads, the
 *                integrations and the controls are one section, and the open
 *                questions are the project's one list (ADR-081) with its end
 *                states. A row on the line of an open question points at it.
 *   appendix     step details, the code's own wording of every shortened row,
 *                the questions about the requirements, and every element and
 *                statement the engine read
 *
 * Sections are named by key (`sectionTitle`), never by number (ADR-084).
 *
 * Pure: no React, no DOM, no clock.
 */

export type PdSectionKey = Exclude<ProcessDocumentSection, 'appendix'>;

/** A key figure of the summary — each one names the section it counts. */
export interface PdFigure {
  section: PdSectionKey;
  /** A part of the section to go to instead of its top (`integrations` inside `systems`). */
  anchor?: string;
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
  /**
   * ADR-084 (roadmap 3.0.7 A5): the open question this row stands on — an open
   * group of the project's list (ADR-081) one of whose lines lies in the row's
   * lines (`openQuestionAnchors`). Only when the list was passed.
   */
  question?: { action: string; title: string };
  /** An anchor a row can be linked to — `oq-<action>` for a group of the open questions. */
  id?: string;
}

export interface PdTable {
  id: string;
  caption: string;
  head: string[];
  rows: PdRow[];
  /** Rows the stage shows before "Show all" (DESIGN.md §2.11); a file prints every row. */
  first: number;
  /** One line printed under the table — a decision table's hit policy (ADR-084). */
  note?: string;
  /**
   * Owner review 10.10.2026: an open question that stands on several rows of
   * this table ("Add ATC results" on six integrations) is said once, above the
   * rows, with how many rows it concerns — and taken off those rows. A row keeps
   * its own link only for a question that is its alone ("Name the call target").
   */
  shared?: PdSharedQuestion[];
}

/** An open question said once for several rows of one table. */
export interface PdSharedQuestion {
  action: string;
  title: string;
  /** How many rows of the table stand on it. */
  rows: number;
}

/** One reader question of the glance and the section that answers it (ADR-084, roadmap 3.0.7 A1). */
export interface PdGoTo {
  label: string;
  section: PdSectionKey;
  /** A part of the section, when the answer is not its top: `steps`. */
  anchor?: string;
}

/**
 * One chapter of the description in the stage's chapter bar (owner review
 * 10.10.2026, the look of the IT view's anchor bar, ADR-086): a short name, what
 * it counts, and the reader question it answers — the question the "Go to"
 * line used to ask, now the chip's tooltip on the stage.
 */
export interface PdChapter {
  key: ProcessDocumentSection;
  label: string;
  /** What the chapter holds, counted; "none" for nothing; null where a count says nothing (the appendix). */
  count: string | null;
  /** The reader question it answers, with what the count counts. */
  question: string;
}

export interface PdOutline {
  /** "<project> — <PROGRAM>", or the program alone when the project carries its name (ADR-084). */
  title: string;
  /** The seven chapters, in the page's order — the stage's chapter bar. */
  chapters: PdChapter[];
  /** "Process description" — the line under the title. */
  subtitle: string;
  /** Cover rows: what this document is about and how far to trust it. */
  cover: Array<[string, string]>;
  note: string;
  glance: {
    summary: PdText[];
    /** The analysis model's purpose sentences, anchored to lines — a proposal beside the engine's summary. */
    proposal: PdProposal | null;
    trigger: PdText;
    figures: PdFigure[];
    /** The reader questions, each leading to its section (ADR-084). */
    goTo: PdGoTo[];
    points: PdPoint[];
    /** What this description covers — the in-scope rows and who can complete it (was section 1). */
    covers: PdText[];
    /** What it leaves to others — the out-of-scope rows. */
    leaves: PdText[];
    path: string;
  };
  /** One line per section — what it holds, counted. */
  leads: Record<PdSectionKey, string>;
  /** One line per part of a section that has parts: the systems section's data, integrations and controls. */
  partLeads: { data: string; integrations: string; controls: string };
  tables: {
    inputs: PdTable | null;
    data: PdTable | null;
    steps: PdTable;
    rules: PdTable | null;
    exceptions: PdTable | null;
    outputs: PdTable | null;
    integrations: PdTable | null;
    controls: PdTable | null;
    /** Values the program computes (`lib/abap/data-scope.ts`). */
    derived: PdTable | null;
  };
  /** Input the code asks for and does not use — under "How a run starts". */
  inputUse: PdText[];
  /** The code proves the actor of at least one step: the step table says who acts (ADR-084). */
  whoActs: boolean;
  /** Without one proven actor: the one sentence the process section says instead of a column. */
  whoActsLine: string | null;
  /**
   * Roadmap 3.0.7 — the rules section's decision tables: each classification that only
   * sets one field as one business rule task with its table, one row per
   * branch (condition → value), every row with its line. Empty: none.
   */
  decisionTables: PdTable[];
  /**
   * The open questions section — the project's one list (ADR-081), passed in
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
  /** The project's open questions (`useOpenQuestions`), for the open questions section and the rows that stand on them. */
  openQuestions?: OpenQuestions | null;
  /**
   * The RACI as a file prints it — the owner's edit when one applies, else the
   * model's proposal (`raciFileTable`, `lib/raci-edit.ts`). Absent: no SOP and
   * RACI on record, and the file has no RACI section.
   */
  raci?: PdRaciTable | null;
}

/** The RACI as a table of a file: a heading, its provenance in one line, steps × roles. */
export interface PdRaciTable {
  title: string;
  note: string;
  head: string[];
  rows: string[][];
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

/** The source column as text: `EBAN · L61, L98`, and the open question the row stands on (ADR-084). */
export function sourceText(row: Pick<PdRow, 'tech' | 'anchors' | 'question'>): string {
  const base = [shortTech(row.tech), linesLabel(row.anchors)].filter((x): x is string => !!x).join(' · ') || '—';
  return row.question ? `${base} → ${questionLinkText(row.question)}` : base;
}

/** "Open question: Who owns this process?" — what a row says of the open question it stands on. */
export const questionLinkText = (q: NonNullable<PdRow['question']>): string => `${wt('doc.openQuestionLink')}: ${q.title}`;

/** "Open question for 6 of the 7 rows" — the lead of a question said once above a table (owner review 10.10.2026). */
export const sharedQuestionLead = (q: PdSharedQuestion, total: number): string =>
  q.rows >= total ? `${wt('doc.openQuestionLink')} for every row` : `${wt('doc.openQuestionLink')} for ${q.rows} of the ${total} rows`;

/** The shared question as one line of a file: "→ Open question for 6 of the 7 rows: Add ATC results". */
export const sharedQuestionLine = (q: PdSharedQuestion, total: number): string => `→ ${sharedQuestionLead(q, total)}: ${q.title}`;

/**
 * Lifts every open question that stands on two or more rows of a table to the
 * table (`PdTable.shared`) and takes it off those rows; a question on one row
 * only stays that row's link. Nothing else of the rows changes.
 */
export function shareRepeatedQuestions(table: PdTable | null): PdTable | null {
  if (!table) return table;
  const counts = new Map<string, { title: string; rows: number }>();
  for (const r of table.rows) {
    if (!r.question) continue;
    const c = counts.get(r.question.action) ?? { title: r.question.title, rows: 0 };
    c.rows += 1;
    counts.set(r.question.action, c);
  }
  const shared: PdSharedQuestion[] = [...counts].filter(([, c]) => c.rows > 1).map(([action, c]) => ({ action, title: c.title, rows: c.rows }));
  if (!shared.length) return table;
  const lifted = new Set(shared.map((s) => s.action));
  const rows = table.rows.map((r) => {
    if (!r.question || !lifted.has(r.question.action)) return r;
    const { question: _drop, ...rest } = r;
    void _drop;
    return rest;
  });
  return { ...table, rows, shared };
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

/* --------------------------------------------- the open questions (ADR-081) */

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
    id: `oq-${g.action}`,
  }));
  return { id: 'questions', caption: 'Open questions', head: ['Question', 'Owner', 'How many', 'State', 'What settles it'], rows, first: rows.length };
}

/** The open questions section's lead: the list's counts in one line of plain words. */
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
  // Roadmap 3.0.7: a decision that only sets one field is one business rule task with its table.
  if (gate.decisionTable) {
    const d = gate.decisionTable;
    return `${BUSINESS_RULE_TASK}: ${lcFirst(decisionTableTaskName(d))} — decision table ${d.id}, ${plural(d.rows, 'row')}`;
  }
  const arms = gate.outcomes.map((o) => `${o.when}: ${o.then}`).join('; ');
  // Roadmap 3.0.7: the arms of a user choice are alternatives, not a sequence.
  return gate.choice ? `${USER_CHOICE_LEAD}: ${arms}` : arms;
}

/** What a decision that only sets one field is called (BPMN's business rule task, DESIGN.md §5.8). */
export const BUSINESS_RULE_TASK = 'Business rule task';

const lcFirst = (s: string) => `${s.charAt(0).toLowerCase()}${s.slice(1)}`;

/** One decision table as a table of the outline: "When" → "Value", the constant and the line in the source column. */
export function decisionTableTable(d: DecisionTableView): PdTable {
  return {
    id: `decision-${d.id}`,
    caption: `${d.id} · ${BUSINESS_RULE_TASK}: ${lcFirst(decisionTableTaskName(d))}${d.where ? ` (${d.where})` : ''}`,
    head: [...DECISION_TABLE_HEAD],
    rows: d.rows.map((r) => ({ cells: [decisionRowWhen(d, r.condition), r.value], tech: r.constant, anchors: [r.anchor] })),
    first: d.rows.length,
    note: decisionTableHitPolicy(d),
  };
}

/** How a decision on what the user pressed opens — its arms are chosen from, not run in turn. */
export const USER_CHOICE_LEAD = 'The user chooses one, as often and in any order';

/** "Alternative 'DONE'" — what the step list says of a step that is one choice of the user. */
export const choiceLine = (step: PdStep): string | null => (step.choice ? `User choice ${step.choice.when}` : null);

/** A decision point as one sentence of the appendix, with its line and the condition as the code writes it. */
export function gateSentence(gate: PdGate): string {
  const where = [gate.condition ? `the code: ${gate.condition}` : null, gate.anchor ? linesLabel([gate.anchor]) : null].filter(Boolean).join(', ');
  return `Decision point “${gate.label}”${where ? ` (${where})` : ''} — ${gateLine(gate)}.`;
}

/** The step's own name — the model's business name where one is stored, marked by the renderer. */
export const stepName = (step: PdStep) => step.businessName ?? step.name;

/**
 * The main path in one line: "1 Check authority → 2 Read requisition → …". The
 * alternatives of one user choice stand in one place, side by side: "5 one of
 * Display order / Mark done / Change date" (roadmap 3.0.7).
 */
export function pathLine(path: readonly PdPathEntry[]): string {
  const parts: Array<{ slot: string; names: string[]; gateId: string | null }> = [];
  for (const s of path.filter((e): e is PdStep => e.kind === 'step')) {
    const known = s.choice ? parts.find((p) => p.gateId === s.choice?.gateId) : undefined;
    if (known) known.names.push(stepName(s));
    else parts.push({ slot: s.choice ? stepRef(s).replace(/[a-z]+(?:\.\d+)?$/, '') : stepRef(s), names: [stepName(s)], gateId: s.choice?.gateId ?? null });
  }
  return parts.map((p) => (p.gateId ? `${p.slot} one of ${p.names.join(' / ')}` : `${p.slot} ${p.names[0]}`)).join(' → ');
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

/** The reader questions of the glance (ADR-084, roadmap 3.0.7 A1) — labels from the catalogue, sections by key. */
export function goToQuestions(): PdGoTo[] {
  return [
    { label: wt('doc.goToWhat'), section: 'overview' },
    { label: wt('doc.goToWho'), section: 'overview', anchor: 'steps' },
    { label: wt('doc.goToRules'), section: 'rules' },
    { label: wt('doc.goToFails'), section: 'exceptions' },
    { label: wt('doc.goToChanges'), section: 'outputs' },
    { label: wt('doc.goToSystems'), section: 'systems' },
    { label: wt('doc.goToOpen'), section: 'questions' },
  ];
}

/** The "Go to" line as plain text, for a file that cannot link: "Go to: What does it do? → 1. How the process works · …". */
export function goToLine(goTo: readonly PdGoTo[]): string {
  return `${wt('doc.goTo')}: ${goTo.map((g) => `${g.label} → ${sectionTitle(g.section)}`).join(' · ')}`;
}

/** The title every rendering leads with (ADR-084): the process first, the document type under it. */
export function documentTitle(program: string, projectName?: string): string {
  const name = projectName?.trim();
  return name && name.toUpperCase() !== program.toUpperCase() ? `${name} — ${program}` : program;
}

const NOT_DETERMINED = 'Not determined';

/** A step's actor as a reader sees it — never blank (ADR-084). */
export const actorWord = (actor: PdActor | undefined): string => actor?.who ?? NOT_DETERMINED;

/**
 * Whether the description says who acts at all (owner decision 10.10.2026,
 * ADR-084): only when the code proves the actor of at least one step. Then the
 * step table has its "Who acts" column and an unproven step reads *Not
 * determined*; otherwise there is no column and no tag, only one sentence.
 */
export const actorsProven = (path: readonly PdPathEntry[]): boolean =>
  path.some((e) => e.kind === 'step' && !!e.actor?.who);

/**
 * The open group of the project's list (ADR-081) whose line lies in the row's
 * lines — the question this row stands on (ADR-084, roadmap 3.0.7 A5). The
 * first one in the list's order (blocking first); undefined when there is none.
 */
export function questionOf(anchors: readonly DocAnchor[], list: OpenQuestions | null): PdRow['question'] {
  if (!list || !anchors.length) return undefined;
  for (const g of list.groups) {
    if (g.end !== 'open') continue;
    const lines = openQuestionAnchors(g);
    if (lines.some((l) => anchors.some((a) => a.lineStart <= l.lineStart && l.lineStart <= a.lineEnd))) return { action: g.action, title: g.title };
  }
  return undefined;
}

export function documentOutline(doc: ProcessDocument, meta: PdOutlineMeta = {}): PdOutline {
  const steps = doc.overview.path.filter((e): e is PdStep => e.kind === 'step');
  const tables = doc.decisionTables ?? [];
  const list = meta.openQuestions ?? null;
  const brRules = doc.rules.filter((r) => /^BR-\d+$/.test(r.ref) && !/^Always/.test(r.condition)).length;
  const fixedRules = doc.rules.filter((r) => /^Always/.test(r.condition)).length;
  const decisionRows = doc.rules.length - brRules - fixedRules;

  const figures: PdFigure[] = [
    { section: 'overview', label: 'Steps', value: steps.length },
    { section: 'overview', label: 'Decision points', value: doc.overview.decisions },
    { section: 'rules', label: 'Business rules', value: doc.rules.length },
    { section: 'exceptions', label: 'Exceptions', value: doc.exceptions.length },
    { section: 'systems', anchor: 'integrations', label: 'Integrations', value: doc.integrations.length },
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
  const t = doc.trigger;

  const systemsParts = [
    t.data.length ? `it reads ${plural(t.data.length, 'table')}` : '',
    doc.integrations.length ? `calls ${plural(doc.integrations.length, 'function')} by name` : '',
    doc.controls.length ? `holds ${plural(doc.controls.length, 'control')}` : '',
  ].filter(Boolean);

  const leads: Record<PdSectionKey, string> = {
    overview: t.selection.length
      ? `${doc.overview.sentence} A run starts from a selection screen with ${plural(t.selection.length, 'input')}.`
      : doc.overview.sentence,
    rules: doc.rules.length
      ? `${plural(doc.rules.length, 'rule')}: ${plural(brRules, 'business rule')}, ${plural(decisionRows, 'decision point')}, ${plural(fixedRules, 'fixed value')}${tables.length ? `; ${plural(tables.length, 'decision table')}` : ''}.`
      : tables.length ? `${plural(tables.length, 'decision table')}.` : EMPTY_SECTION.rules,
    exceptions: doc.exceptions.length
      ? `${plural(stops, 'case stops', 'cases stop')} the run with an error; ${plural(warns, 'warns', 'warn')} and continue; ${plural(ends, 'ends', 'end')} a step or the run early.`
      : EMPTY_SECTION.exceptions,
    outputs: doc.outputs.length
      ? `${plural(doc.outputs.length, 'effect')} on data and documents, the weightiest first.`
      : EMPTY_SECTION.outputs,
    systems: systemsParts.length ? `${systemsParts.join('; ').replace(/^./, (c) => c.toUpperCase())}.` : EMPTY_SECTION.systems,
    questions: questionsLead(list),
  };

  const partLeads = {
    data: t.data.length
      ? `${plural(t.data.length, 'table')} read; which rows each read takes, as the code filters them.`
      : EMPTY_SECTION.data,
    integrations: doc.integrations.length
      ? `${plural(doc.integrations.length, 'call')} to other functions: ${[...integrationKinds].map(([k, n]) => (n === 1 ? `1 ${k}` : `${n} ${KIND_PLURAL[k]}`)).join(', ')}.`
      : EMPTY_SECTION.integrations,
    controls: doc.controls.length
      ? `${plural(doc.controls.length, 'control')} in the code: ${doc.controls.map((c) => c.kind.replace(/\b([A-Z])([a-z])/g, (_, a: string, b: string) => `${a.toLowerCase()}${b}`)).join(', ')}.`
      : EMPTY_SECTION.controls,
  };

  const row = (cells: string[], tech: string | null, anchors: DocAnchor[]): PdRow => {
    const question = questionOf(anchors, list);
    return question ? { cells, tech, anchors, question } : { cells, tech, anchors };
  };
  // A question on several rows of one table is said once, above it (owner review 10.10.2026).
  const table = (id: string, caption: string, head: string[], rows: PdRow[], first = 5): PdTable | null =>
    shareRepeatedQuestions(rows.length ? { id, caption, head, rows, first } : null);

  const whoActs = actorsProven(doc.overview.path);
  const who = (actor: PdActor | undefined): string[] => (whoActs ? [actorWord(actor)] : []);
  const stepRows: PdRow[] = doc.overview.path.map((entry) =>
    entry.kind === 'gate'
      ? { cells: ['◇', `Decision: ${entry.label}`, ...who(entry.actor), gateLine(entry)], tech: entry.condition ?? null, anchors: entry.anchor ? [entry.anchor] : [] }
      : {
          cells: [
            stepRef(entry),
            `${stepName(entry)}${entry.businessName ? ` (${MODEL_PROPOSAL_LABEL})` : ''}`,
            ...who(entry.actor),
            [choiceLine(entry), entry.line].filter(Boolean).join(' — ') || '—',
          ],
          tech: entry.technicalName,
          anchors: entry.anchors,
        },
  );

  const p = doc.purpose;
  const n = (v: number) => (v > 0 ? String(v) : wt('doc.chapterNone'));
  const chapters: PdChapter[] = [
    { key: 'overview', label: wt('doc.chapterOverview'), count: n(steps.length), question: `${wt('doc.goToWhat')} ${wt('doc.goToWho')} — ${plural(steps.length, 'step')}` },
    { key: 'rules', label: wt('doc.chapterRules'), count: n(doc.rules.length + tables.length), question: `${wt('doc.goToRules')} — ${plural(doc.rules.length, 'rule')}${tables.length ? `, ${plural(tables.length, 'decision table')}` : ''}` },
    { key: 'exceptions', label: wt('doc.chapterExceptions'), count: n(doc.exceptions.length), question: `${wt('doc.goToFails')} — ${plural(doc.exceptions.length, 'case')}` },
    { key: 'outputs', label: wt('doc.chapterOutputs'), count: n(doc.outputs.length), question: `${wt('doc.goToChanges')} — ${plural(doc.outputs.length, 'effect')}` },
    { key: 'systems', label: wt('doc.chapterSystems'), count: n(t.data.length + doc.integrations.length), question: `${wt('doc.goToSystems')} — ${plural(t.data.length, 'table')} read, ${plural(doc.integrations.length, 'call')}` },
    { key: 'questions', label: wt('doc.chapterQuestions'), count: list ? n(list.open) : null, question: list ? `${wt('doc.goToOpen')} — ${plural(list.open, 'open question')}` : wt('doc.goToOpen') },
    { key: 'appendix', label: wt('doc.chapterAppendix'), count: null, question: wt('doc.chapterAppendixQuestion') },
  ];
  return {
    title: documentTitle(doc.program, meta.projectName),
    chapters,
    subtitle: PROCESS_DOCUMENT_SUBTITLE,
    cover: [
      ['Program', doc.program],
      ['Source', `${doc.fileName} · ${doc.lineCount} lines`],
      ['Source version', `SHA-256 ${doc.sourceSha256.slice(0, 16)}…`],
      ...(meta.date ? [['Date', meta.date] as [string, string]] : []),
      ['Status', PROCESS_DOCUMENT_STATUS],
    ],
    note: doc.note,
    glance: {
      summary: doc.glance.summary,
      proposal: p.proposal,
      // Owner review 10.10.2026: the start is proven, who carries out the steps
      // is not — the summary says both, as the process section does.
      trigger: whoActs ? doc.glance.trigger : { ...doc.glance.trigger, text: `${doc.glance.trigger.text} ${wt('doc.whoCarriesOutNot')}` },
      figures,
      goTo: goToQuestions(),
      points: doc.glance.points,
      covers: [...p.inScope, p.users],
      leaves: p.outOfScope,
      path: pathLine(doc.overview.path),
    },
    leads,
    partLeads,
    tables: {
      inputs: table('inputs', 'Selection screen', ['Input', 'Required', 'Default'],
        t.selection.map((i) => row([i.meaning, i.required ? 'Yes' : 'No', i.defaultValue ?? '—'], i.name.toUpperCase(), [i.anchor]))),
      data: table('data', wt('doc.dataReads'), ['Business object', 'Owner', 'Which rows'],
        t.data.map((d) => row([d.meaning ?? (d.owner === 'Customer' ? 'Custom table' : 'SAP table'), d.owner, d.scope ?? '—'], d.name, d.anchors))),
      steps: { id: 'steps', caption: wt('doc.stepsCaption'), head: ['No.', 'Step', ...(whoActs ? [wt('doc.whoActs')] : []), 'What happens'], rows: stepRows, first: stepRows.length },
      rules: table('rules', 'Business rules and decision points', ['Rule', 'When', 'Then', 'Step'],
        sorted(doc.rules, ruleRank).map((r) => row([r.ref, r.condition, r.effect, r.where ?? 'Whole program'], null, r.anchors)), 6),
      exceptions: table('exceptions', 'Exceptions', ['What happens', 'Step', 'The user sees', 'Result'],
        sorted(doc.exceptions, exceptionRank).map((e) => row([e.what, e.where ?? '—', e.shown ? `“${e.shown}”` : '—', resultWord(e.outcome)], e.messageRef, e.anchors)), 6),
      outputs: table('outputs', 'What it changes and produces', ['Effect', 'What'],
        sorted(doc.outputs, effectRank).map((e) => row([e.kind, e.what], e.objects.join(', ') || null, e.anchors))),
      integrations: table('integrations', wt('doc.integrationsTitle'), ['Purpose', 'Kind'],
        doc.integrations.map((i) => row([i.purpose, i.kind], i.name, i.anchors)), 8),
      controls: table('controls', wt('doc.controlsTitle'), ['Control', 'What the code does'],
        doc.controls.map((c) => row([c.kind, c.text], [c.detail, c.ref].filter(Boolean).join(' · ') || null, c.anchors)), 8),
      // Owner review 10.10.2026: the value in words where the glossary knows it,
      // the variable and the expression as the code writes them in the source column.
      derived: table('derived', wt('doc.derivedValues'), ['Value', 'Computed as', 'Kind'],
        (doc.derived ?? []).map((d) => row(
          [d.label ?? d.target, d.plainExpression ?? d.expression, d.accumulates ? 'Running total' : 'Computed'],
          [`${d.target} = ${d.expression}`, d.where].filter(Boolean).join(' · '),
          d.anchors,
        ))),
    },
    inputUse: t.inputUse ?? [],
    whoActs,
    whoActsLine: whoActs ? null : wt('doc.whoActsNotProvable'),
    decisionTables: tables.map(decisionTableTable),
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
  return [t.inputs, t.data, t.rules, t.exceptions, t.outputs, t.derived, t.integrations, t.controls]
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
export function stepDetailLines(step: PdStep, whoActs = true): string[] {
  const out: string[] = [];
  out.push(`Technical: ${step.technicalName} · ${step.anchors.length ? linesLabel(step.anchors) : 'lines not determined'}${step.businessName ? ` · engine name: ${step.name}` : ''}`);
  if (step.actor && whoActs) out.push(`${wt('doc.whoActs')}: ${actorWord(step.actor)} — ${step.actor.basis}`);
  if (step.facts) out.push(step.facts);
  if (step.proposal) out.push(`${MODEL_PROPOSAL_LABEL}: ${withLines(step.proposal.text, step.proposal.anchors)}`);
  for (const d of step.does) out.push(withLines(d.text, d.anchors));
  for (const s of step.subSteps) out.push(`${s.depth > 1 ? '– ' : ''}${s.kind}: ${s.label}${s.anchor ? ` (${linesLabel([s.anchor])})` : ''}`);
  if (step.moreSubSteps > 0) out.push(`and ${step.moreSubSteps} more sub-steps — see the process elements below`);
  return out;
}

/** The head of the appendix's step summary. */
export const STEP_SUMMARY_HEAD = ['No.', 'Step', 'What it does', 'Lines', 'Details'];

/**
 * The appendix opens with one compact table (owner review 10.10.2026: "an
 * endless list, badly formatted"): one row per step — what it does, its lines,
 * how many details its fold holds. The details follow per step, folded on the
 * stage, under a heading of their own in a file.
 */
export function stepSummaryRows(doc: ProcessDocument, whoActs: boolean): string[][] {
  return doc.overview.path
    .filter((e): e is PdStep => e.kind === 'step')
    .map((s) => [stepRef(s), stepName(s), s.line || '—', linesLabel(s.anchors) || '—', String(Math.max(0, stepDetailLines(s, whoActs).length - 1))]);
}

/** What the body says shorter, beside what the code's reading said — so nothing is lost by the shortening. */
export function wordingRows(doc: ProcessDocument): string[][] {
  const rows: string[][] = [];
  for (const r of doc.rules) if (r.full) rows.push([sectionTitle('rules'), r.ref, r.full, linesLabel(r.anchors)]);
  for (const e of doc.exceptions) rows.push([sectionTitle('exceptions'), e.what, [e.message, e.outcome].filter(Boolean).join(' — '), linesLabel(e.anchors)]);
  for (const o of doc.outputs) if (o.full) rows.push([sectionTitle('outputs'), o.kind, o.full, linesLabel(o.anchors)]);
  for (const c of doc.controls) if (c.full) rows.push([sectionTitle('systems'), c.kind, c.full, linesLabel(c.anchors)]);
  for (const s of doc.trigger.start) rows.push([sectionTitle('overview'), 'Start', s.text, linesLabel(s.anchors)]);
  for (const s of doc.trigger.inputUse ?? []) if (s.detail) rows.push([sectionTitle('overview'), s.text, s.detail, linesLabel(s.anchors)]);
  // The summary prints its sentences without their names; the names stand here.
  for (const s of [...doc.glance.summary, doc.glance.trigger]) if (s.detail) rows.push(['At a glance', s.text, s.detail, linesLabel(s.anchors)]);
  for (const s of [doc.purpose.users, ...doc.purpose.inScope, ...doc.purpose.outOfScope]) {
    if (s.detail && shortTech(s.detail) !== s.detail) rows.push(['At a glance', s.text, s.detail, linesLabel(s.anchors)]);
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
  const shared = (t: PdTable) => {
    for (const q of t.shared ?? []) b.push({ k: 'p', em: true, text: sharedQuestionLine(q, t.rows.length) });
  };
  const add = (t: PdTable | null) => {
    if (!t) return;
    shared(t);
    b.push(tableBlock(t, false));
    if (t.rows.length > t.first) b.push({ k: 'p', em: true, text: moreRowsLine(t) });
  };
  const textItems = (items: readonly PdText[]) =>
    items.map((s) => `${s.text} (${sourceText({ tech: s.detail ?? null, anchors: s.anchors })})`);

  b.push({ k: 'h', level: 1, text: o.title });
  b.push({ k: 'p', em: true, text: o.subtitle });
  b.push({ k: 'table', head: ['', ''], rows: o.cover.map(([k, v]) => [k, v]), muted: [] });
  b.push({ k: 'note', text: o.note });

  b.push({ k: 'h', level: 2, text: 'At a glance' });
  for (const s of o.glance.summary) b.push({ k: 'p', text: s.text });
  if (o.glance.proposal) b.push({ k: 'p', em: true, text: `${MODEL_PROPOSAL_LABEL}: ${withLines(o.glance.proposal.text, o.glance.proposal.anchors)}` });
  b.push({ k: 'p', text: `Started by: ${o.glance.trigger.text}` });
  b.push({ k: 'table', head: o.glance.figures.map((f) => f.label), rows: [o.glance.figures.map(figureText)], muted: [] });
  b.push({ k: 'p', text: goToLine(o.glance.goTo) });
  if (o.glance.points.length) {
    b.push({ k: 'p', strong: true, text: 'Rules and risks to know' });
    b.push({ k: 'ul', items: o.glance.points.map((p) => `${p.ref ? `${p.ref}: ` : ''}${p.text} (${[p.detail, linesLabel(p.anchors)].filter(Boolean).join(' · ')})`) });
  }
  b.push({
    k: 'table',
    head: ['Scope', 'What', SOURCE_COLUMN],
    rows: [
      ...o.glance.covers.map((s) => [wt('doc.covers'), s.text, sourceText({ tech: s.detail ?? null, anchors: s.anchors })]),
      ...o.glance.leaves.map((s) => [wt('doc.leaves'), s.text, sourceText({ tech: s.detail ?? null, anchors: s.anchors })]),
    ],
    muted: [2],
  });
  b.push({ k: 'p', text: `Main path: ${o.glance.path}` });
  b.push({ k: 'pagebreak' });

  h2('overview');
  lead('overview');
  b.push({ k: 'h', level: 3, text: wt('doc.runStarts') });
  b.push({ k: 'ul', items: textItems(doc.trigger.start) });
  add(o.tables.inputs);
  if (o.inputUse.length) {
    b.push({ k: 'p', strong: true, text: wt('doc.inputUnused') });
    b.push({ k: 'ul', items: textItems(o.inputUse) });
  }
  b.push({ k: 'h', level: 3, text: o.tables.steps.caption });
  if (o.whoActsLine) b.push({ k: 'p', em: true, text: o.whoActsLine });
  b.push(tableBlock(o.tables.steps));

  for (const key of ['rules', 'exceptions', 'outputs'] as const) {
    h2(key);
    lead(key);
    add(o.tables[key]);
    if (key === 'rules') {
      for (const d of o.decisionTables) {
        b.push({ k: 'p', strong: true, text: d.caption });
        b.push(tableBlock(d));
        if (d.note) b.push({ k: 'p', em: true, text: d.note });
      }
    }
  }

  h2('systems');
  lead('systems');
  for (const part of ['data', 'integrations', 'controls'] as const) {
    const t = o.tables[part];
    b.push({ k: 'h', level: 3, text: part === 'data' ? wt('doc.dataReads') : part === 'integrations' ? wt('doc.integrationsTitle') : wt('doc.controlsTitle') });
    b.push({ k: 'p', em: true, text: o.partLeads[part] });
    add(t);
    if (part === 'data' && o.tables.derived) {
      b.push({ k: 'p', strong: true, text: o.tables.derived.caption });
      add(o.tables.derived);
    }
  }

  h2('questions');
  lead('questions');
  if (o.questions.table) b.push(tableBlock(o.questions.table));
  if (o.questions.list?.limits) b.push({ k: 'p', em: true, text: o.questions.list.limits });
  if (o.questions.requirementsLine) b.push({ k: 'p', text: o.questions.requirementsLine });

  // The owner's RACI when one is saved, else the model's proposal — said which in one line.
  if (meta.raci) {
    b.push({ k: 'h', level: 2, text: meta.raci.title });
    b.push({ k: 'p', em: true, text: meta.raci.note });
    b.push({ k: 'table', head: meta.raci.head, rows: meta.raci.rows, muted: [] });
  }

  b.push({ k: 'pagebreak' });
  h2('appendix');
  b.push({ k: 'p', em: true, text: appendixLead(doc.appendix) });
  b.push({ k: 'h', level: 3, text: 'A.1 Step details' });
  // Owner review 10.10.2026: the compact summary first, then each step's details.
  b.push({ k: 'table', head: STEP_SUMMARY_HEAD, rows: stepSummaryRows(doc, o.whoActs), muted: [3] });
  for (const entry of doc.overview.path) {
    if (entry.kind === 'gate') {
      b.push({ k: 'p', em: true, text: gateSentence(entry) });
      continue;
    }
    b.push({ k: 'h', level: 4, text: `${stepRef(entry)}. ${stepName(entry)}` });
    b.push({ k: 'ul', items: stepDetailLines(entry, o.whoActs) });
  }
  const long = longTables(o);
  if (long.length) {
    b.push({ k: 'h', level: 3, text: COMPLETE_TABLES });
    for (const t of long) {
      b.push({ k: 'h', level: 4, text: `${t.caption} (${t.rows.length})` });
      shared(t);
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
