'use client';

import React, { useId, useState, type ChangeEvent, type KeyboardEvent, type ReactNode } from 'react';
import { ArrowDown, Check, ChevronDown } from 'lucide-react';
import CcField from '@/components/cc/Field';
import CcCheckbox from '@/components/cc/Checkbox';
import CcStateText, { CcStateDot } from '@/components/cc/StateText';
import type { ChecklistRow, ChecklistStatus } from '@/lib/economics-checklist';
import { currencyEntryProblem, currencyOption, matchCurrencies, readCurrencyEntry } from '@/lib/currency-options';
import { RATES_HELP, readFigure, type FigureKind } from '@/lib/economics-help';
import { cn } from '@/lib/utils';

/**
 * Economics as one checklist of inputs (mockup v2.8 s5, "What the comparison
 * still needs"; audit 01.10.2026 row 7).
 *
 * Each row is one figure the stage needs from the reader and its state, and
 * the field opens under the row (owner decision 01.10.2026, proposal A), so
 * "what is missing" and "where do I enter it" are the same line. The rows and their states come from `lib/economics-checklist.ts`,
 * which reads the comparison's own gaps â€” the list cannot claim a figure is
 * there that the comparison counts as missing, or the other way round.
 *
 * A stated figure is "done" in the information colour, never green: a number
 * a reader typed in is theirs, not evidence (DESIGN.md Â§1.1).
 */

const STATUS_WORD: Record<ChecklistStatus, string> = {
  done: 'done',
  open: 'open',
  draft: 'draft',
  partial: 'partial',
  assumed: 'assumed',
};

/** The colour a status is drawn in â€” the word on the right and the dot on the left. */
function statusState(status: ChecklistStatus): 'information' | 'neutral' | 'warning' {
  if (status === 'done') return 'information';
  if (status === 'open') return 'neutral';
  return 'warning';
}

export function ChecklistStatusText({ status }: { status: ChecklistStatus }) {
  if (status === 'done') return <CcStateText state="information">{STATUS_WORD.done}</CcStateText>;
  if (status === 'open') return <CcStateText state="neutral" hollow>{STATUS_WORD.open}</CcStateText>;
  return <CcStateText state="warning">{STATUS_WORD[status]}</CcStateText>;
}

const WORD_CLASS: Record<'information' | 'neutral' | 'warning', string> = {
  information: 'text-cc-information',
  neutral: 'text-cc-ink-muted',
  warning: 'text-cc-warning',
};

/**
 * One row of the checklist (proposal A, "What the comparison still needs"): a
 * state dot, what the figure is â€” with the reader's value once there is one â€”
 * and how far it is, in a word. The field opens under the row on a click, so
 * the list reads as a status list first and a form second; the field stays in
 * the page while closed, so nothing it holds is lost and the print footer and
 * the forecast read the same state either way.
 *
 * A row without a field of its own (entered per option) links to the options.
 */
