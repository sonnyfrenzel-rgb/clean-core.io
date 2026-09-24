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
 */
export async function fetchGenerationDecision(projectId: string): Promise<ContractAnswer> {
  const refusal = (sentence: string, remedy: string): ContractAnswer => ({
    contract: null,
    decision: { ok: false, code: 'no-contract', sentence, remedy },
    generation: null,
  });
  let res: Response;
  try {
    res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/contract`, {
      headers: await authHeader(),
    });
  } catch {
    return refusal(
      'The architecture contract of this project could not be read, so there is no target to generate against. Nothing was generated.',
      'Check the connection and open this stage again.',
    );
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    return refusal(
      body?.error || 'The architecture contract of this project could not be read. Nothing was generated.',
      'Open the analysis, make sure a run and a target deployment are bound, and come back.',
    );
  }
  const json = (await res.json().catch(() => null)) as ContractAnswer | null;
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
          },
        }
      : null;
  return { contract: json.contract ?? null, decision: json.decision, generation };
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
  },
): Promise<{ ok: true; fields: StoredGeneration } | { ok: false; error: string }> {
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
  const body = (await res.json().catch(() => null)) as { fields?: StoredGeneration; error?: string } | null;
  if (res.status >= 500) {
    throw new CommandAnswerLostError(
      `The server did not finish answering (${res.status}), so it is not known whether this generation was stored.`,
    );
  }
  if (!res.ok || !body?.fields) {
    return { ok: false, error: body?.error || 'This generation could not be stored.' };
  }
  return { ok: true, fields: body.fields };
}
