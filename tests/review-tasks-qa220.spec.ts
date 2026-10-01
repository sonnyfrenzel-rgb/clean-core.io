/**
 * Every dynamic call gets its task, and the task names the method expression.
 *
 * QA full review of v2.20.0 (fc787674705f): adec5f3c724f, 6b69efcb686e.
 *
 * Serverless: a pure function over text.
 */
import { test, expect } from '@playwright/test';
import { deriveReviewTasks } from '../lib/abap/review-tasks';

const dynamicTasks = (lines: string[]) =>
  deriveReviewTasks(['REPORT zt.', 'START-OF-SELECTION.', ...lines].join('\n')).tasks.filter(
    (t) => t.kind === 'dynamic-call',
  );
const names = (lines: string[]) =>
  dynamicTasks(lines).flatMap((t) => t.anchors.filter((a) => a.kind === 'name').map((a) => a.label));

test('adec5f3c724f — two dynamic calls on one line are two tasks', () => {
  expect(names(['  CALL FUNCTION lv_first. CALL FUNCTION lv_second.'])).toEqual(['lv_first', 'lv_second']);
});

test('adec5f3c724f — one call seen by both readers is still one task', () => {
  expect(dynamicTasks(['  CALL FUNCTION lv_fm.'])).toHaveLength(1);
});

test('6b69efcb686e — CALL METHOD (class)=>(method) asks for the method expression', () => {
  expect(names(['  CALL METHOD (lv_class)=>(lv_method).'])).toEqual(['lv_method']);
  expect(names(['  CALL METHOD lo_x->(lv_meth).'])).toEqual(['lv_meth']);
});
