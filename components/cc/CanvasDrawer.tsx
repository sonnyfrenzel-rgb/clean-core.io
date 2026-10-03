'use client';

import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { t } from '@/lib/cc-messages';
import CcIconButton from './IconButton';
import { holdEscapeInFullscreen } from './modal';

/**
 * A drawer over a canvas in full screen — the details a click on the drawing
 * opens, where the reader is looking.
 *
 * Full screen shows one element and nothing else; a panel beside the canvas
 * on the page is not in it. The Design canvas showed a box's evidence in its
 * side panel, so in full screen a click on a box opened the evidence where
 * nobody could see it (owner 03.10.2026: "in full screen I can't open the
 * evidence boxes; it only works outside full screen"). The drawer is rendered
 * by the canvas's own full-screen element, over its right edge, and is not a
 * portal: it is inside full screen by construction.
 *
 * Not modal — the drawing stays usable beside it. Escape closes the drawer
 * first and a second Escape leaves full screen: the drawer takes the key in
 * the capture phase, before the full-screen layer sees it, and asks the
 * browser for it while open (`holdEscapeInFullscreen`). The focus moves into
 * the drawer when it opens and back to where it was when it closes.
 */
export interface CcCanvasDrawerProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** `data-*` hooks for a spec. */
  [data: `data-${string}`]: string | undefined;
}

export default function CcCanvasDrawer({ open, title, onClose, children, ...data }: CcCanvasDrawerProps) {
  const titleId = useId();
  const ref = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const release = holdEscapeInFullscreen();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      onCloseRef.current();
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      release();
      if (opener && opener.isConnected && opener.getClientRects().length > 0) opener.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <aside
      {...data}
      ref={ref}
      tabIndex={-1}
      aria-labelledby={titleId}
      data-cc-canvas-drawer=""
      className="absolute top-0 right-0 bottom-0 z-cc-popover flex w-[min(420px,100%)] flex-col border-l border-cc-line bg-cc-surface shadow-cc-dialog focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-cc-focus"
    >
      <div className="flex items-start gap-3 border-b border-cc-line px-4 py-3">
        <h3 id={titleId} className="m-0 min-w-0 flex-1 text-[15px] font-bold text-cc-ink [overflow-wrap:anywhere]">
          {title}
        </h3>
        <CcIconButton label={t('action.close')} onClick={onClose} data-cc-canvas-drawer-close="">
          <X size={16} aria-hidden={true} />
        </CcIconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">{children}</div>
    </aside>
  );
}
