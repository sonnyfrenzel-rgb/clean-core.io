/**
 * The guided walk-through of the Business view — roadmap row "3.0.20 — with
 * it", part (1) (owner, 21.10.2026: "Step 96 of 96: Background run given or no
 * file?" beside an ABAP excerpt, a yes/no question before the reader knows what
 * the step does, and nothing said in plain language).
 *
 * For every step of the walk this says, in plain business words and anchored to
 * its lines:
 *
 *   - **what happens here** — read off the statements the step was drawn from
 *     (and, for a step that calls a routine, the routine's body);
 *   - **why it matters to the business** — from what those statements do: a
 *     control that stops cases, a rule that sends them one way or another, a
 *     change to data, a list for the user;
 *   - **what decides it** — the step's own condition and the branches it
 *     stands in (`enclosingBranches`, 3.0.18), in words;
 *   - **what data it touches** — the database tables it reads and changes, by
 *     their business names;
 *   - **what changes if it goes**.
 *
 * Technical steps a business reader need not see one by one — logging, file
 * handling, technical checks, run options and demo switches, set-up and loops —
 * are set apart with the reason. Since owner decision 21.10.2026 the guided
 * tour on the map (`lib/process-tour.ts`) reads this guide: it picks its
 * stations from the business steps by their `role` and asks nothing.
 *
 * **Engine-written, deterministic, no model.** Every sentence comes from the
 * source and the process map of it; the wording helpers are the plain-language
 * ones the map's labels use (`lib/abap/plain-language.ts`). The 17.7 business
 * statement of the step (`attachTo`) is carried beside it for the fold, as the
 * engine's detailed reading. Nothing here is stored and nothing is signed: it is
 * presentation, built in the browser from the source the active run signed, as
 * the map is.
 *
 * Pure: no React, no DOM, no network, no clock. Lives outside `lib/abap` on
 * purpose — it changes no engine output and no signed run.
 */
import { readStatements, type AbapStatement } from './abap/statement-reader';
import { readBlocks, type Block, type BlockStructure } from './abap/block-structure';
import { enclosingBranches, type EnclosingBranch } from './abap/enclosing-branches';
import {
  conditionToQuestion,
  humaniseField,
  humaniseRoutine,
  plainContext,
  ruleConditionText,
  type PlainContext,
} from './abap/plain-language';
import { tableTerm } from './abap/business-glossary';
import { attachTo, buildBusinessStatements } from './abap/business-statement';
import { isDecisionTag, type ProcessMapElement, type ProcessMapModel } from './process-map';

export interface WalkRange {
  lineStart: number;
  lineEnd: number;
}

/** One sentence of the walk and the lines it is read from. */
export interface WalkLine {
  text: string;
  anchor: WalkRange | null;
}

/** The kinds of step a business reader need not answer one by one. */
export type WalkTechnicalGroup = 'logging' | 'files' | 'checks' | 'switches' | 'setup';

export const WALK_TECHNICAL_ORDER: readonly WalkTechnicalGroup[] = Object.freeze([
  'checks',
  'switches',
  'logging',
  'files',
  'setup',
]);

export const WALK_TECHNICAL_LABELS: Record<WalkTechnicalGroup, string> = Object.freeze({
  checks: 'Technical checks',
  switches: 'Run options and demo switches',
  logging: 'Logging and statistics',
  files: 'File handling',
  setup: 'Set-up and repetition',
});

/** Why a group is technical — said once, above the group. */
export const WALK_TECHNICAL_WHY: Record<WalkTechnicalGroup, string> = Object.freeze({
  checks: 'They check whether something was found or is filled before the program goes on. They protect the program, not a business rule.',
  switches: 'They follow an option chosen when the program is started (update or test run, trace, background run, a user command). How the target offers such options is a question for IT.',
  logging: 'They write a log or statistics about the run. The target keeps its own logs; the business only needs to say whether a record of the run is required.',
  files: 'They read or write a file. In the target, files are replaced by standard interfaces; what matters to the business is the data, not the file.',
  setup: 'They prepare the run or repeat the steps inside them for every entry. The steps inside are asked on their own.',
});

export interface WalkGuideStep {
  /** The map element id — the subject its answer is stored under. */
  id: string;
  /** The step's plain name, as the map shows it. */
  title: string;
  /** The phase it belongs to (`WalkPhase.id`). */
  phase: string;
  /** Set when a business reader need not answer it one by one. */
  technical: WalkTechnicalGroup | null;
  happens: WalkLine;
  /**
   * A long list of cases said short — "It tells 3 cases apart." — for the tour's
   * card (owner decision 22.10.2026); `happens` keeps the full list, which the
   * tour shows one level down. Absent where `happens` is short or no case list.
   */
  brief?: WalkLine;
  matters: WalkLine;
  /** The step's own condition and the branches it stands in; empty when nothing decides it. */
  decides: WalkLine[];
  data: WalkLine | null;
  ifGone: WalkLine;
  /** The engine's detailed reading of the same lines (17.7), for the fold. */
  engine: { text: string; anchors: WalkRange[] } | null;
  anchor: WalkRange | null;
  /** True when "what happens" is a sentence read from the step's own statements, not the general fallback. */
  plain: boolean;
  /** What the step is for the business — what the guided tour picks its stations by (`lib/process-tour.ts`). */
  role: WalkRole;
}

/**
 * What a step is for the business, read from the same facts as its sentences:
 * it changes data, asks another system, protects the process, holds cases back,
 * decides which way they go, tells someone, shows the result, reads data, groups
 * a phase, or something else.
 */
export type WalkRole = 'change' | 'remote' | 'permission' | 'control' | 'rule' | 'mail' | 'output' | 'read' | 'phase' | 'other';

export interface WalkPhase {
  id: string;
  label: string;
  /** The business steps of this phase, in walk order. */
  stepIds: string[];
}

