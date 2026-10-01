'use client';

import React, { useState, type ReactNode } from 'react';
import { ArrowDown } from 'lucide-react';
import CcField from '@/components/cc/Field';
import CcCheckbox from '@/components/cc/Checkbox';
import CcStateText from '@/components/cc/StateText';
import type { ChecklistRow, ChecklistStatus } from '@/lib/economics-checklist';

/**
 * Economics as one checklist of inputs (mockup v2.8 s5, "What the comparison
 * still needs"; audit 01.10.2026 row 7).
 *
 * Each row is one figure the stage needs from the reader, its field beside it
 * and its state after it, so "what is missing" and "where do I enter it" are
 * the same line. The rows and their states come from `lib/economics-checklist.ts`,
 * which reads the comparison's own gaps — the list cannot claim a figure is
 * there that the comparison counts as missing, or the other way round.
 *
 * A stated figure is "done" in the information colour, never green: a number
 * a reader typed in is theirs, not evidence (DESIGN.md §1.1).
 */

const STATUS_WORD: Record<ChecklistStatus, string> = {
  done: 'done',
  open: 'open',
  draft: 'draft',
  partial: 'partial',
  assumed: 'assumed',
};

export function ChecklistStatusText({ status }: { status: ChecklistStatus }) {
  if (status === 'done') return <CcStateText state="information">{STATUS_WORD.done}</CcStateText>;
  if (status === 'open') return <CcStateText state="neutral" hollow>{STATUS_WORD.open}</CcStateText>;
  return <CcStateText state="warning">{STATUS_WORD[status]}</CcStateText>;
}

/** One row: what, the field (or where it is entered), and how far it is. */
export function ChecklistLine({
  row,
  children,
}: {
  row: ChecklistRow;
  /** The control; omitted for rows entered per option below. */
  children?: ReactNode;
}) {
  return (
    <li
      data-economics-row={row.key}
      data-economics-status={row.status}
      className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1 border-b border-cc-line py-3"
    >
      <div className="min-w-0">{children}</div>
      <div className="flex flex-col items-end gap-1 pt-1 text-right">
        <ChecklistStatusText status={row.status} />
        {row.detail ? <span className="cc-text-meta text-cc-ink-muted max-w-[12rem]">{row.detail}</span> : null}
      </div>
    </li>
  );
}

/** A row whose figures are entered per option, in the cards below. */
export function OptionRowLabel({ row, target }: { row: ChecklistRow; target: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[13px] font-semibold text-cc-ink">{row.label}</span>
      <a href={`#${target}`} className="inline-flex items-center gap-1 cc-text-meta text-cc-ink-muted hover:text-cc-ink">
        <ArrowDown size={14} aria-hidden="true" /> Entered per option, below
      </a>
    </div>
  );
}

const num = (raw: string): number | null => {
  if (raw.trim() === '') return null;
  const v = Number(raw);
  return Number.isFinite(v) && v >= 0 ? v : null;
};

/**
 * A figure the reader states. Empty until they do — there is no default — and
 * it says so once the reader has left it (§2.7, on blur). `data` carries the
 * names specs and the print footer address the field by.
 */
export function FigureField({
  label,
  note,
  hint,
  value,
  onChange,
  data,
  suffix,
}: {
  label: string;
  note?: string;
  hint?: ReactNode;
  value: number | null;
  onChange: (v: number | null) => void;
  data: Record<`data-${string}`, string>;
  suffix?: ReactNode;
}) {
  const [left, setLeft] = useState(false);
  const missing = value === null && left;
  return (
    <CcField
      label={note ? `${label} — ${note}` : label}
      required
      help={hint}
      valueState={missing ? 'warning' : undefined}
      message={missing ? 'Your figure — there is no default.' : undefined}
    >
      {({ id, describedBy, ariaRequired, className }) => (
        <div className="flex max-w-[18rem] items-center gap-2">
          <input
            id={id}
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={value ?? ''}
            placeholder="enter your figure"
            aria-required={ariaRequired}
            aria-describedby={describedBy}
            onBlur={() => setLeft(true)}
            onChange={(e) => onChange(num(e.target.value))}
            className={className}
            {...data}
          />
          {suffix ? <span className="cc-text-meta text-cc-ink-muted whitespace-nowrap">{suffix}</span> : null}
        </div>
      )}
    </CcField>
  );
}

/** The stage's currency, stated once (roadmap 7.11), without a default. */
export function CurrencyField({ currency, onChange }: { currency: string; onChange: (c: string) => void }) {
  const [left, setLeft] = useState(false);
  const missing = !currency && left;
  return (
    <CcField
      label="Currency — no default"
      required
      help="The currency your day rates and budget are in. Every amount on this page uses it."
      valueState={missing ? 'warning' : undefined}
      message={missing ? 'Yours to state — there is no default.' : undefined}
    >
      {({ id, describedBy, ariaRequired, className }) => (
        <div className="max-w-[18rem]">
          <input
            id={id}
            type="text"
            value={currency}
            maxLength={8}
            placeholder="e.g. EUR"
            data-cost-field="currency"
            aria-required={ariaRequired}
            aria-describedby={describedBy}
            onBlur={() => setLeft(true)}
            onChange={(e) => onChange(e.target.value.trim().toUpperCase())}
            className={className}
          />
        </div>
      )}
    </CcField>
  );
}

/** The release cadence and its confirmation — a proposal until confirmed (ADR-035). */
export function CadenceField({
  perYear,
  confirmed,
  onPerYear,
  onConfirmed,
}: {
  perYear: number | null;
  confirmed: boolean;
  onPerYear: (v: number | null) => void;
  onConfirmed: (c: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <FigureField
        label="Releases per year"
        hint="How often the recurring effort falls due."
        value={perYear}
        onChange={onPerYear}
        data={{ 'data-cost-field': 'release-cadence' }}
      />
      <div data-cost-field="release-cadence-confirmed">
        <CcCheckbox
          label="I confirm this cadence. Until then it is a proposal, and no amount is shown."
          required
          checked={confirmed}
          disabled={perYear === null}
          onChange={onConfirmed}
        />
      </div>
    </div>
  );
}

/**
 * A slider in the field frame of §2.7, with what it stands at said in words —
 * a range has no text of its own.
 */
export function RangeField({
  label,
  help,
  min,
  max,
  step,
  value,
  onChange,
  readout,
  valueText,
}: {
  label: string;
  help?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  readout: ReactNode;
  valueText?: string;
}) {
  return (
    <div className="flex min-w-0 max-w-[24rem] flex-col gap-1">
      <CcField label={label} help={help}>
        {({ id, describedBy }) => (
          <input
            id={id}
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            aria-describedby={describedBy}
            aria-valuetext={valueText ?? (typeof readout === 'string' ? readout : undefined)}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-full min-h-8 cursor-pointer accent-cc-ink"
          />
        )}
      </CcField>
      <span className="cc-text-meta text-cc-ink">{readout}</span>
    </div>
  );
}
