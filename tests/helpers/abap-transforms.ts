/**
 * Mechanical rewrites of ABAP source, for the metamorphic properties in
 * `tests/abap-metamorphic.spec.ts`.
 *
 * Every function here takes a program and returns another program that a reader
 * of ABAP would call the same program: a variable renamed throughout, a
 * statement wrapped over two lines, a chain written out, a comment added. None
 * of them decides what the engine should answer — they only guarantee that the
 * answer must not change, which is what makes the assertions in the spec need no
 * ground truth.
 *
 * Three rules this file keeps, because breaking any of them would make a
 * transformation that is not meaning-preserving and a red spec that says nothing:
 *
 *   - **Nothing is ever changed inside a literal.** `WRITE 'lv_price'.` is
 *     prose about a variable, not a use of it, and `CONCATENATE a b INTO c
 *     SEPARATED BY ':'` carries a colon that is not a chain operator. Every
 *     rewrite works off `classify()`, which walks a line once and says, for each
 *     character, whether it is code, literal or comment.
 *   - **A `.` between two digits is not the end of a statement** — the same rule
 *     `statement-reader.ts` applies, restated here rather than imported, because
 *     a transformation that borrows the reader's idea of where statements end
 *     cannot disagree with it, and the disagreement is the test.
 *   - **A comment is inserted in column 1 and nowhere else.** An indented
 *     asterisk is a comment only where no statement is open
 *     (`isAbapCommentLine`), so inserting one inside an open statement would be
 *     writing a multiplication, not a comment.
 *
 * Each transformation also returns where the lines went. `mapStart(n)` is the
 * line the content of original line `n` now begins on and `mapEnd(n)` the line
 * it now ends on — so a property can assert that an anchor moved *correctly*
 * instead of giving up on anchors.
 */

/** What a character is: `c` code, `l` literal (quotes included), `x` comment. */
export type CharClass = 'c' | 'l' | 'x';

/**
 * Classify every character of one source line.
 *
 * ABAP literals never span lines, so the state starts fresh on each line. Three
 * literal forms are recognised: `'…'`, `` `…` `` and the string template `|…|`.
 * A `"` outside all three opens a comment that runs to the end of the line.
 */
export function classify(raw: string): CharClass[] {
  const out: CharClass[] = [];
  let inQuote = false;
  let inTick = false;
  let inTemplate = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (!inQuote && !inTick && !inTemplate && ch === '"') {
      for (let j = i; j < raw.length; j++) out.push('x');
      return out;
    }
    if (ch === "'" && !inTick && !inTemplate) {
      inQuote = !inQuote;
      out.push('l');
      continue;
    }
    if (ch === '`' && !inQuote && !inTemplate) {
      inTick = !inTick;
      out.push('l');
      continue;
    }
    if (ch === '|' && !inQuote && !inTick) {
      inTemplate = !inTemplate;
      out.push('l');
      continue;
    }
    out.push(inQuote || inTick || inTemplate ? 'l' : 'c');
  }
  return out;
}

/** True when the line ends with a literal still open — malformed, left alone. */
function literalLeftOpen(raw: string): boolean {
  let inQuote = false;
  let inTick = false;
  let inTemplate = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (!inQuote && !inTick && !inTemplate && ch === '"') return false;
    if (ch === "'" && !inTick && !inTemplate) inQuote = !inQuote;
    else if (ch === '`' && !inQuote && !inTemplate) inTick = !inTick;
    else if (ch === '|' && !inQuote && !inTick) inTemplate = !inTemplate;
  }
  return inQuote || inTick || inTemplate;
}

/** The line with its inline comment removed. */
export function withoutComment(raw: string): string {
  const cls = classify(raw);
  const at = cls.indexOf('x');
  return at === -1 ? raw : raw.slice(0, at);
}

/**
 * Offsets of the statement-ending periods in a line.
 *
 * A period inside a literal or a comment does not end a statement, and neither
 * does one between two digits.
 */
export function terminatorOffsets(raw: string): number[] {
  const cls = classify(raw);
  const out: number[] = [];
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] !== '.' || cls[i] !== 'c') continue;
    if (/\d/.test(raw[i - 1] ?? '') && /\d/.test(raw[i + 1] ?? '')) continue;
    out.push(i);
  }
  return out;
}

/** Lines that lie between `EXEC SQL` and `ENDEXEC`, inclusive. 0-based. */
export function nativeSqlLines(lines: string[]): Set<number> {
  const out = new Set<number>();
  let inside = false;
  for (let i = 0; i < lines.length; i++) {
    const code = withoutComment(lines[i]);
    if (/^\s*EXEC\s+SQL\b/i.test(code)) inside = true;
    if (inside) out.add(i);
    if (/\bENDEXEC\b/i.test(code)) inside = false;
  }
  return out;
}

