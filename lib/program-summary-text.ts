/**
 * What a Z program is for, in words a business reader understands — one text
 * model for the four places that say it (owner, 12.10.2026: *"In general the
 * business high-level texts about what a Z program does — in First insights,
 * Analyze and Documentation, and of course in Management — must get clearly
 * better."*; roadmap 3.0.11, "In short says what the program is for"; CO
 * review F03-DOC and §7.1, FI review §6.1).
 *
 * Before this module every place wrote its own opening — "reads a file from the
 * user's PC, saves a file … decides with 87 business rules at 429 decision
 * points", "a process of 36 steps and 13 decision points" — features and code
 * counts instead of purpose, and four places with four different counts. Now
 * they all render the same **slots** from the same engine facts
 * (`lib/program-summary-facts.ts`):
 *
 *   purpose · trigger · reads · changes · result · rules · limits · level
 *
 * Rules every slot keeps:
 *   - **Purpose before counts.** The business objects, the effect (posts /
 *     changes / read-only) and the selection come first; decision points are
 *     not counted on this level at all (they stand in the process chapter).
 *   - **Only what the engine read.** No business purpose the code does not
 *     show: the code says what a program does, never why — the limits say so.
 *     A table without a glossary word is named by its code, never guessed.
 *   - **Words first, codes in parentheses.** A reader who does not read ABAP
 *     finds no table code, no ABAP keyword and no internal label outside
 *     parentheses or quotes (`businessJargon` holds the line in a spec).
 *   - **The level is always said**: reconstructed from the code, not
 *     confirmed by the business — unless a person recorded otherwise.
 *
 * Pure and engine-free (no imports beyond types): the Business view, a client
 * component, renders it as well as the server-side exports.
 */

export const PROGRAM_SUMMARY_FACTS_VERSION = 1;

export interface SummaryObject {
  /** The table as the code names it, upper case. */
  name: string;
  /** The business object in words (glossary, plural, lower case first), or null — never guessed. */
  word: string | null;
  line: number;
  /** `setting` — customizing or organisational settings (T001, TKA01, TCURX); `text` — a text table; `custom` — a Z/Y table. */
  kind: 'business' | 'setting' | 'text' | 'custom';
  /** A write reached only from a user's command — a PAI module, a list callback, `AT USER-COMMAND` (SD review, 12.10.2026). */
  onCommand?: boolean;
}

export interface SummaryAction {
  /** The function module, BAPI or transaction, upper case. */
  name: string;
  /** Its business word from the glossary — "Post goods movement". */
  word: string;
  line: number;
  via: 'interface' | 'function' | 'transaction' | 'simulated-entry';
  /** Reached only from a user's command (SD review, 12.10.2026). */
  onCommand?: boolean;
}

export interface SummaryInput {
  name: string;
  /** The selection screen's own text where the program sets one, else the field's name in words. */
  label: string;
  labelFrom: 'screen' | 'name';
  kind: 'parameter' | 'range' | 'switch';
  required: boolean;
  line: number;
  /**
   * Roadmap 3.0.13: every use of the input stands in code no run reaches
   * (`constant-gates.ts`) — it selects nothing a run does. Absent otherwise.
   */
  lockedOnly?: true;
}

export interface SummaryFixedList {
  routine: string;
  /** What one row is, in words — "segment". */
  item: string;
  /** The column names, in words — "pool", "sender", "driver". */
  columns: string[];
  rows: string[][];
  lineStart: number;
  lineEnd: number;
}

export interface ProgramSummaryFacts {
  version: number;
  program: string | null;
  kind: 'report' | 'function' | 'class' | 'unknown';
  reads: SummaryObject[];
  writes: SummaryObject[];
  changes: {
    /** `changes` — a table write, a posting call, a commit or an update task stands in the code. */
    state: 'changes' | 'none' | 'not-determined';
    actions: SummaryAction[];
    commits: number;
    /** Transactions it only opens for the user (display), with their words. */
    displayTransactions: Array<{ name: string; word: string | null; line: number }>;
    /** Places that name the table or function they change only at run time. */
    dynamic: number;
  };
  outputs: {
    list: number | null;
    fileOut: number | null;
    fileIn: number | null;
    serverIn: number | null;
    serverOut: number | null;
    print: number | null;
    mail: number | null;
    /** `CALL SCREEN` — the result shown on a screen of its own. Absent in facts stored before it was read. */
    screen?: number | null;
  };
  /**
   * The first statement that needs a user's front end — a screen, commands on a
   * list, a file on the user's PC, a GUI control — so the program runs in a
   * user's session, not as a background job (SD review, 12.10.2026). Absent in
   * facts stored before it was read.
   */
  frontEnd?: number | null;
  inputs: SummaryInput[];
  screenTitles: Array<{ text: string; line: number }>;
  fixedLists: SummaryFixedList[];
  /** Business rules fixed in the code (the rule set the Business view counts); null when not read. */
  rules: number | null;
  authority: string[];
  /**
   * The header comment's own statement of purpose (BUSINESS PURPOSE, SCOPE …),
   * verbatim — the author's claim, not the engine's reading (owner,
   * 12.10.2026). Absent in facts stored before it was read.
   */
  headerClaim?: { heading: string; text: string; lineStart: number; lineEnd: number } | null;
  /**
   * Roadmap 3.0.13 (SD review CR-A1/D01): reads that stand behind a constant
   * gate no run passes — kept out of `reads`, which says what a run reads, and
   * named here with the gate. Absent when the source has no such gate.
   */
  locked?: {
    reads: SummaryObject[];
    gate: { constant: string; value: string; line: number; stopLine: number | null; routine: string | null };
  } | null;
  /** Roadmap 3.0.13 (CR-A3): the demo flag and the demo-case switches counted apart from `rules`. Absent without a demo flag. */
  demo?: { flag: string; line: number; switches: number } | null;
  /** Roadmap 3.0.13 (CR-A2): rules and bounds the header comment states — candidates, not code facts. Absent when it states none. */
  headerRules?: { rules: number; bounds: number; range: string; lineStart: number; lineEnd: number } | null;
}

