import { readCallGraph, type CallGraphReport } from '@/lib/abap/call-graph';
import { readTableDependencies } from '@/lib/abap/table-dependencies';
import { deriveBusinessRules, type BusinessRuleSet } from '@/lib/abap/business-rule-set';
import { assessCoverage } from '@/lib/abap/coverage';
import { buildProcessSkeleton, type LaneEvidence, type ProcessSkeleton } from '@/lib/abap/process-skeleton';
import { readDataScope, type DataScopeReport } from '@/lib/abap/data-scope';
import { readInputUse, type InputIssue } from '@/lib/abap/input-use';
import { readBatchInput, writesOf, type BatchInputCall } from '@/lib/abap/batch-input';
import { tableTerm, termFor } from '@/lib/abap/business-glossary';
import { decisionTableViews } from '@/lib/decision-tables';
import { anchorNarrative } from '@/lib/abap/narrative-anchors';
import { TABLE_TERMS_EN, TRANSACTION_TERMS_EN } from '@/lib/abap/plain-glossary';
import { humaniseField, plainContext } from '@/lib/abap/plain-language';
import { callWord, plainOf, plainStepLine, readerQuestions, tablesPhrase, tableWord, thirdPerson, type RawQuestion } from '@/lib/process-document-words';
import { isCustomerObject } from '@/lib/abap/abcd-classification';
import { buildRequirementSet, type RequirementSet } from '@/lib/functional-requirements';
import { buildNfrSet, type NfrSet, NFR_OWNER_LABEL } from '@/lib/non-functional-requirements';
import { buildProcessDocumentation } from '@/lib/process-documentation-build';
import { NOT_DETERMINED_LABEL, commitWaitWords, rangeWords, stepEvidence, type DocAnchor, type ProcessDocumentation } from '@/lib/process-documentation';
import { isEventTag, type ProcessMapElement, type ProcessMapModel } from '@/lib/process-map';
import { buildNavigation } from '@/lib/process-navigation';
import { objectSites, sitesByElement, type ObjectSite } from '@/lib/process-overlays';
import { selectionInputs, summaryOf, type HandbookObject } from '@/lib/process-handbook';
import { stripModelMarkdown } from '@/lib/model-text';
import { FR_TOPICS_COVERED_BY_NFR } from '@/lib/requirements-export';
import {
  PROCESS_DOCUMENT_FORMAT,
  PROCESS_DOCUMENT_FORMAT_VERSION,
  PROCESS_DOCUMENT_NOTE,
  QUESTION_THEMES,
  isBusinessStatement,
  linesLabel,
  sentenceKey,
  type PdActor,
  type PdAppendix,
  type PdControl,
  type PdData,
  type PdDerived,
  type PdEffect,
  type PdException,
  type PdGate,
  type PdInput,
  type PdObject,
  type PdIntegration,
  type PdPathEntry,
  type PdPoint,
  type PdProposal,
  type PdQuestionTheme,
  type PdRule,
  type PdStep,
  type PdSubStep,
  type PdText,
  type PdTraceGroup,
  type ProcessDocument,
} from '@/lib/process-document';

/**
 * The builder of the process description (`lib/process-document.ts`).
 *
 * It reads nothing a model wrote except the two inputs marked as such, and
 * adds nothing the engine did not read. Every reader it calls is one the
 * product already runs on the same source elsewhere — the map model, the call
 * graph, the table reader, the rule set, the functional and non-functional
 * requirements, the coverage sweep and the skeleton — so the document says
 * what the map, the Design stage and the Business view say, in the order a
 * successor reads a process description.
 *
 * Pure and deterministic: no network, no clock, no React. The same source and
 * map give the same document.
 */

export interface ProcessDocumentInput {
  /** The source the active run signed — the whole of it. */
  source: string;
  /** `buildProcessMapModel(...)` of exactly that source, names applied where saved. */
  map: ProcessMapModel;
  /** The stored engine documentation, when it is current; built here otherwise. */
  engine?: ProcessDocumentation | null;
  /**
   * The run's narrative (`project.analysis`, the Analyze model's JSON) — a
   * model's text. Only its sentences anchored to lines of this source are used,
   * and only as a proposal beside the engine's purpose.
   */
  narrative?: string | null;
  /** The stored statement proposals (roadmap 17.10) for this source; contradicting ones are dropped. */
  proposals?: ReadonlyArray<{ text: string; anchors: ReadonlyArray<{ lineStart: number; lineEnd: number }>; contradicts?: boolean }> | null;
}

/* ------------------------------------------------------------------ helpers */

const anchor = (lineStart: number, lineEnd = lineStart): DocAnchor => ({ lineStart, lineEnd });
const copy = (a: { lineStart: number; lineEnd: number }): DocAnchor => ({ lineStart: a.lineStart, lineEnd: a.lineEnd });
const cap = (text: string) => (text ? text[0].toUpperCase() + text.slice(1) : text);
const lc = (text: string) => (text && !/^[A-Z0-9_]{2,}\b/.test(text) && !/^[A-Z][A-Z/]/.test(text) ? text[0].toLowerCase() + text.slice(1) : text);
const q = (name: string) => `“${name}”`;

