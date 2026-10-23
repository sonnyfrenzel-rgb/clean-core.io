import { test, expect } from '@playwright/test';
import { subscribeToAuth, type AuthSdk } from '../lib/auth-subscribe';
import {
  SIGNED_IN_HINT_EVENT,
  SIGNED_IN_HINT_KEY,
  clearRedirectPending,
  hasSignedInHint,
  isRedirectPending,
  markRedirectPending,
  setSignedInHint,
} from '../lib/auth-hint';

/**
 * lib/auth-subscribe.ts loads the Auth SDK after hydration (docs/perf/REPORT.md). A chunk that does not load
 * must not leave the header button in its placeholder for good, nor surface as an unhandled rejection
 * (QA review of 1503ad188710, finding afd6e6a0f91f). Run through the loader seam, so it is the behaviour that
 * is tested and not the source text (QA review of d439782cbe25, finding ac79a839d0aa).
 */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const failing = () => Promise.reject(new Error('ChunkLoadError: Loading chunk 123 failed.'));
/** The three tests below are about a browser that holds the signed-in hint (lib/auth-hint.ts): only then is the SDK loaded. */
const signedIn = () => true;

test('a failed SDK load reports signed out once', async () => {
  const seen: unknown[] = [];
  subscribeToAuth((user) => seen.push(user), failing, signedIn);
  await settle();
  expect(seen).toEqual([null]);
});

test('a subscriber that already left hears nothing, from a failed or a successful load', async () => {
  const seen: unknown[] = [];
  subscribeToAuth((user) => seen.push(user), failing, signedIn)();
  let subscribed = false;
  const sdk: AuthSdk = { getAuth: () => ({}) as never, onAuthStateChanged: () => ((subscribed = true), () => {}) };
  subscribeToAuth((user) => seen.push(user), async () => sdk, signedIn)();
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
  const leave = subscribeToAuth((u) => seen.push(u), async () => sdk, signedIn);
  await settle();
  expect(seen).toEqual([user]);
  leave();
  expect(unsubscribed).toBe(true);
});

/**
 * Roadmap 3.0.21, privacy policy section 7: without the first-party signed-in hint a public header does not load
 * the Auth SDK at all, because initialising Auth contacts Google on mobile browsers and Safari even for a visitor
 * nobody ever signed in. These run against a stand-in `window` with in-memory storage.
 */
class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string) {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, String(value));
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
}

function withWindow(run: (win: EventTarget & { localStorage: MemoryStorage; sessionStorage: MemoryStorage }) => Promise<void> | void) {
  return async () => {
    const win = Object.assign(new EventTarget(), { localStorage: new MemoryStorage(), sessionStorage: new MemoryStorage() });
    const g = globalThis as { window?: unknown };
    const before = g.window;
    g.window = win;
    try {
      await run(win);
    } finally {
      g.window = before;
    }
  };
}

test.describe('signed out, the SDK stays unloaded', () => {
  test(
    'without the hint the subscriber hears null at once and nothing is loaded',
    withWindow(async () => {
      const seen: unknown[] = [];
      let loads = 0;
      const leave = subscribeToAuth((u) => seen.push(u), async () => ((loads += 1), sdkFor(null)));
      await settle();
      expect(seen).toEqual([null]);
      expect(loads).toBe(0);
      leave();
    }),
  );

  test(
    'a sign-in on the same page sets the hint, and only then the SDK is loaded and asked',
    withWindow(async () => {
      const seen: unknown[] = [];
      let loads = 0;
      const user = { uid: 'u1' } as never;
      const leave = subscribeToAuth((u) => seen.push(u), async () => ((loads += 1), sdkFor(user)));
      await settle();
      expect(loads).toBe(0);
      setSignedInHint(true); // what lib/firebase-app.ts does when Firebase reports the account
      await settle();
      expect(loads).toBe(1);
      expect(seen).toEqual([null, user]);
      // A second event does not load it twice.
      setSignedInHint(true);
      window.dispatchEvent(new Event(SIGNED_IN_HINT_EVENT));
      await settle();
      expect(loads).toBe(1);
      leave();
    }),
  );

  test(
    'with the hint the SDK is loaded straight away, as before',
    withWindow(async (win) => {
      win.localStorage.setItem(SIGNED_IN_HINT_KEY, '1');
      let loads = 0;
      const leave = subscribeToAuth(() => {}, async () => ((loads += 1), sdkFor(null)));
      await settle();
      expect(loads).toBe(1);
      leave();
    }),
  );

  test(
    'a subscriber that left before the hint arrived loads nothing',
    withWindow(async () => {
      let loads = 0;
      subscribeToAuth(() => {}, async () => ((loads += 1), sdkFor(null)))();
      setSignedInHint(true);
      await settle();
      expect(loads).toBe(0);
    }),
  );
});

test.describe('the first-party marks', () => {
  test(
    'the signed-in hint follows Firebase and announces only a new sign-in',
    withWindow((win) => {
      let events = 0;
      win.addEventListener(SIGNED_IN_HINT_EVENT, () => (events += 1));
      expect(hasSignedInHint()).toBe(false);
      setSignedInHint(true);
      setSignedInHint(true);
      expect(hasSignedInHint()).toBe(true);
      expect(win.localStorage.getItem(SIGNED_IN_HINT_KEY)).toBe('1');
      expect(events).toBe(1);
      setSignedInHint(false);
      expect(hasSignedInHint()).toBe(false);
      expect(win.localStorage.getItem(SIGNED_IN_HINT_KEY)).toBeNull();
    }),
  );

  test(
    'the redirect mark is set, read and cleared in this tab only',
    withWindow((win) => {
      expect(isRedirectPending()).toBe(false);
      markRedirectPending();
      expect(isRedirectPending()).toBe(true);
      expect(win.localStorage.getItem('cc.auth.redirectPending')).toBeNull();
      clearRedirectPending();
      expect(isRedirectPending()).toBe(false);
    }),
  );

  test('blocked storage and the server read as signed out and throw nothing', async () => {
    expect(hasSignedInHint()).toBe(false); // no window at all
    expect(isRedirectPending()).toBe(false);
    const g = globalThis as { window?: unknown };
    const before = g.window;
    g.window = Object.defineProperties(new EventTarget(), {
      localStorage: { get: () => { throw new Error('SecurityError'); } },
      sessionStorage: { get: () => { throw new Error('SecurityError'); } },
    });
    try {
      expect(hasSignedInHint()).toBe(false);
      expect(() => setSignedInHint(true)).not.toThrow();
      expect(() => markRedirectPending()).not.toThrow();
      expect(isRedirectPending()).toBe(false);
      expect(() => clearRedirectPending()).not.toThrow();
    } finally {
      g.window = before;
    }
  });
});

function sdkFor(user: unknown): AuthSdk {
  return {
    getAuth: () => ({}) as never,
    onAuthStateChanged: (_auth, next) => {
      next(user as never);
      return () => {};
    },
  };
}