export type SummaryBasis = 'reconstructed' | 'not-determined' | 'confirmed';
export type SummarySlotKey = 'purpose' | 'trigger' | 'reads' | 'changes' | 'result' | 'rules' | 'limits' | 'level';

export interface SummaryLine {
  key: SummarySlotKey;
  text: string;
  /** Line ranges the sentence stands on. */
  anchors: Array<{ lineStart: number; lineEnd: number }>;
  basis: SummaryBasis;
}

export interface ProgramSummary {
  program: string | null;
  /** The slots in reading order; a slot with nothing to say is absent, never empty. */
  lines: SummaryLine[];
  /** The level of the whole summary, in one sentence. */
  level: SummaryLine;
}

/* ------------------------------------------------------------------ words */

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const countWord = (n: number): string => NUMBER_WORDS[n] ?? String(n);
const capital = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
const lcFirst = (text: string): string => (/^[A-Z][a-z]/.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text);
const quote = (value: string): string => `“${value}”`;

export function joinAnd(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** "Post goods movement" → "posts goods movements"; "Start workflow" → "starts workflows". */
export function actionPhrase(word: string): string {
  const [verb, ...rest] = word.trim().split(/\s+/);
  const third = /(?:s|sh|ch|x)$/i.test(verb) ? `${verb}es` : `${verb}s`;
  if (!rest.length) return lcFirst(third);
  const last = rest[rest.length - 1];
  const many = /[^aeiou]y$/i.test(last) ? `${last.slice(0, -1)}ies` : /s$/i.test(last) ? last : `${last}s`;
  // "Save the changes", "Post document": an article or a plural stays as written.
  const object = /^(?:the|a|an)$/i.test(rest[0]) ? rest.join(' ') : [...rest.slice(0, -1), many].join(' ');
  return `${lcFirst(third)} ${object.toLowerCase()}`;
}

/** "Change sales order" → "change sales orders" — the form after "can" (SD review, 12.10.2026). */
export function actionBasePhrase(word: string): string {
  const [verb] = word.trim().split(/\s+/);
  const third = actionPhrase(word);
  return `${verb.toLowerCase()}${third.slice(third.indexOf(' ') < 0 ? third.length : third.indexOf(' '))}`;
}

/** The changes the normal flow makes, and those only a user's command makes (SD review, 12.10.2026). */
function changesByFlow(f: ProgramSummaryFacts): {
  actions: SummaryAction[];
  writes: SummaryObject[];
  commandActions: SummaryAction[];
  commandWrites: SummaryObject[];
  /** Every change it makes runs only on a user's command: it is a display program first. */
  onCommandOnly: boolean;
} {
  const actions = f.changes.actions.filter((a) => !a.onCommand);
  const writes = f.writes.filter((w) => !w.onCommand);
  const commandActions = f.changes.actions.filter((a) => a.onCommand);
  const commandWrites = f.writes.filter((w) => w.onCommand);
  const onCommandOnly = f.changes.state === 'changes'
    && !actions.length && !writes.length
    && commandActions.length + commandWrites.length > 0;
  return { actions, writes, commandActions, commandWrites, onCommandOnly };
}

/** A business object as a reader names it, with its code: "cost centers (CSKS)". */
function objectName(o: SummaryObject): string {
  return o.word ? `${o.word} (${o.name})` : o.name;
}

/** The objects named by word, merged where two tables carry one word ("cost totals" for COSP and COSS). */
function objectWords(objects: readonly SummaryObject[], max = 3): { words: string[]; codes: string[]; rest: number } {
  const groups: Array<{ word: string; codes: string[] }> = [];
  for (const o of objects) {
    if (!o.word) continue;
    const head = o.word.replace(/\s*\([^)]*\)$/, '');
    const g = groups.find((x) => x.word === head);
    if (g) g.codes.push(o.name);
    else groups.push({ word: head, codes: [o.name] });
  }
  const shown = groups.slice(0, max);
  const unnamed = objects.filter((o) => !o.word).length;
  return {
    words: shown.map((g) => `${g.word} (${g.codes.join(', ')})`),
    codes: shown.flatMap((g) => g.codes),
    rest: groups.length - shown.length + unnamed,
  };
}

