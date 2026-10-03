'use client';

import React, { useId } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { t } from '@/lib/cc-messages';
import CcIconButton from './IconButton';
import { useCcHydrated, useCcModal } from './modal';

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
 *     opened a form wants to type into it. A dialog without a field may mark
 *     the control the caret belongs on with `data-cc-initial-focus` (D.31:
 *     the terms gate's one way back into the product);
 *   - clicking the dimmed page does **not** close it. A form that vanishes on a
 *     stray click takes the typed text with it. Escape and the close button are
 *     the two ways out, and both are deliberate.
 *
 * With `onSubmit`, body and footer are one `<form>`, so Enter in a field
 * submits and a `type="submit"` button in `actions` is the submit button —
 * the browser's own behaviour rather than a keyboard handler that imitates it.
 * One `primary` in `actions` at most (§1.5: a dialog is one area); `dark` never
 * appears here.
 *
 * Block D, D.5e added three things:
 *
 *   - `dismissible={false}` — a question that has to be answered before
 *     anything else (the terms gate): no close button, Escape does nothing, and
 *     the dimmed page was never a way out. The only ways out are the
 *     `actions`. Everything else modal stays — focus held, page inert.
 *   - `data-*` attributes are handed to the layer, so a caller can be found by
 *     its own name (`data-terms-gate`) without a wrapper element of its own.
 *   - Open on the very first render without a hydration error (see
 *     `useCcHydrated` in `./modal.ts`).
 *
 * The layer sits on `z-cc-overlay` (`app/globals.css`), above every floating
 * helper — nothing may cover a question the page is asking.
 *
 * **On a phone** (narrower than `sm`, or a viewport no taller than 640 px — a
 * phone in landscape) the header holds the title alone, and the lead moves to
 * the top of the scrolling body. With the lead in the fixed header, the terms
 * gate's long explanation plus its stacked buttons left a strip of body a few
 * lines tall on a 360 × 640 screen (03.10.2026). The actions stack full width
 * there, the main action last, every one 44 px tall, and the layer keeps clear
 * of the safe-area insets. The height cap there is the layer's own box
 * (`max-h-full`), not only `100dvh`: a browser without `dvh` drops that
 * declaration, and a dialog with no cap overflows the screen top and bottom
 * with its buttons off it. Wider and taller screens are unchanged.
 */
type CcDialogDismiss =
  | {
      /** The default: Escape and the close button call `onClose`. */
      dismissible?: true;
      /** Escape, the close button, and whatever `actions` call it from. */
      onClose: () => void;
    }
  | {
      /** No close button, Escape does nothing — only the `actions` lead out. */
      dismissible: false;
      onClose?: never;
    };

export type CcDialogProps = CcDialogOwnProps & CcDialogDismiss & {
  /** Handed to the layer element. Only `data-*`: this is a name, not a style. */
  [data: `data-${string}`]: string | undefined;
};

interface CcDialogOwnProps {
  open: boolean;
  title: string;
  /** One sentence under the title — what this dialog is for. Becomes the description. */
  lead?: React.ReactNode;
  children: React.ReactNode;
  /** The footer buttons, `CcButton`s. Cancel (`ghost`) first, the main action last. */
  actions?: React.ReactNode;
  /** Makes body and footer a form; `event.preventDefault()` is already done. */
  onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
  /** `default` 32 rem for a form, `wide` 48 rem for a table or a longer explanation. */
  size?: 'default' | 'wide';
}

const KEEP_OPEN = () => undefined;

/** A phone: narrower than `sm`, or no taller than 640 px (a phone in landscape). */
const PHONE_HIDDEN = 'max-sm:hidden [@media(max-height:640px)]:hidden';
const PHONE_SHOWN = 'max-sm:block [@media(max-height:640px)]:block';

export default function CcDialog(props: CcDialogProps) {
  const { open, title, lead, children, actions, onSubmit, size = 'default' } = props;
  const dismissible = props.dismissible !== false;
  const onClose = props.onClose ?? KEEP_OPEN;
  const layerData: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(props)) {
    if (key.startsWith('data-')) layerData[key] = value as string | undefined;
  }

  const hydrated = useCcHydrated();
  const shown = open && hydrated;
  const dialogRef = useCcModal<HTMLDivElement>({
    open: shown,
    onClose: dismissible ? onClose : KEEP_OPEN,
    initialFocus: 'first-field',
  });
  const titleId = useId();
  const leadId = useId();

  if (!shown) return null;

  const body = (
    <>
      <div
        data-cc-dialog-body=""
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 text-[14px] font-medium leading-relaxed text-cc-ink max-sm:px-4"
      >
        {lead ? (
          // The phone copy of the lead (see above). The header copy carries the
          // id the dialog is described by, so this one stays out of the tree.
          <p
            data-cc-dialog-lead-body=""
            aria-hidden={true}
            className={'mt-0 mb-4 hidden text-[13px] font-medium leading-snug text-cc-ink-muted ' + PHONE_SHOWN}
          >
            {lead}
          </p>
        ) : null}
        {children}
      </div>
      {actions ? (
        <div
          data-cc-dialog-actions=""
          className="flex flex-wrap justify-end gap-2 border-t border-cc-line px-5 py-3 max-sm:flex-col max-sm:flex-nowrap max-sm:items-stretch max-sm:px-4 max-sm:[&>*]:min-h-11 max-sm:[&>*]:w-full max-sm:[&>*]:whitespace-normal"
        >
          {actions}
        </div>
      ) : null}
    </>
  );

  // `cc` on the layer: it is portalled to `body`, outside every `.cc` of the
  // page, and the focus ring of §1.6 is scoped to that class.
  return createPortal(
    <div
      {...layerData}
      data-cc-dialog-layer=""
      data-cc-dismissible={dismissible ? undefined : 'false'}
      className="cc fixed inset-0 z-cc-overlay flex items-center justify-center p-4 max-sm:pt-[max(0.5rem,env(safe-area-inset-top))] max-sm:pr-[max(0.5rem,env(safe-area-inset-right))] max-sm:pb-[max(0.5rem,env(safe-area-inset-bottom))] max-sm:pl-[max(0.5rem,env(safe-area-inset-left))]"
    >
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
          'relative flex max-h-[calc(100dvh-2rem)] w-full min-w-0 flex-col max-sm:max-h-full [@media(max-height:640px)]:max-h-full rounded-cc-card border border-cc-line bg-cc-surface shadow-cc-dialog ' +
          (size === 'wide' ? 'max-w-3xl' : 'max-w-lg')
        }
      >
        <div className="flex items-start gap-3 border-b border-cc-line px-5 py-4 max-sm:px-4 max-sm:py-3">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="m-0 text-[15px] font-bold text-cc-ink [overflow-wrap:anywhere]">
              {title}
            </h2>
            {lead ? (
              // Hidden on a phone, where the body shows it instead; still the
              // dialog's description, because `aria-describedby` reads hidden text.
              <p id={leadId} className={'mt-1 mb-0 text-[13px] font-medium leading-snug text-cc-ink-muted ' + PHONE_HIDDEN}>
                {lead}
              </p>
            ) : null}
          </div>
          {dismissible ? (
            <CcIconButton label={t('action.close')} onClick={onClose} data-cc-dialog-close="">
              <X size={16} aria-hidden={true} />
            </CcIconButton>
          ) : null}
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
