'use client';

import React, { useEffect, useRef } from 'react';
import { CircleAlert, CircleCheck, CircleX, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SemanticState } from '@/lib/provenance';
import { STATE_CLASSES } from './state';

/**
 * A notice in its context — `DESIGN.md` §2.6.
 *
 * Sits at the top of the section it is about: a lock, a stale result, example
 * data, the summary of a form that would not submit, a run that failed.
 *
 * The rule that is easy to get wrong, and the reason for the `announce` prop: a
 * strip that **appears after an action** takes the focus, because the person
 * pressed a button and the answer is up here now, three hundred pixels from
 * where they were looking. A strip that was on the page all along — the lock
 * notice, the demo-data notice — does not, because stealing focus from someone
 * who is reading is worse than the notice is useful.
 *
 * Errors get an action, never a raw error text and never a silent empty result
 * (§2.8): "Retry", "Run without model", "Keep technical names".
 */
const ICONS: Record<SemanticState, React.ComponentType<{ size?: number; 'aria-hidden'?: boolean }>> = {
  success: CircleCheck,
  warning: CircleAlert,
  error: CircleX,
  information: Info,
  neutral: Info,
};

export interface CcMessageStripProps {
  state: SemanticState;
  /** The first, bold half — what happened. */
  headline?: React.ReactNode;
  children: React.ReactNode;
  /** What to do about it. An error strip without one is a dead end. */
  actions?: React.ReactNode;
  /**
   * Set only for a strip that appeared in answer to an action. It becomes
   * focusable and takes the focus once, which is what §2.6 asks for.
   */
  announce?: boolean;
}

export default function CcMessageStrip({
  state,
  headline,
  children,
  actions,
  announce = false,
}: CcMessageStripProps) {
  const ref = useRef<HTMLDivElement>(null);
  const classes = STATE_CLASSES[state];
  const Icon = ICONS[state];

  useEffect(() => {
    if (announce) ref.current?.focus();
  }, [announce]);

  return (
    <div
      ref={ref}
      data-cc-message-strip={state}
      role={state === 'error' ? 'alert' : 'status'}
      tabIndex={announce ? -1 : undefined}
      className={cn(
        'flex items-start gap-2.5 rounded-cc-row border px-3 py-2',
        'text-[13px] font-medium leading-snug text-cc-ink',
        classes.bg,
        classes.border,
      )}
    >
      <span className={cn('mt-0.5 shrink-0', classes.text)}>
        <Icon size={16} aria-hidden={true} />
      </span>
      <span className="min-w-0 flex-1">
        {headline ? <b className="font-semibold">{headline}</b> : null}
        {headline ? ' ' : null}
        {children}
      </span>
      {actions ? <span className="flex shrink-0 items-center gap-1.5">{actions}</span> : null}
    </div>
  );
}