/** "First period (001..016)" → "first period". A label is the reader's word, not its range. */
function labelWord(label: string): string {
  return lcFirst(label.replace(/\s*\([^)]*\)\s*$/, '').replace(/[:.]+$/, '').trim());
}

/** One-word labels that are words a reader knows, not field names. */
const READABLE_ONE_WORD = /^(?:Material|Plant|Customer|Supplier|Vendor|Date|Period|Year|Currency|Amount|Quantity|Status|Company|Ledger|Version|Language|Country|Region|Batch|Order|Document|Account|Percent|Threshold|File|Test run)$/i;

const TECHNICAL_INPUT = /\b(?:file|path|filename|demo|synthetic|test|debug|variant|layout|log|alv|csv|list|spool|output|display|show|case)\b/i;

/** The inputs a run is selected by — the required ones, else the first business inputs. */
function selectionWords(inputs: readonly SummaryInput[]): string[] {
  // A label the program wrote, or a name the glossary turned into words; a
  // bare field name ("Anlkl", "Afabe") says nothing to a reader and is left out.
  const readable = (i: SummaryInput) => i.labelFrom === 'screen' || /\s/.test(i.label.trim()) || READABLE_ONE_WORD.test(i.label.trim());
  const business = inputs.filter((i) => i.kind !== 'switch' && !i.lockedOnly && readable(i) && !TECHNICAL_INPUT.test(`${i.label} ${i.name}`));
  const required = business.filter((i) => i.required);
  const chosen = (required.length ? required : business).slice(0, 6);
  const words = [...new Set(chosen.map((i) => labelWord(i.label)).filter((w) => w.length > 1))];
  // "first period" and "last period" are one "period range".
  const ranged: string[] = [];
  for (const w of words) {
    const end = /^(?:last|to|end|until)\s+(.+)$/i.exec(w);
    const startAt = end
      ? ranged.findIndex((r) => {
          const begin = /^(?:first|from|start)\s+(.+)$/i.exec(r);
          return !!begin && begin[1].toLowerCase() === end[1].toLowerCase();
        })
      : -1;
    if (end && startAt >= 0) ranged[startAt] = `${end[1]} range`;
    else ranged.push(w);
  }
  return ranged.slice(0, 4);
}

const singular = (word: string | null): string => (word ? word.toLowerCase().replace(/s$/, '') : '#');

/** Postings and creations lead, a started workflow follows: what the business gets comes first. */
const VERB_RANK = ['Post', 'Create', 'Change', 'Clear', 'Settle', 'Reverse', 'Cancel', 'Delete', 'Release', 'Block', 'Unblock', 'Book', 'Maintain', 'Start'];
function rankedActions(actions: readonly SummaryAction[]): SummaryAction[] {
  const rank = (a: SummaryAction) => {
    const i = VERB_RANK.indexOf(a.word.split(/\s+/)[0]);
    return i < 0 ? VERB_RANK.length : i;
  };
  return [...actions].sort((a, b) => rank(a) - rank(b) || a.line - b.line);
}

/** Line anchors, each line once. */
function anchorsOf(lines: ReadonlyArray<number | null | undefined>): Array<{ lineStart: number; lineEnd: number }> {
  return [...new Set(lines.filter((l): l is number => !!l))].map((l) => ({ lineStart: l, lineEnd: l }));
}

/** "Display accounting document" → "display an accounting document". */
function displayPhrase(word: string): string {
  const m = /^(\w+)\s+(.+)$/.exec(word.trim());
  if (!m) return lcFirst(word);
  const object = m[2].toLowerCase();
  return `${m[1].toLowerCase()} ${/^[aeiou]/.test(object) ? 'an' : 'a'} ${object}`;
}

const anchorOf = (line: number | null | undefined) => (line ? [{ lineStart: line, lineEnd: line }] : []);

/* ------------------------------------------------------------------ slots */

/** The fixed list that says most: one with a column that describes each row, short enough to name. */
function bestFixedList(lists: readonly SummaryFixedList[]): SummaryFixedList | null {
  const score = (l: SummaryFixedList) => (describingColumn(l) > 0 ? 4 : 0) + (l.rows.length <= 8 ? 2 : 0) + (l.columns.length >= 3 ? 1 : 0);
  const best = [...lists].sort((a, b) => score(b) - score(a) || a.lineStart - b.lineStart)[0];
  return best && score(best) >= 4 ? best : null;
}

/** A column worth naming: its values differ per row, are not numbers and do not repeat the key. */
function describingColumn(list: SummaryFixedList): number {
  const keys = list.rows.map((r) => r[0]);
  return list.columns.findIndex((_, i) => {
    if (i === 0) return false;
    const values = list.rows.map((r) => r[i] ?? '');
    return new Set(values).size === values.length
      && values.every((v) => v && !/^-?[\d.,]+$/.test(v))
      && values.every((v, r) => !v.toUpperCase().includes(keys[r].toUpperCase()));
  });
}

