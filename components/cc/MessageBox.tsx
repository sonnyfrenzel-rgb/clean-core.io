'use client';

import React, { useEffect, useId, useRef } from 'react';
import { t } from '@/lib/cc-messages';
import CcButton from './Button';

/**
 * Confirmation before something that cannot be taken back — `DESIGN.md` §2.6.
 *
 * Delete, revoke, decide. Never `window.confirm`, which cannot say what the
 * consequences are and cannot be styled to look like it belongs to this
 * product.
 *
 * Modal in the full sense (ADR-028), and every part of that is load-bearing:
 *
 *   - the page behind is dimmed **and `inert`**, so it cannot be tabbed into,
 *     clicked or read by a screen reader while a question is open;
 *   - the focus starts in the box and is held there;
 *   - closing returns the focus to the button that opened it.
 *
 * Which together mean a second confirmation can never appear beside the first —
 * the failure this replaced, where a delete dialog and a revoke dialog could
 * both be open with the page scrolling behind them.
 *
 * The binding confirmation is the `dark` button (§1.5) and it is the only place
 * that variant appears. `Cancel` is `ghost` and comes first in the DOM, so
 * Escape and the default focus both lead away from the irreversible thing.
 */
export interface CcMessageBoxProps {
  open: boolean;
  title: string;
  /** The consequences, in words. A box that says "Are you sure?" says nothing. */
  children: React.ReactNode;
  /** Label of the binding action — "Delete project", "Revoke access". */
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function CcMessageBox({
  open,
  title,
  children,
  confirmLabel,
  onConfirm,
  onCancel,
}: CcMessageBoxProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return undefined;

    openerRef.current = document.activeElement as HTMLElement | null;

    // Everything that is not the dialog goes inert. Marking the siblings rather
    // than the whole body keeps the dialog itself reachable — `inert` is
    // inherited, so a body-level flag would take the box with it.
    const container = boxRef.current?.parentElement;
    const siblings: HTMLElement[] = [];
    if (container) {
      for (const node of Array.from(document.body.children)) {
        if (node === container || !(node instanceof HTMLElement)) continue;
        if (node.hasAttribute('inert')) continue;
        node.setAttribute('inert', '');
        siblings.push(node);
      }
    }

    boxRef.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = boxRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      for (const node of siblings) node.removeAttribute('inert');
      openerRef.current?.focus();
    };
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div data-cc-message-box-layer="" className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        data-cc-scrim=""
        aria-hidden={true}
        onClick={onCancel}
        className="absolute inset-0 bg-cc-overlay/45"
      />
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-cc-message-box=""
        className="relative w-full max-w-lg rounded-cc-card border border-cc-line bg-cc-surface p-5 shadow-cc-dialog"
      >
        <h3 id={titleId} className="m-0 text-[16px] font-bold text-cc-ink">
          {title}
        </h3>
        <div className="mt-2 text-[13px] font-medium leading-relaxed text-cc-ink">{children}</div>
        <div className="mt-4 flex justify-end gap-2">
          <CcButton variant="ghost" onClick={onCancel}>
            {t('action.cancel')}
          </CcButton>
          <CcButton variant="dark" onClick={onConfirm}>
            {confirmLabel}
          </CcButton>
        </div>
      </div>
    </div>
  );
}
