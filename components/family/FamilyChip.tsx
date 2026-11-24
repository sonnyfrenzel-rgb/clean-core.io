import React from 'react';
import { Calculator, CircleHelp, Cog, PenLine, ShieldCheck, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { familyChip, familyChipOf, type FamilyChipKind } from '@/lib/family-chips';
import type { ProvenanceValue } from '@/lib/provenance';
import { STATE_CLASSES } from '@/components/cc/state';

/**
 * One provenance chip of the tools' family (`lib/family-chips.ts`, UX review L2): six words, each with its icon and
 * its form — filled, outline, dashed — so a chip reads without colour, in print and to a screen reader. The family's
 * `.pv`: 12 px / 600, a white pill whose border carries the meaning (ADR-140 W4).
 *
 * Takes a `kind`, or a `value` of `lib/provenance.ts` that it reduces to one (`familyChipOf`); never a label. A
 * `stale` value draws nothing — out of date is said by a strip and the tool bar's mark.
 */
const ICONS = {
  'shield-check': ShieldCheck,
  cog: Cog,
  user: User,
  'pen-line': PenLine,
  calculator: Calculator,
  'circle-help': CircleHelp,
} as const;

export type FamilyChipProps =
  | { kind: FamilyChipKind; value?: never; note?: string; title?: string }
  | { value: ProvenanceValue; kind?: never; note?: string; title?: string };

export default function FamilyChip(props: FamilyChipProps) {
  const reduced = props.kind ? { kind: props.kind } : familyChipOf(props.value as ProvenanceValue);
  if (!reduced) return null;
  const entry = familyChip(reduced.kind);
  const state = STATE_CLASSES[entry.state];
  const Icon = ICONS[entry.icon];
  const note = props.note ?? (reduced as { note?: string }).note;
  return (
    <span
      data-family-chip={entry.kind}
      data-cc-form={entry.form}
      title={props.title ?? entry.meaning}
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-full border py-px pr-2 pl-2 align-middle',
        'text-[12px] leading-4 font-semibold tracking-normal normal-case',
        state.text,
        state.borderStrong,
        entry.form === 'filled' ? state.bg : 'bg-cc-surface',
        entry.form === 'dashed' ? 'border-dashed' : 'border-solid',
      )}
    >
      <Icon size={12} aria-hidden={true} className="shrink-0" />
      <span data-family-chip-label="" className="shrink-0 whitespace-nowrap">
        {entry.label}
      </span>
      {note ? <span className="min-w-0 font-medium [overflow-wrap:anywhere]">· {note}</span> : null}
    </span>
  );
}