function fixedListSentence(list: SummaryFixedList): string | null {
  const keys = list.rows.map((r) => r[0]);
  if (keys.length > 8) return `${capital(countWord(keys.length))} ${list.item}s are fixed in the code.`;
  const keyCol = list.columns[0] || 'key';
  const describing = describingColumn(list);
  const head = `${capital(countWord(keys.length))} ${list.item}s are fixed in the code — ${keyCol}s ${joinAnd(keys.map(quote))}`;
  if (describing < 0) return `${head}.`;
  const col = list.columns[describing];
  return `${head} — each with its own ${col}: ${joinAnd(list.rows.map((r) => quote(r[describing])))}.`;
}

function purposeLine(f: ProgramSummaryFacts): SummaryLine {
  const business = f.reads.filter((o) => o.kind === 'business' || o.kind === 'custom');
  const selection = selectionWords(f.inputs);
  const selected = selection.length ? `, selected by ${joinAnd(selection)}` : '';

  const flow = changesByFlow(f);
  // The tables it reads are named as what it reads — never as the source of what
  // it changes: "changes sales orders from sales order items (VBAP)" presented a
  // read table as the origin of a different object, which the code does not show
  // (SD review, 12.10.2026). Only a file is a source the code shows.
  if (f.changes.state === 'changes' && flow.actions.length) {
    const acts = rankedActions(flow.actions).slice(0, 3);
    // A file on the application server is what an interface program posts from;
    // otherwise the business objects it reads (other than the ones it creates),
    // and an upload from the PC only when it reads nothing else.
    const sources = objectWords(business.filter((o) => !acts.some((a) => a.word.toLowerCase().includes(singular(o.word)))), 2).words;
    const from = f.outputs.serverIn
      ? ' from the lines of a file on the application server'
      : sources.length
        ? `, reading ${joinAnd(sources)}`
        : f.outputs.fileIn
          ? ' from a file the user uploads'
          : '';
    return {
      key: 'purpose',
      text: `${capital(joinAnd(acts.map((a) => actionPhrase(a.word))))} in SAP${from}${selected}.`,
      anchors: anchorsOf(acts.map((a) => a.line)),
      basis: 'reconstructed',
    };
  }
  if (f.changes.state === 'changes' && !flow.onCommandOnly) {
    const changed = objectWords(flow.writes.filter((o) => o.kind !== 'custom'), 2);
    const custom = flow.writes.filter((o) => o.kind === 'custom');
    const parts = [
      changed.words.length ? `changes ${joinAnd(changed.words)}` : '',
      custom.length ? `records entries in ${custom.length === 1 ? `a custom table (${custom[0].name})` : `${countWord(custom.length)} custom tables (${custom.map((c) => c.name).join(', ')})`}` : '',
    ].filter(Boolean);
    const source = objectWords(business.filter((o) => !f.writes.some((w) => w.name === o.name)), 2).words;
    return {
      key: 'purpose',
      text: `${capital(parts.length ? joinAnd(parts) : 'changes data')} in SAP${source.length ? `, reading ${joinAnd(source)}` : ''}${selected}.`,
      anchors: flow.writes.slice(0, 3).map((w) => ({ lineStart: w.line, lineEnd: w.line })),
      basis: 'reconstructed',
    };
  }
  const named = objectWords(business, 3);
  const what = named.words.length
    ? joinAnd([...named.words, ...(named.rest > 0 ? [plural(named.rest, 'more table')] : [])])
    : business.length
      ? plural(business.length, 'table')
      : null;
  const noun = f.kind === 'function' ? 'function' : f.kind === 'class' ? 'class' : 'report';
  const readOnly = f.changes.state === 'none' ? 'read-only ' : '';
  // A program whose every change waits for a user's command is a display program
  // first — a cockpit: what it shows is its purpose, the changes follow in their
  // own slot (SD review, 12.10.2026).
  const shown = flow.onCommandOnly ? shownAs(f) : '';
  // Roadmap 3.0.13 (SD review CR-A1/D01): when every table read stands behind a
  // constant gate no run passes, the purpose says what a run does — it reads no
  // table — and where its data comes from, not the locked path.
  if (!what && f.locked && f.locked.reads.length) {
    const own = f.demo ? `; it works on data the program builds itself (demo switch ${f.demo.flag})` : '';
    return {
      key: 'purpose',
      text: `A ${readOnly}${noun} that reads no database table on the path a run can take${own}${selected}${shown}.`,
      anchors: anchorsOf([f.demo?.line, f.locked.gate.line]),
      basis: 'reconstructed',
    };
  }
  const text = what
    ? `A ${readOnly}${noun} on ${what}${selected}${shown}.`
    : f.inputs.length || f.outputs.list
      ? `A ${readOnly}${noun} that reads no table by name${selected}${shown}.`
      : `A ${readOnly}${noun}; the code names no table it reads.`;
  return {
    key: 'purpose',
    text,
    anchors: anchorsOf([...business.slice(0, 3).map((o) => o.line), ...(shown ? [f.outputs.list, f.outputs.screen] : [])]),
    basis: 'reconstructed',
  };
}

/** ", shown as a list or on a screen" — how a display program shows what it reads; empty when the code shows neither. */
function shownAs(f: ProgramSummaryFacts): string {
  const ways = [f.outputs.list ? 'as a list' : '', f.outputs.screen ? 'on a screen' : ''].filter(Boolean);
  return ways.length ? `, shown ${ways.join(' or ')}` : '';
}

