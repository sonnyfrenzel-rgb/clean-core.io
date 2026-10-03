import { buildProcessFacts, type ProcessFacts } from '@/lib/abap/process-facts';
import { containerAt, type Block } from '@/lib/abap/block-structure';
import type { AbapStatement, SourceRange } from '@/lib/abap/statement-reader';
import type { Branch } from '@/lib/abap/control-flow';
import { readLuwStates } from '@/lib/abap/luw-states';
import { readTableDependencies } from '@/lib/abap/table-dependencies';
import { conditionToPhrase, humaniseRoutine, plainContext, type PlainContext } from '@/lib/abap/plain-language';
import {
  anchorHolds,
  anchorList,
  quoteOf,
  sourceLines,
  type AcceptanceCriterion,
  type RequirementAnchor,
  type RequirementPriority,
} from '@/lib/functional-requirements';
import { sha256Hex } from '@/lib/artefact-digest';
import { BTP } from '@/lib/sap-naming';

/**
 * Non-functional requirements, read from the code (owner 03.10.2026: "rewrite
 * these too, so that it is no longer AI slop, with the right visualisations and
 * clear language").
 *
 * The Design stage used to show eight paragraphs a model wrote from the
 * design text — "Z-table migration strategy", "ensure robust monitoring" —
 * none of which named a line of the program. Most of those eight topics have
 * hooks in ABAP, and the engine already reads them:
 *
 *   - **Authorization** — every `AUTHORITY-CHECK`, its object, its fields and
 *     what the code does when it fails;
 *   - **Audit trail** — change documents, and rows written to a customer table
 *     with a date, a time or a user;
 *   - **Error handling** — messages that stop the run, failures the code
 *     tolerates with a warning, a BAPI's RETURN table, commit and rollback, a
 *     retry loop;
 *   - **Data migration** — the customer tables the program reads and writes,
 *     with the fields it writes;
 *   - **Retention** — deletions and archiving calls;
 *   - **Monitoring** — the application log, background jobs, the messages;
 *   - **Performance** — `SELECT *`, a `SELECT` inside a loop, a read without
 *     `WHERE`;
 *   - **Cutover** — what the program changes, what it calls remotely or in the
 *     update task, the workflow events it raises.
 *
 * Each becomes `NFR-nn` with one "The new solution shall …" sentence, the
 * reason in the code, line anchors with the lines quoted (an anchor that does
 * not hold drops the requirement), acceptance criteria where something can be
 * tested and a priority with its reason. Only code that an entry point
 * reaches counts; a signal in a routine nothing calls is listed as not
 * counted.
 *
 * What the code cannot know — service levels, volumes, retention periods,
 * monitoring tools, who holds a role, the cutover date — is a question
 * `TBD-nn` for the business or IT operations, with the line that prompts it.
 * Never a requirement, never a default.
 *
 * Pure: no model, no network, no clock.
 */

export const NFR_FORMAT_VERSION = 1 as const;

export type NfrCategory =
  | 'migration'
  | 'retention'
  | 'audit'
  | 'authorization'
  | 'errors'
  | 'monitoring'
  | 'performance'
  | 'cutover';

/** In the order the design model has always written them, so the reader finds the familiar eight. */
export const NFR_CATEGORIES: readonly NfrCategory[] = [
  'migration',
  'retention',
  'audit',
  'authorization',
  'errors',
  'monitoring',
  'performance',
  'cutover',
];

export const NFR_CATEGORY_LABEL: Readonly<Record<NfrCategory, string>> = {
  migration: 'Data migration',
  retention: 'Data retention & archiving',
  audit: 'Audit trail & compliance',
  authorization: 'Authorization',
  errors: 'Error handling & retry',
  monitoring: 'Monitoring',
  performance: 'Performance & service levels',
  cutover: 'Cutover & parallel operation',
};

/** What the design model writes, one text per topic (`projects/{id}.nonFunctionalRequirements`). */
export interface NFRData {
  dataMigration?: string;
  dataRetention?: string;
  auditTrail?: string;
  authorizationConcept?: string;
  errorHandling?: string;
  monitoring?: string;
  slaRequirements?: string;
  cutoverStrategy?: string;
}

/** The model's key for each category — the stored shape is unchanged. */
export const NFR_MODEL_KEY: Readonly<Record<NfrCategory, keyof NFRData>> = {
  migration: 'dataMigration',
  retention: 'dataRetention',
  audit: 'auditTrail',
  authorization: 'authorizationConcept',
  errors: 'errorHandling',
  monitoring: 'monitoring',
  performance: 'slaRequirements',
  cutover: 'cutoverStrategy',
};

export type NfrSignal =
  | 'authority-check'
  | 'change-document'
  | 'record-table'
  | 'stop-message'
  | 'tolerated-failure'
  | 'bapi-return'
  | 'unit-of-work'
  | 'retry'
  | 'customer-data-read'
  | 'customer-data-write'
  | 'deletion'
  | 'archiving'
  | 'application-log'
  | 'background-job'
  | 'messages'
  | 'select-star'
  | 'select-in-loop'
  | 'select-without-where'
  | 'changes'
  | 'remote-call'
  | 'update-task'
  | 'workflow-event';

export const NFR_SIGNAL_LABEL: Readonly<Record<NfrSignal, string>> = {
  'authority-check': 'AUTHORITY-CHECK',
  'change-document': 'Change documents',
  'record-table': 'Record table',
  'stop-message': 'Error messages',
  'tolerated-failure': 'sy-subrc checks',
  'bapi-return': 'BAPI RETURN',
  'unit-of-work': 'Commit / rollback',
  retry: 'Retry loop',
  'customer-data-read': 'Customer tables read',
  'customer-data-write': 'Customer table written',
  deletion: 'DELETE',
  archiving: 'Archiving',
  'application-log': 'Application log',
  'background-job': 'Background job',
  messages: 'MESSAGE',
  'select-star': 'SELECT *',
  'select-in-loop': 'SELECT in a loop',
  'select-without-where': 'SELECT without WHERE',
  changes: 'Writes',
  'remote-call': 'Remote call',
  'update-task': 'Update task',
  'workflow-event': 'Workflow event',
};

export interface NonFunctionalRequirement {
  /** `NFR-01`, by category, then by line. Stable for one source. */
  id: string;
  category: NfrCategory;
  /** The code signal it was read from. */
  signal: NfrSignal;
  /** One sentence, "The new solution shall …". */
  statement: string;
  /** "Because the program …", with lines. */
  rationale: string;
  /** Never empty — a requirement without an anchor that holds is dropped. */
  anchors: RequirementAnchor[];
  /** Zero to three; only where something can be tested. */
  acceptance: AcceptanceCriterion[];
  priority: RequirementPriority;
  priorityReason: string;
  /** Tables, function modules, authorization objects it names, upper-cased. */
  objects: string[];
  provenance: 'reconstructed';
}

export type NfrQuestionOwner = 'business' | 'it-operations';

export const NFR_OWNER_LABEL: Readonly<Record<NfrQuestionOwner, string>> = {
  business: 'Business',
  'it-operations': 'IT operations',
};

export interface NfrQuestion {
  /** `TBD-01` … — to be decided. */
  id: string;
  category: NfrCategory;
  owner: NfrQuestionOwner;
  /** A concrete question, one sentence. */
  question: string;
  /** What in the code prompts it, and why the code cannot answer it. */
  evidence: string;
  /** The lines that prompt it; empty only when the code is silent. */
  anchors: RequirementAnchor[];
  provenance: 'not-determined';
}

/** A signal the reader would expect counted, in a routine no entry point reaches. */
export interface NfrUnreached {
  category: NfrCategory;
  routine: string;
  line: number;
  what: string;
}

export type NfrCategoryStatus = 'grounded' | 'decision' | 'none';

export interface NfrCategorySummary {
  category: NfrCategory;
  label: string;
  grounded: number;
  questions: number;
  /** `grounded` when the code gave at least one requirement; `decision` when it gave only questions; `none` when neither. */
  status: NfrCategoryStatus;
  unreached: NfrUnreached[];
}

export interface NfrSet {
  formatVersion: typeof NFR_FORMAT_VERSION;
  program: string | null;
  sourceSha256: string;
  lineCount: number;
  requirements: NonFunctionalRequirement[];
  questions: NfrQuestion[];
  categories: NfrCategorySummary[];
  dropped: Array<{ ref: string; reason: string }>;
  counts: { total: number; must: number; should: number; could: number; questions: number; categoriesGrounded: number };
}

/* ------------------------------------------------------------------ text */

