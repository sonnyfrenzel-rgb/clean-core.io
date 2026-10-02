import { NextRequest, NextResponse } from 'next/server';
import { logger, providerErrorShape } from '@/lib/logger';
import { GoogleGenAI } from '@google/genai';
import {
  verifyRequestAuth,
  QuotaError,
  assertMfaSatisfied,
  assertAccountActive,
  loadGeminiApiKey,
  getAdminDb,
} from '@/lib/firebase-admin';
import { assertRateLimit } from '@/lib/rate-limit';
import {
  isModelStage,
  modelStageEnabled,
  MODEL_STAGE_LABELS,
  NO_KEY_CODE,
  STAGE_DISABLED_CODE,
} from '@/lib/model-stages';
import { getAuditSigningKey, MISSING_SIGNING_KEY_LOG } from '@/lib/audit-signing-key';
import { isTransientModelError } from '@/lib/model-retry';
import { issueModelReceipt, MODEL_PROVIDER_ID } from '@/lib/model-receipt';
import { ByokKeyUnreadableError } from '@/lib/byok-key';
import {
  GEMINI_TEST_STUB_FINISH_HEADER,
  GEMINI_TEST_STUB_HEADER,
  geminiTestStubActive,
  geminiTestStubAnswer,
} from '@/lib/gemini-test-stub';
import { incompleteAnswerMessage, modelCompletion, MODEL_INCOMPLETE_CODE, type ModelAnswer } from '@/lib/model-completion';
import { PRODUCT_GEMINI_MODEL } from '@/lib/constants';
import { resolveRequestedModel } from '@/lib/gemini-model-choice';

/**
 * Server-side API route for all Gemini AI calls.
 * This keeps the API key out of the browser bundle entirely.
 *
 * Accepts POST with JSON body:
 *   { prompt: string, model?: string, jsonResponse?: boolean, customApiKey?: string }
 *
 * Returns:
 *   { text: string, receipt?: ModelReceipt }
 *
 * The receipt is this route's own record that the call happened: the account it
 * was made for, the SHA-256 of the text returned, the model that served it,
 * whose key paid for it and when. It is authenticated with `AUDIT_SIGNING_KEY`,
 * which the browser never holds, and `/api/runs/create` verifies it before a
 * signed run is allowed to name a provider and a model. See
 * `lib/model-receipt.ts` for why each claim is in it.
 *
 * v2.3 — this route is NO LONGER the metering point. The community quota is charged
 * per *analysis run* in /api/runs/create (see `reserveRunQuota`), so one ABAP object
 * costs exactly one unit and the remaining six workflow stages — plus the glossary
 * chatbot — run unmetered. That is what makes "5 ABAP-to-Cloud transformations" and
 * "full 7-stage workflow included" simultaneously true.
 *
 * What still gates this route: authentication, MFA, the account-state gate
 * (approved + current Terms) and the per-user rate limit. With per-call metering
 * gone, `assertRateLimit` below is the primary cost guard on the shared community
 * Gemini key — one full project journey is ~7 calls (plus up to 5 for test
 * self-healing), so 20/h leaves headroom while still bounding abuse.
 */

// Cache the default instance so we don't create a new one per request.
let defaultAI: GoogleGenAI | null = null;

function getDefaultAI(): GoogleGenAI | null {
  if (defaultAI) return defaultAI;
  const key = process.env.GEMINI_API_KEY;
  if (key) {
    defaultAI = new GoogleGenAI({ apiKey: key });
  }
  return defaultAI;
}

