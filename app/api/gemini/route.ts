import { NextRequest, NextResponse } from 'next/server';
import { logger, providerErrorShape } from '@/lib/logger';
import { GoogleGenAI } from '@google/genai';
import type { DocumentSnapshot } from 'firebase-admin/firestore';
import {
  verifyRequestAuth,
  QuotaError,
  assertMfaSatisfied,
  assertAccountActive,
  loadOwnModelKey,
  getAdminDb,
  type OwnModelKey,
} from '@/lib/firebase-admin';
import {
  ALLOWED_CLAUDE_MODELS,
  AUTO_STEPS_OFF_CODE,
  MODEL_PROVIDERS_SUSPENDED_ENV,
  OWN_CLAUDE_MODEL,
  PLATFORM_PROVIDER,
  PROVIDER_LABEL,
  PROVIDER_SUSPENDED_CODE,
  RECEIPT_PROVIDER_ID,
  autoStepsOffMessage,
  providerSuspendedMessage,
  stageAnswerNeedsWrite,
  suspendedProvidersOf,
  type KeyOwner,
  type ModelKeyProvider,
  type StageAnswerRecord,
} from '@/lib/model-providers';
import { callClaudeMessages, claudeEffortFor, ownKeyRefused } from '@/lib/anthropic-messages';
import { assertRateLimit } from '@/lib/rate-limit';
import { MODEL_HOURLY_WINDOW_MS, modelHourlyLimit } from '@/lib/model-hourly-limit';
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
import {
  ByokKeyUnreadableError,
  OwnModelKeyMissingError,
  OWN_KEY_REJECTED_CODE,
  ownKeyRejectedMessage,
} from '@/lib/byok-key';
import {
  GEMINI_TEST_STUB_FINISH_HEADER,
  GEMINI_TEST_STUB_HEADER,
  GEMINI_TEST_REAL_MODEL_HEADER,
  geminiTestStubActive,
  geminiTestStubAnswer,
} from '@/lib/gemini-test-stub';
import { incompleteAnswerMessage, modelCompletion, MODEL_INCOMPLETE_CODE, type ModelAnswer } from '@/lib/model-completion';
import { PRODUCT_GEMINI_MODEL } from '@/lib/constants';
import { resolveRequestedModel } from '@/lib/gemini-model-choice';
import { RESPONSE_SHAPE_STAGE, isResponseShape, responseSchemaForStage } from '@/lib/model-response-schema';
import { isFirestoreId } from '@/lib/firestore-id';
import { readBoundedJson, ResponseLimitError } from '@/lib/url-validation';
import { LEASE_CODES, leaseReferenceOf } from '@/lib/transformation/lease';
import { acquireLeaseCall, peekLease, releaseLeaseCall, type HeldLeaseSlot } from '@/lib/transformation/lease-store';
import { ATTEMPT_LIMIT_CODE, attemptLimitMessage, geminiAttemptLimiter } from '@/lib/attempt-limit';
import { LEASED_PROMPT_MAX_CHARS, isGateRepairPrompt } from '@/lib/transformation/fill-prompt';
import { modelUsageLog } from '@/lib/model-usage-log';
import { thinkingConfigFor } from '@/lib/model-thinking';
import { MODEL_CALL_DEADLINE_MS, MODEL_TIMEOUT_CODE, modelDeadline, modelTimeoutMessage, type ModelDeadline } from '@/lib/model-deadline';
import { isModelCallStage, STAGE_MAX_OUTPUT_TOKENS } from '@/lib/model-call-stage';
import { PLATFORM_BUDGET_CODE, platformBudgetMessage, reservePlatformModelCall } from '@/lib/platform-model-budget';

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
 *
 * 3.0.12 — the generation lease. An engine-led Transformation makes up to 48
 * small calls per generation; it buys a lease at `/api/transformation/lease`
 * for one unit of the same 20/h, and each of its calls names the lease as
 * `lease: { projectId, leaseId }`. Such a call skips the hourly counter and is
 * counted against the lease instead (budget, 4 in flight, its time `leaseTtlMs`, this
 * account only — `lib/transformation/lease.ts`); an invalid, closed, expired
 * or used-up lease is refused with a code before the provider is asked. Every
 * other gate below applies to a leased call unchanged, and a call without a
 * lease behaves exactly as before.
 *
 * 3.0.13 (owner decision 14.10.2026, quality over cost) — a lease also holds 16
 * calls for repairs of gate errors (activation / type check), spent only by a
 * call marked `gateRepair` whose prompt is such a repair (`isGateRepairPrompt`)
 * and only once the 48 are used: at most 64 calls per generation, the hourly
 * limits unchanged.
 *
 * 3.0.15 (data sovereignty over the model, part B) — an account's own key may
 * be an Anthropic key: the call then goes to Anthropic's Messages API on that
 * key and the one Claude model `lib/model-providers.ts` sets
 * (`lib/anthropic-messages.ts`), with every gate above unchanged and the same
 * completeness rule and receipt after it. An account with an own key is never
 * served with the platform key: a missing or unreadable own key is refused
 * before the provider is asked, and a provider that refuses the own key ends
 * the call with `own-key-rejected`. The path keeps its name; the platform's own
 * key stays Gemini (`PLATFORM_PROVIDER`) until part A.
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
/**
 * The request body's byte bound. A prompt the length check admits is never
 * refused here: one UTF-16 unit is at most six bytes of JSON (`\uXXXX`), and
 * 64 KiB is room for every other field of the body.
 */
