import { getAuth } from '@/lib/firebase';
import { callGeminiWithReceipt } from '@/lib/gemini';
import { PRODUCT_GEMINI_MODEL } from '@/lib/constants';
import {
  STATEMENT_STAGE,
  isStatementProposalRecord,
  runStatementRequest,
  type StatementAvailability,
  type StatementProposalContext,
  type StatementProposalRecord,
  type StatementRequestOutcome,
} from '@/lib/statement-proposal';

/**
 * The browser half of roadmap 17.10 — the same two calls as the naming stage
 * (`lib/process-naming-client.ts`).
 *
 * The model is the product default, `PRODUCT_GEMINI_MODEL`: it is the one the
 * benchmark of 27.09.2026 measured for Weg B, and the naming stage's lighter
 * model was never measured on sentences.
 *
 * Neither function throws for an ordinary outcome. No key, a switched-off
 * stage, a refused receipt and a source that moved are states the page shows
 * beside the reconstructed sentences, not errors.
 */

export function statementProposalPath(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/statement-proposal`;
}

async function authHeader(): Promise<Record<string, string>> {
  const user = getAuth().currentUser;
  if (!user) return {};
  return { Authorization: `Bearer ${await user.getIdToken()}` };
}

/** The stored proposal for a project, or null when there is none or it cannot be read. */
export async function fetchStatementProposal(projectId: string): Promise<StatementProposalRecord | null> {
  try {
    const res = await fetch(statementProposalPath(projectId), { headers: await authHeader() });
    if (!res.ok) return null;
    const body = (await res.json()) as { record?: unknown };
    return isStatementProposalRecord(body.record) ? body.record : null;
  } catch {
    return null;
  }
}

/** Ask the model for business sentences and have the server validate and store them. */
export async function requestStatementProposal(
  projectId: string,
  context: StatementProposalContext,
  availability?: StatementAvailability | null,
  signal?: AbortSignal,
): Promise<StatementRequestOutcome> {
  return runStatementRequest(
    context,
    {
      callModel: async (prompt) => {
        const { text, receipt } = await callGeminiWithReceipt(prompt, PRODUCT_GEMINI_MODEL, true, STATEMENT_STAGE, signal);
        return { text, receipt };
      },
      store: async (submission) => {
        const res = await fetch(statementProposalPath(projectId), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
          body: JSON.stringify(submission),
          ...(signal ? { signal } : {}),
        });
        const body = (await res.json().catch(() => ({}))) as { record?: unknown; error?: string };
        if (res.ok && isStatementProposalRecord(body.record)) return { ok: true, record: body.record };
        return { ok: false, status: res.status, error: body.error || `The sentences could not be stored (${res.status}).` };
      },
    },
    availability,
  );
}
