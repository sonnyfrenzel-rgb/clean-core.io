'use client';

import React, { useState } from 'react';
import CcAnchor from '@/components/cc/Anchor';
import CcCodeSurface from '@/components/cc/CodeSurface';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import CcStateText from '@/components/cc/StateText';
import { cn } from '@/lib/utils';
import {
  ORIGIN_KIND_WORD,
  ORIGIN_OUTCOME_WORD,
  lineWord,
  type OriginOutcome,
  type OriginReading,
} from '@/lib/scenario-origin';
import { NOT_STATED, type DerivedFrom } from './scenario-detail';

/**
 * Where a scenario says it comes from, and what the product found when it
 * checked that against the signed source (owner decision 03.10.2026, ADR-071).
 *
 * The statement stays the model's: the details keep "Model proposal" on the
 * scenario. What is shown as checked is only what `checkScenarioOrigin` checked
 * — the lines exist, a named rule, decision point or finding stands on them, a
 * quote stands on them. An anchored engine object carries "Reconstructed",
 * because that object is derived from the code; the scenario does not.
 *
 * Every line anchor is a button that opens the lines in place — on a phone too,
 * inside the sheet — never a hover.
 */

const LABEL = 'cc-text-label text-cc-ink-muted';

const OUTCOME_STATE: Record<OriginOutcome, { state: 'information' | 'warning' | 'neutral'; hollow: boolean }> = {
  anchored: { state: 'information', hollow: false },
  'lines-only': { state: 'neutral', hollow: true },
  mismatch: { state: 'warning', hollow: false },
  'not-stated': { state: 'neutral', hollow: true },
  'not-checked': { state: 'neutral', hollow: true },
};

/** The row chip: Anchored, Not anchored, Mismatch — or Not checked, when there was nothing to check against. */
export function OriginChip({ outcome }: { outcome: OriginOutcome }) {
  const { state, hollow } = OUTCOME_STATE[outcome];
  return (
    <span data-scenario-origin={outcome}>
      <CcStateText state={state} hollow={hollow} facet="Origin">
        {ORIGIN_OUTCOME_WORD[outcome]}
      </CcStateText>
    </span>
  );
}

interface Range {
  lineStart: number;
  lineEnd: number;
}

/** The lines an anchor opens, with two lines of context, as plain text. */
function Excerpt({ lines, range }: { lines: readonly string[]; range: Range }) {
  const first = Math.max(1, range.lineStart - 2);
  const last = Math.min(lines.length, range.lineEnd + 2);
  const shown = [];
  for (let n = first; n <= last; n++) {
    const highlighted = n >= range.lineStart && n <= range.lineEnd;
    shown.push({ number: n, tokens: [{ kind: 'plain' as const, text: lines[n - 1] || ' ' }], ...(highlighted ? { highlighted: true } : {}) });
  }
  if (shown.length === 0) return null;
  return (
    <div data-origin-excerpt={lineWord(range)} className="min-w-0">
      <CcCodeSurface lines={shown} label={`Signed source, ${range.lineStart === range.lineEnd ? `line ${range.lineStart}` : `lines ${range.lineStart} to ${range.lineEnd}`}`} />
    </div>
  );
}

function rangeKey(r: Range): string {
  return `${r.lineStart}-${r.lineEnd}`;
}

