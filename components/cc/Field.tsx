'use client';

import React, { useId } from 'react';
import { CircleAlert, CircleCheck, CircleX, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { t } from '@/lib/cc-messages';
import type { SemanticState } from '@/lib/provenance';
import { STATE_CLASSES } from './state';
import type { CcDensity } from './Button';

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
    /**
     * Put this on the control as `aria-required`. A native `required` says it
     * too, but a custom control has no native attribute, and §2.7 asks for the
     * asterisk *and* `aria-required` — so the contract hands out both, and a
     * caller cannot pass one without the other (QA c07adecd2fb5, 14f0276e65ff).
     */
    ariaRequired: true | undefined;
    className: string;
  }) => React.ReactNode;
}

const CONTROL_BASE =
  'w-full rounded-cc-row border bg-cc-surface px-3 py-1 text-[13px] font-medium text-cc-ink placeholder:text-cc-ink-muted min-h-[32px]';

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

  const describedBy = describedByOf({ helpId: !!help && helpId, messageId: !!message && !!valueState && messageId });

  return (
    <div data-cc-field={valueState ?? 'none'} className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-[13px] font-semibold text-cc-ink">
        {label}
        {required ? <CcRequiredMark /> : null}
      </label>
      <CcFieldHelp id={helpId}>{help}</CcFieldHelp>
      {children({
        id,
        describedBy,
        invalid: valueState === 'error',
        required,
        ariaRequired: required || undefined,
        className: cn(CONTROL_BASE, state ? state.borderStrong : 'border-cc-field-border'),
      })}
      <CcFieldMessage id={messageId} valueState={valueState} message={message} />
    </div>
  );
}

/**
 * 32px compact, 40px cozy (§2.7) — the height of the button beside the
 * control. A select takes it as its own height; a checkbox, radio or switch as
 * the height of its row, so the whole row is the target.
 */
export const CC_CONTROL_HEIGHT: Record<CcDensity, string> = {
  compact: 'min-h-8',
  cozy: 'min-h-10',
};

/**
 * The asterisk on a required label. Hidden from the screen reader, which hears
 * `aria-required` on the control instead — both, as the header above says.
 */
export function CcRequiredMark() {
  return (
    <span data-cc-required-mark="" className="ml-1 text-cc-error" aria-hidden={true}>
      *
    </span>
  );
}

/**
 * The help text of a field: under the label, before the control (§2.7).
 * Exported for the controls whose label does not sit above them — checkbox,
 * radio group, switch — so the hint looks the same wherever it stands.
 */
export function CcFieldHelp({ id, children }: { id: string; children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <span id={id} className="text-[12px] font-medium text-cc-ink-muted">
      {children}
    </span>
  );
}

/**
 * The value state under a control: icon plus text, never a colour on its own
 * (§2.7). Renders nothing without both a state and a message — a state with
 * nothing to say is a coloured border that explains nothing.
 */
export function CcFieldMessage({
  id,
  valueState,
  message,
}: {
  id: string;
  valueState?: CcValueState;
  message?: React.ReactNode;
}) {
  if (!valueState || !message) return null;
  const state = STATE_CLASSES[valueState];
  const Icon = VALUE_STATE_ICONS[valueState];
  return (
    <span
      id={id}
      data-cc-value-state={valueState}
      className={cn('flex items-start gap-1 text-[12px] font-medium leading-snug', state.text)}
    >
      <Icon size={14} aria-hidden={true} />
      <span>{message}</span>
    </span>
  );
}

/**
 * Help and value state together, for a control whose label sits beside it.
 * `indent` lines both up with the label rather than the control: a 16px box
 * or a 36px switch, and the 8px gap after it.
 */
const DETAILS_INDENT = { box: 'pl-6', switch: 'pl-11' } as const;

export function CcFieldDetails({
  indent,
  helpId,
  help,
  messageId,
  valueState,
  message,
}: {
  indent?: keyof typeof DETAILS_INDENT;
  helpId: string;
  help?: React.ReactNode;
  messageId: string;
  valueState?: CcValueState;
  message?: React.ReactNode;
}) {
  if (!help && !(valueState && message)) return null;
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', indent && DETAILS_INDENT[indent])}>
      <CcFieldHelp id={helpId}>{help}</CcFieldHelp>
      <CcFieldMessage id={messageId} valueState={valueState} message={message} />
    </div>
  );
}

/**
 * Which of help and message exist, as one `aria-describedby` — the same rule
 * for every control, so a hint is never visible and unspoken.
 */
export function describedByOf(ids: { helpId?: string | false; messageId?: string | false }): string | undefined {
  return [ids.helpId, ids.messageId].filter(Boolean).join(' ') || undefined;
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
