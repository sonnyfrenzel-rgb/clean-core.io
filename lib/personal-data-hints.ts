/**
 * Patterns that often indicate personal data — a hint before the upload, and
 * nothing more than a hint.
 *
 * **What this is not.** It does not decide whether an upload contains personal
 * data, and nothing in the product does. The Terms of Service say so plainly —
 * *"This is a rule we ask you to keep, not a control we exercise"* — and
 * `tests/terms-duties-guard.spec.ts` fails the build on any sentence that turns
 * the rule into a claim of control. This module keeps the same discipline one
 * layer down: it finds **shapes**, reports them as *"this looks like it may be
 * personal data"*, and says in the same breath that it will miss things it has
 * no pattern for. A person reads the lines and decides. Nothing is blocked,
 * nothing is removed, nothing is sent anywhere to be judged.
 *
 * **Why it exists.** ABAP carries other people's data more often than anyone
 * intends: a developer's user id in an authority check, a real personnel number
 * left in a `DEFAULT`, a colleague's address in a batch-mail constant, a
 * production record pasted in as test data. The uploader is the only person who
 * can tell a placeholder from a real one, and the only moment they can act is
 * before the text leaves the browser. This gives them that moment.
 *
 * **The masking is borrowed, not rewritten.** Thirteen defects of one release
 * came from detectors that each brought their own half of "a comment and a
 * literal are text, not code" (`lib/abap/statement-reader.ts`). So the ABAP
 * half of this module reads `maskComments(source)` — comments blanked, literals
 * standing, every offset preserved character for character — which is exactly
 * the form that file documents for "a reader that is supposed to look inside a
 * literal". The literal *is* the thing being looked for here, and a
 * commented-out assignment is not an assignment.
 *
 * **The generic half reads the raw source on purpose**, comments included. An
 * e-mail address, an IBAN or a phone number is personal data wherever it
 * stands, and the Terms name *"names of colleagues or customers in comments"*
 * as one of the things to strip. The two halves therefore ask different
 * questions of the same file, which is the distinction `statement-reader.ts`
 * draws itself: *"the choice is never 'mask or do not mask', it is which of the
 * two questions is being asked."*
 *
 * **Deterministic, offline, one pass per pattern.** No model call, no network,
 * no state. The same text always produces the same list, in the same order, so
 * a hint can be reasoned about and tested.
 */

import { maskComments } from './abap/statement-reader';
// The column names that mark a person in an SAP usage export already have a
// home: `isPiiColumn` is the list the usage layer has used since v1.22. A
// second copy here would drift from it, which is the defect this repository
// keeps closing.
import { isPiiColumn } from './abap/usage-privacy';

/** Why a line was picked out. One kind, one reason, one sentence on screen. */
export type PersonalDataHintKind =
  | 'email-address'
  | 'iban'
  | 'phone-number'
  | 'tax-id'
  | 'personnel-number'
  | 'date-of-birth'
  | 'mail-address-field'
  | 'person-name'
  | 'user-name'
  | 'table-column';

export interface PersonalDataHint {
  kind: PersonalDataHintKind;
  /** 1-based line in the text that was handed in. */
  line: number;
  /**
   * A short piece of the line with the matched value itself masked. The hint
   * list is shown on screen and would otherwise be a second copy of the very
   * data it is pointing at.
   */
  excerpt: string;
  /** Plain English: what the shape is, and why it is worth a second look. */
  why: string;
}

/* ------------------------------------------------------------------ masking */

/** How much of the line is kept on each side of the masked value. */
const HEAD_CHARS = 44;
const TAIL_CHARS = 30;

/**
 * Enough of a value to recognise it, not enough to read it.
 *
 * The first characters and the last one stay, because a person has to be able
 * to tell "the address of our batch user" from "my colleague's address" without
 * opening the file again. Everything between them goes, and the number of
 * bullets is capped so the length of the value is not printed either.
 */
