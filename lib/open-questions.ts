/**
 * "Not determined" as open questions you can close — ADR-081 (owner decision
 * 06.10.2026: "with less, not more").
 *
 * What the engine could not settle used to be said in a side card or a fold
 * per view, each with its own grouping and its own count: a list by line in IT,
 * a fold by kind in Management, a box of kinds beside the Business answer, a
 * facet and a side card on Analyze, a task card beside Standard fit. None of
 * them said what would settle a point, who could do it, or let anyone close
 * one. This module is the one place that decides all of that, pure, so every
 * screen renders the same answer and the line that summarises it everywhere
 * else cannot disagree with the list.
 *
 * **Grouped by the action that resolves it**, never by the engine's category:
 * add the includes, name a call target, add ATC results, choose the target,
 * add usage data, confirm the rules with the business. Each group has an owner
 * (a role, derived here and never stored — views are never stored on an
 * artefact) and one button: the place in the product that performs the action,
 * or — where the product has no input for it — the answer form itself. No
 * sentence here names an input the product does not have.
 *
 * **Three end states.** *Resolved by evidence* is computed and never stored:
 * the usage export is imported, the target is chosen, every rule has an
 * answer. *Answered* is a self-declaration by the signed-in owner, shown as
 * *Confirmed* and never as *Proven*. *Accepted as known open* carries a reason.
 * Both of the latter are owner-written project data (`openQuestions`, written
 * only through `POST /api/projects/{id}/commands`, `record-open-question`) and
 * are bound to the exact set of questions they answered (`basis`): a new
 * source with other questions opens them again.
 *
 * **What it never does.** The value itself stays *Not determined*: no bucket,
 * level, score or route reads this module, and nothing in it enters a signed
 * run or the signed half of an audit pack. List output, macros and code
 * generated at runtime are not questions anyone can answer — they are the
 * limits of this reading, said in one sentence.
 */

import type { CoverageGap } from './abap/coverage';
import type { NotDetermined, NotDeterminedItem } from './workspace-model';

/* ------------------------------------------------------------- the actions */

export const OPEN_QUESTION_ACTIONS = [
  'add-includes',
  'name-call-target',
  'add-atc',
  'choose-target',
  'add-usage',
  'confirm-rules',
] as const;
export type OpenQuestionAction = (typeof OPEN_QUESTION_ACTIONS)[number];

export function isOpenQuestionAction(value: unknown): value is OpenQuestionAction {
  return typeof value === 'string' && (OPEN_QUESTION_ACTIONS as readonly string[]).includes(value);
}

/** Who acts on it — a role, derived and never stored. */
export type OpenQuestionOwner = 'IT' | 'Business' | 'Management';

/** The engine's kinds of construct, by the action that would settle them. */
const ACTION_OF_GAP: Record<CoverageGap, OpenQuestionAction | 'limit'> = {
  'include-not-read': 'add-includes',
  'dynamic-invocation': 'name-call-target',
  'dynamic-target': 'name-call-target',
  // ATC's cloud-readiness checks judge both against the target.
  'local-function-call': 'add-atc',
  'file-io': 'add-atc',
  // Not questions: no input settles them, they bound what this reading covers.
  // Code generated at runtime has no call target to name — the program it
  // writes does not exist until it runs (QA review of dd8e99691c8d).
  'classic-list-output': 'limit',
  macro: 'limit',
  'generated-code': 'limit',
};

interface ActionSpec {
  owner: OpenQuestionOwner;
  title: string;
  /** What settles it, in one sentence. */
  resolves: string;
  /** Whether an open question here keeps the program decision from standing on evidence. */
  blocksDecision: boolean;
}

