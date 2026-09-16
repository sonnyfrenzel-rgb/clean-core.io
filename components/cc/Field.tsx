'use client';

import React, { useId } from 'react';
import { CircleAlert, CircleCheck, CircleX, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { t } from '@/lib/cc-messages';
import type { SemanticState } from '@/lib/provenance';
import { STATE_CLASSES } from './state';

/**
 * Forms and value states — `DESIGN.md` §2.7.
 *
 * The most-used pattern in the product: confirming a rule, inviting a reader,
 * recording an assumption. Label above the field, help text below it, the
 * asterisk on the label and `aria-required` on the control — both, because a
 * red star is invisible to a screen reader and `aria-required` is invisible to
 * everyone else.
 *
 * The value state is where most form UIs stop being honest. Four rules from
 * §2.7, all enforced by the shape of this component rather than by review:
 *
 *   - the message is **icon plus text**, never a colour on its own;
 *   - `error` says what is wrong *and how it becomes right* — the prop is
 *     called `message` and the examples in the gallery all have both halves;
 *   - `success` appears only where a check actually ran. There is no default
 *     green tick for "you typed something";
 *   - the border in a value state takes the strong variant, because a border
 *     the reader is meant to see needs 3:1 against white (§1.1) and
 *     `--cc-warning-border` at 1.3:1 is a tint, not a signal.
 *
 * Validation timing is the caller's: on blur and on submit, not on the first
 * keystroke (§2.7). Telling someone their email is invalid after they typed
 * "s" is a product that argues with its user.
 */
const VALUE_STATE_ICONS: Record<SemanticState, React.ComponentType<{ size?: number; 'aria-hidden'?: boolean }>> = {
  success: CircleCheck,
  warning: CircleAlert,
  error: CircleX,
  information: Info,
  neutral: Info,
};

export type CcValueState = 'error' | 'warning' | 'success' | 'information';

export interface CcFieldProps {
  label: string;
  required?: boolean;
  /** Under the label, before the control. */
  help?: React.ReactNode;
  valueState?: CcValueState;
  /** Icon + text under the control. For `error`: what is wrong and how to fix it. */
  message?: React.ReactNode;
  children: (control: {
    id: string;
    describedBy: string | undefined;
    invalid: boolean;
    required: boolean;
    className: string;
  }) => React.ReactNode;
}

const CONTROL_BASE =
  'w-full rounded-cc-row border bg-cc-surface px-2.5 py-1.5 text-[13px] font-medium text-cc-ink placeholder:text-cc-ink-muted min-h-[32px]';

export default function CcField({
  label,
  required = false,
  help,
  valueState,
  message,
  children,
}: CcFieldProps) {
  const id = useId();
  const messageId = `${id}-message`;
  const helpId = `${id}-help`;
  const state = valueState ? STATE_CLASSES[valueState] : null;
  const Icon = valueState ? VALUE_STATE_ICONS[valueState] : null;

  const describedBy = [help ? helpId : null, message ? messageId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div data-cc-field={valueState ?? 'none'} className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-[13px] font-semibold text-cc-ink">
        {label}
        {required ? (
          <span className="ml-0.5 text-cc-error" aria-hidden={true}>
            *
          </span>
        ) : null}
      </label>
      {help ? (
        <span id={helpId} className="text-[12px] font-medium text-cc-ink-muted">
          {help}
        </span>
      ) : null}
      {children({
        id,
        describedBy,
        invalid: valueState === 'error',
        required,
        className: cn(CONTROL_BASE, state ? state.borderStrong : 'border-cc-field-border'),
      })}
      {message && state && Icon ? (
        <span
          id={messageId}
          data-cc-value-state={valueState}
          className={cn('flex items-start gap-1.5 text-[12px] font-medium leading-snug', state.text)}
        >
          <Icon size={14} aria-hidden={true} />
          <span>{message}</span>
        </span>
      ) : null}
    </div>
  );
}

/**
 * "* required", once at the top of a form that has required fields (§2.7).
 * Once — not next to every asterisk.
 */
export function CcRequiredNote() {
  return (
    <span data-cc-required-note="" className="text-[12px] font-medium text-cc-ink-muted">
      <span className="text-cc-error">*</span> {t('form.requiredNote')}
    </span>
  );
}
