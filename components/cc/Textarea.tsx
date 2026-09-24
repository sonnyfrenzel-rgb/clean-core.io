'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import CcField, { type CcValueState } from './Field';

/**
 * Textarea — `DESIGN.md` §2.7.
 *
 * `CcField` with a `<textarea>` in it: the same label, help text, asterisk,
 * value state and border as an input, so a note and a date in the same form
 * are one family. It grows downward only (`resize-y`) — a field that can be
 * dragged wider than its column breaks the grid of the form it stands in.
 *
 * `maxLength` is passed through and nothing is counted on screen: a counter
 * that updates on every keystroke is a live region nobody asked for (§2.8).
 * Say the limit in `help` when it matters.
 */
export interface CcTextareaProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Visible lines before it scrolls. Three is enough for a note. */
  rows?: number;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  maxLength?: number;
  help?: React.ReactNode;
  valueState?: CcValueState;
  /** Icon + text under the control. For `error`: what is wrong and how to fix it. */
  message?: React.ReactNode;
  /** Validation on blur (§2.7) — never on the first keystroke. */
  onBlur?: () => void;
  name?: string;
}

export default function CcTextarea({
  label,
  value,
  onChange,
  rows = 3,
  placeholder,
  required = false,
  disabled = false,
  readOnly = false,
  maxLength,
  help,
  valueState,
  message,
  onBlur,
  name,
}: CcTextareaProps) {
  return (
    <CcField label={label} required={required} help={help} valueState={valueState} message={message}>
      {(control) => (
        <textarea
          id={control.id}
          name={name}
          value={value}
          rows={rows}
          placeholder={placeholder}
          disabled={disabled}
          readOnly={readOnly}
          maxLength={maxLength}
          required={control.required}
          aria-required={control.ariaRequired}
          aria-invalid={control.invalid || undefined}
          aria-describedby={control.describedBy}
          data-cc-textarea=""
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          className={cn(
            control.className,
            'resize-y py-2 leading-normal disabled:cursor-not-allowed disabled:bg-cc-surface-muted disabled:text-cc-ink-muted read-only:bg-cc-surface-muted',
          )}
        />
      )}
    </CcField>
  );
}