const GEMINI_BODY_LIMITS = { maxBytes: MAX_PROMPT_LENGTH * 6 + 64 * 1024, timeoutMs: 30_000 };

const MAX_RETRIES = 3;
/** Anthropic is asked again at most twice (privacy policy and terms, Fassung 1.1: "höchstens zweimal"). */
const ANTHROPIC_MAX_RETRIES = 2;
const INITIAL_DELAY = 2000;

async function callWithRetry<T>(
  fn: () => Promise<T>,
  retries = MAX_RETRIES,
  delay = INITIAL_DELAY,
  /** A leased call's request signal: once the caller has gone, nothing is retried. */
  signal?: AbortSignal,
): Promise<T> {
  try {
    return await fn();
  } catch (error: unknown) {
    // The caller has gone: nothing is asked again for nobody.
    if (signal?.aborted) throw error;
    const message = error instanceof Error ? error.message : String(error);
    if (retries > 0 && isTransientModelError(message)) {
      // The wait ends early when the caller goes, and a caller gone during it
      // gets no retry: the lease slot is given back now, not after the backoff
      // and one more provider call.
      await new Promise<void>((resolve) => {
        const onAbort = () => { clearTimeout(timer); resolve(); };
        const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, delay);
        signal?.addEventListener('abort', onAbort, { once: true });
      });
      if (signal?.aborted) throw error;
      return callWithRetry(fn, retries - 1, delay * 2, signal);
    }
    throw error;
  }
}

