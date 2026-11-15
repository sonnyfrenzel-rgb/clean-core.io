import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { markTyping, reloadOnceForStaleBuild } from '../lib/stale-build';
import { STORAGE_KEYS } from '../lib/storage-keys';

/**
 * Privacy policy section 7: visit a page without signing in and the browser is left as it was — no session storage.
 * The reload-loop guard after a failed chunk load (`lib/stale-build.ts`) used to write `cc_chunk_reload_at` to
 * sessionStorage on public pages too. Since 3.2.0 it writes it only when the signed-in hint is set; without sign-in
 * the browser's own Navigation Timing record is the guard: a document that came from a reload does not reload again.
 *
 * Server-free: `window`, both storages and `performance` are stand-ins that record every write.
 */

const ROOT = path.resolve(__dirname, '..');

type World = { signedIn: boolean; navigation: string | null; sessionWrites: string[]; localWrites: string[]; reloads: number };

/** Runs `body` with a stand-in browser and puts the real globals back afterwards. */
function inBrowser(opts: { signedIn: boolean; navigation: string | null }, body: (w: World) => void) {
  const g = globalThis as unknown as Record<string, unknown>;
  const had = { window: 'window' in g, sessionStorage: 'sessionStorage' in g };
  const prev = { window: g.window, sessionStorage: g.sessionStorage, performance: Object.getOwnPropertyDescriptor(globalThis, 'performance') };
  const realNow = performance.now.bind(performance);
  const w: World = { ...opts, sessionWrites: [], localWrites: [], reloads: 0 };
  const session = new Map<string, string>();
  g.window = {
    location: { reload: () => { w.reloads += 1; } },
    localStorage: {
      getItem: (k: string) => (k === 'cc.auth.signedIn' && opts.signedIn ? '1' : null),
      setItem: (k: string) => void w.localWrites.push(k),
      removeItem: (k: string) => void w.localWrites.push(k),
    },
  };
  g.sessionStorage = {
    getItem: (k: string) => session.get(k) ?? null,
    setItem: (k: string, v: string) => { w.sessionWrites.push(k); session.set(k, v); },
    removeItem: (k: string) => { w.sessionWrites.push(k); session.delete(k); },
  };
  Object.defineProperty(globalThis, 'performance', {
    configurable: true,
    writable: true,
    value: {
      // The test runner reads the clock through it; only the navigation record is a stand-in.
      now: () => realNow(),
      timeOrigin: performance.timeOrigin,
      getEntriesByType: (type: string) => (type === 'navigation' && opts.navigation ? [{ type: opts.navigation }] : []),
    },
  });
  try {
    markTyping(0);
    body(w);
  } finally {
    if (had.window) g.window = prev.window;
    else delete g.window;
    if (had.sessionStorage) g.sessionStorage = prev.sessionStorage;
    else delete g.sessionStorage;
    if (prev.performance) Object.defineProperty(globalThis, 'performance', prev.performance);
  }
}

test.describe('signed out: no browser storage is written, and the reload still cannot loop', () => {
  test('a page reached by a link reloads once and writes nothing', () => {
    inBrowser({ signedIn: false, navigation: 'navigate' }, (w) => {
      expect(reloadOnceForStaleBuild()).toBe(true);
      expect(w.reloads).toBe(1);
      expect(w.sessionWrites).toEqual([]);
      expect(w.localWrites).toEqual([]);
    });
  });

  test('the page that reload produced does not reload again, so a build that keeps failing stops', () => {
    inBrowser({ signedIn: false, navigation: 'reload' }, (w) => {
      expect(reloadOnceForStaleBuild(), 'a second reload would loop').toBe(false);
      expect(w.reloads).toBe(0);
      expect(w.sessionWrites).toEqual([]);
      expect(w.localWrites).toEqual([]);
    });
  });

  test('without a navigation record there is no guard, so no automatic reload — the card offers it', () => {
    inBrowser({ signedIn: false, navigation: null }, (w) => {
      expect(reloadOnceForStaleBuild()).toBe(false);
      expect(w.reloads).toBe(0);
      expect(w.sessionWrites).toEqual([]);
    });
  });

  test('back and forward count like a link: one reload, nothing written', () => {
    inBrowser({ signedIn: false, navigation: 'back_forward' }, (w) => {
      expect(reloadOnceForStaleBuild()).toBe(true);
      expect(w.sessionWrites).toEqual([]);
    });
  });
});

test.describe('signed in: the guard is the time in session storage, as section 7 says', () => {
  test('one reload per ten seconds, recorded under cc_chunk_reload_at', () => {
    inBrowser({ signedIn: true, navigation: 'reload' }, (w) => {
      expect(reloadOnceForStaleBuild()).toBe(true);
      expect(reloadOnceForStaleBuild(), 'a second reload inside ten seconds would loop').toBe(false);
      expect(w.reloads).toBe(1);
      expect(w.sessionWrites).toEqual(['cc_chunk_reload_at']);
      expect(w.localWrites).toEqual([]);
    });
  });
});

test('the register says the key is written for a signed-in reader only', () => {
  const entry = STORAGE_KEYS.find((e) => e.key === 'cc_chunk_reload_at');
  expect(entry?.writtenFor).toBe('signed-in');
  expect(entry?.area).toBe('session');
  // And the code agrees: the write sits behind the signed-in hint.
  const src = fs.readFileSync(path.join(ROOT, 'lib/stale-build.ts'), 'utf8').replace(/\r\n/g, '\n');
  const fn = src.slice(src.indexOf('export function reloadOnceForStaleBuild'));
  const guard = fn.indexOf('if (!hasSignedInHint()) {');
  const write = fn.indexOf('sessionStorage.setItem(KEY');
  expect(guard).toBeGreaterThan(-1);
  expect(write).toBeGreaterThan(guard);
  expect(fn.slice(guard, fn.indexOf('\n  }\n', guard))).not.toMatch(/Storage/);
});