function maskValue(value: string): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= 2) return '•'.repeat(Math.max(compact.length, 1));
  const lead = compact.length >= 8 ? 2 : 1;
  const bullets = Math.min(Math.max(compact.length - lead - 1, 1), 8);
  return compact.slice(0, lead) + '•'.repeat(bullets) + compact.slice(-1);
}

/** Offsets at which each line begins, so an offset can be turned into a line. */
function buildLineIndex(source: string): number[] {
  const starts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source.charCodeAt(i) === 10) starts.push(i + 1);
  }
  return starts;
}

/** The 0-based index of the line containing `offset`. */
function lineIndexAt(starts: number[], offset: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * A short piece of one line, with **every** matched value on it masked — not
 * only the one being reported.
 *
 * Masking just the focus is not enough. `lv_a = 'x@y.de'. lv_b = 'p@q.de'.` is
 * one line with two addresses, and a hint about the first one printed the
 * second one in full inside its own excerpt. The hint list would then be the
 * copy of the data it exists to avoid making.
 */
function excerptForLine(
  source: string,
  starts: number[],
  lineIndex: number,
  onLine: Find[],
  focus: Find,
): string {
  const from = starts[lineIndex];
  const to = lineIndex + 1 < starts.length ? starts[lineIndex + 1] - 1 : source.length;

  const ranges = onLine
    .filter((find) => find.length > 0)
    .map((find) => ({
      start: Math.max(find.offset, from),
      end: Math.min(find.offset + find.length, to),
      isFocus: find === focus,
    }))
    .filter((range) => range.end > range.start)
    .sort((a, b) => a.start - b.start || b.end - a.end);

  let out = '';
  let cursor = from;
  let focusStart = -1;
  let focusEnd = -1;
  for (const range of ranges) {
    // An address inside a literal that is itself reported: the wider mask
    // already covers it, and masking twice would only shorten the line.
    if (range.start < cursor) continue;
    out += source.slice(cursor, range.start);
    if (range.isFocus) focusStart = out.length;
    out += maskValue(source.slice(range.start, range.end));
    if (range.isFocus) focusEnd = out.length;
    cursor = range.end;
  }
  out += source.slice(cursor, to);
  if (focusStart < 0) {
    focusStart = 0;
    focusEnd = 0;
  }

  let head = out.slice(0, focusStart).replace(/^\s+/, '');
  if (head.length > HEAD_CHARS) head = '…' + head.slice(head.length - HEAD_CHARS);
  let tail = out.slice(focusEnd);
  if (tail.length > TAIL_CHARS) tail = tail.slice(0, TAIL_CHARS) + '…';

  return `${head}${out.slice(focusStart, focusEnd)}${tail}`.replace(/\s+/g, ' ').trim();
}

/* ------------------------------------------------------------- the patterns */

/**
 * An internal find, before it is turned into a hint. `value` is the raw match
 * and never leaves this module: it is used to sort, to de-duplicate, and to
 * decide what gets masked away.
 */
interface Find {
  kind: PersonalDataHintKind;
  offset: number;
  length: number;
  value: string;
  why: string;
  /** Lower wins when two patterns describe the same value on the same line. */
  priority: number;
  /** Set only where there is no value to mask — see the column heading below. */
  excerpt?: string;
}

const WHY: Record<PersonalDataHintKind, string> = {
  'email-address':
    'This has the shape of an e-mail address. In ABAP that is usually a real person — a developer, an approver, the recipient of a batch job.',
  iban:
    'The country code, the length and the check digits of this value fit an IBAN, so it may be somebody’s bank account.',
  'phone-number':
    'This has the shape of a phone number with an international dialling code.',
  'tax-id':
    'Eleven digits standing next to a word about tax. That is the shape of a German tax identification number, which belongs to exactly one person.',
  'personnel-number':
    'A fixed value stands in a PERNR field. A personnel number names one employee.',
  'date-of-birth':
    'A fixed value stands in a date-of-birth field. A date of birth is personal data on its own.',
  'mail-address-field':
    'A fixed value stands in SMTP_ADDR, the field SAP keeps an e-mail address in.',
  'person-name':
    'A fixed value stands in a name field (NAME1, VORNA, NACHN) — often a customer, a vendor or a colleague.',
  'user-name':
    'A fixed user name is written to or compared with a user field such as SY-UNAME. An SAP user name identifies a person.',
  'table-column':
    'A column of this file is named after the person who used something. SAP usage exports carry user ids by construction, so everything under that heading is about people.',
};

/**
 * The ABAP fields that name a person by definition.
 *
 * `UNAME` and `BNAME` are deliberately wider than `SY-UNAME`: a program that
 * copies the system field into its own log structure and then compares
 * `gs_log-uname` against a fixed name carries the same user id, and reporting
 * only the system field would miss it. `GEBDAT` stands beside `GBDAT` for the
 * same reason — both are real SAP date-of-birth fields and nothing else is
 * called either.
 *
 * What is *not* here, and why: a bare `NAME`, `TEXT` or `TITLE` would fire on
 * half of every ABAP program, and `KUNNR`/`LIFNR` are keys of a business
 * partner rather than of a person. The list stays at fields whose meaning is
 * fixed by the dictionary.
 */
const PERSON_FIELDS: { kind: PersonalDataHintKind; fields: string[] }[] = [
  { kind: 'personnel-number', fields: ['PERNR'] },
  { kind: 'date-of-birth', fields: ['GBDAT', 'GEBDAT'] },
  { kind: 'mail-address-field', fields: ['SMTP_ADDR'] },
  { kind: 'person-name', fields: ['NAME1', 'VORNA', 'NACHN'] },
  { kind: 'user-name', fields: ['UNAME', 'BNAME'] },
];

/**
 * `gs_trip-pernr`, `lo_req->pernr`, `<fs_line>-pernr`, `p_pernr` — the same
 * field, reached four ways. The separators are ABAP's own (`-` structure, `->`
 * object, `~` alias, `>-` after a field symbol), and the prefix conventions put
 * the field name behind an underscore.
 */
const IDENTIFIER = '[A-Za-z_][A-Za-z0-9_]*(?:(?:->|>-|[-~>])[A-Za-z0-9_]+)*';
/** A literal, on one line. ABAP string templates are not literals for this. */
const LITERAL = "'[^'\\n]*'|`[^`\\n]*`";
/**
 * The character before an identifier may not continue one. This is what keeps
 * `gs_fieldcat-fieldname = 'NAME1'` out: the value is a *column name* being
 * handed to an ALV field catalogue, and the field being written is `fieldname`,
 * which names nobody.
 */
const NOT_IDENTIFIER_BEFORE = '[^\\w>~-]';

/** `field = 'literal'`, and the comparison forms that look the same. */
const ASSIGNED_LITERAL = new RegExp(
  `(?:^|${NOT_IDENTIFIER_BEFORE})(${IDENTIFIER})\\s*(?:=|<>|\\bEQ\\b|\\bNE\\b)\\s*(${LITERAL})`,
  'gim',
);

/**
 * `c_mail TYPE adr6-smtp_addr VALUE '…'` and
 * `PARAMETERS p_pernr TYPE c LENGTH 8 DEFAULT '…'`.
 *
 * Both shipped starter examples carry one of these, and neither is an
 * assignment: the person is named by the *declaration*, either in the name of
 * the field or in the dictionary type it borrows.
 */
const DECLARED_LITERAL = new RegExp(
  `(?:^|${NOT_IDENTIFIER_BEFORE})(${IDENTIFIER})` +
    `((?:\\s+(?:TYPE|LIKE)\\s+[A-Za-z_][A-Za-z0-9_\\-~>/]*)?(?:\\s+LENGTH\\s+\\d+)?(?:\\s+DECIMALS\\s+\\d+)?)` +
    `\\s+(?:VALUE|DEFAULT)\\s+(${LITERAL})`,
  'gim',
);

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}/g;
/**
 * Structure and length, then the check digits. The mod-97 test costs one pass
 * over twenty characters and removes essentially every accidental match, which
 * is worth far more here than it costs: without it any long uppercase token
 * would be offered to the reader as a possible bank account.
 */
