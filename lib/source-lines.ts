/**
 * The line count of a source — one definition for every screen, document and
 * signed field that states "N lines" of it.
 *
 * The rule is the one an editor's gutter follows (owner decision 03.10.2026,
 * UX-182): a line terminator *ends* a line, it does not start one. So
 *
 *   - an empty string has 0 lines;
 *   - `"a"` and `"a\n"` both have 1 line: the final newline ends the last line
 *     and adds no empty line after it;
 *   - `"a\n\n"` has 2 lines and `"a\n\n\n"` has 3: blank lines at the end are
 *     lines like any other, only the very last terminator adds nothing;
 *   - `"\n"` has 1 (empty) line;
 *   - LF, CRLF and a lone CR are all one terminator, so a file saved on
 *     Windows or classic Mac OS counts the same as the same file saved on
 *     Linux.
 *
 * The 668-line starter example `Z_MM_PO_APPROVAL.abap` therefore counts 668,
 * not the 669 that `split('\n').length` gave it (the empty string after the
 * final newline is not a line).
 *
 * This counts lines; it does not index them. Code that maps a line number to
 * its text (L-anchors, snippets, windows) still splits the source, and line N
 * is still line N — the count is simply the number of the last real line.
 */
export function countSourceLines(source: string): number {
  if (!source) return 0;
  const text = source.replace(/\r\n?/g, '\n');
  const parts = text.split('\n').length;
  return text.endsWith('\n') ? parts - 1 : parts;
}
