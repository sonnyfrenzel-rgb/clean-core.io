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
  QuotaError,
} from '@/lib/firebase-admin';
import { byokRequiresEnrolment } from '@/lib/mfa-gate';
import { logger, providerErrorShape } from '@/lib/logger';
import { ByokKeyUnreadableError, OwnModelKeyMissingError } from '@/lib/byok-key';
import { assertByokRateLimit } from '@/lib/byok-rate-limit';
import { GoogleGenAI } from '@google/genai';
import { PRODUCT_GEMINI_MODEL } from '@/lib/constants';
import { isModelKeyProvider, offeredKeyProviders, ownKeyProviderOf, type ModelKeyProvider } from '@/lib/model-providers';
import { testAnthropicKey } from '@/lib/anthropic-messages';
import { markStoredKeyTested, readBeforeTest, type TestedRecordRef } from '@/lib/byok-tested';

/**
 * POST /api/secrets/gemini/test
 *
 * Tests an own model key — Gemini's or, since 3.0.15, Anthropic's.
 * If body contains { apiKey, provider? }, tests that specific key (provider absent: Gemini).
 * If body is empty, loads and decrypts the user's saved key, then tests it.
 * An Anthropic key is tested against the Models API, which spends no tokens.
 *
 * Roadmap 3.0.21: a passed test of the **saved** key is recorded on its record
 * (`testedAt`, `lib/byok-tested.ts`) — the "tested" half of the portfolio's
 * "own key stored and tested". An entered key that is not saved records
 * nothing.
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

    // The saved key's record, read before the key is loaded, so the mark below
    // speaks for exactly the key that was tested (`lib/byok-tested.ts`).
    let testedRecord: { ref: TestedRecordRef; before: Awaited<ReturnType<typeof readBeforeTest>> } | null = null;

    if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
      // No key entered: test the saved one, of whichever provider it is.
      const { db } = await getAdminDb();
      const profile = (await db.collection('users').doc(decodedToken.uid).get()).data() ?? null;
      const named = ownKeyProviderOf(profile);
      const recordRef: TestedRecordRef | null =
        named && named !== 'unknown'
          ? db.collection('user_secrets').doc(decodedToken.uid).collection('providers').doc(named)
          : null;
      const before = recordRef ? await readBeforeTest(recordRef) : null;
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
      if (recordRef && saved.provider === named) testedRecord = { ref: recordRef, before };
    }

    // Written only after the provider accepted the key; a failed write leaves
    // the key untested and is not the caller's failure.
    const recordTested = async (): Promise<boolean> => {
      if (!testedRecord) return false;
      const { FieldValue } = await getAdminDb();
      return markStoredKeyTested(testedRecord.ref, testedRecord.before, FieldValue.serverTimestamp());
    };

    if (provider === 'anthropic') {
      // Anthropic's Models API: the key is accepted or refused, and no token
      // is spent (`lib/anthropic-messages.ts`). Server-side only.
      await testAnthropicKey(apiKey.trim());
      return NextResponse.json({ ok: true, provider, recorded: await recordTested() });
    }

    // Call Gemini to verify key
    const ai = new GoogleGenAI({ apiKey: apiKey.trim() });
    const result = await ai.models.generateContent({
      model: PRODUCT_GEMINI_MODEL,
      contents: "Ping. Respond with exactly 'OK' to confirm connectivity.",
    });

    if (!result.text || !result.text.includes('OK')) {
      throw new Error('Invalid response from AI provider.');
    }

    return NextResponse.json({ ok: true, provider, recorded: await recordTested() });
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