export const OPEN_QUESTION_SPECS: Record<OpenQuestionAction, ActionSpec> = {
  'add-includes': {
    owner: 'IT',
    title: 'Add the includes',
    resolves:
      'Parts of the program were not in the upload, so what they do is unknown. This project cannot take further includes, so the answer is yours to give.',
    blocksDecision: true,
  },
  'name-call-target': {
    owner: 'IT',
    title: 'Name the call target',
    resolves:
      'What these statements call or which table they use is decided only while the program runs; the code alone cannot name it, so the answer is yours to give.',
    blocksDecision: false,
  },
  'add-atc': {
    owner: 'IT',
    title: 'Add ATC results',
    resolves:
      'Whether these function-module calls and file accesses still work on the target is not checked by this engine; your system’s ATC cloud-readiness check judges them.',
    blocksDecision: false,
  },
  'choose-target': {
    owner: 'Management',
    title: 'Choose the target',
    resolves: 'No target edition is declared, so what “works on the target” means is not settled.',
    blocksDecision: true,
  },
  'add-usage': {
    owner: 'IT',
    title: 'Add usage data',
    resolves: 'Whether the program still runs is unknown until a usage export is imported. Never imported is unknown, not unused.',
    blocksDecision: false,
  },
  'confirm-rules': {
    owner: 'Business',
    title: 'Confirm the rules with the business',
    resolves: 'Whether each business rule is still needed is the business’s answer, not the code’s.',
    blocksDecision: true,
  },
};

/* ---------------------------------------------------------- stored answers */

/** One owner-written answer, as the server stored it. */
export interface StoredOpenAnswer {
  state: 'answered' | 'accepted';
  /** The answer, or the reason it is accepted as open. */
  text: string;
  /** The account that wrote it — off the ID token, never from the body. */
  account: string;
  at: string;
  /** The questions it answered (`basisOf`) — a different set opens them again. */
  basis: string;
}
export type StoredOpenAnswers = Partial<Record<OpenQuestionAction, StoredOpenAnswer>>;

export const OPEN_ANSWER_MAX_CHARS = 2000;
const BASIS = /^[a-z0-9-]{1,64}$/;

/** A stored record read back, or `null` when it is not one. */
export function readStoredAnswer(value: unknown): StoredOpenAnswer | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (v.state !== 'answered' && v.state !== 'accepted') return null;
  if (typeof v.text !== 'string' || v.text.trim().length === 0 || v.text.length > OPEN_ANSWER_MAX_CHARS) return null;
  if (typeof v.account !== 'string' || typeof v.at !== 'string') return null;
  if (typeof v.basis !== 'string' || !BASIS.test(v.basis)) return null;
  return { state: v.state, text: v.text, account: v.account, at: v.at, basis: v.basis };
}

export function readStoredAnswers(value: unknown): StoredOpenAnswers {
  const out: StoredOpenAnswers = {};
  if (typeof value !== 'object' || value === null) return out;
  for (const action of OPEN_QUESTION_ACTIONS) {
    const answer = readStoredAnswer((value as Record<string, unknown>)[action]);
    if (answer) out[action] = answer;
  }
  return out;
}

/**
 * The command body, checked: what the owner says about one group. `reopen`
 * removes the stored answer.
 */
export function checkOpenAnswerBody(
  body: Record<string, unknown>,
): { ok: true; action: OpenQuestionAction; end: 'answered' | 'accepted' | 'reopen'; text: string; basis: string } | { ok: false; error: string } {
  if (!isOpenQuestionAction(body.action)) {
    return { ok: false, error: `action must be one of ${OPEN_QUESTION_ACTIONS.join(', ')}.` };
  }
  const end = body.end;
  if (end !== 'answered' && end !== 'accepted' && end !== 'reopen') {
    return { ok: false, error: 'end must be answered, accepted or reopen.' };
  }
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (end !== 'reopen' && text.length === 0) {
    return {
      ok: false,
      error: end === 'accepted' ? 'Accepting a question as known open needs a reason.' : 'An answer needs its text.',
    };
  }
  if (text.length > OPEN_ANSWER_MAX_CHARS) {
    return { ok: false, error: `The text is longer than ${OPEN_ANSWER_MAX_CHARS} characters.` };
  }
  const basis = typeof body.basis === 'string' ? body.basis : '';
  if (end !== 'reopen' && !BASIS.test(basis)) return { ok: false, error: 'basis is not one this server can read.' };
  return { ok: true, action: body.action, end, text, basis };
}

/* --------------------------------------------------------------- the model */