function changesLine(f: ProgramSummaryFacts): SummaryLine {
  if (f.changes.state === 'not-determined') {
    return {
      key: 'changes',
      text: `Whether it posts or changes data in SAP is not determined: ${plural(f.changes.dynamic, 'place names', 'places name')} the table or function it changes only at run time.`,
      anchors: [],
      basis: 'not-determined',
    };
  }
  if (f.changes.state === 'none') {
    const display = f.changes.displayTransactions.filter((t) => t.word);
    return {
      key: 'changes',
      text: display.length
        ? `It does not post or change data in SAP; it only lets the user ${joinAnd(display.map((t) => `${displayPhrase(t.word as string)} (${t.name})`))}.`
        : 'It does not post or change data in SAP.',
      anchors: display.flatMap((t) => anchorOf(t.line)),
      basis: 'reconstructed',
    };
  }
  const flow = changesByFlow(f);
  const partsOf = (actions: readonly SummaryAction[], written: readonly SummaryObject[], base: boolean): string[] => {
    const phrase = base ? actionBasePhrase : actionPhrase;
    const acts = rankedActions(actions).map((a) => `${phrase(a.word)} (${a.name}${a.via === 'simulated-entry' ? ', by simulated entry' : ''})`);
    const standard = written.filter((w) => w.kind !== 'custom').map(objectName);
    const custom = written.filter((w) => w.kind === 'custom');
    const writes = [
      ...standard.slice(0, 3),
      ...(standard.length > 3 ? [plural(standard.length - 3, 'more table')] : []),
      ...(custom.length ? [`${custom.length === 1 ? 'a custom table' : `${countWord(custom.length)} custom tables`} (${custom.map((c) => c.name).join(', ')})`] : []),
    ];
    return [
      acts.length ? joinAnd(acts) : '',
      writes.length ? `${base ? 'change' : 'changes'} ${joinAnd(writes)}` : '',
    ].filter(Boolean);
  };
  const parts = partsOf(flow.actions, flow.writes, false);
  // What only a user's command changes is said as such: "On a user's command it
  // can also change …" (SD review, 12.10.2026).
  const onCommand = partsOf(flow.commandActions, flow.commandWrites, true);
  const commandText = onCommand.length ? `on a user's command it can also ${joinAnd(onCommand)} in SAP` : '';
  const text = flow.onCommandOnly
    ? `${capital(commandText)}.`
    : `It ${parts.length ? joinAnd(parts) : 'changes data'} in SAP${commandText ? `; ${commandText}` : ''}.`;
  return {
    key: 'changes',
    text,
    anchors: anchorsOf([...f.changes.actions.map((a) => a.line), ...f.writes.map((w) => w.line)].slice(0, 4)),
    basis: 'reconstructed',
  };
}

function readsLine(f: ProgramSummaryFacts): SummaryLine | null {
  const main = f.reads.filter((o) => o.kind === 'business' || o.kind === 'custom');
  const settings = f.reads.filter((o) => o.kind === 'setting' || o.kind === 'text');
  const named = objectWords(main, 4);
  const parts: string[] = [];
  if (named.words.length) parts.push(...named.words);
  const unnamed = main.filter((o) => !o.word);
  // Named objects beyond the four shown are counted, never dropped.
  const namedRest = named.rest - unnamed.length;
  if (namedRest > 0) parts.push(plural(namedRest, 'more table'));
  if (unnamed.length) parts.push(unnamed.length <= 3 ? `${unnamed.length === 1 ? 'table' : 'tables'} ${joinAnd(unnamed.map((u) => u.name))}` : plural(unnamed.length, 'further table'));
  if (settings.length) {
    const texts = settings.some((o) => o.kind === 'text');
    const noun = texts && settings.some((o) => o.kind === 'setting') ? 'settings and text table' : texts ? 'text table' : 'settings table';
    parts.push(`${plural(settings.length, noun)} (${settings.map((o) => o.name).join(', ')})`);
  }
  const files = [f.outputs.fileIn ? 'a file the user uploads from the PC' : '', f.outputs.serverIn ? 'a file on the application server' : ''].filter(Boolean);
  parts.push(...files);
  if (!parts.length) return null;
  return {
    key: 'reads',
    text: `It reads ${joinAnd(parts)}.`,
    anchors: anchorsOf([...main.slice(0, 3).map((o) => o.line), f.outputs.fileIn, f.outputs.serverIn]),
    basis: 'reconstructed',
  };
}

/**
 * The reads no run makes (roadmap 3.0.13): named, with the gate that keeps them
 * locked, so a reader learns they exist and why they do not count.
 */
