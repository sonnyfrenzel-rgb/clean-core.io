/**
 * Spreadsheet formula injection (CWE-1236): a cell a spreadsheet would run as a
 * formula. Excel and LibreOffice skip leading spaces before `=`, `+`, `-` and
 * `@`, so a value like `  =HYPERLINK(...)` is a formula too (SEC-2026-803); a
 * leading tab or carriage return is one on its own. Plain numbers (`-12.5`)
 * are data, not formulas, and stay as they are.
 *
 * Shared by every CSV the app writes (the audit pack's findings, the rule
 * register). The generated Node package carries its own copy of the same rule
 * (`lib/transformation/runtime-node.ts`, `neutralise`).
 */
const PLAIN_NUMBER = /^[-+]?\d+(?:\.\d+)?$/;

export function startsLikeFormula(value: string): boolean {
  if (PLAIN_NUMBER.test(value)) return false;
  return /^[\t\r]/.test(value) || /^[ \t\r\n ]*[=+\-@]/.test(value);
}

/** One RFC 4180 cell, a formula-like value prefixed with a single quote. */
export function csvCell(value: unknown): string {
  let s = String(value ?? '');
  if (startsLikeFormula(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