function joinAnd(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function lineRef(a: { lineStart: number; lineEnd: number }): string {
  return a.lineEnd > a.lineStart ? `L${a.lineStart}-${a.lineEnd}` : `L${a.lineStart}`;
}

function linesOf(ranges: Array<{ lineStart: number; lineEnd?: number }>): string {
  const seen = new Set<number>();
  const out: string[] = [];
  for (const r of ranges) {
    if (seen.has(r.lineStart)) continue;
    seen.add(r.lineStart);
    out.push(`L${r.lineStart}`);
  }
  return out.length > 6 ? `${out.slice(0, 6).join(', ')} and ${out.length - 6} more` : out.join(', ');
}

function lcFirst(text: string): string {
  if (!text) return text;
  if (/^[A-Z0-9_]{2,}\b/.test(text)) return text;
  return text[0].toLowerCase() + text.slice(1);
}

const q = (name: string) => `“${name}”`;

function isCustom(name: string): boolean {
  return /^[ZY]/i.test(name) || name.startsWith('/');
}

function unquote(token: string): string {
  return token.replace(/^'(.*)'$/, '$1').replace(/^`(.*)`$/, '$1').replace(/''/g, "'");
}

/* -------------------------------------------------------------- context */

interface Ctx {
  lines: string[];
  facts: ProcessFacts;
  plain: PlainContext;
  statements: AbapStatement[];
  unreachable: Set<string>;
  constants: Map<string, string>;
  messageClass: string | null;
  unreached: NfrUnreached[];
}

function anchor(ctx: Ctx, range: SourceRange | null | undefined): RequirementAnchor | null {
  if (!range) return null;
  return { lineStart: range.lineStart, lineEnd: range.lineEnd, quote: quoteOf(ctx.lines, range.lineStart, range.lineEnd) };
}

function anchors(ctx: Ctx, ranges: Array<SourceRange | null | undefined>, max = 8): RequirementAnchor[] {
  const seen = new Set<string>();
  const out: RequirementAnchor[] = [];
  for (const r of ranges) {
    const a = anchor(ctx, r);
    if (!a) continue;
    const key = `${a.lineStart}-${a.lineEnd}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  const covered = (a: RequirementAnchor) =>
    out.some((b) => b !== a && b.lineStart <= a.lineStart && b.lineEnd >= a.lineEnd && b.lineEnd - b.lineStart > a.lineEnd - a.lineStart);
  return out.filter((a) => !covered(a)).sort((a, b) => a.lineStart - b.lineStart).slice(0, max);
}

/** The routine a line stands in: the FORM, method or module, else the event block. */
function routineAt(ctx: Ctx, line: number): string | null {
  return containerAt(ctx.facts.structure.containers, line)?.name ?? null;
}

/**
 * Whether an entry point reaches this line. A line in a FORM no event block
 * reaches describes no current behaviour; it is recorded as not counted.
 */
function reached(ctx: Ctx, line: number, category: NfrCategory, what: string): boolean {
  const c = containerAt(ctx.facts.structure.containers, line);
  if (c && c.kind === 'form' && ctx.unreachable.has(c.name.toUpperCase())) {
    if (!ctx.unreached.some((u) => u.category === category && u.line === line)) {
      ctx.unreached.push({ category, routine: c.name.toUpperCase(), line, what });
    }
    return false;
  }
  return true;
}

function unreachedAt(ctx: Ctx, line: number): boolean {
  const c = containerAt(ctx.facts.structure.containers, line);
  return Boolean(c && c.kind === 'form' && ctx.unreachable.has(c.name.toUpperCase()));
}

function where(ctx: Ctx, line: number): string {
  const r = routineAt(ctx, line);
  return r ? q(humaniseRoutine(r)) : 'the program';
}

function statementIndexAt(ctx: Ctx, line: number): number {
  return ctx.statements.findIndex((s) => s.lineStart <= line && s.lineEnd >= line);
}

/** The innermost IF/CASE whose arm holds statement `index`, with that arm. */
function armAround(ctx: Ctx, index: number): { branch: Branch; arm: Branch['arms'][number] } | null {
  let best: { branch: Branch; arm: Branch['arms'][number] } | null = null;
  for (const branch of ctx.facts.control.branches) {
    if (index <= branch.openIndex || index >= branch.closeIndex) continue;
    if (best && branch.openIndex < best.branch.openIndex) continue;
    let chosen: Branch['arms'][number] | null = null;
    for (const arm of branch.arms) if (arm.headerIndex < index) chosen = arm;
    if (chosen) best = { branch, arm: chosen };
  }
  return best;
}

const SUBRC_FAILED = /\bsy-subrc\s*(?:<>|\bNE\b|>|\bGT\b)\s*0\b|\bsy-subrc\s*(?:=|\bEQ\b)\s*[1-9]/i;
const SUBRC_OK = /\bsy-subrc\s*(?:=|\bEQ\b)\s*0\b/i;

/** Whether this arm is the one the code takes when the statement before the IF failed. */
function isFailureArm(branch: Branch, arm: Branch['arms'][number]): boolean {
  if (arm.kind === 'else') return branch.arms.some((a) => a.kind === 'if' && SUBRC_OK.test(a.condition) && !/\bAND\b|\bOR\b/i.test(a.condition));
  return SUBRC_FAILED.test(arm.condition);
}

/** What the statement before an IF did, in a few words: "GUI_UPLOAD", "the read of EBAN". */
function operationBefore(ctx: Ctx, branch: Branch): { label: string; range: SourceRange } | null {
  const before = ctx.statements[branch.openIndex - 1];
  if (!before) return null;
  const text = before.text;
  let m = /^CALL\s+FUNCTION\s+'([^']+)'/i.exec(text);
  if (m) return { label: m[1].toUpperCase(), range: before };
  if (/^CALL\s+FUNCTION\b/i.test(text)) return { label: 'the dynamic function call', range: before };
  m = /^SELECT\b[\s\S]*?\bFROM\s+([\w/]+)/i.exec(text);
  if (m) return { label: `the read of ${m[1].toUpperCase()}`, range: before };
  m = /^(UPDATE|INSERT|MODIFY|DELETE)\s+(?:FROM\s+|INTO\s+)?([\w/]+)/i.exec(text);
  if (m) return { label: `the ${m[1].toUpperCase()} of ${m[2].toUpperCase()}`, range: before };
  if (/^CALL\s+TRANSACTION\b/i.test(text)) return { label: 'the transaction call', range: before };
  return null;
}

/* ---------------------------------------------------------------- messages */

interface MessageUse {
  index: number;
  range: SourceRange;
  type: 'E' | 'A' | 'X' | 'W' | 'S' | 'I';
  /** `E001`, or null when the message is a text or a variable. */
  code: string | null;
  messageClass: string | null;
  /** The first literal the statement carries, as plain words. */
  text: string | null;
}

function readMessages(ctx: Ctx): MessageUse[] {
  const out: MessageUse[] = [];
  ctx.statements.forEach((s, index) => {
    if (s.keyword !== 'MESSAGE') return;
    const text = s.text;
    let type: string | null = null;
    let code: string | null = null;
    let cls: string | null = null;
    let m = /^MESSAGE\s+([EAXWSI])(\d{3})(?:\(([\w/]+)\))?/i.exec(text);
    if (m) {
      type = m[1].toUpperCase();
      code = `${type}${m[2]}`;
      cls = m[3]?.toUpperCase() ?? ctx.messageClass;
    } else {
      m = /\bTYPE\s+'([EAXWSI])'/i.exec(text);
      if (m) type = m[1].toUpperCase();
      const id = /\bID\s+'([\w/]+)'[\s\S]*?\bNUMBER\s+'?(\d{3})/i.exec(text);
      if (id && type) {
        cls = id[1].toUpperCase();
        code = `${type}${id[2]}`;
      }
    }
    if (!type) return;
    // `DISPLAY LIKE 'E'` on a status message shows red and does not stop.
    const literal = /\bWITH\s+'((?:[^']|'')*)'/i.exec(text) ?? /^MESSAGE\s+'((?:[^']|'')*)'/i.exec(text);
    out.push({
      index,
      range: { lineStart: s.lineStart, lineEnd: s.lineEnd },
      type: type as MessageUse['type'],
      code,
      messageClass: cls,
      text: literal ? unquote(`'${literal[1]}'`).replace(/[:\s]+$/, '') : null,
    });
  });
  return out;
}

/** `CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'` → `BAPI_TRANSACTION_COMMIT`; `COMMIT WORK AND WAIT` stays. */
function tokenName(token: string): string {
  return token.replace(/^CALL\s+FUNCTION\s+/i, '').replace(/'/g, '').toUpperCase();
}

function messageName(m: MessageUse): string {
  return m.code ?? `a type ${m.type} message`;
}

/* ------------------------------------------------------------ the parts */

type Draft = Omit<NonFunctionalRequirement, 'id' | 'provenance'>;
type QDraft = Omit<NfrQuestion, 'id' | 'provenance'>;

interface Out {
  drafts: Draft[];
  questions: QDraft[];
}

/** Lines of messages already said by the authorization requirements, so the error list does not repeat them. */
type Claimed = Set<number>;

function authorization(ctx: Ctx, out: Out, claimed: Claimed, changes: Change[]): void {
  const checks = ctx.facts.calls.authorityChecks.filter((c) => reached(ctx, c.lineStart, 'authorization', `AUTHORITY-CHECK ${c.object ?? c.objectExpression}`));
  const byObject = new Map<string, typeof checks>();
  for (const check of checks) {
    const index = statementIndexAt(ctx, check.lineStart);
    // The reader unquotes the FIELD value; whether it was a literal is read off the statement.
    const literal = (id: string) => new RegExp(`\\bID\\s+'?${id}'?\\s+FIELD\\s+'`, 'i').test(check.text);
    const fields = check.fields.map((f) => (f.dummy ? `${f.id} (not checked)` : literal(f.id) ? `${f.id} '${f.value ?? ''}'` : `${f.id} from ${(f.value ?? '').toLowerCase()}`));
    if (!check.object) {
      out.questions.push({
        category: 'authorization',
        owner: 'it-operations',
        question: `Which authorization object does the check at L${check.lineStart} test?`,
        evidence: `The object is computed at run time (${check.objectExpression}); the code does not name it.`,
        anchors: anchors(ctx, [check]),
      });
      continue;
    }
    // What the code does when the check fails: the IF on sy-subrc right after it.
    let failure: { phrase: string; then: string; ranges: SourceRange[]; tested: boolean } = {
      phrase: '',
      then: 'the step does not run for this user',
      ranges: [],
      tested: false,
    };
    const next = ctx.statements[index + 1];
    if (next && /^CHECK\s+sy-subrc\s*(?:=|EQ)\s*0/i.test(next.text)) {
      failure = { phrase: `, and end ${where(ctx, check.lineStart)} when it fails`, then: `${where(ctx, check.lineStart)} ends`, ranges: [next], tested: true };
    } else if (next && next.keyword === 'IF' && SUBRC_FAILED.test(next.text)) {
      const branch = ctx.facts.control.branches.find((b) => b.openIndex === index + 1);
      const body = branch ? ctx.statements.slice(index + 2, branch.arms[1]?.headerIndex ?? branch.closeIndex) : [];
      const msg = body.find((s) => s.keyword === 'MESSAGE');
      const parsed = msg ? readMessages(ctx).find((m) => m.range.lineStart === msg.lineStart) : null;
      if (parsed && (parsed.type === 'E' || parsed.type === 'A' || parsed.type === 'X')) {
        failure = { phrase: `, and stop with message ${messageName(parsed)} when it fails`, then: `the run stops with message ${messageName(parsed)} (L${parsed.range.lineStart})`, ranges: [next, parsed.range], tested: true };
        claimed.add(parsed.range.lineStart);
      } else if (body.some((s) => /^(RETURN|EXIT|LEAVE|STOP)\b/i.test(s.text))) {
        failure = { phrase: `, and end ${where(ctx, check.lineStart)} when it fails`, then: `${where(ctx, check.lineStart)} ends`, ranges: [next], tested: true };
      } else {
        failure = { phrase: '', then: 'the code takes the path written for a failed check', ranges: [next], tested: true };
      }
    }
    const literalFields = fields.filter((f) => /'/.test(f));
    const fieldText = fields.length ? ` for ${joinAnd(fields)}` : '';
    out.drafts.push({
      category: 'authorization',
      signal: 'authority-check',
      statement: `The new solution shall check authorization object ${check.object}${fieldText}${failure.phrase}.`,
      rationale: failure.tested
        ? `Because ${where(ctx, check.lineStart)} checks ${check.object} at ${lineRef(check)} and tests the result right after it.`
        : `Because ${where(ctx, check.lineStart)} checks ${check.object} at ${lineRef(check)}. The code does not test the result (sy-subrc) right after the check.`,
      anchors: anchors(ctx, [check, ...failure.ranges]),
      acceptance: [{
        given: `a user without ${check.object}${literalFields.length ? ` for ${joinAnd(literalFields)}` : ''}`,
        when: `${where(ctx, check.lineStart)} runs`,
        then: failure.then,
      }],
      priority: 'must',
      priorityReason: `An authorization check written in the code (${lineRef(check)}).`,
      objects: [check.object],
    });
    if (!failure.tested) {
      out.questions.push({
        category: 'authorization',
        owner: 'business',
        question: `What shall happen when a user fails the ${check.object} check at L${check.lineStart}?`,
        evidence: 'The code does not test sy-subrc right after the check, so a failed check does not stop anything here.',
        anchors: anchors(ctx, [check]),
      });
    }
    const list = byObject.get(check.object) ?? [];
    list.push(check);
    byObject.set(check.object, list);
  }
  for (const [object, list] of byObject) {
    const fieldIds = [...new Set(list.flatMap((c) => c.fields.filter((f) => !f.dummy && f.id.toUpperCase() !== 'ACTVT').map((f) => f.id.toUpperCase())))];
    const activities = [...new Set(list.flatMap((c) => c.fields.filter((f) => f.id.toUpperCase() === 'ACTVT' && f.value).map((f) => `'${f.value!}'`)))];
    out.questions.push({
      category: 'authorization',
      owner: 'business',
      question: `Which business roles shall grant ${object}${activities.length ? ` with ACTVT ${activities.join(', ')}` : ''}${fieldIds.length ? `, and for which ${joinAnd(fieldIds)} values` : ''}?`,
      evidence: `The code checks ${object} at ${linesOf(list)}; who holds it is decided in role administration, not in the code.`,
      anchors: anchors(ctx, list),
    });
  }
  if (!checks.length && !ctx.facts.calls.authorityChecks.some((c) => !c.object)) {
    const shown = changes.slice(0, 4);
    out.questions.push({
      category: 'authorization',
      owner: 'business',
      question: shown.length
        ? `Who may ${shown.some((c) => c.kind === 'call') ? 'run this program and make its changes' : 'run this program'}, and which role grants it?`
        : 'Who may run this program, and which role grants it?',
      evidence: shown.length
        ? `The program itself contains no AUTHORITY-CHECK, yet it changes data: ${joinAnd(shown.map((c) => `${c.name} (L${c.range.lineStart})`))}. Whether a called SAP function checks on its own is not in this source.`
        : 'The program contains no AUTHORITY-CHECK, so the code says nothing about who may run it.',
      anchors: anchors(ctx, shown.map((c) => c.range)),
    });
  }
}

/* ---- changes: what the program writes or creates, shared by several parts */

interface Change {
  name: string;
  kind: 'table' | 'call' | 'transaction' | 'event';
  custom: boolean;
  keyword: string;
  range: SourceRange;
  index: number;
  text: string;
}

const CREATING_CALL = /(CREATE|CHANGE|POST|SAVE|UPDATE|DELETE|MAINTAIN|RELEASE|CANCEL|REVERSE|INSERT|MODIFY|SET_|_SET\b)/i;

/** `category` records what an unreached routine would have changed; `null` reads without recording. */
function readChanges(ctx: Ctx, category: NfrCategory | null): Change[] {
  const isReached = (line: number, what: string) => (category ? reached(ctx, line, category, what) : !unreachedAt(ctx, line));
  const out: Change[] = [];
  for (const w of ctx.facts.calls.databaseWrites) {
    if (!isReached(w.lineStart, `${w.keyword} ${w.table}`)) continue;
    out.push({ name: w.table, kind: 'table', custom: isCustom(w.table), keyword: w.keyword, range: w, index: statementIndexAt(ctx, w.lineStart), text: w.text });
  }
  for (const c of ctx.facts.calls.functionModules) {
    if (c.dynamic || !c.name) continue;
    if (/^BAPI_TRANSACTION_(COMMIT|ROLLBACK)$/.test(c.name)) continue;
    const isEvent = /^(SAP_WAPI_CREATE_EVENT|SWE_EVENT_CREATE|SAP_WAPI_START_WORKFLOW|SWW_WI_START_SIMPLE)$/.test(c.name);
    if (!isEvent && !(c.bapi && CREATING_CALL.test(c.name.replace(/^BAPI_/, '')))) continue;
    if (!isReached(c.lineStart, c.name)) continue;
    out.push({ name: c.name, kind: isEvent ? 'event' : 'call', custom: isCustom(c.name), keyword: 'CALL FUNCTION', range: c, index: statementIndexAt(ctx, c.lineStart), text: c.text });
  }
  for (const t of ctx.facts.calls.transactions) {
    if (!t.batchInput || !t.code) continue;
    if (!isReached(t.lineStart, `CALL TRANSACTION ${t.code}`)) continue;
    out.push({ name: t.code, kind: 'transaction', custom: isCustom(t.code), keyword: 'CALL TRANSACTION', range: t, index: statementIndexAt(ctx, t.lineStart), text: t.text });
  }
  return out.sort((a, b) => a.range.lineStart - b.range.lineStart);
}

/** The fields a write sets, and with which value, as far as the statements say. */
function writtenFields(ctx: Ctx, change: Change): Array<{ field: string; value: string; range: SourceRange }> {
  const text = change.text;
  const out: Array<{ field: string; value: string; range: SourceRange }> = [];
  const inline = /VALUE\s+#\(([\s\S]*)\)/i.exec(text);
  if (inline) {
    for (const m of inline[1].matchAll(/([\w/]+)\s*=\s*([^\s)]+)/g)) out.push({ field: m[1].toUpperCase(), value: m[2], range: change.range });
    return out;
  }
  const set = /^UPDATE\s+[\w/]+\s+SET\s+([\s\S]*?)(?:\bWHERE\b|$)/i.exec(text);
  if (set) {
    for (const m of set[1].matchAll(/([\w/]+)\s*=\s*('(?:[^']|'')*'|[\w/@-]+)/g)) out.push({ field: m[1].toUpperCase(), value: m[2], range: change.range });
    return out;
  }
  const from = /\b(?:FROM|VALUES)\s+(?!TABLE\b)@?([\w/]+)\s*$/i.exec(text);
  if (!from) return out;
  const wa = from[1].toLowerCase();
  const routine = containerAt(ctx.facts.structure.containers, change.range.lineStart);
  const pattern = new RegExp(`^${wa.replace(/[/]/g, '\\/')}-([\\w/]+)\\s*=\\s*(.+)$`, 'i');
  for (let i = change.index - 1; i >= 0; i--) {
    const s = ctx.statements[i];
    if (routine && s.lineStart < routine.lineStart) break;
    if (/^(CLEAR|FREE)\s/i.test(s.text) && new RegExp(`\\b${wa}\\b`, 'i').test(s.text)) break;
    const m = pattern.exec(s.text);
    if (m && !out.some((f) => f.field === m[1].toUpperCase())) out.unshift({ field: m[1].toUpperCase(), value: m[2].trim(), range: s });
  }
  return out;
}

const STAMP_VALUE = /^sy-(datum|uzeit|uname|timlo|datlo|zonlo)$|utclong_current|cl_abap_context_info=>get_system_(date|time)|cl_abap_context_info=>get_user/i;
const STAMP_FIELD = /^(ERDAT|ERZET|ERNAM|AEDAT|AEZET|AENAM|CREATED_?(AT|ON|BY)|CHANGED_?(AT|ON|BY)|TIMESTAMP|TSTMP|UNAME|USNAM|CPUDT|CPUTM)$/;

function performCallersOf(ctx: Ctx, routine: string | null): SourceRange[] {
  if (!routine) return [];
  return ctx.facts.calls.performs.filter((p) => p.target === routine && reached(ctx, p.lineStart, 'audit', `PERFORM ${routine}`));
}

function audit(ctx: Ctx, out: Out, changes: Change[]): void {
  // Change documents.
  const changeDocs = ctx.facts.calls.functionModules.filter((c) => c.name && /^CHANGEDOCUMENT_|_WRITE_DOCUMENT$/.test(c.name) && reached(ctx, c.lineStart, 'audit', c.name!));
  if (changeDocs.length) {
    const names = [...new Set(changeDocs.map((c) => c.name!))];
    out.drafts.push({
      category: 'audit',
      signal: 'change-document',
      statement: `The new solution shall write change documents where the program writes them today (${joinAnd(names)}).`,
      rationale: `Because the program calls ${joinAnd(names)} at ${linesOf(changeDocs)}.`,
      anchors: anchors(ctx, changeDocs),
      acceptance: [{ given: 'a change the program records today', when: 'the new solution makes it', then: 'a change document with the old and the new value exists' }],
      priority: 'must',
      priorityReason: `The code records changes for traceability (${linesOf(changeDocs)}).`,
      objects: names,
    });
  }
  // Rows written to a customer table with a date, a time or a user.
  let recorded = false;
  const seen = new Set<string>();
  for (const w of changes) {
    if (w.kind !== 'table' || !w.custom || !/INSERT|MODIFY/.test(w.keyword) || seen.has(w.name)) continue;
    const fields = writtenFields(ctx, w);
    const stamps = fields.filter((f) => STAMP_VALUE.test(f.value.trim()) || STAMP_FIELD.test(f.field));
    // A creation date alone dates a row; a record of what happened carries a time or a user as well.
    const timeOrUser = stamps.some((f) => /uzeit|timlo|uname|utclong|time|user/i.test(f.value) || /ERZET|AEZET|NAM$|_BY$|UNAME|USNAM|TIMESTAMP|TSTMP|CPUTM/.test(f.field));
    if (!timeOrUser) continue;
    seen.add(w.name);
    recorded = true;
    const routine = routineAt(ctx, w.range.lineStart);
    const callers = performCallersOf(ctx, routine);
    const content = fields.filter((f) => f.field !== 'MANDT' && !stamps.includes(f)).map((f) => f.field);
    const when = stamps.map((f) => f.field);
    const hasUser = fields.some((f) => /^sy-uname$/i.test(f.value.trim()) || /NAM$|_BY$|UNAME|USNAM/.test(f.field));
    out.drafts.push({
      category: 'audit',
      signal: 'record-table',
      statement: `The new solution shall keep a record in ${w.name} of ${content.length ? joinAnd(content) : 'each case'} with ${joinAnd(when)}, wherever the program writes one today.`,
      rationale: `Because ${routine ? q(humaniseRoutine(routine)) : 'the program'} ${w.keyword === 'INSERT' ? 'inserts' : 'writes'} this row at ${lineRef(w.range)}${callers.length ? `, called from ${callers.length} place${callers.length === 1 ? '' : 's'} (${linesOf(callers)})` : ''}, and fills ${joinAnd(stamps.map((s) => `${s.field} with ${s.value}`))}.`,
      anchors: anchors(ctx, [w.range, ...stamps.map((s) => s.range), ...callers.slice(0, 4)]),
      acceptance: [{
        given: 'a run that reaches one of these places',
        when: 'it ends',
        then: `one row in ${w.name} (or its successor) holds ${joinAnd([...content.slice(0, 4), ...when])}`,
      }],
      priority: 'should',
      priorityReason: 'The code keeps a dated record of what happened; whether it is a legal audit record is not in the code.',
      objects: [w.name],
    });
    if (!hasUser) {
      out.questions.push({
        category: 'audit',
        owner: 'business',
        question: `Must the record in ${w.name} also say who ran the program?`,
        evidence: `The row written at L${w.range.lineStart} carries ${joinAnd(fields.map((f) => f.field))}; none of them is filled with the user (sy-uname).`,
        anchors: anchors(ctx, [w.range]),
      });
    }
  }
  // SAP tables changed directly, with no change document beside them.
  if (!changeDocs.length) {
    const standard = new Map<string, Change[]>();
    for (const w of changes) {
      if (w.kind !== 'table' || w.custom) continue;
      const list = standard.get(w.name) ?? [];
      list.push(w);
      standard.set(w.name, list);
    }
    for (const [name, list] of standard) {
      out.questions.push({
        category: 'audit',
        owner: 'business',
        question: `Must the changes this program makes to ${name} be traceable — who changed what, and when?`,
        evidence: `The program changes ${name} directly (${list.map((w) => `${w.keyword} at L${w.range.lineStart}`).join(', ')}) and writes no change document.`,
        anchors: anchors(ctx, list.map((w) => w.range)),
      });
    }
    const created = changes.filter((c) => c.kind === 'call' || c.kind === 'transaction');
    if (!recorded && !standard.size && created.length) {
      out.questions.push({
        category: 'audit',
        owner: 'business',
        question: `Must it be traceable who created or changed documents through this program (${joinAnd([...new Set(created.map((c) => c.name))].slice(0, 3))})?`,
        evidence: `The program keeps no record of its own of the call${created.length === 1 ? '' : 's'} at ${linesOf(created.map((c) => c.range))}.`,
        anchors: anchors(ctx, created.map((c) => c.range)),
      });
    }
  }
}

function errors(ctx: Ctx, out: Out, claimed: Claimed, messages: MessageUse[]): void {
  // Messages that stop the run.
  const stops = messages.filter((m) => (m.type === 'E' || m.type === 'A' || m.type === 'X') && !claimed.has(m.range.lineStart) && reached(ctx, m.range.lineStart, 'errors', `MESSAGE ${messageName(m)}`));
  if (stops.length) {
    const groups = new Map<string, MessageUse[]>();
    for (const m of stops) {
      const key = `${m.code ?? ''}|${m.text ?? ''}`;
      const list = groups.get(key) ?? [];
      list.push(m);
      groups.set(key, list);
    }
    const cases = [...groups.values()].map((list) => {
      const m = list[0];
      return m.text ? `${lcFirst(m.text)} (${messageName(m)})` : messageName(m);
    });
    const shown = cases.length > 5 ? [...cases.slice(0, 5), `${cases.length - 5} more`] : cases;
    out.drafts.push({
      category: 'errors',
      signal: 'stop-message',
      statement: `The new solution shall stop and say why when: ${shown.join('; ')}.`,
      rationale: `Because the program stops with an error message at ${linesOf(stops.map((m) => m.range))}.`,
      anchors: anchors(ctx, stops.flatMap((m) => {
        const around = armAround(ctx, m.index);
        return [around ? ctx.statements[around.arm.headerIndex] : null, m.range];
      })),
      acceptance: [...groups.values()].slice(0, 3).map((list) => ({
        given: list[0].text ? lcFirst(list[0].text) : `the condition before L${list[0].range.lineStart} holds`,
        when: `${where(ctx, list[0].range.lineStart)} runs`,
        then: `the run stops with message ${messageName(list[0])} and no later step runs`,
      })),
      priority: 'must',
      priorityReason: `The code ends the run with an error message here (${linesOf(stops.map((m) => m.range))}).`,
      objects: [],
    });
  }
  // Failures the code tolerates: a warning right after a failed call.
  const tolerated: Array<{ m: MessageUse; op: { label: string; range: SourceRange }; header: SourceRange }> = [];
  for (const m of messages) {
    if (m.type !== 'W' && m.type !== 'I' && m.type !== 'S') continue;
    const around = armAround(ctx, m.index);
    if (!around || !isFailureArm(around.branch, around.arm)) continue;
    const op = operationBefore(ctx, around.branch);
    if (!op) continue;
    if (!reached(ctx, m.range.lineStart, 'errors', `${op.label} with ${messageName(m)}`)) continue;
    tolerated.push({ m, op, header: ctx.statements[around.arm.headerIndex] ?? m.range });
  }
  if (tolerated.length) {
    const items = tolerated.map((t) => `${t.op.label} fails (${t.m.text ? `${q(t.m.text)}, ` : ''}${messageName(t.m)})`);
    out.drafts.push({
      category: 'errors',
      signal: 'tolerated-failure',
      statement: `The new solution shall carry on and warn when ${joinAnd(items.slice(0, 5))}${items.length > 5 ? `, and in ${items.length - 5} more cases` : ''}.`,
      rationale: `Because the program tests sy-subrc after each of these and continues with a ${[...new Set(tolerated.map((t) => (t.m.type === 'W' ? 'warning' : t.m.type === 'I' ? 'information' : 'status')))].join(' or ')} message (${linesOf(tolerated.map((t) => t.m.range))}).`,
      anchors: anchors(ctx, tolerated.flatMap((t) => [t.op.range, t.m.range])),
      acceptance: tolerated.slice(0, 3).map((t) => ({
        given: `${t.op.label} fails`,
        when: `${where(ctx, t.m.range.lineStart)} runs`,
        then: `the run continues and shows ${messageName(t.m)}`,
      })),
      priority: 'should',
      priorityReason: 'The code decides that these failures do not stop the run; the business may decide otherwise.',
      objects: [...new Set(tolerated.map((t) => t.op.label).filter((l) => /^[A-Z0-9_/]+$/.test(l)))],
    });
  }
  // A BAPI's RETURN table: read for errors, or not.
  for (const call of ctx.facts.calls.functionModules) {
    if (!call.bapi || !call.name || /^BAPI_TRANSACTION_/.test(call.name)) continue;
    const ret = /\breturn\s*=\s*([\w/-]+)/i.exec(call.text);
    if (!ret) continue;
    if (!reached(ctx, call.lineStart, 'errors', `${call.name} RETURN`)) continue;
    const table = ret[1].toLowerCase();
    const index = statementIndexAt(ctx, call.lineStart);
    const routine = containerAt(ctx.facts.structure.containers, call.lineStart);
    const after: AbapStatement[] = [];
    for (let i = index + 1; i < ctx.statements.length; i++) {
      const s = ctx.statements[i];
      if (routine && s.lineStart > routine.lineEnd) break;
      after.push(s);
    }
    const named = new RegExp(`(^|[^\\w-])${table.replace(/[/]/g, '\\/')}(?![\\w])`, 'i');
    const reads = after.filter((s) => named.test(s.text) && /\btype\b/i.test(s.text));
    if (reads.length) {
      const types = [...new Set(reads.flatMap((s) => [...s.text.matchAll(/\btype\s*(?:=|EQ)\s*'([EAXWSI])'/gi)].map((m) => m[1].toUpperCase())))];
      const kinds = types.length ? types.join(' or ') : 'error';
      out.drafts.push({
        category: 'errors',
        signal: 'bapi-return',
        statement: `The new solution shall treat a message of type ${kinds} returned by ${call.name} as a failure.`,
        rationale: `Because the program reads ${table.toUpperCase()} for type ${kinds} right after the call (${linesOf(reads)}).`,
        anchors: anchors(ctx, [call, ...reads.slice(0, 2)]),
        acceptance: [{ given: `${call.name} returns a message of type ${types[0] ?? 'E'}`, when: `${where(ctx, call.lineStart)} runs`, then: 'the run takes the failure path the program takes, not the success path' }],
        priority: 'must',
        priorityReason: `A BAPI reports failure only in its RETURN table; the code reads it (${linesOf(reads)}).`,
        objects: [call.name],
      });
    } else if (!after.some((s) => named.test(s.text))) {
      out.questions.push({
        category: 'errors',
        owner: 'business',
        question: `What shall happen when ${call.name} reports an error?`,
        evidence: `The program passes ${table.toUpperCase()} as RETURN at L${call.lineStart} and does not read it afterwards in ${where(ctx, call.lineStart)}.`,
        anchors: anchors(ctx, [call]),
      });
    }
  }
  // Commit and rollback.
  const luw = readLuwStates(ctx.facts);
  const events = luw.events.filter((e) => reached(ctx, e.lineStart, 'errors', e.token));
  const paired = new Set<number>();
  for (const commit of events.filter((e) => e.kind === 'commit')) {
    const index = statementIndexAt(ctx, commit.lineStart);
    const around = armAround(ctx, index);
    if (!around) continue;
    const rollback = events.find((e) => {
      if (e.kind !== 'rollback') return false;
      const other = armAround(ctx, statementIndexAt(ctx, e.lineStart));
      return other && other.branch.id === around.branch.id && other.arm.headerIndex !== around.arm.headerIndex;
    });
    if (!rollback) continue;
    paired.add(commit.lineStart);
    paired.add(rollback.lineStart);
    const condition = around.arm.condition;
    const phrase = condition ? conditionToPhrase(condition, ctx.plain, commit.lineStart).trim() : '';
    const cond = phrase && !/^condition met\??$/i.test(phrase) ? `${lcFirst(phrase)} (${condition})` : condition ? `${condition} holds` : 'the other case does not hold';
    out.drafts.push({
      category: 'errors',
      signal: 'unit-of-work',
      statement: `The new solution shall save the changes of ${where(ctx, commit.lineStart)} only when ${cond}, and undo them otherwise.`,
      rationale: `Because the program commits with ${tokenName(commit.token)} at L${commit.lineStart}${commit.andWait ? ' and waits for the update' : ''}, and rolls back with ${tokenName(rollback.token)} at L${rollback.lineStart} in the other branch.`,
      anchors: anchors(ctx, [ctx.statements[around.branch.openIndex], commit, rollback]),
      acceptance: [
        { given: cond, when: `${where(ctx, commit.lineStart)} runs`, then: 'the changes are saved' },
        { given: 'the condition does not hold', when: `${where(ctx, commit.lineStart)} runs`, then: 'nothing of this step is saved' },
      ],
      priority: 'must',
      priorityReason: `The code decides here whether changes are kept or undone (L${commit.lineStart}, L${rollback.lineStart}).`,
      objects: [],
    });
  }
  const commits = events.filter((e) => e.kind === 'commit');
  if (commits.length > 1) {
    out.questions.push({
      category: 'errors',
      owner: 'it-operations',
      question: 'Which changes must be saved together, and what does a restart after a failure do?',
      evidence: `The program saves in ${commits.length} places in one run (${commits.map((c) => `${tokenName(c.token)} at L${c.lineStart}`).join(', ')}); a failure after the first leaves the earlier changes saved.`,
      anchors: anchors(ctx, commits),
    });
  }
  // A retry loop: WAIT UP TO inside DO n TIMES.
  let retried = false;
  ctx.statements.forEach((s, index) => {
    const wait = /^WAIT\s+UP\s+TO\s+(\d+)\s+SECONDS?/i.exec(s.text);
    if (!wait) return;
    const loop = [...(ctx.facts.structure.enclosing[index] ?? [])].reverse().find((b: Block) => b.kind === 'do' || b.kind === 'while');
    if (!loop) return;
    const head = ctx.statements[loop.openIndex];
    const body = ctx.statements.slice(loop.openIndex + 1, loop.closeIndex);
    const call = body.find((b) => /^CALL\s+FUNCTION\b/i.test(b.text));
    const name = call ? (/^CALL\s+FUNCTION\s+'([^']+)'/i.exec(call.text)?.[1] ?? 'the call').toUpperCase() : 'the step';
    if (!reached(ctx, s.lineStart, 'errors', `retry of ${name}`)) return;
    retried = true;
    const times = /^DO\s+(\d+)\s+TIMES/i.exec(head.text)?.[1];
    const after = ctx.statements[loop.closeIndex + 1];
    const giveUp = after && after.keyword === 'MESSAGE' ? readMessages(ctx).find((m) => m.range.lineStart === after.lineStart) : null;
    out.drafts.push({
      category: 'errors',
      signal: 'retry',
      statement: `The new solution shall retry ${name}${times ? ` up to ${times} times` : ''}, ${wait[1]} second${wait[1] === '1' ? '' : 's'} apart${giveUp ? `, and then stop with message ${messageName(giveUp)}` : ''}.`,
      rationale: `Because ${where(ctx, s.lineStart)} repeats ${name} in a loop (${lineRef(head)}) with WAIT UP TO ${wait[1]} SECONDS (L${s.lineStart}).`,
      anchors: anchors(ctx, [head, call ?? null, s, giveUp?.range ?? null]),
      acceptance: [{ given: `${name} fails every time`, when: `${where(ctx, s.lineStart)} runs`, then: `it is tried ${times ?? 'repeatedly'} times${giveUp ? ` and the run stops with ${messageName(giveUp)}` : ''}` }],
      priority: 'should',
      priorityReason: 'The code tolerates a temporary failure by trying again; the count and the pause are values the business can change.',
      objects: call ? [name] : [],
    });
  });
  if (!retried) {
    const outward = ctx.facts.calls.functionModules.filter((c) => c.name && !/^BAPI_TRANSACTION_/.test(c.name) && (c.bapi || c.destination || c.startingNewTask) && reached(ctx, c.lineStart, 'errors', c.name));
    if (outward.length) {
      const names = [...new Set(outward.map((c) => c.name!))];
      out.questions.push({
        category: 'errors',
        owner: 'it-operations',
        question: `Shall a failed call of ${joinAnd(names.slice(0, 3))}${names.length > 3 ? ' (and the others)' : ''} be retried — how often, and how far apart?`,
        evidence: `The program calls ${names.length === 1 ? 'it' : 'each'} once (${linesOf(outward)}), with no retry loop around it.`,
        anchors: anchors(ctx, outward.slice(0, 4)),
      });
    }
  }
}

function migration(ctx: Ctx, out: Out, changes: Change[]): void {
  const deps = readTableDependencies(ctx.lines.join('\n')).dependencies;
  const reads = new Map<string, number[]>();
  for (const d of deps) {
    if (d.access !== 'read' || d.possibleTargetOf || !isCustom(d.table)) continue;
    if (!reached(ctx, d.line, 'migration', `read of ${d.table}`)) continue;
    const list = reads.get(d.table.toUpperCase()) ?? [];
    if (!list.includes(d.line)) list.push(d.line);
    reads.set(d.table.toUpperCase(), list);
  }
  const written = new Map<string, Change[]>();
  for (const w of changes) {
    if (w.kind !== 'table' || !w.custom) continue;
    const list = written.get(w.name) ?? [];
    list.push(w);
    written.set(w.name, list);
  }
  const readOnly = [...reads].filter(([name]) => !written.has(name));
  if (readOnly.length) {
    out.drafts.push({
      category: 'migration',
      signal: 'customer-data-read',
      statement: `The new solution shall have the content of the customer table${readOnly.length === 1 ? '' : 's'} the program reads: ${joinAnd(readOnly.map(([n]) => n))}.`,
      rationale: `Because the program reads ${readOnly.map(([n, l]) => `${n} at ${l.map((x) => `L${x}`).join(', ')}`).join('; ')}; what is in ${readOnly.length === 1 ? 'it' : 'them'} is not in the code.`,
      anchors: anchors(ctx, readOnly.flatMap(([, l]) => l.map((x) => ({ lineStart: x, lineEnd: x })))),
      acceptance: [{ given: 'the content is taken over', when: 'the new solution processes the same case as the program', then: 'it reads the same values and decides the same way' }],
      priority: 'must',
      priorityReason: 'The program’s logic reads these tables; without their content it cannot run.',
      objects: readOnly.map(([n]) => n),
    });
    out.questions.push({
      category: 'migration',
      owner: 'business',
      question: `Who maintains ${joinAnd(readOnly.map(([n]) => n))} after the switch, and is the current content still correct?`,
      evidence: `The program only reads ${readOnly.length === 1 ? 'this table' : 'these tables'} (${linesOf(readOnly.flatMap(([, l]) => l.map((x) => ({ lineStart: x }))))}); who fills ${readOnly.length === 1 ? 'it' : 'them'} is not in this source.`,
      anchors: anchors(ctx, readOnly.flatMap(([, l]) => l.map((x) => ({ lineStart: x, lineEnd: x })))),
    });
  }
  for (const [name, list] of written) {
    const fields = [...new Set(list.flatMap((w) => writtenFields(ctx, w).map((f) => f.field)))];
    out.drafts.push({
      category: 'migration',
      signal: 'customer-data-write',
      statement: fields.length
        ? `The new solution shall hold what the program writes to ${name} — ${joinAnd(fields)} — so the existing rows can be taken over.`
        : `The new solution shall hold what the program writes to ${name}, so the existing rows can be taken over.`,
      rationale: `Because the program writes ${name} at ${linesOf(list.map((w) => w.range))}${fields.length ? '' : '; the fields are not named at these lines'}.`,
      anchors: anchors(ctx, list.map((w) => w.range)),
      acceptance: fields.length ? [{ given: 'the rows of today', when: 'they are taken over', then: `every row keeps ${joinAnd(fields.slice(0, 6))}` }] : [],
      priority: 'should',
      priorityReason: 'The program’s own data; whether the old rows are needed is a decision (see the questions).',
      objects: [name],
    });
    out.questions.push({
      category: 'migration',
      owner: 'business',
      question: `Which existing rows of ${name} must be taken over — all, or only from a certain date?`,
      evidence: `The program writes ${name} at ${linesOf(list.map((w) => w.range))}; how many rows exist and which are still needed is not in the code.`,
      anchors: anchors(ctx, list.map((w) => w.range)),
    });
  }
  for (const u of readTableDependencies(ctx.lines.join('\n')).unresolved) {
    if (u.access !== 'write' || !reached(ctx, u.line, 'migration', `write to (${u.expression})`)) continue;
    out.questions.push({
      category: 'migration',
      owner: 'it-operations',
      question: `Which table does the program write at L${u.line}?`,
      evidence: `The table name is computed (${u.expression})${u.possible.length ? `; the source shows ${joinAnd(u.possible)} as possible values` : ''}.`,
      anchors: anchors(ctx, [{ lineStart: u.line, lineEnd: u.line }]),
    });
  }
}

function retention(ctx: Ctx, out: Out, changes: Change[]): void {
  const deletes = changes.filter((w) => w.kind === 'table' && w.keyword === 'DELETE');
  for (const d of deletes) {
    const cond = /\bWHERE\b\s+([\s\S]+)$/i.exec(d.text)?.[1];
    out.drafts.push({
      category: 'retention',
      signal: 'deletion',
      statement: `The new solution shall delete rows of ${d.name}${cond ? ` where ${cond}` : ''}, as the program does.`,
      rationale: `Because ${where(ctx, d.range.lineStart)} deletes from ${d.name} at ${lineRef(d.range)}.`,
      anchors: anchors(ctx, [d.range]),
      acceptance: [{ given: `rows of ${d.name}${cond ? ` with ${cond}` : ''}`, when: `${where(ctx, d.range.lineStart)} runs`, then: 'they no longer exist' }],
      priority: d.custom ? 'should' : 'must',
      priorityReason: d.custom ? 'The program removes its own data here.' : `The program deletes SAP data directly (${lineRef(d.range)}).`,
      objects: [d.name],
    });
  }
  const archive = ctx.facts.calls.functionModules.filter((c) => c.name && /^ARCHIVE_/.test(c.name) && reached(ctx, c.lineStart, 'retention', c.name!));
  if (archive.length) {
    const object = archive.map((c) => /\bobject\s*=\s*'([^']+)'/i.exec(c.text)?.[1]).find(Boolean);
    out.drafts.push({
      category: 'retention',
      signal: 'archiving',
      statement: `The new solution shall archive ${object ? `with archiving object ${object.toUpperCase()}` : 'the data the program archives'}.`,
      rationale: `Because the program calls ${joinAnd([...new Set(archive.map((c) => c.name!))])} at ${linesOf(archive)}.`,
      anchors: anchors(ctx, archive),
      acceptance: [],
      priority: 'should',
      priorityReason: 'The code archives data; the residence and retention times are set outside the code.',
      objects: [...new Set(archive.map((c) => c.name!))],
    });
  }
  const seen = new Set<string>();
  for (const w of changes) {
    if (w.kind !== 'table' || !w.custom || w.keyword === 'DELETE' || seen.has(w.name)) continue;
    seen.add(w.name);
    const dated = writtenFields(ctx, w).find((f) => /^sy-(datum|datlo)$|utclong_current/i.test(f.value.trim()));
    const deletes = changes.some((d) => d.name === w.name && d.keyword === 'DELETE');
    out.questions.push({
      category: 'retention',
      owner: 'business',
      question: `How long must rows of ${w.name} be kept, and what happens to them after that?`,
      evidence: `The program writes them at L${w.range.lineStart}${dated ? ` with the date in ${dated.field} (L${dated.range.lineStart})` : ''}${deletes ? '' : ' and deletes none'}; a retention period is not in the code.`,
      anchors: anchors(ctx, [w.range, dated?.range ?? null]),
    });
  }
}

function monitoring(ctx: Ctx, out: Out, messages: MessageUse[]): void {
  const bal = ctx.facts.calls.functionModules.filter((c) => c.name && /^BAL_/.test(c.name) && reached(ctx, c.lineStart, 'monitoring', c.name!));
  if (bal.length) {
    const objectLine = ctx.statements.find((s) => /-object\s*=\s*'([^']+)'/i.test(s.text) && bal.some((b) => routineAt(ctx, b.lineStart) === routineAt(ctx, s.lineStart)));
    const object = objectLine ? /-object\s*=\s*'([^']+)'/i.exec(objectLine.text)![1].toUpperCase() : null;
    const saves = bal.some((c) => /^BAL_DB_SAVE/.test(c.name!));
    out.drafts.push({
      category: 'monitoring',
      signal: 'application-log',
      statement: `The new solution shall write an application log${object ? ` under log object ${object}` : ''} where the program writes one${saves ? ', and save it' : ''}.`,
      rationale: `Because the program calls ${joinAnd([...new Set(bal.map((c) => c.name!))])} at ${linesOf(bal)}.`,
      anchors: anchors(ctx, [...bal, objectLine ?? null]),
      acceptance: [{ given: 'a run', when: 'it ends', then: `its messages can be read in the application log${object ? ` (object ${object})` : ''}` }],
      priority: 'should',
      priorityReason: 'The code keeps a log operations can read after the run.',
      objects: [...new Set(bal.map((c) => c.name!))],
    });
  }
  const jobs = ctx.facts.calls.functionModules.filter((c) => c.name && /^JOB_(OPEN|SUBMIT|CLOSE)$/.test(c.name) && reached(ctx, c.lineStart, 'monitoring', c.name!));
  const viaJob = ctx.facts.calls.submits.filter((s) => s.viaJob && reached(ctx, s.lineStart, 'monitoring', `SUBMIT ${s.program ?? s.programExpression}`));
  if (jobs.length || viaJob.length) {
    const jobName = jobs.map((c) => /\bjobname\s*=\s*('(?:[^']|'')*'|[\w-]+)/i.exec(c.text)?.[1]).find(Boolean);
    const programs = [...new Set(viaJob.map((s) => s.program ?? s.programExpression))];
    out.drafts.push({
      category: 'monitoring',
      signal: 'background-job',
      statement: `The new solution shall run ${programs.length ? joinAnd(programs.map((p) => p.toUpperCase())) : 'the scheduled step'} as a background job${jobName && /^'/.test(jobName) ? ` (${unquote(jobName)})` : ''}, as the program does.`,
      rationale: `Because the program schedules a job at ${linesOf([...jobs, ...viaJob])}.`,
      anchors: anchors(ctx, [...jobs, ...viaJob]),
      acceptance: [],
      priority: 'should',
      priorityReason: 'Work the program hands to a job runs without a user watching it.',
      objects: [...new Set(jobs.map((c) => c.name!))],
    });
    out.questions.push({
      category: 'monitoring',
      owner: 'it-operations',
      question: 'Who watches the job, and who is told when it fails?',
      evidence: `The program schedules a job at ${linesOf([...jobs, ...viaJob])}; its monitoring is set up outside the code.`,
      anchors: anchors(ctx, [...jobs, ...viaJob].slice(0, 3)),
    });
  }
  const reachedMessages = messages.filter((m) => reached(ctx, m.range.lineStart, 'monitoring', `MESSAGE ${messageName(m)}`));
  if (reachedMessages.length) {
    const codes = new Map<string, MessageUse>();
    for (const m of reachedMessages) {
      const key = m.code ?? `${m.type}:${m.text ?? m.range.lineStart}`;
      if (!codes.has(key)) codes.set(key, m);
    }
    const all = [...codes.values()];
    const named = (types: string[]) => all.filter((m) => types.includes(m.type));
    const groups = [
      { list: named(['E', 'A', 'X']), one: 'stops the run', many: 'stop the run' },
      { list: named(['W']), one: 'warns', many: 'warn' },
      { list: named(['S', 'I']), one: 'reports a status', many: 'report a status' },
    ].filter((g) => g.list.length);
    const classes = [...new Set(all.map((m) => m.messageClass).filter((c): c is string => Boolean(c)))];
    const parts = groups.map((g) => `${g.list.length} that ${g.list.length === 1 ? g.one : g.many} (${g.list.map(messageName).slice(0, 5).join(', ')}${g.list.length > 5 ? ', …' : ''})`);
    out.drafts.push({
      category: 'monitoring',
      signal: 'messages',
      statement: `The new solution shall report the same outcomes the program reports with messages${classes.length ? ` of class ${joinAnd(classes)}` : ''}: ${joinAnd(parts)}.`,
      rationale: `Because the program issues these messages at ${linesOf(reachedMessages.map((m) => m.range))}; a user or a job log sees them.`,
      anchors: anchors(ctx, all.map((m) => m.range)),
      acceptance: all.filter((m) => m.text).slice(0, 2).map((m) => ({
        given: lcFirst(m.text!),
        when: `${where(ctx, m.range.lineStart)} runs`,
        then: `the outcome is reported${m.code ? ` with the meaning of ${m.code}` : ''}`,
      })),
      priority: 'should',
      priorityReason: 'These messages are how a user or operations learns what a run did.',
      objects: classes,
    });
  }
  if (!bal.length) {
    const writes = ctx.statements.filter((s) => s.keyword === 'WRITE' && reached(ctx, s.lineStart, 'monitoring', 'WRITE'));
    const prompts = reachedMessages.length ? reachedMessages.map((m) => m.range) : writes.map((s) => ({ lineStart: s.lineStart, lineEnd: s.lineEnd }));
    out.questions.push({
      category: 'monitoring',
      owner: 'it-operations',
      question: 'Where must operations see that a run failed, and who is alerted?',
      evidence: reachedMessages.length
        ? `The program writes no application log; it reports with ${reachedMessages.length} MESSAGE statement${reachedMessages.length === 1 ? '' : 's'} (${linesOf(prompts)}), which a user sees on screen and a background run leaves in its job log.`
        : writes.length
          ? `The program writes no application log and issues no message; it reports only in its list output (WRITE at ${linesOf(prompts)}).`
          : 'The program writes no application log, issues no message and writes no list; the code says nothing about how a failure is seen.',
      anchors: anchors(ctx, prompts.slice(0, 4)),
    });
  }
}

