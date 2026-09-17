import {
  readStatements,
  afterKeyword,
  createLiteralScanner,
  type AbapStatement,
  type SourceRange,
} from './statement-reader';
import { readBlocks, containerAt, type BlockStructure } from './block-structure';
import { readControlFlowFrom, type Branch, type ControlFlowReport } from './control-flow';

/**
 * The numbers nobody wrote down — roadmap 2.8.
 *
 * `IF lv_dev_pct > 5.` stands in `Z_MM_PO_APPROVAL.abap` at line 412 under the
 * comment "Tolerance agreed with purchasing". The agreement is not in a
 * customizing table, not in a specification and not in anybody's head any more;
 * it is a `5` in a program. That is what this reader looks for: a literal in a
 * condition whose value carries a business decision, anchored where it stands,
 * so that step 3.5 can ask one question per candidate — keep it, change it,
 * drop it, or move it into customizing.
 *
 * **What counts as a candidate.** A literal on one side of a comparison whose
 * other side is a field or a variable: `> 5`, `= '1000'`, `IN ( 'DE', 'AT' )`,
 * `< '20240101'`, `<> 'Z1'`. A `CONSTANTS` declaration counts too, and it counts
 * *even though it has a name*: `c_critical_score TYPE i VALUE 80` is readable,
 * which is not the same as documented — the name says what the 80 is called,
 * never who agreed it or when. Both the declaration and every condition that
 * reads it are reported, because they answer different questions: where the
 * number was decided, and where it takes effect.
 *
 * **What does not count**, and is recorded under `rejected` rather than silently
 * dropped, so the exclusions can be argued with:
 *
 *   - anything compared against a system field (`sy-subrc = 0`, `sy-tabix`),
 *   - the truth values (`abap_true`, `abap_false`, `'X'`, `space`) — the rule
 *     there sits in the field, not in the literal,
 *   - a comparison against zero, which is an emptiness or division guard,
 *   - a subject that is a counter, an index or a length,
 *   - a constant of a technical type (`syrepid`, `rfcdest`, `tcode`) or one
 *     holding a path, a URL or a mail address: hard-coded, worth knowing, but
 *     not a business rule,
 *   - a literal inside a string template with an embedded expression — the
 *     `5` in `|Toleranz: { 5 }|` is a digit in a sentence, not a decided number.
 *
 * **Two things this reader will not say.** It never turns an amount into a
 * currency: `gv_amount <= '50000.00'` is 50000.00 of *something*, and the code
 * does not say of what, so the candidate carries the caveat rather than a euro
 * sign. The same for quantities and their unit. And where the affected field
 * cannot be read out of the code, `subject` is `null` with
 * `subjectKind: 'not-derivable'` instead of a plausible-sounding business term.
 * A candidate whose meaning is not derivable is still a candidate: it says
 * "a number stands here that somebody decided".
 *
 * **Where it reads.** Conditions of `IF`/`ELSEIF`, the arms of `CASE`/`WHEN`
 * (2.1 already anchors those), `CHECK` and `WHILE`, plus `CONSTANTS`
 * declarations. Deliberately not: `SELECT … WHERE` and `LOOP AT … WHERE`, which
 * select data rather than decide, and anything inside a macro body, which is
 * expanded elsewhere — `control-flow.ts` reports those under `notHandled` for
 * the same reason. No model is called and nothing is inferred beyond the text.
 */

export type RuleClass =
  | 'toleranz'
  | 'organisationseinheit'
  | 'stammdatenschlüssel'
  | 'datumsgrenze'
  | 'ausnahmeliste'
  | 'sonstiges';

export type RuleOrigin = 'if' | 'elseif' | 'when' | 'check' | 'while' | 'constant';

export type SubjectKind = 'field' | 'variable' | 'case-selector' | 'not-derivable';

