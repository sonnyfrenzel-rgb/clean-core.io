import { test, expect } from '@playwright/test';
import { subscribeToAuth, type AuthSdk } from '../lib/auth-subscribe';

/**
 * lib/auth-subscribe.ts loads the Auth SDK after hydration (docs/perf/REPORT.md). A chunk that does not load
 * must not leave the header button in its placeholder for good, nor surface as an unhandled rejection
 * (QA review of 1503ad188710, finding afd6e6a0f91f). Run through the loader seam, so it is the behaviour that
 * is tested and not the source text (QA review of d439782cbe25, finding ac79a839d0aa).
 */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const failing = () => Promise.reject(new Error('ChunkLoadError: Loading chunk 123 failed.'));

test('a failed SDK load reports signed out once', async () => {
  const seen: unknown[] = [];
  subscribeToAuth((user) => seen.push(user), failing);
  await settle();
  expect(seen).toEqual([null]);
});

test('a subscriber that already left hears nothing, from a failed or a successful load', async () => {
  const seen: unknown[] = [];
  subscribeToAuth((user) => seen.push(user), failing)();
  let subscribed = false;
  const sdk: AuthSdk = { getAuth: () => ({}) as never, onAuthStateChanged: () => ((subscribed = true), () => {}) };
  subscribeToAuth((user) => seen.push(user), async () => sdk)();
  await settle();
  expect(seen).toEqual([]);
  expect(subscribed).toBe(false);
});

test('a successful load subscribes, and leaving unsubscribes', async () => {
  const seen: unknown[] = [];
  let unsubscribed = false;
  const user = { uid: 'u1' } as never;
  const sdk: AuthSdk = {
    getAuth: () => ({}) as never,
    onAuthStateChanged: (_auth, next) => {
      next(user);
      return () => {
        unsubscribed = true;
      };
    },
  };
  const leave = subscribeToAuth((u) => seen.push(u), async () => sdk);
  await settle();
  expect(seen).toEqual([user]);
  leave();
  expect(unsubscribed).toBe(true);
});
