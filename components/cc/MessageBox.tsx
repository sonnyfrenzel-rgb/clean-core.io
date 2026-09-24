'use client';

import React, { useId } from 'react';
import { createPortal } from 'react-dom';
import { t } from '@/lib/cc-messages';
import CcButton from './Button';
import { useCcModal } from './modal';

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
  // Inert page, focus held, Escape, focus returned: `./modal.ts`, shared with
  // `CcDialog`. The box itself takes the first focus, not the confirm button,
  // so a stray Enter cannot delete anything.
  const boxRef = useCcModal<HTMLDivElement>({ open, onClose: onCancel, initialFocus: 'container' });
  const titleId = useId();

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div data-cc-message-box-layer="" className="cc fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        data-cc-scrim=""
        data-backdrop=""
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
        <h3 id={titleId} className="m-0 text-[15px] font-bold text-cc-ink">
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
    </div>,
    document.body,
  );
}
