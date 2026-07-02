import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { GoogleGenAI } from '@google/genai';
import {
  verifyRequestAuth,
  reserveTransformationQuota,
  refundTransformationQuota,
  QuotaError,
  assertMfaSatisfied,
  loadGeminiApiKey,
} from '@/lib/firebase-admin';
import { assertRateLimit, getClientIp } from '@/lib/rate-limit';

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
 * F-06: The transformation quota is verified AND incremented server-side, atomically,
 * via reserveTransformationQuota() — directly before the call, so parallel requests
 * cannot bypass the limit. On a failed generation the unit is refunded.
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

// F-07: Server-side model governance — only approved models may be used.
const ALLOWED_MODELS = new Set([
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-3-flash-preview',
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

    const body = await request.json();
    const {
      prompt,
      model = 'gemini-3-flash-preview',
      jsonResponse = false,
    } = body as {
      prompt: string;
      model?: string;
      jsonResponse?: boolean;
    };

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
      return NextResponse.json(
        {
          error:
            'Gemini API is not configured. Please set GEMINI_API_KEY in your environment or provide a custom API key in your profile.',
        },
        { status: 503 },
      );
    }

    // Quota only for the NON-BYOK path: atomically verify + reserve.
    if (!byokKey) {
      try {
        await reserveTransformationQuota(decodedToken.uid);
      } catch (err: unknown) {
        if (err instanceof QuotaError) {
          return NextResponse.json({ error: err.message }, { status: err.status });
        }
        console.error('Quota reservation error:', err);
        return NextResponse.json(
          { error: 'Internal quota validation failed.' },
          { status: 500 },
        );
      }
    }

    let text: string;
    try {
      text = await callWithRetry(async () => {
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
    } catch (genErr) {
      // Refund the reserved unit so failed calls don't consume quota.
      if (!byokKey) {
        await refundTransformationQuota(decodedToken.uid);
      }
      throw genErr; // handled by the outer catch below
    }

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
