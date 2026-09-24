'use client';

import React, { useId } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CcDensity } from './Button';
import { CC_CONTROL_HEIGHT, CcFieldDetails, CcRequiredMark, describedByOf, type CcValueState } from './Field';
import { STATE_CLASSES } from './state';

/**
 * Checkbox — `DESIGN.md` §2.7: "Checkbox (Label rechts)".
 *
 * A native `<input type="checkbox">`, drawn by us and nothing else. Native, so
 * Space toggles it, a form submits it, `required` means something and a screen
 * reader says "checkbox, checked" without a line of ARIA. Drawn by us, so its
 * edge is `--cc-field-border` (3:1 on white, §1.1) and takes the value state's
 * strong border like every other field. The input *is* the box — not a hidden
 * input behind a painted square — so the focus ring of §1.6 lands on what the
 * reader sees.
 *
 * Checked is `--cc-ink`, not green: ticking a box is a choice, not a proof
 * (§1.1). Under `forced-colors` the box hands itself back to the system
 * (`appearance: auto`), because a checked state painted as a background is
 * exactly what a contrast theme removes.
 *
 * Label, help and value state come from the same parts as `CcField`, so a hint
 * under a checkbox is the hint under an input.
 */
export interface CcCheckboxProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  required?: boolean;
  disabled?: boolean;
  help?: React.ReactNode;
  valueState?: CcValueState;
  /** Icon + text under the control. For `error`: what is wrong and how to fix it. */
  message?: React.ReactNode;
  name?: string;
  value?: string;
  density?: CcDensity;
}

export default function CcCheckbox({
  label,
  checked,
  onChange,
  required = false,
  disabled = false,
  help,
  valueState,
  message,
  name,
  value,
  density = 'compact',
}: CcCheckboxProps) {
  const id = useId();
  const helpId = `${id}-help`;
  const messageId = `${id}-message`;
  const state = valueState ? STATE_CLASSES[valueState] : null;

  return (
    <div data-cc-checkbox={checked ? 'on' : 'off'} data-cc-field={valueState ?? 'none'} className="flex min-w-0 flex-col gap-1">
      <span className={cn('flex items-center gap-2 pointer-coarse:min-h-11', CC_CONTROL_HEIGHT[density])}>
        <span className="relative inline-flex shrink-0">
          <input
            id={id}
            type="checkbox"
            name={name}
            value={value}
            checked={checked}
            disabled={disabled}
            required={required}
            aria-required={required || undefined}
            aria-invalid={valueState === 'error' || undefined}
            aria-describedby={describedByOf({ helpId: !!help && helpId, messageId: !!message && !!valueState && messageId })}
            onChange={(event) => onChange(event.target.checked)}
            className={cn(
              'peer m-0 size-4 shrink-0 cursor-pointer appearance-none rounded-[4px] border bg-cc-surface',
              'checked:bg-cc-ink disabled:cursor-not-allowed disabled:bg-cc-surface-muted disabled:checked:bg-cc-ink-muted',
              'forced-colors:appearance-auto',
              // A value state keeps its border when the box is ticked: the
              // state is what the reader has to see, the tick is on the fill.
              state ? state.borderStrong : 'border-cc-field-border checked:border-cc-ink',
            )}
          />
          <Check
            size={12}
            strokeWidth={3}
            aria-hidden={true}
            className="pointer-events-none absolute top-0.5 left-0.5 hidden text-cc-on-dark peer-checked:block forced-colors:hidden"
          />
        </span>
        <label
          htmlFor={id}
          className={cn('text-[13px] font-medium', disabled ? 'cursor-not-allowed text-cc-ink-muted' : 'cursor-pointer text-cc-ink')}
        >
          {label}
          {required ? <CcRequiredMark /> : null}
        </label>
      </span>
      <CcFieldDetails
        indent="box"
        helpId={helpId}
        help={help}
        messageId={messageId}
        valueState={valueState}
        message={message}
      />
    </div>
  );
}
