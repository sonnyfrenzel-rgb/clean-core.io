'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { CircleAlert, CircleCheck, CircleX, Info, MessageSquare } from 'lucide-react';
import { t, type CcMessageKey } from '@/lib/cc-messages';
import type { SemanticState } from '@/lib/provenance';
import { cn } from '@/lib/utils';
import CcButton, {
  CC_BUTTON_BASE,
  CC_BUTTON_DENSITY_CLASSES,
  CC_BUTTON_VARIANT_CLASSES,
  type CcDensity,
} from './Button';
import { STATE_CLASSES } from './state';

/**
 * The collected checks of an edit — `DESIGN.md` §2.6, §2.3 item 6.
 *
 * Sits in the edit footer next to Discard and Save: a `ghost` button "Checks"
 * with the number of open hints, and above it a list of what the checks found,
 * each with a "Go to" that takes the reader to the element the hint is about.
 * Hints, not blocks: the popover says what to look at, it does not stop a save.
 *
 * Where the other message patterns stand: a Message Strip is *one* notice in
 * its context; this is *many*, collected away from their elements, which is why
 * the jump back to the element is the point of it and not an extra. Without
 * "Go to", a list of eleven hints is a list the reader has to find eleven
 * places for by hand.
 *
 * The jump, by default: the element with `targetId` is scrolled to the middle
 * of the screen and takes the focus (made focusable with `tabindex="-1"` if it
 * was not), and the popover closes. A screen that has to do more first — open a
 * tab, expand a lane — passes `onGoTo` and does its own jump.
 *
 * Not modal: the page stays usable, which is the whole reason to look at the
 * list while editing. Escape closes it and returns the focus to the button;
 * so does a click or a Tab that leaves it. Each hint carries its state as a
 * word for a screen reader, because the icon beside it is only a colour and a
 * shape (§1.1: a state is never colour alone).
 */
export interface CcCheckMessage {
  id: string;
  state: Exclude<SemanticState, 'neutral'>;
  /** What the check found and why it matters, in one or two sentences. */
  text: React.ReactNode;
  /** The DOM id of the element the hint is about. */
  targetId: string;
  /** Its name, for the accessible name of "Go to" — "Gateway Price deviation". */
  targetLabel: string;
}

export interface CcMessagePopoverProps {
  messages: CcCheckMessage[];
  /** Replaces the default jump (scroll + focus by `targetId`). */
  onGoTo?: (message: CcCheckMessage) => void;
  density?: CcDensity;
  /** The footer sits at the bottom of the screen, so the list opens upward. */
  placement?: 'above' | 'below';
}

const ICONS: Record<CcCheckMessage['state'], React.ComponentType<{ size?: number; 'aria-hidden'?: boolean }>> = {
  error: CircleX,
  warning: CircleAlert,
  information: Info,
  success: CircleCheck,
};

const STATE_WORD: Record<CcCheckMessage['state'], CcMessageKey> = {
  error: 'state.error',
  warning: 'state.warning',
  information: 'state.information',
  success: 'state.success',
};

function jumpTo(targetId: string) {
  const target = document.getElementById(targetId);
  if (!target) return;
  if (!target.matches('a[href], button, input, select, textarea, [tabindex]')) {
    target.setAttribute('tabindex', '-1');
  }
  target.scrollIntoView({ block: 'center' });
  target.focus({ preventScroll: true });
}

export default function CcMessagePopover({
  messages,
  onGoTo,
  density = 'compact',
  placement = 'above',
}: CcMessagePopoverProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();
  const titleId = useId();
  const count = messages.length;

  useEffect(() => {
    if (!open) return undefined;
    popoverRef.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Taken in the capture phase and marked, so a dialog underneath — whose
      // listener sits on the same `document` — does not close as well.
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (popoverRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onFocus = (event: FocusEvent) => {
      const target = event.target as Node;
      if (popoverRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('focusin', onFocus);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('focusin', onFocus);
    };
  }, [open]);

  const goTo = (message: CcCheckMessage) => {
    setOpen(false);
    if (onGoTo) onGoTo(message);
    else jumpTo(message.targetId);
  };

  return (
    <span className="relative inline-flex" data-cc-message-popover="">
      {/* The `ghost` button, built from the shared classes rather than through
          `CcButton` because the popover needs a ref to give the focus back to,
          and `CcButton` does not hand one out. Same classes, same data
          attributes: the rendered guard measures it as one of the four. */}
      <button
        ref={triggerRef}
        type="button"
        data-cc-button="ghost"
        data-cc-density={density}
        data-cc-tone="default"
        data-cc-message-popover-trigger=""
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        aria-label={`${t('checks.title')}, ${count} ${t('checks.open')}`}
        onClick={() => (open ? setOpen(false) : setOpen(true))}
        className={cn(
          CC_BUTTON_BASE,
          CC_BUTTON_VARIANT_CLASSES.ghost,
          CC_BUTTON_DENSITY_CLASSES[density],
        )}
      >
        <MessageSquare size={16} aria-hidden={true} />
        {t('checks.title')}
        <span
          aria-hidden={true}
          data-cc-message-count=""
          className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-cc-ink px-2 text-[11px] font-semibold text-cc-on-dark"
        >
          {count}
        </span>
      </button>

      {open ? (
        <div
          ref={popoverRef}
          id={popoverId}
          role="dialog"
          aria-labelledby={titleId}
          tabIndex={-1}
          data-cc-message-popover-panel=""
          className={cn(
            'absolute right-0 z-30 w-[470px] max-w-[calc(100vw-2rem)] rounded-cc-card border border-cc-line bg-cc-surface p-3 text-left shadow-cc-dialog',
            placement === 'above' ? 'bottom-full mb-2' : 'top-full mt-2',
          )}
        >
          <div className="mb-1 flex items-baseline gap-2 px-2">
            {/* Not a heading: the footer this lives in sits under any outline,
                and a fixed level here would skip one somewhere. */}
            <p id={titleId} className="m-0 text-[14px] font-bold text-cc-ink">
              {t('checks.title')}
            </p>
            <span className="text-[12px] font-semibold text-cc-ink-muted">{count}</span>
            <span className="text-[12px] font-medium text-cc-ink-muted">{t('checks.hintsNotBlocks')}</span>
          </div>
          {count === 0 ? (
            <p className="m-0 px-2 py-2 text-[13px] font-medium text-cc-ink-muted">{t('checks.none')}</p>
          ) : (
            <ul className="m-0 list-none p-0">
              {messages.map((message) => {
                const Icon = ICONS[message.state];
                return (
                  <li
                    key={message.id}
                    data-cc-check={message.state}
                    className="grid grid-cols-[18px_minmax(0,1fr)_auto] items-start gap-2 border-t border-cc-line p-2 text-[13px] leading-snug font-medium text-cc-ink first:border-t-0"
                  >
                    <span className={cn('mt-0.5 shrink-0', STATE_CLASSES[message.state].text)}>
                      <Icon size={16} aria-hidden={true} />
                    </span>
                    <span className="min-w-0">
                      <span className="sr-only">{t(STATE_WORD[message.state])}: </span>
                      {message.text}
                    </span>
                    <CcButton
                      variant="ghost"
                      data-cc-check-goto={message.targetId}
                      aria-label={`${t('checks.goTo')} ${message.targetLabel}`}
                      onClick={() => goTo(message)}
                    >
                      {t('checks.goTo')}
                    </CcButton>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </span>
  );
}
