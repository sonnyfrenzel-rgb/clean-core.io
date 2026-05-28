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
    } = body as {
      prompt: string;
      model?: string;
      jsonResponse?: boolean;
      customApiKey?: string;
    };

    if (!prompt) {
      return NextResponse.json(
        { error: 'Missing required field: prompt' },
        { status: 400 },
      );
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