function performance(ctx: Ctx, out: Out): void {
  const star: Array<{ table: string; s: AbapStatement }> = [];
  const inLoop: Array<{ table: string; s: AbapStatement; loop: AbapStatement }> = [];
  const noWhere: Array<{ table: string; s: AbapStatement }> = [];
  ctx.statements.forEach((s, index) => {
    if (s.keyword !== 'SELECT' || s.nativeSql) return;
    const from = /\bFROM\s+([\w/]+)/i.exec(s.text);
    if (!from) return;
    const table = from[1].toUpperCase();
    if (/^\(/.test(from[1])) return;
    if (/^SELECT\s+(?:SINGLE\s+)?(?:FOR\s+UPDATE\s+)?\*/i.test(s.text)) {
      if (reached(ctx, s.lineStart, 'performance', `SELECT * FROM ${table}`)) star.push({ table, s });
    }
    const loop = [...(ctx.facts.structure.enclosing[index] ?? [])].reverse().find((b) => b.kind === 'loop' || b.kind === 'do' || b.kind === 'while' || b.kind === 'select');
    if (loop && reached(ctx, s.lineStart, 'performance', `SELECT FROM ${table} in a loop`)) inLoop.push({ table, s, loop: ctx.statements[loop.openIndex] });
    if (!/\bWHERE\b|\bUP\s+TO\b|\bFOR\s+ALL\s+ENTRIES\b/i.test(s.text) && !/^SELECT\s+SINGLE\b/i.test(s.text)) {
      if (reached(ctx, s.lineStart, 'performance', `SELECT FROM ${table} without WHERE`)) noWhere.push({ table, s });
    }
  });
  if (star.length) {
    const tables = [...new Set(star.map((x) => x.table))];
    out.drafts.push({
      category: 'performance',
      signal: 'select-star',
      statement: `The new solution shall read only the fields it uses from ${joinAnd(tables)}.`,
      rationale: `Because the program reads every field (SELECT *) at ${linesOf(star.map((x) => x.s))}.`,
      anchors: anchors(ctx, star.map((x) => x.s)),
      acceptance: [],
      priority: 'could',
      priorityReason: 'A cost, not a behaviour: the result is the same with fewer fields read.',
      objects: tables,
    });
  }
  if (inLoop.length) {
    const tables = [...new Set(inLoop.map((x) => x.table))];
    out.drafts.push({
      category: 'performance',
      signal: 'select-in-loop',
      statement: `The new solution shall read ${joinAnd(tables)} once for all rows rather than once per row.`,
      rationale: `Because the program reads ${tables.length === 1 ? 'it' : 'them'} inside a loop: ${inLoop.slice(0, 4).map((x) => `L${x.s.lineStart} in ${x.loop.text.split(' ').slice(0, 3).join(' ')} (L${x.loop.lineStart})`).join('; ')}.`,
      anchors: anchors(ctx, inLoop.flatMap((x) => [x.loop, x.s])),
      acceptance: [{ given: 'a run with many rows', when: 'the loop runs', then: `${joinAnd(tables)} ${tables.length === 1 ? 'is' : 'are'} read in one access per run, not one per row` }],
      priority: 'should',
      priorityReason: 'The number of database reads grows with the number of rows.',
      objects: tables,
    });
  }
  if (noWhere.length) {
    const tables = [...new Set(noWhere.map((x) => x.table))];
    out.drafts.push({
      category: 'performance',
      signal: 'select-without-where',
      statement: `The new solution shall restrict what it reads from ${joinAnd(tables)} to the rows it needs.`,
      rationale: `Because the program reads ${tables.length === 1 ? 'the table' : 'these tables'} without WHERE at ${linesOf(noWhere.map((x) => x.s))}.`,
      anchors: anchors(ctx, noWhere.map((x) => x.s)),
      acceptance: [],
      priority: 'should',
      priorityReason: 'A read without WHERE grows with the table.',
      objects: tables,
    });
  }
  const entry = ctx.facts.structure.containers.filter((c) => c.kind === 'event').sort((a, b) => a.lineStart - b.lineStart);
  const start = entry.find((c) => /START-OF-SELECTION/i.test(c.name)) ?? entry[0] ?? null;
  const params = ctx.statements.filter((s) => /^(PARAMETERS|PARAMETER|SELECT-OPTIONS)\b/i.test(s.text));
  out.questions.push({
    category: 'performance',
    owner: 'business',
    question: 'How many records does one run handle, how often does it run, and by when must it finish?',
    evidence: `The code sets no volume, schedule or time limit${params.length ? `; it starts from a selection screen (L${params[0].lineStart})` : ''}${start ? ` and runs from ${start.name} (L${start.lineStart})` : ''}.`,
    anchors: anchors(ctx, [params[0] ?? null, start ? { lineStart: start.lineStart, lineEnd: start.lineStart } : null]),
  });
  out.questions.push({
    category: 'performance',
    owner: 'it-operations',
    question: 'When must the process be available, and what is an acceptable response time for one case?',
    evidence: 'Availability and response time are service levels; no line of the code can state them.',
    anchors: [],
  });
}

function cutover(ctx: Ctx, out: Out, changes: Change[]): void {
  const direct = changes.filter((c) => c.kind === 'table' || c.kind === 'call' || c.kind === 'transaction');
  if (direct.length) {
    const tables = [...new Set(direct.filter((c) => c.kind === 'table').map((c) => c.name))];
    const calls = [...new Set(direct.filter((c) => c.kind === 'call').map((c) => c.name))];
    const tx = [...new Set(direct.filter((c) => c.kind === 'transaction').map((c) => c.name))];
    const what = [
      tables.length ? `write ${joinAnd(tables)}` : '',
      calls.length ? `call ${joinAnd(calls)}` : '',
      tx.length ? `run ${joinAnd(tx)} by batch input` : '',
    ].filter(Boolean);
    out.drafts.push({
      category: 'cutover',
      signal: 'changes',
      statement: `While the old program and the new solution run side by side, only one of them shall ${joinAnd(what)} for the same case.`,
      rationale: `Because the program makes these changes at ${linesOf(direct.map((c) => c.range))}; two systems making them would make them twice.`,
      anchors: anchors(ctx, direct.map((c) => c.range)),
      acceptance: [{ given: 'both are installed', when: 'one case is processed during parallel operation', then: 'each change is made once' }],
      priority: 'must',
      priorityReason: 'A change made twice is a duplicate document or a wrong status.',
      objects: [...tables, ...calls, ...tx],
    });
    out.questions.push({
      category: 'cutover',
      owner: 'business',
      question: 'When does the new solution take over, and is there a period in which both run — for how long, and which one makes the changes?',
      evidence: `The program changes data at ${linesOf(direct.map((c) => c.range))}; the cutover date and any parallel period are not in the code.`,
      anchors: anchors(ctx, direct.slice(0, 4).map((c) => c.range)),
    });
  }
  const remote = ctx.facts.calls.functionModules.filter((c) => (c.destination || c.startingNewTask || c.inBackgroundTask) && reached(ctx, c.lineStart, 'cutover', `${c.name ?? 'call'} remote`));
  const byDest = new Map<string, typeof remote>();
  for (const c of remote) {
    const raw = c.destination ?? (c.startingNewTask ? 'NONE' : 'NONE');
    const key = raw;
    const list = byDest.get(key) ?? [];
    list.push(c);
    byDest.set(key, list);
  }
  for (const [raw, list] of byDest) {
    const literal = /^'/.test(raw) ? unquote(raw) : ctx.constants.get(raw.toUpperCase()) ?? null;
    const dest = literal ? `RFC destination ${literal}` : raw === 'NONE' ? 'a separate task' : `the RFC destination in ${raw.toLowerCase()}`;
    const names = [...new Set(list.map((c) => c.name ?? 'a computed function'))];
    const modes = [...new Set(list.map((c) => (c.inBackgroundTask ? 'in background task' : c.startingNewTask ? 'starting a new task' : 'synchronously')))];
    out.drafts.push({
      category: 'cutover',
      signal: 'remote-call',
      statement: `The new solution shall reach ${dest} for ${joinAnd(names)}, as the program does ${joinAnd(modes)}.`,
      rationale: `Because the program calls ${joinAnd(names)} remotely at ${linesOf(list)}${literal && !/^'/.test(raw) ? ` (${raw.toLowerCase()} = '${literal}')` : ''}.`,
      anchors: anchors(ctx, list),
      acceptance: [{ given: 'the switch is done', when: `${names[0]} is called`, then: `${dest} answers` }],
      priority: 'must',
      priorityReason: 'A partner system the process depends on; the switch must keep it reachable.',
      objects: names,
    });
    if (!literal) {
      out.questions.push({
        category: 'cutover',
        owner: 'it-operations',
        question: `Which system does ${raw === 'NONE' ? 'the separate task' : raw.toLowerCase()} point to after the switch?`,
        evidence: `The program calls ${joinAnd(names)} at ${linesOf(list)}; the destination is set at run time or outside this source.`,
        anchors: anchors(ctx, list),
      });
    }
  }
  const update = ctx.facts.calls.functionModules.filter((c) => c.inUpdateTask && reached(ctx, c.lineStart, 'cutover', `${c.name ?? 'call'} IN UPDATE TASK`));
  if (update.length) {
    const names = [...new Set(update.map((c) => c.name ?? 'a computed function'))];
    out.drafts.push({
      category: 'cutover',
      signal: 'update-task',
      statement: `The switch shall leave no update of the old program unprocessed: it registers ${joinAnd(names)} in the update task.`,
      rationale: `Because the program calls ${joinAnd(names)} IN UPDATE TASK at ${linesOf(update)}; the update runs after the commit, not at the call.`,
      anchors: anchors(ctx, update),
      acceptance: [{ given: 'the moment of the switch', when: 'the update queue is checked (SM13)', then: `no update of ${joinAnd(names)} is open` }],
      priority: 'should',
      priorityReason: 'Registered updates run later; an open one at the switch is lost or runs against the new solution.',
      objects: names,
    });
  }
  const events = changes.filter((c) => c.kind === 'event');
  if (events.length) {
    const described = events.map((e) => {
      const type = /\bobject_type\s*=\s*'([^']+)'/i.exec(e.text)?.[1];
      const event = /\bevent\s*=\s*'([^']+)'/i.exec(e.text)?.[1];
      const task = /\btask\s*=\s*'([^']+)'/i.exec(e.text)?.[1];
      return event && type ? `event ${event} of object type ${type}` : task ? `workflow ${task}` : e.name;
    });
    out.drafts.push({
      category: 'cutover',
      signal: 'workflow-event',
      statement: `The switch shall settle the workflows the old program started: it raises ${joinAnd([...new Set(described)])}.`,
      rationale: `Because the program calls ${joinAnd([...new Set(events.map((e) => e.name))])} at ${linesOf(events.map((e) => e.range))}; what the workflow does next runs outside this program.`,
      anchors: anchors(ctx, events.map((e) => e.range)),
      acceptance: [{ given: 'workflows started by the old program are still open at the switch', when: 'the new solution goes live', then: 'each is finished in the old process or taken over, none is left behind' }],
      priority: 'should',
      priorityReason: 'Open workflow items outlive the program that started them.',
      objects: [...new Set(events.map((e) => e.name))],
    });
    out.questions.push({
      category: 'cutover',
      owner: 'business',
      question: 'Are the workflow items still open at the switch finished in the old process, or moved to the new one?',
      evidence: `The program starts them at ${linesOf(events.map((e) => e.range))}; how many are open on the day is not in the code.`,
      anchors: anchors(ctx, events.map((e) => e.range)),
    });
  }
}

