import { test, expect } from './helpers/test';
import fs from 'fs';
import path from 'path';

// Fassung 1.1 of the privacy policy and terms says an Anthropic call is asked again at most
// twice; the code said three times (owner decision 22.10.2026: the code follows the text).
test('an own Claude key is asked again at most twice, Gemini keeps its three', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'api', 'gemini', 'route.ts'), 'utf8');
  expect(src).toMatch(/const ANTHROPIC_MAX_RETRIES = 2;/);
  expect(src).toMatch(/const MAX_RETRIES = 3;/);
  const anthropicCall = src.slice(src.indexOf("provider === 'anthropic'"), src.indexOf(': await callWithRetry(async () => {', src.indexOf("provider === 'anthropic'")));
  expect(anthropicCall).toContain('}, ANTHROPIC_MAX_RETRIES, undefined, callSignal)');
});
