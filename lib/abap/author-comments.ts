/**
 * The author's comments next to the code, as a tagged source of meaning (concept "Business-Lesbarkeit" H4, owner
 * decisions E2 and 06.11.2026) — read for engine 3.5.0 (`ENGINE_READS_350_FROM`) by `plain-language.ts`.
 *
 * A comment is the developer's word, not the engine's: it can be old, wrong or about the line it once stood next to.
 * So it is never the label of an element and never an engine statement. It is quoted word for word — German stays
 * German, a translation would be the reader's or an AI's — and always under the tag {@link AUTHOR_COMMENT_LABEL}, with
 * its line. What is not quoted:
 *
 *   - commented-out code (`* SELECT * FROM vbak …`), separators (`*-----`), a bare keyword or a single word;
 *   - change markers and logs (`* Begin of change 4711`, `" INS 12.03.2019 MUELLER`, `* TODO`) — about a change, not
 *     about the business;
 *   - a comment longer than {@link MAX_COMMENT} characters — cut, it would no longer be the author's sentence.
 *
 * Pure: the source is the only input.
 */

export const AUTHOR_COMMENT_LABEL = "Author's comment";

/** The longest comment quoted; a longer one is left out, never cut. */
export const MAX_COMMENT = 120;

export interface AuthorComment {
  /** The comment's words, as the source writes them, without the comment sign. */
  text: string;
  /** 1-based first line of the comment. */
  line: number;
  /** 1-based last line (a block of full-line comments may span several). */
  lineEnd: number;
}

interface LineComment {
  text: string;
  /** A full-line comment (`*` in column 1, or a line that holds only a `"` comment). */
  full: boolean;
}

/** The comment on each line of a source: the text after `*` in column 1, or after a `"` outside a literal. */
function lineComments(lines: readonly string[]): Map<number, LineComment> {
  const out = new Map<number, LineComment>();
  lines.forEach((raw, i) => {
    if (raw.startsWith('*')) {
      out.set(i + 1, { text: raw.slice(1).trim(), full: true });
      return;
    }
    let quote: string | null = null;
    for (let j = 0; j < raw.length; j++) {
      const ch = raw[j];
      if (quote) {
        if (ch === quote) quote = null;
        continue;
      }
      if (ch === "'" || ch === '`' || ch === '|') {
        quote = ch;
        continue;
      }
      if (ch === '"') {
        out.set(i + 1, { text: raw.slice(j + 1).trim(), full: raw.slice(0, j).trim() === '' });
        return;
      }
    }
  });
  return out;
}

const ABAP_KEYWORD = /^(?:SELECT|IF|ENDIF|ELSE|ELSEIF|LOOP|ENDLOOP|READ|MODIFY|UPDATE|INSERT|DELETE|CALL|PERFORM|FORM|ENDFORM|DATA|TYPES|CLEAR|MOVE|APPEND|WRITE|MESSAGE|CHECK|EXIT|CASE|WHEN|ENDCASE|DO|ENDDO|WHILE|ENDWHILE|METHOD|ENDMETHOD|COMMIT|ROLLBACK|SORT|REFRESH|FREE|CONCATENATE|SPLIT|CONDENSE|TRANSLATE|REPLACE|FIND|ASSIGN|FIELD-SYMBOLS|CONSTANTS|PARAMETERS|SELECT-OPTIONS|TABLES|INCLUDE|REPORT|RAISE|RETURN|SUBMIT|SET|GET|AUTHORITY-CHECK|LEAVE|ENDSELECT|OPEN|CLOSE|TRY|CATCH|ENDTRY|CREATE|COLLECT|SUM|AT|ENDAT|NEW-PAGE|ULINE|SKIP|FORMAT)\b/i;

/**
 * The words of a comment without the frame SAP's editor draws around a routine (`*&----`, `*& Form READ_DATA`): the
 * `&` signs go, and a line that only repeats the routine's name says nothing. `Form POST - one document per currency`
 * keeps what follows the name.
 */