export interface OpenQuestionLine {
  label: string;
  why: string;
  /** `L502`, or `null` for a question about the project rather than a line. */
  anchor: string | null;
  /**
   * What SAP's catalog says about this call's function module, where it
   * answers (roadmap 3.0.6): the line is then resolved by evidence and no
   * question. SAP's verbatim state and its sentence — never a level, never a
   * statement about what the call does at runtime.
   */
  catalog?: { name: string; state: string; answer: string };
}

export type OpenQuestionEnd = 'open' | 'resolved' | 'answered' | 'accepted';

export interface OpenQuestionGroup {
  action: OpenQuestionAction;
  owner: OpenQuestionOwner;
  title: string;
  resolves: string;
  blocksDecision: boolean;
  /** How many questions it holds — lines, rules, or one for the project. */
  count: number;
  lines: OpenQuestionLine[];
  end: OpenQuestionEnd;
  /** The evidence that resolved it, in one sentence — `resolved` only. */
  evidence: string | null;
  /** The stored answer — `answered` and `accepted` only. */
  answer: StoredOpenAnswer | null;
  /** An answer written for another set of questions: shown, but the group is open again. */
  outdated: StoredOpenAnswer | null;
  basis: string;
  /** SAP's catalog is still being asked about this group's function-module calls. */
  catalogPending: boolean;
}

export interface OpenQuestions {
  /** No source staged: nothing was read, so nothing can be asked about the code. */
  noSource: boolean;
  groups: OpenQuestionGroup[];
  /** Questions in open groups. */
  open: number;
  /** Of those, the questions in groups that block the decision. */
  blocking: number;
  /** The title of the first open group, blocking ones first. */
  top: string | null;
  /** The limits of this reading in one sentence, or `null`. */
  limits: string | null;
  /**
   * SAP's catalog is still being asked about function-module calls: the counts
   * may still fall, so the one line says it is reading rather than print a
   * number that is about to change.
   */
  catalogPending: boolean;
}

/** The questions behind a group, as a short stable key — bound into a stored answer. */
export function basisOf(action: OpenQuestionAction, keys: readonly string[]): string {
  let h = 5381;
  const text = [...keys].sort().join('|');
  for (let i = 0; i < text.length; i += 1) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return `${action}-${keys.length}-${h.toString(36)}`;
}

/**
 * Constructs grouped by kind, first occurrence first, every anchor kept once —
 * the one grouper (ADR-081 merged `groupNotDetermined`, `groupOpen` and the
 * Transformation stage's own map into it). Keyed by the engine's kind where
 * there is one, by the label otherwise.
 */
export interface ConstructKind {
  key: string;
  label: string;
  /** The engine's sentence for the kind's first construct. */
  why: string;
  count: number;
  anchors: string[];
}

export function groupConstructs(items: readonly NotDeterminedItem[]): ConstructKind[] {
  const groups = new Map<string, ConstructKind>();
  for (const item of items) {
    const key = item.gap ?? item.label;
    const group = groups.get(key) ?? { key, label: item.label, why: item.why, count: 0, anchors: [] };
    group.count += 1;
    if (!group.anchors.includes(item.anchor)) group.anchors.push(item.anchor);
    groups.set(key, group);
  }
  return [...groups.values()];
}

export interface OpenQuestionsInput {
  open: NotDetermined;
  project: {
    s4Deployment?: unknown;
    usageReport?: { records?: unknown } | null;
    atcReport?: unknown;
    openQuestions?: unknown;
  } | null;
  /**
   * The rules and their answers (`rulesStatus`), or `null` while not known or
   * where there are none — the group is then left out rather than guessed.
   */
  rules: { total: number; open: readonly string[] } | null;
  /**
   * SAP's catalog answers for local function-module calls (roadmap 3.0.6),
   * looked up on the server (`/api/abcd-classify`, `functionModules`) and
   * matched to the engine's lines (`assessCoverage(code, { answerCall })`).
   * While it loads or after it failed, nothing is answered: the calls stay
   * questions, as before the lookup existed.
   */
  catalog?: CatalogAnswers | null;
}

/** One local call the catalog answered, at its line. */
export interface CatalogAnswerAt {
  name: string;
  state: string;
  answer: string;
  line: number;
}

