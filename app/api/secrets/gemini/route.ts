import { providerSuspendedNotice, suspensionDetailsOf } from '@/lib/provider-suspension';
import { NextRequest, NextResponse } from 'next/server';
import {
  verifyRequestAuth,
  saveOwnModelKey,
  deleteOwnModelKey,
  assertMfaSatisfied,
  assertAccountActive,
  assertByokAllowed,
  getAdminDb,
  logAuditEvent,
  QuotaError,
} from '@/lib/firebase-admin';
import { byokRequiresEnrolment } from '@/lib/mfa-gate';
import { logger, providerErrorShape } from '@/lib/logger';
import { ByokKeyUnavailableError } from '@/lib/byok-key';
import { assertByokRateLimit } from '@/lib/byok-rate-limit';
import {
  MODEL_PROVIDERS_SUSPENDED_ENV,
  PROVIDER_SUSPENDED_CODE,
  isModelKeyProvider,
  offeredKeyProviders,
  suspendedProvidersOf,
} from '@/lib/model-providers';
import {
  ADDENDUM_REQUIRED_CODE,
  ADDENDUM_TERMS_REQUIRED_CODE,
  BYOK_ADDENDUM_VERSION,
  BYOK_MIN_TERMS_LABEL,
  addendumAcceptanceOf,
  addendumRequired,
  termsAllowAddendum,
} from '@/lib/byok-addendum';
import { sendAgreementAcceptedMail, sendAgreementEndedMail } from '@/lib/byok-agreement-mail';
import { OWN_KEY_TEST_FAILED_CODE, OWN_KEY_TEST_FAILED_MESSAGE, testOwnModelKey } from '@/lib/own-key-test';
import { GEMINI_TEST_REAL_MODEL_HEADER, GEMINI_TEST_STUB_HEADER, geminiTestStubActive } from '@/lib/gemini-test-stub';

/**
 * POST /api/secrets/gemini
 *
 * Saves the account's own model key securely. The path keeps its name from
 * when Gemini was the only provider; since 3.0.15 it stores a Gemini or an
 * Anthropic key, one per account (`lib/model-providers.ts`).
 * Body: { apiKey: string, provider?: 'gemini' | 'anthropic' } — absent means Gemini.
 */
