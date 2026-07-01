import { getAuth } from '@/lib/firebase';

/**
 * Client-side Gemini helper.
 * This module does NOT import @google/genai — all AI calls are proxied
 * through the server-side /api/gemini route so that API keys never
 * reach the browser bundle.
 */

export async function callGemini(
  prompt: string,
  modelName: string = 'gemini-3-flash-preview',
  jsonResponse: boolean = false,
): Promise<string> {
  let userId: string | undefined;
  let idToken: string | undefined;

  try {
    const auth = getAuth();
    if (auth.currentUser) {
      userId = auth.currentUser.uid;
      idToken = await auth.currentUser.getIdToken();
    }
  } catch (err) {
    console.warn('Firebase Auth context not available in callGemini:', err);
  }

  const response = await fetch('/api/gemini', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {}),
    },
    body: JSON.stringify({
      prompt,
      model: modelName,
      jsonResponse,
      userId,
      idToken,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(
      errorBody.error ||
        `Gemini API request failed with status ${response.status}`,
    );
  }

  const data = await response.json();
  return data.text;
}
