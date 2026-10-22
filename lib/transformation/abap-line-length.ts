/**
 * ABAP source lines are at most 255 characters (the first SAP trial import of the QM example, 18.10.2026: the
 * engine wrote an original's condition on one line of 333 characters — `when_g0478` — abaplint said nothing,
 * the abapGit pull of the logic class failed with "The statement METHOD … is unexpected", and saving it in ADT
 * said "ABAP source code lines longer than 255 characters are not allowed").
 *
 * A statement may span lines, so a long line breaks at a blank outside literals, string templates and the end
 * comment; the continuation is indented two more. A comment that alone is too long continues as a comment of
 * the same kind. A line that has no such blank (one literal longer than the limit) is left as it is — the
 * abaplint rule `line_length` (`abaplint-config.ts`) then names it.
 *
 * Pure: text in, text out.
 */

export const ABAP_MAX_LINE = 255;

/** Where the code of a line ends: the index of a `"` that starts the end comment, or the line's length. */
function codeEnd(line: string): number {
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === quote) {
        if (line[i + 1] === quote && quote !== '|') i++;
        else quote = null;
      } else if (c === '\\' && quote === '|') i++;
      continue;
    }
    if (c === "'" || c === '`' || c === '|') quote = c;
    else if (c === '"') return i;
  }
  return line.length;
}

/** The blanks of the code part that lie outside a literal or template — where the line may break. */
function breakpoints(code: string): number[] {
  const out: number[] = [];
  let quote: string | null = null;
  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    if (quote) {
      if (c === quote) {
        if (code[i + 1] === quote && quote !== '|') i++;
        else quote = null;
      } else if (c === '\\' && quote === '|') i++;
      continue;
    }
    if (c === "'" || c === '`' || c === '|') quote = c;
    else if (c === ' ' && i > 0 && code[i - 1] !== ' ') out.push(i);
  }
  return out;
}

function wrapComment(line: string, max: number): string[] {
  const m = /^(\s*)(\*|"!?)\s?/.exec(line)!;
  const prefix = `${line.startsWith('*') ? '*' : `${m[1]}${m[2]}`} `;
  const words = line.slice(m[0].length).split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let cur = prefix;
  for (const w of words) {
    if (cur.length > prefix.length && cur.length + 1 + w.length > max) {
      out.push(cur.trimEnd());
      cur = prefix;
    }
    cur += (cur.length > prefix.length ? ' ' : '') + w;
  }
  if (cur.trim()) out.push(cur.trimEnd());
  return out.every((l) => l.length <= max) ? out : [line];
}

/**
 * A literal longer than a line can hold, as chunks joined with `&&` (FI holdout, 18.10.2026: the golden master
 * carries a CONCATENATE result of 300 characters as one literal). A chunk never ends on a blank — a text literal
 * drops its trailing blanks — and never splits a doubled quote.
 */
function splitLongLiterals(code: string, room: number): string {
  const limit = Math.max(40, Math.min(200, room - 20));
  // A string template (`|…|`) is matched too, and left as it is: an apostrophe inside it is template text, not a
  // literal's delimiter (QA review of ee72ca2218e1, e32348bc3bf7).
  return code.replace(/\|(?:[^|\\]|\\.)*\||'(?:[^']|'')*'|`(?:[^`]|``)*`/g, (lit) => {
    if (lit[0] === '|' || lit.length <= limit) return lit;
    const q = lit[0];
    const body = lit.slice(1, -1);
    const parts: string[] = [];
    let at = 0;
    while (at < body.length) {
      let end = Math.min(body.length, at + limit - 4);
      // Inside a literal the quote only appears doubled: a cut with an odd count of quotes before it splits a pair.
      if (end < body.length && body.slice(at, end).split(q).length % 2 === 0) end--;
      const chunk = body.slice(at, end);
      // Every chunk but the last is a string literal (`…`), which keeps its blanks — a text literal ('…') would
      // drop trailing ones. The last chunk ends where the original ends: as written.
      parts.push(end < body.length && q === "'" ? `\`${chunk.replace(/''/g, "'").replace(/`/g, '``')}\`` : `${q}${chunk}${q}`);
      at = end;
    }
    return parts.join(' && ');
  });
}

/** One source line as one or more lines of at most `max` characters, where it can break. */
export function wrapAbapLine(line: string, max: number = ABAP_MAX_LINE): string[] {
  if (line.length <= max) return [line];
  if (/^\*/.test(line) || /^\s*"/.test(line)) return wrapComment(line, max);
  const end = codeEnd(line);
  const code = splitLongLiterals(line.slice(0, end).trimEnd(), max - (/^\s*/.exec(line)![0].length + 2));
  const comment = line.slice(end);
  const indent = /^\s*/.exec(line)![0];
  const lines: string[] = [];
  let rest = code;
  let lead = '';
  while (lead.length + rest.length > max) {
    const room = max - lead.length;
    const at = breakpoints(rest).filter((p) => p <= room && rest.slice(0, p).trim()).pop();
    if (at === undefined) break;
    lines.push(`${lead}${rest.slice(0, at)}`.trimEnd());
    rest = rest.slice(at + 1).trimStart();
    lead = `${indent}  `;
  }
  lines.push(`${lead}${rest}`);
  if (comment) {
    const joined = `${lines[lines.length - 1]} ${comment}`;
    if (joined.length <= max) lines[lines.length - 1] = joined;
    else lines.push(...wrapComment(`${indent}${comment}`, max));
  }
  return lines;
}

/** Every line of an ABAP source at most `max` characters, where it can break. */
export function wrapAbapSource(source: string, max: number = ABAP_MAX_LINE): string {
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const lines = source.split(/\r?\n/);
  if (lines.every((l) => l.length <= max)) return source;
  return lines.flatMap((l) => wrapAbapLine(l, max)).join(eol);
}

/** The files of a package with every `.abap` source wrapped; other files unchanged. */
export function wrapAbapFiles<F extends { path: string; content: string }>(files: readonly F[], max: number = ABAP_MAX_LINE): F[] {
  return files.map((f) => (/\.abap$/i.test(f.path) ? { ...f, content: wrapAbapSource(f.content, max) } : f));
}
