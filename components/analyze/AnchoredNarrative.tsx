'use client';

import { useMemo } from 'react';
import { anchorNarrative } from '@/lib/abap/narrative-anchors';
import type { EvidenceFinding } from '@/lib/abap/evidence-model';
import CcAnchor from '@/components/cc/Anchor';
import CcWhyPopover from '@/components/cc/WhyPopover';

/**
 * The model's prose, with each sentence marked by whether it points at code.
 *
 * The narrative is the one part of a run the signature deliberately does not
 * cover — it is free text and cannot carry an evidence guarantee. That makes it
 * the part most easily mistaken for one, because it reads like the rest of the
 * report and sits next to numbers that are signed.
 *
 * So it says which sentences are sourced. A sentence citing a finding shows the
 * lines it came from. A sentence citing nothing is left in place and labelled
 * unevidenced — removing it would produce a narrative that reads as fully
 * sourced with its gaps invisible, which is worse than a visible gap. A sentence
 * citing a finding that does not exist is called out separately and in a
 * different colour: a missing citation is honest, an invented one is not, and
 * flattening them into one category hides the serious case inside the mild one.
 */
export default function AnchoredNarrative({
  text,
  findings,
  totalLines,
  className = '',
}: {
  text: string;
  findings: EvidenceFinding[];
  totalLines: number;
  className?: string;
}) {
  const result = useMemo(
    () => anchorNarrative(text, findings, totalLines),
    [text, findings, totalLines],
  );

  if (!text) return null;

  // No anchors at all means the model ignored the citation contract, or this run
  // predates it. Say that rather than showing a 0 % that reads like a verdict on
  // the code.
  const contractHonoured = result.anchoredCount > 0 || result.invalidCount > 0;

  return (
    <div className={className}>
      <p className="cc-text-body text-cc-ink break-words">
        {result.sentences.map((s, i) => (
          <span
            key={i}
            className={
              s.status === 'invalid-anchor'
                ? 'bg-cc-error-bg border-b border-cc-error'
                : s.status === 'unevidenced' && contractHonoured
                  ? 'text-cc-ink-muted'
                  : undefined
            }
          >
            {s.text}
            {s.anchors.length > 0 && (
              <span className="ml-1 inline-flex flex-wrap gap-1 align-baseline">
                {s.anchors.map((a, j) => (
                  <CcAnchor
                    key={j}
                    label={`${a.findingId ? `Finding ${a.findingId}` : 'Cited line range'}, line ${a.lineStart}${a.lineEnd !== a.lineStart ? ` to ${a.lineEnd}` : ''}`}
                  >
                    L{a.lineStart}
                    {a.lineEnd !== a.lineStart ? `–${a.lineEnd}` : ''}
                  </CcAnchor>
                ))}
              </span>
            )}
            {s.status === 'invalid-anchor' && (
              <span className="ml-1 font-cc-mono text-[12px] font-semibold text-cc-error">
                cites {s.rejected.join(' ')} — no such evidence
              </span>
            )}{' '}
          </span>
        ))}
      </p>

      {contractHonoured ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-1 cc-text-meta text-cc-ink-muted">
          <span className="text-cc-ink">
            {result.anchoredCount} of {result.totalCount} sentences
          </span>{' '}
          cite a line of this program
          {result.traceabilityRate !== null && ` (${result.traceabilityRate}%)`}
          {result.unevidencedCount > 0 && (
            <span>
              {' '}
              · {result.unevidencedCount} uncited, shown greyed
            </span>
          )}
          {result.invalidCount > 0 && (
            <span className="text-cc-error">
              {' '}
              · {result.invalidCount} cite evidence that does not exist
            </span>
          )}
          <CcWhyPopover
            subject={`Traceability, ${result.anchoredCount} of ${result.totalCount} sentences`}
            provenance="reconstructed"
            basis="Each sentence of the model's summary is checked for a line or finding citation, and each citation against the findings of this run. The summary itself is not signed."
            evidence="The line anchors after each sentence."
          />
        </div>
      ) : (
        <p className="mt-3 cc-text-meta text-cc-ink-muted">
          This narrative carries no line citations. Runs created before the citation
          contract, or a model that ignored it — either way, none of it is traced to code.
        </p>
      )}
    </div>
  );
}
