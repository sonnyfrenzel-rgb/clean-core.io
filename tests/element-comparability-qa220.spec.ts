import { test, expect } from '@playwright/test';
import { classifyCondition, technicalMarkersIn } from '../lib/abap/element-comparability';

/**
 * QA full review of v2.20.0, slice A (7228a660aca0): a technical marker or a
 * structure component written *inside a literal* classified the condition — a
 * word in quotes is not a return code, and not a field.
 */

test('a technical marker inside a literal is not a technical test', () => {
  expect(classifyCondition("lv_text = 'SY-SUBRC'")).toBe('unknown');
  expect(technicalMarkersIn("lv_text = 'SY-SUBRC'")).toEqual([]);
});

test('a component-shaped word inside a literal is not a business field', () => {
  expect(classifyCondition("lv_text = 'ls_order-status'")).toBe('unknown');
});

test('the real forms still classify as before', () => {
  expect(classifyCondition('sy-subrc <> 0')).toBe('technical');
  expect(classifyCondition("ls_order-status = 'BLOCKED'")).toBe('business');
});
