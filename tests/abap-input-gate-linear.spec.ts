import { test, expect } from '@playwright/test';
import { looksLikeAbap } from '../lib/abap-input-check';

/**
 * The ABAP gate runs on every pasted source before any limit is charged. It must stay linear in the input:
 * a source of mostly blank lines answers in milliseconds, not minutes.
 */
test('a source of blank lines is judged in linear time', () => {
  const blank = `a${'\n'.repeat(100_000)}a`;
  const mixed = `a${' \n\t\r\n'.repeat(40_000)}a`;
  const t0 = Date.now();
  expect(looksLikeAbap(blank)).toBe(false);
  expect(looksLikeAbap(mixed)).toBe(false);
  expect(Date.now() - t0).toBeLessThan(2_000);
});

test('an indented construct after blank lines is still ABAP', () => {
  expect(looksLikeAbap('note\n\n\n   REPORT zx.\n')).toBe(true);
  expect(looksLikeAbap('note\r\n\r\n\tDATA lv TYPE i.\r\n')).toBe(true);
  expect(looksLikeAbap('Dear team,\nplease find the report attached.\n')).toBe(false);
});
