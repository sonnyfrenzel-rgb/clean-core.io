'use client';

import { useSyncExternalStore } from 'react';
import CcDialog from '@/components/cc/Dialog';

const noSubscription = () => () => {};

/**
 * `false` on the server and during hydration, `true` after it.
 *
 * The landing page opens this dialog from the address (`/?legal=privacy`), so it
 * can be open on the very first render. `CcDialog` renders nothing where there
 * is no `document` and a portal where there is one, so the server HTML and the
 * first client render would disagree and React would throw the page away with
 * a hydration error. The server snapshot keeps the first client render equal to
 * the server's; the dialog opens one render later.
 */
function useHydrated(): boolean {
  return useSyncExternalStore(noSubscription, () => true, () => false);
}

interface LegalOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

/**
 * A legal text in a dialog: the summary of the Privacy Policy or the Terms,
 * opened from a sign-up form without leaving it.
 *
 * A `CcDialog` (`DESIGN.md` §2.6) rather than a layer of its own. It was one
 * until Block D (D.7), with its own focus handling (QA 58dc160fd6c3); the
 * library's dialog does all of that — focus in on open, Tab held inside, the
 * page behind `inert`, Escape and the close button as the two ways out, focus
 * back to the link that opened it — and it does it the same way as every other
 * dialog in the product. Opened from inside another dialog (the sign-up), it
 * stacks: the lower one goes inert until this one closes.
 *
 * `wide`, because this is a longer explanation, not a form.
 */
export default function LegalOverlay({ isOpen, onClose, title, children }: LegalOverlayProps) {
  const hydrated = useHydrated();
  return (
    <CcDialog open={isOpen && hydrated} onClose={onClose} title={title} size="wide">
      <div data-legal-overlay="" className="cc-text-cell text-cc-ink">
        {children}
      </div>
    </CcDialog>
  );
}
