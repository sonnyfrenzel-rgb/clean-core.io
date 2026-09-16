import { getAuth } from '@/lib/firebase';
import type { ModelStage } from '@/lib/model-stages';
import type { ModelReceipt } from '@/lib/model-receipt';

/**
 * Client-side Gemini helper.
 * This module does NOT import @google/genai — all AI calls are proxied
 * through the server-side /api/gemini route so that API keys never
 * reach the browser bundle.
 *
 * Roadmap 1.2 — a caller that belongs to one of the five model stages names it.
 * The server then honours the account's per-stage switch, and the error it
 * returns carries a code the stage can turn into "not generated, because…"
 * instead of a failure. The glossary chatbot and the key test pass no stage:
 * neither is a stage of the workflow.
 */

export interface GeminiResult {
  text: string;
  /**
   * The server's record that the call happened (`lib/model-receipt.ts`).
   *
   * `null` when the deployment could not mint one. A caller that carries it to
   * `/api/runs/create` gets a run that names the model; a caller that does not,
   * or cannot, gets a run that says the narrative's origin was not established.
   * Neither fails.
   */
  receipt: ModelReceipt | null;
}

/**
 * The same call as `callGemini`, with the receipt the proxy issued.
 *
 * Only the Analyze stage needs it today, because only that stage's output
 * becomes part of a signed run. The other four stages write into the project
 * document, which no signature covers, so a receipt there would attest to
 * nothing.
 */
export async function callGeminiWithReceipt(
  prompt: string,
  modelName: string = 'gemini-3-flash-preview',
  jsonResponse: boolean = false,
  stage?: ModelStage,
  /**
   * Roadmap 1.8 — lets a caller stop *waiting*. It does not stop the call: the
   * route below runs to completion on the server whatever this browser does,
   * and every screen that offers a cancel has to say so (`CANCEL_REACH` in
   * `lib/analysis-run.ts`).
   */
  signal?: AbortSignal,
): Promise<GeminiResult> {
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
    ...(signal ? { signal } : {}),
    body: JSON.stringify({
      prompt,
      model: modelName,
      jsonResponse,
      ...(stage ? { stage } : {}),
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
  return { text: data.text, receipt: data.receipt ?? null };
}

export async function callGemini(
  prompt: string,
  modelName: string = 'gemini-3-flash-preview',
  jsonResponse: boolean = false,
  stage?: ModelStage,
  signal?: AbortSignal,
): Promise<string> {
  return (await callGeminiWithReceipt(prompt, modelName, jsonResponse, stage, signal)).text;
}
