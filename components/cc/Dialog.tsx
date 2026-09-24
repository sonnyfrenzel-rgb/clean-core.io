'use client';

import React, { useId } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { t } from '@/lib/cc-messages';
import CcIconButton from './IconButton';
import { useCcModal } from './modal';

/**
 * A dialog for a form or an explanation — `DESIGN.md` §2.6, §2.7.
 *
 * The sibling of `CcMessageBox`, and the line between them is the question
 * each one asks. The message box asks "really?" before something that cannot be
 * taken back, and its only buttons are Cancel and the binding one. This one
 * asks for input — invite a reader, import usage, record an assumption — or
 * shows something that needs the whole screen for a moment. Destructive
 * confirmation does not belong here; a dialog that grows a red "Delete" has
 * become a message box without the guarantees of one.
 *
 * Modal in the same sense and through the same code (`./modal.ts`): the page
 * behind is dimmed and `inert`, the focus starts inside and cannot leave,
 * Escape closes, and closing gives the focus back to the button that opened it.
 * It is announced as `aria-modal` and named by its title.
 *
 * Two decisions that differ from the message box, on purpose:
 *
 *   - the focus starts on the **first field**, not on the layer: someone who
 *     opened a form wants to type into it;
 *   - clicking the dimmed page does **not** close it. A form that vanishes on a
 *     stray click takes the typed text with it. Escape and the close button are
 *     the two ways out, and both are deliberate.
 *
 * With `onSubmit`, body and footer are one `<form>`, so Enter in a field
 * submits and a `type="submit"` button in `actions` is the submit button —
 * the browser's own behaviour rather than a keyboard handler that imitates it.
 * One `primary` in `actions` at most (§1.5: a dialog is one area); `dark` never
 * appears here.
 */
export interface CcDialogProps {
  open: boolean;
  title: string;
  /** One sentence under the title — what this dialog is for. Becomes the description. */
  lead?: React.ReactNode;
  children: React.ReactNode;
  /** The footer buttons, `CcButton`s. Cancel (`ghost`) first, the main action last. */
  actions?: React.ReactNode;
  /** Escape, the close button, and whatever `actions` call it from. */
  onClose: () => void;
  /** Makes body and footer a form; `event.preventDefault()` is already done. */
  onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
  /** `default` 32 rem for a form, `wide` 48 rem for a table or a longer explanation. */
  size?: 'default' | 'wide';
}

export default function CcDialog({
  open,
  title,
  lead,
  children,
  actions,
  onClose,
  onSubmit,
  size = 'default',
}: CcDialogProps) {
  const dialogRef = useCcModal<HTMLDivElement>({ open, onClose, initialFocus: 'first-field' });
  const titleId = useId();
  const leadId = useId();

  if (!open || typeof document === 'undefined') return null;

  const body = (
    <>
      <div
        data-cc-dialog-body=""
        className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-[14px] font-medium leading-relaxed text-cc-ink"
      >
        {children}
      </div>
      {actions ? (
        <div
          data-cc-dialog-actions=""
          className="flex flex-wrap justify-end gap-2 border-t border-cc-line px-5 py-3"
        >
          {actions}
        </div>
      ) : null}
    </>
  );

  // `cc` on the layer: it is portalled to `body`, outside every `.cc` of the
  // page, and the focus ring of §1.6 is scoped to that class.
  return createPortal(
    <div data-cc-dialog-layer="" className="cc fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Dimmed, and deliberately not a way out — see above. */}
      <div data-cc-scrim="" aria-hidden={true} className="absolute inset-0 bg-cc-overlay/45" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={lead ? leadId : undefined}
        tabIndex={-1}
        data-cc-dialog=""
        data-cc-dialog-size={size}
        className={
          'relative flex max-h-[calc(100dvh-2rem)] w-full flex-col rounded-cc-card border border-cc-line bg-cc-surface shadow-cc-dialog ' +
          (size === 'wide' ? 'max-w-3xl' : 'max-w-lg')
        }
      >
        <div className="flex items-start gap-3 border-b border-cc-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="m-0 text-[15px] font-bold text-cc-ink">
              {title}
            </h2>
            {lead ? (
              <p id={leadId} className="mt-1 mb-0 text-[13px] font-medium leading-snug text-cc-ink-muted">
                {lead}
              </p>
            ) : null}
          </div>
          <CcIconButton label={t('action.close')} onClick={onClose} data-cc-dialog-close="">
            <X size={16} aria-hidden={true} />
          </CcIconButton>
        </div>
        {onSubmit ? (
          // `noValidate`: §2.7 checks on leaving a field and on submit, with the
          // value state at the field and a Message Strip on top — not with the
          // browser's own bubble, which cannot be styled, read or linked to.
          <form
            noValidate
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit(event);
            }}
          >
            {body}
          </form>
        ) : (
          body
        )}
      </div>
    </div>,
    document.body,
  );
}
