import { test, expect } from '@playwright/test';
import { groupNotDetermined, NOT_DETERMINED_PLAIN } from '../lib/not-determined-plain';
import type { NotDeterminedItem } from '../lib/workspace-model';

/**
 * Management's "Not determined" fold groups by kind (owner, 04.10.2026: "keep
 * that folded") — QA 2769ad3cfafe: the grouping had no test of its own.
 */
const call = (anchor: string): NotDeterminedItem => ({
  label: 'Local function-module call',
  why: 'Only CALL FUNCTION with DESTINATION is assessed, as an RFC.',
  anchor,
  gap: 'local-function-call',
});

test('one group per kind, in first-seen order, with every anchor and the right count', () => {
  const items: NotDeterminedItem[] = [
    call('L121'),
    { label: 'Include whose source was not uploaded', why: 'Include Z_A was not uploaded.', anchor: 'L470', gap: 'include-not-read' },
    call('L165'),
    call('L281'),
    { label: 'Include whose source was not uploaded', why: 'Include Z_B was not uploaded.', anchor: 'L512', gap: 'include-not-read' },
  ];
  const groups = groupNotDetermined(items);
  expect(groups.map((g) => g.key)).toEqual(['local-function-call', 'include-not-read']);
  expect(groups[0]).toMatchObject({ count: 3, anchors: ['L121', 'L165', 'L281'] });
  expect(groups[1]).toMatchObject({ count: 2, anchors: ['L470', 'L512'] });
  // Nothing is dropped: the counts add up to the items.
  expect(groups.reduce((n, g) => n + g.count, 0)).toBe(items.length);
});

test('the plain sentence is the manager sentence for a known kind, the engine sentence otherwise', () => {
  const [known] = groupNotDetermined([call('L121')]);
  expect(known.plain).toBe(NOT_DETERMINED_PLAIN['local-function-call']);
  expect(known.plain).not.toMatch(/CALL FUNCTION|DESTINATION/);
  const [unknown] = groupNotDetermined([{ label: 'Something new', why: 'The engine says why.', anchor: 'L9' }]);
  expect(unknown).toMatchObject({ key: 'Something new', plain: 'The engine says why.', count: 1, anchors: ['L9'] });
});

test('the same line twice counts twice but is listed once', () => {
  const [g] = groupNotDetermined([call('L121'), call('L121')]);
  expect(g.count).toBe(2);
  expect(g.anchors).toEqual(['L121']);
});
