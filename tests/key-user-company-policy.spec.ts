import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { KEY_USER_COMPANY_POLICY, keyUserStepsMarkdown, type KeyUserStepList } from '../lib/key-user-steps';

/**
 * Owner 21.10.2026: key-user extensibility is SAP-released and Level A, and a company may still restrict or rule it
 * out in its own clean core programme. Wherever the route is offered the reader is told so: the design comparison,
 * the sign-off choice, and the step list the package carries.
 */
const list: KeyUserStepList = {
  scope: 'whole-program',
  levelByConstruction: 'A',
  sentence: 'The whole program is key user.',
  steps: [],
  codeParts: [],
  effort: { steps: 0, entries: 0, checks: 0, byTool: {} },
  note: 'Engine reading.',
} as unknown as KeyUserStepList;

test('the policy note names that the path is SAP-released and that the company may still restrict it', () => {
  expect(KEY_USER_COMPANY_POLICY).toMatch(/SAP releases/);
  expect(KEY_USER_COMPANY_POLICY).toMatch(/your company may restrict it or rule it out/);
  expect(KEY_USER_COMPANY_POLICY).toMatch(/Check your company’s extensibility policy/);
});

test('the package step list carries it', () => {
  expect(keyUserStepsMarkdown(list, 'Z_TEST')).toContain(KEY_USER_COMPANY_POLICY);
});

test('the design comparison and the sign-off choice say it', () => {
  const comparison = fs.readFileSync(path.join(__dirname, '..', 'components', 'design', 'OptionComparison.tsx'), 'utf8');
  expect(comparison).toMatch(/data-option-key-user-policy[\s\S]{0,200}KEY_USER_COMPANY_POLICY/);
  const signOff = fs.readFileSync(path.join(__dirname, '..', 'components', 'ArchitectSignOff.tsx'), 'utf8');
  expect(signOff).toMatch(/clean core programme restricts key-user changes/);
});
