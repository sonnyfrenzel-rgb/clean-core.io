import { test, expect } from '@playwright/test';
import { buildAbapEvidence, redactCredentials } from '../lib/abap/evidence-model';
import { ENGINE_READS_320_FROM } from '../lib/abap/engine-reads-320-gate';

/**
 * Findings of the QA full review of v3.1.0 (c23d6caa688a), server-free. Both changes alter signed findings,
 * so both are read from engine 3.2.0 on; a run of 3.1.0 keeps what it signed.
 */

const NEW = ENGINE_READS_320_FROM;
const OLD = '3.1.0';

test.describe('a credential in a backtick literal or string template is redacted (25ecb183cbf5)', () => {
  test('backtick and template values are redacted from 3.2.0, delimiters kept', () => {
    expect(redactCredentials('DATA(lv_password) = |s3cr3t-Value| && \'C:\\temp\'.', NEW)).toBe(
      "DATA(lv_password) = |…<redacted>| && 'C:\\temp'.",
    );
    expect(redactCredentials('lv_token = `abc-123-def`.', NEW)).toBe('lv_token = `…<redacted>`.');
    // An embedded expression is part of the template and goes with it, bar included.
    expect(redactCredentials('lv_secret = |pre{ lv_x }post|.', NEW)).toBe('lv_secret = |…<redacted>|.');
    expect(redactCredentials('lv_secret = |a\\|b-tail|.', NEW)).toBe('lv_secret = |…<redacted>|.');
    // A snippet cut off inside the template still loses the secret.
    expect(redactCredentials('lv_api_key = |AbCdEf0123', NEW)).toBe('lv_api_key = |…<redacted>');
    expect(redactCredentials("CONSTANTS c_pwd TYPE string VALUE `hunter2`.", NEW)).toBe('CONSTANTS c_pwd TYPE string VALUE `…<redacted>`.');
  });

  test('single-quoted values read as before, counters stay readable in every form', () => {
    expect(redactCredentials("lv_password = 'hunter2'.", NEW)).toBe("lv_password = '…<redacted>'.");
    expect(redactCredentials("lv_password = 'it''s-me'.", NEW)).toBe("lv_password = '…<redacted>'.");
    expect(redactCredentials("lv_token_count = '12'.", NEW)).toBe("lv_token_count = '12'.");
    expect(redactCredentials('lv_token_count = |12|.', NEW)).toBe('lv_token_count = |12|.');
    expect(redactCredentials('lv_matnr = |MAT-001|.', NEW)).toBe('lv_matnr = |MAT-001|.');
  });

  test('a run of 3.1.0 keeps what it signed', () => {
    const line = 'DATA(lv_password) = |s3cr3t-Value| && \'C:\\temp\'.';
    expect(redactCredentials(line, OLD)).toBe(line);
    expect(redactCredentials("lv_password = 'hunter2'.", OLD)).toBe("lv_password = '…<redacted>'.");
  });

  test('the finding the hardcoded path raises no longer prints the secret', () => {
    const code = ['REPORT zqa.', "DATA(lv_password) = |s3cr3t-Value| && 'C:\\temp\\out.txt'."].join('\n');
    const printed = (engine: string) => JSON.stringify(buildAbapEvidence(code, 'zqa.prog.abap', 'private', undefined, engine).findings);
    expect(printed(OLD)).toContain('s3cr3t-Value');
    expect(printed(NEW)).not.toContain('s3cr3t-Value');
  });
});

test.describe('a copied function-module name stops at an overwrite (bb4c536fe4fd, 5298757260c1)', () => {
  const kinds = (code: string, engine: string) =>
    buildAbapEvidence(code, 'zqa.prog.abap', 'private', undefined, engine).findings.map((f) => f.kind);
  const overwritten = [
    'REPORT zqa.',
    "CONSTANTS c_mail TYPE rs38l_fnam VALUE 'SO_NEW_DOCUMENT_SEND_API1'.",
    'DATA lv_fm TYPE rs38l_fnam.',
    'lv_fm = c_mail.',
    "lv_fm = 'Z_OWN_SEND'.",
    'CALL FUNCTION lv_fm.',
  ].join('\n');

  test('an overwrite on the straight line before the call: no module finding from 3.2.0', () => {
    expect(kinds(overwritten, NEW)).not.toContain('legacy-mail');
    // MOVE and CLEAR overwrite the same way.
    expect(kinds(overwritten.replace("lv_fm = 'Z_OWN_SEND'.", "MOVE 'Z_OWN_SEND' TO lv_fm."), NEW)).not.toContain('legacy-mail');
    expect(kinds(overwritten.replace("lv_fm = 'Z_OWN_SEND'.", 'CLEAR lv_fm.'), NEW)).not.toContain('legacy-mail');
    // A run of 3.1.0 keeps the finding it signed.
    expect(kinds(overwritten, OLD)).toContain('legacy-mail');
  });

  test('a call before the overwrite, or a branch around it, still reaches the copy', () => {
    const calledFirst = overwritten.replace("lv_fm = 'Z_OWN_SEND'.", "CALL FUNCTION lv_fm.\nlv_fm = 'Z_OWN_SEND'.");
    expect(kinds(calledFirst, NEW)).toContain('legacy-mail');
    const branched = [
      'REPORT zqa.',
      "CONSTANTS c_mail TYPE rs38l_fnam VALUE 'SO_NEW_DOCUMENT_SEND_API1'.",
      'DATA lv_fm TYPE rs38l_fnam.',
      'IF sy-batch = abap_true.',
      'lv_fm = c_mail.',
      'ELSE.',
      "lv_fm = 'Z_OWN_SEND'.",
      'ENDIF.',
      'CALL FUNCTION lv_fm.',
    ].join('\n');
    expect(kinds(branched, NEW)).toContain('legacy-mail');
    // The plain copy without an overwrite is unchanged.
    expect(kinds(overwritten.replace("lv_fm = 'Z_OWN_SEND'.\n", ''), NEW)).toContain('legacy-mail');
  });
});
