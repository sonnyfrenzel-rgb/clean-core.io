import React from 'react';
import { UserRound } from 'lucide-react';
import CcAnchor from '@/components/cc/Anchor';
import ProgramStrip, { type StripBand, type StripMark, type StripTick } from './ProgramStrip';

/**
 * What a tester checks by hand — proposal A, Testing, section three.
 *
 * Straight from the engine's coverage report (`assessCoverage`): one row per
 * kind of construct its detectors do not judge, with how many there are and
 * the first line, then the strip that shows where in the program they sit
 * among the findings and routines. A generated test cannot stand in for a
 * person at any of these places, and the section says so rather than leaving
 * the reader to assume the suite covers them.
 */
export interface HandCheckGap {
  label: string;
  count: number;
  firstLine: number;
  why?: string;
}

export default function HandChecks({
  gaps,
  strip,
  noSource,
}: {
  gaps: HandCheckGap[];
  strip: { lines: number; bands: StripBand[]; ticks: StripTick[]; marks: StripMark[] } | null;
  noSource: boolean;
}) {
  if (noSource) {
    return <p className="m-0 cc-text-cell text-cc-ink-muted">There is no source on the project, so nothing was read and nothing can be listed.</p>;
  }
  return (
    <>
      {gaps.length === 0 ? (
        <p className="m-0 cc-text-cell text-cc-ink-muted">
          Every construct in the source falls inside what the engine’s detectors judge. That is the boundary of what it
          checked, not a promise that the suite covers everything.
        </p>
      ) : (
        <ul data-hand-checks="" className="m-0 grid list-none gap-3 p-0">
          {gaps.map((g) => (
            <li
              key={`${g.label}-${g.firstLine}`}
              className="flex items-center gap-3 rounded-cc-row border border-l-4 border-cc-warning-border border-l-cc-warning-line bg-cc-surface px-3 py-3"
            >
              <UserRound size={16} aria-hidden={true} className="shrink-0 text-cc-ink" />
              <span className="min-w-0 flex-1">
                <span className="block cc-text-cell font-bold text-cc-ink">
                  {g.count} × {g.label.charAt(0).toLowerCase() + g.label.slice(1)}
                </span>
                <span className="block cc-text-meta text-cc-ink-muted">no generated test can stand in for a person here</span>
              </span>
              <CcAnchor label={`Source line ${g.firstLine}`}>{`L${g.firstLine}`}</CcAnchor>
            </li>
          ))}
        </ul>
      )}
      {strip ? (
        <div className="mt-4">
          <ProgramStrip {...strip} />
        </div>
      ) : null}
    </>
  );
}