/* ---------------------------------------------------------------- assembly */

function readConstants(statements: AbapStatement[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const s of statements) {
    if (s.keyword !== 'CONSTANTS') continue;
    const m = /^CONSTANTS\s+([\w/]+)\b[\s\S]*?\bVALUE\s+'((?:[^']|'')*)'/i.exec(s.text);
    if (m) out.set(m[1].toUpperCase(), m[2].replace(/''/g, "'"));
  }
  return out;
}

export function buildNfrSet(input: { source: string }): NfrSet {
  const source = input.source.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const lines = sourceLines(source);
  const facts = buildProcessFacts(source);
  const report = facts.statements.find((s) => s.keyword === 'REPORT' || s.keyword === 'PROGRAM' || s.keyword === 'FUNCTION-POOL');
  const ctx: Ctx = {
    lines,
    facts,
    plain: plainContext(source),
    statements: facts.statements,
    unreachable: new Set(facts.calls.unreachable.map((n) => n.toUpperCase())),
    constants: readConstants(facts.statements),
    messageClass: report ? /\bMESSAGE-ID\s+([\w/]+)/i.exec(report.text)?.[1]?.toUpperCase() ?? null : null,
    unreached: [],
  };
  const out: Out = { drafts: [], questions: [] };
  const claimed: Claimed = new Set();
  const messages = readMessages(ctx);

  migration(ctx, out, readChanges(ctx, 'migration'));
  retention(ctx, out, readChanges(ctx, null));
  audit(ctx, out, readChanges(ctx, null));
  authorization(ctx, out, claimed, readChanges(ctx, null));
  errors(ctx, out, claimed, messages);
  monitoring(ctx, out, messages);
  performance(ctx, out);
  cutover(ctx, out, readChanges(ctx, 'cutover'));

  const dropped: NfrSet['dropped'] = [];
  const kept: Draft[] = [];
  for (const d of out.drafts) {
    const holding = d.anchors.filter((a) => anchorHolds(a, lines));
    if (!holding.length) {
      dropped.push({ ref: `${d.category}:${d.signal}`, reason: 'No line anchor of it holds in the source.' });
      continue;
    }
    kept.push({ ...d, anchors: holding });
  }
  const order = (c: NfrCategory) => NFR_CATEGORIES.indexOf(c);
  kept.sort((a, b) => order(a.category) - order(b.category) || a.anchors[0].lineStart - b.anchors[0].lineStart);
  const requirements: NonFunctionalRequirement[] = kept.map((d, i) => ({ ...d, id: `NFR-${String(i + 1).padStart(2, '0')}`, provenance: 'reconstructed' }));

  const questions: NfrQuestion[] = out.questions
    .map((qd, i) => ({ qd, i }))
    .sort((a, b) => order(a.qd.category) - order(b.qd.category) || a.i - b.i)
    .map(({ qd }, i) => ({
      ...qd,
      anchors: qd.anchors.filter((a) => anchorHolds(a, lines)),
      id: `TBD-${String(i + 1).padStart(2, '0')}`,
      provenance: 'not-determined' as const,
    }));

  const unreachedSeen = new Set<string>();
  const categories: NfrCategorySummary[] = NFR_CATEGORIES.map((category) => {
    const grounded = requirements.filter((r) => r.category === category).length;
    const asked = questions.filter((x) => x.category === category).length;
    const unreached = ctx.unreached
      .filter((u) => u.category === category)
      .filter((u) => {
        const key = `${category}|${u.line}`;
        if (unreachedSeen.has(key)) return false;
        unreachedSeen.add(key);
        return true;
      })
      .sort((a, b) => a.line - b.line);
    return {
      category,
      label: NFR_CATEGORY_LABEL[category],
      grounded,
      questions: asked,
      status: grounded ? 'grounded' : asked ? 'decision' : 'none',
      unreached,
    };
  });

  const count = (p: RequirementPriority) => requirements.filter((r) => r.priority === p).length;
  const program = report ? /^(?:REPORT|PROGRAM|FUNCTION-POOL)\s+([\w/]+)/i.exec(report.text)?.[1]?.toUpperCase() ?? null : null;
  return {
    formatVersion: NFR_FORMAT_VERSION,
    program,
    sourceSha256: sha256Hex(source),
    lineCount: lines.length,
    requirements,
    questions,
    categories,
    dropped,
    counts: {
      total: requirements.length,
      must: count('must'),
      should: count('should'),
      could: count('could'),
      questions: questions.length,
      categoriesGrounded: categories.filter((c) => c.grounded > 0).length,
    },
  };
}

