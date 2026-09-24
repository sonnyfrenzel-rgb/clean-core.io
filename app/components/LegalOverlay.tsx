'use client';

import { useId } from 'react';
import { X } from 'lucide-react';
import { useDialogFocus } from '@/hooks/useDialogFocus';

interface LegalOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

/**
 * A modal dialog (QA 58dc160fd6c3): focus moves in on open, Tab stays inside,
 * Escape closes, and focus returns to whatever opened it.
 */
export default function LegalOverlay({ isOpen, onClose, title, children }: LegalOverlayProps) {
  const titleId = useId();
  const dialogRef = useDialogFocus<HTMLDivElement>(isOpen, onClose);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="bg-white p-8 rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto shadow-2xl relative focus:outline-none"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 p-2 text-[#003D7C]/60 hover:text-[#003D7C] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d4ed8]"
        >
          <X className="w-6 h-6" aria-hidden />
        </button>
        <h2 id={titleId} className="text-2xl font-bold mb-6 pr-8">{title}</h2>
        <div className="prose prose-sm max-w-none text-[#003D7C]/70">
          {children}
        </div>
      </div>
    </div>
  );
}
