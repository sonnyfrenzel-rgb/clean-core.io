import { readCallGraph, type CallGraphReport } from '@/lib/abap/call-graph';
import { readTableDependencies, type TableDependencyReport } from '@/lib/abap/table-dependencies';
import { buildProcessSkeleton, type ProcessSkeleton } from '@/lib/abap/process-skeleton';
import { deriveBusinessRules, type BusinessRuleSet } from '@/lib/abap/business-rule-set';
import { humaniseField, plainContext, type PlainContext } from '@/lib/abap/plain-language';
import { FUNCTION_TERMS_EN, TABLE_TERMS_EN, TRANSACTION_TERMS_EN } from '@/lib/abap/plain-glossary';
import { capabilityFactsOf } from '@/lib/documentation-facts';
import { capabilityPresence } from '@/lib/documentation-capabilities';
import { isCustomerObject } from '@/lib/abap/abcd-classification';
import { readStatements } from '@/lib/abap/statement-reader';
import { containerAt, readBlocks } from '@/lib/abap/block-structure';
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

// In any case — "*& Business purpose: …" counts as much as "BUSINESS PURPOSE" (PP review of
// 12.10.2026) — but only as a heading: followed by a colon, or alone on its line, so an ordinary
// comment such as "Purpose of this block …" is never taken for the author's claim.
const CLAIM_HEADING = /^(business\s+purpose|business\s+scope|purpose|description|zweck|beschreibung|funktion|verwendung)(?:\s*:\s*(.*)|\s*)$/i;
const DECOR = /^[-=*&_#\s]*$/;
const OTHER_HEADING = /^[A-Z][A-Z0-9 ()/&-]{3,}:?$/;

/**
 * What the program's author wrote it is for, in its header comment — a
 * section headed BUSINESS PURPOSE, BUSINESS SCOPE, PURPOSE, DESCRIPTION (or
 * ZWECK, BESCHREIBUNG …) in capitals (owner, 12.10.2026: "use the program's
 * header comments as a source, shown as Author's claim, checked against
 * engine facts exactly like a model proposal"). Quoted verbatim, as code is;
 * null when the header has no such section. Only headed sections count: a
 * banner line or a change log is not a statement of purpose.
 */
export function headerClaimOf(source: string): ProgramSummaryFacts['headerClaim'] {
  const lines = String(source ?? '').replace(/\r\n?/g, '\n').split('\n');
  const limit = Math.min(lines.length, 150);
  const contentOf = (raw: string): string | null => {
    const m = /^\s*(?:\*&?|")(.*)$/.exec(raw);
    return m ? m[1].replace(/\*+\s*$/, '').trim() : null;
  };
  for (let i = 0; i < limit; i++) {
    const content = contentOf(lines[i]);
    if (content === null) continue;
    const head = CLAIM_HEADING.exec(content);
    if (!head) continue;
    const parts: string[] = head[2] ? [head[2]] : [];
    let end = i + 1;
    for (let j = i + 1; j < limit; j++) {
      const c = contentOf(lines[j]);
      if (c === null || DECOR.test(c) || OTHER_HEADING.test(c)) break;
      parts.push(c);
      end = j + 1;
    }
    // Bullets become sentences: "- Read-only: no FI posting" → "Read-only: no FI posting."
    const sentences: string[] = [];
    for (const p of parts) {
      const bullet = /^[-•]\s+(.*)$/.exec(p);
      if (bullet) sentences.push(bullet[1].replace(/([^.!?])$/, '$1.'));
      else if (sentences.length && !/[.!?:]$/.test(sentences[sentences.length - 1])) sentences[sentences.length - 1] += ` ${p}`;
      else sentences.push(p);
    }
    const text = sentences.join(' ').replace(/\s+/g, ' ').trim();
    if (text.length < 12) continue;
    return { heading: head[1].replace(/\s+/g, ' '), text: text.length > 700 ? `${text.slice(0, 697).replace(/\s+\S*$/, '')} …` : text, lineStart: i + 1, lineEnd: end };
  }
  return null;
}

/** Handler events of the ALV classes and controls that run on a user's click or function key. */
const COMMAND_EVENTS = /^(?:ADDED_FUNCTION|USER_COMMAND|DOUBLE_CLICK|LINK_CLICK|HOTSPOT_CLICK|BUTTON_CLICK|FUNCTION_SELECTED|NODE_DOUBLE_CLICK|ITEM_DOUBLE_CLICK)$/;

/**
 * The lines that run only on a user's command (SD review, 12.10.2026): a
 * display cockpit whose two changes sit behind "Save" in a PAI module and
 * behind a button of its list was summed up as "Changes sales orders in SAP",
 * because every write and every posting call counted the same wherever it
 * stood. What runs only on a command is now told apart:
 *
 *   - a PAI module (`MODULE … INPUT`) — it runs when the user acts on a screen;
 *   - the list events `AT USER-COMMAND`, `AT LINE-SELECTION`, `AT PFnn`;
 *   - a FORM the ALV calls back for the user's command (`I_CALLBACK_USER_COMMAND`,
 *     or a `USER_COMMAND` FORM in the event table);
 *   - a handler method of a click or function event (`METHODS m FOR EVENT
 *     added_function OF cl_salv_events`, `double_click`, `hotspot_click` …);
 *
 * and every FORM reached only from those. A FORM the normal flow also reaches
 * (START-OF-SELECTION, a PBO module, a function module …) is not command-only.
 * Methods called from a handler are not followed — they count as the normal
 * flow, the side that says "changes" rather than hides it.
 */
export function commandOnlyReader(source: string, calls: CallGraphReport): { onCommand: (line: number) => boolean; interactive: number | null } {
  const statements = readStatements(source);
  const { containers } = readBlocks(statements);
  const paiModules = new Set<string>();
  const handlerMethods = new Set<string>();
  for (const s of statements) {
    const pai = /^MODULE\s+([\w/]+)\s+INPUT\b/i.exec(s.text);
    if (pai) paiModules.add(pai[1].toUpperCase());
    const handler = /^(?:CLASS-)?METHODS\s+([\w/~]+)\s+FOR\s+EVENT\s+([\w/]+)\s+OF\b/i.exec(s.text);
    if (handler && COMMAND_EVENTS.test(handler[2].toUpperCase())) handlerMethods.add(handler[1].toUpperCase());
  }
  const keyOf = (kind: string, name: string | null) => `${kind}:${name ?? ''}`;
  const isCommandContainer = (c: { kind: string; name: string }) =>
    (c.kind === 'module' && paiModules.has(c.name))
    || (c.kind === 'event' && /^AT (?:USER-COMMAND|LINE-SELECTION|PF\d+)$/.test(c.name))
    || (c.kind === 'method' && handlerMethods.has(c.name));
  const commandCallback = (trigger: string, form: string) =>
    /\bI_CALLBACK_USER_COMMAND$/.test(trigger) || (/IT_EVENTS$/.test(trigger) && /USER_COMMAND|LINE_SELECTION|DOUBLE_CLICK/.test(form));

  const commandRoots = new Set<string>();
  const normalRoots = new Set<string>([keyOf('program', null)]);
  for (const c of containers) {
    if (isCommandContainer(c)) commandRoots.add(keyOf(c.kind, c.name));
    else if (c.kind !== 'form') normalRoots.add(keyOf(c.kind, c.name));
  }
  const next = new Map<string, string[]>();
  const link = (from: string, to: string) => next.set(from, [...(next.get(from) ?? []), to]);
  for (const e of calls.edges) link(keyOf(e.fromKind, e.from), keyOf('form', e.to));
  for (const e of calls.callbacks) {
    if (commandCallback(e.trigger, e.to)) commandRoots.add(keyOf('form', e.to));
    else link(keyOf(e.fromKind, e.from), keyOf('form', e.to));
  }
  const reach = (roots: Set<string>): Set<string> => {
    const seen = new Set<string>(roots);
    const queue = [...roots];
    while (queue.length) {
      for (const to of next.get(queue.pop() as string) ?? []) {
        if (!seen.has(to)) {
          seen.add(to);
          queue.push(to);
        }
      }
    }
    return seen;
  };
  const normal = reach(normalRoots);
  const command = reach(commandRoots);
  const onCommand = (line: number): boolean => {
    const c = containerAt(containers, line);
    const key = c ? keyOf(c.kind, c.name) : keyOf('program', null);
    return command.has(key) && !normal.has(key);
  };
  // Where the user's commands are taken — the first such routine, or the call that registers it.
  const interactive = [
    ...containers.filter(isCommandContainer).map((c) => c.lineStart),
    ...calls.callbacks.filter((e) => commandCallback(e.trigger, e.to)).map((e) => e.lineStart),
  ].sort((a, b) => a - b)[0] ?? null;
  return { onCommand, interactive };
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

  const command = commandOnlyReader(text, calls);
  const reads = capability.reads.map((r) => objectOf(r.name, r.line));
  // A write that runs only on a user's command is marked (SD review, 12.10.2026).
  // A table written anywhere in the normal flow is not command-only, whichever write came first.
  const writtenInFlow = new Set([
    ...tables.dependencies.filter((d) => d.access === 'write').map((d) => ({ name: d.table, line: d.line })),
    ...calls.databaseWrites.map((d) => ({ name: d.table, line: d.lineStart })),
  ].filter((w) => !command.onCommand(w.line)).map((w) => w.name.toUpperCase()));
  const writes = capability.writes.map((w) => (
    command.onCommand(w.line) && !writtenInFlow.has(w.name.toUpperCase()) ? { ...objectOf(w.name, w.line), onCommand: true } : objectOf(w.name, w.line)
  ));

  // What it changes in SAP, in business verbs: the posting calls and the
  // transactions it runs with data, each once by its word.
  const actions: SummaryAction[] = [];
  const seenWords = new Set<string>();
  const addAction = (name: string, word: string | null, line: number, via: SummaryAction['via']) => {
    // A technical object ("Create ID") is not a change a business reader asks about.
    if (!word || !CHANGING_VERB.test(word) || /\b(?:ID|IDs|GUID|number|lock|log|spool)$/i.test(word)) return;
    const key = word.toLowerCase();
    const onCommand = command.onCommand(line);
    const earlier = actions.findIndex((a) => a.word.toLowerCase() === key);
    // The same change reached once from the normal flow is not command-only.
    if (seenWords.has(key)) {
      if (earlier >= 0 && actions[earlier].onCommand && !onCommand) {
        const a = actions[earlier];
        actions[earlier] = { name: a.name, word: a.word, line: a.line, via: a.via };
      }
      return;
    }
    seenWords.add(key);
    actions.push(onCommand ? { name, word, line, via, onCommand: true } : { name, word, line, via });
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
      screen: statementLine(/^CALL\s+SCREEN\b/i),
    },
    // What needs a user's front end — a screen, the user's commands on a list,
    // a file on the user's PC, a control on the GUI: such a program cannot run as
    // a background job (SD review, 12.10.2026).
    frontEnd: [
      statementLine(/^CALL\s+SCREEN\b/i),
      command.interactive,
      firstCall(FILE_DOWNLOAD) ?? classLine(/CL_GUI_FRONTEND_SERVICES\s*=>\s*GUI_DOWNLOAD/i),
      firstCall(FILE_UPLOAD) ?? classLine(/CL_GUI_FRONTEND_SERVICES\s*=>\s*GUI_UPLOAD/i),
      classLine(/\bCL_GUI_(?:ALV_GRID|CUSTOM_CONTAINER|DOCKING_CONTAINER|DIALOGBOX_CONTAINER)\b/i),
    ].filter((l): l is number => !!l).sort((a, b) => a - b)[0] ?? null,
    inputs: inputsOf(ctx, texts.fields),
    screenTitles: texts.titles,
    fixedLists: fixedListsOf(calls, ctx),
    rules: ruleCount,
    headerClaim: headerClaimOf(text),
    authority: [...new Set(calls.authorityChecks.map((a) => a.object).filter((o): o is string => !!o).map((o) => o.toUpperCase()))],
  };
}