export interface RuleCandidate extends SourceRange {
  /** `RC-001`, in source order. Stable for one reading of one source. */
  id: string;
  origin: RuleOrigin;
  /** The `BR-nnn` of the branch this condition belongs to, when it is one. */
  branchId?: string;
  /** Upper-cased name of the FORM, method, module or event block around it. */
  container?: string;
  /**
   * The text the value stands in, as the source writes it: the condition of an
   * `IF`, the value list of a `WHEN`, the `CONSTANTS` statement. Whitespace is
   * collapsed; `lineStart`/`lineEnd` say where to read the original.
   */
  conditionText: string;
  /**
   * Offset of the token carrying the value inside `conditionText` — the literal
   * itself, or the constant's name where the value arrived through one. The
   * line anchor alone is not enough when a condition states three rules.
   */
  valueOffset: number;
  /** The operator as the source spells it: `>`, `GT`, `<>`, `CP`, `IN`, `VALUE`. */
  operator: string;
  /** The value as the source writes it, quotes included: `5`, `'1000'`. */
  literal: string;
  /** The value without its quotes. More than one member for `IN` and `BETWEEN`. */
  values: string[];
  /** The affected field or variable — `null` when the code does not say. */
  subject: string | null;
  subjectKind: SubjectKind;
  ruleClass: RuleClass;
  /** Where the `CASE` selector of a `WHEN` candidate stands. */
  selectorAt?: SourceRange;
  /** Set when the value reached this place through a named constant. */
  viaConstant?: { name: string; value: string; declaredAt: SourceRange };
  /** The earlier candidate stating the same rule — clones, copied FORMs. */
  repeatOf?: string;
  /** What the code does not say. Never a guess, never a currency. */
  caveat?: string;
  /**
   * Shared by the candidates that compare one subject against several fixed
   * values in one construct — an exception list, or an `IF`/`ELSEIF` chain that
   * grades something (roadmap 2.8: such a chain opens as a decision table).
   */
  valueSetId?: string;
}

export type RejectionReason =
  | 'systemfeld'
  | 'technischer-wert'
  | 'null-vergleich'
  | 'zaehler'
  | 'technische-konstante'
  | 'stringtemplate'
  | 'beide-seiten-literal';

export interface RejectedLiteral extends SourceRange {
  reason: RejectionReason;
  /** The comparison as it stands, so the exclusion can be argued with. */
  text: string;
}

export interface DeclaredConstant extends SourceRange {
  /** Upper-cased, the way it is looked up. */
  name: string;
  /** As the source writes it. */
  written: string;
  type?: string;
  /** The value without its quotes. */
  value: string;
  /** The value as the source writes it. */
  literal: string;
  /** True when the constant binds the program to a technical thing, not a rule. */
  technical: boolean;
}

export interface BusinessRuleReport {
  candidates: RuleCandidate[];
  /** Literals that were seen and not reported, with the reason. */
  rejected: RejectedLiteral[];
  /** Every `CONSTANTS` declaration read, technical ones included. */
  constants: DeclaredConstant[];
}

/* ------------------------------------------------------------------ names */

/**
 * The name lists. Every one of them classifies by what the ABAP data
 * dictionary calls the field, not by what a value looks like — `WERKS` is a
 * plant whatever stands in it, and a literal on its own never says what it is.
 */
const ORG_UNIT = new Set([
  'bukrs', 'werks', 'werk', 'vkorg', 'vtweg', 'spart', 'ekorg', 'ekgrp', 'lgort',
  'kokrs', 'gsber', 'bwkey', 'vkbur', 'vkgrp', 'kostl', 'prctr', 'vstel', 'lgnum',
  'plant', 'company', 'salesorg', 'purchorg',
]);

/** Keys and classifications that identify a master-data object. */
const MASTER_DATA = new Set([
  'kunnr', 'lifnr', 'matnr', 'pernr', 'equnr', 'partner', 'parnr', 'kunde',
  'lieferant', 'customer', 'vendor', 'supplier', 'material', 'ktokd', 'ktokk',
  'mtart', 'matkl', 'kdgrp', 'konzs', 'bpkind',
]);

const DATE_FIELD = new Set([
  'datum', 'date', 'budat', 'erdat', 'aedat', 'lfdat', 'bldat', 'zfbdt', 'vdatu',
  'edatu', 'laufd', 'day', 'days', 'tag', 'tage', 'monat', 'month', 'jahr', 'year',
  'frist', 'deadline', 'valid', 'gueltig',
]);

/** Amount fields — a number compared against one says nothing about currency. */
const MONEY_FIELD = new Set([
  'netwr', 'wrbtr', 'dmbtr', 'kbetr', 'kwert', 'brtwr', 'preis', 'price', 'betrag',
  'amount', 'budget', 'limit', 'saldo', 'kosten', 'cost', 'fee', 'umsatz', 'revenue',
]);

