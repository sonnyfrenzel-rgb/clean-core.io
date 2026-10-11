/**
 * What counts as a business statement — owner 11.10.2026, on the external
 * review of the FI Collection Worklist package (F-07): "526 business
 * statements, among them local structure definitions, field assignments and UI
 * label texts". The engine's sentences (`buildBusinessStatements`) are all
 * correct and all anchored; they are not all business statements. A reader of
 * the business part learns nothing from "The local structure contains KUNNR,
 * NAME1 …", "The field l_buk is set to Company code." or "The subroutine
 * add_field is called.", and four near-identical explanations of one check are
 * one explanation.
 *
 * This module sorts a sentence into a kind and folds the business ones:
 *
 *   - `structure`  a local structure or type definition,
 *   - `label`      a text a screen, a list or a column shows (a selection text,
 *                  a list header, an ALV column, "Company: is output"),
 *   - `assignment` a field or an internal row set without a condition — the
 *                  program's own bookkeeping, demo data, a formatted value,
 *   - `call`       a bare call of a routine, function or method with nothing
 *                  more said, and a loop header,
 *   - `rule`       a condition and what follows from it ("If … , …"),
 *   - `exception`  an error, warning or information message the user sees,
 *   - `data`       a read of the database ("Open customer items … are selected"),
 *   - `control`    an authorization check,
 *   - `step`       everything else the program does.
 *
 * The first four are technical: they stay in the technical appendix, complete,
 * and leave the business list. Nothing is reworded, nothing is dropped from the
 * document — a business reader sees fewer, grouped sentences, an auditor still
 * finds every one in the appendix.
 *
 * Pure and engine-free: it reads the sentence text, the grain and the anchors
 * the engine wrote, so the stored documentation can be sorted without the
 * source.
 */

export type StatementKind =
  | 'structure'
  | 'label'
  | 'assignment'
  | 'call'
  | 'rule'
  | 'exception'
  | 'data'
  | 'control'
  | 'step';

/** The kinds that are not business statements: kept in the technical appendix only. */
export const TECHNICAL_KINDS: readonly StatementKind[] = ['structure', 'label', 'assignment', 'call'];

export interface KindAnchor {
  lineStart: number;
  lineEnd: number;
}

export interface KindStatement {
  id?: string;
  text: string;
  anchors: readonly KindAnchor[];
  grain?: 'statement' | 'group';
}

/** One entry of the business list: a sentence, or one sentence standing for several near-identical ones. */
export interface StatementGroup {
  kind: StatementKind;
  /** The sentence shown — the first of the group, a folded message quoted into it. */
  text: string;
  /** Every line of every sentence it stands for, sorted, each range once. */
  anchors: KindAnchor[];
  /** How many sentences of the engine it stands for (1 = itself). */
  count: number;
  /** The near-identical sentences folded into it — the appendix keeps them in full. */
  similar: string[];
}

const CONDITIONAL = /^(?:If|Unless|When|Without|With (?:a|no) hits?|With hits|If there is|As long as|Otherwise|Only (?:if|when))\b/i;
const OUTPUT_TRACE = /The output only proves that this point in the code was reached/i;

/** A field the code names as screen or list text: selection texts, titles, headers, ALV columns and sorts. */
const UI_FIELD = /^(?:tit_|l_|h_|lbl|txt|text-|%_|ls_header-|gs_header-|gs_fieldcat-|ls_fieldcat-|gs_sort-|ls_sort-|gs_layout-|ls_layout-|gs_event|ls_event|wa_fieldcat-|gt_fieldcat|it_fieldcat)/i;

/** "the field X is set to Y" / "the name is set to Y" / "a row is added" — one bookkeeping clause. */
const SET_CLAUSE = /^(?:the field (\S+) is set to .+|the \w+(?: \w+)? is set to .+|a row is added(?: to \S+)?|a row is inserted or overwritten|a value is formatted into \S+|\S+ is called)$/i;

function clausesOf(text: string): string[] {
  return text
    .replace(/[.;]\s*$/, '')
    .split(/,\s+(?:and\s+)?|\s+and\s+(?=(?:the field|the \w+(?: \w+)? is set|a row is added|a value is formatted|\S+ is called))/i)
    .map((c) => c.trim())
    .filter(Boolean);
}

/** True when every clause of an unconditional sentence only sets a value or adds a row. */
function isBookkeeping(text: string): boolean {
  const clauses = clausesOf(text);
  return clauses.length > 0 && clauses.every((c) => SET_CLAUSE.test(c));
}