const IBAN_CANDIDATE = /(^|[^A-Za-z0-9_])([A-Z]{2}\d{2}[A-Z0-9]{11,30})(?![A-Za-z0-9_])/g;
/**
 * A phone number has to start with `+` followed immediately by a digit. That
 * single rule is what keeps ABAP arithmetic out (the language wants blanks
 * around `+`), and the leading guard keeps offset syntax out: `lv_text+10(200)`
 * follows an identifier character, `'+49 171 …'` follows a quote.
 */
const PHONE_CANDIDATE = /(^|[^\w+])(\+\d[\d\s\-/().]{6,20}\d)(?!\d)/gm;
/** Eleven digits as a token of their own, never starting with zero. */
const ELEVEN_DIGITS = /(^|[^\w])([1-9]\d{10})(?!\w)/g;
/**
 * The most false-positive-prone pattern in the file, so it is the only one that
 * needs a second signal. Eleven digits are also a document number, a material
 * number and half the constants in a pricing routine; eleven digits beside the
 * word *Steuer* are a tax identification number.
 */
const TAX_CONTEXT = /steuer|identifikationsnummer|tax\s*[-_]?\s*id|\btin\b|\bstcd\d?\b|\bidnr\b/i;
/**
 * The line the digits stand on and the line above it. Legacy ABAP names the
 * field in a comment and assigns on the next line more often than it writes
 * `lv_steuer_id`, and one line of context is still far too narrow to catch a
 * document number by accident.
 */