/** Quantity fields — the same, for the unit. */
const QUANTITY_FIELD = new Set([
  'menge', 'kwmeng', 'labst', 'lfimg', 'erfmg', 'bdmng', 'qty', 'quantity',
  'anzahl', 'stueck', 'gewicht', 'brgew', 'ntgew', 'volumen', 'volume', 'weight',
]);

/** Counters, indexes and lengths. A bound on one of these is not a rule. */
const TECHNICAL_SUBJECT = new Set([
  'subrc', 'tabix', 'index', 'idx', 'counter', 'count', 'cnt', 'lines', 'nlines',
  'len', 'length', 'retcode', 'rc', 'offset', 'pos', 'loop', 'iter',
]);

/** Dictionary types that bind the program to a technical thing. */
const TECHNICAL_TYPE = new Set([
  'syrepid', 'rfcdest', 'tcode', 'tabname', 'fieldname', 'progname', 'dynnr',
  'msgid', 'msgnr', 'abap_bool', 'sychar01', 'repid', 'cprog', 'funcname',
  'devclass', 'trkorr', 'guid', 'uzeit',
]);

const TRUTH_VALUE = new Set(['x', '-', '']);

/** The word operands that are technical constants rather than values. */
const TECHNICAL_WORD = /^(abap_true|abap_false|abap_on|abap_off|abap_undefined|abap_unknown|space)$/i;

const SYSTEM_FIELD = /^(sy|syst)-/i;

/* ------------------------------------------------------------- tokenising */

type TokenKind = 'text' | 'template' | 'number' | 'word' | 'punct';

interface Token {
  text: string;
  /** Offset in the text that was tokenised. */
  start: number;
  literal: boolean;
  kind: TokenKind;
}

function classifyToken(text: string, start: number, fromLiteral: boolean): Token {
  if (fromLiteral) {
    const kind: TokenKind = text.startsWith('|') ? 'template' : 'text';
    return { text, start, literal: true, kind };
  }
  if (/^[+-]?\d+(\.\d+)?$/.test(text)) return { text, start, literal: true, kind: 'number' };
  return { text, start, literal: false, kind: 'word' };
}

/**
 * The condition, cut into tokens, with the literal rule taken from
 * `createLiteralScanner()` rather than written again.
 *
 * Whitespace separates, and `(`, `)` and `,` stand on their own so that
 * `IN ( 'DE', 'AT' )` reads as a list whether or not the source put blanks
 * around the brackets. Operators are *not* split out of a word, because ABAP
 * demands blanks around them and `lo_order->is_valid( )` and
 * `cl_abap_char_utilities=>cr_lf` are full of `->` and `=>` that a symbol
 * splitter would tear in half.
 */
function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  // `createLiteralScanner()` answers one question per character — "is this one
  // outside every literal?" — and keeps its state to itself. This tokeniser needs
  // two: whether the character belongs to a literal, and whether the literal is
  // still open after it, so that a closing quote ends the token rather than
  // starting the next one. Both come from the same scanner: a character that is
  // not a delimiter is a pure state read, so asking it about a NUL byte reports
  // the state without changing it. Written here rather than in the scanner,
  // because the scanner is shared with three other readers and a second method
  // on it would be a second rule for them to get wrong.
  const outside = createLiteralScanner();
  const literals = {
    /** True when `ch` belongs to a literal — its delimiters included. */
    consume: (ch: string) => !outside(ch),
    /** True while a literal is still open, asked without consuming anything. */
    inLiteral: () => !outside(' '),
  };
  let start = -1;
  let buffer = '';
  let fromLiteral = false;

  const flush = () => {
    if (start < 0) return;
    tokens.push(classifyToken(buffer, start, fromLiteral));
    start = -1;
    buffer = '';
    fromLiteral = false;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const wasInside = literals.inLiteral();
    if (literals.consume(ch)) {
      // A literal opening right after a word — rare, but it ends the word.
      if (!wasInside && start >= 0 && !fromLiteral) flush();
      if (start < 0) start = i;
      fromLiteral = true;
      buffer += ch;
      if (!literals.inLiteral()) flush();
      continue;
    }
    if (/\s/.test(ch)) { flush(); continue; }
    if (ch === '(' || ch === ')' || ch === ',') {
      flush();
      tokens.push({ text: ch, start: i, literal: false, kind: 'punct' });
      continue;
    }
    if (start < 0) start = i;
    buffer += ch;
  }
  flush();
  return tokens;
}