export async function POST(request: NextRequest) {
  // The generation lease whose in-flight slot this call holds, given back in `finally`.
  let heldLease: HeldLeaseSlot | null = null;
  // The provider of the account's own key once it is loaded — read by the catch
  // below, which must tell "your key was refused" from any other failure.
  let calledWithOwnKey: ModelKeyProvider | null = null;
  // The deadline of the model call (`lib/model-deadline.ts`), counted from the
  // request's arrival, so the route answers before Cloud Run ends it at 300 s.
  const arrivedAt = Date.now();
  let deadline: ModelDeadline | null = null;
  try {
    // Server-side auth gate via Admin SDK
    const decodedToken = await verifyRequestAuth(request);
    if (!decodedToken) {
      return NextResponse.json(
        { error: 'Authentication required.' },
        { status: 401 },
      );
    }

    // The attempt limit (docs/design/gemini-attempt-limit.md): every attempt of
    // this account counts, leased or not, admin or not, whatever the gates below
    // answer — and past the allowance it ends here, before the body is read and
    // before any Firestore access. In memory, per instance; never skipped under
    // the emulator flag.
    const attempt = geminiAttemptLimiter.attempt(decodedToken.uid);
    if (!attempt.ok) {
      return NextResponse.json(
        { error: attemptLimitMessage(attempt.retryAfterSeconds), code: ATTEMPT_LIMIT_CODE },
        { status: 429, headers: { 'Retry-After': String(attempt.retryAfterSeconds) } },
      );
    }

    // Read once, here: whether the call names a generation lease decides which
    // budget it is counted against (roadmap 3.0.12, `lib/transformation/lease.ts`).
    // Read under a byte bound: this runs before any limiter, and `request.json()`
    // buffered a body of any size for an account at its hourly limit as readily
    // as for any other.
    let body: unknown;
    try {
      body = await readBoundedJson(new Response(request.body, { headers: request.headers }), GEMINI_BODY_LIMITS);
    } catch (bodyErr) {
      if (bodyErr instanceof ResponseLimitError) {
        return NextResponse.json({ error: 'The request is too large.', code: 'too-large' }, { status: 413 });
      }
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }
    const lease = leaseReferenceOf(body, isFirestoreId);
    if (lease && 'ok' in lease) {
      return NextResponse.json({ error: lease.error, code: lease.code }, { status: lease.status });
    }
    // Only meaningful under a lease: the call repairs gate errors (checked against its prompt below).
    const gateRepair = lease !== null && (body as { gateRepair?: unknown } | null)?.gateRepair === true;

    try {
      if (lease) {
        // A call under a generation lease is counted against the lease — the
        // generation paid one unit of the hourly limit for it at
        // /api/transformation/lease — and not against the hourly counter. The
        // lease must be this account's, open, unexpired, with calls and an
        // in-flight slot left; judged here before any other work, and counted
        // in a transaction right before the provider call below.
        //
        // What the body alone can refuse is refused first: a leased call skips
        // the hourly counter, so a request that was going to be a 400 anyway
        // must not cost a lease read.
        // The same checks stand again below for every call.
        const leased = body as { prompt?: unknown; stage?: unknown };
        if (leased.stage !== 'transformation') {
          return NextResponse.json(
            { error: 'A generation lease pays only for calls of the Transformation stage.', code: LEASE_CODES.stage },
            { status: 400 },
          );
        }
        if (typeof leased.prompt !== 'string' || !leased.prompt || leased.prompt.length > MAX_PROMPT_LENGTH) {
          return NextResponse.json(
            { error: `The prompt must be a single string of 1 to ${MAX_PROMPT_LENGTH.toLocaleString()} characters.` },
            { status: 400 },
          );
        }
        // A leased call is a fill call, and a fill prompt is small (design §2
        // goal 4): the general 250,000 would let a lease spend its calls on
        // prompts eighteen times the size the design promises.
        // Refused before the lease is read.
        if (leased.prompt.length > LEASED_PROMPT_MAX_CHARS) {
          return NextResponse.json(
            {
              error: `A call under a generation lease carries at most ${LEASED_PROMPT_MAX_CHARS.toLocaleString()} characters; this one has ${leased.prompt.length.toLocaleString()}.`,
              code: LEASE_CODES.promptTooLarge,
            },
            { status: 413 },
          );
        }
        // A call marked as a repair of gate errors may spend the lease's gate-repair calls once its budget is
        // used (owner decision 14.10.2026, `LEASE_GATE_REPAIR_CALLS`). The mark is honoured only on a prompt that
        // is such a repair (`isGateRepairPrompt`): a fill or any other call marked so is refused here, before the
        // lease is read. Both the mark and the prompt come from the caller — the gates run in the browser, so the
        // server never sees the failure itself; what bounds the reserve is the lease (this account, one unit of the
        // hourly limit, at most `LEASE_MAX_CALLS_PER_GENERATION` calls), not the provenance of the mark.
        if (gateRepair && !isGateRepairPrompt(leased.prompt)) {
          return NextResponse.json(
            { error: 'Only a repair of activation or type-check errors may use the calls a generation holds for them.', code: LEASE_CODES.gateRepair },
            { status: 400 },
          );
        }
        const { db } = await getAdminDb();
        const peek = await peekLease(db, lease, { uid: decodedToken.uid, now: Date.now(), gateRepair });
        if (!peek.ok) {
          return NextResponse.json({ error: peek.error, code: peek.code }, { status: peek.status });
        }
      } else {
        // Every account has an hourly model-call limit, administrators included:
        // an account with the admin claim is counted in a bucket of its own with
        // a higher ceiling (`lib/model-hourly-limit.ts`), by the
        // same Firestore-backed window. The bucket is chosen first, so there is
        // one call to the limiter for both.
        //
        // Keyed on the account alone. The key used to carry the client address
        // as well, which makes the ceiling per account *and* address: the same
        // account reaching the shared community key through a second address got
        // a second allowance, and a third, so the limiter the module header above
        // calls "the primary cost guard on the shared community Gemini key" put
        // no bound on an account at all. The address is not a second identity of
        // the caller here — the account is the thing being metered, and it is
        // already established by the verified token.
        const hourly = modelHourlyLimit(decodedToken.uid, decodedToken.admin === true);
        await assertRateLimit(hourly.key, hourly.max, MODEL_HOURLY_WINDOW_MS);
      }
    } catch (rateErr: unknown) {
      // Only the limiter's own refusal is the caller's to read; anything else
      // (a store error, say) is logged here and answered without its text.
      if (rateErr instanceof QuotaError) {
        return NextResponse.json({ error: rateErr.message || 'Too many requests.' }, { status: rateErr.status || 429 });
      }
      logger.error('gemini rate limit check failed', { route: 'api/gemini', error: rateErr instanceof Error ? rateErr.name : 'unknown' });
      return NextResponse.json({ error: 'The usage check could not run. Please try again shortly.' }, { status: 503 });
    }

    // Server-side MFA gate. `users/{uid}` is read once, here, and handed to the
    // account gate and the stage switch below, which used to read it again each
    // (docs/design/gemini-attempt-limit.md: 4 → 2 reads on a leased call). Read
    // inside this try, where the gate read it before, so a failed read is
    // answered as it was.
    let profile: DocumentSnapshot;
    try {
      profile = await (await getAdminDb()).db.collection('users').doc(decodedToken.uid).get();
      await assertMfaSatisfied(request, decodedToken, { profile });
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
        profile,
      });
    } catch (gateErr: any) {
      if (gateErr instanceof QuotaError) {
        return NextResponse.json({ error: gateErr.message }, { status: gateErr.status });
      }
      throw gateErr;
    }

    const {
      prompt,
      model: requestedModel,
      jsonResponse = false,
      stage,
      responseShape,
      trigger,
    } = (body ?? {}) as {
      prompt: string;
      model?: string;
      jsonResponse?: boolean;
      /** 3.0.21 — `'automatic'` for a step the product started by itself on opening a project. */
      trigger?: unknown;
      /** Which stage is asking (`lib/model-call-stage.ts`): required since 3.0.21. */
      stage?: string;
      /** An answer shape within the stage (`lib/model-response-schema.ts`): the fill calls of 3.0.12. */
      responseShape?: unknown;
    };
    // The product default, named or omitted, is this deployment's product
    // model — so `GEMINI_MODEL` reaches the callers that name the constant.
    const model = resolveRequestedModel(requestedModel, productModel());
    const automatic = trigger === 'automatic';

    // Roadmap 1.2 — the per-stage switch, enforced on the server.
    //
    // The switch is the account owner's preference about their own key and
    // their own quota, not a security boundary. It is
    // enforced here rather than only in the browser so that a page left open
    // in another tab cannot spend on a stage the owner has since switched off.
    // The answer carries a code as well as a sentence, because the screens
    // branch on the reason and a message is for a person to read.
    //
    // SEC-01 (3.0.21): every call names its stage — one of the seven, or the
    // help chatbot's — and the stage bounds the answer's length below. A call
    // without one is refused before any key is loaded.
    if (!isModelCallStage(stage)) {
      return NextResponse.json(
        { error: stage === undefined ? 'Every model call names its stage.' : `Unknown model stage: ${stage}.`, code: 'stage-required' },
        { status: 400 },
      );
    }
    if (isModelStage(stage)) {
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

    // A lease is bought for the Transformation stage and spends on nothing else.
    if (lease && stage !== 'transformation') {
      return NextResponse.json(
        { error: 'A generation lease pays only for calls of the Transformation stage.', code: LEASE_CODES.stage },
        { status: 400 },
      );
    }
    // An answer shape belongs to one stage; named under another, it is refused.
    if (responseShape !== undefined && (!isResponseShape(responseShape) || RESPONSE_SHAPE_STAGE[responseShape] !== stage)) {
      return NextResponse.json({ error: 'Unknown answer shape for this stage.' }, { status: 400 });
    }
    const shape = isResponseShape(responseShape) ? responseShape : undefined;

    if (!prompt) {
      return NextResponse.json(
        { error: 'Missing required field: prompt' },
        { status: 400 },
      );
    }

    // `prompt` goes to the model as its `contents`, which the API also takes as
    // a structured array. An array has a `.length` of its own — the element
    // count — so the character limit below measured 1 for a client that sent
    // one element holding a megabyte. One shape, one measure.
    // The only client, lib/gemini.ts, sends a string.
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
    // and the receipt below is minted exactly as for a real answer.
    // The test server stubs by
    // default, and a listed spec opts in to the real model with the second
    // header (roadmap "before 3.0.7 — Tests never spend the production model
    // budget"; the list is tests/gemini-real-model-guard.spec.ts).
    const stubbed = geminiTestStubActive(
      process.env,
      request.headers.get(GEMINI_TEST_STUB_HEADER),
      request.headers.get(GEMINI_TEST_REAL_MODEL_HEADER),
    );

    // Resolve the AI client — load BYOK key from secure user_secrets if it exists, else server key.
    //
    // A stored key this server cannot open is refused, not treated as absent
    // (3.0.13 g): absent would hand the call to the community key, unmetered,
    // for an account whose profile says it brings its own.
    //
    // Loaded under the stub as well: the stub replaces the provider call and
    // nothing before it, so a key the server cannot open is refused on the test
    // server too — which, now that it stubs by default, is what lets the BYOK
    // refusal specs prove it without leaving the stub.
    //
    // 3.0.15 — data sovereignty. The own key may be Gemini's or Anthropic's
    // (`lib/model-providers.ts`), and an account with an own key is never
    // served with the platform key: a key the profile names and the store does
    // not hold is refused as well (`OwnModelKeyMissingError`), and a provider
    // that refuses the own key stops the step below (`OWN_KEY_REJECTED_CODE`).
    // The platform key is reached only when the account has no own key at all.
    let ownKey: OwnModelKey | null = null;
    try {
      ownKey = await loadOwnModelKey(decodedToken.uid, {
        profile: profile.exists ? (profile.data() as { byokConfigured?: unknown; byokProvider?: unknown }) : null,
      });
    } catch (keyErr: unknown) {
      if (keyErr instanceof ByokKeyUnreadableError || keyErr instanceof OwnModelKeyMissingError) {
        return NextResponse.json({ error: keyErr.message, code: keyErr.code }, { status: 503 });
      }
      throw keyErr;
    }
    const byokKey = ownKey?.apiKey ?? null;
    calledWithOwnKey = ownKey?.provider ?? null;
    const provider: ModelKeyProvider = ownKey ? ownKey.provider : PLATFORM_PROVIDER;
    // 3.0.21 (T01) — the per-provider switch-off: a provider the operator has
    // suspended is not called, and nothing else is called in its place — not
    // another provider, not the platform key. The step stops with the reason.
    if (suspendedProvidersOf(process.env[MODEL_PROVIDERS_SUSPENDED_ENV]).includes(provider)) {
      return NextResponse.json({ error: providerSuspendedMessage(provider), code: PROVIDER_SUSPENDED_CODE }, { status: 503 });
    }
    // 3.0.21 (owner decision B6) — a step the product starts by itself when the
    // owner opens a project (`trigger: 'automatic'`) runs on an own key only
    // once the account switched "Automatic steps" on for that key; until then
    // it comes on a click. With the platform key it runs as before. Like the
    // stage switch, the account's preference about its own key, held here so a
    // page left open cannot spend on it.
    if (automatic && ownKey && !ownKey.autoSteps) {
      return NextResponse.json({ error: autoStepsOffMessage(PROVIDER_LABEL[ownKey.provider]), code: AUTO_STEPS_OFF_CODE }, { status: 403 });
    }
    // The model the provider is asked for: a Gemini request runs as asked; with
    // an own Claude key every stage runs on the one Claude model set in
    // `lib/model-providers.ts`, checked against its own register.
    const servedModel = provider === 'anthropic' ? OWN_CLAUDE_MODEL : model;
    if (provider === 'anthropic' && !ALLOWED_CLAUDE_MODELS.has(servedModel)) {
      return NextResponse.json({ error: `Model "${servedModel}" is not permitted.` }, { status: 400 });
    }
    const ai = provider !== 'gemini'
      ? null
      : byokKey
        ? new GoogleGenAI({ apiKey: byokKey })
        : getDefaultAI();

    if (provider === 'gemini' && !ai && !stubbed) {
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
    //
    // A leased call is counted now, after every gate and right before the
    // provider is asked: `used` and `inFlight` go up in one transaction that
    // re-checks the budget (48; a checked gate repair beyond it: its 16) and the in-flight cap (4). The slot is given
    // back in `finally` below, whatever the call does; the call itself stays
    // counted. A leased call also ends with its request: when the browser
    // cancels the generation, the provider call is aborted and not retried.
    // SEC-01 (3.0.21): the community key's daily budget, with its breaker
    // (`lib/platform-model-budget.ts`). Only a call the platform key would pay
    // for is counted; an own key is never counted or refused here. Asked
    // before a lease counts the call, so a refused call costs the lease nothing.
    if (!ownKey && !stubbed) {
      let admitted: boolean;
      try {
        const { db, FieldValue } = await getAdminDb();
        admitted = (await reservePlatformModelCall(db, (n) => FieldValue.increment(n))).ok;
      } catch (budgetErr: unknown) {
        logger.error('platform model budget check failed', { route: 'api/gemini', error: budgetErr instanceof Error ? budgetErr.name : 'unknown' });
        return NextResponse.json({ error: 'The usage check could not run. Please try again shortly.' }, { status: 503 });
      }
      if (!admitted) {
        return NextResponse.json({ error: platformBudgetMessage(), code: PLATFORM_BUDGET_CODE }, { status: 503 });
      }
    }

    if (lease) {
      const { db } = await getAdminDb();
      const counted = await acquireLeaseCall(db, lease, { uid: decodedToken.uid, now: Date.now(), gateRepair });
      if (!counted.ok) {
        return NextResponse.json({ error: counted.error, code: counted.code }, { status: counted.status });
      }
      // The slot this call took, by its time, so the release frees exactly it.
      heldLease = { ...lease, slotAt: counted.slotAt };
    }
    const abortSignal = lease ? request.signal : undefined;
    // Every call, leased or not, is stopped at the deadline: the whole
    // exchange, retries and backoff included, ends while Cloud Run still holds
    // the request, and the provider call is aborted rather than left running.
    deadline = modelDeadline(Math.max(1_000, MODEL_CALL_DEADLINE_MS - (Date.now() - arrivedAt)), abortSignal);
    const callSignal = deadline.signal;
    const responseSchema = jsonResponse && isModelStage(stage) ? responseSchemaForStage(stage, shape) : undefined;
    // Fill and repair calls think LOW (`lib/model-thinking.ts`, measured 13.10.2026); every other shape keeps the default.
    const thinkingConfig = thinkingConfigFor(shape);
    // Set inside the provider call below; typed so the assignment there is not narrowed away.
    let inferenceGeo = null as string | null;
    // SEC-01 (3.0.21): the most output (thinking included) one call of this stage may produce.
    const maxOutputTokens = STAGE_MAX_OUTPUT_TOKENS[stage];
    const answer: ModelAnswer = stubbed
      ? geminiTestStubAnswer(request.headers.get(GEMINI_TEST_STUB_FINISH_HEADER), shape === 'transformation-fill' ? prompt : undefined)
      : provider === 'anthropic'
      ? await callWithRetry(async () => {
          // An own Claude key (3.0.15): the Messages API, the same schema and
          // the same completeness rule (`lib/anthropic-messages.ts`).
          const attemptAt = Date.now();
          const result = await callClaudeMessages({
            apiKey: byokKey!,
            model: servedModel,
            prompt,
            jsonResponse,
            ...(responseSchema ? { schema: responseSchema } : {}),
            ...(claudeEffortFor(thinkingConfig) ? { effort: claudeEffortFor(thinkingConfig) } : {}),
            signal: callSignal,
          }).catch((providerErr: unknown) => {
            logger.warn('gemini usage', modelUsageLog({
              usage: undefined,
              model: servedModel,
              stage: stage ?? null,
              responseShape: shape ?? null,
              leased: lease !== null,
              durationMs: Date.now() - attemptAt,
              failed: true,
            }));
            throw providerErr;
          });
          logger.info('gemini usage', modelUsageLog({
            usage: result.usage,
            model: servedModel,
            stage: stage ?? null,
            responseShape: shape ?? null,
            leased: lease !== null,
            durationMs: Date.now() - attemptAt,
          }));
          // Where Anthropic says inference ran (`usage.inference_geo`, 3.0.21) —
          // recorded with who answered, beside the receipt, never inside it.
          inferenceGeo = result.inferenceGeo;
          return result.answer;
        }, ANTHROPIC_MAX_RETRIES, undefined, callSignal)
      : await callWithRetry(async () => {
          const attemptAt = Date.now();
          const result = await ai!.models.generateContent({
            model,
            contents: prompt,
            // A stage whose answer has a fixed shape sends it as a schema, so
            // the provider decodes against it rather than taking JSON mode as
            // a suggestion (`lib/model-response-schema.ts`, 03.10.2026).
            config: jsonResponse
              ? {
                  responseMimeType: 'application/json',
                  ...(responseSchema ? { responseJsonSchema: responseSchema } : {}),
                  ...(thinkingConfig ? { thinkingConfig } : {}),
                  maxOutputTokens,
                  abortSignal: callSignal,
                }
              : { ...(thinkingConfig ? { thinkingConfig } : {}), maxOutputTokens, abortSignal: callSignal },
          }).catch((providerErr: unknown) => {
            // A failed attempt is a call too: its duration is logged, its
            // counts are null.
            logger.warn('gemini usage', modelUsageLog({
              usage: undefined,
              model,
              stage: stage ?? null,
              responseShape: shape ?? null,
              leased: lease !== null,
              durationMs: Date.now() - attemptAt,
              failed: true,
            }));
            throw providerErr;
          });
          // Where the time of a call went (input, output, thinking): counts
          // only, never the prompt or the answer (`lib/model-usage-log.ts`).
          logger.info('gemini usage', modelUsageLog({
            usage: result.usageMetadata,
            model,
            stage: stage ?? null,
            responseShape: shape ?? null,
            leased: lease !== null,
            durationMs: Date.now() - attemptAt,
          }));
          return {
            text: result.text,
            finishReason: result.candidates?.[0]?.finishReason ?? null,
            blockReason: result.promptFeedback?.blockReason ?? null,
          };
        }, undefined, undefined, callSignal);

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
        { error: incompleteAnswerMessage(completion.reason), code: MODEL_INCOMPLETE_CODE, reason: completion.reason },
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
    // 3.0.15 — who answered, per stage, on the account (`users/{uid}.modelAnswers`):
    // the provider, the model and whose key. Settings shows it under each stage.
    // Best effort, and written only when it changed: it is a display, not the
    // trust record — the receipt below is that.
    const keyOwner: KeyOwner = ownKey ? 'own' : 'platform';
    const receiptProvider = RECEIPT_PROVIDER_ID[provider];
    // Who answered, as every answer carries it: the receipt's claim set is
    // unchanged (no signed format changes what it signs); the data region of a
    // Claude answer travels beside it.
    const answeredBy = { provider: receiptProvider, modelId: servedModel, keyOwner, ...(inferenceGeo ? { inferenceGeo } : {}) };
    if (isModelStage(stage) && !stubbed) {
      const record: StageAnswerRecord = { provider: receiptProvider, modelId: servedModel, keyOwner, at: new Date().toISOString(), ...(inferenceGeo ? { inferenceGeo } : {}) };
      const previous = (profile.data() as { modelAnswers?: Record<string, unknown> } | undefined)?.modelAnswers?.[stage];
      if (stageAnswerNeedsWrite(previous, record)) {
        try {
          // Through the snapshot read above: `update` fails on an erased profile rather than recreating it.
          await profile.ref.update({ [`modelAnswers.${stage}`]: record });
        } catch (recordErr: unknown) {
          logger.warn('model answer record not written', { route: 'api/gemini', error: providerErrorShape(recordErr) });
        }
      }
    }

    const signingKey = getAuditSigningKey();
    if (!signingKey) {
      console.error(MISSING_SIGNING_KEY_LOG);
      return NextResponse.json({ text, answeredBy });
    }

    const receipt = issueModelReceipt(
      // The stage goes into the receipt when the caller named one — it was
      // validated above — so a store of one stage can refuse a receipt of
      // another.
      //
      // The provider is named here, by the handler that made the call — the
      // provider it actually called (Gemini, or Anthropic for an own Claude
      // key, 3.0.15) — rather than filled in by the receipt module when nobody
      // said (roadmap 3.0.13 b). The claim set is unchanged: a Gemini receipt
      // is byte for byte what it was, and `MODEL_PROVIDER_ID` is still its id.
      {
        uid: decodedToken.uid,
        text,
        provider: provider === 'gemini' ? MODEL_PROVIDER_ID : receiptProvider,
        modelId: servedModel,
        byok: !!byokKey,
        ...(stage !== undefined ? { stage } : {}),
        // CA-INT-02 (3.0.21): the receipt binds the prompt as well as the answer.
        prompt,
      },
      signingKey,
    );

    return NextResponse.json({ text, receipt, answeredBy });
  } catch (error: unknown) {
    // The deadline ended the call: said as such, with a code, before Cloud Run
    // would have answered 504 with no body (13.10.2026). Not retried here: the
    // same prompt would run into the same wait.
    if (deadline?.timedOut()) {
      logger.warn('gemini call deadline', { route: 'api/gemini', deadlineMs: MODEL_CALL_DEADLINE_MS, leased: heldLease !== null });
      return NextResponse.json({ error: modelTimeoutMessage(), code: MODEL_TIMEOUT_CODE }, { status: 504 });
    }
    const message = error instanceof Error ? error.message : String(error);
    // Not the message: a provider error can carry the refused prompt back, and
    // the log would then hold the customer's source (providerErrorShape).
    logger.error('gemini route failed', { route: 'api/gemini', error: providerErrorShape(error), network: message.includes('fetch') });

    // 3.0.15 — the provider refused the account's own key. Said as such, with a
    // code, and never retried with the platform key: the owner of this account
    // decided its code goes through its own key only.
    if (calledWithOwnKey && ownKeyRefused(error)) {
      return NextResponse.json(
        { error: ownKeyRejectedMessage(PROVIDER_LABEL[calledWithOwnKey]), code: OWN_KEY_REJECTED_CODE },
        { status: 502 },
      );
    }

    if (message.includes('fetch')) {
      return NextResponse.json(
        {
          error:
            'Network error when calling the model provider. This may be due to regional restrictions.',
        },
        { status: 502 },
      );
    }

    // The cause is in the log line above and nowhere else. It used to be the
    // answer: a provider error carries back the prompt it refused, the project
    // the key belongs to, a quota figure for the community key, or a stack line
    // from our own code — all of it to whoever made the call.
    return NextResponse.json(
      { error: 'The AI request could not be completed. Please try again.' },
      { status: 500 },
    );
  } finally {
    deadline?.clear();
    if (heldLease) {
      try {
        const { db } = await getAdminDb();
        await releaseLeaseCall(db, heldLease);
      } catch (releaseErr: unknown) {
        // The slot frees itself when the lease expires (`leaseTtlMs`); said loudly.
        logger.error('gemini lease slot could not be released', { route: 'api/gemini', error: providerErrorShape(releaseErr) });
      }
    }
  }
}
