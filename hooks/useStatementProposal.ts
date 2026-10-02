import { useCallback, useEffect, useState } from 'react';
import { sha256Hex } from '@/lib/artefact-digest';
import type { ProposalView, StatementAvailability } from '@/lib/statement-proposal';

/**
 * The model's business sentences for the signed source — roadmap 17.10.
 *
 * Reads what is stored and applies it to the source; asks the model only when
 * `request` is called, which only a button does. Opening the stage never costs
 * a model call.
 */
export interface StatementProposalState {
  /** Null until the stored proposal has been read. */
  view: ProposalView | null;
  /** A request is running. */
  requesting: boolean;
  /** Why the last request produced nothing, in one sentence. Null otherwise. */
  message: string | null;
  request: () => void;
}

export function useStatementProposal(
  projectId: string | null,
  source: string | null,
  availability: StatementAvailability | null,
): StatementProposalState {
  const [held, setHeld] = useState<{ key: string; view: ProposalView | null }>({ key: '', view: null });
  const [requesting, setRequesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const key = projectId && source ? `${projectId}|${sha256Hex(source)}` : '';

  useEffect(() => {
    if (!key || !projectId || !source) return;
    let cancelled = false;
    (async () => {
      const [lib, client] = await Promise.all([
        import('@/lib/statement-proposal'),
        import('@/lib/statement-proposal-client'),
      ]);
      const record = await client.fetchStatementProposal(projectId);
      if (cancelled) return;
      // A proposal requested and answered while this read was under way is newer
      // than what the read found; the read does not overwrite it (QA slice review
      // of f03c6c53294a, 19ffd321c29a).
      setHeld((prev) => (prev.key === key ? prev : { key, view: lib.applyStatementProposal(source, record) }));
    })().catch(() => {
      // Nothing to show is the evidence alone, which is what the page shows anyway.
      if (!cancelled) setHeld((prev) => (prev.key === key ? prev : { key, view: null }));
    });
    return () => {
      cancelled = true;
    };
  }, [key, projectId, source]);

  const availabilityKnown = availability?.known === true;
  const keyAvailable = availability?.keyAvailable === true;
  const stageOn = availability?.stages?.statements !== false;

  const request = useCallback(() => {
    if (!projectId || !source || requesting) return;
    setRequesting(true);
    setMessage(null);
    (async () => {
      const [lib, client] = await Promise.all([
        import('@/lib/statement-proposal'),
        import('@/lib/statement-proposal-client'),
      ]);
      const outcome = await client.requestStatementProposal(
        projectId,
        lib.statementProposalContextOf(source),
        availabilityKnown ? { known: true, keyAvailable, stages: { statements: stageOn } } : null,
      );
      if (outcome.ok) {
        setHeld({ key, view: lib.applyStatementProposal(source, outcome.record) });
      } else {
        setMessage(`${outcome.message} ${lib.EVIDENCE_KEPT}`);
      }
    })()
      .catch((err: unknown) => setMessage(err instanceof Error ? err.message : String(err)))
      .finally(() => setRequesting(false));
  }, [projectId, source, requesting, key, availabilityKnown, keyAvailable, stageOn]);

  return {
    view: key && held.key === key ? held.view : null,
    requesting,
    message,
    request,
  };
}