export interface WalkGuide {
  /** Every step of the walk, business and technical, by id. */
  byId: Record<string, WalkGuideStep>;
  /** Business steps, grouped by phase, phases in order of their first step. */
  phases: WalkPhase[];
  /** The business steps in the order the walk asks them. */
  business: string[];
  /** The technical steps, by group, in the walk's order inside each group. */
  technical: Array<{ group: WalkTechnicalGroup; label: string; why: string; stepIds: string[] }>;
}

/* ------------------------------------------------------------------ helpers */

const upperFirst = (text: string): string => (text ? text[0].toUpperCase() + text.slice(1) : text);
const lowerFirst = (text: string): string =>
  text && !/^[A-Z0-9]{2,}/.test(text) ? text[0].toLowerCase() + text.slice(1) : text;
const sentence = (text: string): string => {
  const clean = upperFirst(text.replace(/\s+/g, ' ').trim());
  return /[.!?]$/.test(clean) ? clean : `${clean}.`;
};

function list(items: readonly string[], max = 4): string {
  const unique = [...new Set(items.filter(Boolean))];
  if (unique.length === 0) return '';
  const shown = unique.slice(0, max);
  const more = unique.length - shown.length;
  if (more > 0) return `${shown.join(', ')} and ${more} more`;
  if (shown.length === 1) return shown[0];
  return `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`;
}

const unquote = (text: string): string => {
  const m = /^(['`])([\s\S]*)\1(?:\(\w{1,3}\))?$/.exec(text.trim());
  return m ? m[2] : text.trim();
};

/** A WHEN value as a reader says it: `'K'` → K, `space` → empty. */
const valueWord = (value: string): string => {
  const v = value.trim();
  if (/^space$/i.test(v) || v === "''" || v === "' '") return 'empty';
  return unquote(v);
};

/** A word that reads as code to a business reader: `gv_x`, `sy-subrc`, `abap_true`, `<fs_x>`. */
export const ABAP_TOKEN = /\b(?:sy-\w+|abap_(?:true|false)|[gls][vstcrf]_\w+|[gl]t_\w+|p_\w+|s_\w+|c_\w+)\b|<fs_|\bIS INITIAL\b|\bsy-subrc\b/i;

/** A table's business name, with the table beside it: "purchase requisitions (EBAN)". */
function tableWords(name: string, plural = true): string {
  const term = tableTerm(name);
  const table = name.toUpperCase();
  if (!term) return plural ? `entries of ${table}` : `an entry in ${table}`;
  return `${lowerFirst(plural ? term.plural : term.singular)} (${table})`;
}

function plainField(identifier: string, ctx: PlainContext): string {
  const words = humaniseField(identifier, ctx);
  return lowerFirst(words || identifier);
}

const conditionOf = (statement: AbapStatement): string =>
  statement.text.replace(/^(?:IF|ELSEIF|CHECK|WHILE)\s+/i, '').replace(/\.\s*$/, '').trim();

/** The condition in words, never as code; null when the engine cannot put it into words. */
function conditionWords(condition: string, ctx: PlainContext, line: number): string | null {
  const read = ruleConditionText(condition, ctx, line);
  const words = read.full ?? null;
  if (!words || ABAP_TOKEN.test(words)) return null;
  return lowerFirst(words);
}

/* -------------------------------------------------------------- the reading */

interface Reading {
  source: string;
  ctx: PlainContext;
  statements: AbapStatement[];
  structure: BlockStructure;
  /** FORM / METHOD / FUNCTION bodies by upper-case name. */
  routines: Map<string, { open: number; close: number }>;
  /** Internal tables (declared, or by naming), lower case. */
  internal: (name: string) => boolean;
}

function readingOf(source: string): Reading {
  const statements = readStatements(source);
  const structure = readBlocks(statements);
  const ctx = plainContext(source);
  const routines = new Map<string, { open: number; close: number }>();
  for (let i = 0; i < statements.length; i += 1) {
    const m = /^(?:FORM|METHOD|FUNCTION)\s+([\w/~]+)/i.exec(statements[i].text);
    if (!m) continue;
    const end = statements.findIndex((s, j) => j > i && /^END(?:FORM|METHOD|FUNCTION)\b/i.test(s.keyword));
    routines.set(m[1].toUpperCase(), { open: i, close: end < 0 ? statements.length - 1 : end });
  }
  const internal = (name: string) => {
    const lower = name.toLowerCase().replace(/\[\]$/, '');
    if (lower.includes('-')) return false;
    return ctx.tables.has(lower) || /^(?:[glm]t|it|et|ct|lt)_/.test(lower);
  };
  return { source, ctx, statements, structure, routines, internal };
}

const statementAt = (r: Reading, line: number): number =>
  r.statements.findIndex((s) => s.lineStart <= line && s.lineEnd >= line);

/** The statements a step stands for: its own lines, and the body of the routine it calls. */
function bodyOf(r: Reading, element: ProcessMapElement, depth = 0, seen = new Set<string>()): AbapStatement[] {
  const out: AbapStatement[] = [];
  if (element.anchor) {
    for (const s of r.statements) {
      if (s.lineStart >= element.anchor.lineStart && s.lineEnd <= element.anchor.lineEnd) out.push(s);
    }
  }
  const routine = r.routines.get(element.technicalName.toUpperCase());
  if (routine && !seen.has(element.technicalName.toUpperCase())) {
    seen.add(element.technicalName.toUpperCase());
    out.push(...r.statements.slice(routine.open + 1, routine.close));
  }
  // One level of PERFORM inside: "Check material status" says what the routine it calls reads.
  if (depth < 2) {
    for (const s of [...out]) {
      const m = /^PERFORM\s+([\w/]+)/i.exec(s.text);
      if (!m) continue;
      const name = m[1].toUpperCase();
      const called = r.routines.get(name);
      if (!called || seen.has(name)) continue;
      seen.add(name);
      out.push(...r.statements.slice(called.open + 1, called.close));
    }
  }
  return out;
}

interface Facts {
  reads: string[];
  writes: Array<{ verb: 'created' | 'changed' | 'deleted' | 'saved'; table: string }>;
  checks: number;
  sets: string[];
  calls: string[];
  remote: string | null;
  errors: boolean;
  messages: boolean;
  output: boolean;
  mail: boolean;
  files: boolean;
  transaction: string | null;
  commits: boolean;
  firstData: WalkRange | null;
}

function factsOf(r: Reading, body: readonly AbapStatement[]): Facts {
  const f: Facts = {
    reads: [], writes: [], checks: 0, sets: [], calls: [], remote: null, errors: false, messages: false,
    output: false, mail: false, files: false, transaction: null, commits: false, firstData: null,
  };
  const mark = (s: AbapStatement) => {
    if (!f.firstData) f.firstData = { lineStart: s.lineStart, lineEnd: s.lineEnd };
  };
  for (const s of body) {
    const text = s.text;
    const keyword = s.keyword.toUpperCase();
    if (keyword === 'SELECT') {
      const tables = [...text.matchAll(/\b(?:FROM|JOIN)\s+([A-Za-z][\w/]*)/gi)].map((m) => m[1]).filter((t) => !r.internal(t) && !/^@/.test(t));
      if (tables.length) {
        f.reads.push(...tables.map((t) => t.toUpperCase()));
        mark(s);
      }
      continue;
    }
    const write = /^(INSERT|UPDATE|MODIFY|DELETE)\s+(?:FROM\s+|INTO\s+)?([A-Za-z][\w/]*)/i.exec(text);
    if (write && !/\bTABLE\b|\bADJACENT\b|\bINDEX\b|\bASSIGNING\b|\bTRANSPORTING\b/i.test(text) && !r.internal(write[2])) {
      const op = write[1].toUpperCase();
      const verb = op === 'INSERT' ? 'created' : op === 'DELETE' ? 'deleted' : op === 'UPDATE' ? 'changed' : 'saved';
      f.writes.push({ verb, table: write[2].toUpperCase() });
      mark(s);
      continue;
    }
    if (keyword === 'IF' || keyword === 'ELSEIF' || keyword === 'CASE' || keyword === 'CHECK') f.checks += 1;
    if (keyword === 'MESSAGE') {
      f.messages = true;
      if (/\bTYPE\s+'[EAX]'|^MESSAGE\s+[eax]\d/i.test(text)) f.errors = true;
    }
    if (keyword === 'RAISE' && !/\bEVENT\b/i.test(text)) f.errors = true;
    if (keyword === 'COMMIT') f.commits = true;
    if (keyword === 'WRITE' || /REUSE_ALV|CL_SALV|SET_TABLE_FOR_FIRST_DISPLAY/i.test(text)) f.output = true;
    if (/\bSO_NEW_DOCUMENT|\bCL_BCS\b|SO_DOCUMENT_SEND/i.test(text)) f.mail = true;
    if (/GUI_DOWNLOAD|GUI_UPLOAD|\bDATASET\b|CL_GUI_FRONTEND_SERVICES/i.test(text)) f.files = true;
    const tx = /^CALL\s+TRANSACTION\s+'([^']+)'/i.exec(text);
    if (tx) {
      f.transaction = tx[1];
      mark(s);
    }
    const fn = /^CALL\s+FUNCTION\s+'([^']+)'/i.exec(text);
    if (fn) {
      f.calls.push(fn[1].toUpperCase());
      if (/\bDESTINATION\b/i.test(text) && !/\bIN\s+UPDATE\s+TASK\b/i.test(text)) f.remote = fn[1].toUpperCase();
      if (/^BAPI_.*(?:CREATE|CHANGE|SAVE|DELETE|POST)/i.test(fn[1])) {
        f.writes.push({ verb: /DELETE/i.test(fn[1]) ? 'deleted' : /CREATE|POST/i.test(fn[1]) ? 'created' : 'changed', table: fn[1].toUpperCase() });
      }
      mark(s);
    }
    const assign = /^([A-Za-z<][\w<>-]*-[\w]+)\s*=\s*(.+)$/.exec(text.replace(/\.$/, ''));
    if (assign && !/^(?:ls|lv|lt)_/i.test(assign[1])) f.sets.push(plainField(assign[1], r.ctx));
  }
  return f;
}

