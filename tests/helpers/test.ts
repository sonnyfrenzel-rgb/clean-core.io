import { test as base } from '@playwright/test';

/**
 * The `test` every spec that opens a page imports instead of Playwright's own
 * (roadmap 3.0.18, the emulator's abandoned-channel hang).
 *
 * Playwright's built-in `context` fixture closes the browser context with its
 * pages still open. Closing a context tears the pages down without a
 * `pagehide`, so the handler in `lib/firebase.ts` that terminates Firestore on
 * the way out — and with it sends WebChannel's `TYPE=terminate` — never runs at
 * the end of a test. Every test that used `page` left its last page's Firestore
 * channel open in the emulator, with its listeners, for the rest of the run;
 * enough of them and the emulator stops answering.
 *
 * The fix sits in front of that teardown: this `context` wraps the built-in one
 * and, after the test and after the `page` fixture is done with it, closes every
 * page the context still has. `page.close()` does fire `pagehide`, so each page
 * says goodbye to the emulator before the context goes. It wraps `context`
 * rather than being an `auto` fixture so a spec that never opens a browser still
 * does not get one; a spec that uses `page` uses `context` through it.
 *
 * `runBeforeUnload: false` keeps a page with a "leave this page?" prompt from
 * holding the teardown. A page that is already closed, or crashed, must never
 * fail a test that passed, so every close is wrapped.
 *
 * tests/test-helper-guard.spec.ts keeps every spec that uses `page` or
 * `context` on this import, and proves that the close fires `pagehide`.
 */
export const test = base.extend({
  context: async ({ context }, use) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- Playwright's `use`, not React's
    await use(context);
    for (const page of context.pages()) {
      try {
        await page.close({ runBeforeUnload: false });
      } catch {
        // already closed or crashed — nothing left to say goodbye
      }
    }
  },
});

export * from '@playwright/test';
