/**
 * The skeleton attaches what a statement did to that statement.
 *
 * QA full review of v2.20.0 (fc787674705f):
 *   829689a504c4 — two transaction calls on one line both labelled with the first;
 *   5390fabd4c02 — a sy-subrc check after F2 hung an error boundary on F1.
 *
 * Serverless: a pure function over text.
 */
import { test, expect } from '@playwright/test';
import { buildProcessSkeleton } from '../lib/abap/process-skeleton';

const skeleton = (lines: string[]) => buildProcessSkeleton(['REPORT zt.', 'START-OF-SELECTION.', ...lines].join('\n'));

test('829689a504c4 — two CALL TRANSACTION statements on one line keep their own codes', () => {
  const s = skeleton(["  CALL TRANSACTION 'VA01'. CALL TRANSACTION 'ME21N'."]);
  const labels = s.nodes.filter((n) => n.kind === 'transaction').map((n) => n.label);
  expect(labels).toEqual(['VA01', 'ME21N']);
});

const boundaries = (lines: string[]) =>
  skeleton(lines).nodes.filter((n) => n.kind === 'error-boundary').map((n) => n.label);

test('5390fabd4c02 — a check after an intervening call is not F1\'s error boundary', () => {
  expect(
    boundaries([
      "  CALL FUNCTION 'Z_F1' EXCEPTIONS not_found = 1 OTHERS = 2.",
      "  CALL FUNCTION 'Z_F2'.",
      '  IF sy-subrc <> 0.',
      "    MESSAGE 'failed' TYPE 'E'.",
      '  ENDIF.',
    ]),
    'the check reads F2, which may carry it; it never reads F1',
  ).not.toContain('Z_F1');
});

test('5390fabd4c02 — the check right after the call, or after a declaration, is still its boundary', () => {
  for (const between of [[], ['  DATA lv_rc TYPE i.']]) {
    expect(
      boundaries([
        "  CALL FUNCTION 'Z_F1' EXCEPTIONS not_found = 1 OTHERS = 2.",
        ...between,
        '  IF sy-subrc <> 0.',
        "    MESSAGE 'failed' TYPE 'E'.",
        '  ENDIF.',
      ]),
      between.join(' ') || 'adjacent',
    ).toEqual(['Z_F1']);
  }
});
