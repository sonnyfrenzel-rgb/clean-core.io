import type { Page } from '@playwright/test';

/**
 * Sign-in through the real landing-page form — the one sequence that used to be
 * copied into every browser spec (test audit, stage 1, 30.09.2026).
 *
 * This is a pure restructuring: the helper does exactly what the copies did,
 * step for step, including the fixed pause after the submit. The pause is not a
 * wait for anything; it gives the client time to persist the session before the
 * spec navigates on. Replacing it with a wait for a real signal is stage 2 of
 * the audit, and it happens here, once, instead of in fifty files.
 *
 * The copies were not all identical. Where they differed the difference is kept
 * as an option rather than smoothed over, so every spec still runs the sequence
 * it ran before:
 *
 *   - `pauseMs`: 4000 in most copies, 3500 in five, 3000 in the four that also
 *     accept the German button label;
 *   - `alsoGermanLabel`: those four click `Sign In` *or* `Anmelden`;
 *   - `gotoTimeout`: one spec loads the landing page with a raised timeout.
 *
 * What some copies do *after* the pause (`window.stop()`, a viewport change
 * before it, the first navigation into a project) stays in the spec: it is the
 * spec's business, not the sign-in's.
 */
export interface LandingSignInOptions {
  /** The fixed pause after the submit, in milliseconds. Default 4000. */
  pauseMs?: number;
  /** Also accept the German submit label ("Anmelden"). Default false. */
  alsoGermanLabel?: boolean;
  /** A timeout for loading `/`; omitted, `page.goto` uses its default. */
  gotoTimeout?: number;
}

/** The pause every copy without a stated reason used. */
export const SIGN_IN_PAUSE_MS = 4000;

const SUBMIT = 'button[type="submit"]:has-text("Sign In")';
const SUBMIT_OR_GERMAN = 'button[type="submit"]:has-text("Sign In"), button[type="submit"]:has-text("Anmelden")';

export async function signInViaLanding(
  page: Page,
  email: string,
  password: string,
  options: LandingSignInOptions = {},
): Promise<void> {
  const { pauseMs = SIGN_IN_PAUSE_MS, alsoGermanLabel = false, gotoTimeout } = options;
  if (gotoTimeout === undefined) await page.goto('/');
  else await page.goto('/', { timeout: gotoTimeout });
  await page.click('a:has-text("Get Free Access"), button:has-text("Get Free Access")');
  await page.waitForSelector('input[type="email"]');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click(alsoGermanLabel ? SUBMIT_OR_GERMAN : SUBMIT);
  await page.waitForTimeout(pauseMs);
}
