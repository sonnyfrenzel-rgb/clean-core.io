import { getAuth } from 'firebase/auth';
import type { ArchitectureContract } from './architecture-contract';
import type { GenerationBinding, GenerationDecision } from './generation-direction';
import type { GenerationInputs } from './generation-revision';
import type { GeneratedTestSuite } from './transformation-artefacts';
import { CommandAnswerLostError } from './project-command-client';

/**
 * The browser's half of roadmap 8.3: ask the server which contract governs this
 * project, and store a generated stand through the server (3.0.11).
 *
 * Two functions rather than two `fetch` calls in the page, so that the stage
 * has one place where the direction comes from and a spec can name it. The
 * judgement is all on the server (`app/api/projects/[projectId]/contract`) —
 * nothing here decides a track, and nothing here may.
 */

async function authHeader(): Promise<Record<string, string>> {
  const token = await getAuth().currentUser?.getIdToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface ContractAnswer {
  contract: ArchitectureContract | null;
  decision: GenerationDecision;
  /**
   * Roadmap 3.0.11: the state the generation is computed from — a token the
   * store call hands back, and the prompt inputs that token covers. `null`
   * whenever nothing may be generated.
   */
  generation: { token: string; inputs: GenerationInputs } | null;
}

/**
 * The contract and what may be generated against it.
 *
 * A transport failure is **not** answered with a track. It comes back as a
 * refusal, because the alternative — falling back to the project's route field
 * — is the defect this step removes, and a network hiccup is not a licence to
 * guess the most permissive target.
 *
 * `signal` is the generation's: *Cancel* while the contract is read ends the
 * read, and the caller gets an `AbortError` — a cancel, never a refusal the
 * screen would show as the contract's answer (QA leftovers of hotfix 2).
 */
export async function fetchGenerationDecision(projectId: string, signal?: AbortSignal): Promise<ContractAnswer> {
  const cancelled = () => Object.assign(new Error('cancelled'), { name: 'AbortError' });
  const refusal = (sentence: string, remedy: string): ContractAnswer => ({
    contract: null,
    decision: { ok: false, code: 'no-contract', sentence, remedy },
    generation: null,
  });
  let res: Response;
  try {
    // `for=generation`: only a generation is answered with a token and the
    // PLATFORM KNOWLEDGE block (roadmap 3.0.12).
    res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/contract?for=generation`, {
      headers: await authHeader(),
      signal,
    });
  } catch {
    if (signal?.aborted) throw cancelled();
    return refusal(
      'The architecture contract of this project could not be read, so there is no target to generate against. Nothing was generated.',
      'Check the connection and open this stage again.',
    );
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    if (signal?.aborted) throw cancelled();
    return refusal(
      body?.error || 'The architecture contract of this project could not be read. Nothing was generated.',
      'Open the analysis, make sure a run and a target deployment are bound, and come back.',
    );
  }
  const json = (await res.json().catch(() => null)) as ContractAnswer | null;
  if (signal?.aborted) throw cancelled();
  if (!json?.decision) {
    return refusal(
      'The contract endpoint answered with something this stage cannot read, so no target was established. Nothing was generated.',
      'Try the generation again.',
    );
  }
  const g = json.generation;
  const generation =
    g && typeof g.token === 'string' && g.inputs && typeof g.inputs === 'object'
      ? {
          token: g.token,
          inputs: {
            legacyCode: typeof g.inputs.legacyCode === 'string' ? g.inputs.legacyCode : '',
            solutionDesign: typeof g.inputs.solutionDesign === 'string' ? g.inputs.solutionDesign : '',
            analysis: typeof g.inputs.analysis === 'string' ? g.inputs.analysis : '',
            context: {
              text: typeof g.inputs.context?.text === 'string' ? g.inputs.context.text : '',
              rules: typeof g.inputs.context?.rules === 'string' ? g.inputs.context.rules : 'none',
              decision: typeof g.inputs.context?.decision === 'string' ? g.inputs.context.decision : 'none',
              requirements: typeof g.inputs.context?.requirements === 'string' ? g.inputs.context.requirements : 'none',
              decisions: decisionsOf(g.inputs.context?.decisions),
            },
          },
        }
      : null;
  return { contract: json.contract ?? null, decision: json.decision, generation };
}

const ANSWERS = new Set(['keep', 'change', 'drop', 'clarify']);

/** The owner's rule answers as the server read them — shape-checked, anything else dropped. */
function decisionsOf(raw: unknown): NonNullable<GenerationInputs['context']['decisions']> {
  if (!Array.isArray(raw)) return [];
  const out: NonNullable<GenerationInputs['context']['decisions']> = [];
  for (const r of raw.slice(0, 2_000)) {
    if (!r || typeof r !== 'object' || typeof (r as { id?: unknown }).id !== 'string') continue;
    const { id, answer, note } = r as { id: string; answer?: unknown; note?: unknown };
    out.push({
      id,
      answer: typeof answer === 'string' && ANSWERS.has(answer) ? (answer as 'keep' | 'change' | 'drop' | 'clarify') : null,
      note: typeof note === 'string' ? note : null,
    });
  }
  return out;
}

/** What the server stored, as it stored it. */
export interface StoredGeneration {
  generatedCode: string;
  testSuite: GeneratedTestSuite;
  status: string;
  generationBinding: GenerationBinding;
}

/**
 * Store a generated stand — code, test suite, status and the binding to its
 * contract — through the server (roadmap 3.0.11).
 *
 * The server writes all four in one transaction, and only if the project is
 * still at `generationToken`, the state `fetchGenerationDecision()` read before
 * the model was asked. A refusal (4xx) comes back as `{ ok: false, error }` and
 * means nothing was written. No answer, or a 5xx, throws
 * `CommandAnswerLostError`: the transaction may have committed, so the caller
 * reads the project again instead of saying "nothing was saved".
 */
export async function storeGeneration(
  projectId: string,
  stand: {
    generatedCode: string;
    testSuite: GeneratedTestSuite;
    /** `fetchGenerationDecision().contract.fingerprint`. */
    expectedContractFingerprint: string;
    /** `fetchGenerationDecision().generation.token`. */
    generationToken: string;
    /** Roadmap 3.0.12, step E: how the package was made (`lib/transformation/generation-record.ts`). */
    generation?: unknown;
    /**
     * Roadmap 3.0.17 (AI Act Art. 50(2)): the receipt of the generation's last
     * model call. The server records provider and model from it only when it
     * verifies; without one the package is marked "provider and model not recorded".
     */
    modelReceipt?: unknown;
  },
): Promise<{ ok: true; fields: StoredGeneration } | { ok: false; error: string; code?: string }> {
  let res: Response;
  try {
    res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/contract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(stand),
    });
  } catch {
    throw new CommandAnswerLostError('No answer came back from the server, so it is not known whether this generation was stored.');
  }
  const body = (await res.json().catch(() => null)) as { fields?: StoredGeneration; error?: string; code?: string } | null;
  if (res.status >= 500) {
    throw new CommandAnswerLostError(
      `The server did not finish answering (${res.status}), so it is not known whether this generation was stored.`,
    );
  }
  // A success whose answer did not arrive whole says nothing about the write:
  // it is the lost-answer case, not a refusal.
  if (res.ok && !body?.fields) {
    throw new CommandAnswerLostError('The answer to this generation arrived incomplete, so it is not known whether it was stored.');
  }
  if (!res.ok || !body?.fields) {
    return {
      ok: false,
      error: body?.error || 'This generation could not be stored.',
      ...(typeof body?.code === 'string' ? { code: body.code } : {}),
    };
  }
  return { ok: true, fields: body.fields };
}
