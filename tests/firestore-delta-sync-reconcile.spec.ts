import { test, expect } from '@playwright/test';
import { reconcile } from '../scripts/firestore-delta-sync';

/**
 * The one rule of the delta sync that can lose data.
 *
 * It runs after traffic has switched to the target database, and every
 * difference between source and target used to be resolved in the source's
 * favour — which put a pre-cutover copy back over whatever a user had written
 * since. Now a differing document is written only when the source is provably
 * newer by `updatedAt`. Everything else is a conflict for a person to look at.
 */

const ts = (iso: string) => ({ toMillis: () => Date.parse(iso), toDate: () => new Date(iso) });

test('a document the target does not have is created', () => {
  expect(reconcile(undefined, { name: 'new' })).toBe('create');
});

test('an identical document is left alone, whatever the key order', () => {
  expect(reconcile({ a: 1, b: { c: 2 } }, { b: { c: 2 }, a: 1 })).toBe('unchanged');
});

test('a source that is provably newer replaces the target', () => {
  const existing = { name: 'old', updatedAt: ts('2026-09-01T10:00:00Z') };
  const incoming = { name: 'newer in source', updatedAt: ts('2026-09-01T12:00:00Z') };
  expect(reconcile(existing, incoming)).toBe('update');
});

test('a target edited after cutover is never overwritten', () => {
  const existing = { name: "the user's post-cutover edit", updatedAt: ts('2026-09-01T12:00:00Z') };
  const incoming = { name: 'stale pre-cutover copy', updatedAt: ts('2026-09-01T10:00:00Z') };
  expect(reconcile(existing, incoming)).toBe('conflict');
});

test('a difference nobody can date is a conflict, not a write', () => {
  expect(reconcile({ name: 'a' }, { name: 'b' })).toBe('conflict');
  expect(reconcile({ name: 'a', updatedAt: ts('2026-09-01T10:00:00Z') }, { name: 'b' })).toBe('conflict');
  expect(reconcile({ name: 'a' }, { name: 'b', updatedAt: ts('2026-09-01T10:00:00Z') })).toBe('conflict');
  const same = ts('2026-09-01T10:00:00Z');
  expect(reconcile({ name: 'a', updatedAt: same }, { name: 'b', updatedAt: same })).toBe('conflict');
});