function functionWords(name: string): string {
  const bare = name.replace(/^\/[^/]+\//, '');
  if (/^BAPI_/.test(bare)) return `the SAP standard function “${humaniseRoutine(bare.slice(5))}”`;
  return `“${humaniseRoutine(bare.replace(/^[ZY]_/, ''))}”`;
}

/** What a branch body does first, in words: "the run stops with an error message", "it goes on to “Reject”". */
function outcomeOfBody(r: Reading, from: number, to: number, block: Block | null): string | null {
  const parts: string[] = [];
  for (let j = from; j < to && parts.length < 2; j += 1) {
    const s = r.statements[j];
    // Direct statements of the branch only; a nested IF says itself.
    const around = r.structure.enclosing[j] ?? [];
    if (block && around[around.length - 1] !== block) continue;
    const keyword = s.keyword.toUpperCase();
    const text = s.text.replace(/\.$/, '');
    if (keyword === 'MESSAGE') {
      parts.push(/\bTYPE\s+'[EAX]'|^MESSAGE\s+[eax]\d/i.test(text) ? 'the run stops with an error message' : 'a message is shown');
      continue;
    }
    if (keyword === 'RAISE') { parts.push('it stops with an error'); break; }
    if (keyword === 'RETURN' || keyword === 'EXIT' || keyword === 'STOP' || /^LEAVE\b/i.test(text)) {
      parts.push(insideLoop(r, j) && keyword === 'EXIT' ? 'it stops going through the list' : 'this part ends here');
      break;
    }
    if (keyword === 'CONTINUE') { parts.push('this one is skipped and the next one is taken'); break; }
    const perform = /^PERFORM\s+([\w/]+)/i.exec(text);
    if (perform) { parts.push(`it goes on to “${humaniseRoutine(perform[1])}”`); continue; }
    const fn = /^CALL\s+FUNCTION\s+'([^']+)'/i.exec(text);
    if (fn) { parts.push(`it calls ${functionWords(fn[1])}`); continue; }
    const tx = /^CALL\s+TRANSACTION\s+'([^']+)'/i.exec(text);
    if (tx) { parts.push(`transaction ${tx[1]} is run`); continue; }
    const assign = /^([A-Za-z<][\w<>[\]-]*)\s*=\s*([^=]+)$/.exec(text);
    if (assign && !/^(?:IF|CHECK|WHEN)\b/i.test(text)) {
      const target = plainField(assign[1], r.ctx);
      const raw = assign[2].trim();
      const literal = /^['`]/.test(raw) ? unquote(raw) : /^-?\d+(?:\.\d+)?$/.test(raw) ? raw : null;
      const value = literal ?? (r.ctx.constants.get(raw.toLowerCase()) ?? null);
      const said = value !== null
        ? `${target} is set to ${value || 'empty'}`
        : /^abap_true$/i.test(raw) ? `${target} is marked` : /^abap_false$/i.test(raw) ? `${target} is cleared` : `${target} is set`;
      if (!ABAP_TOKEN.test(said)) parts.push(said);
      continue;
    }
  }
  if (parts.length === 0) return null;
  return parts.join(' and ');
}