/**
 * F-09: server-side model register. Only a model named here may be called, whoever asks.
 *
 * GA = generally available; PREVIEW = opt-in canary that may change or be withdrawn.
 * Dead Gemini 2.0 IDs were removed (lifecycle ended per Google's deprecation page).
 *
 * `gemini-3-flash-preview` was the product default until 23.09.2026 and is the
 * reason this list is now written down properly: it is a *preview* model, the
 * 3-flash line never reached GA, and Google shipped 3.5, 3.6, 3.7 and 3.8 flash
 * as GA while it stayed a canary. A product whose promise is a signed run cannot
 * rest on a model that may be withdrawn. It stays listed — receipts were issued
 * under it and a client may still ask for it — but it is no longer what the
 * product calls.
 *
 * `gemini-2.5-pro` was listed here as "GA — stable fallback" and was neither.
 * A `generateContent` call with the production key answers HTTP 404, "This model
 * models/gemini-2.5-pro is no longer available to new users" (checked 23.09.2026,
 * three times, roadmap 17.1). It is still in the key's `ListModels` answer, which
 * is why nobody noticed: listing a model is not the same statement as serving it,
 * and only the call tells the two apart.
 *
 * It was struck rather than replaced. Google's own 404 points at
 * `gemini-3.1-pro-preview`, and that is a preview — putting it here as a "stable
 * fallback" would repeat exactly the mistake the paragraph above records. No
 * pro-line model is GA for this key today, so the fallbacks are the three flash
 * models that answered. A client that still pins `gemini-2.5-pro` now gets a 400
 * naming the permitted models instead of a 500 from a provider 404, and
 * `GEMINI_MODEL` can no longer be pointed at an emergency exit that is walled up.
 *
 * `scripts/check-gemini-register.mjs` makes the call for every entry here and
 * writes what came back to `tests/gemini-register-liveness.json`;
 * `tests/gemini-model-pin.spec.ts` holds the register and that record together
 * without touching the network. Adding a model here means running the script.
 */
const ALLOWED_MODELS = new Set([
  'gemini-3.8-flash',       // GA — the product default (lib/constants.ts)
  'gemini-3.5-flash',       // GA — the longest-standing GA of the 3 line
  'gemini-2.5-flash',       // GA — stable fallback
  'gemini-3-flash-preview', // PREVIEW — the former default, kept for callers that pin it
  'gemini-3.5-flash-lite',  // GA — the naming stage only (lib/constants.ts, roadmap 17.3)
]);

/**
 * The model this deployment actually calls, and why it can be moved without a deploy.
 *
 * The product's choice is a constant in the source (`PRODUCT_GEMINI_MODEL`), so
 * changing it is a reviewed commit — which is right, because the model's name
 * goes into the signed model receipt and an audit trail whose contents can change
 * without a commit is not one. The same reasoning is already written down for the
 * review agents: *"Pinned on purpose: an alias … would change the reviewer without
 * a commit."*
 *
 * `GEMINI_MODEL` exists for the one case the constant serves badly: Google
 * withdraws a model and every analysis in the product stops until a deploy lands.
 * It is server-side only, and it cannot leave the register above — an unknown or
 * misspelt value is ignored rather than trusted, so the escape hatch cannot become
 * a way to run an unreviewed model. Whatever actually ran is what the receipt says.
 */
function productModel(): string {
  const override = process.env.GEMINI_MODEL?.trim();
  if (override && ALLOWED_MODELS.has(override)) return override;
  return PRODUCT_GEMINI_MODEL;
}

// F-07: Hard prompt-size limit to prevent cost/quota abuse.
const MAX_PROMPT_LENGTH = 250_000;

const MAX_RETRIES = 3;
const INITIAL_DELAY = 2000;

