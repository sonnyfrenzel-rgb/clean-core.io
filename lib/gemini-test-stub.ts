/**
 * A fixed answer in place of the Gemini provider — for the test suite only.
 *
 * QA review of 75b573cd22f0 (080cd5fce607): that `/api/gemini` signs the
 * stage it was called under into the model receipt was only checked in the
 * source. Proving it at the route needs a call that goes through every gate of
 * the route — authentication, rate limit, second factor, account state, the
 * per-stage switch, the model register, the prompt limit — and still returns a
 * receipt, without a provider key in CI and without spending on one.
 *
 * So one thing is replaced and nothing else: the provider call. The three gates
 * are the ones `app/api/test/seed/route.ts` already uses (F-15), all of which
 * must hold, and the first of which alone keeps it out of every deployment:
 *
 *   1. `K_SERVICE` is unset — Cloud Run sets it on every real service;
 *   2. `NEXT_PUBLIC_USE_FIREBASE_EMULATOR` is exactly `'true'` — only the
 *      emulator build sets it;
 *   3. the request carries `x-test-gemini-stub` equal to a non-empty
 *      `PILOT_APPROVAL_SECRET` — per request, so no other test's call changes
 *      and a missing key still answers `model-key-missing` everywhere else.
 *
 * `tests/gemini-test-stub-guard.spec.ts` holds all three, and holds where the
 * route asks: after every gate, in place of the provider call only.
 *
 * Pure: no imports, reads only what it is handed.
 */

/** The header a test sends. */
export const GEMINI_TEST_STUB_HEADER = 'x-test-gemini-stub';

/** What the stub answers. Valid JSON, and obviously not a model's words. */
export const GEMINI_TEST_STUB_TEXT = '{"statements":[],"stub":"gemini-test-stub"}';

export function geminiTestStubActive(
  env: Readonly<Record<string, string | undefined>>,
  headerValue: string | null | undefined,
): boolean {
  if (env.K_SERVICE) return false;
  if (env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR !== 'true') return false;
  const secret = env.PILOT_APPROVAL_SECRET;
  if (!secret || !headerValue) return false;
  return headerValue === secret;
}
