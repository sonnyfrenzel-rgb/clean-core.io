/**
 * The line count of an uploaded source — one definition for every screen that
 * states "N lines" of it.
 *
 * The Economics stage models on this figure ("669 LoC from your source"), the
 * stage meta line prints it, and the demo's Economics starts from it. The demo
 * used to model on the count without blanks and comment lines (550 for
 * Z_MM_PO_APPROVAL) while every other screen said 669 — two numbers for one
 * file. Lines are split on LF or CRLF, so a file saved on Windows counts the
 * same as the same file saved anywhere else.
 */
export function sourceLineCount(source: string): number {
  return source.split(/\r?\n/).length;
}
