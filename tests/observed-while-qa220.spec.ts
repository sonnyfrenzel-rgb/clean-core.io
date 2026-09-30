import { test, expect } from '@playwright/test';
import { observedWhile } from './helpers/observed-while';

/**
 * `observedWhile` answers "was it seen while the work ran?". A state that only
 * appears once the work has settled is not an answer to that, and the helper
 * used to take one extra look after the loop and return it (QA full review of
 * fc787674705f, 683a1f9c810b).
 */
test('a state that appears only after the work settled was not seen while it ran', async () => {
  let settled = false;
  const work = new Promise<void>((resolve) => setTimeout(resolve, 20)).then(() => {
    settled = true;
  });
  // The state is read when the look starts, as a Firestore read is: what it
  // returns is what was there when it was asked.
  const seen = await observedWhile(work, async () => {
    const now = settled;
    await new Promise((resolve) => setTimeout(resolve, 1));
    return now;
  });
  expect(seen).toBe(false);
});

test('a state that is there while the work runs is seen', async () => {
  let inFlight = false;
  const work = (async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    inFlight = true;
    await new Promise((resolve) => setTimeout(resolve, 30));
    inFlight = false;
  })();
  const seen = await observedWhile(work, async () => {
    const now = inFlight;
    await new Promise((resolve) => setTimeout(resolve, 1));
    return now;
  });
  expect(seen).toBe(true);
});