/* ---------------------------------------------------------- model proposal */

/** Words a model uses in every answer; naming them is not naming this program. */
const COMMON_WORDS = new Set([
  ...BTP.toUpperCase().split(' '), 'ABAP', 'CAP', 'RAP', 'API', 'APIS', 'ETL', 'ILM', 'SARA', 'SLA', 'SLAS', 'KPI', 'KPIS', 'IAM', 'GOBD', 'SOX', 'GDPR',
  'DSGVO', 'RFC', 'HANA', 'CDS', 'OData', 'ODATA', 'REST', 'JSON', 'XML', 'SQL', 'UI', 'UX', 'HTTP', 'HTTPS', 'JWT', 'XSUAA', 'IDOC',
  'DLQ', 'BAPI', 'BAPIS', 'S4', 'S4HANA', 'ERP', 'ECC', 'DDIC', 'AIF', 'SM13', 'SM37', 'SLG1', 'SM21', 'ST22',
]);

/**
 * What a model proposal names that belongs to this program: a table, a
 * function, an object, a question ID. An empty list means the text is generic —
 * it could stand under any program — and the screen says so.
 */
export function proposalReferences(text: string, source: string, questionIds: readonly string[] = []): string[] {
  const upper = source.toUpperCase();
  const out = new Set<string>();
  for (const id of questionIds) if (text.includes(id)) out.add(id);
  for (const m of text.matchAll(/\b[A-Za-z][A-Za-z0-9_/]{2,}\b/g)) {
    const token = m[0];
    if (!/[A-Z]/.test(token) || token !== token.toUpperCase()) continue;
    if (COMMON_WORDS.has(token.toUpperCase())) continue;
    if (new RegExp(`(^|[^A-Z0-9_/])${token.replace(/[/]/g, '\\/')}(?![A-Z0-9_])`).test(upper)) out.add(token);
  }
  return [...out];
}

