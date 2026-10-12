import { readCallGraph, type CallGraphReport } from '@/lib/abap/call-graph';
import { readTableDependencies, type TableDependencyReport } from '@/lib/abap/table-dependencies';
import { buildProcessSkeleton, type ProcessSkeleton } from '@/lib/abap/process-skeleton';
import { deriveBusinessRules, type BusinessRuleSet } from '@/lib/abap/business-rule-set';
import { humaniseField, plainContext, type PlainContext } from '@/lib/abap/plain-language';
import { FUNCTION_TERMS_EN, TABLE_TERMS_EN, TRANSACTION_TERMS_EN } from '@/lib/abap/plain-glossary';
import { capabilityFactsOf } from '@/lib/documentation-facts';
import { capabilityPresence } from '@/lib/documentation-capabilities';
import { isCustomerObject } from '@/lib/abap/abcd-classification';
import {
  PROGRAM_SUMMARY_FACTS_VERSION,
  type ProgramSummaryFacts,
  type SummaryAction,
  type SummaryFixedList,
  type SummaryInput,
  type SummaryObject,
} from '@/lib/program-summary-text';

/**
 * The engine facts a business summary of a program is written from — owner,
 * 12.10.2026: *"In general the business high-level texts about what a Z
 * program does — in First insights, Analyze and Documentation, and of course
 * in Management — must get clearly better."* and roadmap 3.0.11, "In short
 * says what the program is for": built from what the engine reads, not
 * invented — the business objects behind the tables, the selection screen and
 * its texts, the constant sets the program is configured with, the outputs and
 * the capability facts (posts or not).
 *
 * Every fact carries its line. Nothing here is new knowledge about the
 * program's *purpose*: the code says what it does, never why; the text module
 * (`lib/program-summary-text.ts`) says so in its limits.
 *
 * Pure: no network, no clock, no React. Server or browser; the four places that
 * show the summary (Business view, Analyze, Documentation, Management) all call
 * this one function, so they cannot disagree.
 */

const SETTINGS_TABLE = /^(?:T\d{3}[A-Z0-9]*|T[A-Z]{2,4}\d{0,2}[A-Z]?|TVARVC|DD\d\d[A-Z])$/;
const TEXT_WORD = /\b(?:text|description)s?$/i;

const LIST_CALLS = /^(?:REUSE_ALV_(?!FIELDCATALOG|EVENTS|COMMENTARY|POPUP)|CL_SALV_|CL_GUI_ALV_GRID|LVC_)/;
const FILE_DOWNLOAD = /^(?:GUI_DOWNLOAD|WS_DOWNLOAD)$/;
const FILE_UPLOAD = /^(?:GUI_UPLOAD|WS_UPLOAD|ALSM_EXCEL_TO_INTERNAL_TABLE|TEXT_CONVERT_XLS_TO_SAP)$/;
const PRINT_CALLS = /^(?:GET_PRINT_PARAMETERS|SSF_FUNCTION_MODULE_NAME|FP_JOB_OPEN|OPEN_FORM)$/;
const MAIL_CALLS = /^(?:SO_NEW_DOCUMENT_SEND_API1|SO_NEW_DOCUMENT_ATT_SEND_API1|SO_DOCUMENT_SEND_API1|CL_BCS)$/;
/** A function or transaction word that changes something in SAP — the verbs a posting program is made of. */
const CHANGING_VERB = /^(?:Post|Create|Change|Delete|Cancel|Reverse|Release|Start|Clear|Block|Unblock|Book|Settle|Maintain)\b/;

const lcFirst = (text: string): string => (/^[A-Z][a-z]/.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text);

function objectOf(name: string, line: number): SummaryObject {
  const term = TABLE_TERMS_EN[name.toLowerCase()];
  const word = term ? lcFirst(term.plural) : null;
  const kind: SummaryObject['kind'] = SETTINGS_TABLE.test(name)
    ? 'setting'
    : word && TEXT_WORD.test(word)
      ? 'text'
      : isCustomerObject(name)
        ? 'custom'
        : 'business';
  return { name, word, line, kind };
}

