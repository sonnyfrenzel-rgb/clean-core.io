import { test, expect } from '@playwright/test';
import { planUnits, programLabel } from '../lib/transformation/unit-plan';

/**
 * When the source names no program, the plan falls back to the project's name — free text the engine then writes
 * into comments, CDS labels and string constants of its own, digest-signed files. Only characters that cannot end
 * such a comment, label or string pass; an ordinary name reads exactly as it was given.
 */
const SOURCE = ['FORM check_limit.', "  WRITE 'x'.", 'ENDFORM.', '', 'START-OF-SELECTION.', '  PERFORM check_limit.', ''].join('\n');

test('the fallback name cannot end a comment, a label or a string', () => {
  const name = "Orders */ export const injected = 1; /* it's\n* REPORT x. \"q\" `t` \\ {x} $y";
  const label = programLabel(name)!;
  for (const bad of ['*/', '/*', "'", '"', '`', '\\', '\n', '\r', '{', '}', '$', ';', '*']) expect(label, `kept ${JSON.stringify(bad)}`).not.toContain(bad);
  expect(planUnits(SOURCE, { program: name }).program).toBe(label);
  expect(programLabel(['a', 'b', 'c'].join(String.fromCharCode(0x2028)).replace('c', String.fromCharCode(0x202e) + 'c'))).toBe('a b c');
  expect(programLabel(String.fromCharCode(42, 10, 34))).toBeNull();
});

test('an ordinary name and a declared program are unchanged', () => {
  for (const ok of ['Material Rule Change (v2)', 'ZMM_WB_INBOUND', 'Bestellung – Prüfung', 'PO 4.5: check, release & post #2', '']) {
    expect(programLabel(ok), ok).toBe(ok);
  }
  expect(programLabel(null)).toBeNull();
  expect(planUnits(SOURCE, { program: 'Material Rule Change' }).program).toBe('Material Rule Change');
  expect(planUnits(`REPORT zmm_check.\n${SOURCE}`, { program: 'x */ y' }).program).toBe('ZMM_CHECK');
});
