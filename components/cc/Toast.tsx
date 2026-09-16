'use client';

import React, { useEffect } from 'react';
import { Check } from 'lucide-react';

/**
 * Toast — `DESIGN.md` §2.6, and mostly a list of things it must not do.
 *
 * It is for a side action that finished: "Export downloaded". Bottom right, on
 * the overlay colour, `role="status"`, four seconds, at most one at a time.
 *
 * **Never for an error.** An error needs an action next to it and a reader who
 * has time to read it; a message that removes itself after four seconds has
 * neither. Errors are a Message Strip (§2.8). The component has no `state`
 * prop, so there is no way to ask it for a red one.
 *
 * `role="status"` rather than `alert`: polite, announced at the next pause, not
 * cutting into whatever the screen reader was saying — a completed download is
 * not an interruption.
 */
export interface CcToastProps {
  open: boolean;
  children: React.ReactNode;
  onDismiss: () => void;
  /** Four seconds by §2.6; a test may shorten it. */
  durationMs?: number;
}

export default function CcToast({ open, children, onDismiss, durationMs = 4000 }: CcToastProps) {
  useEffect(() => {
    if (!open) return undefined;
    const timer = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(timer);
  }, [open, durationMs, onDismiss]);

  if (!open) return null;

  return (
    <div
      role="status"
      data-cc-toast=""
      className="fixed right-6 bottom-6 z-40 flex items-center gap-2.5 rounded-cc-row bg-cc-overlay px-3.5 py-2.5 text-[13px] font-medium text-cc-on-dark shadow-cc-dialog"
    >
      <Check size={16} aria-hidden={true} />
      {children}
    </div>
  );
}