export function OriginDetails({
  reading,
  legacy,
  sourceLines,
}: {
  reading: OriginReading;
  /** A free-text origin stored before the structured statement existed — shown, never checked. */
  legacy: DerivedFrom | null;
  /** The signed source, when the check could read it; anchors open these lines. */
  sourceLines: readonly string[] | null;
}) {
  const [openRange, setOpenRange] = useState<Range | null>(null);
  const { origin, check, dropped } = reading;
  const lineCount = sourceLines ? (sourceLines.length > 0 && sourceLines[sourceLines.length - 1] === '' ? sourceLines.length - 1 : sourceLines.length) : 0;

  const anchor = (r: Range, label: string) => {
    const opens = !!sourceLines && r.lineStart >= 1 && r.lineEnd <= lineCount;
    const open = openRange && rangeKey(openRange) === rangeKey(r);
    return (
      <CcAnchor
        key={`${label}-${rangeKey(r)}`}
        tone={opens ? (open ? 'hot' : 'linked') : 'unlinked'}
        label={`${label} ${r.lineStart === r.lineEnd ? `line ${r.lineStart}` : `lines ${r.lineStart} to ${r.lineEnd}`}${opens ? (open ? ', hide the source' : ', open the source') : ''}`}
        onOpen={opens ? () => setOpenRange(open ? null : r) : undefined}
      >
        {lineWord(r)}
      </CcAnchor>
    );
  };

  return (
    <div data-scenario-derived="" data-origin-outcome={check.outcome} className="min-w-0 md:col-span-2">
      <dt className={cn(LABEL, 'mb-1')}>Derived from — business rule, decision point or finding</dt>
      <dd className="m-0 flex min-w-0 flex-col gap-2">
        {origin ? (
          <div data-origin-statement="" className="flex min-w-0 flex-col gap-1">
            <p className="m-0 flex flex-wrap items-center gap-2 cc-text-cell text-cc-ink">
              <span className="font-semibold">{ORIGIN_KIND_WORD[origin.kind]}</span>
              {origin.ref ? <span data-origin-ref="" className="font-cc-mono text-[12px] font-semibold">{origin.ref}</span> : null}
              <span className="flex flex-wrap gap-1">
                {origin.lines.map((l) => anchor({ lineStart: l.start, lineEnd: l.end }, 'Stated source'))}
              </span>
            </p>
            {origin.quote ? (
              <p data-origin-quote="" className="m-0 font-cc-mono text-[12px] text-cc-ink [overflow-wrap:anywhere]">
                “{origin.quote}”
              </p>
            ) : null}
            <span className="cc-text-meta text-cc-ink-muted">As the model states it.</span>
          </div>
        ) : legacy ? (
          <div data-origin-legacy="" className="flex flex-col gap-1">
            <p className="m-0 cc-text-cell text-cc-ink [overflow-wrap:anywhere]">{legacy.text}</p>
            {legacy.anchors.length > 0 ? (
              <span className="flex flex-wrap gap-1">
                {legacy.anchors.map((a) => (
                  <CcAnchor key={a} tone="unlinked" label={`Source ${a.replace('L', 'line ')}, as the model states it`}>
                    {a}
                  </CcAnchor>
                ))}
              </span>
            ) : null}
            <span className="cc-text-meta text-cc-ink-muted">As the model states it, in free text — not checked against the source.</span>
          </div>
        ) : (
          <span data-not-stated="" className="cc-text-cell text-cc-ink-muted">
            {NOT_STATED} — the scenario names no business rule, decision point, finding or source line.
          </span>
        )}

        {dropped ? (
          <p data-origin-dropped="" className="m-0 cc-text-meta text-cc-ink-muted [overflow-wrap:anywhere]">
            {dropped}
          </p>
        ) : null}

        {origin ? (
          <div
            data-origin-check={check.outcome}
            className={cn(
              'flex min-w-0 flex-col gap-1 border-l-2 pl-2',
              check.outcome === 'mismatch' ? 'border-cc-warning-line' : check.outcome === 'anchored' ? 'border-cc-information-border' : 'border-cc-line',
            )}
          >
            <span className="flex flex-wrap items-center gap-2">
              <OriginChip outcome={check.outcome} />
              {reading.basis === 'stored' ? <span className="cc-text-meta text-cc-ink-muted">as recorded when the scenarios were generated</span> : null}
            </span>
            <p className="m-0 cc-text-cell text-cc-ink [overflow-wrap:anywhere]">{check.sentence}</p>
            {check.problems.length > 1 ? (
              <ul className="m-0 flex flex-col gap-1 pl-5 list-disc cc-text-cell text-cc-ink">
                {check.problems.slice(1).map((p, i) => (
                  <li key={i} className="[overflow-wrap:anywhere]">
                    {p}
                  </li>
                ))}
              </ul>
            ) : null}
            {check.outcome === 'mismatch' ? (
              <p className="m-0 cc-text-meta text-cc-ink-muted">The scenario is kept; only its stated origin does not match the source.</p>
            ) : null}
            {check.matches.length > 0 ? (
              <span data-origin-matches="" className="flex flex-wrap items-center gap-2">
                <CcProvenanceChip value="reconstructed" />
                {check.matches.slice(0, 6).map((m) => (
                  <span key={`${m.kind}-${m.id}`} data-origin-match={m.id} className="inline-flex items-center gap-1">
                    <span className="font-cc-mono text-[12px] font-semibold text-cc-ink">{m.id}</span>
                    {anchor(m, m.id)}
                  </span>
                ))}
                <span className="cc-text-meta text-cc-ink-muted">anchored to the code; the scenario stays a model proposal.</span>
              </span>
            ) : null}
            {reading.recheckedAfterChange ? (
              <span className="cc-text-meta text-cc-ink-muted">Re-checked now: the source has changed since the scenarios were generated.</span>
            ) : null}
          </div>
        ) : null}

        {openRange && sourceLines ? <Excerpt lines={sourceLines} range={openRange} /> : null}
      </dd>
    </div>
  );
}
