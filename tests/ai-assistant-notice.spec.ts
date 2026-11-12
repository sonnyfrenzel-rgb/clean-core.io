import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { aiAssistantNotice } from '../lib/ai-assistant-notice';

/**
 * Art. 50(1) AI Act, in force since 02.08.2026 without a transition period: a
 * person talking to an AI system is told so, at the latest at the first
 * interaction. The legal review (B8/L3) found the notice missing from the
 * released assistant; it went to main as a hotfix on 05.11.2026.
 */

test.describe('the assistant says it is an AI system', () => {
  test('the notice names the system, the provider and the model', () => {
    expect(aiAssistantNotice('Google Gemini', 'gemini-3.8-flash')).toBe(
      'You are chatting with an AI system. Answers are produced by a generative model (Google Gemini, gemini-3.8-flash); they are drafts, not professionally reviewed advice.',
    );
  });

  test('the panel renders it at the input, outside the demo only', () => {
    const src = readFileSync(join(process.cwd(), 'components', 'GlossaryChatbot.tsx'), 'utf8');
    expect(src).toContain("from '@/lib/ai-assistant-notice'");
    const notice = src.indexOf('data-chatbot-ai-notice');
    expect(notice, 'the notice element exists').toBeGreaterThan(-1);
    expect(src.slice(Math.max(0, notice - 200), notice)).toContain('!inDemo');
    expect(src.indexOf('{assistantNotice}', notice), 'the notice text is rendered').toBeGreaterThan(notice);
    expect(src.indexOf('<form', notice), 'it stands right above the input').toBeGreaterThan(notice);
  });
});
