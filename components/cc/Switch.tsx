'use client';

import React, { useId } from 'react';
import { cn } from '@/lib/utils';
import type { CcDensity } from './Button';
import { CC_CONTROL_HEIGHT, CcFieldDetails, describedByOf, type CcValueState } from './Field';
import { STATE_CLASSES } from './state';

/**
 * Switch — `DESIGN.md` §2.7, UX-065.
 *
 * For a setting that takes effect the moment it is flipped: "Show line
 * anchors", "E-mail me when a reader comments". Anything that waits for a Save
 * button is a checkbox; a switch that does nothing until Save is a switch that
 * lies about when it acts.
 *
 * A `<button role="switch" aria-checked>` — the pattern UX-065 asked for,
 * because a styled checkbox is announced as a checkbox and a toggle painted on
 * a `<div>` is announced as nothing. Space and Enter flip it (it is a button),
 * and the `<label htmlFor>` beside it both names it and is a click target.
 *
 * On is `--cc-ink` with the thumb to the right, not green: a switched-on
 * setting is a state, not a proof (§1.1). The thumb's *position* carries the
 * state as well as its colour, and under `forced-colors` the thumb keeps a
 * system colour (`Highlight` when on) so the state survives a contrast theme.
 * The thumb moves in 150ms and not at all under reduced motion (§1.7).
 */
export interface CcSwitchProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  help?: React.ReactNode;
  valueState?: CcValueState;
  /** Icon + text under the control — e.g. why the setting cannot be changed now. */
  message?: React.ReactNode;
  density?: CcDensity;
}

export default function CcSwitch({
  label,
  checked,
  onChange,
  disabled = false,
  help,
  valueState,
  message,
  density = 'compact',
}: CcSwitchProps) {
  const id = useId();
  const helpId = `${id}-help`;
  const messageId = `${id}-message`;
  const state = valueState ? STATE_CLASSES[valueState] : null;

  return (
    <div data-cc-switch={checked ? 'on' : 'off'} className="flex min-w-0 flex-col gap-1">
      <span className={cn('flex items-center gap-2 pointer-coarse:min-h-11', CC_CONTROL_HEIGHT[density])}>
        <button
          id={id}
          type="button"
          role="switch"
          aria-checked={checked}
          aria-invalid={valueState === 'error' || undefined}
          aria-describedby={describedByOf({ helpId: !!help && helpId, messageId: !!message && !!valueState && messageId })}
          disabled={disabled}
          onClick={() => onChange(!checked)}
          className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full disabled:cursor-not-allowed"
        >
          {/* The track and the thumb are painted inside the button, not on it:
              the button stays one of the four (§1.5) and only its ring shows. */}
          <span
            aria-hidden={true}
            data-cc-switch-track=""
            className={cn(
              'pointer-events-none absolute inset-0 rounded-full border',
              checked ? 'bg-cc-ink' : 'bg-cc-surface',
              state ? state.borderStrong : checked ? 'border-cc-ink' : 'border-cc-field-border',
              disabled && (checked ? 'bg-cc-ink-muted' : 'bg-cc-surface-muted'),
            )}
          />
          <span
            aria-hidden={true}
            data-cc-switch-thumb=""
            className={cn(
              'pointer-events-none absolute top-1 left-1 size-3 rounded-full forced-color-adjust-none',
              'motion-safe:transition-transform motion-safe:duration-150',
              checked
                ? 'translate-x-4 bg-cc-on-dark forced-colors:bg-[color:Highlight]'
                : 'translate-x-0 bg-cc-ink-muted forced-colors:bg-[color:CanvasText]',
            )}
          />
        </button>
        <label
          htmlFor={id}
          className={cn('text-[13px] font-medium', disabled ? 'cursor-not-allowed text-cc-ink-muted' : 'cursor-pointer text-cc-ink')}
        >
          {label}
        </label>
      </span>
      <CcFieldDetails
        indent="switch"
        helpId={helpId}
        help={help}
        messageId={messageId}
        valueState={valueState}
        message={message}
      />
    </div>
  );
}
