'use client';

import { useEffect, useRef } from 'react';

/**
 * What makes a layer modal — `DESIGN.md` §2.6, ADR-028. Shared by
 * `CcMessageBox` (a confirmation) and `CcDialog` (a form or an explanation), so
 * the two cannot drift into two meanings of the word.
 *
 * While `open`:
 *
 *   - every child of `body` except the layer goes `inert` — it cannot be tabbed
 *     into, clicked or read by a screen reader. `inert` is inherited, so this
 *     only works because both components portal their layer to `body`; a layer
 *     buried in the tree being switched off would switch itself off with it;
 *   - the focus moves into the layer and Tab / Shift+Tab wrap inside it;
 *   - Escape calls `onClose`;
 *   - on close, the focus goes back to whatever had it before — the button that
 *     opened the layer.
 *
 * Two layers can be open at once only as a stack — a dialog that asks a message
 * box "discard these changes?". The upper one makes the lower one inert like
 * everything else, and the lower one then ignores Escape and Tab: a key
 * belongs to the layer the person is looking at, not to every layer that
 * happens to listen on `document`.
 *
 * `onClose` is read through a ref. A caller that passes an inline arrow
 * re-renders with a new function on every keystroke in a form, and an effect
 * that depended on it would tear the layer down and build it up again each time
 * — the focus jumping back to the start of the dialog while someone types.
 */

/** What a Tab stop inside a layer is. Disabled controls are not stops. */
export const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface CcModalOptions {
  open: boolean;
  onClose: () => void;
  /**
   * Where the focus goes when the layer opens. `container` — the layer itself,
   * for a confirmation, so the default focus never rests on the irreversible
   * button. `first-field` — the first input, select or textarea, for a form,
   * falling back to the layer when there is none.
   */
  initialFocus?: 'container' | 'first-field';
}

/**
 * Returns the ref to put on the element with `role="dialog"`. That element's
 * parent is the portalled layer, which is what stays reachable.
 */
export function useCcModal<T extends HTMLElement>({
  open,
  onClose,
  initialFocus = 'container',
}: CcModalOptions) {
  const layerRef = useRef<T>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;

    const opener = document.activeElement as HTMLElement | null;
    const box = layerRef.current;
    const container = box?.parentElement ?? null;

    const siblings: HTMLElement[] = [];
    if (container) {
      for (const node of Array.from(document.body.children)) {
        if (node === container || !(node instanceof HTMLElement)) continue;
        if (node.hasAttribute('inert')) continue;
        node.setAttribute('inert', '');
        siblings.push(node);
      }
    }

    const field =
      initialFocus === 'first-field'
        ? box?.querySelector<HTMLElement>(
            'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])',
          )
        : null;
    (field ?? box)?.focus();

    const onKey = (event: KeyboardEvent) => {
      // A layer that another layer has made inert is not the one being used.
      if (!box || box.closest('[inert]')) return;
      if (event.defaultPrevented) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(box.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) {
        event.preventDefault();
        box.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      // From the layer itself (its initial focus) or from outside it, Tab
      // enters at the edge it points to.
      if (!box.contains(active) || active === box) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      for (const node of siblings) node.removeAttribute('inert');
      opener?.focus();
    };
  }, [open, initialFocus]);

  return layerRef;
}
