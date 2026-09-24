'use client';

import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'summary',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

// Open dialogs, innermost last. Only the topmost one handles Tab and Escape, so
// a dialog opened from inside another (a legal text from the sign-up form)
// does not have its focus pulled back by the one underneath.
const openDialogs: HTMLElement[] = [];

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.closest('[inert]') && el.getClientRects().length > 0,
  );
}

/**
 * Modal focus management for a dialog that is rendered while `open` is true
 * (roadmap 3.0.4, WCAG 2.1.2 / 2.4.3):
 *
 *   - on open, focus moves into the dialog — the element marked
 *     `data-autofocus`, else the first focusable element, else the dialog itself
 *     (give it `tabIndex={-1}`);
 *   - Tab and Shift+Tab cycle inside the dialog;
 *   - Escape calls `onEscape` when one is given (a mandatory dialog passes none);
 *   - on close or unmount, focus returns to whatever had it before opening.
 *
 * The caller still owns the semantics: `role="dialog"`, `aria-modal="true"` and
 * `aria-labelledby` on the element this ref points at.
 */
export function useDialogFocus<T extends HTMLElement = HTMLDivElement>(
  open: boolean,
  onEscape?: () => void,
): RefObject<T | null> {
  const ref = useRef<T | null>(null);
  const escapeRef = useRef(onEscape);

  useEffect(() => {
    escapeRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    if (!open) return;
    const root = ref.current;
    if (!root) return;

    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    openDialogs.push(root);

    if (!root.contains(document.activeElement)) {
      const preferred = root.querySelector<HTMLElement>('[data-autofocus]');
      const target = preferred ?? focusables(root)[0] ?? root;
      target.focus({ preventScroll: true });
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (openDialogs[openDialogs.length - 1] !== root) return;
      if (event.key === 'Escape' && escapeRef.current) {
        event.stopPropagation();
        escapeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusables(root);
      if (items.length === 0) {
        event.preventDefault();
        root.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !root.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !root.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      const index = openDialogs.lastIndexOf(root);
      if (index !== -1) openDialogs.splice(index, 1);
      if (previous && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, [open]);

  return ref;
}