export interface CatalogAnswers {
  status: 'loading' | 'ready' | 'failed';
  answered: readonly CatalogAnswerAt[];
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function openQuestions({ open, project, rules, catalog = null }: OpenQuestionsInput): OpenQuestions {
  const stored = readStoredAnswers(project?.openQuestions);
  const groups: OpenQuestionGroup[] = [];

  const add = (
    action: OpenQuestionAction,
    lines: OpenQuestionLine[],
    keys: readonly string[],
    resolvedBy: string | null,
    extra: { count?: number; catalogPending?: boolean } = {},
  ) => {
    const spec = OPEN_QUESTION_SPECS[action];
    const basis = basisOf(action, keys);
    const answer = stored[action] ?? null;
    const current = answer && answer.basis === basis ? answer : null;
    const end: OpenQuestionEnd = resolvedBy ? 'resolved' : current ? current.state : 'open';
    groups.push({
      action,
      owner: spec.owner,
      title: spec.title,
      resolves: spec.resolves,
      blocksDecision: spec.blocksDecision,
      count: extra.count ?? Math.max(lines.length, 1),
      lines,
      end,
      evidence: resolvedBy,
      answer: end === 'answered' || end === 'accepted' ? current : null,
      outdated: !resolvedBy && answer && !current ? answer : null,
      basis,
      catalogPending: extra.catalogPending ?? false,
    });
  };

  const limits: string[] = [];
  if (!open.noSource) {
    const byAction = new Map<OpenQuestionAction, NotDeterminedItem[]>();
    for (const item of open.items) {
      const action = item.gap ? ACTION_OF_GAP[item.gap] : 'name-call-target';
      if (action === 'limit') continue;
      byAction.set(action, [...(byAction.get(action) ?? []), item]);
    }
    for (const kind of groupConstructs(open.items.filter((i) => i.gap && ACTION_OF_GAP[i.gap] === 'limit'))) {
      limits.push(`${kind.label.toLowerCase()} (${plural(kind.count, 'place', 'places')})`);
    }
    const linesOf = (items: NotDeterminedItem[]) => items.map((i) => ({ label: i.label, why: i.why, anchor: i.anchor }));
    const keysOf = (items: NotDeterminedItem[]) => items.map((i) => `${i.anchor}:${i.gap ?? i.label}`);

    const includes = byAction.get('add-includes') ?? [];
    if (includes.length) add('add-includes', linesOf(includes), keysOf(includes), null);
    const calls = byAction.get('name-call-target') ?? [];
    if (calls.length) add('name-call-target', linesOf(calls), keysOf(calls), null);
    const atc = byAction.get('add-atc') ?? [];
    if (atc.length) {
      // A local call SAP's catalog answers is no question (roadmap 3.0.6). The
      // basis stays the engine's whole set, so an answer given while the
      // lookup was loading still holds once it has answered.
      const byLine = new Map<string, CatalogAnswerAt>();
      if (catalog?.status === 'ready') for (const a of catalog.answered) byLine.set(`L${a.line}`, a);
      const lines: OpenQuestionLine[] = atc.map((i) => {
        const hit = i.gap === 'local-function-call' ? byLine.get(i.anchor) : undefined;
        return { label: i.label, why: i.why, anchor: i.anchor, ...(hit ? { catalog: { name: hit.name, state: hit.state, answer: hit.answer } } : {}) };
      });
      const stillOpen = lines.filter((l) => !l.catalog).length;
      const byCatalog = lines.length - stillOpen;
      add(
        'add-atc',
        lines,
        keysOf(atc),
        project?.atcReport
          ? 'ATC results are imported for this project.'
          : stillOpen === 0
            ? `SAP's catalog answers ${byCatalog === 1 ? 'the function-module call' : `all ${byCatalog} function-module calls`}: its published classification of each module, not a check of what the call does at runtime.`
            : null,
        {
          count: Math.max(stillOpen, 1),
          catalogPending: catalog?.status === 'loading' && atc.some((i) => i.gap === 'local-function-call'),
        },
      );
    }
  }

  const edition = typeof project?.s4Deployment === 'string' && project.s4Deployment.trim() ? project.s4Deployment : null;
  add('choose-target', [], ['target'], edition ? `Target declared: ${edition}.` : null);

  const usage = Array.isArray(project?.usageReport?.records) ? (project!.usageReport!.records as unknown[]).length : 0;
  add('add-usage', [], ['usage'], usage > 0 ? `Usage is imported for ${plural(usage, 'object', 'objects')}.` : null);

  if (rules && rules.total > 0) {
    add(
      'confirm-rules',
      rules.open.map((id) => ({ label: id, why: 'No answer from the business yet.', anchor: null })),
      [...rules.open],
      rules.open.length === 0 ? `Every one of the ${plural(rules.total, 'rule', 'rules')} has an answer.` : null,
      // Resolved: the rules it covers, not the one placeholder of an empty list.
      { count: rules.open.length === 0 ? rules.total : rules.open.length },
    );
  }

  // Open first, blocking first among them, then the closed ones.
  const rank = (g: OpenQuestionGroup) => (g.end === 'open' ? (g.blocksDecision ? 0 : 1) : 2);
  groups.sort((a, b) => rank(a) - rank(b));

  const openGroups = groups.filter((g) => g.end === 'open');
  return {
    noSource: open.noSource,
    groups,
    open: openGroups.reduce((n, g) => n + g.count, 0),
    blocking: openGroups.filter((g) => g.blocksDecision).reduce((n, g) => n + g.count, 0),
    top: openGroups[0]?.title ?? null,
    catalogPending: groups.some((g) => g.catalogPending && g.end === 'open'),
    limits:
      limits.length > 0
        ? `This reading does not cover ${limits.join(' or ')}: limits of the engine, noted here and not questions anyone can answer.`
        : null,
  };
}

/**
 * The basis of every group the project has now, by action — what the server
 * compares a submitted answer with (`record-open-question`), so an answer is
 * stored only for the questions that are actually open. Built by
 * `openQuestions` itself, so the server and the list cannot compute two
 * different bases: the basis reads only the engine's set, the rules' open ids
 * and the two fixed project questions, never an import, a stored answer or the
 * catalog lookup.
 */
export function openQuestionBases(
  open: NotDetermined,
  rules: OpenQuestionsInput['rules'],
  project: OpenQuestionsInput['project'] = null,
): Partial<Record<OpenQuestionAction, string>> {
  const out: Partial<Record<OpenQuestionAction, string>> = {};
  // The project's evidence (a declared target, imported usage) decides which
  // groups are still open; its stored answers do not, so an answered group can
  // be answered again. A group its evidence resolved takes no answer (QA review
  // of 1b75c99cacb3, d83c3d91312b).
  const facts = project ? { ...project, openQuestions: undefined } : null;
  for (const g of openQuestions({ open, project: facts, rules }).groups) {
    if (g.end === 'resolved') continue;
    out[g.action] = g.basis;
  }
  return out;
}

/** "7 open questions · 2 block the decision · top: Choose the target" — the one line everywhere else. */
export function openQuestionsLine(q: OpenQuestions): string {
  const reading = 'Reading SAP’s catalog for the function-module calls…';
  // While SAP's catalog is being asked, only the group it may still close is
  // held back: its count is about to fall. Every other open question — the
  // target, the rules — is said as it stands (QA review of dd8e99691c8d).
  const counted = q.catalogPending ? q.groups.filter((g) => g.end === 'open' && !g.catalogPending) : null;
  const open = counted ? counted.reduce((n, g) => n + g.count, 0) : q.open;
  const blocking = counted ? counted.filter((g) => g.blocksDecision).reduce((n, g) => n + g.count, 0) : q.blocking;
  const top = counted ? (counted[0]?.title ?? null) : q.top;
  if (open === 0) {
    if (q.catalogPending) return reading;
    return q.noSource ? 'No source staged, so nothing about the code can be asked yet' : 'No open questions';
  }
  const parts = [plural(open, 'open question', 'open questions')];
  if (blocking > 0) parts.push(`${blocking} ${blocking === 1 ? 'blocks' : 'block'} the decision`);
  if (top) parts.push(`top: ${top}`);
  if (q.catalogPending) parts.push(reading);
  return parts.join(' · ');
}

/** Where the list stands on the workspace page — the line links here. */
export const OPEN_QUESTIONS_ID = 'open-questions';