function lockedLine(f: ProgramSummaryFacts): SummaryLine | null {
  const locked = f.locked;
  if (!locked || !locked.reads.length) return null;
  const main = locked.reads.filter((o) => o.kind === 'business' || o.kind === 'custom');
  const named = objectWords(main.length ? main : locked.reads, 3);
  const what = joinAnd([...named.words, ...(named.rest > 0 ? [plural(named.rest, 'more table')] : [])]) || plural(locked.reads.length, 'table');
  const g = locked.gate;
  const value = /^space$/i.test(g.value) ? 'blank (space)' : g.value;
  const where = g.routine ? ` ${g.routine.toLowerCase()}` : ' the routine';
  return {
    key: 'reads',
    text: `Its reads of ${what} are locked: the constant ${g.constant} is ${value}, so the check at L${g.line} always ends${where}${g.stopLine ? ` with an error at L${g.stopLine}` : ''} — no run reaches them.`,
    anchors: anchorsOf([g.line, g.stopLine, ...locked.reads.slice(0, 2).map((o) => o.line)]),
    basis: 'reconstructed',
  };
}

function resultLine(f: ProgramSummaryFacts): SummaryLine | null {
  const o = f.outputs;
  const also = [
    o.fileOut ? "save it as a file on the user's PC" : '',
    o.serverOut ? 'write a file on the application server' : '',
    o.print ? 'print it' : '',
    o.mail ? 'send it by mail' : '',
  ].filter(Boolean);
  const anchors = [o.list, o.fileOut, o.serverOut, o.print, o.mail].filter((l): l is number => !!l).flatMap(anchorOf);
  // A display program's purpose already says it shows a list (SD review, 12.10.2026).
  if (o.list && changesByFlow(f).onCommandOnly) {
    return also.length ? { key: 'result', text: `It can ${joinAnd(also).replace(/\bit\b/, 'the list')}.`, anchors, basis: 'reconstructed' } : null;
  }
  if (o.list) {
    return { key: 'result', text: `The result is a list on screen${also.length ? `; it can also ${joinAnd(also)}` : ''}.`, anchors, basis: 'reconstructed' };
  }
  if (also.length) {
    return { key: 'result', text: `The result: it can ${joinAnd(also)}.`, anchors, basis: 'reconstructed' };
  }
  if (f.changes.state === 'changes') return null;
  return { key: 'result', text: 'The code shows no list, file or message as its result.', anchors: [], basis: 'not-determined' };
}

function triggerLine(f: ProgramSummaryFacts): SummaryLine {
  if (f.kind === 'function') return { key: 'trigger', text: 'Another program calls it; the caller is not in this code.', anchors: [], basis: 'not-determined' };
  if (f.kind === 'class') return { key: 'trigger', text: 'Other programs call its methods; the callers are not in this code.', anchors: [], basis: 'not-determined' };
  if (f.kind === 'unknown') return { key: 'trigger', text: 'The code does not show what starts it.', anchors: [], basis: 'not-determined' };
  // The selection itself is said in the purpose ("selected by …"); here the
  // inputs are counted, so the line stays one short sentence (≤ 20 words).
  // A screen, the user's commands on a list or a file on the user's PC need the
  // user's front end: such a program is not said to run as a background job
  // (SD review, 12.10.2026).
  const how = f.frontEnd ? "; it runs in the user's session" : ', or it runs as a background job';
  return {
    key: 'trigger',
    text: f.inputs.length
      ? `A user starts it from a selection screen with ${plural(f.inputs.length, 'input')}${how}.`
      : `A user starts it without a selection screen${how}.`,
    anchors: anchorsOf([f.inputs[0]?.line, f.frontEnd]),
    basis: 'reconstructed',
  };
}

function rulesLine(f: ProgramSummaryFacts): SummaryLine | null {
  if (f.rules === null) return null;
  // Roadmap 3.0.13: demo-case switches are counted apart (CR-A3), and the rules
  // the header states are named as what they are — candidates (CR-A2).
  const apart = f.demo && f.demo.switches > 0
    ? `; ${plural(f.demo.switches, 'demo-case switch', 'demo-case switches')} (${f.demo.flag}) ${f.demo.switches === 1 ? 'is' : 'are'} counted apart — test data, not rules`
    : '';
  const h = f.headerRules;
  const stated = h && h.rules + h.bounds > 0
    ? ` The header comment states ${joinAnd([
        h.rules ? `${plural(h.rules, 'rule')}${h.range ? ` (${h.range})` : ''}` : '',
        h.bounds ? plural(h.bounds, 'input bound') : '',
      ].filter(Boolean))} — candidates in the rule register, stated in the header, not read from code.`
    : '';
  const anchors = h ? [{ lineStart: h.lineStart, lineEnd: h.lineEnd }] : [];
  if (f.rules === 0) {
    return { key: 'rules', text: `No business rule fixed in the code was found${apart}.${stated}`, anchors, basis: 'reconstructed' };
  }
  return {
    key: 'rules',
    text: `${capital(plural(f.rules, 'business rule'))} ${f.rules === 1 ? 'is' : 'are'} fixed in the code${apart}.${stated}`,
    anchors,
    basis: 'reconstructed',
  };
}

export interface ProgramSummaryOptions {
  /** A person recorded the business reading — the level then says confirmed. */
  confirmed?: { by?: string | null; on?: string | null } | null;
}

export const LEVEL_RECONSTRUCTED = 'Reconstructed from the code — not confirmed by the business.';