function insideLoop(r: Reading, index: number): boolean {
  const around = r.structure.enclosing[index] ?? [];
  for (let k = around.length - 1; k >= 0; k -= 1) {
    const kind = around[k].kind as string;
    if (kind === 'form' || kind === 'method' || kind === 'module') return false;
    if (kind === 'loop' || kind === 'do' || kind === 'while' || kind === 'select') return true;
  }
  return false;
}

/** The arms of the IF or CASE whose head is statement `index`: condition, body range. */
function armsOf(r: Reading, index: number): { block: Block | null; arms: Array<{ head: number; condition: string | null; from: number; to: number }> } {
  const block = r.structure.blocks.find((b) => b.openIndex === index && (b.kind === 'if' || b.kind === 'case')) ?? null;
  if (!block) return { block: null, arms: [] };
  const heads: number[] = block.kind === 'if' ? [index] : [];
  for (let j = index + 1; j < block.closeIndex; j += 1) {
    const around = r.structure.enclosing[j] ?? [];
    if (around[around.length - 1] !== block) continue;
    const keyword = r.statements[j].keyword.toUpperCase();
    if (block.kind === 'if' && (keyword === 'ELSEIF' || keyword === 'ELSE')) heads.push(j);
    if (block.kind === 'case' && keyword === 'WHEN') heads.push(j);
  }
  const arms = heads.map((head, k) => {
    const s = r.statements[head];
    const keyword = s.keyword.toUpperCase();
    const condition = keyword === 'ELSE' ? null
      : keyword === 'WHEN' ? s.text.replace(/^WHEN\s+/i, '').replace(/\.$/, '').trim()
        : conditionOf(s);
    return { head, condition, from: head + 1, to: heads[k + 1] ?? block.closeIndex };
  });
  return { block, arms };
}

/** The branches around a statement, in words, outermost first. */
function enclosingLines(r: Reading, index: number, skipLine?: number): WalkLine[] {
  if (index < 0) return [];
  let branches: EnclosingBranch[] = [];
  try {
    branches = enclosingBranches(r.statements, r.structure, index);
  } catch {
    branches = [];
  }
  const out: WalkLine[] = [];
  for (const branch of branches) {
    if (branch.line === skipLine) continue;
    const at = { lineStart: branch.line, lineEnd: branch.line };
    if (branch.kind === 'if' || branch.kind === 'elseif') {
      const words = branch.condition ? conditionWords(branch.condition, r.ctx, branch.line) : null;
      const before = branch.earlier.map((c) => conditionWords(c, r.ctx, branch.chainLine)).filter((w): w is string => !!w);
      if (words) {
        out.push({
          text: sentence(before.length && branch.kind === 'elseif' ? `Only when ${words}, and not ${list(before)}` : `Only when ${words}`),
          anchor: at,
        });
      }
    } else if (branch.kind === 'else') {
      const before = branch.earlier.map((c) => conditionWords(c, r.ctx, branch.chainLine)).filter((w): w is string => !!w);
      if (before.length) out.push({ text: sentence(`Only when not ${list(before)}`), anchor: at });
    } else if (branch.kind === 'when' && branch.selector && branch.condition) {
      const field = plainField(branch.selector, r.ctx);
      const values = branch.condition.split(/\s+OR\s+/i).map(valueWord);
      if (!ABAP_TOKEN.test(field)) out.push({ text: sentence(`Only when ${field} is ${list(values, 6).replace(/ and /, ' or ')}`), anchor: at });
    } else if (branch.kind === 'when-others' && branch.selector) {
      const field = plainField(branch.selector, r.ctx);
      const values = branch.earlier.flatMap((c) => c.split(/\s+OR\s+/i)).map(valueWord);
      if (!ABAP_TOKEN.test(field)) out.push({ text: sentence(`Only when ${field} is none of ${list(values, 6).replace(/ and /, ' or ')}`), anchor: at });
    }
  }
  return out;
}

/* ------------------------------------------------------------ classification */

const LOGGING = /(?:^|[_\s])(?:LOG|LOGS|TRACE|STATISTICS?|PROTOCOL|APPL_LOG)(?:[_\s]|$)|^BAL_|\blog\b|\bstatistics\b|\btrace\b/i;
const FILES = /GUI_DOWNLOAD|GUI_UPLOAD|DATASET|FRONTEND_SERVICES|(?:^|[_\s])FILE(?:S|NAME)?(?:[_\s]|$)|\bfile\b/i;
const SETUP = /^(?:INIT|INITIALI[SZ]E|INITIALIZATION|CLEAR|REFRESH|FREE|BUILD_FIELDCAT\w*|FIELDCAT\w*|SET_PF_STATUS|PBO|PAI)\b|^(?:INIT|INITIALI[SZ]E)_/i;
const LOOP = /^(?:LOOP\s+AT|DO\b|WHILE\b|SELECT\b[\s\S]*ENDSELECT)/i;

