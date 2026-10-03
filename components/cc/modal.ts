'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';

const noSubscription = () => () => {};

/**
 * `false` on the server and during hydration, `true` in every render after it.
 *
 * Both layers portal to `document.body`, which the server does not have: the
 * server renders nothing, and a client that rendered the portal on its first
 * pass would disagree with that HTML — React throws the page away with a
 * hydration error. A layer that is open on the very first render (a dialog
 * opened from the address, a gate that has to be answered before anything
 * else) did exactly that. With this, the first client render equals the
 * server's and the layer opens one render later; a layer opened by a click is
 * unaffected, because by then hydration is long over.
 *
 * Block D, D.5e — lifted from `app/components/LegalOverlay.tsx`, which solved
 * it locally for the one dialog that had hit it.
 */
export function useCcHydrated(): boolean {
  return useSyncExternalStore(noSubscription, () => true, () => false);
}

function subscribeFullscreen(onChange: () => void): () => void {
  document.addEventListener('fullscreenchange', onChange);
  return () => document.removeEventListener('fullscreenchange', onChange);
}

/**
 * Where a layer is portalled: `body`, or the element the browser shows in full
 * screen while it shows one.
 *
 * With the Fullscreen API only the full-screen element's subtree is drawn. A
 * dialog portalled to `body` while a canvas is in full screen was drawn
 * nowhere — opened, holding the focus, and invisible (owner 03.10.2026: "in
 * full screen I can't open the evidence boxes"). Inside the full-screen
 * element it is on screen, and when full screen ends it moves back to `body`.
 */
export function useCcPortalTarget(): HTMLElement | null {
  return useSyncExternalStore(
    subscribeFullscreen,
    () => (document.fullscreenElement as HTMLElement | null) ?? document.body,
    () => null,
  );
}

/** True while a modal layer (`CcDialog`, `CcMessageBox`) is open — Escape is the layer's then. */
export function ccModalOpen(): boolean {
  return typeof document !== 'undefined' && document.querySelector('[aria-modal="true"]') !== null;
}

interface KeyboardLock {
  lock?(keys: string[]): Promise<void>;
  unlock?(): void;
}

/**
 * Escape for a layer over full screen, not for the browser.
 *
 * In the browser's own full screen a real Escape leaves full screen before the
 * page sees it, so a layer opened in full screen could not be closed with
 * Escape without throwing the reader out of full screen as well. Where the
 * browser has the Keyboard Lock API (Chromium), the layer asks for the key
 * while it is open: Escape closes the layer, a second one leaves full screen,
 * and holding Escape still leaves it at once, as the browser promises. Where
 * there is no such API, the browser's own behaviour stands.
 *
 * Returns the release, for the layer's cleanup.
 */
export function holdEscapeInFullscreen(): () => void {
  if (typeof document === 'undefined' || !document.fullscreenElement) return () => {};
  const keyboard = (navigator as Navigator & { keyboard?: KeyboardLock }).keyboard;
  if (!keyboard?.lock) return () => {};
  let held = true;
  void keyboard.lock(['Escape']).catch(() => {
    held = false;
  });
  return () => {
    if (held) keyboard.unlock?.();
  };
}

/**
 * What makes a layer modal — `DESIGN.md` §2.6, ADR-028. Shared by
 * `CcMessageBox` (a confirmation) and `CcDialog` (a form or an explanation), so
 * the two cannot drift into two meanings of the word.
 *
 * While `open`:
 *
 *   - every child of `body` except the layer goes `inert` — it cannot be tabbed
 *     into, clicked or read by a screen reader. `inert` is inherited, so both
 *     components portal their layer to `body` (or to the element in full
 *     screen, `useCcPortalTarget`), and only the siblings on the way up from
 *     the layer are switched off — never one of its own ancestors;
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
   * falling back to the layer when there is none. In `first-field` mode an
   * element marked `data-cc-initial-focus` wins over the first field.
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

    // Everything beside the layer goes inert, at every level up to `body`: the
    // layer is a child of `body`, or — over a canvas in full screen — a child
    // of the full-screen element (`useCcPortalTarget`), whose own ancestors
    // must stay live or the layer would be switched off with them.
    const siblings: HTMLElement[] = [];
    for (let node: HTMLElement | null = container; node && node !== document.body && node.parentElement; node = node.parentElement) {
      for (const other of Array.from(node.parentElement.children)) {
        if (other === node || !(other instanceof HTMLElement)) continue;
        if (other.hasAttribute('inert')) continue;
        other.setAttribute('inert', '');
        siblings.push(other);
      }
    }
    const releaseEscape = holdEscapeInFullscreen();

    // A form may name the control the caret belongs on (`data-cc-initial-focus`)
    // — the terms gate has no field, and its one way back into the product is
    // the button. Only in `first-field` mode: a confirmation (`container`)
    // never rests its default focus on the irreversible button.
    const field =
      initialFocus === 'first-field'
        ? (box?.querySelector<HTMLElement>('[data-cc-initial-focus]:not([disabled])') ??
          box?.querySelector<HTMLElement>(
            'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])',
          ))
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
      releaseEscape();
      for (const node of siblings) node.removeAttribute('inert');
      opener?.focus();
    };
  }, [open, initialFocus]);

  return layerRef;
}
