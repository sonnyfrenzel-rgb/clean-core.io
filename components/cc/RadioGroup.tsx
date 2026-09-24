'use client';

import React, { useId } from 'react';
import { cn } from '@/lib/utils';
import type { CcDensity } from './Button';
import { CC_CONTROL_HEIGHT, CcFieldHelp, CcFieldMessage, CcRequiredMark, describedByOf, type CcValueState } from './Field';
import { STATE_CLASSES } from './state';

/**
 * Radio group — `DESIGN.md` §2.7: "Radio-Gruppe mit Legende".
 *
 * A `<fieldset>` with a `<legend>`, and native radios sharing one `name`. That
 * is the whole keyboard contract, and the browser already keeps it: Tab reaches
 * the group once, on the chosen option; the arrow keys move the choice inside
 * it. Nothing here re-implements that, because a hand-rolled roving tabindex is
 * the one that forgets Home and End.
 *
 * The group carries `role="radiogroup"` so it can say `aria-required` and
 * `aria-invalid` — a required *choice* is a property of the group, not of any
 * one option. It is named by its legend explicitly, so the name survives the
 * role.
 *
 * Not a segmented control (§1.5). A segmented control switches a view or takes
 * a decision in place; a radio group is a question in a form, with options
 * long enough to need a line each, and optionally a hint per option.
 */
export interface CcRadioOption<T extends string> {
  value: T;
  label: string;
  /** One line under the option — what choosing it means. */
  help?: React.ReactNode;
  disabled?: boolean;
}

export interface CcRadioGroupProps<T extends string> {
  legend: string;
  options: readonly CcRadioOption<T>[];
  /** `null` until the reader has chosen — no option is pre-selected for them. */
  value: T | null;
  onChange: (value: T) => void;
  required?: boolean;
  disabled?: boolean;
  help?: React.ReactNode;
  valueState?: CcValueState;
  /** Icon + text under the group. For `error`: what is wrong and how to fix it. */
  message?: React.ReactNode;
  /** The form name of the radios; generated when the group is not submitted as a form. */
  name?: string;
  orientation?: 'vertical' | 'horizontal';
  density?: CcDensity;
}

export default function CcRadioGroup<T extends string>({
  legend,
  options,
  value,
  onChange,
  required = false,
  disabled = false,
  help,
  valueState,
  message,
  name,
  orientation = 'vertical',
  density = 'compact',
}: CcRadioGroupProps<T>) {
  const id = useId();
  const legendId = `${id}-legend`;
  const helpId = `${id}-help`;
  const messageId = `${id}-message`;
  const hasMessage = !!message && !!valueState;
  const state = valueState ? STATE_CLASSES[valueState] : null;
  const groupName = name ?? `${id}-radio`;

  return (
    <fieldset
      role="radiogroup"
      aria-labelledby={legendId}
      aria-required={required || undefined}
      aria-invalid={valueState === 'error' || undefined}
      aria-describedby={describedByOf({ helpId: !!help && helpId, messageId: hasMessage && messageId })}
      disabled={disabled}
      data-cc-radio-group={valueState ?? 'none'}
      className="m-0 flex min-w-0 flex-col gap-1 border-0 p-0"
    >
      <legend id={legendId} className="mb-1 p-0 text-[13px] font-semibold text-cc-ink">
        {legend}
        {required ? <CcRequiredMark /> : null}
      </legend>
      <CcFieldHelp id={helpId}>{help}</CcFieldHelp>
      <div className={cn('flex', orientation === 'horizontal' ? 'flex-row flex-wrap gap-x-4' : 'flex-col')}>
        {options.map((option) => {
          const optionId = `${id}-${option.value}`;
          const optionHelpId = `${optionId}-help`;
          const optionDisabled = disabled || !!option.disabled;
          return (
            <div key={option.value} className="flex min-w-0 flex-col">
              <span className={cn('flex items-center gap-2 pointer-coarse:min-h-11', CC_CONTROL_HEIGHT[density])}>
                <span className="relative inline-flex shrink-0">
                  <input
                    id={optionId}
                    type="radio"
                    name={groupName}
                    value={option.value}
                    checked={value === option.value}
                    disabled={optionDisabled}
                    required={required}
                    aria-describedby={describedByOf({
                      helpId: !!option.help && optionHelpId,
                      messageId: hasMessage && messageId,
                    })}
                    onChange={() => onChange(option.value)}
                    className={cn(
                      'peer m-0 size-4 shrink-0 cursor-pointer appearance-none rounded-full border bg-cc-surface',
                      'disabled:cursor-not-allowed disabled:bg-cc-surface-muted',
                      'forced-colors:appearance-auto',
                      state ? state.borderStrong : 'border-cc-field-border checked:border-cc-ink',
                    )}
                  />
                  <span
                    aria-hidden={true}
                    className={cn(
                      'pointer-events-none absolute top-1 left-1 hidden size-2 rounded-full peer-checked:block forced-colors:hidden',
                      optionDisabled ? 'bg-cc-ink-muted' : 'bg-cc-ink',
                    )}
                  />
                </span>
                <label
                  htmlFor={optionId}
                  className={cn(
                    'text-[13px] font-medium',
                    optionDisabled ? 'cursor-not-allowed text-cc-ink-muted' : 'cursor-pointer text-cc-ink',
                  )}
                >
                  {option.label}
                </label>
              </span>
              {option.help ? (
                <span className="flex pl-6">
                  <CcFieldHelp id={optionHelpId}>{option.help}</CcFieldHelp>
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
      <CcFieldMessage id={messageId} valueState={valueState} message={message} />
    </fieldset>
  );
}