/**
 * The selection screen's own texts: `SELECTION-SCREEN COMMENT … l_x FOR FIELD
 * p_x` with `l_x = 'Controlling area'.`, and the frame titles `… TITLE b01`
 * with `b01 = '…'`. A program that sets these says in its own words what each
 * input is — better than any word the glossary can give "p_vers" (the CO
 * review's "Vers", "Sp", "Cred", "Abs").
 */
export function selectionScreenTexts(ctx: PlainContext): { fields: Map<string, string>; titles: Array<{ text: string; line: number }> } {
  const commentFor = new Map<string, string>(); // label variable → field
  const titleVars: Array<{ name: string; line: number }> = [];
  const assigned = new Map<string, string>();
  for (const s of ctx.statements) {
    const comment = /^SELECTION-SCREEN\s+COMMENT\s+\S+\s+([A-Za-z_][\w%-]*)\s+FOR\s+FIELD\s+([A-Za-z_][\w]*)/i.exec(s.text);
    if (comment) commentFor.set(comment[1].toLowerCase(), comment[2].toLowerCase());
    const title = /^SELECTION-SCREEN\s+BEGIN\s+OF\s+BLOCK\s+\S+.*\bTITLE\s+([A-Za-z_][\w]*)/i.exec(s.text);
    if (title && !/^TEXT-/i.test(title[1])) titleVars.push({ name: title[1].toLowerCase(), line: s.line });
    const assign = /^([A-Za-z_][\w%-]*)\s*=\s*'((?:[^']|'')*)'$/.exec(s.text);
    if (assign && !assigned.has(assign[1].toLowerCase())) assigned.set(assign[1].toLowerCase(), assign[2].replace(/''/g, "'").trim());
    // `%_p_x_%_app_%-text = '…'` sets a field's text without a COMMENT.
    const app = /^%_([A-Za-z_]\w*?)_%_APP_%-TEXT\s*=\s*'((?:[^']|'')*)'$/i.exec(s.text);
    if (app) assigned.set(`%app:${app[1].toLowerCase()}`, app[2].replace(/''/g, "'").trim());
  }
  const fields = new Map<string, string>();
  for (const [label, field] of commentFor) {
    const text = assigned.get(label);
    if (text) fields.set(field, text);
  }
  for (const [key, text] of assigned) {
    if (key.startsWith('%app:') && !fields.has(key.slice(5))) fields.set(key.slice(5), text);
  }
  const titles = titleVars
    .map((t) => ({ text: assigned.get(t.name) ?? '', line: t.line }))
    .filter((t) => t.text.length > 0);
  return { fields, titles };
}

function inputsOf(ctx: PlainContext, texts: Map<string, string>): SummaryInput[] {
  const out: SummaryInput[] = [];
  const seen = new Set<string>();
  for (const s of ctx.statements) {
    const m = /^(PARAMETERS|PARAMETER|SELECT-OPTIONS)\b\s*:?\s*([\s\S]*)$/i.exec(s.text);
    if (!m) continue;
    for (const part of m[2].split(',')) {
      const name = part.trim().split(/\s+/)[0]?.toLowerCase().replace(/\(\d+\)$/, '');
      if (!name || seen.has(name)) continue;
      const field = ctx.selections.get(name);
      if (!field) continue;
      seen.add(name);
      const own = texts.get(name);
      out.push({
        name: name.toUpperCase(),
        label: own ?? humaniseField(name, ctx),
        labelFrom: own ? 'screen' : 'name',
        kind: field.selectOption ? 'range' : field.checkbox ? 'switch' : 'parameter',
        required: /\bOBLIGATORY\b/i.test(part),
        line: s.line,
      });
    }
  }
  return out;
}

const unquote = (token: string): string | null => {
  const m = /^'((?:[^']|'')*)'$/.exec(token) ?? /^`([^`]*)`$/.exec(token);
  return m ? m[1].replace(/''/g, "'") : null;
};

function tokens(text: string): string[] {
  return text.match(/'(?:[^']|'')*'|`[^`]*`|\S+/g) ?? [];
}

/**
 * Lists the program is configured with in its own code: one subroutine called
 * again and again with nothing but literals — `PERFORM add_segment USING 'FAC'
 * 'SVCFAC' 'AREA' 'M2' '90.00'` four times is a table of four segments that
 * stands in the code, not in customizing. The columns are the subroutine's
 * parameter names. Only lists whose first column is a key (no value twice) are
 * kept: a list of memberships is not a list of things.
 */