/** One original line and the lines it became. */
interface Group {
  lines: string[];
  /** Index within `lines` where the original line's content starts. */
  firstContent: number;
  /** Index within `lines` where it ends. */
  lastContent: number;
}

export interface Transformed {
  code: string;
  /** 1-based line the content of original line `n` now starts on. */
  mapStart(n: number): number;
  /** 1-based line the content of original line `n` now ends on. */
  mapEnd(n: number): number;
  lineCount: number;
}

function build(groups: Group[]): Transformed {
  const starts: number[] = [];
  const ends: number[] = [];
  let cursor = 1;
  const lines: string[] = [];
  for (const group of groups) {
    starts.push(cursor + group.firstContent);
    ends.push(cursor + group.lastContent);
    lines.push(...group.lines);
    cursor += group.lines.length;
  }
  return {
    code: lines.join('\n'),
    mapStart: (n) => starts[n - 1],
    mapEnd: (n) => ends[n - 1],
    lineCount: lines.length,
  };
}

const keep = (line: string): Group => ({ lines: [line], firstContent: 0, lastContent: 0 });

/** The identity rewrite, so a property can compare like with like. */
export function identity(code: string): Transformed {
  return build(code.split(/\r?\n/).map(keep));
}

/* ------------------------------------------------------------------ naming */

/**
 * Names this rewrite touches: the `l…_` and `g…_` prefixes of ABAP's naming
 * convention — a program's own local and global data objects.
 *
 * The other prefixes `evidence-model.ts` lists in `LOCAL_NAME_PREFIX` —
 * `CS_`, `CT_`, `RS_`, `ES_`, `IT_` — are deliberately left alone: SAP ships
 * over a hundred real dictionary objects under them (`CS_BOM_EXPL_MAT_V2`), and
 * a table renamed is a finding that disappears for a reason that is not a
 * defect. A property has to leave the cases where the name genuinely carries
 * meaning outside itself.
 */
const LOCAL = /\b((?:l[tsvordx]|g[tsvor])_)([A-Za-z0-9_]+)\b/gi;

export interface Renamed extends Transformed {
  /**
   * The same substitution, applied to a string the engine produced. A finding's
   * title, object name and snippet quote the source, so they have to be read
   * through the rename before they can be compared. Case is carried across: an
   * all-upper occurrence comes back all-upper, as the engine writes object names.
   */
  rename(text: string): string;
}

/**
 * Rename every local data object consistently: `lv_price` → `lv_zz0001`.
 *
 * The naming-convention prefix is kept. That is not timidity, it is the
 * property being stated honestly: `evidence-model.ts` reads the prefix on
 * purpose (`LOCAL_NAME_PREFIX`) to tell a variable from a table it has never
 * heard of, so `lv_price` → `gv_price` may legitimately change the answer. What
 * must not change the answer is the part of the name that carries no rule — and
 * that is everything after the prefix.
 *
 * Names inside literals are left alone: `WRITE 'lv_price'.` is prose.
 */
export function renameLocals(code: string): Renamed {
  const names = new Map<string, string>();
  const lines = code.split(/\r?\n/);

  const mapName = (prefix: string, rest: string): string => {
    const key = `${prefix}${rest}`.toUpperCase();
    const known = names.get(key);
    if (known) return known;
    const fresh = `${prefix.toLowerCase()}zz${String(names.size + 1).padStart(4, '0')}`;
    names.set(key, fresh);
    return fresh;
  };

  const rewrite = (raw: string): string => {
    const cls = classify(raw);
    let out = '';
    let i = 0;
    while (i < raw.length) {
      // Copy a run of literal characters untouched.
      if (cls[i] === 'l') {
        const from = i;
        while (i < raw.length && cls[i] === 'l') i += 1;
        out += raw.slice(from, i);
        continue;
      }
      const from = i;
      while (i < raw.length && cls[i] !== 'l') i += 1;
      LOCAL.lastIndex = 0;
      out += raw.slice(from, i).replace(LOCAL, (_m, prefix: string, rest: string) => mapName(prefix, rest));
    }
    return out;
  };

  const base = build(lines.map((line) => keep(rewrite(line))));
  return {
    ...base,
    rename: (text) =>
      text.replace(/\b(?:l[tsvordx]|g[tsvor])_[A-Za-z0-9_]+\b/gi, (hit) => {
        const fresh = names.get(hit.toUpperCase());
        if (!fresh) return hit;
        return hit === hit.toUpperCase() ? fresh.toUpperCase() : fresh;
      }),
  };
}

/* -------------------------------------------------------------- formatting */

/**
 * Indent every line by two more spaces. A comment in column 1 stays in column 1
 * — moved, it would be an indented asterisk, which is a different construct.
 */
