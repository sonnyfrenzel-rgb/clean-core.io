/**
 * What the MCP beta hands back from a user's ABAP source, made safe to put into
 * another assistant's context (docs/design/mcp-beta.md, threat table in SECURITY.md §14).
 *
 * The answer of an MCP tool lands in the host model's context as if a trusted
 * tool had written it. Everything in it that was copied from the source is
 * therefore treated as data that may have been written to steer that model:
 *
 *   - **Comment text is never returned.** A full-line comment (`*` in column 1)
 *     and the text after a `"` outside a literal are removed from every quoted
 *     line. Comments are where an instruction to the host would be written, and
 *     they often hold names of people.
 *   - **Long literals are cut.** A string literal keeps its first
 *     {@link MAX_LITERAL} characters and is marked as cut.
 *   - **Invisible and direction-changing characters are removed** (control
 *     characters, zero-width characters, bidi overrides and isolates — the
 *     "Trojan Source" set), so what a reader sees is what the text says.
 *   - **Markdown image and link syntax and fetching HTML tags are broken up**
 *     (`![`, `](`, `<img`, …), so no host renders an image from a URL that came
 *     out of the source — the classic way to send data out through a picture.
 *
 * Pure: no I/O, no clock, no randomness. The same input gives the same output.
 */

/** The longest string literal kept in a quoted span; a longer one is cut and marked. */
export const MAX_LITERAL = 60;

/** The longest quoted span (a snippet, a condition, a rule text) returned. */
export const MAX_QUOTED = 160;

/**
 * C0 and C1 control characters except tab and line feed, zero-width characters,
 * the byte order mark, and every bidi embedding, override, isolate and mark.
 */
const INVISIBLE =
  /[\u0000-\u0008\u000B-\u001F\u007F-\u009F­͏؜ᅟᅠ឴឵᠋-᠏​-‏‪-‮⁠-⁯ㅤ︀-️﻿ﾠ￹-￻]/g;

/** HTML tags a markdown renderer may turn into a request for a URL. */
const FETCHING_TAG = /<(?=\/?\s*(?:img|image|iframe|script|link|object|embed|video|audio|source|svg|picture|frame|meta|style)\b)/gi;

/**
 * Remove invisible characters and break the syntax that makes a renderer fetch
 * or link: `![` becomes `! [`, `](` becomes `] (`, `<img` becomes `< img`.
 * Applied to every string of a result, engine words included — engine words
 * never contain these sequences, so they are unchanged.
 */
export function neutralise(text: string): string {
  return text
    .replace(INVISIBLE, '')
    .replace(/!\[/g, '! [')
    .replace(/\]\(/g, '] (')
    .replace(FETCHING_TAG, '< ');
}

/** {@link neutralise} over every string inside a JSON-like value; keys stay as they are. */
export function neutraliseDeep<T>(value: T): T {
  if (typeof value === 'string') return neutralise(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => neutraliseDeep(v)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = neutraliseDeep(v);
    return out as T;
  }
  return value;
}

/**
 * One line of ABAP without its comment: empty for a full-line comment (`*` in
 * column 1), otherwise the text before the first `"` that stands outside a
 * literal (`'…'`, `` `…` `` or a string template `|…|`).
 */
export function stripLineComment(line: string): string {
  if (line.startsWith('*')) return '';
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (quote === '|' && ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '`' || ch === '|') {
      quote = ch;
      continue;
    }
    if (ch === '"') return line.slice(0, i).replace(/\s+$/, '');
  }
  return line;
}

/** {@link stripLineComment} for every line of a text; the number of lines stays the same. */
export function stripComments(text: string): string {
  return text
    .split(/\r\n|\r|\n/)
    .map(stripLineComment)
    .join('\n');
}

/** Cut every string literal longer than {@link MAX_LITERAL} characters, marking the cut. */
export function capLiterals(text: string): string {
  const cut = (open: string, body: string, close: string) =>
    body.length > MAX_LITERAL ? `${open}${body.slice(0, MAX_LITERAL)}…[${body.length - MAX_LITERAL} more]${close}` : `${open}${body}${close}`;
  return text
    .replace(/'((?:[^'\n]|'')*)'/g, (_m, body: string) => cut("'", body, "'"))
    .replace(/`((?:[^`\n]|``)*)`/g, (_m, body: string) => cut('`', body, '`'))
    .replace(/\|((?:[^|\n\\]|\\.)*)\|/g, (_m, body: string) => cut('|', body, '|'));
}

/**
 * A span copied from the source, as it may be returned: comments removed,
 * literals capped, whitespace collapsed to one line, neutralised, and at most
 * `max` characters long.
 */
export function quoteSource(text: string | null | undefined, max = MAX_QUOTED): string {
  if (!text) return '';
  const oneLine = capLiterals(stripComments(text)).replace(/\s+/g, ' ').trim();
  const safe = neutralise(oneLine);
  return safe.length > max ? `${safe.slice(0, max - 1)}…` : safe;
}