function unquote(token: Token): string {
  if (token.kind === 'text') {
    const quote = token.text[0];
    const body = token.text.length >= 2 && token.text.endsWith(quote)
      ? token.text.slice(1, -1)
      : token.text.slice(1);
    return body.split(quote + quote).join(quote);
  }
  if (token.kind === 'template') {
    return token.text.length >= 2 && token.text.endsWith('|')
      ? token.text.slice(1, -1)
      : token.text.slice(1);
  }
  return token.text;
}

/** Operators, mapped to the only two things this reader needs to know. */
const EQUALITY_OPERATORS = new Set([
  '=', 'EQ', '<>', '><', 'NE', 'CP', 'NP', 'CS', 'NS', 'CA', 'NA', 'CO', 'CN',
]);
const RELATIONAL_OPERATORS = new Set(['<', 'LT', '>', 'GT', '<=', 'LE', '>=', 'GE']);

function operatorOf(token: Token): string | null {
  if (token.literal || token.kind === 'punct') return null;
  const upper = token.text.toUpperCase();
  if (EQUALITY_OPERATORS.has(upper) || RELATIONAL_OPERATORS.has(upper)) return upper;
  if (upper === 'IN' || upper === 'BETWEEN') return upper;
  return null;
}

/* ------------------------------------------------------------ classifying */

/**
 * The words that describe what a subject *is*.
 *
 * For a field reference only the last segment counts: `cs_customer-land1` is a
 * country, not a customer, and reading the structure's name as well made a list
 * of three countries look like a master-data key. For a plain variable — or for
 * a constant, where the dictionary type is appended — every part counts, which
 * is how `lv_days_old` and `c_purch_org TYPE ekorg` are read.
 */
function nameParts(name: string): string[] {
  const flat = name.toLowerCase().replace(/[<>]/g, '');
  const field = flat.includes('-') || flat.includes('>')
    ? flat.split(/->|-/).filter(Boolean).pop() ?? flat
    : flat;
  return field.split(/[_/=.\s]+/).filter(Boolean);
}

function hits(name: string | null, set: Set<string>): boolean {
  if (!name) return false;
  return nameParts(name).some((part) => set.has(part));
}

