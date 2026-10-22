import { NextRequest, NextResponse } from 'next/server';
import {
  verifyRequestAuth,
  loadOwnModelKey,
  type OwnModelKey,
  assertMfaSatisfied,
  assertAccountActive,
  assertByokAllowed,
  getAdminDb,
  logAuditEvent,
  recordOwnKeyTest,
  QuotaError,
} from '@/lib/firebase-admin';
import { byokRequiresEnrolment } from '@/lib/mfa-gate';
import { logger, providerErrorShape } from '@/lib/logger';
import { ByokKeyUnreadableError, OwnModelKeyMissingError } from '@/lib/byok-key';
import { assertByokRateLimit } from '@/lib/byok-rate-limit';
import {
  MODEL_PROVIDERS_SUSPENDED_ENV,
  PROVIDER_SUSPENDED_CODE,
  isModelKeyProvider,
  offeredKeyProviders,
  providerSuspendedMessage,
  suspendedProvidersOf,
  type ModelKeyProvider,
} from '@/lib/model-providers';
import { testOwnModelKey } from '@/lib/own-key-test';
import { GEMINI_TEST_REAL_MODEL_HEADER, GEMINI_TEST_STUB_HEADER, geminiTestStubActive } from '@/lib/gemini-test-stub';

/**
 * POST /api/secrets/gemini/test
 *
 * Tests an own model key — Gemini's or, since 3.0.15, Anthropic's.
 * If body contains { apiKey, provider? }, tests that specific key (provider absent: Gemini).
 * If body is empty, loads and decrypts the user's saved key, then tests it.
 * An Anthropic key is tested against the Models API, which spends no tokens.
 */
export async function POST(req: NextRequest) {
  const decodedToken = await verifyRequestAuth(req);
  if (!decodedToken) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  try {
    // 1. MFA Step-up Gate
    await assertMfaSatisfied(req, decodedToken, { requireEnrolment: byokRequiresEnrolment });

    // 2. Rate Limiting Gate (5 tests per 15 minutes), per account.
    //
    // It was keyed on the account *and* the client address (3.0.13 d). This
    // route tests any key it is handed, so its limit is what bounds using the
    // server as a key oracle — and a ceiling per address gave the same account
    // a fresh allowance from every address it could reach us through. The
    // account is established by the verified token; it is the thing limited,
    // exactly as in `/api/gemini`.
    // The key and the numbers live in `lib/byok-rate-limit.ts`, with save and
    // delete, so the three cannot drift apart.
    await assertByokRateLimit('test', decodedToken.uid);

    // 3. Account-state gate — hard suspension only, as on the save path. It was
    // absent here, so a suspended account could still have the server load and
    // decrypt its stored key and spend it against the provider.
    // Not `requireApproved` or `requireCurrentTerms`: testing your
    // own key is part of managing it, and the DELETE in
    // `app/api/secrets/gemini/route.ts` is deliberately open for the same
    // reason.
    await assertAccountActive(decodedToken.uid);

    // 3.0.13 (c): the tier rule, as on the save path. A key this account may
    // not store is not one the server should send to the provider either.
    await assertByokAllowed(decodedToken.uid, decodedToken.admin === true);

    const body = await req.json().catch(() => ({}));
    let { apiKey } = (body ?? {}) as { apiKey?: string };
    // 3.0.15: the provider of an entered key; absent means Gemini, as before.
    const requested = (body as { provider?: unknown } | null)?.provider;
    let provider: ModelKeyProvider = 'gemini';
    if (requested !== undefined) {
      if (!isModelKeyProvider(requested) || !offeredKeyProviders().includes(requested)) {
        return NextResponse.json({ error: 'Unknown or unavailable key provider.', code: 'byok-provider-unknown' }, { status: 400 });
      }
      provider = requested;
    }

    const testingSaved = !apiKey || typeof apiKey !== 'string' || !apiKey.trim();
    if (testingSaved) {
      // No key entered: test the saved one, of whichever provider it is.
      let saved: OwnModelKey | null;
      try {
        saved = await loadOwnModelKey(decodedToken.uid);
      } catch (keyErr: unknown) {
        // 3.0.13 (g): stored, but not readable here — say so rather than
        // report the key itself as failing authentication.
        if (keyErr instanceof ByokKeyUnreadableError || keyErr instanceof OwnModelKeyMissingError) {
          return NextResponse.json({ error: keyErr.message, code: keyErr.code }, { status: 503 });
        }
        throw keyErr;
      }
      if (!saved) {
        return NextResponse.json({ error: 'No custom API key has been saved yet.' }, { status: 400 });
      }
      apiKey = saved.apiKey;
      provider = saved.provider;
    }

    // 3.0.21 (T01): a provider the operator has switched off is not asked.
    if (suspendedProvidersOf(process.env[MODEL_PROVIDERS_SUSPENDED_ENV]).includes(provider)) {
      return NextResponse.json({ error: providerSuspendedMessage(provider), code: PROVIDER_SUSPENDED_CODE }, { status: 409 });
    }

    // The one key test (`lib/own-key-test.ts`): it reads the model the key will
    // be used with — no code, no tokens. Anthropic: the Models API
    // (`testAnthropicKey`); Gemini: `models.get`. Server-side only.
    const stubbed = geminiTestStubActive(process.env, req.headers.get(GEMINI_TEST_STUB_HEADER), req.headers.get(GEMINI_TEST_REAL_MODEL_HEADER));
    try {
      await testOwnModelKey(provider, apiKey!, { stubbed });
    } catch (testErr) {
      // The stored key failed: it stops counting as configured until a test
      // passes again (3.0.21). An entered key that fails changes nothing.
      if (testingSaved) await recordOwnKeyTest(decodedToken.uid, provider, false);
      throw testErr;
    }
    if (testingSaved) await recordOwnKeyTest(decodedToken.uid, provider, true);

    return NextResponse.json({ ok: true, provider });
  } catch (err: any) {
    if (err instanceof QuotaError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err?.message?.includes('MFA verification required')) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    // A code, never the error (3.0.13 e). What the provider answers to a wrong
    // key can quote the key back, and the SDK error carries that answer's body.
    logger.error('byok key test failed', { route: 'api/secrets/gemini/test', error: providerErrorShape(err) });

    // Log security failure
    try {
      const { db } = await getAdminDb();
      await logAuditEvent(db, decodedToken.uid, 'BYOK_TEST_FAIL', decodedToken.uid);
    } catch {}

    // Return a sanitized neutral error message to the client
    return NextResponse.json(
      { error: 'The API key did not pass authentication or a network error occurred.' },
      { status: 400 },
    );
  }
}
