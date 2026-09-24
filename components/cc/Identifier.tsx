'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { evidenceLevel, type EvidenceLevelValue } from '@/lib/evidence-level';
import { cleanCoreLevel, type CleanCoreLevelValue } from '@/lib/clean-core-level';
import { severity, type SeverityValue } from '@/lib/severity';
import { STATE_CLASSES } from './state';

/**
 * The identifier form — `DESIGN.md` §4.1.
 *
 * A 4px rectangle with a code in monospace and, where there is one, the word
 * behind it. Three vocabularies wear it and nothing else does: the evidence
 * level E0–E4, the clean-core level A–D and the severity of a finding (ADR-049).
 * Giving them a shape of their own is the point — none is a provenance chip,
 * and none should be read as one.
 *
 * Evidence levels are neutral at every step, including E4: an evidence level is
 * a ripeness, not a verdict, and green would claim a proof that the level does
 * not carry. Clean-core levels take their colour from §1.8 — A information, B
 * neutral, C warning, D error, never green — because they come out of SAP's
 * classification file as *Imported* and never enter the signed audit pack.
 * Severities take theirs from §1.8 too — Critical and High error, Medium
 * warning, Low neutral, Info information, never green — and carry only the
 * word, in 12 px / 600, because the word is what tells Critical from High.
 */
const BASE =
  'inline-flex items-stretch overflow-hidden rounded-[4px] border align-middle text-[12px] font-medium leading-[18px] whitespace-nowrap';
const CODE = 'font-cc-mono text-[11px] font-semibold px-1.5 border-r';

export function CcEvidenceLevel({
  value,
  withLabel = true,
}: {
  value: EvidenceLevelValue;
  withLabel?: boolean;
}) {
  const entry = evidenceLevel(value);
  return (
    <span
      data-cc-identifier="evidence-level"
      data-cc-value={entry.value}
      title={entry.meaning}
      className={cn(BASE, 'bg-cc-surface border-cc-field-border text-cc-ink')}
    >
      <span className={cn(CODE, 'bg-cc-surface-muted border-cc-field-border')}>{entry.value}</span>
      {withLabel ? <span className="px-1.5">{entry.label}</span> : null}
    </span>
  );
}

export function CcCleanCoreLevel({
  value,
  withLabel = false,
}: {
  value: CleanCoreLevelValue;
  withLabel?: boolean;
}) {
  const entry = cleanCoreLevel(value);
  const state = STATE_CLASSES[entry.state];
  return (
    <span
      data-cc-identifier="clean-core-level"
      data-cc-value={entry.value}
      title={entry.label}
      className={cn(BASE, 'bg-cc-surface', state.borderStrong, state.text)}
    >
      <span className={cn(CODE, state.bg, state.borderStrong)}>{entry.code}</span>
      {withLabel ? <span className="px-1.5">{entry.label}</span> : null}
    </span>
  );
}

/**
 * The severity of a finding — `DESIGN.md` §4.1, ADR-049.
 *
 * Takes a value, never a label: the word comes from `lib/severity.ts`, so a
 * sixth severity or a second spelling cannot be written here, only a wrong
 * value, which TypeScript catches. A string from the wire goes through
 * `normaliseSeverity` first; `null` there is *not determined*, not a severity.
 *
 * The word is always printed. Critical and High share the `error` colour, and
 * under `forced-colors` and on paper every colour goes — the rectangle and the
 * word are what is left, and they are enough.
 */
export function CcSeverity({ value }: { value: SeverityValue }) {
  const entry = severity(value);
  const state = STATE_CLASSES[entry.state];
  return (
    <span
      data-cc-identifier="severity"
      data-cc-value={entry.value}
      data-cc-severity={entry.value}
      title={entry.meaning}
      className={cn(
        'inline-block rounded-[4px] border px-2 align-middle text-[12px] font-semibold leading-[18px] whitespace-nowrap',
        state.bg,
        state.borderStrong,
        state.text,
      )}
    >
      {entry.label}
    </span>
  );
}