function fixedListsOf(calls: CallGraphReport, ctx: PlainContext): SummaryFixedList[] {
  const byTarget = new Map<string, Array<{ values: string[]; line: number }>>();
  for (const p of calls.performs) {
    if (!p.target || p.dynamic) continue;
    const m = /\bUSING\s+([\s\S]+)$/i.exec(p.text.replace(/\.$/, ''));
    if (!m) continue;
    const args = tokens(m[1]).filter((t) => !/^(?:CHANGING|TABLES)$/i.test(t));
    const values = args.map(unquote);
    if (values.length < 2 || values.some((v) => v === null)) continue;
    const list = byTarget.get(p.target) ?? [];
    list.push({ values: values as string[], line: p.lineStart });
    byTarget.set(p.target, list);
  }
  const out: SummaryFixedList[] = [];
  for (const [target, rows] of byTarget) {
    if (rows.length < 2 || rows.length > 24) continue;
    const width = rows[0].values.length;
    if (rows.some((r) => r.values.length !== width)) continue;
    const keys = rows.map((r) => r.values[0]);
    if (new Set(keys).size !== keys.length) continue;
    const form = calls.forms.find((f) => f.name === target);
    const params = (form?.parameters ?? []).filter((p) => p.direction === 'using').map((p) => p.name);
    const columns = rows[0].values.map((_, i) => {
      const raw = params[i] ?? `value ${i + 1}`;
      return humaniseField(raw.replace(/^(?:iv|pv|i|p|u|im|is)_/i, ''), ctx).toLowerCase();
    });
    const item = humaniseField(target.replace(/^(?:ADD|APPEND|SET|REGISTER|INIT|DEFINE|FILL|BUILD|CREATE|PUT)_/i, ''), ctx).toLowerCase();
    out.push({
      routine: target,
      item,
      columns,
      rows: rows.map((r) => r.values),
      lineStart: rows[0].line,
      lineEnd: rows[rows.length - 1].line,
    });
  }
  return out.sort((a, b) => a.lineStart - b.lineStart);
}

function sentenceWordOf(name: string, kind: 'function' | 'transaction' | 'bapi'): string | null {
  const word = kind === 'transaction' ? TRANSACTION_TERMS_EN[name] : FUNCTION_TERMS_EN[name];
  return word ?? null;
}

export interface ProgramSummaryReaders {
  skeleton?: Pick<ProcessSkeleton, 'luw'>;
  calls?: CallGraphReport;
  tables?: TableDependencyReport;
  ruleSet?: Pick<BusinessRuleSet, 'rules' | 'program'> | null;
}

