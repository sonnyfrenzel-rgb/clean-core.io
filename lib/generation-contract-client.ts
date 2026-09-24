import { getAuth } from 'firebase/auth';
import type { ArchitectureContract } from './architecture-contract';
import type { GenerationBinding, GenerationDecision } from './generation-direction';

/**
 * The browser's half of roadmap 8.3: ask the server which contract governs this
 * project, and record which contract a generated stand followed.
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
  return { contract: json.contract ?? null, decision: json.decision };
}

/**
 * Record the contract a generated stand was computed against.
 *
 * The server rebuilds the contract and writes its own fingerprint; this sends
 * the package and nothing else. It returns the binding or an error sentence —
 * the caller stores neither the code nor a green stage when it failed, so a
 * stand cannot exist without the contract it followed.
 */
export async function recordGenerationBinding(
  projectId: string,
  generatedCode: string,
  /** The fingerprint of the contract the stand was generated from — `fetchGenerationDecision().contract`. */
  expectedContractFingerprint: string,
): Promise<{ ok: true; binding: GenerationBinding } | { ok: false; error: string }> {
  let res: Response;
  try {
    res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/contract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ generatedCode, expectedContractFingerprint }),
    });
  } catch {
    return { ok: false, error: 'The contract this generation followed could not be recorded.' };
  }
  const body = (await res.json().catch(() => null)) as { binding?: GenerationBinding; error?: string } | null;
  if (!res.ok || !body?.binding) {
    return {
      ok: false,
      error: body?.error || 'The contract this generation followed could not be recorded.',
    };
  }
  return { ok: true, binding: body.binding };
}