/**
 * The prompt for the design model's part: target values and answers to the
 * questions, per category, beside the requirements the engine already read.
 * The stored shape stays the eight strings it always was.
 */
export function nfrProposalPrompt(set: NfrSet | null, designText: string): string {
  const per = NFR_CATEGORIES.map((c) => {
    const reqs = set ? set.requirements.filter((r) => r.category === c).map((r) => `${r.id} ${r.statement} (${anchorList(r.anchors)})`) : [];
    const qs = set ? set.questions.filter((x) => x.category === c).map((x) => `${x.id} ${x.question}`) : [];
    return { key: NFR_MODEL_KEY[c], label: NFR_CATEGORY_LABEL[c], readFromCode: reqs, openQuestions: qs };
  });
  return `You are an SAP enterprise architect. The engine has already read the non-functional requirements below out of the ABAP source, with line numbers. Do not repeat them and do not contradict them.

For each of the eight keys, write at most two sentences that add something specific to this program: a proposed target value for one of its open questions (name the question ID, e.g. "TBD-03: keep rows of ZMM_LOG for 10 years"), or a sharper wording of one requirement (name its ID). Name the tables, functions and objects of this program. Mark every value as a proposal. Write an empty string for a key where you have nothing specific — never general advice such as "ensure robust monitoring".

Return ONLY a JSON object with exactly these string keys: ${NFR_CATEGORIES.map((c) => `"${NFR_MODEL_KEY[c]}"`).join(', ')}.

Read from the code:
${JSON.stringify(per).slice(0, 9000)}

Solution design context:
${designText.substring(0, 3000)}`;
}
