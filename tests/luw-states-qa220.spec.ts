/**
 * A commit's return code is read only where nothing in between overwrote it.
 *
 * QA full review of v2.20.0 (fc787674705f), 8c3d47dbf614.
 *
 * Serverless: pure functions over text.
 */
import { test, expect } from '@playwright/test';
import { buildProcessFacts } from '../lib/abap/process-facts';
import { readLuwStates } from '../lib/abap/luw-states';

const commitOf = (lines: string[]) => {
  const model = readLuwStates(buildProcessFacts(['REPORT zt.', 'START-OF-SELECTION.', ...lines].join('\n')));
  return model.events.find((e) => e.kind === 'commit')!;
};

test('8c3d47dbf614 — a check after an intervening call does not read the commit', () => {
  const commit = commitOf(["  COMMIT WORK AND WAIT.", "  CALL FUNCTION 'Z_OTHER'.", '  IF sy-subrc <> 0.', '  ENDIF.']);
  expect(commit.subrcRead).toBe(false);
});

test('8c3d47dbf614 — the check right after, or after a declaration, still reads it', () => {
  expect(commitOf(['  COMMIT WORK AND WAIT.', '  IF sy-subrc <> 0.', '  ENDIF.']).subrcRead).toBe(true);
  expect(
    commitOf(['  COMMIT WORK AND WAIT.', '  DATA lv_rc TYPE i.', '  IF sy-subrc <> 0.', '  ENDIF.']).subrcRead,
  ).toBe(true);
});
