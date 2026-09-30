/**
 * UI findings of the QA slice reviews of 30.09.2026 that are about state
 * outliving the place it was read for, each confirmed and fixed:
 *
 * - 9e437b2930c4: the invitation preview stayed after a sign-out or an account
 *   switch.
 * - 76118078e97f: the assistant kept project A's conversation under project
 *   B's heading.
 * - 0e5a2deebd7a: a failed or refused catalog lookup for a new target left the
 *   previous target's grades standing.
 *
 * The components need a signed-in browser to render; the rendered flows are
 * covered by ask-this-case, assistant-label and the analyze specs. What these
 * pin is the rule each fix introduced.
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

test('9e437b2930c4 — the invitation preview is shown only to the account it was read for', () => {
  const src = read('app/(app)/invitation/[projectId]/[invitationId]/page.tsx');
  expect(src).toMatch(/const previewKey = user \? `\$\{user\.uid\}\|\$\{projectId\}\|\$\{invitationId\}` : null;/);
  expect(src).toMatch(/const shownPreview = preview && preview\.readFor === previewKey \? preview : null;/);
  expect(src, 'the page renders the unkeyed preview again').not.toMatch(/\{preview && \(/);
  expect(src).toMatch(/\{shownPreview && \(/);
});

test('76118078e97f — the assistant starts from the greeting when the project changes', () => {
  const src = read('components/GlossaryChatbot.tsx');
  expect(src).toMatch(/if \(messagesFor !== projectId\) \{\s*setMessagesFor\(projectId\);\s*setMessages\(\[greeting\(\)\]\);/);
});

test('0e5a2deebd7a — a new lookup target clears what the last lookup said', () => {
  const src = read('components/analyze/AbcdClassificationPanel.tsx');
  const reset = src.slice(src.indexOf('if (lookupFor !== lookupTarget) {'), src.indexOf('useEffect(() => {', src.indexOf('if (lookupFor !== lookupTarget) {')));
  for (const clear of ['setSapGrades({})', 'setLookupSnapshot(null)', 'setLookupCoverage(null)', 'setLookupRefusal(null)']) {
    expect(reset, `the reset no longer does ${clear}`).toContain(clear);
  }
  expect(src).toMatch(/const lookupTarget = `\$\{lookupKey\}#\$\{deployment \?\? ''\}#\$\{release \?\? ''\}`;/);
});
