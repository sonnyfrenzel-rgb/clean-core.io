import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

/**
 * Server-side API route for all Gemini AI calls.
 * This keeps the API key out of the browser bundle entirely.
 *
 * Accepts POST with JSON body:
 *   { prompt: string, model?: string, jsonResponse?: boolean, customApiKey?: string }
 *
 * Returns:
 *   { text: string }
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
    const body = await request.json();
    const {
      prompt,
      model = 'gemini-3-flash-preview',
      jsonResponse = false,
      customApiKey,
      userId,
      idToken,
    } = body as {
      prompt: string;
      model?: string;
      jsonResponse?: boolean;
      customApiKey?: string;
      userId?: string;
      idToken?: string;
    };

    if (!prompt) {
      return NextResponse.json(
        { error: 'Missing required field: prompt' },
        { status: 400 },
      );
    }

    // Secure server-side check of transformations quota limit if NOT BYOK
    if (!customApiKey) {
      if (!userId || !idToken) {
        return NextResponse.json(
          { error: 'Unauthorized: Missing session tokens for closed-beta quota validation.' },
          { status: 401 },
        );
      }

      try {
        const dbId = process.env.NEXT_PUBLIC_FIRESTORE_DB_ID || 'ai-studio-e57d33e3-9092-46bd-9c18-ac19c9a8b67e';
        const projectId = 'cleancore-491216';
        const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents/users/${userId}`;

        const res = await fetch(firestoreUrl, {
          headers: {
            'Authorization': `Bearer ${idToken}`
          }
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          const errMsg = errData.error?.message || 'Failed to verify session status.';
          return NextResponse.json(
            { error: `Unauthorized session: ${errMsg}` },
            { status: res.status }
          );
        }

        const docData = await res.json();
        const fields = docData.fields || {};

        const email = fields.email?.stringValue || '';
        const tier = fields.tier?.stringValue || 'pilot';
        const status = fields.status?.stringValue || 'pending';
        
        const transformationsUsed = fields.transformationsUsed?.integerValue 
          ? parseInt(fields.transformationsUsed.integerValue, 10) 
          : 0;
        const transformationsLimit = fields.transformationsLimit?.integerValue 
          ? parseInt(fields.transformationsLimit.integerValue, 10) 
          : 5;

        const isSonny = email === 'sonny.frenzel@googlemail.com' || email === 'sonny.frenzel@gmail.com';
        const isEnterprise = tier === 'enterprise' || isSonny;

        if (!isEnterprise) {
          if (status !== 'approved') {
            return NextResponse.json(
              { error: 'Your beta pilot account is currently pending admin approval.' },
              { status: 403 }
            );
          }
          if (transformationsUsed > transformationsLimit) {
            return NextResponse.json(
              { error: `Transformation limit reached! Your pilot plan allows a maximum of ${transformationsLimit} free transformations. Please upgrade or configure your own Gemini API key in settings.` },
              { status: 403 }
            );
          }
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('Quota check validation error:', message);
        return NextResponse.json(
          { error: `Internal quota validation failed: ${message}` },
          { status: 500 }
        );
      }
    }

    // Use BYOK key if provided, otherwise fall back to server key.
    const ai = customApiKey
      ? new GoogleGenAI({ apiKey: customApiKey })
      : getDefaultAI();

    if (!ai) {
      return NextResponse.json(
        {
          error:
            'Gemini API is not configured. Please set GEMINI_API_KEY in your environment or provide a custom API key in your profile.',
        },
        { status: 500 },
      );
    }

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
    console.error('Gemini API route error:', message);

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
