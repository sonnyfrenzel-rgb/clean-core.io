/**
 * QA full review of v2.20.0 — 861649f16b0f: several stages finishing in one
 * render collapsed into one announcement, and the earlier ones were then never
 * said at all. Pure: no server.
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { newlyDoneAnnouncement } from '../components/cc/run-announcement';

const stage = (id: string, status: string, result?: string) => ({ id, label: `Stage ${id}`, status, result });

test.describe('861649f16b0f · one announcement names every stage that finished', () => {
  test('two stages done in the same render are both named, in order', () => {
    const announced = new Set<string>();
    const said = newlyDoneAnnouncement(
      [stage('a', 'done', '668 lines'), stage('b', 'done', '14 steps'), stage('c', 'running')],
      announced,
    );
    expect(said).toBe('Stage a: 668 lines. Stage b: 14 steps');
    expect([...announced]).toEqual(['a', 'b']);
  });

  test('a stage is said once — a re-render or a later stage does not repeat it', () => {
    const announced = new Set<string>();
    newlyDoneAnnouncement([stage('a', 'done', 'x'), stage('b', 'running')], announced);
    expect(newlyDoneAnnouncement([stage('a', 'done', 'x'), stage('b', 'running')], announced)).toBeNull();
    expect(newlyDoneAnnouncement([stage('a', 'done', 'x'), stage('b', 'done')], announced)).toBe('Stage b');
  });

  test('the indicator sets its live region once per render, from the helper', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'components/cc/RunIndicator.tsx'), 'utf8');
    expect(src).toContain('newlyDoneAnnouncement(stages, announced.current)');
    // The loop that called `setAnnouncement` per stage is what lost the earlier ones.
    expect(src).not.toMatch(/for \(const stage of stages\)[\s\S]{0,200}setAnnouncement/);
  });
});