const TAX_CONTEXT_LINES_BEFORE = 1;

/** Delimiters a tabular export uses, most specific first. */
const TABLE_DELIMITERS = [';', '\t', ','];
/** A heading is a short word, not an expression. `:`, `=` and quotes disqualify. */
const HEADING_CELL = /^[A-Za-z][A-Za-z0-9_ .-]{0,40}$/;
/** How far into a file a heading row may hide behind a title or a blank line. */
const HEADING_LOOKAHEAD = 3;

/* ------------------------------------------------------------------ helpers */

/**
 * ISO 13616 check digits. `DE89370400440532013000` becomes
 * `370400440532013000DE89`, letters become their position plus nine, and the
 * whole number modulo 97 has to be 1.
 */
function ibanChecksumHolds(iban: string): boolean {
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (let i = 0; i < rearranged.length; i++) {
    const code = rearranged.charCodeAt(i);
    const part = code >= 65 && code <= 90 ? String(code - 55) : String.fromCharCode(code);
    for (let j = 0; j < part.length; j++) {
      remainder = (remainder * 10 + (part.charCodeAt(j) - 48)) % 97;
    }
  }
  return remainder === 1;
}

/** Every word-shaped token of a fragment, in order. */
function tokensOf(text: string): string[] {
  return text.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
}

/** `pernr`, `lv_pernr` and `gs_trip-pernr` are the field; `pernr_d` is a type. */
function tokenIsField(token: string, field: string): boolean {
  const upper = token.toUpperCase();
  return upper === field || upper.endsWith(`_${field}`);
}

function fieldKindOf(tokens: string[]): PersonalDataHintKind | null {
  for (const family of PERSON_FIELDS) {
    for (const field of family.fields) {
      if (tokens.some((token) => tokenIsField(token, field))) return family.kind;
    }
  }
  return null;
}