export function ChecklistLine({
  row,
  summary,
  target,
  children,
}: {
  row: ChecklistRow;
  /** The reader's value in a few words â€” "800 CHF / day", "668 LoC from your source". */
  summary?: ReactNode;
  /** For rows entered per option: the section that holds their fields. */
  target?: string;
  /** The control; omitted for rows entered per option. */
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const state = statusState(row.status);
  const line = (
    <>
      <CcStateDot state={state} hollow={row.status === 'open'} />
      <span className="min-w-0">
        <span className="block cc-text-cell text-cc-ink">
          {row.label}
          {row.note ? ` â€” ${row.note}` : null}
          {summary ? <span className="text-cc-ink"> Â· {summary}</span> : null}
        </span>
        {row.detail && row.detail !== 'from your source' && row.detail !== 'stated' ? (
          <span className="block cc-text-meta font-medium text-cc-ink-muted">{row.detail}</span>
        ) : null}
      </span>
      <span data-economics-row-word="" className={`cc-text-meta ${WORD_CLASS[state]}`}>
        {STATUS_WORD[row.status]}
      </span>
    </>
  );
  const grid = 'grid w-full grid-cols-[12px_minmax(0,1fr)_auto_16px] items-center gap-3 py-2 min-h-10 text-left';
  return (
    <li
      data-economics-row={row.key}
      data-economics-status={row.status}
      className="border-t border-cc-line first:border-t-0"
    >
      {children ? (
        <>
          <button
            type="button"
            data-economics-row-toggle=""
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((o) => !o)}
            className={`${grid} cursor-pointer rounded-cc-row`}
          >
            {line}
            <ChevronDown
              size={16}
              aria-hidden={true}
              className={`text-cc-ink-muted transition-transform ${open ? 'rotate-180' : ''}`}
            />
          </button>
          <div id={panelId} hidden={!open} data-economics-row-panel="" className="pb-4 pl-6">
            {children}
          </div>
        </>
      ) : (
        <a
          href={`#${target ?? ''}`}
          data-economics-row-link=""
          className={`${grid} text-cc-ink no-underline`}
        >
          {line}
          <ArrowDown size={16} aria-hidden={true} className="text-cc-ink-muted" />
        </a>
      )}
    </li>
  );
}

/**
 * A figure input's state: the text as typed, and what it states. The text is
 * the reader's â€” "-5" stays on screen with a message saying why it is not a
 * figure â€” and the page holds the figure it states, or `null` (Â§2.7: say what
 * is wrong and what is allowed; no silent value). A figure set from outside
 * (loaded, taken over from a proposal) replaces the text.
 *
 * Shared with the effort fields of step 3 (`OptionComparison`), so every
 * figure on the stage is read and explained one way.
 */
export function useFigureInput(value: number | null, kind: FigureKind, onChange: (v: number | null) => void) {
  const [raw, setRaw] = useState(value === null ? '' : String(value));
  const [badInput, setBadInput] = useState(false);
  const [seen, setSeen] = useState<number | null>(value);
  const [left, setLeft] = useState(false);
  // A figure from outside: adjust the text while rendering, not in an effect.
  if (!Object.is(value, seen)) {
    setSeen(value);
    if (!Object.is(readFigure(raw, kind, badInput).value, value)) {
      setRaw(value === null ? '' : String(value));
      setBadInput(false);
    }
  }
  const reading = readFigure(raw, kind, badInput);
  return {
    raw,
    left,
    problem: reading.problem,
    onBlur: () => setLeft(true),
    onChange: (e: ChangeEvent<HTMLInputElement>) => {
      const next = e.target.value;
      const bad = Boolean(e.target.validity?.badInput);
      const read = readFigure(next, kind, bad);
      setRaw(next);
      setBadInput(bad);
      setSeen(read.value);
      onChange(read.value);
    },
  };
}

/** The value state of a figure field once the reader has left it: what is wrong, or that it is still theirs to give. */
export function figureMessage(
  input: { left: boolean; problem: string | null },
  value: number | null,
): { valueState?: 'error' | 'warning'; message?: string } {
  if (!input.left) return {};
  if (input.problem) return { valueState: 'error', message: input.problem };
  if (value === null) return { valueState: 'warning', message: 'Your figure â€” there is no default.' };
  return {};
}

/**
 * A figure the reader states. Empty until they do â€” there is no default â€” and
 * it says so once the reader has left it (Â§2.7, on blur). The unit stands in
 * the field's frame: the currency in front once one is stated, "/ day",
 * "years", "per year" behind. `data` carries the names specs and the print
 * footer address the field by.
 */
