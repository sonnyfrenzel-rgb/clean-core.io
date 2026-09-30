import { test, expect } from '@playwright/test';
import { buildAbapEvidence } from '../lib/abap/evidence-model';

/**
 * QA full review of v2.20.0, slice A — the evidence model.
 *
 *   5ed413d0afb2  an unlisted `/NS/` table was called a "Custom Table".
 *   a9bce5e89cb0  a curated replacement made the finding a 'catalog-match'.
 *   cec3ee109f4c  two modification regions under one transport were merged into one.
 *   90cdec9128c9  a function-module name in a message literal was reported as a call.
 *   630fa27f8d28  a write to the customer's own table was called a clean core violation.
 */

const findings = (code: string, deployment: 'public' | 'private' = 'private') =>
  buildAbapEvidence(code, 'ZQA', deployment).findings;
const src = (...lines: string[]) => lines.join('\n');

test('an unlisted namespaced table is not asserted to be the customer\'s', () => {
  const [write] = findings(src('REPORT zqa.', 'UPDATE /acme/t_order SET status = abap_true.'))
    .filter((f) => f.kind === 'custom-table-write');
  expect(write).toBeTruthy();
  expect(write.title).not.toMatch(/Custom Table/);
  expect(write.technicalDetail).toMatch(/does not say which/);
});

test('a write to a customer table is not called a clean core violation', () => {
  const [write] = findings(src('REPORT zqa.', 'UPDATE zorders SET status = abap_true.'))
    .filter((f) => f.kind === 'custom-table-write');
  expect(write.title).toBe('Direct Write to Custom Table ZORDERS');
  expect(write.cleanCoreImpact).not.toMatch(/violating clean core rules/i);
});

test('a curated replacement leaves the finding a static-parser finding', () => {
  for (const f of findings(src('REPORT zqa.', 'SELECT * FROM vbak INTO TABLE @DATA(lt_vbak).'))) {
    if (!f.sapReplacement) continue;
    const expected = f.sapReplacement.confidence === 'Catalog Match' ? 'catalog-match' : 'static-parser';
    expect(f.source, `${f.title}: ${f.sapReplacement.confidence}`).toBe(expected);
  }
  const vbak = findings(src('REPORT zqa.', 'SELECT * FROM vbak INTO TABLE @DATA(lt_vbak).'))
    .find((f) => f.sapReplacement?.confidence === 'Verified');
  expect(vbak, 'VBAK carries a curated replacement').toBeTruthy();
  expect(vbak!.source).toBe('static-parser');
});

test('two modification regions under one transport request are two modifications', () => {
  const mods = findings(src(
    'REPORT zmod.',
    '*{   INSERT         DEVK900123                                        1',
    "  WRITE 'first'.",
    '*}   INSERT',
    "  WRITE 'standard'.",
    '*{   INSERT         DEVK900123                                        2',
    "  WRITE 'second'.",
    '*}   INSERT',
  )).filter((f) => f.kind === 'modification');
  expect(mods.map((m) => m.lineStart)).toEqual([2, 6]);
});

test('a function-module name in a message literal is not a call', () => {
  const kinds = findings(src(
    'REPORT zqa.',
    "PERFORM add_log USING 'WARN' 'GUI_DOWNLOAD' 'failed'.",
    "DATA(lv_text) = 'REUSE_ALV_GRID_DISPLAY'.",
    "lv_note = 'SO_NEW_DOCUMENT_SEND_API1'.",
  )).map((f) => f.kind);
  expect(kinds).not.toContain('gui-download');
  expect(kinds).not.toContain('classic-alv');
  expect(kinds).not.toContain('legacy-mail');
});

test('the calls themselves are still found', () => {
  const kinds = findings(src(
    'REPORT zqa.',
    "CALL FUNCTION 'GUI_DOWNLOAD' EXPORTING filename = lv_f.",
    "CALL FUNCTION 'REUSE_ALV_GRID_DISPLAY' EXPORTING x = 1.",
    "CALL FUNCTION 'SO_NEW_DOCUMENT_SEND_API1' EXPORTING x = 1.",
    'CALL METHOD cl_gui_frontend_services=>gui_upload EXPORTING filename = lv_f.',
  )).map((f) => f.kind);
  expect(kinds.filter((k) => k === 'gui-download')).toHaveLength(2);
  expect(kinds).toContain('classic-alv');
  expect(kinds).toContain('legacy-mail');
});
