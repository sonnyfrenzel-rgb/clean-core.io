import { test, expect } from '@playwright/test';
import { runShadow, categorize } from '../scripts/engine4/shadow';

/**
 * Engine 4.0 (ADR-125 (3)): the shadow comparison of L0/L1 against the shipping
 * statement reader, over the starter examples and the benchmark learn halves
 * (never the holdout). It shows progress; it is wired into nothing.
 *
 * The floors are the numbers of the first step (14.11.2026); a change that
 * lowers one, or a disagreement no category explains, fails here and is then
 * either fixed or explained in `scripts/engine4/shadow.ts` and
 * `docs/design/engine4.md`.
 */
test('the new statement layer agrees with the shipping one, and every difference is explained', () => {
  const r = runShadow();
  expect(r.files).toBeGreaterThanOrEqual(390);
  expect(r.uncoveredCharacters).toBe(0);
  expect(r.lexErrors).toBe(0);
  expect(r.aligned / r.oldStatements).toBeGreaterThanOrEqual(0.998);
  expect(r.endLineAgree).toBe(r.aligned);
  expect(r.classAgree / r.aligned).toBeGreaterThanOrEqual(0.996);
  expect(r.openerAgree).toBe(r.aligned);
  expect(r.newUnknown).toBeLessThanOrEqual(1);
  const unexplained = Object.keys(r.categories).filter((k) => k.endsWith(':unexplained'));
  expect(unexplained, JSON.stringify(unexplained.map((k) => r.samples[k]), null, 1)).toEqual([]);
});

test('the categories name what they say', () => {
  expect(categorize('SELECT COUNT(*) INTO :lv FROM vbak ENDEXEC', '[NativeSql/native] SELECT COUNT(*)')).toBe('native-sql-region');
  expect(categorize('DATA(lv) = 1', '[Assignment] DATA ( lv ) = 1')).toBe('inline-declaration-is-an-assignment');
  expect(categorize('check( ls )', '[MethodCall] check ( ls )')).toBe('call-or-assignment-starting-with-a-keyword-name');
  expect(categorize('CLASS a DEFINITION LOCAL FRIENDS b', '[ClassLocalFriends] CLASS a DEFINITION LOCAL FRIENDS b')).toBe('class-interface-not-an-opener');
  expect(categorize('FOO', '[Unknown] FOO')).toBe('unknown-statement');
});