/** The summary, slot by slot. */
export function programSummary(f: ProgramSummaryFacts, options: ProgramSummaryOptions = {}): ProgramSummary {
  const lines: SummaryLine[] = [purposeLine(f)];
  const list = bestFixedList(f.fixedLists);
  if (list) {
    const sentence = fixedListSentence(list);
    if (sentence) lines.push({ key: 'purpose', text: sentence, anchors: [{ lineStart: list.lineStart, lineEnd: list.lineEnd }], basis: 'reconstructed' });
  }
  lines.push(changesLine(f));
  const reads = readsLine(f);
  if (reads) lines.push(reads);
  const locked = lockedLine(f);
  if (locked) lines.push(locked);
  const result = resultLine(f);
  if (result) lines.push(result);
  lines.push(triggerLine(f));
  const rules = rulesLine(f);
  if (rules) lines.push(rules);
  lines.push({
    key: 'limits',
    text: 'Why the program exists is not written in its code: this says what it does, not what it is for in your company.',
    anchors: [],
    basis: 'not-determined',
  });
  const c = options.confirmed;
  const level: SummaryLine = c
    ? { key: 'level', text: `Confirmed by the business${c.by ? ` (${c.by}${c.on ? `, ${c.on}` : ''})` : ''}.`, anchors: [], basis: 'confirmed' }
    : { key: 'level', text: LEVEL_RECONSTRUCTED, anchors: [], basis: 'reconstructed' };
  return { program: f.program, lines, level };
}

/* -------------------------------------------------------------- renderings */

/**
 * The Business view's short form: purpose, what it changes, the result and who
 * starts it — two to four sentences, then the level. Simple on top; the reads,
 * the rules and the limits stand one level down.
 */
export function businessInShort(summary: ProgramSummary, options: { codes?: boolean } = {}): SummaryLine[] {
  const pick = (key: SummarySlotKey) => summary.lines.filter((l) => l.key === key);
  const purpose = pick('purpose');
  const changes = pick('changes');
  // A purpose that already says what it changes ("Posts goods movements in SAP") needs no second sentence on it.
  const changesSaid = !!summary.lines[0]?.text && !/^A /.test(summary.lines[0].text) && changes[0]?.basis !== 'not-determined';
  const lines = [...purpose, ...(changesSaid ? [] : changes), ...pick('result'), ...pick('trigger')];
  return options.codes === false ? lines.map((l) => ({ ...l, text: withoutCodes(l.text) })) : lines;
}

/**
 * A sentence without its code parentheses — "cost centers (CSKS)" → "cost
 * centers" — for the Business view, whose reader does not need the table
 * names on top (they stand one level down, with the lines). Only a
 * parenthesis made of code-shaped names goes; "(Controlling area, …)" stays.
 */
export function withoutCodes(text: string): string {
  return text
    .replace(/\s*\((?:[A-Z][A-Z0-9_/]{2,}(?:,\s*|, by simulated entry)?)+\)/g, '')
    .replace(/\s+([,.;])/g, '$1');
}

/** The short form as one paragraph — for a print sheet, a meta line or a prompt. */
export function businessInShortText(summary: ProgramSummary, options: { codes?: boolean } = {}): string {
  return businessInShort(summary, options).map((l) => l.text).join(' ');
}

/**
 * Management's form: what it is, and what a keep / rebuild / retire decision
 * has to know from the code — whether it changes data in SAP, how many rules a
 * replacement must keep, change or drop on purpose, and the level. No money:
 * amounts arise only in Economics (ADR-022).
 */
export interface RuleStateTally {
  total: number;
  open: number;
  approved: number;
  'changed-on-purpose': number;
}

/**
 * What the normal flow changes, then what a user's command can also change —
 * as the changes line says it: the
 * command-only changes were folded into the normal ones, so a change behind a
 * button read as one the program makes on every run.
 */
function mixedFlowChanges(flow: ReturnType<typeof changesByFlow>): string {
  const normal = joinAnd([
    ...rankedActions(flow.actions).map((a) => actionPhrase(a.word)),
    ...(flow.writes.length ? [`writes ${plural(flow.writes.length, 'table')} directly`] : []),
  ]);
  const onCommand = joinAnd([
    ...rankedActions(flow.commandActions).map((a) => actionBasePhrase(a.word)),
    ...(flow.commandWrites.length ? [`write ${plural(flow.commandWrites.length, 'table')} directly`] : []),
  ]);
  // Neither said (a change the engine sees but cannot name): no empty dash clause.
  const said = normal || (onCommand ? 'changes data' : '');
  return said ? ` — it ${said}${onCommand ? `; on a user's command it can also ${onCommand}` : ''} —` : ',';
}

