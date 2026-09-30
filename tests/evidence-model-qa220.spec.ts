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
