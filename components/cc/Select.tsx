'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import type { CcDensity } from './Button';
import CcField, { CC_CONTROL_HEIGHT, type CcValueState } from './Field';

/**
 * Select — `DESIGN.md` §2.7.
 *
 * `CcField` with a native `<select>` in it, so the label, the asterisk, the
 * help text, the value state and `aria-describedby` are the field's and not a
 * second copy of them. Native on purpose: the open list is the operating
 * system's — the one a phone turns into a wheel and a screen reader already
 * knows — and a custom listbox is a month of keyboard bugs for a control that
 * holds five options.
 *
 * `placeholder` is a first, empty option that cannot be chosen again once
 * something is chosen: "Choose a system" is a request, not a value. Without it
 * the first option is pre-selected, which is only right when it is a real
 * default.
 */
export interface CcSelectOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface CcSelectProps<T extends string> {
  label: string;
  options: readonly CcSelectOption<T>[];
  /** `''` with a `placeholder` means nothing is chosen yet. */
  value: T | '';
  onChange: (value: T) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  help?: React.ReactNode;
  valueState?: CcValueState;
  /** Icon + text under the control. For `error`: what is wrong and how to fix it. */
  message?: React.ReactNode;
  /** Validation on blur (§2.7) — never on the first change. */
  onBlur?: () => void;
  name?: string;
  density?: CcDensity;
}

export default function CcSelect<T extends string>({
  label,
  options,
  value,
  onChange,
  placeholder,
  required = false,
  disabled = false,
  help,
  valueState,
  message,
  onBlur,
  name,
  density = 'compact',
}: CcSelectProps<T>) {
  return (
    <CcField label={label} required={required} help={help} valueState={valueState} message={message}>
      {(control) => (
        <select
          id={control.id}
          name={name}
          value={value}
          disabled={disabled}
          required={control.required}
          aria-required={control.ariaRequired}
          aria-invalid={control.invalid || undefined}
          aria-describedby={control.describedBy}
          data-cc-select=""
          onChange={(event) => onChange(event.target.value as T)}
          onBlur={onBlur}
          className={cn(
            control.className,
            CC_CONTROL_HEIGHT[density],
            'cursor-pointer disabled:cursor-not-allowed disabled:bg-cc-surface-muted disabled:text-cc-ink-muted',
          )}
        >
          {placeholder ? (
            <option value="" disabled>
              {placeholder}
            </option>
          ) : null}
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </CcField>
  );
}
