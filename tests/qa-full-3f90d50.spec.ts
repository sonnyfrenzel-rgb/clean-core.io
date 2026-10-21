/**
 * The two high findings of the QA full review of 3f90d50e8e2f.
 *
 *   - 16cebd26aec5 (confirmed): a replacement file being read left the earlier
 *     source staged, so Start Analysis could sign it. The page needs a signed-in
 *     browser and a file chooser to reach that path, so the guard reads the
 *     source and names the shape, as tests/analyze-page-qa220.spec.ts does.
 *   - a1fd17c8adc7 (refuted): `databaseWriteIn` is syntax only; every caller
 *     checks the name against the program's declarations. The block below holds
 *     that the declared internal table is read as one on every surface.
 *
 * Server-free.
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { buildAbapEvidence } from '../lib/abap/evidence-model';
import { readTableDependencies } from '../lib/abap/table-dependencies';
import { extractDataCoupling } from '../lib/abap/code-assessment';
import { buildProcessSkeleton } from '../lib/abap/process-skeleton';
import { APP_VERSION } from '../lib/version';

const ROOT = path.resolve(__dirname, '..');
const ANALYZE = 'app/(app)/project/[projectId]/analyze/page.tsx';

function bodyOf(text: string, declaration: string): string {
  const start = text.indexOf(declaration);
  expect(start, `${declaration} not found`).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = text.indexOf('{', start + declaration.length - 1); i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return text.slice(start, i + 1);
  }
  throw new Error(`${declaration} is not closed`);
}

test('16cebd26aec5: a replacement read unstages the earlier source before it starts, and a failed read is said', () => {
  const handleFile = bodyOf(fs.readFileSync(path.join(ROOT, ANALYZE), 'utf8'), 'const handleFile = (file: File) => {');
  const reader = handleFile.indexOf('new FileReader()');
  expect(reader).toBeGreaterThan(-1);
  const before = handleFile.slice(0, reader);
  // After the type and size refusals, before the read: nothing of the earlier file stays staged.
  const lastRefusal = before.lastIndexOf('return;');
  const cleared = before.indexOf("setLegacyCode('')", lastRefusal);
  expect(cleared, 'the earlier source stays staged while the replacement is read').toBeGreaterThan(lastRefusal);
  expect(before.indexOf('setUploadedFileName(PASTED_SOURCE_NAME)', lastRefusal)).toBeGreaterThan(lastRefusal);
  // A read that fails refuses the file, for the latest selection only.
  const onerror = handleFile.slice(handleFile.indexOf('reader.onerror'));
  expect(handleFile).toContain('reader.onerror');
  expect(onerror.slice(0, onerror.indexOf('};'))).toMatch(/if \(selection !== fileSelectionRef\.current\) return;[\s\S]*rejectFile\(/);
});

test('a1fd17c8adc7 (refuted): a declared internal table written with MODIFY … FROM is no database write on any surface', () => {
  const source = `REPORT zqa.
DATA mara TYPE STANDARD TABLE OF mara.
DATA ls_mara TYPE mara.
START-OF-SELECTION.
  PERFORM upd.
FORM upd.
  LOOP AT mara INTO ls_mara.
    ls_mara-brgew = 1.
    MODIFY mara FROM ls_mara.
  ENDLOOP.
ENDFORM.`;
  const evidence = buildAbapEvidence(source, 'zqa.abap', 'private', undefined, APP_VERSION);
  expect(evidence.findings.filter((f) => f.kind === 'standard-table-write')).toEqual([]);
  expect(JSON.stringify(readTableDependencies(source))).not.toMatch(/"MARA"[^}]*"write"|"write"[^}]*"MARA"/i);
  expect(extractDataCoupling(source, APP_VERSION).filter((c) => /MARA/i.test(JSON.stringify(c)) && /write/i.test(JSON.stringify(c)))).toEqual([]);
  const skeleton = JSON.stringify(buildProcessSkeleton(source));
  expect(skeleton).toContain('"internalTable":true');
  expect(skeleton).not.toMatch(/"kind":"write"/);

  // Not vacuous: the same statement without the declaration is the database write.
  const db = buildAbapEvidence(`REPORT zqa.\nDATA ls_mara TYPE mara.\nMODIFY mara FROM ls_mara.`, 'zqa.abap', 'private', undefined, APP_VERSION);
  expect(db.findings.some((f) => f.kind === 'standard-table-write')).toBe(true);
});
