import { test, expect } from '@playwright/test';
import type { Request } from '@playwright/test';
import { isAutomaticWordingCall } from './helpers/automatic-model-calls';
import { PLAIN_WORDING_SHAPE, PLAIN_WORDING_STAGE } from '../lib/plain-wording';
import { NAMING_STAGE } from '../lib/process-naming';

/**
 * `tests/helpers/automatic-model-calls.ts` lets the two model calls a page
 * makes by itself pass the "no model call" guards uncounted. It names them by
 * stage and response shape; these pins fail the day either constant moves, so
 * the helper can never let through more — or less — than those two calls.
 */
const requestWith = (body: unknown): Request => ({ postData: () => JSON.stringify(body) }) as unknown as Request;

test('the helper names exactly the plain wording and the naming call', () => {
  expect(PLAIN_WORDING_STAGE).toBe('statements');
  expect(PLAIN_WORDING_SHAPE).toBe('plain-wording');
  expect(NAMING_STAGE).toBe('naming');
  expect(isAutomaticWordingCall(requestWith({ stage: PLAIN_WORDING_STAGE, responseShape: PLAIN_WORDING_SHAPE }))).toBe(true);
  expect(isAutomaticWordingCall(requestWith({ stage: NAMING_STAGE }))).toBe(true);
});

test('every other model call is still counted', () => {
  // A statement proposal shares the stage, not the shape.
  expect(isAutomaticWordingCall(requestWith({ stage: 'statements' }))).toBe(false);
  expect(isAutomaticWordingCall(requestWith({ stage: 'analysis' }))).toBe(false);
  expect(isAutomaticWordingCall(requestWith({ prompt: 'x' }))).toBe(false);
  expect(isAutomaticWordingCall({ postData: () => 'not json' } as unknown as Request)).toBe(false);
  expect(isAutomaticWordingCall({ postData: () => null } as unknown as Request)).toBe(false);
});
