import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { uploadedFileNameDefect, UPLOADED_FILE_NAME_MAX_CHARS } from '../lib/uploaded-file-name';
import { PASTED_SOURCE_NAME } from '../lib/source-file-name';
import { STARTER_EXAMPLES } from '../lib/starter-examples';

/**
 * L-05 — the file name a signed run carries is held to what a browser's
 * `File.name` can be, before it enters the signed evidence.
 */
test('names a browser or the gallery produces pass', () => {
  for (const ok of [undefined, null, '', PASTED_SOURCE_NAME, 'ZMM_PO_APPROVAL.abap', 'Bestellung Prüfung (v2).txt', 'z'.repeat(UPLOADED_FILE_NAME_MAX_CHARS)]) {
    expect(uploadedFileNameDefect(ok), JSON.stringify(ok)).toBeNull();
  }
  for (const e of STARTER_EXAMPLES) expect(uploadedFileNameDefect(e.file), e.file).toBeNull();
});

test('anything else is refused with a reason', () => {
  for (const bad of [
    42,
    { name: 'x' },
    ['a.abap'],
    'z'.repeat(UPLOADED_FILE_NAME_MAX_CHARS + 1),
    '   ',
    'report\n.abap',
    'report\u0000.abap',
    'report‮.abap',
    'report⁦x.abap',
    '../secret.abap',
    'dir\\file.abap',
  ]) {
    expect(uploadedFileNameDefect(bad), JSON.stringify(bad)).not.toBeNull();
  }
});

test('runs/create checks the name before it reads the project or charges a unit', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '..', 'app/api/runs/create/route.ts'), 'utf8');
  const check = src.indexOf('uploadedFileNameDefect(uploadedFileName)');
  expect(check, 'the route checks the file name').toBeGreaterThan(-1);
  expect(check).toBeLessThan(src.indexOf('await getAdminDb()'));
  expect(check).toBeLessThan(src.indexOf("const targetFileName = uploadedFileName || 'unknown_file.abap'"));
});
