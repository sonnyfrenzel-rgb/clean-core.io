'use client';

import { CircleAlert } from 'lucide-react';
import CcButton from '@/components/cc/Button';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { anchorsWords } from '@/lib/process-documentation';
import { CONTRADICTION_LABEL, type StatementContradiction } from '@/lib/statement-contradiction';
import {
  STATEMENT_COST_LINE,
  STATEMENT_COST_LINE_BYOK,
  type CheckedProposal,
  type ProposalView,
} from '@/lib/statement-proposal';

/**
 * Proposal on top, evidence beneath, contradiction marked — roadmap 17.10,
 * `DESIGN.md` §5.10.
 *
 * Three pieces, each small enough to stand in a table cell:
 *
 *   - `StatementProposalPanel` — the one button that asks the model, with the
 *     line that says what it costs *before* it is pressed (§2.8), and the state
 *     of the stored proposal. Only the owner gets the button; an invited reader
 *     sees what the owner asked for and nothing to press.
 *   - `StatementPair` — the model's sentence in the reading size with its chip
 *     *Model proposal*, the engine's sentence beneath it one step smaller with
 *     its chip *Reconstructed*. The evidence is never dropped for the proposal:
 *     the reader always sees what the code proves under what the model says.
 *   - `ContradictionMark` — a quiet rule in the margin and one line of words,
 *     the reason one action deeper (§2.11). Not a chip: a contradiction is not
 *     a provenance, and it must not look like one (§4.1).
 *
 * Without a proposal nothing here renders, and the stage shows the engine's
 * sentences exactly as before — no empty box, no error tone.
 */

export function ContradictionMark({ contradiction }: { contradiction: StatementContradiction }) {
  const contradicts = contradiction.verdict === 'contradicts';
  return (
    <details
      data-statement-contradiction={contradiction.verdict}
      data-statement-contradiction-rule={contradiction.rule}
      className={
        contradicts
          ? 'mt-1 border-l-2 border-cc-warning-line pl-2 text-[12px] text-cc-warning'
          : 'mt-1 border-l-2 border-cc-neutral pl-2 text-[12px] text-cc-neutral'
      }
    >
      <summary className="cursor-pointer font-semibold">
        <CircleAlert size={14} aria-hidden={true} className="mr-1 inline align-[-2px]" />
        {CONTRADICTION_LABEL[contradiction.verdict]}
      </summary>
      <p className="mt-1 text-cc-ink">{contradiction.reason}</p>
      {contradiction.lines.length > 0 && (
        <p className="text-cc-ink-muted">{anchorsWords(contradiction.lines)}</p>
      )}
    </details>
  );
}

export function ProposedStatementLine({ proposal }: { proposal: CheckedProposal }) {
  return (
    <div data-statement-proposed={proposal.id}>
      <p className="text-[13px] text-cc-ink">
        {proposal.text} <CcProvenanceChip value={proposal.provenance} />
      </p>
      {proposal.contradiction && <ContradictionMark contradiction={proposal.contradiction} />}
    </div>
  );
}

/** One element: the model's sentence on top, the engine's beneath it as the evidence. */
export function StatementPair({ proposal, evidence }: { proposal: CheckedProposal; evidence: string | null }) {
  return (
    <div data-statement-pair="">
      <ProposedStatementLine proposal={proposal} />
      {evidence ? (
        <p data-statement-evidence="" className="mt-1 text-[12px] text-cc-ink-muted">
          <CcProvenanceChip value="reconstructed" /> {evidence}
        </p>
      ) : (
        <p data-statement-evidence="none" className="mt-1 text-[12px] text-cc-ink-muted">
          The engine formed no sentence at these lines.
        </p>
      )}
    </div>
  );
}

export interface StatementProposalPanelProps {
  view: ProposalView | null;
  /** The owner may ask; an invited reader may not. */
  canRequest: boolean;
  /** The account uses its own Gemini key. */
  byok: boolean;
  requesting: boolean;
  message: string | null;
  onRequest: () => void;
  /** The cost line beside the button; `false` where a card says the cost once for all its proposals (roadmap 3.0.7). */
  costLine?: boolean;
}

function summaryOf(view: ProposalView): string {
  const { statements, discarded, contradicts, unsupported } = view.counts;
  const parts = [`${statements} ${statements === 1 ? 'sentence' : 'sentences'} proposed by the model`];
  if (view.origin) parts[0] += ` (${view.origin.modelId}${view.proposedAt ? `, ${view.proposedAt.slice(0, 10)}` : ''})`;
  if (discarded) parts.push(`${discarded} dropped by the check against the code`);
  if (contradicts) parts.push(`${contradicts} ${contradicts === 1 ? 'contradicts' : 'contradict'} the evidence`);
  if (unsupported) parts.push(`${unsupported} not supported by the code`);
  return parts.join(' · ');
}

export function StatementProposalPanel({ view, canRequest, byok, requesting, message, onRequest, costLine = true }: StatementProposalPanelProps) {
  const proposed = view?.state === 'proposed';
  // A reader with nothing stored sees nothing at all: there is no action for
  // them here, and an absence is not news.
  if (!canRequest && !proposed) return null;
  return (
    <div data-statement-proposal-panel={view?.state ?? 'loading'} className="mb-4 border-l-2 border-cc-line pl-3">
      {proposed && view && <p className="text-[13px] text-cc-ink">{summaryOf(view)}</p>}
      {view?.notice && <p className="text-[13px] text-cc-ink-muted">{view.notice}</p>}
      {message && <p data-statement-proposal-message="" className="text-[13px] text-cc-ink-muted">{message}</p>}
      {canRequest && (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <CcButton variant={proposed ? 'ghost' : 'secondary'} busy={requesting} onClick={onRequest}>
            {proposed ? 'Ask the model again' : 'Propose business sentences'}
          </CcButton>
          {costLine ? (
            <span data-statement-cost="" className="text-[12px] text-cc-ink-muted">
              {byok ? STATEMENT_COST_LINE_BYOK : STATEMENT_COST_LINE}
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}
