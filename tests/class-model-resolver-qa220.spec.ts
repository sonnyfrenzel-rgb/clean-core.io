import { test, expect } from '@playwright/test';
import { buildClassModel } from '../lib/abap/class-model-resolver';

/**
 * QA full review of v2.20.0, slice A.
 *
 *   4f9fe603aa96  A inheriting B and B inheriting A came back `resolved: true`.
 *   20b6add72f03  `CLASS zcl_parent DEFINITION DEFERRED.` became an empty class node,
 *                 so a child of a parent nobody uploaded looked resolved.
 */

const model = (content: string) => buildClassModel([{ file: 'main.abap', content }]);

test('circular inheritance is not a resolved hierarchy', () => {
  const m = model([
    'CLASS zcl_a DEFINITION INHERITING FROM zcl_b.',
    'ENDCLASS.',
    'CLASS zcl_b DEFINITION INHERITING FROM zcl_a.',
    'ENDCLASS.',
  ].join('\n'));
  expect(m.missing).toEqual([]);
  expect(m.resolved).toBe(false);
});

test('a plain two-level hierarchy is still resolved', () => {
  const m = model([
    'CLASS zcl_parent DEFINITION.',
    'ENDCLASS.',
    'CLASS zcl_child DEFINITION INHERITING FROM zcl_parent.',
    'ENDCLASS.',
  ].join('\n'));
  expect(m.resolved).toBe(true);
});

test('a DEFERRED forward declaration does not supply the parent', () => {
  // The forward declaration last: that is where the parser used to push it as
  // a finished node at the end of the file.
  const m = model([
    'CLASS zcl_child DEFINITION INHERITING FROM zcl_parent.',
    'ENDCLASS.',
    'CLASS zcl_parent DEFINITION DEFERRED.',
  ].join('\n'));
  expect(Object.keys(m.nodes)).not.toContain('ZCL_PARENT');
  expect(m.missing.map((d) => d.ref)).toContain('ZCL_PARENT');
  expect(m.resolved).toBe(false);
});
