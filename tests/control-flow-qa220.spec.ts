import { test, expect } from '@playwright/test';
import { readControlFlow } from '../lib/abap/control-flow';

/**
 * QA full review of v2.20.0, slice A (485cd7c25d19): an IF without ENDIF has no
 * closing line, but the last arm was cut one line short as if its last body
 * statement were the ENDIF.
 */

test('the last arm of an unterminated IF keeps its last body line', () => {
  const report = readControlFlow([
    'REPORT zqa.',
    "IF lv_x = 'A'.",
    "  lv_y = 'B'.",
    "  lv_z = 'C'.",
  ].join('\n'));
  const branch = report.branches.find((b) => b.lineStart === 2);
  expect(branch, 'the unterminated IF is still read as a branch').toBeTruthy();
  const last = branch!.arms[branch!.arms.length - 1];
  expect(last.lineEnd).toBe(4);
});

test('a terminated IF still ends its arm before the ENDIF', () => {
  const report = readControlFlow([
    'REPORT zqa.',
    "IF lv_x = 'A'.",
    "  lv_y = 'B'.",
    'ENDIF.',
  ].join('\n'));
  const branch = report.branches.find((b) => b.lineStart === 2);
  expect(branch!.arms[0].lineEnd).toBe(3);
});
