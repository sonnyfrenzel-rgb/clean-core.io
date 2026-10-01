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

test('2b1101d8e13e — a new place clears the draft and the busy state, and drops a late answer', () => {
  const src = read('components/GlossaryChatbot.tsx');
  const reset = src.slice(src.indexOf('if (messagesFor !== projectId) {'), src.indexOf('}', src.indexOf('if (messagesFor !== projectId) {')));
  for (const clear of ["setInputValue('')", 'setLoading(false)', 'setConversation((n) => n + 1)']) {
    expect(reset, `the project reset no longer does ${clear}`).toContain(clear);
  }

  // Every write a request makes after it has awaited something is gated on the
  // conversation it was asked in — the answer, the failure and the end of the
  // busy state alike.
  const send = src.slice(src.indexOf('const handleSend = async'), src.indexOf('const floatingOffOnDesktop'));
  expect(send).toContain('const asked = conversationRef.current;');
  expect(send).toContain('await answerInProject(projectId, text, asked);');
  expect(send.match(/if \(!superseded\(\)\) setLoading\(false\);/g), 'a finally clears the next question\'s busy state').toHaveLength(2);
  expect(send, 'an unconditional setLoading(false) is back').not.toMatch(/^\s*setLoading\(false\);/m);
  expect(send.match(/if \(currentProjectRef\.current !== null \|\| superseded\(\)\) return;/g), 'a late product answer or failure lands in a new conversation').toHaveLength(2);
  expect(send).toContain('if (currentProjectRef.current !== projectId || superseded()) return;');

  const inProject = src.slice(src.indexOf('const answerInProject = async'), src.indexOf('const handleSend = async'));
  expect(inProject).toContain('const moved = () => currentProjectRef.current !== id || conversationRef.current !== asked;');
  expect(inProject.match(/if \(moved\(\)\) return;/g), 'an await in the case answer is not followed by the check').toHaveLength(2);
  expect(inProject.match(/\bawait\b/g)).toHaveLength(2);
});