function cleaned(text: string): string {
  let t = text.replace(/^[&\s]+|[&\s]+$/g, '').replace(/\s*&\s*/g, ' ').trim();
  t = t.replace(/^(?:Form|Module|Method|Include|Function|Class)\s+[\w/~=>-]+(?:\s+(?:INPUT|OUTPUT))?\s*(?:[-–:]\s*)?/i, '');
  return t.trim();
}

/** A comment that is no sentence of the author's about the business. */
function unquotable(text: string): boolean {
  const t = text.trim();
  if (t.length < 4 || t.length > MAX_COMMENT) return true;
  if (/^[-=*#_+.~\s<>|/\\]+$/.test(t) || /^[-=*#_]{3,}/.test(t)) return true;
  if (!/\s/.test(t)) return true;
  // A name and a keyword (`CHECK_VONPLATZ INPUT`): code, not a sentence.
  if (t.split(/\s+/).length <= 3 && /\w_\w/.test(t)) return true;
  // Commented-out code: a statement keyword first and a period, an assignment or a code token after it.
  if (ABAP_KEYWORD.test(t) && (/\.\s*$/.test(t) || /=|->|=>|'[^']*'|\bTYPE\b|\bFROM\b|\bINTO\b/i.test(t))) return true;
  if (/^[\w-]+\s*(?:\+|-|\*|\/)?=\s*\S.*\.$/.test(t)) return true;
  // About a change, not about the business.
  if (/^(?:begin|end)\s+of\b|\b(?:INS|DEL|MOD|CHG)\b\s*\d|\b(?:TODO|FIXME|XXX|HACK)\b|^\{|^}|\bchanged by\b|\bge(?:ä|ae)ndert\b|\b\d{1,2}\.\d{1,2}\.\d{2,4}\b|\b(?:19|20)\d{2}\b|\b(?:sp(?:ä|ae)ter|later)\s+(?:entfernen|remove|l(?:ö|oe)schen|delete)\b|\bdrinlassen\b|\bauskommentiert\b|\bcommented out\b|\btransports?\b|\btickets?\b|\bincidents?\b|\bchange request\b|\bCR\s*\d/i.test(t)) return true;
  return false;
}

/** Reads every comment of a source once; `at` answers per statement. */
export function authorCommentsOf(source: string): {
  /** The comment that belongs to a statement on `line`–`lineEnd`: at its end, or the full-line comments right above it. */
  at(line: number | undefined, lineEnd?: number): AuthorComment | null;
} {
  const lines = String(source ?? '').replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  const comments = lineComments(lines);
  return {
    at(line, lineEnd) {
      if (!line) return null;
      const end = Math.max(line, lineEnd ?? line);
      for (let l = line; l <= Math.min(end, line + 2); l++) {
        const c = comments.get(l);
        const said = c && !c.full ? cleaned(c.text) : '';
        if (said && !unquotable(said)) return { text: said.replace(/\s+/g, ' '), line: l, lineEnd: l };
      }
      // Full-line comments right above the statement, read upwards to the first line that is not one.
      const block: Array<{ text: string; line: number }> = [];
      for (let l = line - 1; l >= 1 && block.length < 3; l--) {
        const c = comments.get(l);
        if (!c || !c.full) break;
        if (!c.text) {
          if (block.length) break;
          continue;
        }
        block.unshift({ text: c.text, line: l });
      }
      const wanted = block.filter((b) => !/^[-=*#_+.~\s]+$/.test(b.text));
      if (!wanted.length) return null;
      const text = wanted.map((b) => cleaned(b.text.replace(/^[-=*#\s]+|[-=*#\s]+$/g, ''))).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
      if (unquotable(text)) return null;
      return { text, line: wanted[0].line, lineEnd: wanted[wanted.length - 1].line };
    },
  };
}

/** The comment as the documentation and the naming facts quote it: `Author's comment (line 12): “…”`. */
export function quotedComment(comment: AuthorComment): string {
  const lines = comment.lineEnd > comment.line ? `lines ${comment.line}–${comment.lineEnd}` : `line ${comment.line}`;
  return `${AUTHOR_COMMENT_LABEL} (${lines}): “${comment.text}”`;
}