export function managementInShort(
  summary: ProgramSummary,
  f: ProgramSummaryFacts,
  options: { level?: boolean; rules?: RuleStateTally | null } = {},
): string {
  const purpose = summary.lines.find((l) => l.key === 'purpose')?.text ?? '';
  const flow = changesByFlow(f);
  const changes = f.changes.state === 'none'
    ? 'it posts and changes nothing in SAP'
    : f.changes.state === 'changes' && flow.onCommandOnly
      // SD review, 12.10.2026: a cockpit that changes data only on a user's command.
      ? `it changes data in SAP only on a user's command — it can ${joinAnd([...rankedActions(flow.commandActions).map((a) => actionBasePhrase(a.word)), ...(flow.commandWrites.length ? [`write ${plural(flow.commandWrites.length, 'table')} directly`] : [])])} — so a replacement or a retirement has to take these changes over or stop them on purpose`
      : f.changes.state === 'changes'
        ? `it changes data in SAP${mixedFlowChanges(flow)} so a replacement or a retirement has to take these changes over or stop them on purpose`
        : 'whether it changes data in SAP is not determined';
  // The rule register's states when they are known (owner 12.10.2026: "66
  // business rules … 66 still open", the counts of the delivery package);
  // without them, the count from the code and what a decision has to do.
  const t = options.rules ?? null;
  const rules = t
    ? t.total === 0
      ? '; no business rule fixed in its code was found'
      : `; ${plural(t.total, 'business rule')} ${t.total === 1 ? 'is' : 'are'} fixed in its code — ${joinAnd([
          `${t.open} still open`,
          ...(t.approved ? [`${t.approved} approved`] : []),
          ...(t['changed-on-purpose'] ? [`${t['changed-on-purpose']} changed on purpose`] : []),
        ])}`
    : f.rules === null
      ? ''
      : f.rules === 0
        ? '; no business rule fixed in its code was found'
        : `; ${plural(f.rules, 'business rule')} ${f.rules === 1 ? 'is' : 'are'} fixed in its code and must be kept, changed or dropped on purpose`;
  return `${purpose} For the decision: ${changes}${rules}.${options.level === false ? '' : ` ${summary.level.text}`}`;
}

/* --------------------------------------------------------- stored facts */

/** Facts as stored with a documentation; null when absent, of an older version or malformed. */
export function readProgramSummaryFacts(value: unknown): ProgramSummaryFacts | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Partial<ProgramSummaryFacts>;
  if (v.version !== PROGRAM_SUMMARY_FACTS_VERSION) return null;
  if (!Array.isArray(v.reads) || !Array.isArray(v.writes) || !Array.isArray(v.inputs) || !Array.isArray(v.fixedLists)) return null;
  if (!v.changes || typeof v.changes !== 'object' || !Array.isArray(v.changes.actions)) return null;
  if (!v.outputs || typeof v.outputs !== 'object') return null;
  return v as ProgramSummaryFacts;
}

/* ---------------------------------------------------------------- guards */

/** Words of the code a business reader cannot follow. In a business line they stand only inside parentheses or quotes. */
// Keywords only in capitals ("select", "form" and "loop" are English words too); phrases in any case.
const JARGON_KEYWORDS = /\b(?:ABAP|FORM|PERFORM|SELECT|LOOP|ENDLOOP|BAPIs?|COMMIT WORK|DESTINATION|RFC|ALV|sy-subrc|SY-SUBRC)\b/g;
const JARGON_PHRASES = /\b(?:internal tables?|field symbols?|work areas?|structure components?|function modules?|update tasks?|subroutines?|type pools?|data elements?|selection-screen)\b/gi;

function jargonWords(text: string): string[] {
  return [...text.matchAll(JARGON_KEYWORDS), ...text.matchAll(JARGON_PHRASES)].map((m) => m[0]);
}

/**
 * The ABAP words in a sentence ("field symbol", "subroutine", "function
 * module" …) — a sentence built on them belongs to the technical appendix,
 * not to a business reading (owner 12.10.2026; CO review: "A component of the
 * structure is bound to the field symbol" eight times under "What it does
 * along the way").
 */
export function abapWords(text: string): string[] {
  const bare = text.replace(/"[^"]*"/g, ' ').replace(/“[^”]*”/g, ' ');
  return jargonWords(bare);
}

/**
 * What in a business line is jargon: an ABAP word, or a code-shaped token (a
 * table, field, routine or object name such as `CSKS`, `P_KOKRS`, `K_CSKS`)
 * outside parentheses and quotes. Allowed: ordinary acronyms (SAP, CSV, PC …).
 */
export function businessJargon(text: string): string[] {
  const bare = text.replace(/\([^)]*\)/g, ' ').replace(/“[^”]*”/g, ' ').replace(/"[^"]*"/g, ' ');
  const hits: string[] = [...jargonWords(bare)];
  const ALLOWED = new Set(['SAP', 'CSV', 'PC', 'IT', 'EUR', 'USD', 'G/L', 'S/4HANA', 'ERP', 'CO', 'FI', 'MM', 'SD', 'PDF', 'XML', 'BPMN', 'ID']);
  for (const m of bare.matchAll(/\b[A-Z][A-Z0-9_/]{2,}\b/g)) {
    if (!ALLOWED.has(m[0])) hits.push(m[0]);
  }
  // Internal names of the code: lv_total, gs_out-kostl, p_kokrs.
  for (const m of bare.matchAll(/\b[a-z]{1,4}_[a-z0-9_]+(?:-[a-z0-9_]+)?\b/g)) hits.push(m[0]);
  return [...new Set(hits)];
}
