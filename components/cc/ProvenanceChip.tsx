'use client';

import React from 'react';
import {
  Calculator,
  Clock,
  Cog,
  CircleHelp,
  FileDown,
  PenLine,
  ShieldCheck,
  TestTube,
  User,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { provenance, type ProvenanceForm, type ProvenanceValue } from '@/lib/provenance';
import { STATE_CLASSES } from './state';

/**
 * Where a statement came from — `DESIGN.md` §4.
 *
 * There is no `label` prop and there never will be. The component takes a value
 * out of `lib/provenance.ts` and reads the label from there, which is the whole
 * mechanism behind "no freely worded badges": a badge that says something else
 * cannot be written, only mis-valued, and TypeScript catches that.
 *
 * Three things every chip carries:
 *
 *   - **the word**, from the list;
 *   - **an icon**, so the chip reads on a printed page and to a screen reader
 *     that does not announce colour;
 *   - **a form** — filled, outline, dashed — as the second cue (ADR-017).
 *     Blue carries three values and yellow four, so someone skimming needs
 *     something other than hue to tell a self-declaration from a derivation.
 *
 * The icon is deliberately a pen for *Model proposal* and never a spark: §3.1
 * forbids the sparkle-and-robot iconography that turns evidence into a trick.
 */
const ICONS: Record<string, React.ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean }>> = {
  'shield-check': ShieldCheck,
  user: User,
  cog: Cog,
  'file-down': FileDown,
  'pen-line': PenLine,
  calculator: Calculator,
  'test-tube': TestTube,
  clock: Clock,
  'circle-help': CircleHelp,
};

const FORM_CLASSES: Record<ProvenanceForm, string> = {
  filled: 'border-solid',
  outline: 'bg-cc-surface border-solid',
  dashed: 'bg-cc-surface border-dashed',
};

export interface CcProvenanceChipProps {
  value: ProvenanceValue;
  /**
   * A qualifier after the word — "source changed", "names". Deliberately not a
   * replacement for it: the chip still reads *Stale · source changed*, so the
   * fixed word is always the first thing there.
   */
  note?: string;
}

export default function CcProvenanceChip({ value, note }: CcProvenanceChipProps) {
  const entry = provenance(value);
  const state = STATE_CLASSES[entry.state];
  const Icon = ICONS[entry.icon];

  return (
    <span
      data-provenance={entry.value}
      data-cc-form={entry.form}
      title={entry.meaning}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-px align-middle',
        'text-[11px] font-semibold leading-4 whitespace-nowrap',
        state.text,
        entry.form === 'filled' ? cn(state.bg, state.border) : state.borderStrong,
        FORM_CLASSES[entry.form],
      )}
    >
      {Icon ? <Icon size={13} aria-hidden={true} /> : null}
      <span data-cc-provenance-label>{entry.label}</span>
      {note ? <span className="font-medium">· {note}</span> : null}
    </span>
  );
}