async function callWithRetry<T>(
  fn: () => Promise<T>,
  retries = MAX_RETRIES,
  delay = INITIAL_DELAY,
): Promise<T> {
  try {
    return await fn();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (retries > 0 && isTransientModelError(message)) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      return callWithRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

export async function POST(request: NextRequest) {
  try {
    // Server-side auth gate via Admin SDK
    const decodedToken = await verifyRequestAuth(request);
    if (!decodedToken) {
      return NextResponse.json(
        { error: 'Authentication required.' },
        { status: 401 },
      );
    }

    try {
      // Skip rate limiting for admin users
      if (!decodedToken.admin) {
        // Keyed on the account alone. The key used to carry the client address
        // as well, which makes the ceiling per account *and* address: the same
        // account reaching the shared community key through a second address got
        // a second allowance, and a third, so the limiter the module header above
        // calls "the primary cost guard on the shared community Gemini key" put
        // no bound on an account at all. The address is not a second identity of
        // the caller here — the account is the thing being metered, and it is
        // already established by the verified token.
        await assertRateLimit(`gemini:${decodedToken.uid}`, 20, 60 * 60 * 1000);
      }
    } catch (rateErr: any) {
      return NextResponse.json(
        { error: rateErr.message || 'Too many requests.' },
        { status: rateErr.status || 429 },
      );
    }

    // Server-side MFA gate
    try {
      await assertMfaSatisfied(request, decodedToken);
    } catch (mfaErr: any) {
      return NextResponse.json(
        { error: mfaErr.message || 'MFA verification required.' },
        { status: 403 }
      );
    }

    // F-02: central account-state gate — approval + current Terms are enforced for
    // ALL requests, INCLUDING the BYOK path (which previously skipped the
    // quota-based approval check). Admins/enterprise are exempt from approval.
    try {
      await assertAccountActive(decodedToken.uid, {
        requireApproved: true,
        requireCurrentTerms: true,
        isAdminClaim: decodedToken.admin === true,
      });
    } catch (gateErr: any) {
      if (gateErr instanceof QuotaError) {
        return NextResponse.json({ error: gateErr.message }, { status: gateErr.status });
      }
      throw gateErr;
    }

    const body = await request.json();
    const {
      prompt,
      model: requestedModel,
      jsonResponse = false,
      stage,
    } = body as {
      prompt: string;
      model?: string;
      jsonResponse?: boolean;
      /** Which of the five model stages is asking. Absent for the glossary chatbot and the key test. */
      stage?: string;
    };
    // The product default, named or omitted, is this deployment's product
    // model — so `GEMINI_MODEL` reaches the callers that name the constant.
    const model = resolveRequestedModel(requestedModel, productModel());

    // Roadmap 1.2 — the per-stage switch, enforced on the server.
    //
    // The switch is the account owner's preference about their own key and
    // their own quota, not a security boundary: a caller that omits `stage`
    // is not stopped, and the five product callers name themselves. It is
    // enforced here rather than only in the browser so that a page left open
    // in another tab cannot spend on a stage the owner has since switched off.
    // The answer carries a code as well as a sentence, because the screens
    // branch on the reason and a message is for a person to read.
    if (stage !== undefined) {
      if (!isModelStage(stage)) {
        return NextResponse.json({ error: `Unknown model stage: ${stage}.` }, { status: 400 });
      }
      const { db } = await getAdminDb();
      const profile = await db.collection('users').doc(decodedToken.uid).get();
      if (!modelStageEnabled(profile.exists ? (profile.data() as { modelStages?: Record<string, boolean> }) : null, stage)) {
        return NextResponse.json(
          {
            error: `${MODEL_STAGE_LABELS[stage]} is switched off for this account (${STAGE_DISABLED_CODE}). Turn it back on in Settings to generate it.`,
            code: STAGE_DISABLED_CODE,
          },
          { status: 403 },
        );
      }
    }

    if (!prompt) {
      return NextResponse.json(
        { error: 'Missing required field: prompt' },
        { status: 400 },
      );
    }

    // `prompt` goes to the model as its `contents`, which the API also takes as
    // a structured array. An array has a `.length` of its own — the element
    // count — so the character limit below measured 1 for a client that sent
    // one element holding a megabyte. One shape, one measure (security audit
    // of b88c77b, SEC-2026-225). The only client, lib/gemini.ts, sends a string.
    if (typeof prompt !== 'string') {
      return NextResponse.json(
        { error: 'The prompt must be a single string.' },
        { status: 400 },
      );
    }

    // F-07: Validate model against server-side allowlist
    if (!ALLOWED_MODELS.has(model)) {
      return NextResponse.json(
        { error: `Model "${model}" is not permitted. Allowed: ${[...ALLOWED_MODELS].join(', ')}` },
        { status: 400 },
      );
    }

    // F-07: Enforce prompt size limit
    if (prompt.length > MAX_PROMPT_LENGTH) {
      return NextResponse.json(
        { error: `Prompt exceeds maximum length of ${MAX_PROMPT_LENGTH.toLocaleString()} characters.` },
        { status: 400 },
      );
    }

    // The test suite's stand-in for the provider — never in a deployment
    // (`lib/gemini-test-stub.ts`: no K_SERVICE, the emulator build, and a
    // per-request secret). Every gate above has run; only the call is replaced,
    // and the receipt below is minted exactly as for a real answer
    // (QA review of 75b573cd22f0, 080cd5fce607).
    const stubbed = geminiTestStubActive(process.env, request.headers.get(GEMINI_TEST_STUB_HEADER));

    // Resolve the AI client — load BYOK key from secure user_secrets if it exists, else server key.
    //
    // A stored key this server cannot open is refused, not treated as absent
    // (3.0.13 g): absent would hand the call to the community key, unmetered,
    // for an account whose profile says it brings its own.
    let byokKey: string | null = null;
    try {
      byokKey = stubbed ? null : await loadGeminiApiKey(decodedToken.uid);
    } catch (keyErr: unknown) {
      if (keyErr instanceof ByokKeyUnreadableError) {
        return NextResponse.json({ error: keyErr.message, code: keyErr.code }, { status: 503 });
      }
      throw keyErr;
    }
    const ai = byokKey
      ? new GoogleGenAI({ apiKey: byokKey })
      : getDefaultAI();

    if (!ai && !stubbed) {
      // Roadmap 1.2 — a named reason, not just a sentence. The Analyze stage
      // reads this code and finishes the run without a narrative instead of
      // failing; before, the same 503 aborted the whole analysis and the
      // account ended with no signed evidence at all.
      return NextResponse.json(
        {
          error: `No Gemini key is available for this account (${NO_KEY_CODE}). Add your own key in Settings, or continue with the deterministic evidence alone.`,
          code: NO_KEY_CODE,
        },
        { status: 503 },
      );
    }

    // No quota reservation here — metering happens once per analysis run in
    // /api/runs/create. See the module header.
    const answer: ModelAnswer = stubbed
      ? geminiTestStubAnswer(request.headers.get(GEMINI_TEST_STUB_FINISH_HEADER))
      : await callWithRetry(async () => {
          const result = await ai!.models.generateContent({
            model,
            contents: prompt,
            config: jsonResponse
              ? { responseMimeType: 'application/json' }
              : undefined,
          });
          return {
            text: result.text,
            finishReason: result.candidates?.[0]?.finishReason ?? null,
            blockReason: result.promptFeedback?.blockReason ?? null,
          };
        });

    // Roadmap 3.0.13 (a) — only a finished answer is a result. The SDK's `text`
    // is whatever text the candidate carries, including an answer cut off at the
    // output limit or stopped by the provider's filter; receipting that would be
    // the server vouching for text the model did not finish
    // (`lib/model-completion.ts`). Not retried: the same prompt runs into the
    // same limit. The log names the reason code and nothing the provider said.
    const completion = modelCompletion(answer);
    if (!completion.ok) {
      logger.warn('gemini answer incomplete', {
        route: 'api/gemini',
        reason: completion.reason,
        finishReason: completion.finishReason,
      });
      return NextResponse.json(
        { error: incompleteAnswerMessage(completion.reason), code: MODEL_INCOMPLETE_CODE },
        { status: 502 },
      );
    }
    const text = completion.text;

    // The receipt. Minted here because this is the only place that knows the
    // call happened at all — the narrative reaches `/api/runs/create` in a
    // request body, with nothing tying it to any model.
    //
    // A missing signing key does not fail the call. There is no fallback key
    // (`lib/audit-signing-key.ts`) and there must not be one, but the text is
    // still the caller's to use; what it loses is the attestation, and the run
    // then records honestly that the narrative's origin was not established.
    // Failing here instead would turn a misconfigured deployment into one that
    // cannot generate anything, which is a worse answer to the same fact.
    const signingKey = getAuditSigningKey();
    if (!signingKey) {
      console.error(MISSING_SIGNING_KEY_LOG);
      return NextResponse.json({ text });
    }

    const receipt = issueModelReceipt(
      // The stage goes into the receipt when the caller named one — it was
      // validated above — so a store of one stage can refuse a receipt of
      // another (QA review of 8f9ea35a000e, 33a42c475f1a).
      //
      // The provider is named here, by the handler that made the call — this one
      // calls Google Gemini and nothing else — rather than filled in by the
      // receipt module when nobody said (roadmap 3.0.13 b).
      {
        uid: decodedToken.uid,
        text,
        provider: MODEL_PROVIDER_ID,
        modelId: model,
        byok: !!byokKey,
        ...(stage !== undefined ? { stage } : {}),
      },
      signingKey,
    );

    return NextResponse.json({ text, receipt });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    // Not the message: a provider error can carry the refused prompt back, and
    // the log would then hold the customer's source (providerErrorShape).
    logger.error('gemini route failed', { route: 'api/gemini', error: providerErrorShape(error), network: message.includes('fetch') });

    if (message.includes('fetch')) {
      return NextResponse.json(
        {
          error:
            'Network error when calling Gemini. This may be due to regional restrictions.',
        },
        { status: 502 },
      );
    }

    // The cause is in the log line above and nowhere else. It used to be the
    // answer: a provider error carries back the prompt it refused, the project
    // the key belongs to, a quota figure for the community key, or a stack line
    // from our own code — all of it to whoever made the call (security audit of
    // b88c77b).
    return NextResponse.json(
      { error: 'The AI request could not be completed. Please try again.' },
      { status: 500 },
    );
  }
}
