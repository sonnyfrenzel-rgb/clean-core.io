import { getAuth } from '@/lib/firebase';
import { callGeminiWithReceipt } from '@/lib/gemini';
import { NAMING_GEMINI_MODEL } from '@/lib/constants';
import {
  NAMING_STAGE,
  isProcessNamingRecord,
  runNamingRequest,
  type NamingAvailability,
  type NamingContext,
  type NamingRequestOutcome,
  type ProcessNamingRecord,
} from '@/lib/process-naming';

/**
 * The browser half of roadmap 2.4 — the two calls 2.5 makes.
 *
 * ```ts
 * const context = namingContextOf(project.legacyCode);          // the skeleton, once
 * const record  = await fetchProcessNaming(projectId);          // stored names, or null
 * const view    = applyNaming(context, record);                 // complete either way
 *
 * // "Name steps in business language":
 * const outcome = await requestProcessNaming(projectId, context, availability);
 * const next    = outcome.ok
 *   ? applyNaming(context, outcome.record)
 *   : applyNaming(context, record, outcome.absence);            // technical names + the reason
 * ```
 *
 * Neither function throws for an ordinary outcome. No key, a switched-off
 * stage, a refused receipt and a source that moved are all states the map
 * shows beside the technical names, not errors.
 */

/** The route, in one spelling. */
export function processNamingPath(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/process-naming`;
}

async function authHeader(): Promise<Record<string, string>> {
  const user = getAuth().currentUser;
  if (!user) return {};
  return { Authorization: `Bearer ${await user.getIdToken()}` };
}

/** The stored naming for a project, or null when there is none or it cannot be read. */
export async function fetchProcessNaming(projectId: string): Promise<ProcessNamingRecord | null> {
  try {
    const res = await fetch(processNamingPath(projectId), { headers: await authHeader() });
    if (!res.ok) return null;
    const body = (await res.json()) as { record?: unknown };
    return isProcessNamingRecord(body.record) ? body.record : null;
  } catch {
    return null;
  }
}

/**
 * Ask the model for names and have the server validate and store them.
 *
 * `availability` is `useModelAvailability()`; when it already knows there is no
 * key or the stage is off, no call is made at all.
 */
export async function requestProcessNaming(
  projectId: string,
  context: NamingContext,
  availability?: NamingAvailability | null,
  signal?: AbortSignal,
): Promise<NamingRequestOutcome> {
  return runNamingRequest(
    context,
    {
      callModel: async (prompt) => {
        const { text, receipt } = await callGeminiWithReceipt(prompt, NAMING_GEMINI_MODEL, true, NAMING_STAGE, signal);
        return { text, receipt };
      },
      store: async (submission) => {
        const res = await fetch(processNamingPath(projectId), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
          body: JSON.stringify(submission),
          ...(signal ? { signal } : {}),
        });
        const body = (await res.json().catch(() => ({}))) as { record?: unknown; error?: string };
        if (res.ok && isProcessNamingRecord(body.record)) return { ok: true, record: body.record };
        return { ok: false, status: res.status, error: body.error || `The names could not be stored (${res.status}).` };
      },
    },
    availability,
  );
}