/** The content of an ABAP literal and where that content starts in the source. */
function literalContent(match: RegExpMatchArray, literal: string): { offset: number; text: string } {
  const literalStart = (match.index ?? 0) + match[0].length - literal.length;
  return { offset: literalStart + 1, text: literal.slice(1, -1) };
}

/* -------------------------------------------------------------- the passes */

/**
 * The ABAP half, read over `maskComments`: literals visible, comments blanked,
 * offsets identical to the original source.
 */
function abapFieldFinds(masked: string): Find[] {
  const finds: Find[] = [];

  for (const match of masked.matchAll(ASSIGNED_LITERAL)) {
    const tokens = tokensOf(match[1]);
    const last = tokens[tokens.length - 1];
    if (!last) continue;
    // Only the last token: it is the field being written or compared. The
    // prefix is the structure, and a structure is not a person.
    const kind = fieldKindOf([last]);
    if (!kind) continue;
    const { offset, text } = literalContent(match, match[2]);
    if (!text.trim()) continue;
    finds.push({ kind, offset, length: text.length, value: text, why: WHY[kind], priority: 0 });
  }

  for (const match of masked.matchAll(DECLARED_LITERAL)) {
    const declared = tokensOf(match[1]);
    const last = declared[declared.length - 1];
    // The person can be named by the field itself (`p_pernr`) or by the
    // dictionary type it borrows (`TYPE adr6-smtp_addr`).
    const kind = (last ? fieldKindOf([last]) : null) ?? fieldKindOf(tokensOf(match[2] ?? ''));
    if (!kind) continue;
    const { offset, text } = literalContent(match, match[3]);
    if (!text.trim()) continue;
    finds.push({ kind, offset, length: text.length, value: text, why: WHY[kind], priority: 0 });
  }

  return finds;
}

/**
 * The generic half, read over the source as handed in — comments included,
 * because an address in a comment is an address.
 */
function valueShapeFinds(source: string, starts: number[]): Find[] {
  const finds: Find[] = [];

  for (const match of source.matchAll(EMAIL)) {
    finds.push({
      kind: 'email-address',
      offset: match.index ?? 0,
      length: match[0].length,
      value: match[0],
      why: WHY['email-address'],
      priority: 1,
    });
  }

  for (const match of source.matchAll(IBAN_CANDIDATE)) {
    const candidate = match[2];
    if (!ibanChecksumHolds(candidate)) continue;
    finds.push({
      kind: 'iban',
      offset: (match.index ?? 0) + match[1].length,
      length: candidate.length,
      value: candidate,
      why: WHY.iban,
      priority: 1,
    });
  }

  for (const match of source.matchAll(PHONE_CANDIDATE)) {
    const candidate = match[2];
    const digits = candidate.replace(/\D/g, '').length;
    // E.164: a number that can be dialled has between 8 and 15 digits once the
    // country code is counted. Shorter runs are offsets, lengths and amounts.
    if (digits < 8 || digits > 15) continue;
    finds.push({
      kind: 'phone-number',
      offset: (match.index ?? 0) + match[1].length,
      length: candidate.length,
      value: candidate,
      why: WHY['phone-number'],
      priority: 1,
    });
  }

  for (const match of source.matchAll(ELEVEN_DIGITS)) {
    const offset = (match.index ?? 0) + match[1].length;
    const index = lineIndexAt(starts, offset);
    const from = starts[Math.max(index - TAX_CONTEXT_LINES_BEFORE, 0)];
    const to = index + 1 < starts.length ? starts[index + 1] - 1 : source.length;
    if (!TAX_CONTEXT.test(source.slice(from, to))) continue;
    finds.push({
      kind: 'tax-id',
      offset,
      length: match[2].length,
      value: match[2],
      why: WHY['tax-id'],
      priority: 1,
    });
  }

  return finds;
}

/**
 * A heading row, and the columns in it that name a person.
 *
 * This is the one hint whose excerpt is **not** masked, and the reason is that
 * there is nothing to mask: a column is called `USER`, and the heading is
 * metadata about the file rather than anybody's data. Masking it would leave
 * the reader with a warning they cannot act on. The values under the heading
 * are never read and never shown.
 */