export function indentDeeper(code: string): Transformed {
  return build(
    code.split(/\r?\n/).map((line) => keep(line.trim() === '' || line.startsWith('*') ? line : `  ${line}`)),
  );
}

/**
 * Wrap every statement after its first word.
 *
 *     IF lv_dev_pct > 5.     becomes     IF
 *                                          lv_dev_pct > 5.
 *
 * Only lines that hold at most one statement are wrapped, and only when that
 * statement ends at the end of the line: on a line carrying two statements the
 * second one would move and the first would not, and `mapStart`/`mapEnd` could
 * no longer say where either went.
 */
export function wrapAfterFirstWord(code: string): Transformed {
  const lines = code.split(/\r?\n/);
  const native = nativeSqlLines(lines);
  return build(
    lines.map((line, i) => {
      if (native.has(i) || literalLeftOpen(line)) return keep(line);
      const terminators = terminatorOffsets(line);
      const body = withoutComment(line);
      if (terminators.length > 1) return keep(line);
      if (terminators.length === 1 && terminators[0] !== body.replace(/\s+$/, '').length - 1) return keep(line);
      const m = /^(\s*)([A-Za-z][\w-]*)(\s+)(\S[\s\S]*)$/.exec(line);
      if (!m) return keep(line);
      return { lines: [`${m[1]}${m[2]}`, `${m[1]}    ${m[4]}`], firstContent: 0, lastContent: 1 };
    }),
  );
}

/**
 * Wrap a statement so that a binary operator opens the continuation line.
 *
 *     lv_total = lv_net * lv_qty.      becomes     lv_total = lv_net
 *                                                    * lv_qty.
 *
 * This is the shape the engine got wrong once: `Z_MM_PO_APPROVAL.abap:408-409`
 * already writes a multiplication this way, an earlier reader took the indented
 * asterisk for a comment, and the statement then swallowed the `IF` below it —
 * a price-tolerance check gone from the evidence. Producing the shape from every
 * program that contains a multiplication turns one shipped line into a rule.
 */
export function wrapBeforeOperator(code: string): Transformed {
  const lines = code.split(/\r?\n/);
  const native = nativeSqlLines(lines);
  return build(
    lines.map((line, i) => {
      if (native.has(i) || literalLeftOpen(line)) return keep(line);
      const cls = classify(line);
      const terminators = terminatorOffsets(line);
      const body = withoutComment(line);
      // One complete statement on the line, nothing after it but the period.
      if (terminators.length !== 1) return keep(line);
      if (terminators[0] !== body.replace(/\s+$/, '').length - 1) return keep(line);
      // The last ` * ` that is code, not a literal and not the line's first token.
      let at = -1;
      for (let p = 1; p < line.length - 1; p++) {
        if (cls[p] !== 'c' || line[p] !== '*') continue;
        if (!/\s/.test(line[p - 1]) || !/\s/.test(line[p + 1])) continue;
        if (line.slice(0, p).trim() === '') continue;
        at = p;
      }
      if (at === -1) return keep(line);
      const indent = /^\s*/.exec(line)?.[0] ?? '';
      return {
        lines: [line.slice(0, at).replace(/\s+$/, ''), `${indent}    ${line.slice(at)}`],
        firstContent: 0,
        lastContent: 1,
      };
    }),
  );
}

/** Split `a, b, c` on the commas that are code and outside parentheses. */
function topLevelParts(body: string): string[] {
  const cls = classify(body);
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (cls[i] === 'c') {
      if (ch === '(') depth += 1;
      else if (ch === ')') depth = Math.max(0, depth - 1);
      else if (ch === ',' && depth === 0) {
        parts.push(current);
        current = '';
        continue;
      }
    }
    current += ch;
  }
  parts.push(current);
  return parts.map((p) => p.trim()).filter((p) => p !== '');
}

/** The head, the parts and the indent of a one-line chain, or null. */
function chainOnOneLine(line: string, native: boolean): { indent: string; head: string; parts: string[] } | null {
  if (native || literalLeftOpen(line)) return null;
  const terminators = terminatorOffsets(line);
  if (terminators.length !== 1) return null;
  const body = withoutComment(line);
  if (terminators[0] !== body.replace(/\s+$/, '').length - 1) return null;
  const m = /^(\s*)([A-Za-z][\w-]*)\s*:\s*(\S[\s\S]*)\.\s*$/.exec(body);
  if (!m) return null;
  // The colon has to be code — `CONCATENATE … SEPARATED BY ':'` is not a chain.
  const colonAt = line.indexOf(':', m[1].length + m[2].length);
  if (colonAt === -1 || classify(line)[colonAt] !== 'c') return null;
  const parts = topLevelParts(m[3]);
  return parts.length === 0 ? null : { indent: m[1], head: m[2], parts };
}