/** `'20240101'` and `'2024-01-01'` — a date somebody wrote into the code. */
function looksLikeDate(value: string): boolean {
  const compact = /^(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/;
  const dashed = /^(19|20)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
  return compact.test(value) || dashed.test(value);
}

function looksNumeric(value: string): boolean {
  return /^[+-]?\d+([.,]\d+)?$/.test(value.trim());
}

function isZero(value: string): boolean {
  return looksNumeric(value) && Number(value.replace(',', '.')) === 0;
}

/**
 * A value that binds the program to something technical rather than to a rule:
 * a path, a URL, a mail address, a transport or a program name.
 */
function technicalValue(value: string): boolean {
  if (/@/.test(value) && /\./.test(value)) return true;
  if (/^[a-z]+:\/\//i.test(value)) return true;
  if (/^[a-z]:[\\/]/i.test(value)) return true;
  if (/[\\/].*[\\/]/.test(value)) return true;
  return false;
}

interface Caveat { text: string }

function caveatFor(subject: string | null, value: string): Caveat | null {
  if (!looksNumeric(value)) return null;
  if (hits(subject, MONEY_FIELD)) {
    return { text: 'Betrag, Währung nicht aus dem Code ableitbar' };
  }
  if (hits(subject, QUANTITY_FIELD)) {
    return { text: 'Menge, Einheit nicht aus dem Code ableitbar' };
  }
  return null;
}

function classOf(
  subject: string | null,
  values: string[],
  operator: string,
  inValueSet: boolean,
): RuleClass {
  if (values.some(looksLikeDate) || hits(subject, DATE_FIELD)) return 'datumsgrenze';
  if (hits(subject, ORG_UNIT)) return 'organisationseinheit';
  if (hits(subject, MASTER_DATA)) return 'stammdatenschlüssel';
  if (inValueSet || operator === 'IN') return 'ausnahmeliste';
  if (
    (RELATIONAL_OPERATORS.has(operator) || operator === 'BETWEEN')
    && values.some(looksNumeric)
  ) return 'toleranz';
  if (operator === 'VALUE' && values.every(looksNumeric)) return 'toleranz';
  return 'sonstiges';
}

/* ---------------------------------------------------------------- reading */

/** One finding before it is grouped, classified and numbered. */
interface Draft {
  origin: RuleOrigin;
  branchId?: string;
  container?: string;
  conditionText: string;
  valueOffset: number;
  operator: string;
  literal: string;
  values: string[];
  subject: string | null;
  subjectKind: SubjectKind;
  /**
   * What the subject is classified by. The subject itself, except for a
   * constant, where the dictionary type says more than the name does:
   * `c_purch_org TYPE ekorg` is a purchasing organisation because of the
   * `ekorg`, and a reader who only had the name would call it a threshold.
   */
  classifyName: string | null;
  selectorAt?: SourceRange;
  viaConstant?: { name: string; value: string; declaredAt: SourceRange };
  lineStart: number;
  lineEnd: number;
  /** Scope the value set is grouped in — one branch, or one statement. */
  scope: string;
}

function subjectKindOf(token: Token | null): SubjectKind {
  if (!token || token.kind === 'punct' || token.literal) return 'not-derivable';
  return token.text.includes('-') || token.text.includes('>') ? 'field' : 'variable';
}

interface ConstantIndex {
  /** Name → the one declaration, or null when the name is declared twice. */
  byName: Map<string, DeclaredConstant | null>;
}

function readConstants(
  statements: AbapStatement[],
  structure: BlockStructure,
): { declared: DeclaredConstant[]; index: ConstantIndex } {
  const declared: DeclaredConstant[] = [];
  const byName = new Map<string, DeclaredConstant | null>();

  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i];
    if (statement.keyword !== 'CONSTANTS') continue;
    if (statement.nativeSql) continue;
    if (structure.enclosing[i]?.some((block) => block.kind === 'define')) continue;

    const body = afterKeyword(statement);
    if (/^(BEGIN|END)\s+OF\b/i.test(body)) continue;

    const tokens = tokenize(body);
    if (!tokens.length || tokens[0].literal) continue;
    const written = tokens[0].text;

    const typeAt = tokens.findIndex((t) => !t.literal && t.text.toUpperCase() === 'TYPE');
    const type = typeAt >= 0 ? tokens[typeAt + 1]?.text : undefined;

    const valueAt = tokens.findIndex((t) => !t.literal && t.text.toUpperCase() === 'VALUE');
    const valueToken = valueAt >= 0 ? tokens[valueAt + 1] : undefined;
    // `VALUE IS INITIAL` decides nothing.
    if (!valueToken || !valueToken.literal) continue;

    const value = unquote(valueToken);
    const technical =
      (type !== undefined && TECHNICAL_TYPE.has(type.toLowerCase().replace(/_d$/, '')))
      || (type !== undefined && /smtp|url|path/i.test(type))
      || TRUTH_VALUE.has(value.trim().toLowerCase())
      || technicalValue(value);

    const entry: DeclaredConstant = {
      name: written.toUpperCase(),
      written,
      type,
      value,
      literal: valueToken.text,
      technical,
      lineStart: statement.lineStart,
      lineEnd: statement.lineEnd,
    };
    declared.push(entry);
    byName.set(entry.name, byName.has(entry.name) ? null : entry);
  }

  return { declared, index: { byName } };
}

interface Reader {
  rejected: RejectedLiteral[];
  drafts: Draft[];
  constants: ConstantIndex;
}

function reject(
  reader: Reader,
  reason: RejectionReason,
  text: string,
  range: SourceRange,
): void {
  reader.rejected.push({
    reason,
    text,
    lineStart: range.lineStart,
    lineEnd: range.lineEnd,
  });
}

/** The value a token stands for — its own, or the one its constant holds. */
interface Valued {
  literal: string;
  values: string[];
  viaConstant?: { name: string; value: string; declaredAt: SourceRange };
  technicalConstant?: boolean;
}

function valueOf(token: Token, constants: ConstantIndex): Valued | null {
  if (token.literal) return { literal: token.text, values: [unquote(token)] };
  if (token.kind === 'punct') return null;
  const constant = constants.byName.get(token.text.toUpperCase());
  if (!constant) return null;
  return {
    literal: constant.literal,
    values: [constant.value],
    viaConstant: {
      name: constant.written,
      value: constant.value,
      declaredAt: { lineStart: constant.lineStart, lineEnd: constant.lineEnd },
    },
    technicalConstant: constant.technical,
  };
}

