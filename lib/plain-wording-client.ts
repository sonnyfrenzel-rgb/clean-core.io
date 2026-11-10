import { getAuth } from '@/lib/firebase';
import { callGeminiWithReceipt } from '@/lib/gemini';
import { PRODUCT_GEMINI_MODEL } from '@/lib/constants';
import {
  PLAIN_WORDING_SHAPE,
  PLAIN_WORDING_STAGE,
  isPlainWordingRecord,
  runPlainWording,
  type PlainItem,
  type PlainScope,
  type PlainWordingRecord,
} from '@/lib/plain-wording';

/**
 * The browser half of the plain wording (roadmap 3.0.20, owner decision 2) —
 * the same two calls as the business sentences (`lib/statement-proposal-client.ts`).
 * Neither throws: whatever happens, the engine sentences stand.
 */

export function plainWordingPath(projectId: string, scope?: PlainScope): string {
  const base = `/api/projects/${encodeURIComponent(projectId)}/plain-wording`;
  return scope ? `${base}?scope=${scope}` : base;
}

async function authHeader(): Promise<Record<string, string>> {
  const user = getAuth().currentUser;
  if (!user) return {};
  return { Authorization: `Bearer ${await user.getIdToken()}` };
}

/** The stored rewording of a scope, or null when there is none or it cannot be read. */
export async function fetchPlainWording(projectId: string, scope: PlainScope): Promise<PlainWordingRecord | null> {
  try {
    const res = await fetch(plainWordingPath(projectId, scope), { headers: await authHeader() });
    if (!res.ok) return null;
    const body = (await res.json()) as { record?: unknown };
    return isPlainWordingRecord(body.record) ? body.record : null;
  } catch {
    return null;
  }
}

/** Ask the model to reword these sentences and have the server guard and store what holds. */
export async function requestPlainWording(
  projectId: string,
  scope: PlainScope,
  digest: string,
  items: PlainItem[],
  /** 3.0.21: `automatic` when the product started it by itself on opening (`lib/auto-steps.ts`). */
  opts: { automatic?: boolean } = {},
): Promise<PlainWordingRecord | null> {
  return runPlainWording(scope, digest, items, {
    callModel: async (prompt) => {
      const { text, receipt } = await callGeminiWithReceipt(prompt, PRODUCT_GEMINI_MODEL, true, PLAIN_WORDING_STAGE, undefined, {
        responseShape: PLAIN_WORDING_SHAPE,
        ...(opts.automatic ? { automatic: true } : {}),
      });
      return { text, receipt };
    },
    store: async (submission) => {
      const res = await fetch(plainWordingPath(projectId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify(submission),
      });
      const body = (await res.json().catch(() => ({}))) as { record?: unknown; error?: string };
      if (res.ok && isPlainWordingRecord(body.record)) return { ok: true, record: body.record };
      return { ok: false, status: res.status, error: body.error || `The wording could not be stored (${res.status}).` };
    },
  });
}