/**
 * Write a one-line chain out as separate statements, on the same line.
 *
 *     DATA: lv_a TYPE i, lv_b TYPE c.    becomes    DATA lv_a TYPE i. DATA lv_b TYPE c.
 *
 * ABAP's `:` repeats everything before it for every comma-separated part after
 * it, so the two forms are the same program. Keeping them on one line adds no
 * lines at all, so every anchor in the answer must come back unchanged — and it
 * puts several statements on one line on purpose, which is the case
 * `statement-reader.ts` records as having gone wrong once before (QA review of
 * 5e598828093c: `IF sy-subrc = 0.` ended up at the head of the next statement).
 *
 * Only chains that begin and end on one line are rewritten. A chain wrapped over
 * several lines would need the statement boundaries that the reader under test
 * is the one deciding.
 */
export function expandChainsInline(code: string): Transformed {
  const lines = code.split(/\r?\n/);
  const native = nativeSqlLines(lines);
  return build(
    lines.map((line, i) => {
      const chain = chainOnOneLine(line, native.has(i));
      if (!chain) return keep(line);
      return keep(`${chain.indent}${chain.parts.map((part) => `${chain.head} ${part}.`).join(' ')}`);
    }),
  );
}

/** The same rewrite with one statement per line — the way a developer writes it out. */
export function expandChainsPerLine(code: string): Transformed {
  const lines = code.split(/\r?\n/);
  const native = nativeSqlLines(lines);
  return build(
    lines.map((line, i) => {
      const chain = chainOnOneLine(line, native.has(i));
      if (!chain) return keep(line);
      const out = chain.parts.map((part) => `${chain.indent}${chain.head} ${part}.`);
      return { lines: out, firstContent: 0, lastContent: out.length - 1 };
    }),
  );
}

/* ---------------------------------------------------------------- comments */

/** The text every inserted comment carries — no ABAP word, no marker syntax. */
export const COMMENT_TEXT = 'ein Hinweis fuer den Leser';

/**
 * Append an inline comment to every statement line. Adds no lines at all, so
 * nothing in any answer may move — not even an anchor.
 */
export function appendInlineComments(code: string): Transformed {
  const lines = code.split(/\r?\n/);
  const native = nativeSqlLines(lines);
  return build(
    lines.map((line, i) => {
      if (native.has(i) || literalLeftOpen(line)) return keep(line);
      if (line.trim() === '' || line.startsWith('*')) return keep(line);
      if (classify(line).includes('x')) return keep(line);
      return keep(`${line}  " ${COMMENT_TEXT}`);
    }),
  );
}

/**
 * Put a full-line comment in column 1 before every line. Every original line `n`
 * then stands on line `2n`, which is the whole of what may change.
 */
export function insertCommentLines(code: string): Transformed {
  return build(
    code.split(/\r?\n/).map((line) => ({
      lines: [`* ${COMMENT_TEXT}`, line],
      firstContent: 1,
      lastContent: 1,
    })),
  );
}

/* ------------------------------------------------------- a derived corpus */

/**
 * Write every numeric character literal as a bare decimal: `'0.19'` → `0.19`.
 *
 * **This is not a meaning-preserving rewrite and is never used as one.** A
 * packed literal and an ABAP 7.40 decimal literal are not the same type, and
 * their arithmetic can round differently. It is an *input generator*: a property
 * is a statement about every input, and the eight programs this product ships
 * happen never to write a period between two digits outside a literal — classic
 * ABAP spells `'0.19'`, and the scanner's quote handling covers that case
 * without ever reaching the decimal rule. So the one construct the rule exists
 * for (`IF lv_rate > 0.5.`, which a statement reader that cuts at every period
 * hands on as `IF lv_rate > 0`) is unreachable on the shipped corpus, and a
 * property that only ever sees the shipped corpus cannot speak about it.
 *
 * The result is still a real ABAP program, derived mechanically from a real one.
 */
export function unquoteNumbers(code: string): string {
  // `''` is an escaped quote inside a literal, so a run of quotes is left alone.
  return code.replace(/(?<!')'(\d+\.\d+)'(?!')/g, (_m, n: string) => n);
}

/* ----------------------------------------------------------- concatenation */

export interface Concatenated {
  code: string;
  /** Lines the first program occupies — the second program's anchors shift by this. */
  offset: number;
}

/** Two programs, one after the other, with nothing between them but a newline. */
export function concatPrograms(first: string, second: string): Concatenated {
  const a = first.split(/\r?\n/);
  const b = second.split(/\r?\n/);
  return { code: [...a, ...b].join('\n'), offset: a.length };
}
