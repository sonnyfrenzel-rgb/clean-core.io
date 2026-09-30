/**
 * Engine findings of the QA slice reviews of 30.09.2026, each fixed where it
 * was confirmed against the current code.
 *
 * - 21933f60c24d: a credential assigned to a prefixed ABAP name (`lv_password`)
 *   was not redacted, because `_` is a word character and `\bPASSWORD` never
 *   matched inside the name.
 * - b99ee9f51490: `BAPI_TRANSACTION_COMMIT` with `WAIT = lv_wait` was reported
 *   as "does not wait"; a variable decides at run time.
 * - e631e5c76d7c: `CLEAR sy-subrc` after a commit was counted as reading the
 *   commit's return code.
 *
 * Serverless: pure functions over text.
 */
import { test, expect } from '@playwright/test';
import { redactCredentials } from '../lib/abap/evidence-model';
import { buildProcessFacts } from '../lib/abap/process-facts';
import { readLuwStates } from '../lib/abap/luw-states';
import { commitWaitWords } from '../lib/process-documentation';

const luw = (lines: string[]) => readLuwStates(buildProcessFacts(['REPORT zt.', 'START-OF-SELECTION.', ...lines].join('\n')));

test('21933f60c24d — a secret assigned to a prefixed name is redacted', () => {
  expect(redactCredentials("lv_password = 'hunter2'.")).not.toContain('hunter2');
  expect(redactCredentials("DATA gv_api_key TYPE string VALUE 'abc123'.")).not.toContain('abc123');
  expect(redactCredentials("ls_conn-token = 'tok-9'.")).not.toContain('tok-9');
  // The unprefixed form stays redacted, and the name stays readable.
  expect(redactCredentials("password = 'hunter2'.")).toBe("password = '…<redacted>'.");
  expect(redactCredentials("lv_password = 'hunter2'.")).toBe("lv_password = '…<redacted>'.");
  // A name that only contains the word in the middle is not a secret field.
  expect(redactCredentials("lv_token_count = '12'.")).toBe("lv_token_count = '12'.");
});

test('b99ee9f51490 — a variable WAIT is undetermined, a literal decides', () => {
  const variable = luw(["  CALL FUNCTION 'BAPI_TRANSACTION_COMMIT' EXPORTING wait = lv_wait."]).events[0];
  expect(variable.andWait).toBeNull();
  expect(variable.subrcCarriesUpdateResult).toBe(false);
  expect(luw(["  CALL FUNCTION 'BAPI_TRANSACTION_COMMIT' EXPORTING wait = 'X'."]).events[0].andWait).toBe(true);
  expect(luw(["  CALL FUNCTION 'BAPI_TRANSACTION_COMMIT' EXPORTING wait = abap_true."]).events[0].andWait).toBe(true);
  expect(luw(["  CALL FUNCTION 'BAPI_TRANSACTION_COMMIT' EXPORTING wait = ' '."]).events[0].andWait).toBe(false);
  expect(luw(["  CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'."]).events[0].andWait).toBe(false);
  expect(commitWaitWords(null)).not.toContain('does not wait');
  expect(commitWaitWords(false)).toBe(', does not wait');
  expect(commitWaitWords(true)).toBe(', waits for the update');
});

test('e631e5c76d7c — clearing sy-subrc after a commit is not reading it', () => {
  const commit = (lines: string[]) => luw(lines).events.find((e) => e.kind === 'commit')!;
  expect(commit(['  COMMIT WORK AND WAIT.', '  CLEAR sy-subrc.', '  IF sy-subrc <> 0.', '  ENDIF.']).subrcRead).toBe(false);
  expect(commit(['  COMMIT WORK AND WAIT.', '  IF sy-subrc <> 0.', '  ENDIF.']).subrcRead).toBe(true);
  expect(commit(['  COMMIT WORK AND WAIT.', '  CLEAR lv_x.', '  IF sy-subrc <> 0.', '  ENDIF.']).subrcRead).toBe(true);
});