export function programSummaryFactsOf(source: string, readers: ProgramSummaryReaders = {}): ProgramSummaryFacts {
  const text = String(source ?? '').replace(/\r\n?/g, '\n');
  const ctx = plainContext(text);
  const calls = readers.calls ?? readCallGraph(text);
  const tables = readers.tables ?? readTableDependencies(text);
  const skeleton = readers.skeleton ?? buildProcessSkeleton(text);
  let ruleSet: Pick<BusinessRuleSet, 'rules' | 'program'> | null = readers.ruleSet ?? null;
  if (!readers.ruleSet) {
    try {
      ruleSet = deriveBusinessRules(text);
    } catch {
      ruleSet = null;
    }
  }
  const capability = capabilityFactsOf(text, skeleton, { calls, tables });
  const presence = capabilityPresence(capability);

  const head = /^\s*(REPORT|PROGRAM|FUNCTION-POOL|CLASS-POOL|FUNCTION|CLASS)\s+([\w/]+)/im.exec(text);
  const keyword = head?.[1].toUpperCase() ?? null;
  const kind: ProgramSummaryFacts['kind'] = keyword === 'REPORT' || keyword === 'PROGRAM'
    ? 'report'
    : keyword === 'FUNCTION' || keyword === 'FUNCTION-POOL'
      ? 'function'
      : keyword === 'CLASS' || keyword === 'CLASS-POOL'
        ? 'class'
        : ctx.selections.size > 0 ? 'report' : 'unknown';
  const program = ruleSet?.program ?? (head ? head[2].toUpperCase() : null);

  const reads = capability.reads.map((r) => objectOf(r.name, r.line));
  const writes = capability.writes.map((w) => objectOf(w.name, w.line));

  // What it changes in SAP, in business verbs: the posting calls and the
  // transactions it runs with data, each once by its word.
  const actions: SummaryAction[] = [];
  const seenWords = new Set<string>();
  const addAction = (name: string, word: string | null, line: number, via: SummaryAction['via']) => {
    // A technical object ("Create ID") is not a change a business reader asks about.
    if (!word || !CHANGING_VERB.test(word) || /\b(?:ID|IDs|GUID|number|lock|log|spool)$/i.test(word)) return;
    const key = word.toLowerCase();
    if (seenWords.has(key)) return;
    seenWords.add(key);
    actions.push({ name, word, line, via });
  };
  for (const f of calls.functionModules) {
    if (!f.name) continue;
    addAction(f.name.toUpperCase(), sentenceWordOf(f.name.toUpperCase(), f.bapi ? 'bapi' : 'function'), f.lineStart, f.bapi ? 'interface' : 'function');
  }
  for (const t of calls.transactions) {
    if (!t.code) continue;
    addAction(t.code.toUpperCase(), sentenceWordOf(t.code.toUpperCase(), 'transaction'), t.lineStart, t.batchInput ? 'simulated-entry' : 'transaction');
  }

  const callNames = calls.functionModules.filter((f) => f.name).map((f) => ({ name: (f.name as string).toUpperCase(), line: f.lineStart }));
  const firstCall = (re: RegExp): number | null => callNames.find((c) => re.test(c.name))?.line ?? null;
  const statementLine = (re: RegExp): number | null => ctx.statements.find((s) => re.test(s.text))?.line ?? null;
  const classLine = (re: RegExp): number | null => {
    const at = ctx.statements.find((s) => re.test(s.text));
    return at ? at.line : null;
  };

  const texts = selectionScreenTexts(ctx);
  const posting = presence.posting;
  const ruleCount = ruleSet ? ruleSet.rules.length : null;

  return {
    version: PROGRAM_SUMMARY_FACTS_VERSION,
    program,
    kind,
    reads,
    writes,
    changes: {
      state: posting.present ? 'changes' : posting.determined ? 'none' : 'not-determined',
      actions,
      commits: capability.commits.length + capability.updateTask.length,
      displayTransactions: calls.transactions
        .filter((t) => t.code && !t.batchInput && !actions.some((a) => a.name === t.code?.toUpperCase()))
        .map((t) => ({ name: (t.code as string).toUpperCase(), word: TRANSACTION_TERMS_EN[(t.code as string).toUpperCase()] ?? null, line: t.lineStart })),
      dynamic: (capability.dynamicWrites ?? []).length + (capability.dynamicCalls ?? []).length,
    },
    outputs: {
      list: firstCall(LIST_CALLS) ?? classLine(/\bCL_SALV_(?:TABLE|HIERSEQ)\b/i) ?? statementLine(/^WRITE\b/i),
      fileOut: firstCall(FILE_DOWNLOAD) ?? classLine(/CL_GUI_FRONTEND_SERVICES\s*=>\s*GUI_DOWNLOAD/i),
      fileIn: firstCall(FILE_UPLOAD) ?? classLine(/CL_GUI_FRONTEND_SERVICES\s*=>\s*GUI_UPLOAD/i),
      serverIn: statementLine(/^OPEN\s+DATASET\b.*\bFOR\s+INPUT\b/i),
      serverOut: statementLine(/^OPEN\s+DATASET\b.*\bFOR\s+(?:OUTPUT|APPENDING)\b/i),
      print: firstCall(PRINT_CALLS) ?? statementLine(/^NEW-PAGE\s+PRINT\s+ON\b/i),
      mail: firstCall(MAIL_CALLS) ?? classLine(/\bCL_BCS\b/i),
    },
    inputs: inputsOf(ctx, texts.fields),
    screenTitles: texts.titles,
    fixedLists: fixedListsOf(calls, ctx),
    rules: ruleCount,
    authority: [...new Set(calls.authorityChecks.map((a) => a.object).filter((o): o is string => !!o).map((o) => o.toUpperCase()))],
  };
}