function operandsOf(condition: string): string[] {
  return [...condition.replace(/'[^']*'|`[^`]*`/g, ' ').matchAll(/(?:<[A-Za-z_]\w*>|[A-Za-z_][\w/]*)(?:(?:->|=>|-|~)[A-Za-z_]\w*)*(?:\[\])?/g)]
    .map((m) => m[0])
    .filter((t) => !/^(?:AND|OR|NOT|IS|INITIAL|BOUND|ASSIGNED|SUPPLIED|EQ|NE|LT|GT|LE|GE|CP|NP|CS|NS|CA|NA|CO|CN|IN|BETWEEN|abap_true|abap_false|space)$/i.test(t));
}

function technicalOf(r: Reading, element: ProcessMapElement, facts: Facts, stopsOnly: boolean): WalkTechnicalGroup | null {
  const names = `${element.technicalName} ${element.label}`;
  if (!isDecisionTag(element.tag)) {
    if (LOOP.test(element.technicalName)) return 'setup';
    if (LOGGING.test(element.technicalName) || LOGGING.test(element.label)) return 'logging';
    if (facts.files || FILES.test(element.technicalName) || /\bfile\b/i.test(element.label)) return 'files';
    if (SETUP.test(element.technicalName) || /^(?:Initiali[sz]e|Prepare the result list|Build field catalog)/i.test(element.label)) return 'setup';
    return null;
  }
  const at = element.anchor ? statementAt(r, element.anchor.lineStart) : -1;
  const head = at >= 0 ? r.statements[at] : undefined;
  // Every arm of an IF … ELSEIF chain counts: "not found, or stock below the
  // ordered quantity" is a business rule even though its first arm is not.
  const armConditions = head && /^IF\b/i.test(head.text)
    ? armsOf(r, at).arms.map((arm) => arm.condition).filter((c): c is string => !!c)
    : [];
  const condition = head
    ? /^CASE\b/i.test(head.text)
      ? head.text.replace(/^CASE\s+/i, '').replace(/\.$/, '')
      : armConditions.length ? armConditions.join(' AND ') : conditionOf(head)
    : element.technicalName;
  const operands = operandsOf(condition);
  if (operands.length === 0) return null;
  const lower = operands.map((o) => o.toLowerCase());
  // A user command or a background run: how the program was started, not the business.
  if (lower.every((o) => /^sy-(?:ucomm|batch|tcode|uname|binpt|calld)$/.test(o) || isSwitch(r, o))) return 'switches';
  if (lower.some((o) => /^p_file|file/.test(o)) && lower.every((o) => /^sy-/.test(o) || /file/.test(o) || isSwitch(r, o))) return 'files';
  // Found or not found, filled or empty — unless it is the answer of a permission check.
  if (lower.every((o) => o === 'sy-subrc' || o === 'sy-dbcnt' || r.internal(o)) && !afterAuthority(r, element)) {
    if (/\bIS\s+(?:NOT\s+)?INITIAL\b|sy-subrc|sy-dbcnt/i.test(condition)) return 'checks';
  }
  // A flag set in an earlier step and passed on here, where all the branch does is stop.
  if (stopsOnly && lower.every((o) => r.ctx.flags.has(o.replace(/\[\]$/, '')) && !r.ctx.selections.has(o))) return 'checks';
  if (LOGGING.test(names) && !/\bLOGIN|LOGON\b/i.test(names)) return 'logging';
  return null;
}

/** A selection parameter that is a checkbox or a radio button, or a demo/test switch constant. */
function isSwitch(r: Reading, operand: string): boolean {
  const name = operand.toLowerCase();
  const selection = r.ctx.selections.get(name);
  if (selection?.checkbox) return true;
  if (selection && !selection.ref && !selection.selectOption && r.ctx.flags.has(name)) return true;
  if (/^(?:c|gc|lc)_(?:demo|test|sim|simulate|debug|trace)\w*$/.test(name)) return true;
  return false;
}

function afterAuthority(r: Reading, element: ProcessMapElement): boolean {
  if (!element.anchor) return false;
  const at = statementAt(r, element.anchor.lineStart);
  for (let j = at - 1; j >= 0 && j >= at - 4; j -= 1) {
    if (/^AUTHORITY-CHECK\b/i.test(r.statements[j].text)) return true;
  }
  return false;
}

/**
 * From how many characters a case list is said short on the tour's card
 * (owner decision 22.10.2026: a 351-character list pushed "Next" off a phone).
 */
export const CASE_LIST_BRIEF_FROM = 140;

/** An outcome that holds a case back: an error, an end, a skip, or a routine named for rejecting it. */
const STOPS = /stops|ends here|skipped|“(?:Reject|Cancel|Block|Refuse|Deny|Error|Fail|Abort)[^”]*”/i;

/* -------------------------------------------------------------- composition */

function decisionStep(r: Reading, element: ProcessMapElement): Omit<WalkGuideStep, 'id' | 'title' | 'phase' | 'technical' | 'engine' | 'anchor'> & { stopsOnly: boolean } {
  const anchor = element.anchor;
  const at = anchor ? statementAt(r, anchor.lineStart) : -1;
  const head = at >= 0 ? r.statements[at] : null;
  const line = anchor?.lineStart ?? 0;
  const own: WalkRange | null = anchor ? { lineStart: anchor.lineStart, lineEnd: anchor.lineStart } : null;
  const keyword = head?.keyword.toUpperCase() ?? '';
  const decides: WalkLine[] = [];
  let happens: string | null = null;
  /** The short form of a case list, set beside `happens` where the list is long. */
  let brief: string | null = null;
  let stops: string | null = null;
  let stopsOnly = false;
  let plain = false;
  const authority = afterAuthority(r, element);

  if (head && (keyword === 'IF' || keyword === 'ELSEIF')) {
    const { block, arms } = armsOf(r, at);
    const usable = arms.length ? arms : [{ head: at, condition: conditionOf(head), from: at + 1, to: at + 1 }];
    // A plain IF, or IF … ELSE: one question. An ELSEIF makes it several cases.
    if (usable[0].condition && (usable.length === 1 || (usable.length === 2 && usable[1].condition === null))) {
      const cond = usable[0].condition;
      const q = conditionToQuestion(cond, r.ctx, line);
      const yesIsTrue = q.trueBranch === 'Yes';
      const whenTrue = outcomeOfBody(r, usable[0].from, usable[0].to, block);
      const whenFalse = usable[1] ? outcomeOfBody(r, usable[1].from, usable[1].to, block) : null;
      const question = ABAP_TOKEN.test(q.question) || q.question === 'Condition met?' ? null : q.question;
      if (question) {
        const yes = yesIsTrue ? whenTrue : whenFalse;
        const no = yesIsTrue ? whenFalse : whenTrue;
        const said = [`It checks: ${question}`];
        if (yes) said.push(`If yes, ${yes}.`);
        if (no) said.push(`If no, ${no}.`);
        if (!yes && !no) said.push('The answer decides which way the case goes on.');
        else if (!yes) said.push('If yes, it carries on.');
        else if (!no) said.push('If no, it carries on.');
        happens = said.join(' ');
        plain = true;
      }
      const stopWords = STOPS;
      if (whenTrue && stopWords.test(whenTrue)) stops = whenTrue;
      else if (whenFalse && stopWords.test(whenFalse)) stops = whenFalse;
      stopsOnly = !!whenTrue && /^(?:this part ends here|it stops going through the list|this one is skipped and the next one is taken)$/.test(whenTrue) && !whenFalse;
      const words = conditionWords(cond, r.ctx, line);
      if (words) decides.push({ text: sentence(`Decided by: ${words}`), anchor: own });
    } else {
      const cases = usable
        .map((arm) => {
          const words = arm.condition ? conditionWords(arm.condition, r.ctx, r.statements[arm.head].lineStart) : 'in every other case';
          const outcome = outcomeOfBody(r, arm.from, arm.to, block);
          if (!words) return null;
          if (outcome && STOPS.test(outcome)) stops = outcome;
          return outcome ? `${words}: ${outcome}` : words;
        })
        .filter((c): c is string => !!c);
      if (cases.length >= 2) {
        const otherwise = usable[usable.length - 1].condition === null ? '' : '; in every other case it carries on';
        happens = `It tells ${usable.length} cases apart, in this order — ${cases.join('; ')}${otherwise}.`;
        brief = `It tells ${usable.length} cases apart.`;
        plain = true;
      }
      for (const arm of usable) {
        if (!arm.condition) continue;
        const words = conditionWords(arm.condition, r.ctx, r.statements[arm.head].lineStart);
        const armLine = r.statements[arm.head].lineStart;
        if (words) decides.push({ text: sentence(`Decided by: ${words}`), anchor: { lineStart: armLine, lineEnd: armLine } });
      }
    }
  } else if (head && keyword === 'CHECK') {
    const cond = conditionOf(head);
    const words = conditionWords(cond, r.ctx, line);
    const loop = insideLoop(r, at);
    if (words) {
      happens = loop
        ? `It goes on with an entry only when ${words}; any other entry is skipped and the next one is taken.`
        : `It goes on only when ${words}; otherwise this part of the process ends here.`;
      plain = true;
      decides.push({ text: sentence(`Decided by: ${words}`), anchor: own });
    }
    stops = loop ? 'the entry is skipped' : 'this part of the process ends';
    stopsOnly = true;
  } else if (head && keyword === 'CASE') {
    const selector = head.text.replace(/^CASE\s+/i, '').replace(/\.$/, '').trim();
    const field = plainField(selector, r.ctx);
    const { block, arms } = armsOf(r, at);
    const cases = arms
      .map((arm) => {
        const values = arm.condition && !/^OTHERS$/i.test(arm.condition)
          ? list(arm.condition.split(/\s+OR\s+/i).map(valueWord), 6).replace(/ and /, ' or ')
          : 'anything else';
        const outcome = outcomeOfBody(r, arm.from, arm.to, block);
        if (outcome && STOPS.test(outcome)) stops = outcome;
        return `${values}: ${outcome ?? (arm.to > arm.from ? 'further checks follow' : 'nothing more happens here')}`;
      })
      .filter((c) => !ABAP_TOKEN.test(c));
    if (!ABAP_TOKEN.test(field) && cases.length) {
      happens = `It looks at the ${field} and goes a different way for each value — ${cases.join('; ')}.`;
      brief = `It looks at the ${field} and goes one of ${arms.length} ways, depending on its value.`;
      plain = true;
      decides.push({ text: sentence(`Decided by: the ${field}`), anchor: own });
    }
  }

  decides.push(...enclosingLines(r, at, line));
  if (!happens) {
    const question = element.label.endsWith('?') ? element.label : `${element.label}?`;
    happens = `It checks: ${question} The answer decides which way the case goes on.`;
  }
  const fields = head
    ? operandsOf(keyword === 'CASE' ? head.text.replace(/^CASE\s+/i, '') : conditionOf(head))
      .filter((o) => !/^sy-/i.test(o) && !r.ctx.constants.has(o.toLowerCase()))
      .map((o) => plainField(o, r.ctx))
      .filter((w) => w && !ABAP_TOKEN.test(w))
    : [];
  const data: WalkLine | null = fields.length ? { text: sentence(`It looks at ${list(fields)}`), anchor: own } : null;

  const matters = authority
    ? 'It protects the process: only people with the right permission get past this point.'
    : stops
      ? 'It is a control: cases that do not pass it are held back and do not reach the steps after it.'
      : 'It is a business rule: it decides which way each case goes.';
  const ifGone = authority
    ? 'Without it, anyone who can start the program could run this part — the target needs its own permission check.'
    : stops
      ? `Without it, the cases held back here would go on to the next steps. Today, for those cases, ${stops}.`
      : 'Without it, every case would go the same way — say which way is right.';
  const full = sentence(happens);
  return {
    happens: { text: full, anchor: own },
    ...(brief && full.length > CASE_LIST_BRIEF_FROM ? { brief: { text: sentence(brief), anchor: own } } : {}),
    matters: { text: matters, anchor: own },
    decides,
    data,
    ifGone: { text: ifGone, anchor: own },
    plain,
    role: authority ? 'permission' : stops ? 'control' : 'rule',
    stopsOnly,
  };
}

function activityStep(r: Reading, element: ProcessMapElement, model: ProcessMapModel, facts: Facts): Omit<WalkGuideStep, 'id' | 'title' | 'phase' | 'technical' | 'engine' | 'anchor'> {
  const anchor = element.anchor ? { lineStart: element.anchor.lineStart, lineEnd: element.anchor.lineEnd } : null;
  const at = anchor ? statementAt(r, anchor.lineStart) : -1;
  const head = at >= 0 ? r.statements[at] : null;
  const inner = element.opensPlane ? model.elements.filter((e) => e.plane === element.opensPlane && !e.event) : [];
  const writes = facts.writes.map((w) => `${w.verb === 'created' ? 'creates' : w.verb === 'deleted' ? 'deletes' : w.verb === 'saved' ? 'saves' : 'changes'} ${/^BAPI_/.test(w.table) ? functionWords(w.table).replace(/^the /, 'data through the ') : tableWords(w.table, false)}`);
  const reads = facts.reads.map((t) => tableWords(t));
  let happens: string | null = null;
  let plain = true;

  const loop = LOOP.test(element.technicalName) ? /^LOOP\s+AT\s+([\w<>-]+)/i.exec(element.technicalName) : null;
  if (loop || LOOP.test(element.technicalName)) {
    const what = loop ? plainField(loop[1], r.ctx) : 'entry';
    happens = `It goes through the ${ABAP_TOKEN.test(what) ? 'entries' : what} one by one and repeats the steps inside for each of them.`;
  } else if (head && /^SELECT\b/i.test(head.text) && reads.length) {
    const where = /\bWHERE\s+([\s\S]+?)(?:\bINTO\b|\bORDER\b|\bGROUP\b|$)/i.exec(head.text);
    const by = where ? [...where[1].matchAll(/([A-Za-z]\w*)\s*(?:=|EQ|IN|>=|<=|>|<)/g)].map((m) => plainField(m[1], r.ctx)).filter((w) => !ABAP_TOKEN.test(w)) : [];
    happens = `It reads ${list(reads)} from the system${by.length ? `, picked by ${list(by, 3)}` : ''}.`;
  } else if (head && /^(?:INSERT|UPDATE|MODIFY|DELETE)\b/i.test(head.text) && writes.length) {
    happens = `It ${list(writes)} in the system.`;
  } else if (inner.length) {
    const names = inner.map((e) => e.label);
    const distinct = new Set(names).size;
    happens = inner.length === 1
      ? `“${element.label}” is a phase with one step: ${names[0]}`
      : distinct < names.length
        ? `“${element.label}” is a phase of ${inner.length} steps, among them ${list(names, 3)}`
        : `“${element.label}” is a phase of ${inner.length} steps: ${list(names, 3)}`;
  } else if (facts.remote) {
    happens = `It asks another system for ${lowerFirst(element.label)}. Which system answers is set in a connection outside the code.`;
  } else if (facts.transaction) {
    happens = `It runs transaction ${facts.transaction} in the background, as if a user entered the data.`;
  } else if (element.tag === 'sendTask' || facts.mail) {
    happens = 'It sends an e-mail about the result.';
  } else if (element.tag === 'userTask' || (facts.output && !reads.length && !writes.length)) {
    happens = 'It shows the result to the user as a list on the screen.';
  } else if (head && /^CALL\s+FUNCTION/i.test(head.text) && facts.calls.length) {
    happens = `It hands the data to ${functionWords(facts.calls[0])}.`;
  } else {
    const parts: string[] = [];
    if (reads.length) parts.push(`reads ${list(reads, 3)}`);
    if (facts.checks) parts.push(`applies ${facts.checks} ${facts.checks === 1 ? 'check' : 'checks'}`);
    const sets = facts.sets.filter((s) => !ABAP_TOKEN.test(s));
    if (sets.length) parts.push(`sets ${list(sets, 3)}`);
    if (writes.length) parts.push(list(writes, 2));
    if (facts.calls.length && !writes.length) parts.push(`calls ${functionWords(facts.calls[0])}`);
    if (facts.output) parts.push('shows the result');
    if (facts.errors) parts.push('can stop the run with an error message');
    else if (facts.messages) parts.push('shows a message');
    if (parts.length) happens = `It ${list(parts, 5)}.`;
  }
  if (!happens) {
    happens = `It carries out “${element.label}”.`;
    plain = false;
  }

  const enclosing = enclosingLines(r, at);
  const decides = enclosing;

  const dataParts: string[] = [];
  if (reads.length) dataParts.push(`reads ${list(reads)}`);
  if (writes.length) dataParts.push(list(writes));
  const data: WalkLine | null = dataParts.length
    ? { text: sentence(`It ${list(dataParts, 2)}`), anchor: facts.firstData ?? anchor }
    : null;

  const decisions = inner.filter((e) => isDecisionTag(e.tag)).length;
  const matters = writes.length
    ? 'This is where the program changes data in the system — the result the business sees afterwards.'
    : facts.remote
      ? 'The result depends on another system: the steps after it work with its answer.'
      : facts.transaction
        ? 'It changes data the way a user would in the transaction — the result the business sees afterwards.'
        : element.tag === 'sendTask' || facts.mail
          ? 'People learn about the result without opening the system.'
          : element.tag === 'userTask' || facts.output
            ? 'It is what the user sees of the run.'
            : inner.length
              ? `It groups ${inner.length} ${inner.length === 1 ? 'step' : 'steps'}${decisions ? `, ${decisions} of them ${decisions === 1 ? 'a decision' : 'decisions'}` : ''}.`
              : reads.length
                ? 'The steps after it work on this data; what is read here decides what is processed.'
                : facts.checks
                  ? 'It applies rules that decide the outcome for each case.'
                  : 'It is one part of the process, run every time the program reaches this point.';
  const ifGone = writes.length
    ? `The program would no longer do this: ${list(writes.map((w) => w.replace(/^creates/, 'create').replace(/^changes/, 'change').replace(/^deletes/, 'delete').replace(/^saves/, 'save')), 2)}. Another step, or the SAP standard, would have to.`
    : facts.remote
      ? 'The steps after it would get no answer from the other system — the target needs another way to get it.'
      : element.tag === 'userTask' || facts.output
        ? 'Nobody would see the result here; it would have to be shown another way, for example in a standard app.'
        : element.tag === 'sendTask' || facts.mail
          ? 'Nobody would be told about the result by e-mail.'
          : inner.length
            ? inner.length === 1 ? 'Its one step would go with it.' : `All ${inner.length} steps of this phase would go with it.`
            : reads.length
              ? `The steps that need ${list(reads, 2)} would have nothing to work on, unless they get it another way.`
              : 'This step and what it does would no longer happen.';
  // The same order of facts as "why it matters" above.
  const role: WalkRole = writes.length || facts.transaction
    ? 'change'
    : facts.remote
      ? 'remote'
      : element.tag === 'sendTask' || facts.mail
        ? 'mail'
        : element.tag === 'userTask' || facts.output
          ? 'output'
          : inner.length
            ? 'phase'
            : reads.length
              ? 'read'
              : facts.checks || element.tag === 'businessRuleTask'
                ? 'rule'
                : 'other';
  return {
    happens: { text: sentence(happens), anchor },
    matters: { text: matters, anchor },
    decides,
    data,
    ifGone: { text: ifGone, anchor },
    plain,
    role,
  };
}

/* ------------------------------------------------------------------- phases */

function phaseOf(element: ProcessMapElement, byId: Map<string, ProcessMapElement>): string | null {
  let current: ProcessMapElement | undefined = element;
  let guard = 0;
  while (current && current.plane !== null && guard < 50) {
    current = byId.get(current.plane);
    guard += 1;
  }
  if (!current) return null;
  return current.opensPlane ? current.id : null;
}

/**
 * The walk-through of a process map: every step of `order` (the map's walk,
 * `walkOrder`) said in plain words, grouped by phase, technical steps set apart.
 */
export function buildWalkGuide(source: string, model: ProcessMapModel, order: readonly string[]): WalkGuide {
  const r = readingOf(source);
  const byId = new Map(model.elements.map((e) => [e.id, e]));
  let engine = new Map<string, { text: string; anchors: WalkRange[] }>();
  try {
    const attached = attachTo(
      model.elements.map((e) => ({ id: e.id, anchor: e.anchor })),
      buildBusinessStatements(source),
    );
    engine = new Map([...attached].map(([id, s]) => [id, { text: s.text, anchors: s.anchors.map((a) => ({ lineStart: a.lineStart, lineEnd: a.lineEnd })) }]));
  } catch {
    engine = new Map();
  }

  const steps: Record<string, WalkGuideStep> = {};
  const phases: WalkPhase[] = [];
  const phaseIndex = new Map<string, WalkPhase>();
  const technical = new Map<WalkTechnicalGroup, string[]>();
  let mainSegment = 0;
  let lastWasMain = false;

  for (const id of order) {
    const element = byId.get(id);
    if (!element) continue;
    const body = bodyOf(r, element);
    const facts = factsOf(r, body);
    let composed: Omit<WalkGuideStep, 'id' | 'title' | 'phase' | 'technical' | 'engine' | 'anchor'>;
    let stopsOnly = false;
    try {
      if (isDecisionTag(element.tag)) {
        const d = decisionStep(r, element);
        stopsOnly = d.stopsOnly;
        composed = { happens: d.happens, ...(d.brief ? { brief: d.brief } : {}), matters: d.matters, decides: d.decides, data: d.data, ifGone: d.ifGone, plain: d.plain, role: d.role };
      } else {
        composed = activityStep(r, element, model, facts);
      }
    } catch {
      const anchor = element.anchor ? { ...element.anchor } : null;
      composed = {
        happens: { text: sentence(`It carries out “${element.label}”`), anchor },
        matters: { text: 'It is one part of the process, run every time the program reaches this point.', anchor },
        decides: [],
        data: null,
        ifGone: { text: 'This step and what it does would no longer happen.', anchor },
        plain: false,
        role: 'other',
      };
    }
    const group = technicalOf(r, element, facts, stopsOnly);

    const phaseHead = phaseOf(element, byId);
    let phaseId: string;
    let phaseLabel: string;
    if (phaseHead) {
      phaseId = phaseHead;
      phaseLabel = byId.get(phaseHead)?.label ?? 'Process';
      lastWasMain = false;
    } else {
      if (!lastWasMain) mainSegment += 1;
      lastWasMain = true;
      phaseId = `main-${mainSegment}`;
      phaseLabel = 'Main flow';
    }

    const step: WalkGuideStep = {
      id,
      title: element.label,
      phase: phaseId,
      technical: group,
      ...composed,
      engine: engine.get(id) ?? null,
      anchor: element.anchor ? { lineStart: element.anchor.lineStart, lineEnd: element.anchor.lineEnd } : null,
    };
    steps[id] = step;
    if (group) {
      technical.set(group, [...(technical.get(group) ?? []), id]);
      continue;
    }
    let phase = phaseIndex.get(phaseId);
    if (!phase) {
      phase = { id: phaseId, label: phaseLabel, stepIds: [] };
      phaseIndex.set(phaseId, phase);
      phases.push(phase);
    }
    phase.stepIds.push(id);
  }

  return {
    byId: steps,
    phases,
    business: phases.flatMap((p) => p.stepIds),
    technical: WALK_TECHNICAL_ORDER.filter((g) => technical.has(g)).map((g) => ({
      group: g,
      label: WALK_TECHNICAL_LABELS[g],
      why: WALK_TECHNICAL_WHY[g],
      stepIds: technical.get(g) ?? [],
    })),
  };
}

/** The share of walk steps with a plain sentence read from their own statements — what the 3.0.20 report measures. */
export function plainShare(guide: WalkGuide): { plain: number; total: number } {
  const all = Object.values(guide.byId);
  return { plain: all.filter((s) => s.plain).length, total: all.length };
}