function tableHeadingFinds(source: string, starts: number[]): Find[] {
  const lines = source.split('\n');
  let examined = 0;
  for (let i = 0; i < lines.length && examined < HEADING_LOOKAHEAD; i++) {
    const line = lines[i].replace(/\r$/, '');
    if (!line.trim()) continue;
    examined += 1;
    for (const delimiter of TABLE_DELIMITERS) {
      const cells = line.split(delimiter);
      if (cells.length < 2) continue;
      const names = cells.map((cell) => cell.trim().replace(/^"|"$/g, ''));
      // Every cell has to read as a heading. One expression in the row and this
      // is a line of code that happens to contain a comma.
      if (!names.every((name) => HEADING_CELL.test(name))) continue;
      const finds: Find[] = names
        .filter((name) => isPiiColumn(name))
        .map((name) => ({
          kind: 'table-column' as const,
          offset: starts[i],
          length: 0,
          value: `column:${name.toUpperCase()}`,
          why: WHY['table-column'],
          priority: 0,
          excerpt: `Column “${name}”`,
        }));
      // The first row that reads as a heading is the heading, whether or not it
      // held anything. Looking further would start reading data rows.
      return finds;
    }
  }
  return [];
}

/* --------------------------------------------------------------- the module */

/**
 * Every pattern in `source` that often indicates personal data, in the order it
 * appears.
 *
 * It cannot say whether a match really is personal data, and it has no pattern
 * for most of the ways personal data can be written down — a name in prose, a
 * customer number, an address split over four fields. Callers must present the
 * result as something to look at, never as a verdict.
 */
export function scanForPersonalDataHints(source: string): PersonalDataHint[] {
  if (!source) return [];

  const starts = buildLineIndex(source);
  const finds: Find[] = [
    ...abapFieldFinds(maskComments(source)),
    ...valueShapeFinds(source, starts),
    ...tableHeadingFinds(source, starts),
  ];

  finds.sort((a, b) => a.offset - b.offset || a.priority - b.priority || a.kind.localeCompare(b.kind));

  // Which line each find sits on, and which finds share it. The second map is
  // what lets an excerpt mask its neighbours as well as itself.
  const lineOf = new Map<Find, number>();
  const byLine = new Map<number, Find[]>();
  for (const find of finds) {
    const index = lineIndexAt(starts, find.offset);
    lineOf.set(find, index);
    const bucket = byLine.get(index);
    if (bucket) bucket.push(find);
    else byLine.set(index, [find]);
  }

  const seen = new Set<string>();
  const hints: PersonalDataHint[] = [];
  for (const find of finds) {
    const index = lineOf.get(find) ?? 0;
    // The same value on the same line is one thing to look at, however many
    // patterns recognised it: an address in an SMTP_ADDR constant is found both
    // as an address and as the field it sits in. The ABAP reason is kept
    // because it is the more specific of the two.
    const key = `${index} ${find.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hints.push({
      kind: find.kind,
      line: index + 1,
      excerpt: find.excerpt ?? excerptForLine(source, starts, index, byLine.get(index) ?? [find], find),
      why: find.why,
    });
  }

  return hints;
}

/**
 * A stable name for exactly this set of hints.
 *
 * An acknowledgement belongs to the lines it was given for. Storing it as a
 * boolean and clearing it from an effect would mean a moment — one render —
 * in which edited source is covered by a tick that was made for the old text.
 * Binding the tick to this key removes the moment instead of shortening it:
 * change a character that matters, and the acknowledgement is simply no longer
 * the one on file. Empty when there is nothing to acknowledge.
 */
export function personalDataHintKey(hints: PersonalDataHint[]): string {
  return hints.map((hint) => `${hint.kind}:${hint.line}:${hint.excerpt}`).join('|');
}