export async function POST(req: NextRequest) {
  const decodedToken = await verifyRequestAuth(req);
  if (!decodedToken) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  try {
    // 1. MFA Step-up Gate
    await assertMfaSatisfied(req, decodedToken, { requireEnrolment: byokRequiresEnrolment });

    // F-02: block suspended/stale-Terms accounts from managing a BYOK key. Approval is
    // NOT required to *store* a key — the bypass the finding is about is *using* it, which
    // is gated at /api/gemini (requireApproved). QuotaError is handled by the catch below.
    await assertAccountActive(decodedToken.uid, { requireCurrentTerms: true, isAdminClaim: decodedToken.admin === true });

    // 3.0.13 (c): the tier rule the settings card applies, held here as well —
    // the same function, so the page and the route cannot disagree.
    await assertByokAllowed(decodedToken.uid, decodedToken.admin === true);

    // 2. Rate Limiting Gate (10 saves per hour), per account — not per account
    // and address, which handed the same account a fresh allowance from every
    // address it could reach us through (3.0.13, owner decision 30.09.2026).
    await assertByokRateLimit('save', decodedToken.uid);

    const body = await req.json().catch(() => ({}));
    const { apiKey, provider: requestedProvider } = (body ?? {}) as { apiKey?: string; provider?: unknown };

    if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
      return NextResponse.json({ error: 'Missing required field: apiKey.' }, { status: 400 });
    }
    // 3.0.15: the provider the key belongs to. Absent means Gemini — the only
    // provider a key could belong to before, and what every older client sends.
    const provider = requestedProvider === undefined ? 'gemini' : requestedProvider;
    if (!isModelKeyProvider(provider) || !offeredKeyProviders().includes(provider)) {
      return NextResponse.json({ error: 'Unknown or unavailable key provider.', code: 'byok-provider-unknown' }, { status: 400 });
    }
    // 3.0.21 (T01): a provider the operator has switched off takes no new key.
    if (suspendedProvidersOf(process.env[MODEL_PROVIDERS_SUSPENDED_ENV]).includes(provider)) {
      return NextResponse.json({ error: providerSuspendedNotice(provider, suspensionDetailsOf(process.env)), code: PROVIDER_SUSPENDED_CODE }, { status: 409 });
    }
    // 3.0.21: an Anthropic key is stored only with the Additional Agreement on
    // Own Model Keys accepted — the version in force, in a published language
    // version (`lib/byok-addendum.ts`). Each save accepts anew (T03).
    const addendum = addendumAcceptanceOf(body);
    if (addendumRequired(provider) && !addendum) {
      return NextResponse.json(
        {
          error: `An Anthropic key is stored only once you accept the Additional Agreement on Own Model Keys (${BYOK_ADDENDUM_VERSION}).`,
          code: ADDENDUM_REQUIRED_CODE,
        },
        { status: 400 },
      );
    }
    // T03 (Additional Agreement clause 1, Terms 5.2): the agreement is offered
    // only to accounts that accepted Terms v2.3.0 or later. An account still
    // on v2.2.0 may carry on under it (Terms 10.3) — just not store an
    // Anthropic key until it accepts the current Terms.
    if (addendumRequired(provider)) {
      const profile = (await (await getAdminDb()).db.collection('users').doc(decodedToken.uid).get()).data() || {};
      if (!termsAllowAddendum(profile.termsVersionAccepted)) {
        return NextResponse.json(
          {
            error: `An Anthropic key can be stored only once your account has accepted the Terms of Service ${BYOK_MIN_TERMS_LABEL} or later. Accept the current Terms first.`,
            code: ADDENDUM_TERMS_REQUIRED_CODE,
          },
          { status: 409 },
        );
      }
    }

    // 3.0.21: an own key counts as configured only after a successful test, so
    // the key is tested with the provider before anything is stored — reading
    // the model it will be used with, no code, no tokens (`lib/own-key-test.ts`).
    // A key that does not pass is not stored: no quota lift, nothing changed.
    try {
      await testOwnModelKey(provider, apiKey, {
        stubbed: geminiTestStubActive(process.env, req.headers.get(GEMINI_TEST_STUB_HEADER), req.headers.get(GEMINI_TEST_REAL_MODEL_HEADER)),
      });
    } catch {
      await logAuditEvent((await getAdminDb()).db, decodedToken.uid, 'BYOK_SAVE_TEST_FAIL', decodedToken.uid).catch(() => undefined);
      return NextResponse.json({ error: OWN_KEY_TEST_FAILED_MESSAGE, code: OWN_KEY_TEST_FAILED_CODE }, { status: 400 });
    }

    let metadata: Awaited<ReturnType<typeof saveOwnModelKey>>;
    try {
      metadata = await saveOwnModelKey(decodedToken.uid, apiKey.trim(), provider, {
        addendum: addendumRequired(provider) ? addendum : null,
        tested: true,
      });
    } catch (sealErr: unknown) {
      // 3.0.13 (g): no usable BYOK_ENCRYPTION_KEY on this deployment. Refused
      // with a reason, and nothing written — never sealed with the S/4 key
      // instead. `/api/health` reports the same condition as degraded.
      if (sealErr instanceof ByokKeyUnavailableError) {
        logger.critical('byok key save refused: BYOK_ENCRYPTION_KEY is not set or not 32 bytes', {
          route: 'api/secrets/gemini',
          code: sealErr.code,
        });
        return NextResponse.json({ error: sealErr.message, code: sealErr.code }, { status: 503 });
      }
      throw sealErr;
    }

    // 3. Security Audit Logging
    const { db } = await getAdminDb();
    await logAuditEvent(db, decodedToken.uid, 'BYOK_SAVE', decodedToken.uid);

    // The account's copy of the proof log (T03), best effort, to the verified address.
    if (metadata.agreementReplaced) await sendAgreementEndedMail(decodedToken.email, decodedToken.uid, 'replaced');
    if (addendumRequired(provider) && addendum) await sendAgreementAcceptedMail(decodedToken.email, decodedToken.uid, addendum);

    return NextResponse.json({ ok: true, ...metadata });
  } catch (err: any) {
    if (err instanceof QuotaError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err?.message?.includes('MFA verification required')) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    // A code, never the error: a failure here can carry the key being stored or
    // a provider's answer body, and the log is read by more people than the
    // vault (3.0.13 e).
    logger.error('byok key save failed', { route: 'api/secrets/gemini', error: providerErrorShape(err) });
    
    // Log security failure
    try {
      const { db } = await getAdminDb();
      await logAuditEvent(db, decodedToken.uid, 'BYOK_SAVE_FAIL', decodedToken.uid);
    } catch {}

    return NextResponse.json({ error: 'Failed to save API key due to an internal error.' }, { status: 500 });
  }
}

/**
 * DELETE /api/secrets/gemini
 *
 * Deletes a user's custom Gemini API key securely.
 */
export async function DELETE(req: NextRequest) {
  const decodedToken = await verifyRequestAuth(req);
  if (!decodedToken) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  try {
    // 1. MFA Step-up Gate
    await assertMfaSatisfied(req, decodedToken, { requireEnrolment: byokRequiresEnrolment });

    // 2. Rate Limiting Gate (10 removals per hour), per account, as on save.
    await assertByokRateLimit('delete', decodedToken.uid);

    // No account-state gate, on purpose — the same intent
    // `app/api/projects/[projectId]/readers/route.ts` states about revoking.
    // Taking your own key off this server is how you stop it being used, and a
    // suspended account is the case where that matters most: it must not be the
    // one state in which the key cannot be withdrawn. Every route that *spends*
    // the key does check (POST above, /test, /status), which is where the gate
    // belongs.
    // 3.0.21: deleting an Anthropic key is "Delete key and end agreement" —
    // the proof log records the ending in the same transaction (clause 11).
    const { agreementEnded } = await deleteOwnModelKey(decodedToken.uid, { ending: 'settings' });

    // 3. Security Audit Logging
    const { db } = await getAdminDb();
    await logAuditEvent(db, decodedToken.uid, 'BYOK_DELETE', decodedToken.uid);
    if (agreementEnded) await sendAgreementEndedMail(decodedToken.email, decodedToken.uid, 'settings');

    return NextResponse.json({ ok: true, agreementEnded });
  } catch (err: any) {
    if (err instanceof QuotaError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err?.message?.includes('MFA verification required')) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    logger.error('byok key delete failed', { route: 'api/secrets/gemini', error: providerErrorShape(err) });

    // Log security failure
    try {
      const { db } = await getAdminDb();
      await logAuditEvent(db, decodedToken.uid, 'BYOK_DELETE_FAIL', decodedToken.uid);
    } catch {}

    return NextResponse.json({ error: 'Failed to delete API key due to an internal error.' }, { status: 500 });
  }
}