export function FigureField({
  label,
  note,
  hint,
  value,
  onChange,
  data,
  kind,
  prefix,
  suffix,
}: {
  label: string;
  note?: string;
  hint?: ReactNode;
  value: number | null;
  onChange: (v: number | null) => void;
  data: Record<`data-${string}`, string>;
  /** Which bounds apply â€” the stored record's own (`lib/economics-help.ts`). */
  kind: FigureKind;
  prefix?: ReactNode;
  suffix?: ReactNode;
}) {
  const input = useFigureInput(value, kind, onChange);
  return (
    <CcField label={note ? `${label} â€” ${note}` : label} required help={hint} {...figureMessage(input, value)}>
      {({ id, describedBy, ariaRequired, invalid, className }) => (
        <div className="flex max-w-[20rem] items-center gap-2">
          {prefix ? (
            <span className="cc-text-meta font-semibold whitespace-nowrap text-cc-ink" data-economics-unit="prefix">
              {prefix}
            </span>
          ) : null}
          <input
            id={id}
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={input.raw}
            placeholder="enter your figure"
            aria-required={ariaRequired}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            onBlur={input.onBlur}
            onChange={input.onChange}
            className={className}
            {...data}
          />
          {suffix ? (
            <span className="cc-text-meta whitespace-nowrap text-cc-ink-muted" data-economics-unit="suffix">
              {suffix}
            </span>
          ) : null}
        </div>
      )}
    </CcField>
  );
}

/**
 * The stage's currency, stated once (roadmap 7.11), without a default â€” as a
 * combobox since 11.10.2026 (owner: "When I type EUâ€¦, let me pick EUR from a
 * list right away, US â†’ USD"). Typing filters the ten currencies of
 * `lib/currency-options.ts` by code, name, sign or country; arrow keys move,
 * Enter picks, Escape closes. A full ISO 4217 code states itself as typed, so
 * any other currency stays possible. Search text that is no code states
 * nothing: the page keeps the currency it had, and says so on leaving.
 */
