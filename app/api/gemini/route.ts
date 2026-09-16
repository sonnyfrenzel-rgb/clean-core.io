import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { GoogleGenAI } from '@google/genai';
import {
  verifyRequestAuth,
  QuotaError,
  assertMfaSatisfied,
  assertAccountActive,
  loadGeminiApiKey,
  getAdminDb,
} from '@/lib/firebase-admin';
import { assertRateLimit, getClientIp } from '@/lib/rate-limit';
import {
  isModelStage,
  modelStageEnabled,
  MODEL_STAGE_LABELS,
  NO_KEY_CODE,
  STAGE_DISABLED_CODE,
} from '@/lib/model-stages';

/**
 * Server-side API route for all Gemini AI calls.
 * This keeps the API key out of the browser bundle entirely.
 *
 * Accepts POST with JSON body:
 *   { prompt: string, model?: string, jsonResponse?: boolean, customApiKey?: string }
 *
 * Returns:
 *   { text: string }
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

// F-09: Server-side model register / allowlist. Only approved models may be used.
// GA = generally available & stable; PREVIEW = opt-in canary (may change or retire).
// Dead Gemini 2.0 IDs were removed (lifecycle ended per Google's deprecation page).
// The POST default below is pinned to the current product model; promoting the
// default to a GA model is gated on a golden-set regression check (2.2 roadmap).
const ALLOWED_MODELS = new Set([
  'gemini-2.5-flash',       // GA — stable fallback
  'gemini-2.5-pro',         // GA — stable fallback
  'gemini-3-flash-preview', // PREVIEW — current product default (see POST body)
]);

// F-07: Hard prompt-size limit to prevent cost/quota abuse.
const MAX_PROMPT_LENGTH = 250_000;

const MAX_RETRIES = 3;
const INITIAL_DELAY = 2000;

async function callWithRetry(
  fn: () => Promise<string>,
  retries = MAX_RETRIES,
  delay = INITIAL_DELAY,
): Promise<string> {
  try {
    return await fn();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const isRateLimited =
      message.includes('429') ||
      message.includes('RESOURCE_EXHAUSTED');

    if (retries > 0 && isRateLimited) {
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
        await assertRateLimit(`gemini:${decodedToken.uid}:${getClientIp(request)}`, 20, 60 * 60 * 1000);
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
      model = 'gemini-3-flash-preview',
      jsonResponse = false,
      stage,
    } = body as {
      prompt: string;
      model?: string;
      jsonResponse?: boolean;
      /** Which of the five model stages is asking. Absent for the glossary chatbot and the key test. */
      stage?: string;
    };

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

    // Resolve the AI client — load BYOK key from secure user_secrets if it exists, else server key.
    const byokKey = await loadGeminiApiKey(decodedToken.uid);
    const ai = byokKey
      ? new GoogleGenAI({ apiKey: byokKey })
      : getDefaultAI();

    if (!ai) {
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
    const text = await callWithRetry(async () => {
      const result = await ai.models.generateContent({
        model,
        contents: prompt,
        config: jsonResponse
          ? { responseMimeType: 'application/json' }
          : undefined,
      });

      if (!result.text) {
        throw new Error('Gemini returned an empty response.');
      }

      return result.text;
    });

    return NextResponse.json({ text });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('gemini route failed', { route: 'api/gemini', error: message });

    if (message.includes('fetch')) {
      return NextResponse.json(
        {
          error:
            'Network error when calling Gemini. This may be due to regional restrictions.',
        },
        { status: 502 },
      );
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
