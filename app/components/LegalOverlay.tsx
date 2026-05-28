'use client';

import { X } from 'lucide-react';

interface LegalOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export default function LegalOverlay({ isOpen, onClose, title, children }: LegalOverlayProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
      <div className="bg-white p-8 rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-[#003D7C]/60 hover:text-[#003D7C] transition-colors"
        >
          <X className="w-6 h-6" />
        </button>
        <h2 className="text-2xl font-bold mb-6 pr-8">{title}</h2>
        <div className="prose prose-sm max-w-none text-[#003D7C]/70">
          {children}
        </div>
      </div>
    </div>
  );
}