/** The kind of one engine sentence. */
export function statementKind(text: string): StatementKind {
  const t = text.replace(/\s+/g, ' ').trim();
  if (/^The local (?:structure|type) contains /i.test(t) || /^The (?:local )?(?:structure|table type) \S+ (?:contains|consists of) /i.test(t)) return 'structure';
  if (OUTPUT_TRACE.test(t)) return 'label';
  if (/^The return value of the method /i.test(t) || /^The value \S+ is formatted into \S+/i.test(t)) return 'assignment';
  if (/\bare output(?: as a list)?\.?$/i.test(t) && !CONDITIONAL.test(t.replace(/^With hits?, /i, ''))) return 'label';
  if (/^With hits?, .+ (?:is|are) output(?: as a list)?\.?$/i.test(t)) return 'label';
  // Nothing but list output: "Worklist rows: is output, the row is output, …".
  if (!/\bmessage\b/i.test(t) && !CONDITIONAL.test(t) && clausesOf(t).every((c) => /^.{1,120} (?:is|are) output(?: as a list)?$/i.test(c))) return 'label';
  if (/^The (?:error|warning|status|information|success|termination|abort) message\b/i.test(t) || /^The warning\b/i.test(t)) return 'exception';
  if (/^The authori[sz]ation for \S+ is checked\.?$/i.test(t) || /^Without authori[sz]ation for /i.test(t)) return 'control';
  if (/^(?:Every|Each) row (?:from|of) \S+ is processed\b/i.test(t)) return 'call';
  // A routine call says only that the program goes there; what the routine does stands at its own lines.
  if (/^The subroutines? [\w,\s]+ (?:is|are) called(?: one after another)?(?:[.;]|$)/i.test(t)) return 'call';
  if (/^The (?:function module|method|class method|program|routine) \S+(?: of \S+)? is called\.?$/i.test(t)) return 'call';
  if (/^The code passes \S+ to \S+ and takes its output into \S+\.?$/i.test(t)) return 'call';
  if (/^\S+ is called and a row is added\.?$/i.test(t)) return 'call';
  if (/^The return value of the method /i.test(t) || /^The value \S+ is formatted into \S+/i.test(t)) return 'assignment';
  if (/^A row (?:of the internal table \S+ is changed; nothing is written to the database|is added\b)/i.test(t)) return 'assignment';
  if (/^A matching row is searched for in the table /i.test(t)) return 'assignment';
  if (/^The field (\S+) is set to /i.test(t)) {
    const field = /^The field (\S+)/i.exec(t)?.[1] ?? '';
    return UI_FIELD.test(field) ? 'label' : isBookkeeping(t) ? 'assignment' : 'step';
  }
  if (/^The key is set to /i.test(t)) return 'label';
  if (!CONDITIONAL.test(t) && isBookkeeping(t)) return 'assignment';
  if (CONDITIONAL.test(t)) {
    // A condition that only sets screen texts is a label, not a rule.
    const body = t.replace(/^[^,]+,\s*/, '');
    const fields = [...body.matchAll(/the field (\S+) is set to/gi)].map((m) => m[1]);
    if (fields.length && fields.every((f) => UI_FIELD.test(f)) && isBookkeeping(body)) return 'label';
    return /\b(?:error|warning) message\b/i.test(t) && !/\bis set to\b/i.test(t) ? 'exception' : 'rule';
  }
  if (/\b(?:are|is) selected\.?$/i.test(t) || /^Records from \S+ are selected/i.test(t) || /\b(?:are|is) read from\b/i.test(t)) return 'data';
  if (/^Transaction \S+ is called\b/i.test(t)) return 'step';
  return 'step';
}

export const isTechnicalKind = (kind: StatementKind): boolean => TECHNICAL_KINDS.includes(kind);

/** A business statement in the sense of the owner's rule of 11.10.2026. */
export function isBusinessKindStatement(text: string): boolean {
  return !isTechnicalKind(statementKind(text));
}

const covers = (outer: readonly KindAnchor[], inner: readonly KindAnchor[]): boolean =>
  inner.length > 0 && inner.every((a) => outer.some((o) => o.lineStart <= a.lineStart && a.lineEnd <= o.lineEnd));

const norm = (t: string) => t.replace(/\s+/g, ' ').replace(/[.;]\s*$/, '').trim().toLowerCase();
const conditionOf = (t: string): string | null => (CONDITIONAL.test(t) && !/^Otherwise\b/i.test(t) ? norm(t).replace(/,.*$/, '') : null);
const bodyOf = (t: string): string => norm(t).replace(/^(?:if|unless|when|without|with (?:a|no) hits?|with hits|if there is|as long as|otherwise|only (?:if|when))\b[^,]*,\s*/, '');

/** Whether `part` says one piece of what `whole` says: its condition, its "otherwise", or a clause of it. */
function partOf(whole: string, part: string): boolean {
  const wc = conditionOf(whole);
  const pc = conditionOf(part);
  if (wc && pc && wc === pc) return true;
  if (/^Otherwise\b/i.test(part) && /\botherwise\b/i.test(whole)) return true;
  const body = bodyOf(part);
  return body.length > 8 && norm(whole).includes(body);
}

/**
 * The shape of a sentence: what is left once the program's variable names are
 * taken out. Two sentences of one shape say the same thing about different
 * fields — "If the field p_grace is less than 0 or … greater than 30, an error
 * message is output." and the same for p_rest with the same limits.
 *
 * Numbers, quoted texts and named constants (`c_yes`, `gc_limit`) stay: they
 * are the thresholds and values a business reader checks, and an entry shows
 * only its first sentence — "> 30" and "> 60" folded into one entry printed
 * one threshold for both (QA review of 11e3bc7d90e8).
 */
