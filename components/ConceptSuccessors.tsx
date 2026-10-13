'use client';

import React, { useMemo } from 'react';
import { CcTag } from '@/components/cc/Tag';
import {
  BACKING_LABEL,
  CONCEPT_SUCCESSOR_ATTRIBUTION,
  CONCEPT_SUCCESSOR_SOURCE,
  conceptSuccessorsOf,
} from '@/lib/concept-successors';

/**
 * Concept successors (DSAG guideline review B2): the classic concepts the code
 * uses for which ABAP Cloud has another one — application log, background job,
 * mail, BOPF, table maintenance — each with the successor, what SAP's data
 * says about the old objects today, and how far that data backs the row.
 *
 * Shown in Design and in Transformation's quality tips. Read from the source
 * in the browser with `lib/concept-successors.ts`; not engine evidence, not
 * part of the signed run, and never a verdict that the classic use must go.
 * Renders nothing when the code shows none of the concepts.
 */
export default function ConceptSuccessors({ source, place }: { source: string; place: 'design' | 'transformation' }) {
  const hits = useMemo(() => conceptSuccessorsOf(source), [source]);
  if (hits.length === 0) return null;
  const titleId = `concept-successors-${place}`;
  return (
    <section
      aria-labelledby={titleId}
      data-concept-successors={place}
      className="rounded-cc-card border border-cc-line bg-cc-surface p-4 shadow-cc"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id={titleId} className="m-0 cc-text-h2 text-cc-ink">
          Concepts ABAP Cloud replaces
        </h2>
        <CcTag>{CONCEPT_SUCCESSOR_SOURCE}</CcTag>
      </div>
      <p className="m-0 mt-1 cc-text-cell text-cc-ink-muted">
        The code uses classic concepts for which ABAP Cloud has a successor. Classic use is not wrong in itself —
        each row says what SAP&apos;s data says about it today. Where the code moves to ABAP Cloud, build on the
        successor instead of a wrapper around the old concept.
      </p>
      <ul className="m-0 mt-3 grid list-none gap-2 p-0">
        {hits.map(({ row, found }) => (
          <li key={row.key} data-concept-successor={row.key} className="rounded-cc-row border border-cc-line p-3">
            <p className="m-0 cc-text-cell text-cc-ink">
              <b className="font-semibold">{row.area}:</b> {row.classic} → <b className="font-semibold">{row.successor}</b>
              {row.successorObjects.length > 0 ? (
                <span className="text-cc-ink-muted"> ({row.successorObjects.map((o, i) => (
                  <React.Fragment key={o}>{i > 0 ? ', ' : ''}<span className="font-cc-mono">{o}</span></React.Fragment>
                ))})</span>
              ) : null}
            </p>
            <p className="m-0 mt-1 cc-text-meta text-cc-ink-muted">
              In the code:{' '}
              {found.map((f, i) => (
                <React.Fragment key={f.name}>
                  {i > 0 ? ', ' : ''}
                  <span className="font-cc-mono">{f.name}</span> (line <span className="font-cc-mono">{f.line}</span>)
                </React.Fragment>
              ))}
            </p>
            <p className="m-0 mt-1 cc-text-meta text-cc-ink-muted">{row.levelToday}</p>
            <p data-concept-backing={row.backing} className="m-0 mt-1 cc-text-meta text-cc-ink-muted">
              {BACKING_LABEL[row.backing]} · Source: DSAG ABAP guideline, {row.guide.file} § {row.guide.heading}
            </p>
          </li>
        ))}
      </ul>
      <p className="m-0 mt-3 cc-text-meta text-cc-ink-muted">
        {CONCEPT_SUCCESSOR_ATTRIBUTION} Read from the source in your browser; not engine evidence and not part of the
        signed run.
      </p>
    </section>
  );
}