function joinAnd(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function distinctAnchors(anchors: Array<DocAnchor | null | undefined>): DocAnchor[] {
  const seen = new Set<string>();
  const out: DocAnchor[] = [];
  for (const a of anchors) {
    if (!a) continue;
    const key = `${a.lineStart}-${a.lineEnd}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(copy(a));
  }
  return out.sort((x, y) => x.lineStart - y.lineStart || x.lineEnd - y.lineEnd);
}

function cleanName(name: string | null | undefined): string | null {
  if (!name) return null;
  const clean = stripModelMarkdown(name).replace(/\s+/g, ' ').trim();
  return clean || null;
}

const VERBS = new Set([
  'run', 'end', 'stop', 'reject', 'create', 'update', 'delete', 'start', 'show', 'upload', 'use', 'process', 'keep',
  'handle', 'treat', 'call', 'change', 'save', 'send', 'read', 'write', 'take', 'let', 'check', 'raise', 'register', 'store', 'undo', 'carry',
]);

function third(verb: string): string {
  if (/(s|sh|ch|x|z)$/.test(verb)) return `${verb}es`;
  if (/[^aeiou]y$/.test(verb)) return `${verb.slice(0, -1)}ies`;
  return `${verb}s`;
}

/** "run “A” and end “B”" → "Runs “A” and ends “B”" — the requirement's infinitive as a description. */
export function presentTense(phrase: string): string {
  const words = phrase.trim().split(' ');
  let atClauseStart = true;
  const out = words.map((word) => {
    const bare = word.toLowerCase();
    const result = atClauseStart && VERBS.has(bare) ? third(bare) : word;
    atClauseStart = word === 'and' || word.endsWith(';') || word === 'then';
    return result;
  });
  return cap(out.join(' '));
}

/* --------------------------------------------------------------- messages */

const MESSAGE_TYPE: Record<string, string> = {
  E: 'Error',
  A: 'Termination',
  X: 'Short dump',
  W: 'Warning',
  I: 'Information',
  S: 'Status',
};

interface CodeMessage {
  line: number;
  type: string;
  id: string | null;
  /** The message class, when the statement or the REPORT names one. */
  cls: string | null;
  text: string | null;
  words: string;
}

/** Every `MESSAGE` statement, with its type, number and the literal it shows. */
export function readMessages(source: string): CodeMessage[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const reportClass = /^\s*REPORT\b[^.]*\bMESSAGE-ID\s+([\w/]+)/im.exec(source)?.[1]?.toUpperCase() ?? null;
  const out: CodeMessage[] = [];
  lines.forEach((raw, i) => {
    const text = raw.replace(/".*$/, '');
    if (/^\s*\*/.test(raw)) return;
    const m = /\bMESSAGE\s+([eiwsax])(\d{3})(?:\(([\w/]+)\))?([^.]*)/i.exec(text);
    const literal = /\bMESSAGE\s+'((?:[^']|'')*)'\s+TYPE\s+'([eiwsax])'/i.exec(text);
    const byId = /\bMESSAGE\s+ID\s+'?([\w/]+)'?\s+TYPE\s+'([eiwsax])'\s+NUMBER\s+'?(\d{3})'?/i.exec(text);
    if (m) {
      const type = m[1].toUpperCase();
      const cls = (m[3] ?? reportClass ?? '').toUpperCase() || null;
      const withPart = m[4] ?? '';
      const literalText = /'((?:[^']|'')+)'/.exec(withPart)?.[1]?.replace(/''/g, "'").trim() ?? null;
      // `WITH 'Not found' p_banfn`: the literal, and an ellipsis for the value the run fills in.
      const more = literalText !== null && /'(?:[^']|'')+'\s+\S/.test(withPart);
      const shown = literalText ? `${literalText.replace(/[:\s]+$/, '')}${more ? ' …' : ''}` : null;
      const id = `${type}${m[2]}`;
      out.push({
        line: i + 1,
        type,
        id,
        cls,
        text: shown,
        words: `${MESSAGE_TYPE[type] ?? 'Message'} ${id}${cls ? ` of class ${cls}` : ''}${shown ? `: “${shown}”` : ' (its text is maintained in the message class, not in the code)'}`,
      });
    } else if (literal) {
      const type = literal[2].toUpperCase();
      const shown = literal[1].replace(/''/g, "'").trim();
      out.push({ line: i + 1, type, id: null, cls: null, text: shown, words: `${MESSAGE_TYPE[type] ?? 'Message'}: “${shown}”` });
    } else if (byId) {
      const type = byId[2].toUpperCase();
      const id = `${type}${byId[3]}`;
      out.push({ line: i + 1, type, id, cls: byId[1].toUpperCase(), text: null, words: `${MESSAGE_TYPE[type] ?? 'Message'} ${id} of class ${byId[1].toUpperCase()} (its text is maintained in the message class, not in the code)` });
    }
  });
  return out;
}

function outcomeOfMessage(type: string): string {
  if (type === 'E') return 'The run stops with an error message.';
  if (type === 'A' || type === 'X') return 'The run terminates.';
  if (type === 'W') return 'A warning is shown; the run continues.';
  return 'A message is shown; the run continues.';
}

/** `E001 · ZMM_PO` — the message's number and class, for the source column. */
function messageRefOf(m: CodeMessage): string | null {
  const parts = [m.id, m.cls].filter((x): x is string => !!x);
  return parts.length ? parts.join(' · ') : null;
}

/* --------------------------------------------------------------- routines */

interface Routine {
  name: string;
  lineStart: number;
  lineEnd: number;
}

function routinesOf(calls: CallGraphReport): Routine[] {
  return calls.forms
    .map((f) => ({ name: f.name.toUpperCase(), lineStart: f.lineStart, lineEnd: f.lineEnd }))
    .sort((a, b) => a.lineStart - b.lineStart);
}

function routineAt(routines: Routine[], line: number): Routine | null {
  return routines.find((r) => r.lineStart <= line && line <= r.lineEnd) ?? null;
}

/* -------------------------------------------------------------- the builder */

const isGateway = (e: ProcessMapElement) => /Gateway$/.test(e.tag);
/** `a`, `b`, … `z`, then `aa` — the letter of one alternative of a user choice. */
const armLetter = (arm: number): string =>
  arm < 26 ? String.fromCharCode(97 + arm) : `${armLetter(Math.floor(arm / 26) - 1)}${String.fromCharCode(97 + (arm % 26))}`;
const isEvent = (e: ProcessMapElement) => isEventTag(e.tag) || e.tag === 'boundaryEvent';

/** A table a step reads or changes, as the description carries it. */
const touchOf = (o: HandbookObject): PdObject => ({ name: o.name, plain: o.plain, line: o.line });

/**
 * A negated yes/no question asked the plain way round (owner review
 * 10.10.2026): "Not rejected?" with No → the run ends becomes "Rejected?" with
 * Yes → the run ends. Only for a question of the form "Not …?" whose two
 * answers are Yes and No; anything else is left as the map words it.
 */
function plainQuestion(
  label: string,
  outcomes: PdGate['outcomes'],
): { label: string; outcomes: PdGate['outcomes'] } | null {
  const m = /^Not\s+(.+\?)$/.exec(label.trim());
  if (!m || outcomes.length !== 2) return null;
  const whens = outcomes.map((o) => o.when).sort();
  if (whens[0] !== 'No' || whens[1] !== 'Yes') return null;
  const flipped = outcomes.map((o) => ({ ...o, when: o.when === 'Yes' ? 'No' : 'Yes' }));
  // Yes first, as a reader asks it.
  flipped.sort((a, b) => (a.when === 'Yes' ? 0 : 1) - (b.when === 'Yes' ? 0 : 1));
  return { label: `${m[1].charAt(0).toUpperCase()}${m[1].slice(1)}`, outcomes: flipped };
}

/** The condition a decision's line writes — `CHECK x = y.` → `x = y` — or null when it holds none. */
function conditionAt(line: string | undefined): string | null {
  if (!line) return null;
  const text = line.replace(/".*$/, '').trim();
  const m = /^(?:CHECK|IF|ELSEIF|WHILE)\s+(.+?)\s*(\.)?$/i.exec(text);
  if (m) {
    const condition = m[1].trim();
    if (!condition) return null;
    const whole = m[2] ? condition : `${condition} …`;
    return whole.length > 120 ? `${whole.slice(0, 119)}…` : whole;
  }
  const c = /^CASE\s+(.+?)\s*\.?$/i.exec(text);
  return c ? `CASE ${c[1].trim()}`.slice(0, 120) : null;
}

/** The labels a boundary event gets when the map has no better word for it. */
const GENERIC_CASE = /^(?:on error|error caught)$/i;

/**
 * What an exception's case is called (owner review 10.10.2026): a boundary the
 * map calls only "On error" is named from what the code shows there — the
 * message the user sees ("Attachment could not be read"), else the step whose
 * call fails ("Upload attachment: the call fails").
 */
function caseOf(label: string, shown: string | null, where: string | null): string {
  if (!GENERIC_CASE.test(label.trim())) return label;
  if (shown) {
    const words = shown
      .replace(/\s*(?:…|\.\.\.)\s*$/, '')
      .replace(/[:\s]+$/, '')
      .replace(/\s+(?:for|of|to|with|in|on|at|from|by)$/i, '')
      .trim();
    if (words) return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
  }
  return where ? `${where}: the call fails` : label;
}

type PlainCtx = ReturnType<typeof plainContext> | undefined;

/** A variable in words where the glossary knows it; null when it can only be read as the code writes it. */
function plainWordOf(identifier: string, ctx: PlainCtx): string | null {
  const word = humaniseField(identifier, ctx).trim();
  const bare = identifier.replace(/^.*-/, '');
  if (!word || word.toUpperCase() === identifier.toUpperCase() || word.toUpperCase() === bare.toUpperCase()) return null;
  return word;
}

/** An expression with its operands in words — "Quantity × Price ÷ Price unit"; null when no operand has a word. */
function plainExpressionOf(expression: string, ctx: PlainCtx): string | null {
  let changed = false;
  const words = expression.replace(/[A-Za-z_]\w*(?:-\w+)*/g, (token) => {
    if (/^(?:abap_true|abap_false|space)$/i.test(token)) return token;
    const word = plainWordOf(token, ctx);
    if (!word) return token;
    changed = true;
    return word;
  });
  if (!changed) return null;
  return words.replace(/\s\*\s/g, ' × ').replace(/\s\/\s/g, ' ÷ ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')');
}

export function buildProcessDocument(input: ProcessDocumentInput): ProcessDocument {
  const { source, map } = input;
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const engine = input.engine ?? buildProcessDocumentation({ source, map });
  const nav = buildNavigation(map);
  const calls = readCallGraph(source);
  const tables = readTableDependencies(source);
  const allSites = objectSites(tables, calls);
  const sites = sitesByElement(map, nav, allSites, calls);
  const skeleton: ProcessSkeleton = buildProcessSkeleton(source);
  let ruleSet: BusinessRuleSet | null = null;
  try {
    ruleSet = deriveBusinessRules(source);
  } catch {
    ruleSet = null;
  }
  let fr: RequirementSet | null = null;
  try {
    fr = buildRequirementSet({ source });
  } catch {
    fr = null;
  }
  let nfr: NfrSet | null = null;
  try {
    nfr = buildNfrSet({ source });
  } catch {
    nfr = null;
  }
  const coverage = (() => {
    try {
      return assessCoverage(source).unassessed;
    } catch {
      return [];
    }
  })();

  const byId = new Map(map.elements.map((e) => [e.id, e]));
  const routines = routinesOf(calls);
  const unreachable = new Set(calls.unreachable.map((r) => r.toUpperCase()));
  const reachedLine = (line: number) => {
    const r = routineAt(routines, line);
    return !r || !unreachable.has(r.name);
  };
  const statementById = new Map(engine.statements.map((s) => [s.id, s]));
  const sentenceAt = new Map(engine.steps.map((s) => [s.id, s.statementId]));
  const program = (/^\s*(?:REPORT|PROGRAM|FUNCTION-POOL)\s+([\w/]+)/im.exec(source)?.[1] ?? map.processName.replace(/\.\w+$/, '')).toUpperCase();
  const programLine = (() => {
    const i = lines.findIndex((l) => /^\s*(?:REPORT|PROGRAM|FUNCTION-POOL|FUNCTION|CLASS)\b/i.test(l));
    return i >= 0 ? i + 1 : 1;
  })();

  const subtree = (id: string): string[] => {
    const out: string[] = [];
    const walk = (current: string) => {
      out.push(current);
      for (const child of nav.entries.get(current)?.children ?? []) walk(child);
    };
    walk(id);
    return out;
  };
  const chapterOf = new Map<string, string>();
  for (const root of nav.roots) for (const id of subtree(root)) chapterOf.set(id, root);
  const nameOf = (e: ProcessMapElement) => e.plainName ?? e.technicalName ?? e.label;

  /* ---------------------------------------------------------- 3. overview */

  // The main path is the top level of the map. A program whose top level is
  // one routine (a report that hands everything to one FORM) would read as a
  // single step, so that routine's own steps are taken up one level instead.
  let pathIds = [...nav.roots];
  for (let pass = 0; pass < 2; pass += 1) {
    const steps = pathIds.map((id) => byId.get(id)).filter((e): e is ProcessMapElement => !!e && !isEvent(e) && !isGateway(e));
    const opener = steps.find((e) => (nav.entries.get(e.id)?.children.length ?? 0) > 0);
    if (steps.length > 2 || !opener) break;
    const at = pathIds.indexOf(opener.id);
    pathIds = [...pathIds.slice(0, at), ...(nav.entries.get(opener.id)?.children ?? []), ...pathIds.slice(at + 1)];
  }

  const usedSentences = new Set<string>();
  const proposals = (input.proposals ?? []).filter((p) => !p.contradicts && p.text.trim() && p.anchors.length > 0);
  const usedProposals = new Set<number>();

  const skeletonNode = new Map(skeleton.nodes.map((n) => [n.id, n]));
  // Roadmap 3.0.7: the classifications that only set one field, as one
  // business rule task with its table each — only those the program reaches.
  const decisionTables = decisionTableViews(ruleSet).filter((d) => reachedLine(d.anchor.lineStart));
  const tableAtNode = new Map(decisionTables.filter((d) => d.nodeId).map((d) => [d.nodeId as string, d]));
  const whenOf = (branch: ProcessMapElement['branches'][number]) =>
    branch.label || (branch.condition ? `If ${branch.condition}` : 'Otherwise');

  // Roadmap 3.0.7 (ZMM_BESTELLUEBERSICHT review): the arms of a decision on
  // what the user pressed (`detail.userAction`, a `CASE` on `sy-ucomm` or on a
  // list callback's function code) are alternatives the user chooses from, as
  // often and in whatever order they like — not steps that follow one another.
  // The review found "display order", "set to done" and "change delivery date"
  // numbered 5, 6, 7 on the main path. A step reached from exactly one arm,
  // before the arms meet again, is that arm's alternative.
  const pathSet = new Set(pathIds);
  const choiceOf = new Map<string, { gateId: string; arm: number; when: string }>();
  const choiceGates = new Set<string>();
  for (const id of pathIds) {
    const element = byId.get(id);
    if (!element || !isGateway(element)) continue;
    if (!element.nodeId || skeletonNode.get(element.nodeId)?.detail?.userAction !== true) continue;
    choiceGates.add(element.id);
    const reach = element.branches.map((branch) => {
      const seen = new Set<string>();
      const queue = [branch.to];
      while (queue.length) {
        const at = queue.shift() as string;
        if (seen.has(at) || at === element.id || !pathSet.has(at)) continue;
        seen.add(at);
        for (const next of byId.get(at)?.branches ?? []) queue.push(next.to);
      }
      return seen;
    });
    reach.forEach((ids, arm) => {
      for (const x of ids) {
        if (reach.some((other, k) => k !== arm && other.has(x))) continue;
        if (!choiceOf.has(x)) choiceOf.set(x, { gateId: element.id, arm, when: whenOf(element.branches[arm]) });
      }
    });
  }

  /* ------------------------------------------------ who acts (ADR-084) */

  // The run lane (2.16, named for its role since 3.0.7: `User` where a person
  // is at the keyboard, `System` where nobody is) and every statement that
  // proved it, plus the background and update-task evidence. A step's actor is
  // read from the evidence inside its own code — its elements, the routines
  // they run and the routines those perform — and from the run lane only where
  // the run is proven; otherwise it is not determined.
  const runLane = skeleton.lanes[0] ?? null;
  const runProven = !!runLane && (runLane.kind === 'human' || runLane.kind === 'system');
  const actorEvidence: LaneEvidence[] = skeleton.laneEvidence
    .filter((e) => (e.kind === 'human' || e.kind === 'system') && reachedLine(e.anchor.lineStart));
  const bodyOf = new Map(routines.map((r) => [r.name, r]));
  const rangesOf = (ids: readonly string[]): DocAnchor[] => {
    const out: DocAnchor[] = [];
    const queue: string[] = [];
    for (const x of ids) {
      const e = byId.get(x);
      if (!e) continue;
      if (e.anchor) out.push(copy(e.anchor));
      if (bodyOf.has(e.technicalName.toUpperCase())) queue.push(e.technicalName.toUpperCase());
    }
    const seen = new Set<string>();
    while (queue.length) {
      const name = queue.shift() as string;
      if (seen.has(name)) continue;
      seen.add(name);
      const r = bodyOf.get(name)!;
      out.push(anchor(r.lineStart, r.lineEnd));
      for (const edge of calls.edges) if (edge.from === name && bodyOf.has(edge.to)) queue.push(edge.to);
    }
    return out;
  };
  const evidenceWords = (list: readonly LaneEvidence[]) =>
    list.slice(0, 2).map((e) => `${e.token} (L${e.anchor.lineStart})`).join(', ') + (list.length > 2 ? ` and ${list.length - 2} more` : '');
  const evidenceAnchors = (list: readonly LaneEvidence[]) => distinctAnchors(list.map((e) => anchor(e.anchor.lineStart, e.anchor.lineEnd)));
  const runActor = (): PdActor => (runProven && runLane
    ? {
        who: 'System',
        basis: `No dialogue in its code; the run is a ${runLane.kind === 'human' ? 'dialogue' : 'system'} run (lane ${runLane.name}, L${runLane.anchor.lineStart}).`,
        anchors: [anchor(runLane.anchor.lineStart, runLane.anchor.lineEnd)],
      }
    : {
        who: null,
        basis: 'The code proves no dialogue, background task or job for the run, and none in this step.',
        anchors: [],
      });
  const actorOf = (ids: readonly string[], chosen: { when: string; at: DocAnchor | null } | null): PdActor => {
    if (chosen) return { who: 'User', basis: `The user chooses it: ${chosen.when}.`, anchors: chosen.at ? [chosen.at] : [] };
    const ranges = rangesOf(ids);
    const inside = actorEvidence.filter((ev) => ranges.some((r) => r.lineStart <= ev.anchor.lineStart && ev.anchor.lineStart <= r.lineEnd));
    const human = inside.filter((e) => e.kind === 'human');
    if (human.length) return { who: 'User', basis: `A dialogue in its code: ${evidenceWords(human)}.`, anchors: evidenceAnchors(human) };
    const job = inside.filter((e) => e.kind === 'system' && e.token !== 'UPDATE TASK');
    if (job.length) return { who: 'Background job', basis: `Handed to a background process: ${evidenceWords(job)}.`, anchors: evidenceAnchors(job) };
    const update = inside.filter((e) => e.kind === 'system');
    if (update.length) return { who: 'System', basis: `Saved through the update task: ${evidenceWords(update)}.`, anchors: evidenceAnchors(update) };
    return runActor();
  };

  const path: PdPathEntry[] = [];
  // `number` is the step's own, unique, in path order; `ref` is what a reader
  // sees — the same number while the path is a sequence, `5a`, `5b`, `5c` for
  // the alternatives of one user choice, which share the one place `5`.
  let number = 0;
  let place = 0;
  const slotOf = new Map<string, number>();
  const armSteps = new Map<string, number>();
  for (const id of pathIds) {
    const element = byId.get(id);
    if (!element || isEvent(element)) continue;
    // A bare list output (`WRITE`) is an output, not a business step; it is
    // listed under outputs and stays in the appendix.
    if (element.technicalName.toUpperCase() === 'WRITE') continue;
    if (isGateway(element)) {
      const choice = choiceGates.has(element.id);
      const table = element.nodeId ? tableAtNode.get(element.nodeId) : undefined;
      const outcomes = element.branches.map((branch) => {
        const target = byId.get(branch.to);
        const ends = !!target && isEventTag(target.tag) && /end/i.test(target.tag);
        return {
          when: whenOf(branch),
          then: ends ? (choice ? 'nothing else happens' : 'the run ends') : `continue with ${q(target ? nameOf(target) : branch.toLabel)}`,
          ends: ends && !choice,
        };
      });
      // Owner review 10.10.2026: "Decision: Not rejected?" is hard to read. A
      // negated yes/no question is asked the plain way round ("Rejected?") and
      // its two answers swap with it; the condition as the code writes it
      // stands beside the question (`condition`).
      const plain = choice || table ? null : plainQuestion(nameOf(element), outcomes);
      const condition = choice ? null : conditionAt(element.anchor ? lines[element.anchor.lineStart - 1] : undefined);
      const gate: PdGate = {
        kind: 'gate',
        id: element.id,
        label: plain ? plain.label : nameOf(element),
        anchor: element.anchor ? copy(element.anchor) : null,
        outcomes: plain ? plain.outcomes : outcomes,
        ...(condition ? { condition } : {}),
        ...(choice ? { choice: true as const } : {}),
        ...(table ? { decisionTable: { id: table.id, field: table.field, selector: table.selector, rows: table.rows.length } } : {}),
        actor: choice
          ? { who: 'User', basis: 'The user chooses at this point.', anchors: element.anchor ? [copy(element.anchor)] : [] }
          : runProven ? { ...runActor(), basis: 'The program decides by the condition in the code.' } : runActor(),
      };
      path.push(gate);
      continue;
    }
    number += 1;
    const alternative = choiceOf.get(id) ?? null;
    let ref: string;
    let firstOfArm = false;
    if (alternative) {
      if (!slotOf.has(alternative.gateId)) slotOf.set(alternative.gateId, ++place);
      const key = `${alternative.gateId}|${alternative.arm}`;
      const nth = (armSteps.get(key) ?? 0) + 1;
      armSteps.set(key, nth);
      firstOfArm = nth === 1;
      ref = `${slotOf.get(alternative.gateId)}${armLetter(alternative.arm)}${nth > 1 ? `.${nth}` : ''}`;
    } else {
      ref = String(++place);
    }
    const ids = subtree(id);
    const hasChildren = ids.length > 1;
    const routine = routines.find((r) => r.name === element.technicalName.toUpperCase()) ?? null;
    const anchors = distinctAnchors([element.anchor, routine ? anchor(routine.lineStart, routine.lineEnd) : null]);

    const touched = ids.flatMap((x) => sites.get(x) ?? []);
    const distinct = (keep: (s: ObjectSite) => boolean): HandbookObject[] => {
      const seen = new Map<string, HandbookObject>();
      for (const s of [...touched].sort((a, b) => a.line - b.line)) {
        if (!keep(s) || seen.has(s.name)) continue;
        seen.set(s.name, { name: s.name, plain: s.kind === 'table' ? TABLE_TERMS_EN[s.name.toLowerCase()]?.singular ?? null : null, line: s.line });
      }
      return [...seen.values()];
    };
    const early = ids.map((x) => byId.get(x)).filter((e) => !!e && (e.early || e.tag === 'boundaryEvent')).length;
    const reads = distinct((s) => s.kind === 'table' && s.use === 'read');
    const writes = distinct((s) => s.kind === 'table' && s.use === 'write');
    const called = distinct((s) => s.kind !== 'table');
    const facts = summaryOf(reads, writes, called, early);
    const line = plainStepLine(reads, writes, called, early);

    const does: PdText[] = [];
    for (const x of ids) {
      // The sentence at a routine's call site is about the calling; the step
      // reads its own body (the rule of the handbook).
      if (x === id && hasChildren) continue;
      const statementId = sentenceAt.get(x);
      const statement = statementId ? statementById.get(statementId) : undefined;
      if (!statement) continue;
      const key = sentenceKey(statement.text);
      if (usedSentences.has(key) || !isBusinessStatement(statement.text)) continue;
      usedSentences.add(key);
      does.push({ text: statement.text, anchors: statement.anchors.map(copy) });
      if (does.length >= 2) break;
    }

    let proposal: PdProposal | null = null;
    const inside = (p: { anchors: ReadonlyArray<{ lineStart: number }> }) =>
      p.anchors.some((a) => anchors.some((r) => r.lineStart <= a.lineStart && a.lineStart <= r.lineEnd));
    const at = proposals.findIndex((p, i) => !usedProposals.has(i) && inside(p));
    if (at >= 0) {
      usedProposals.add(at);
      const p = proposals[at];
      proposal = { text: p.text.trim(), anchors: p.anchors.map(copy), origin: 'statement-proposal' };
    }

    const base = nav.entries.get(id)?.depth ?? 0;
    const allSub = ids.slice(1)
      .map((x) => byId.get(x))
      .filter((e): e is ProcessMapElement => !!e && !isEvent(e))
      .map((e): PdSubStep => ({
        label: nameOf(e),
        kind: e.kind,
        anchor: e.anchor ? copy(e.anchor) : null,
        depth: Math.max(1, (nav.entries.get(e.id)?.depth ?? base + 1) - base),
      }))
      .filter((s) => s.depth <= 2);
    const shown = allSub.slice(0, 10);

    const step: PdStep = {
      kind: 'step',
      number,
      // Only where it differs from the number, so a description without a user choice stays as it was.
      ...(ref !== String(number) ? { ref } : {}),
      ...(alternative ? { choice: { gateId: alternative.gateId, when: alternative.when } } : {}),
      id,
      name: nameOf(element),
      technicalName: element.technicalName,
      businessName: cleanName(element.businessName),
      anchors,
      facts,
      line,
      does,
      proposal,
      subSteps: shown,
      moreSubSteps: Math.max(0, ids.length - 1 - shown.length - ids.slice(1).filter((x) => { const e = byId.get(x); return !e || isEvent(e); }).length),
      // The first step of an alternative is what the user chose; a later step of the arm is read from its own code.
      touches: { reads: reads.map(touchOf), writes: writes.map(touchOf) },
      actor: actorOf(ids, alternative && firstOfArm
        ? { when: alternative.when, at: (() => { const g = byId.get(alternative.gateId); return g?.anchor ? copy(g.anchor) : null; })() }
        : null),
    };
    path.push(step);
  }
  const steps = path.filter((e): e is PdStep => e.kind === 'step');
  const decisions = map.elements.filter(isGateway).length;

  /* -------------------------------------------------------- 2. trigger */

  // Roadmap 3.0.7 (ZMM review): what the selection screen fills in before
  // anybody types — `DEFAULT` on the declaration, and the presets written in
  // INITIALIZATION (`s_bedat-low = sy-datum - 365`).
  const scope: DataScopeReport = (() => {
    try {
      return readDataScope(source);
    } catch {
      return { reads: [], derived: [], defaults: [] };
    }
  })();
  const presetOf = (name: string): string | null => {
    const set = scope.defaults.filter((d) => d.from === 'initialization' && d.name.toUpperCase() === name.toUpperCase() && d.value);
    return set.length ? set.map((d) => `${d.part === 'value' ? '' : `${d.part} `}${d.value}`).join(', ') : null;
  };
  const inputs: PdInput[] = selectionInputs(source).map((field) => {
    const text = lines[field.line - 1] ?? '';
    const statementTail = lines.slice(field.line - 1, field.line + 1).join(' ');
    const own = new RegExp(`${field.name.replace(/[^\w/]/g, '')}\\b([^,.]*)`, 'i').exec(statementTail)?.[1] ?? text;
    const dflt = /\bDEFAULT\s+('(?:[^']|'')*'|[\w-]+)/i.exec(own)?.[1] ?? null;
    const declared = dflt ? dflt.replace(/^'|'$/g, '') : null;
    const preset = presetOf(field.name);
    return {
      name: field.name,
      meaning: field.plain,
      kind: field.kind === 'range' ? 'Range' : field.kind === 'switch' ? 'Checkbox' : 'Parameter',
      required: /\bOBLIGATORY\b/i.test(own),
      defaultValue: preset ? `${declared ? `${declared}; ` : ''}${preset} (set when the program starts)` : declared,
      anchor: anchor(field.line),
    };
  });

  const entryLabels = skeleton.entries
    .map((key) => skeleton.regions.find((r) => r.key === key))
    .filter((r): r is NonNullable<typeof r> => !!r && r.kind === 'entry');
  const EVENT_WORDS: Record<string, string> = {
    'INITIALIZATION': 'Before the selection screen is shown, INITIALIZATION prepares it',
    'AT SELECTION-SCREEN OUTPUT': 'While the selection screen is shown, AT SELECTION-SCREEN OUTPUT adjusts it',
    'AT SELECTION-SCREEN': 'When the user confirms the selection screen, AT SELECTION-SCREEN checks the input',
    'START-OF-SELECTION': 'The processing runs in START-OF-SELECTION',
    'END-OF-SELECTION': 'After the processing, END-OF-SELECTION runs',
    'LOAD-OF-PROGRAM': 'When the program is loaded, LOAD-OF-PROGRAM runs',
  };
  const kind = /^\s*REPORT\b/im.test(source) ? 'report' : /^\s*FUNCTION\s+[\w/]+\s*\./im.test(source) ? 'function' : /^\s*CLASS\s+[\w/]+\s+IMPLEMENTATION/im.test(source) ? 'class' : 'program';
  const start: PdText[] = [];
  if (kind === 'report') {
    start.push({
      text: inputs.length
        ? `A user starts the report ${program} and fills in its selection screen (${inputs.length} field${inputs.length === 1 ? '' : 's'}); it can also run as a background job with a variant, which the code does not show.`
        : `A user starts the report ${program}; it has no selection screen. It can also run as a background job, which the code does not show.`,
      anchors: distinctAnchors([anchor(programLine), ...inputs.slice(0, 1).map((i) => i.anchor)]),
    });
  } else if (kind === 'function') {
    start.push({ text: `Another program calls the function module ${program}; who calls it is not in this code.`, anchors: [anchor(programLine)] });
  } else if (kind === 'class') {
    start.push({ text: `Other programs call the methods of ${program}; who calls them is not in this code.`, anchors: [anchor(programLine)] });
  }
  for (const region of entryLabels) {
    if (!region.anchor) continue;
    const label = region.label.toUpperCase().replace(/\s+/g, ' ');
    const words = EVENT_WORDS[label];
    if (words) start.push({ text: `${words}.`, anchors: [copy(region.anchor)] });
  }

  const readSites = allSites.filter((s) => s.kind === 'table' && s.use === 'read' && reachedLine(s.line));
  const dataMap = new Map<string, PdData>();
  for (const s of readSites) {
    const d = dataMap.get(s.name);
    if (d) {
      if (d.anchors.length < 4 && !d.anchors.some((a) => a.lineStart === s.line)) d.anchors.push(anchor(s.line));
      continue;
    }
    dataMap.set(s.name, {
      name: s.name,
      meaning: TABLE_TERMS_EN[s.name.toLowerCase()]?.singular ?? null,
      owner: isCustomerObject(s.name) ? 'Customer' : 'SAP',
      anchors: [anchor(s.line)],
    });
  }
  // Which rows each read takes (`lib/abap/data-scope.ts`): the `WHERE` of
  // every reached read of the table, verbatim, the fixed filters first.
  const scopeOf = new Map<string, string[]>();
  for (const read of scope.reads) {
    if (!reachedLine(read.line)) continue;
    const words = cap(read.sentence.replace(/^.*? is read /, '').replace(/\.$/, ''));
    for (const t of read.tables) {
      const list = scopeOf.get(t) ?? [];
      if (!list.includes(words)) list.push(words);
      scopeOf.set(t, list);
    }
  }
  for (const d of dataMap.values()) {
    const list = scopeOf.get(d.name.toUpperCase());
    if (list?.length) d.scope = list.length > 2 ? `${list.slice(0, 2).join(' / ')} / and ${list.length - 2} more reads` : list.join(' / ');
  }
  const data = [...dataMap.values()];

  // Owner review 10.10.2026 ("What it touches in SAP"): the tables it changes,
  // read like the tables it reads — every reached write site, one row per table.
  const writeMap = new Map<string, PdData>();
  for (const s of allSites.filter((x) => x.kind === 'table' && x.use === 'write' && reachedLine(x.line))) {
    const d = writeMap.get(s.name);
    if (d) {
      if (d.anchors.length < 4 && !d.anchors.some((a) => a.lineStart === s.line)) d.anchors.push(anchor(s.line));
      continue;
    }
    writeMap.set(s.name, {
      name: s.name,
      meaning: TABLE_TERMS_EN[s.name.toLowerCase()]?.singular ?? null,
      owner: isCustomerObject(s.name) ? 'Customer' : 'SAP',
      anchors: [anchor(s.line)],
    });
  }
  const writes = [...writeMap.values()];

  // Values the program computes rather than reads — `offen = menge - wemng`,
  // and running totals (`x = x + y`) — reached code only.
  // Owner review 10.10.2026: plain labels where the glossary knows the value,
  // the variable names as the source column.
  const plainCtx = (() => {
    try {
      return plainContext(source);
    } catch {
      return undefined;
    }
  })();
  const derived: PdDerived[] = scope.derived
    .filter((d) => reachedLine(d.line))
    .map((d) => ({
      target: d.target,
      label: plainWordOf(d.target, plainCtx),
      expression: d.expression,
      plainExpression: plainExpressionOf(d.expression, plainCtx),
      accumulates: d.accumulates,
      where: d.container,
      anchors: [anchor(d.line)],
    }));

  // Input that is asked for and then not used (`lib/abap/input-use.ts`), in
  // plain words; the data object and the dialogue stand in the detail.
  const issues: InputIssue[] = (() => {
    try {
      return readInputUse(source).filter((i) => reachedLine(i.line));
    } catch {
      return [];
    }
  })();
  const inputUse: PdText[] = issues.map((i) => {
    const input = inputs.find((x) => x.name.toUpperCase() === i.name.toUpperCase());
    if (i.kind === 'selection-never-read') {
      return {
        text: input?.meaning
          ? `The input “${input.meaning}” is never read: what the user enters there changes nothing.`
          : 'A selection-screen input is never read: what the user enters there changes nothing.',
        anchors: [anchor(i.line)],
        detail: i.name.toUpperCase(),
      };
    }
    if (i.kind === 'dialog-output-ignored') {
      return {
        text: i.overwrittenAt
          ? 'The answer to a dialogue is overwritten before anything reads it: the user’s answer is not used.'
          : 'The answer to a dialogue is never read: the user’s answer is not used.',
        anchors: distinctAnchors([anchor(i.line), i.overwrittenAt ? anchor(i.overwrittenAt) : null]),
        detail: [i.module, i.parameter, i.name].filter(Boolean).join(' · '),
      };
    }
    return {
      text: 'A dialogue is handed a table of another type than it expects: it does not show or return what the program means.',
      anchors: [anchor(i.line)],
      detail: [i.module, i.parameter, i.name].filter(Boolean).join(' · '),
    };
  });

  /* -------------------------------------------------- 6. outputs, effects */

  const effectReqs = (fr?.requirements ?? []).filter((r) => r.basis.kind === 'effect');
  const effectPhrase = (statement: string) => /^The system shall (.+?)\.?$/.exec(statement)?.[1] ?? statement;
  const effectKind = (phrase: string): string => {
    if (/\bworkflow\b/i.test(phrase)) return 'Starts a workflow';
    if (/\bas a list\b/i.test(phrase)) return 'Shows a list';
    // One word boundary for all three, at their start (QA 2f5e13717db7): "files" and "uploaded" count, "profile" does not.
    if (/\b(?:upload|download|file)/i.test(phrase)) return 'Reads or writes a file';
    if (/\bthrough transaction\b/i.test(phrase)) return 'Creates a document (batch input)';
    if (/\bBAPI_|\bcreate the\b/i.test(phrase)) return 'Creates a document';
    if (/\bentry in\b|\bupdate\b|\bdelete\b|\bchange\b/i.test(phrase)) return 'Changes data';
    return 'Effect';
  };
  const outputs: PdEffect[] = effectReqs.map((r) => {
    const phrase = effectPhrase(r.statement);
    const engineWords = presentTense(phrase);
    const objects = r.objects.map((o) => o.name);
    const plain = plainOf(engineWords, objects);
    return {
      kind: effectKind(phrase),
      what: plain.text,
      objects: [...new Set([...objects, ...plain.names])],
      anchors: distinctAnchors(r.anchors),
      full: plain.text === engineWords ? null : engineWords,
    };
  });
  const listElements = map.elements.filter((e) => e.technicalName.toUpperCase() === 'WRITE' && e.anchor);
  if (listElements.length && !outputs.some((o) => o.kind === 'Shows a list')) {
    outputs.push({
      kind: 'Shows a list',
      what: 'Writes lines to a list on the screen or in the job output',
      objects: [],
      anchors: distinctAnchors(listElements.slice(0, 6).map((e) => e.anchor)),
      full: null,
    });
  }
  for (const reg of engine.effects.registrations) {
    outputs.push({
      kind: 'Update task',
      what: 'Registers a module for the update task; it runs when the changes are saved.',
      objects: reg.module ? [reg.module] : [],
      anchors: [copy(reg.anchor)],
      full: `Registers ${reg.module ?? 'a module named at run time'} for the update task; it runs when the changes are saved.`,
    });
  }

  // Roadmap 3.0.7 (ZMM review): what a batch input changes, field by field
  // (`lib/abap/batch-input.ts`) — the screen fields whose structure is a
  // database table the glossary knows (a client-safe stand-in for the SAP
  // catalogue the server's finding asks; a dialogue structure such as RM06E is
  // in neither), a key field (`EBELN`) naming the document to open, not a
  // change. Read as "what it changes": joined to the row the requirements
  // already wrote for the transaction, or a row of its own.
  const batchCalls: BatchInputCall[] = (() => {
    try {
      return readBatchInput(source).filter((c) => reachedLine(c.line));
    } catch {
      return [];
    }
  })();
  for (const call of batchCalls) {
    const tcode = call.transaction;
    const writes = writesOf(call, (name) => tableTerm(name) !== null);
    const filled = call.fields.filter((f) => !f.key);
    if (!writes.length && !filled.length) continue;
    const fieldWords = writes.flatMap((w) => w.components.map((c) => {
      const field = termFor(c).singular;
      const table = tableTerm(w.table)?.singular ?? w.table;
      return field.toUpperCase() !== c.toUpperCase() ? `the ${field} of the ${table}` : `${w.table}-${c}`;
    }));
    const raw = writes.length ? writes.flatMap((w) => w.raw) : filled.map((f) => f.raw);
    const anchors = distinctAnchors([anchor(call.line), ...writes.flatMap((w) => w.lines.map((l) => anchor(l))), ...(writes.length ? [] : filled.slice(0, 3).map((f) => anchor(f.line, f.lineEnd)))]);
    // A transaction the glossary calls "Create …" creates a document whose
    // fields the batch input fills; any other one changes what it fills.
    const creates = !!tcode && /^Create\b/.test(TRANSACTION_TERMS_EN[tcode] ?? '');
    const what = writes.length
      ? creates
        ? `${TRANSACTION_TERMS_EN[tcode as string]} through a transaction (batch input); fills ${joinAnd(fieldWords)}`
        : `Changes ${joinAnd(fieldWords)} through a transaction (batch input)`
      : `Fills ${filled.length} screen field${filled.length === 1 ? '' : 's'} of a transaction (batch input); which table changes is not determined from the code`;
    const full = `The batch input to ${tcode ?? 'a transaction named at run time'} (line ${call.line}) fills ${raw.join(', ')}${writes.length ? `; the transaction writes to ${writes.map((w) => w.table).join(', ')}` : ''}.`;
    // The row the requirements wrote for the same transaction says only that it runs; this one says what it does.
    const existing = tcode ? outputs.find((o) => o.objects.includes(tcode)) : undefined;
    const kind = creates ? 'Creates a document (batch input)' : writes.length ? 'Changes data (batch input)' : existing?.kind ?? 'Changes data (batch input)';
    if (existing) {
      // Without a field the glossary names a table for, the requirement's words stand; the fields join its source.
      existing.full = [existing.full ?? existing.what, full].join(' ');
      if (writes.length) {
        existing.kind = kind;
        existing.what = what;
      }
      existing.objects = [...new Set([...existing.objects, ...raw])];
      existing.anchors = distinctAnchors([...existing.anchors, ...anchors]);
    } else {
      outputs.push({ kind, what, objects: [...(tcode ? [tcode] : []), ...raw], anchors, full });
    }
  }

  /* -------------------------------------------------- 7. integrations */

  const effectFor = (name: string) => effectReqs.find((r) => r.statement.includes(name));
  const elementFor = (line: number, caller: string | null): ProcessMapElement | null => {
    const covering = map.elements
      .filter((e) => e.anchor && !isEvent(e) && e.anchor.lineStart <= line && line <= e.anchor.lineEnd)
      .sort((a, b) => (a.anchor!.lineEnd - a.anchor!.lineStart) - (b.anchor!.lineEnd - b.anchor!.lineStart));
    if (covering[0]) return covering[0];
    return caller ? map.elements.find((e) => e.technicalName.toUpperCase() === caller.toUpperCase() && !isEvent(e)) ?? null : null;
  };
  const integrationMap = new Map<string, PdIntegration>();
  const addIntegration = (name: string, kindWord: string, line: number, lineEnd: number, caller: string | null) => {
    if (!reachedLine(line)) return;
    const existing = integrationMap.get(`${kindWord}|${name}`);
    if (existing) {
      existing.anchors = distinctAnchors([...existing.anchors, anchor(line, lineEnd)]);
      return;
    }
    const effect = effectFor(name);
    const element = elementFor(line, caller);
    const known = callWord(name);
    const purpose = effect
      ? plainOf(presentTense(effectPhrase(effect.statement)), effect.objects.map((o) => o.name)).text
      : known && element
        ? `${cap(thirdPerson(known))} in the step ${q(nameOf(element))}.`
        : element
        ? `Used in the step ${q(nameOf(element))}.`
        : caller
          ? `Called in routine ${caller}.`
          : 'Called in the main program.';
    integrationMap.set(`${kindWord}|${name}`, { name, kind: kindWord, purpose, anchors: [anchor(line, lineEnd)] });
  };
  for (const fm of calls.functionModules) {
    if (fm.dynamic || !fm.name) {
      addIntegration('(name computed at run time)', 'Dynamic function call', fm.lineStart, fm.lineEnd, fm.caller);
      continue;
    }
    const name = fm.name.toUpperCase();
    const kindWord = fm.destination
      ? `Remote call (RFC) to ${fm.destination}`
      : fm.inUpdateTask
        ? 'Function module in the update task'
        : fm.bapi || /^BAPI_/.test(name)
          ? 'BAPI'
          : name === 'SAP_WAPI_CREATE_EVENT' || /^SWE_EVENT_CREATE/.test(name)
            ? 'Workflow event'
            : /^GUI_(UP|DOWN)LOAD$/.test(name)
              ? 'File on the user’s PC'
              : 'Function module';
    addIntegration(name, kindWord, fm.lineStart, fm.lineEnd, fm.caller);
  }
  for (const tx of calls.transactions) {
    addIntegration(tx.code ? tx.code.toUpperCase() : '(transaction named at run time)', tx.batchInput ? 'Transaction by batch input' : 'Transaction', tx.lineStart, tx.lineEnd, tx.caller);
  }
  for (const sub of calls.submits) {
    addIntegration(sub.program ? sub.program.toUpperCase() : '(program named at run time)', sub.viaJob ? 'Program started as a job (SUBMIT)' : 'Program (SUBMIT)', sub.lineStart, sub.lineEnd, sub.caller);
  }
  lines.forEach((raw, i) => {
    const m = /^\s*OPEN\s+DATASET\s+([\w-]+)\s+FOR\s+(INPUT|OUTPUT|APPENDING)/i.exec(raw);
    if (m) addIntegration(m[1], `File on the application server (${m[2].toLowerCase()})`, i + 1, i + 1, routineAt(routines, i + 1)?.name ?? null);
  });
  const integrations = [...integrationMap.values()].sort((a, b) => a.anchors[0].lineStart - b.anchors[0].lineStart);

  /* -------------------------------------------------- 4. rules */

  const stepLabel = (stepId: string | null) => (stepId && fr ? fr.steps.find((s) => s.id === stepId)?.label ?? null : null);
  const rules: PdRule[] = [];
  const ruleIdsShown = new Set<string>();
  for (const r of fr?.requirements ?? []) {
    if (!['rule', 'decision', 'fixed-values'].includes(r.basis.kind)) continue;
    const s = r.statement;
    let condition = '';
    let effect = '';
    let full: string | null = null;
    let m: RegExpExecArray | null;
    if ((m = /^The system shall handle the case where (.+?) separately in (.+?)\.$/.exec(s))) {
      condition = cap(m[1]);
      effect = `Handled separately in ${m[2]}`;
    } else if ((m = /^The system shall process only (.+?)\.$/.exec(s))) {
      condition = 'Always (fixed in the code)';
      effect = `Processes only ${m[1]}`;
      full = `${s} No decision point tests the constant directly.`;
    } else if ((m = /^The system shall keep the fixed value (.+?) for (.+?)\.$/.exec(s))) {
      condition = 'Always (fixed in the code)';
      effect = `Keeps the fixed value ${m[1]} for ${m[2]}`;
    } else if ((m = /^The system shall use these fixed values in (.+?): (.+?)\.$/.exec(s))) {
      condition = 'Always (fixed in the code)';
      effect = `Uses ${m[2]} in ${m[1]}`;
    } else if ((m = /^The system shall (.+?) when (.+?)(?:; otherwise it shall (.+?))?\.$/.exec(s))) {
      condition = cap(m[2]);
      effect = presentTense(m[1]) + (m[3] ? `; otherwise ${lc(presentTense(m[3]))}` : '');
    } else if ((m = /^The system shall (.+?) unless (.+?)\.$/.exec(s))) {
      condition = `Not ${m[2]}`;
      effect = presentTense(m[1]);
    } else {
      condition = r.rationale;
      effect = s;
    }
    const ref = r.basis.kind === 'rule' && r.basis.ref ? r.basis.ref : r.basis.kind === 'fixed-values' ? 'Fixed values' : 'Decision point';
    if (r.basis.kind === 'rule' && r.basis.ref) ruleIdsShown.add(r.basis.ref);
    rules.push({ ref, where: stepLabel(r.stepId), condition, effect, anchors: distinctAnchors(r.anchors), full: full ?? s });
  }
  // A rule the requirements did not word (none today) still gets its row, in the rule set's words.
  for (const rule of ruleSet?.rules ?? []) {
    if (ruleIdsShown.has(rule.id) || rule.withoutProcessElement?.reason === 'unreached') continue;
    const first = rule.sentences[0]?.anchors[0];
    if (!first || !reachedLine(first.lineStart)) continue;
    rules.push({ ref: rule.id, where: rule.sources[0]?.routine ?? null, condition: rule.label, effect: rule.text, anchors: [copy(first)], full: null });
  }

  /* -------------------------------------------------- 5. exceptions */

  const messages = readMessages(source).filter((m) => reachedLine(m.line));
  const usedMessageLines = new Set<number>();
  const exceptions: PdException[] = [];
  for (const e of map.elements) {
    if (!(e.early || e.tag === 'boundaryEvent')) continue;
    const a = e.anchor;
    const chapter = byId.get(chapterOf.get(e.id) ?? '');
    const where = chapter && chapter.id !== e.id ? nameOf(chapter) : e.plane ? nameOf(byId.get(e.plane) ?? e) : null;
    const near = a ? messages.find((m) => m.line >= a.lineStart - 1 && m.line <= a.lineEnd + 2) : undefined;
    if (near) usedMessageLines.add(near.line);
    const outcome = near
      ? outcomeOfMessage(near.type)
      : e.tag === 'boundaryEvent'
        ? /error/i.test(e.label) ? 'The call fails and the step takes its error path.' : 'The step leaves its normal path here.'
        : where
          ? `${q(where)} ends here.`
          : 'The run ends here.';
    exceptions.push({
      what: caseOf(e.label, near?.text ?? null, where),
      where,
      message: near?.words ?? null,
      shown: near?.text ?? null,
      messageRef: near ? messageRefOf(near) : null,
      outcome,
      anchors: distinctAnchors([a, near ? anchor(near.line) : null]),
    });
  }
  for (const entry of path) {
    if (entry.kind !== 'gate') continue;
    for (const o of entry.outcomes) {
      if (!o.ends) continue;
      exceptions.push({
        what: `${entry.label} — ${o.when}`,
        where: 'Main path',
        message: null,
        shown: null,
        messageRef: null,
        outcome: 'The run ends; the later steps do not run.',
        anchors: entry.anchor ? [entry.anchor] : [],
      });
    }
  }
  for (const m of messages) {
    if (usedMessageLines.has(m.line) || !['E', 'A', 'X', 'W'].includes(m.type)) continue;
    const r = routineAt(routines, m.line);
    const element = r ? map.elements.find((e) => e.technicalName.toUpperCase() === r.name && !isEvent(e)) : null;
    exceptions.push({
      what: m.text ? cap(m.text.replace(/[:\s]+$/, '')) : `${MESSAGE_TYPE[m.type] ?? 'Message'} ${m.id ?? ''}`.trim(),
      where: element ? nameOf(element) : r?.name ?? null,
      message: m.words,
      shown: m.text,
      messageRef: messageRefOf(m),
      outcome: outcomeOfMessage(m.type),
      anchors: [anchor(m.line)],
    });
  }
  exceptions.sort((x, y) => (x.anchors[0]?.lineStart ?? 0) - (y.anchors[0]?.lineStart ?? 0));

  /* -------------------------------------------------- 8. controls */

  const CONTROL_SIGNALS: Record<string, string> = {
    'authority-check': 'Authorization check',
    'change-document': 'Change documents',
    'record-table': 'Record of each case',
    'application-log': 'Application log',
    'bapi-return': 'Result check of a BAPI',
    'unit-of-work': 'Save or undo together',
    retry: 'Retry',
    'update-task': 'Update task',
  };
  // One plain line per kind of control; the engine's sentence, with the
  // program's names and lines, is kept for the appendix.
  const CONTROL_WORDS: Record<string, string> = {
    'authority-check': 'Checks the user’s authorization before it goes on.',
    'change-document': 'Writes change documents for its changes.',
    'record-table': 'Keeps a record of each case in a custom table.',
    'application-log': 'Writes an application log.',
    'bapi-return': 'Checks the result of the SAP call for errors.',
    'unit-of-work': 'Saves related changes together, or undoes them together.',
    retry: 'Tries a failed call again.',
    'update-task': 'Saves its changes through the update task.',
  };
  const namesIn = (text: string) => [...new Set(text.match(/\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/g) ?? [])];
  const controls: PdControl[] = [];
  for (const r of nfr?.requirements ?? []) {
    const word = CONTROL_SIGNALS[r.signal];
    if (!word) continue;
    const full = cap(r.rationale.replace(/^Because\s+/i, '').replace(/^the program\b/i, 'The program'));
    const names = namesIn(full);
    controls.push({ kind: word, text: CONTROL_WORDS[r.signal] ?? full, ref: r.id, anchors: distinctAnchors(r.anchors), detail: names.length ? names.join(', ') : null, full });
  }
  // Every save, and every undo, as one row: where they are is in the lines.
  const reachedEvents = engine.effects.events.filter((event) => reachedLine(event.anchor.lineStart));
  const saveWords = (event: (typeof reachedEvents)[number]) => (event.kind === 'commit'
    ? `${event.token} saves every change made so far${event.andWait === null ? '; whether it waits for the update is decided at run time' : event.andWait ? ' and waits for the update' : ' without waiting for the update'}.`
    : `${event.token} undoes the changes not yet saved.`);
  for (const kindOf of ['commit', 'rollback'] as const) {
    const events = reachedEvents.filter((event) => (kindOf === 'commit' ? event.kind === 'commit' : event.kind !== 'commit'));
    if (!events.length) continue;
    const n = events.length;
    controls.push({
      kind: kindOf === 'commit' ? 'Saving changes' : 'Undoing changes',
      text: kindOf === 'commit'
        ? n === 1 ? 'Saves its changes in one place.' : `Saves its changes in ${n} separate places in one run.`
        : n === 1 ? 'Undoes unsaved changes in one place.' : `Undoes unsaved changes in ${n} places.`,
      ref: null,
      anchors: distinctAnchors(events.map((event) => event.anchor)),
      detail: [...new Set(events.map((event) => event.token))].join(', '),
      full: events.map(saveWords).join(' '),
    });
  }
  controls.sort((x, y) => (x.anchors[0]?.lineStart ?? 0) - (y.anchors[0]?.lineStart ?? 0));

  /* -------------------------------------------------- 9. questions */

  const raw: RawQuestion[] = [];
  const asked = new Set<string>();
  const ask = (qn: RawQuestion) => {
    const key = sentenceKey(qn.question);
    if (asked.has(key)) return;
    asked.add(key);
    raw.push(qn);
  };
  const nfrQuestions = nfr?.questions ?? [];
  const nfrHas = (category: string) => nfrQuestions.some((x) => x.category === category);
  const frOpen = (fr?.open ?? []).filter((o) => !FR_TOPICS_COVERED_BY_NFR.has(o.topic));
  const gapQuestion: Record<string, { question: string; skip?: boolean }> = {
    'Process owner': { question: 'Who owns this process and decides on changes to it?' },
    'Roles': { question: 'Which business roles carry out this process?', skip: nfrHas('authorization') || (fr?.open ?? []).some((o) => o.topic === 'authorization') },
    'KPIs': { question: 'Which key figures measure this process, and what are their targets?' },
    'Duration': { question: 'How long may one run take?', skip: nfrHas('performance') },
    'Strategic goal': { question: 'Why does the business need this process, and is it still needed in this form?' },
  };
  let gapNo = 0;
  for (const gap of engine.notDetermined) {
    const entry = gapQuestion[gap.subject];
    if (entry?.skip) continue;
    gapNo += 1;
    ask({ id: `Q-${String(gapNo).padStart(2, '0')}`, owner: 'Business', question: entry?.question ?? `${gap.subject}: ${NOT_DETERMINED_LABEL}.`, why: gap.reason, anchors: [], origin: { kind: 'gap', subject: gap.subject } });
  }
  for (const o of frOpen) ask({ id: o.id, owner: 'Business', question: o.question, why: o.why, anchors: distinctAnchors(o.anchors), origin: { kind: 'fr', topic: o.topic } });
  for (const x of nfrQuestions) ask({ id: x.id, owner: NFR_OWNER_LABEL[x.owner] as RawQuestion['owner'], question: x.question, why: x.evidence, anchors: distinctAnchors(x.anchors), origin: { kind: 'nfr', category: x.category } });
  const askedDynamic = (fr?.open ?? []).some((o) => o.topic === 'dynamic-call');
  let covNo = 0;
  for (const gap of coverage) {
    const include = /Include ([\w/]+) was not uploaded/i.exec(gap.why);
    const dynamic = /^Dynamic call/i.test(gap.label);
    if (!include && !(dynamic && !askedDynamic)) continue;
    covNo += 1;
    ask({
      id: `C-${String(covNo).padStart(2, '0')}`,
      owner: 'IT operations',
      question: include
        ? `What does the include ${include[1].toUpperCase()} do? Its source was not uploaded with the program.`
        : `What does the dynamic call at ${rangeWords(anchor(gap.line))} reach?`,
      why: gap.why,
      anchors: [anchor(gap.line)],
      origin: { kind: 'coverage', what: include ? 'include' : 'dynamic' },
    });
  }
  // Worded for the reader, near-duplicates asked once, grouped and numbered
  // (owner 04.10.2026: "far too complex, long, not visualised and boring").
  const questions = readerQuestions(raw, QUESTION_THEMES.map((t) => t.key as PdQuestionTheme));

  /* -------------------------------------------------- 1. purpose and scope */

  // The effects that matter most to a business reader, each once: two ways to
  // create the same purchase order are one effect in a purpose sentence.
  const ranked = [...effectReqs].sort((a, b) => effectRank(effectPhrase(a.statement)) - effectRank(effectPhrase(b.statement)));
  const rankedEffects: typeof ranked = [];
  const effectHeads = new Set<string>();
  for (const r of ranked) {
    const head = effectPhrase(r.statement).split(/\s+(?:\(|through\s)/)[0].toLowerCase();
    if (effectHeads.has(head)) continue;
    effectHeads.add(head);
    rankedEffects.push(r);
  }
  const kindWord = kind === 'report' ? 'report' : kind === 'function' ? 'function module' : kind === 'class' ? 'class' : 'program';

  // At a glance: what it does, in two short sentences of business words.
  const glanceSummary: PdText[] = [];
  const plainEffects = rankedEffects.slice(0, 3).map((r) => {
    const objects = r.objects.map((o) => o.name);
    const plain = plainOf(presentTense(effectPhrase(r.statement)), objects);
    return { text: lc(plain.text), names: plain.names, anchor: r.anchors[0] };
  });
  if (plainEffects.length) {
    glanceSummary.push({
      text: `${program} ${joinAnd(plainEffects.map((e) => e.text))}.`,
      anchors: distinctAnchors(plainEffects.map((e) => e.anchor)),
      detail: [...new Set(plainEffects.flatMap((e) => e.names))].join(', ') || null,
    });
  } else {
    glanceSummary.push({
      text: `${program} is a custom ABAP ${kindWord} that changes no data.`,
      anchors: [anchor(programLine)],
    });
  }
  if (data.length) {
    glanceSummary.push({
      text: `It reads ${tablesPhrase(data.map((d) => d.name))}.`,
      anchors: distinctAnchors(data.slice(0, 3).map((d) => d.anchors[0])),
      detail: data.map((d) => d.name).join(', '),
    });
  }
  const glanceTrigger: PdText = {
    text: kind === 'report'
      ? inputs.length
        ? `A user, from a selection screen with ${inputs.length} input${inputs.length === 1 ? '' : 's'}; it may also run as a background job.`
        : 'A user, without a selection screen; it may also run as a background job.'
      : kind === 'function'
        ? 'Another program calls it; the caller is not in this code.'
        : kind === 'class'
          ? 'Other programs call its methods; the callers are not in this code.'
          : 'The code does not show what starts it.',
    anchors: start[0]?.anchors ?? [anchor(programLine)],
    detail: inputs.length ? inputs.map((i) => i.name.toUpperCase()).join(', ') : null,
  };

  const authority = calls.authorityChecks.filter((c) => reachedLine(c.lineStart) && c.object);
  const users: PdText = authority.length
    ? {
        text: 'An authorization check limits who can complete it.',
        anchors: distinctAnchors(authority.map((c) => anchor(c.lineStart, c.lineEnd))),
        detail: [...new Set(authority.map((c) => c.object!.toUpperCase()))].join(', '),
      }
    : {
        text: 'The code checks no authorization of its own.',
        anchors: [anchor(programLine)],
      };

  const inScope: PdText[] = [
    {
      text: `The process in ${engine.fileName}: ${steps.length} step${steps.length === 1 ? '' : 's'}, ${decisions} decision point${decisions === 1 ? '' : 's'}, ${rules.length} rule${rules.length === 1 ? '' : 's'}.`,
      anchors: [anchor(1, Math.max(1, engine.lineCount))],
    },
  ];
  const outOfScope: PdText[] = [];
  const readOnlyCustom = data.filter((d) => d.owner === 'Customer' && !allSites.some((s) => s.name === d.name && s.use === 'write'));
  outOfScope.push(readOnlyCustom.length
    ? {
        text: `Settings and master data in ${readOnlyCustom.length === 1 ? 'a custom table' : `${readOnlyCustom.length} custom tables`} it only reads.`,
        anchors: distinctAnchors(readOnlyCustom.slice(0, 4).map((d) => d.anchors[0])),
        detail: readOnlyCustom.map((d) => d.name).join(', '),
      }
    : { text: 'Customizing and master data in the tables it reads.', anchors: [] });
  outOfScope.push({ text: 'Jobs, variants and schedules that start it, and manual steps around a run.', anchors: [] });
  const sapCalls = integrations.filter((i) => !/^\(/.test(i.name) && !isCustomerObject(i.name));
  if (sapCalls.length) {
    outOfScope.push({
      text: sapCalls.length === 1 ? 'What the SAP function it calls does inside SAP.' : `What the ${sapCalls.length} SAP functions and transactions it calls do inside SAP.`,
      anchors: distinctAnchors(sapCalls.slice(0, 4).map((i) => i.anchors[0])),
      detail: sapCalls.map((i) => i.name).join(', '),
    });
  }
  const unreached = skeleton.notDrawn.unreached;
  if (unreached.length) {
    outOfScope.push({
      text: `${unreached.length === 1 ? 'One routine' : `${unreached.length} routines`} no entry point reaches; the appendix lists ${unreached.length === 1 ? 'it' : 'them'}.`,
      anchors: distinctAnchors(unreached.slice(0, 3).map((u) => anchor(u.lineStart, u.lineEnd))),
      detail: unreached.map((u) => u.name.toUpperCase()).join(', '),
    });
  }
  const includes = coverage.filter((g) => /Include ([\w/]+) was not uploaded/i.test(g.why));
  if (includes.length) {
    outOfScope.push({
      text: `${includes.length === 1 ? 'One include' : `${includes.length} includes`} whose source was not uploaded.`,
      anchors: includes.map((g) => anchor(g.line)),
      detail: includes.map((g) => /Include ([\w/]+)/i.exec(g.why)![1].toUpperCase()).join(', '),
    });
  }

  // The 3–5 points a reader must know: the weightiest rules (a threshold
  // first), then what the code shows as a risk — SAP data changed directly,
  // values fixed in the code, changes saved in several places.
  const ruleRank = (r: PdRule) => (/\b(?:above|below|at most|at least|more than|less than|over|under)\b/i.test(r.condition) ? 0 : 1);
  const weighty = rules
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => /^BR-\d+$/.test(r.ref) && !/^Always/.test(r.condition))
    .sort((x, y) => ruleRank(x.r) - ruleRank(y.r) || x.i - y.i)
    .slice(0, 3)
    .map(({ r }): PdPoint => ({ kind: 'rule', ref: r.ref, text: `${r.condition} → ${lc(r.effect)}.`, detail: null, anchors: r.anchors.slice(0, 2) }));
  const risks: PdPoint[] = [];
  const sapWrites = allSites.filter((s) => s.kind === 'table' && s.use === 'write' && !isCustomerObject(s.name) && reachedLine(s.line));
  if (sapWrites.length) {
    const names = [...new Set(sapWrites.map((s) => s.name))];
    risks.push({
      kind: 'risk',
      ref: null,
      text: `Changes SAP data directly: ${[...new Set(names.map((n) => tableWord(n) ?? 'an SAP table'))].join(', ')}.`,
      detail: names.join(', '),
      anchors: distinctAnchors(sapWrites.slice(0, 3).map((s) => anchor(s.line))),
    });
  }
  const fixedRules = rules.filter((r) => /^Always/.test(r.condition));
  if (fixedRules.length) {
    risks.push({
      kind: 'risk',
      ref: null,
      text: `${fixedRules.length === 1 ? 'One value is' : `${fixedRules.length} values are`} fixed in the code, not in customizing.`,
      detail: [...new Set(fixedRules.map((r) => r.ref))].join(', '),
      anchors: distinctAnchors(fixedRules.slice(0, 3).flatMap((r) => r.anchors.slice(0, 1))),
    });
  }
  const commits = engine.effects.events.filter((e) => e.kind === 'commit' && reachedLine(e.anchor.lineStart));
  if (commits.length > 1) {
    risks.push({
      kind: 'risk',
      ref: null,
      text: `Saves its changes in ${commits.length} separate places; a failure in between leaves part of them saved.`,
      detail: [...new Set(commits.map((e) => e.token))].join(', '),
      anchors: distinctAnchors(commits.map((e) => e.anchor)),
    });
  }
  const points: PdPoint[] = [...weighty, ...risks].slice(0, 5);

  let purposeProposal: PdProposal | null = null;
  if (input.narrative) {
    let text = '';
    try {
      const parsed = JSON.parse(input.narrative) as { asIsContext?: unknown; summary?: unknown };
      text = typeof parsed.asIsContext === 'string' && parsed.asIsContext.trim()
        ? parsed.asIsContext
        : typeof parsed.summary === 'string' ? parsed.summary : '';
    } catch {
      text = '';
    }
    if (text) {
      // Only sentences the model anchored to lines of this source; a finding
      // citation cannot be checked here and drops the sentence.
      const anchored = anchorNarrative(stripModelMarkdown(text), [], lines.length).sentences
        .filter((s) => s.status === 'anchored' && s.anchors.every((a) => a.kind === 'lines'))
        .slice(0, 3);
      if (anchored.length) {
        purposeProposal = {
          text: anchored.map((s) => s.text.trim()).join(' '),
          anchors: distinctAnchors(anchored.flatMap((s) => s.anchors.map((a) => anchor(a.lineStart, a.lineEnd)))),
          origin: 'narrative',
        };
      }
    }
  }

  /* -------------------------------------------------- appendix */

  const appendix = technicalTrace(engine, {
    routines,
    unreachable,
    labelOf: (routine) => {
      const e = map.elements.find((x) => x.technicalName.toUpperCase() === routine && !isEvent(x));
      return e ? nameOf(e) : null;
    },
    entries: entryLabels.filter((r) => r.anchor).map((r) => ({ label: r.label.toUpperCase(), line: r.anchor!.lineStart })),
  });

  const endingGates = path.filter((e) => e.kind === 'gate' && e.outcomes.some((o) => o.ends)).length;
  const overviewSentence = `${steps.length} step${steps.length === 1 ? '' : 's'} on the main path${endingGates ? `; ${endingGates} decision point${endingGates === 1 ? '' : 's'} between them can end the run` : ''}.`;

  return {
    format: PROCESS_DOCUMENT_FORMAT,
    formatVersion: PROCESS_DOCUMENT_FORMAT_VERSION,
    program,
    fileName: engine.fileName,
    lineCount: engine.lineCount,
    sourceSha256: engine.sourceSha256,
    note: PROCESS_DOCUMENT_NOTE,
    glance: { summary: glanceSummary, trigger: glanceTrigger, points },
    purpose: { users, inScope, outOfScope, proposal: purposeProposal },
    trigger: { start, selection: inputs, data, inputUse },
    writes,
    derived,
    overview: { sentence: overviewSentence, traceability: engine.traceability.sentence, path, decisions },
    rules,
    ...(decisionTables.length ? { decisionTables } : {}),
    exceptions,
    outputs,
    integrations,
    controls,
    questions,
    appendix,
  };
}

/** Business weight of an effect, for the purpose sentence: documents and workflows before table rows and lists. */
function effectRank(phrase: string): number {
  if (/\bBAPI_|\bthrough transaction\b|\bcreate the\b/i.test(phrase)) return 0;
  if (/\bworkflow\b/i.test(phrase)) return 1;
  if (/\bupdate\b|\bentry in\b|\bdelete\b/i.test(phrase)) return 2;
  if (/\bas a list\b/i.test(phrase)) return 4;
  return 3;
}

/* ------------------------------------------------------------ the appendix */

export interface TraceContext {
  routines: ReadonlyArray<{ name: string; lineStart: number; lineEnd: number }>;
  unreachable: ReadonlySet<string>;
  labelOf?: (routine: string) => string | null;
  /** Event blocks of the main program, with their first line. */
  entries?: ReadonlyArray<{ label: string; line: number }>;
}

/**
 * The technical trace: every process element and every statement the engine
 * read — grouped by routine, each sentence once. Repeats are merged, nothing
 * is dropped: the element table keeps a row for every element and points to
 * the element where a shared sentence stands first.
 */
export function technicalTrace(engine: ProcessDocumentation, ctx: TraceContext): PdAppendix {
  const statementById = new Map(engine.statements.map((s) => [s.id, s]));
  const firstAt = new Map<string, string>();
  const elements = engine.steps.map((step) => {
    const statement = step.statementId ? statementById.get(step.statementId) : undefined;
    const key = statement ? sentenceKey(statement.text) : null;
    const earlier = key ? firstAt.get(key) ?? null : null;
    if (key && !earlier) firstAt.set(key, step.id);
    return {
      id: step.id,
      kind: step.kind,
      name: step.businessName ? `${step.businessName} (${step.technicalName})` : step.technicalName,
      anchor: step.anchor ? copy(step.anchor) : null,
      evidence: stepEvidence(step),
      does: statement && !earlier ? statement.text : null,
      sameAs: earlier,
    };
  });

  const entries = [...(ctx.entries ?? [])].sort((a, b) => a.line - b.line);
  const groupKey = (line: number): { routine: string; anchor: DocAnchor | null; reached: boolean } => {
    const r = ctx.routines.find((x) => x.lineStart <= line && line <= x.lineEnd);
    if (r) return { routine: r.name, anchor: anchor(r.lineStart, r.lineEnd), reached: !ctx.unreachable.has(r.name) };
    const event = [...entries].reverse().find((e) => e.line <= line);
    if (event) return { routine: event.label, anchor: anchor(event.line), reached: true };
    return { routine: 'Declarations', anchor: null, reached: true };
  };
  const groups = new Map<string, PdTraceGroup>();
  const seen = new Set<string>();
  let merged = 0;
  for (const statement of engine.statements) {
    const key = sentenceKey(statement.text);
    if (seen.has(key)) {
      merged += 1;
      continue;
    }
    seen.add(key);
    const first = statement.anchors[0]?.lineStart ?? 0;
    const g = groupKey(first);
    let group = groups.get(g.routine);
    if (!group) {
      group = { routine: g.routine, label: ctx.labelOf?.(g.routine) ?? null, anchor: g.anchor, reached: g.reached, statements: [] };
      groups.set(g.routine, group);
    }
    group.statements.push({ text: statement.text, anchors: statement.anchors.map(copy) });
  }
  const ordered = [...groups.values()].sort((a, b) => (a.anchor?.lineStart ?? 0) - (b.anchor?.lineStart ?? 0));

  const luw: PdText[] = [
    ...engine.effects.registrations.map((r) => ({
      text: `${r.module ?? 'A module named at run time'} is registered for the update task${r.unresolved ? ` — ${r.unresolved.reason}` : ''}.`,
      anchors: [copy(r.anchor)],
    })),
    ...engine.effects.events.map((e) => ({
      text: `${e.token}${e.kind === 'commit' ? commitWaitWords(e.andWait) : ''}.`,
      anchors: [copy(e.anchor)],
    })),
  ];
  const lanes: PdText[] = [
    ...engine.lanes.map((l) => ({ text: `${l.name || '(program)'} — ${l.kind}${l.basis.length ? `, from ${l.basis.join(', ')}` : ''}.`, anchors: [copy(l.anchor)] })),
    ...engine.proposedLanes.filter((l) => l.anchor).map((l) => ({ text: `${l.name}${l.authorityObject ? ` (${l.authorityObject})` : ''} — Model proposal.`, anchors: [copy(l.anchor!)] })),
  ];
  return { elements, groups: ordered, merged, luw, lanes };
}

/** `linesLabel`, re-exported for the callers that only import the builder. */
export { linesLabel };