/**
 * One comparison, weighed. Returns the draft, or records why there is none.
 */
function weigh(
  reader: Reader,
  context: {
    origin: RuleOrigin;
    branchId?: string;
    container?: string;
    conditionText: string;
    range: SourceRange;
    scope: string;
  },
  left: Token | null,
  operatorToken: Token,
  right: Token | null,
  extraValues?: { literal: string; values: string[]; offset: number },
): void {
  const operator = operatorOf(operatorToken);
  if (!operator) return;
  const { conditionText, range } = context;
  // A rejection names the comparison it dropped, not the whole condition: a
  // condition may state three rules and drop only one of them.
  const comparison = [left?.text, operatorToken.text, extraValues?.literal ?? right?.text]
    .filter(Boolean)
    .join(' ');

  const leftValue = left ? valueOf(left, reader.constants) : null;
  const rightValue = right ? valueOf(right, reader.constants) : null;

  let subjectToken: Token | null;
  let valued: Valued | null;
  let offset: number;

  if (extraValues) {
    subjectToken = left;
    valued = { literal: extraValues.literal, values: extraValues.values };
    offset = extraValues.offset;
  } else if (rightValue && !leftValue) {
    subjectToken = left;
    valued = rightValue;
    offset = right ? right.start : -1;
  } else if (leftValue && !rightValue) {
    subjectToken = right;
    valued = leftValue;
    offset = left ? left.start : -1;
  } else if (leftValue && rightValue) {
    reject(reader, 'beide-seiten-literal', comparison, range);
    return;
  } else {
    return; // no literal on either side — nothing was decided here in writing
  }

  const subject = subjectToken && !subjectToken.literal && subjectToken.kind !== 'punct'
    ? subjectToken.text
    : null;

  if (
    (subject && SYSTEM_FIELD.test(subject))
    || (left && SYSTEM_FIELD.test(left.text))
    || (right && SYSTEM_FIELD.test(right.text))
  ) {
    reject(reader, 'systemfeld', comparison, range);
    return;
  }
  if (subject && TECHNICAL_WORD.test(subject)) {
    reject(reader, 'technischer-wert', comparison, range);
    return;
  }
  if (valued.technicalConstant) {
    reject(reader, 'technische-konstante', comparison, range);
    return;
  }
  if (valued.values.every((v) => TRUTH_VALUE.has(v.trim().toLowerCase()))) {
    reject(reader, 'technischer-wert', comparison, range);
    return;
  }
  if (valued.values.every(isZero)) {
    reject(reader, 'null-vergleich', comparison, range);
    return;
  }
  if (hits(subject, TECHNICAL_SUBJECT)) {
    reject(reader, 'zaehler', comparison, range);
    return;
  }
  // `|Toleranz: { 5 }|` is a sentence being built, not a value being compared.
  if (/\{/.test(valued.literal) && valued.literal.startsWith('|')) {
    reject(reader, 'stringtemplate', comparison, range);
    return;
  }

  reader.drafts.push({
    origin: context.origin,
    branchId: context.branchId,
    container: context.container,
    conditionText,
    valueOffset: offset,
    operator: operatorToken.text.toUpperCase(),
    literal: valued.literal,
    values: valued.values,
    subject,
    subjectKind: subjectKindOf(subjectToken),
    classifyName: subject,
    viaConstant: valued.viaConstant,
    lineStart: range.lineStart,
    lineEnd: range.lineEnd,
    scope: context.scope,
  });
}

/** Every comparison in one condition. */
function readCondition(
  reader: Reader,
  context: {
    origin: RuleOrigin;
    branchId?: string;
    container?: string;
    conditionText: string;
    range: SourceRange;
    scope: string;
  },
): void {
  const tokens = tokenize(context.conditionText);

  for (let t = 0; t < tokens.length; t++) {
    const operator = operatorOf(tokens[t]);
    if (!operator) continue;

    if (operator === 'IN') {
      // `IN ( 'DE', 'AT' )` is a list; `IN s_vkorg` is a select-option and
      // states no value here.
      if (tokens[t + 1]?.text !== '(') continue;
      const members: Token[] = [];
      let close = t + 2;
      while (close < tokens.length && tokens[close].text !== ')') {
        if (tokens[close].kind !== 'punct') members.push(tokens[close]);
        close += 1;
      }
      const valuedMembers = members
        .map((m) => valueOf(m, reader.constants))
        .filter((v): v is Valued => v !== null);
      if (!valuedMembers.length) continue;
      weigh(reader, context, tokens[t - 1] ?? null, tokens[t], null, {
        literal: members.map((m) => m.text).join(', '),
        values: valuedMembers.flatMap((v) => v.values),
        offset: members[0].start,
      });
      t = close;
      continue;
    }

    if (operator === 'BETWEEN') {
      const lower = tokens[t + 1];
      const upper = tokens[t + 3];
      const valuedLower = lower ? valueOf(lower, reader.constants) : null;
      const valuedUpper = upper ? valueOf(upper, reader.constants) : null;
      if (!valuedLower || !valuedUpper) continue;
      weigh(reader, context, tokens[t - 1] ?? null, tokens[t], null, {
        literal: `${lower.text} AND ${upper.text}`,
        values: [...valuedLower.values, ...valuedUpper.values],
        offset: lower.start,
      });
      t += 3;
      continue;
    }

    weigh(reader, context, tokens[t - 1] ?? null, tokens[t], tokens[t + 1] ?? null);
  }
}

/** A `WHEN` arm: the values stand alone, the subject is the `CASE` selector. */
function readWhenArm(
  reader: Reader,
  branch: Branch,
  context: {
    container?: string;
    conditionText: string;
    range: SourceRange;
    scope: string;
  },
): void {
  const selector = branch.selector ?? '';
  if (!selector || /^TYPE\s+OF\b/i.test(selector)) return;
  if (SYSTEM_FIELD.test(selector)) {
    reject(reader, 'systemfeld', `${selector} = ${context.conditionText}`, context.range);
    return;
  }
  if (hits(selector, TECHNICAL_SUBJECT)) {
    reject(reader, 'zaehler', `${selector} = ${context.conditionText}`, context.range);
    return;
  }

  for (const token of tokenize(context.conditionText)) {
    if (!token.literal) continue;
    const value = unquote(token);
    if (TRUTH_VALUE.has(value.trim().toLowerCase())) {
      reject(reader, 'technischer-wert', `${selector} = ${token.text}`, context.range);
      continue;
    }
    if (isZero(value)) {
      reject(reader, 'null-vergleich', `${selector} = ${token.text}`, context.range);
      continue;
    }
    if (token.kind === 'template' && /\{/.test(token.text)) {
      reject(reader, 'stringtemplate', `${selector} = ${token.text}`, context.range);
      continue;
    }
    reader.drafts.push({
      origin: 'when',
      branchId: branch.id,
      container: context.container,
      conditionText: context.conditionText,
      valueOffset: token.start,
      operator: '=',
      literal: token.text,
      values: [value],
      subject: selector,
      subjectKind: 'case-selector',
      classifyName: selector,
      selectorAt: { lineStart: branch.lineStart, lineEnd: branch.lineStart },
      lineStart: context.range.lineStart,
      lineEnd: context.range.lineEnd,
      scope: context.scope,
    });
  }
}

/* ----------------------------------------------------------------- public */

export function readBusinessRules(source: string): BusinessRuleReport {
  const statements = readStatements(source);
  const structure = readBlocks(statements);
  const controlFlow = readControlFlowFrom(statements, structure);
  return readBusinessRulesFrom(statements, structure, controlFlow);
}

/** The same reading, for a caller that already holds the statements. */
export function readBusinessRulesFrom(
  statements: AbapStatement[],
  structure: BlockStructure,
  controlFlow: ControlFlowReport,
): BusinessRuleReport {
  const { declared, index } = readConstants(statements, structure);
  const reader: Reader = { rejected: [], drafts: [], constants: index };

  for (const branch of controlFlow.branches) {
    for (const arm of branch.arms) {
      if (!arm.condition) continue;
      const context = {
        container: branch.container,
        conditionText: arm.condition,
        range: { lineStart: arm.header.lineStart, lineEnd: arm.header.lineEnd },
        scope: branch.id,
      };
      if (arm.kind === 'when') {
        readWhenArm(reader, branch, context);
      } else {
        readCondition(reader, {
          ...context,
          origin: arm.kind === 'elseif' ? 'elseif' : 'if',
          branchId: branch.id,
        });
      }
    }
  }

  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i];
    if (statement.nativeSql) continue;
    if (statement.keyword !== 'CHECK' && statement.keyword !== 'WHILE') continue;
    if (structure.enclosing[i]?.some((block) => block.kind === 'define')) continue;
    const condition = afterKeyword(statement);
    if (!condition) continue;
    readCondition(reader, {
      origin: statement.keyword === 'CHECK' ? 'check' : 'while',
      container: containerAt(structure.containers, statement.lineStart)?.name || undefined,
      conditionText: condition,
      range: { lineStart: statement.lineStart, lineEnd: statement.lineEnd },
      scope: `S-${i}`,
    });
  }

  for (const constant of declared) {
    if (constant.technical) {
      reject(
        reader,
        'technische-konstante',
        `${constant.written} VALUE ${constant.literal}`,
        constant,
      );
      continue;
    }
    const text = `CONSTANTS ${constant.written}${constant.type ? ` TYPE ${constant.type}` : ''} VALUE ${constant.literal}`;
    reader.drafts.push({
      origin: 'constant',
      container: containerAt(structure.containers, constant.lineStart)?.name || undefined,
      conditionText: text,
      valueOffset: text.lastIndexOf(constant.literal),
      operator: 'VALUE',
      literal: constant.literal,
      values: [constant.value],
      subject: constant.written,
      subjectKind: 'variable',
      classifyName: constant.type ? `${constant.written} ${constant.type}` : constant.written,
      lineStart: constant.lineStart,
      lineEnd: constant.lineEnd,
      scope: `C-${constant.lineStart}`,
    });
  }

  return {
    candidates: finish(reader.drafts),
    rejected: reader.rejected.sort(byPlace),
    constants: declared,
  };
}

