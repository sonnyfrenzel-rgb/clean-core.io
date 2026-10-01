'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { X } from 'lucide-react';
import CcCodeSurface from '@/components/cc/CodeSurface';
import CcIconButton from '@/components/cc/IconButton';
import CcButton from '@/components/cc/Button';
import { CcSeverity, CcCleanCoreLevel } from '@/components/cc/Identifier';
import { codeCardLabel, codeCardLines } from '@/lib/process-map';
import { normaliseSeverity } from '@/lib/severity';
import { calmTitle, type FindingRow } from '@/lib/findings-view';
import type { CloudReadinessGrade } from '@/lib/abap/abcd-classification';
import type { EvidenceFinding } from '@/lib/abap/evidence-model';

/**
 * The source at a line — what a dot on the program map opens (owner decision
 * 01.10.2026): the code around the line, the finding's own line(s) marked, and
 * the findings that sit there with their severity, level and words. Built like
 * the code card of the process map (`components/process-map/ProcessCodeCard`)
 * and the landing hero's source card: the real lines of the source on the page,
 * never a window around a guess.
 *
 * Focus moves to the panel's heading when it opens; Escape or the close button
 * closes it and gives the focus back to whatever opened it (the parent owns
 * that). "Show in the list" is the secondary way on: it narrows the list below
 * to this line, as a dot did before.
 */
export default function SourcePanel({
  line,
  rows,
  source,
  fileName,
  levelOf,
  onClose,
  onShowInList,
}: {
  line: number;
  /** The findings (rows) with an occurrence on this line. */
  rows: readonly FindingRow[];
  source: string;
  fileName: string;
  levelOf: (finding: EvidenceFinding) => CloudReadinessGrade | null;
  onClose: () => void;
  onShowInList: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  // The marked stretch: the longest statement among the findings on this line.
  const lineEnd = Math.max(
    line,
    ...rows.map((r) => (r.finding.lineStart === line && typeof r.finding.lineEnd === 'number' ? r.finding.lineEnd : line)),
  );
  const anchor = { lineStart: line, lineEnd };
  const lines = useMemo(() => codeCardLines(source, { lineStart: line, lineEnd }, 5), [source, line, lineEnd]);

  useEffect(() => {
    headingRef.current?.focus();
  }, [line]);

  return (
    <section
      data-analyze-source-panel={line}
      aria-labelledby="analyze-source-title"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
      className="mt-4 flex min-w-0 flex-col gap-3 rounded-cc-card border border-cc-line bg-cc-surface p-3 shadow-cc sm:p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3
            id="analyze-source-title"
            ref={headingRef}
            tabIndex={-1}
            className="m-0 rounded-cc-row cc-text-h3 text-cc-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cc-focus focus-visible:outline-solid"
          >
            Source at line {line}
          </h3>
          <p className="m-0 mt-1 font-cc-mono cc-text-meta font-medium text-cc-ink-muted">{codeCardLabel(fileName, anchor)}</p>
        </div>
        <CcIconButton onClick={onClose} label="Close the source" data-analyze-source-close="">
          <X size={16} aria-hidden={true} />
        </CcIconButton>
      </div>

      <ul className="m-0 grid list-none gap-2 p-0">
        {rows.map((r) => {
          const ef = r.finding;
          const sev = normaliseSeverity(ef.severity);
          const level = levelOf(ef);
          return (
            <li key={`${ef.kind}-${ef.objectName ?? ef.title}`} className="min-w-0">
              <span className="flex flex-wrap items-center gap-2">
                {sev ? <CcSeverity value={sev} /> : null}
                {level ? <CcCleanCoreLevel value={level} /> : null}
                <span className="cc-text-identifier text-cc-ink">{calmTitle(ef.title)}</span>
                <span className="font-cc-mono cc-text-meta font-medium text-cc-ink-muted">{ef.id}</span>
              </span>
              {ef.cleanCoreImpact ? <p className="m-0 mt-1 cc-text-cell text-cc-ink-muted">{ef.cleanCoreImpact}</p> : null}
              <p className="m-0 mt-1 cc-text-meta text-cc-ink">
                SAP successor:{' '}
                {ef.sapReplacement?.objectName ? (
                  <span className="font-cc-mono font-semibold">{ef.sapReplacement.objectName}</span>
                ) : (
                  <span className="text-cc-ink-muted">none named</span>
                )}
              </p>
            </li>
          );
        })}
      </ul>

      <CcCodeSurface lines={lines} label={codeCardLabel(fileName, anchor)} />

      <div>
        <CcButton variant="ghost" density="compact" onClick={onShowInList} data-analyze-source-list="">
          Show in the list
        </CcButton>
      </div>
    </section>
  );
}
