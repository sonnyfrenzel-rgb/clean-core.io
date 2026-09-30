/**
 * The support findings describe the hierarchy and the body as they are.
 *
 * QA full review of v2.20.0 (fc787674705f):
 *   a250f878343a — a missing interface beside a "fully resolved" hierarchy;
 *   2f79b8aedde5 — a dynamic call broken over two lines was not found.
 *
 * Serverless: pure functions over text.
 */
import { test, expect } from '@playwright/test';
import { buildClassModel } from '../lib/abap/class-model-resolver';
import { detectFindings } from '../lib/abap/findings-detector';

const sourcesOf = (content: string) => [{ file: 'main.abap', content }];

test('a250f878343a — a missing customer interface keeps the hierarchy from reading "fully resolved"', () => {
  const sources = [
    {
      file: 'child.abap',
      content: [
        'CLASS zcl_child DEFINITION INHERITING FROM zcl_base.',
        '  PUBLIC SECTION.',
        '    INTERFACES zif_helper.',
        'ENDCLASS.',
      ].join('\n'),
    },
    { file: 'base.abap', content: 'CLASS zcl_base DEFINITION.\nENDCLASS.' },
  ];
  const model = buildClassModel(sources);
  expect(model.missing.map((m) => m.impact), 'the premise: a missing type that does not block').toEqual([
    'reduces-confidence',
  ]);
  const hierarchy = detectFindings(model, sources).find((f) => f.construct === 'deep-inheritance')!;
  expect(hierarchy.detail).not.toMatch(/fully resolved/i);
  expect(hierarchy.level).toBe('partial');

  // Supplied, the same hierarchy is fully resolved again.
  const complete = [...sources, { file: 'helper.abap', content: 'INTERFACE zif_helper.\nENDINTERFACE.' }];
  const resolved = detectFindings(buildClassModel(complete), complete).find((f) => f.construct === 'deep-inheritance')!;
  expect(resolved.detail).toMatch(/fully resolved/i);
  expect(resolved.level).toBe('fully');
});

test('2f79b8aedde5 — a dynamic call written over two lines is found, at its first line, once', () => {
  const content = ['REPORT zt.', 'DATA lv_fm TYPE rs38l_fnam.', 'CALL FUNCTION', '  lv_fm.'].join('\n');
  const model = buildClassModel(sourcesOf(content));
  const dynamic = detectFindings(model, sourcesOf(content)).filter((f) => f.construct === 'dynamic-call');
  expect(dynamic.map((f) => f.location?.line)).toEqual([3]);
});

test('2f79b8aedde5 — the static call and the one-line form are unchanged', () => {
  const lines = ['REPORT zt.', "CALL FUNCTION 'Z_STATIC'.", 'CALL FUNCTION', "  'Z_ALSO_STATIC'.", 'CALL FUNCTION lv_fm.'];
  const content = lines.join('\n');
  const dynamic = detectFindings(buildClassModel(sourcesOf(content)), sourcesOf(content)).filter(
    (f) => f.construct === 'dynamic-call',
  );
  expect(dynamic.map((f) => f.location?.line)).toEqual([5]);
});