function byPlace(a: SourceRange, b: SourceRange): number {
  return a.lineStart - b.lineStart || a.lineEnd - b.lineEnd;
}

/**
 * Group, classify, number. A subject compared against two or more fixed values
 * inside one construct is a value list — that is the `IF`/`ELSEIF` chain the
 * roadmap wants to open as a decision table, and the exception list a reader
 * is looking for. Relational comparisons never form one: two thresholds on one
 * field are two thresholds.
 */
function finish(drafts: Draft[]): RuleCandidate[] {
  const ordered = [...drafts].sort(
    (a, b) => byPlace(a, b) || a.valueOffset - b.valueOffset,
  );

  const sets = new Map<string, { key: string; values: Set<string> }>();
  for (const draft of ordered) {
    if (!draft.subject) continue;
    if (!EQUALITY_OPERATORS.has(draft.operator)) continue;
    const key = `${draft.scope}#${draft.subject.toLowerCase().replace(/\s+/g, '')}`;
    const entry = sets.get(key) ?? { key, values: new Set<string>() };
    draft.values.forEach((v) => entry.values.add(v));
    sets.set(key, entry);
  }

  const seen = new Map<string, string>();
  const candidates: RuleCandidate[] = [];

  ordered.forEach((draft, i) => {
    const id = `RC-${String(i + 1).padStart(3, '0')}`;
    const setKey = draft.subject
      ? `${draft.scope}#${draft.subject.toLowerCase().replace(/\s+/g, '')}`
      : '';
    const set = EQUALITY_OPERATORS.has(draft.operator) ? sets.get(setKey) : undefined;
    const inValueSet = (set?.values.size ?? 0) > 1;
    const caveat = caveatFor(draft.classifyName, draft.values[0] ?? '');

    const ruleKey = `${(draft.subject ?? '?').toLowerCase()}|${draft.operator}|${draft.values.join(',')}`;
    const first = seen.get(ruleKey);
    if (!first) seen.set(ruleKey, id);

    candidates.push({
      id,
      origin: draft.origin,
      branchId: draft.branchId,
      container: draft.container,
      conditionText: draft.conditionText,
      valueOffset: draft.valueOffset,
      operator: draft.operator,
      literal: draft.literal,
      values: draft.values,
      subject: draft.subject,
      subjectKind: draft.subjectKind,
      ruleClass: classOf(draft.classifyName, draft.values, draft.operator, inValueSet),
      selectorAt: draft.selectorAt,
      viaConstant: draft.viaConstant,
      repeatOf: first,
      caveat: caveat?.text,
      valueSetId: inValueSet ? setKey : undefined,
      lineStart: draft.lineStart,
      lineEnd: draft.lineEnd,
    });
  });

  return candidates;
}
