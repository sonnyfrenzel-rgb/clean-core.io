'use client';

import { useMemo } from 'react';
import { anchorNarrative } from '@/lib/abap/narrative-anchors';
import type { EvidenceFinding } from '@/lib/abap/evidence-model';

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
      <p className="text-slate-655 text-sm leading-relaxed break-words">
        {result.sentences.map((s, i) => (
          <span
            key={i}
            className={
              s.status === 'invalid-anchor'
                ? 'bg-red-50 border-b border-red-300'
                : s.status === 'unevidenced' && contractHonoured
                  ? 'text-slate-400'
                  : undefined
            }
          >
            {s.text}
            {s.anchors.length > 0 && (
              <span className="ml-1 inline-flex flex-wrap gap-1 align-baseline">
                {s.anchors.map((a, j) => (
                  <span
                    key={j}
                    title={a.findingId ? `Finding ${a.findingId}` : 'Cited line range'}
                    className="inline-flex items-center rounded bg-emerald-50 border border-emerald-200 px-1 py-0 font-mono text-[10px] font-bold text-emerald-800"
                  >
                    {a.lineStart}
                    {a.lineEnd !== a.lineStart ? `–${a.lineEnd}` : ''}
                  </span>
                ))}
              </span>
            )}
            {s.status === 'invalid-anchor' && (
              <span className="ml-1 inline-flex items-center rounded bg-red-100 border border-red-300 px-1 py-0 font-mono text-[10px] font-bold text-red-800">
                cites {s.rejected.join(' ')} — no such evidence
              </span>
            )}{' '}
          </span>
        ))}
      </p>

      {contractHonoured ? (
        <p className="mt-3 text-[11px] font-bold text-slate-500">
          <span className="text-slate-900">
            {result.anchoredCount} of {result.totalCount} sentences
          </span>{' '}
          cite a line of this program
          {result.traceabilityRate !== null && ` (${result.traceabilityRate}%)`}
          {result.unevidencedCount > 0 && (
            <span className="text-slate-400">
              {' '}
              · {result.unevidencedCount} uncited, shown greyed
            </span>
          )}
          {result.invalidCount > 0 && (
            <span className="text-red-600">
              {' '}
              · {result.invalidCount} cite evidence that does not exist
            </span>
          )}
        </p>
      ) : (
        <p className="mt-3 text-[11px] font-bold text-slate-400">
          This narrative carries no line citations. Runs created before the citation
          contract, or a model that ignored it — either way, none of it is traced to code.
        </p>
      )}
    </div>
  );
}