export function CurrencyField({ currency, onChange }: { currency: string; onChange: (c: string) => void }) {
  const [text, setText] = useState(currency);
  const [seen, setSeen] = useState(currency);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [left, setLeft] = useState(false);
  const listId = useId();

  // A currency from outside (loaded with the project): show it.
  if (currency !== seen) {
    setSeen(currency);
    const entry = readCurrencyEntry(text);
    const textStates = entry.kind === 'empty' ? '' : entry.kind === 'code' ? entry.code : null;
    if (textStates !== currency) setText(currency);
  }

  const matches = matchCurrencies(text);
  const expanded = open && matches.length > 0;
  const optionId = (code: string) => `${listId}-${code}`;
  const activeMatch = expanded && active >= 0 ? matches[active] : undefined;

  const state = (code: string) => {
    setSeen(code);
    onChange(code);
  };
  const pick = (code: string) => {
    setText(code);
    state(code);
    setOpen(false);
    setActive(-1);
  };
  const type = (next: string) => {
    setText(next);
    setOpen(true);
    const entry = readCurrencyEntry(next);
    if (entry.kind === 'empty') state('');
    else if (entry.kind === 'code') state(entry.code);
    setActive(next.trim() && matchCurrencies(next).length > 0 ? 0 : -1);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setActive(e.key === 'ArrowDown' ? 0 : matches.length - 1);
        return;
      }
      if (matches.length === 0) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (i < 0 ? (step > 0 ? 0 : matches.length - 1) : (i + step + matches.length) % matches.length));
    } else if (e.key === 'Enter') {
      if (activeMatch) {
        e.preventDefault();
        pick(activeMatch.option.code);
      }
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        setOpen(false);
        setActive(-1);
      } else if (text !== currency) {
        setText(currency);
      }
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };
  const onBlur = () => {
    setOpen(false);
    setActive(-1);
    setLeft(true);
    const entry = readCurrencyEntry(text);
    if (entry.kind === 'code') setText(entry.code);
  };

  const problem = currencyEntryProblem(text, currency);
  const known = currency ? currencyOption(currency) : null;
  const message = !left
    ? {}
    : problem
      ? { valueState: 'error' as const, message: problem }
      : !currency
        ? {
            valueState: 'warning' as const,
            message: 'Yours to state â€” there is no default. Type a code, a currency or a country and pick it from the list.',
          }
        : {};

  return (
    <CcField label="Currency â€” no default" required help={RATES_HELP.currency} {...message}>
      {({ id, describedBy, ariaRequired, invalid, className }) => (
        <div className="flex max-w-[20rem] flex-col gap-1">
          <div className="relative">
            <input
              id={id}
              type="text"
              role="combobox"
              autoComplete="off"
              spellCheck={false}
              value={text}
              placeholder="e.g. type EU, dollar or India"
              data-cost-field="currency"
              aria-autocomplete="list"
              aria-expanded={expanded}
              aria-controls={listId}
              aria-activedescendant={activeMatch ? optionId(activeMatch.option.code) : undefined}
              aria-required={ariaRequired}
              aria-invalid={invalid || undefined}
              aria-describedby={describedBy}
              onFocus={() => setOpen(true)}
              onClick={() => setOpen(true)}
              onBlur={onBlur}
              onKeyDown={onKeyDown}
              onChange={(e) => type(e.target.value)}
              className={className}
            />
            <ul
              id={listId}
              role="listbox"
              aria-label="Currencies"
              hidden={!expanded}
              data-economics-currency-list=""
              className="absolute top-full left-0 z-20 m-0 mt-1 max-h-72 w-full min-w-[16rem] list-none overflow-auto rounded-cc-card border border-cc-line bg-cc-surface p-1 shadow-cc"
            >
              {matches.map((m, i) => {
                const selected = m.option.code === currency;
                return (
                  <li
                    key={m.option.code}
                    id={optionId(m.option.code)}
                    role="option"
                    aria-selected={selected}
                    data-economics-currency-option={m.option.code}
                    data-active={i === active ? 'true' : undefined}
                    // Keep the focus in the input: a click picks, it does not blur first.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(m.option.code)}
                    onMouseEnter={() => setActive(i)}
                    className={cn(
                      'grid cursor-pointer grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-2 rounded-cc-row px-2 py-2 cc-text-cell text-cc-ink pointer-coarse:min-h-11',
                      i === active ? 'bg-cc-surface-muted' : '',
                    )}
                  >
                    <span className="font-cc-mono font-semibold">{m.option.code}</span>
                    <span className="min-w-0 truncate">
                      {m.option.name}
                      {m.via ? <span className="text-cc-ink-muted"> Â· {m.via}</span> : null}
                    </span>
                    <span className="flex items-center gap-1 text-cc-ink-muted">
                      {m.option.symbol}
                      {selected ? <Check size={14} aria-hidden={true} className="text-cc-information" /> : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
          {open && text.trim() && matches.length === 0 && readCurrencyEntry(text).kind === 'search' ? (
            <span className="cc-text-meta text-cc-ink-muted" data-economics-currency-none="">
              No currency in the list matches â€œ{text.trim()}â€. Type its three-letter ISO 4217 code instead.
            </span>
          ) : null}
          {currency && !problem ? (
            <span className="cc-text-meta text-cc-ink-muted" data-economics-currency-stated={currency}>
              {known ? `${known.code} â€” ${known.name} (${known.symbol})` : `${currency} â€” stated as typed`}
            </span>
          ) : null}
        </div>
      )}
    </CcField>
  );
}

/** The release cadence and its confirmation â€” a proposal until confirmed (ADR-035). */
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
        hint={RATES_HELP.cadence}
        value={perYear}
        onChange={onPerYear}
        kind="cadence"
        suffix="per year"
        data={{ 'data-cost-field': 'release-cadence' }}
      />
      <div data-cost-field="release-cadence-confirmed">
        <CcCheckbox
          label="I confirm this cadence"
          help={perYear === null ? `${RATES_HELP.confirm} Enter releases per year first.` : RATES_HELP.confirm}
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
 * A slider in the field frame of Â§2.7, with what it stands at said in words â€”
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