const QUOTED = /“[^”]*”|"[^"]*"|'[^']*'/g;
const CONSTANT = /^(?:[glm]?c|co)_/i;
export function statementShape(text: string): string {
  const unquoted = text.split(QUOTED);
  const quoted = text.match(QUOTED) ?? [];
  return unquoted
    .map((part) => part
      .replace(/\b[a-z][\w]*[_-][\w-]*\b/gi, (name) => (CONSTANT.test(name) ? name : '«f»'))
      .replace(/\b(?:field|value|table) «f»/gi, '«f»'))
    .reduce((out, part, i) => out + part + (quoted[i] ?? ''), '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function mergeAnchors(list: readonly KindAnchor[]): KindAnchor[] {
  const seen = new Set<string>();
  const out: KindAnchor[] = [];
  for (const a of list) {
    const key = `${a.lineStart}-${a.lineEnd}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ lineStart: a.lineStart, lineEnd: a.lineEnd });
  }
  return out.sort((x, y) => x.lineStart - y.lineStart || x.lineEnd - y.lineEnd);
}

export interface BusinessStatementView {
  /** The business list: rules, exceptions, data reads, controls and steps, folded. */
  groups: StatementGroup[];
  /** How many engine sentences were not business statements, by kind — the appendix keeps them. */
  technical: Record<'structure' | 'label' | 'assignment' | 'call', number>;
  /** How many business sentences were folded into another one. */
  folded: number;
  /** Every engine sentence, as read. */
  total: number;
}

/**
 * The engine's sentences as a business list (owner 11.10.2026):
 *
 *   1. technical kinds leave the list (they stay in the appendix);
 *   2. a part sentence whose lines a preceding group sentence already covers is
 *      folded into that group ("If X, A, B and C." stands for "If X, A." …);
 *   3. a message sentence on a line of the preceding rule is quoted into it
 *      ("…, an error message is output." + "The error message “Y” is output."
 *      → "…, the error message “Y” is output.");
 *   4. sentences of one shape are one entry, with how many it stands for.
 *
 * Order: the order of the program, by the first sentence of each entry.
 */
export function businessStatementView(statements: readonly KindStatement[]): BusinessStatementView {
  const technical = { structure: 0, label: 0, assignment: 0, call: 0 };
  const kept: Array<StatementGroup & { grain: 'statement' | 'group'; own: KindAnchor[] }> = [];
  let folded = 0;
  for (const s of statements) {
    const kind = statementKind(s.text);
    if (isTechnicalKind(kind)) {
      technical[kind as keyof typeof technical] += 1;
      continue;
    }
    const anchors = mergeAnchors(s.anchors);
    const last = kept[kept.length - 1];
    // 2. a part of a sentence just before it: its lines lie in that sentence's
    // lines, and it repeats that sentence's condition, or is its "otherwise",
    // or says nothing the earlier one does not.
    const group = [...kept].reverse().slice(0, 8).find((k) => covers(k.own, anchors) && partOf(k.text, s.text));
    if (group) {
      group.count += 1;
      group.similar.push(s.text);
      folded += 1;
      continue;
    }
    // 3. the message of the rule just before it.
    const message = /^The (?:error|warning|information|status) message (“[^”]*”|"[^"]*")/i.exec(s.text);
    if (message && last && /\ban? (?:error|warning|information|status) message is output\b/i.test(last.text) && covers(last.own, anchors)) {
      last.text = last.text.replace(/\ban? ((?:error|warning|information|status) message) is output\b/i, `the $1 ${message[1]} is output`);
      last.count += 1;
      last.similar.push(s.text);
      folded += 1;
      continue;
    }
    kept.push({ kind, text: s.text.replace(/\s+/g, ' ').trim(), anchors, own: anchors, count: 1, similar: [], grain: s.grain ?? 'statement' });
  }
  // 4. one entry per shape, in program order.
  const byShape = new Map<string, (typeof kept)[number]>();
  const groups: StatementGroup[] = [];
  for (const k of kept) {
    // A message the user sees and an authorization object are what a reader looks for: never folded away.
    const names = k.kind === 'exception' || k.kind === 'control'
      ? `:${[...k.text.matchAll(/“[^”]*”|"[^"]*"|\b[A-Z][A-Z0-9_]{3,}\b/g)].map((m) => m[0]).join('|')}`
      : '';
    const shape = `${k.kind}:${statementShape(k.text)}${names}`;
    const first = byShape.get(shape);
    if (first) {
      first.count += k.count;
      first.similar.push(k.text, ...k.similar);
      first.anchors = mergeAnchors([...first.anchors, ...k.anchors]);
      folded += k.count;
      continue;
    }
    byShape.set(shape, k);
    groups.push(k);
  }
  return {
    groups: groups.map((g) => ({ kind: g.kind, text: g.text, anchors: g.anchors, count: g.count, similar: g.similar })),
    technical,
    folded,
    total: statements.length,
  };
}
