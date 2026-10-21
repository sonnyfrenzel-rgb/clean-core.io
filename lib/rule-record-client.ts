import type { ProcessStateView, StateChoiceInput } from './process-states';
import { confirmOutcomeSentence, confirmProcessStates, readProcessStatesOutcome, type StatesReadOutcome } from './process-states-client';
import { ensureProcessBaseline } from './process-revisions-client';
import { publishProcessStates } from '@/hooks/useProcessStates';
import { rulesReadRefusal, wt } from './workspace-messages';

/**
 * Records rule answers the way the rule register does (`RuleDecisionFlow`):
 * one need revision through `POST /api/projects/{id}/process-states`, Admin SDK
 * only. Revision 1 — the reconstructed process — is asked for first where the
 * server has not built it yet; the call never rebuilds an existing one.
 */
export async function recordRuleChoices(input: {
  projectId: string;
  view: ProcessStateView | null;
  outcome: StatesReadOutcome | null;
  choices: StateChoiceInput[];
}): Promise<{ ok: true; view: ProcessStateView } | { ok: false; text: string; moved: boolean }> {
  const { projectId, outcome, choices } = input;
  let revision = input.view?.revision ?? null;
  if (revision === null) {
    if (!outcome || outcome.ok || outcome.code !== 'no-baseline') {
      return { ok: false, text: rulesReadRefusal(outcome && !outcome.ok ? outcome.code : 'unreachable') || wt('rules.noBaseline'), moved: false };
    }
    const built = await ensureProcessBaseline(projectId);
    const fresh = built.ok ? await readProcessStatesOutcome(projectId) : null;
    if (!fresh || !fresh.ok) return { ok: false, text: wt('rules.noBaseline'), moved: false };
    publishProcessStates(projectId, fresh.view);
    revision = fresh.view.revision;
  }
  const result = await confirmProcessStates(projectId, revision, choices);
  if (result.ok) {
    publishProcessStates(projectId, result.view);
    return { ok: true, view: result.view };
  }
  return { ok: false, text: confirmOutcomeSentence(result), moved: result.code === 'revision-moved' };
}
