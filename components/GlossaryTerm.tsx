'use client';

import { useState, useRef, useEffect, useCallback, useId } from 'react';
import { GLOSSARY_ITEMS } from '@/lib/glossary';
import { X, HelpCircle, ShieldAlert } from 'lucide-react';
import clsx from 'clsx';
import { useDialogFocus } from '@/hooks/useDialogFocus';

interface GlossaryTermProps {
  termKey: string;
  children?: React.ReactNode;
  className?: string;
}

export default function GlossaryTerm({ termKey, children, className }: GlossaryTermProps) {
  const item = GLOSSARY_ITEMS[termKey];
  const [showTooltip, setShowTooltip] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const panelId = useId();
  const closeTooltip = useCallback(() => setShowTooltip(false), []);
  // UX-045: on a phone the explanation is a bottom sheet, i.e. a modal dialog —
  // focus moves in, stays in, Escape closes, focus returns to the term.
  const sheetRef = useDialogFocus<HTMLDivElement>(showTooltip && isMobile, closeTooltip);

  // Detect mobile device width for appropriate modal behavior
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Close tooltip on clicking outside
  useEffect(() => {
    if (!showTooltip) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (
        tooltipRef.current && 
        !tooltipRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setShowTooltip(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showTooltip]);

  // The desktop popover is not modal, but Escape still dismisses it and hands
  // focus back to the term (the phone sheet gets the same from useDialogFocus).
  useEffect(() => {
    if (!showTooltip || isMobile) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setShowTooltip(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [showTooltip, isMobile]);

  if (!item) {
    return <span className={className}>{children || termKey}</span>;
  }

  const handleTrigger = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowTooltip((prev) => !prev);
  };

  const handleTriggerKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    e.stopPropagation();
    setShowTooltip((prev) => !prev);
  };

  return (
    <span className="relative inline-block">
      {/* Interactive text trigger */}
      <span
        ref={triggerRef}
        onClick={handleTrigger}
        onKeyDown={handleTriggerKey}
        role="button"
        tabIndex={0}
        aria-expanded={showTooltip}
        aria-controls={showTooltip ? panelId : undefined}
        className={clsx(
          "underline decoration-dashed decoration-2 decoration-emerald-500/80 underline-offset-4 cursor-help hover:text-emerald-800 font-bold transition-all select-none active:scale-95 inline-block rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d4ed8]",
          className
        )}
        title="Click to toggle Glossary explanation"
      >
        {children || item.shortName}
      </span>

      {/* Tooltip Overlay */}
      {showTooltip && (
        <>
          {isMobile ? (
            /* Mobile Slide-Up bottom sheet */
            <div className="fixed inset-0 z-[110] bg-slate-950/60 backdrop-blur-sm flex items-end justify-center p-0 animate-in fade-in duration-200">
              <div
                ref={(node) => {
                  tooltipRef.current = node;
                  sheetRef.current = node;
                }}
                id={panelId}
                role="dialog"
                aria-modal="true"
                aria-labelledby={`${panelId}-title`}
                tabIndex={-1}
                className="bg-white rounded-t-[2rem] border-t border-slate-200 shadow-2xl p-6 w-full max-h-[85vh] overflow-y-auto space-y-4 animate-in slide-in-from-bottom duration-300 relative"
              >
                {/* Drag handle decoration */}
                <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-2 shrink-0"></div>
                
                <button
                  type="button"
                  onClick={() => setShowTooltip(false)}
                  aria-label="Close explanation"
                  className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d4ed8]"
                >
                  <X size={18} aria-hidden />
                </button>

                <div className="space-y-1">
                  <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest bg-emerald-50 px-2.5 py-1 rounded-md inline-block font-mono">
                    {item.category}
                  </span>
                  <h4 id={`${panelId}-title`} className="text-lg font-black text-slate-900 tracking-tight">{item.term}</h4>
                  <p className="text-[10px] text-slate-400 font-bold">Acronym: {item.shortName}</p>
                </div>

                <div className="space-y-3 pt-2 text-xs leading-relaxed text-slate-700">
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <p className="font-semibold">{item.definition}</p>
                  </div>
                  <div className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100 flex gap-2.5">
                    <HelpCircle size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="block text-[9px] font-black text-emerald-700 uppercase tracking-wider font-mono">Clean Core Implication</span>
                      <p className="text-emerald-800 font-semibold mt-0.5">{item.cleanCoreImplication}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Desktop Premium Glassmorphic Tooltip Overlay */
            <div
              ref={tooltipRef}
              id={panelId}
              role="tooltip"
              className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-72 bg-white/95 backdrop-blur border border-slate-200 shadow-xl rounded-2xl p-4 z-[90] animate-in fade-in zoom-in-95 duration-200 space-y-3 pointer-events-auto"
            >
              <div className="space-y-1">
                <span className="text-[8px] font-bold text-emerald-600 uppercase tracking-widest bg-emerald-50 px-2 py-0.5 rounded font-mono">
                  {item.category}
                </span>
                <h4 className="text-xs font-black text-slate-900 leading-snug tracking-tight">{item.term}</h4>
              </div>
              <p className="text-[11px] text-slate-600 leading-normal font-medium">{item.definition}</p>
              
              <div className="border-t border-slate-100 pt-2 flex gap-1.5 text-[10px] text-emerald-800 leading-normal">
                <HelpCircle size={12} className="text-emerald-600 shrink-0 mt-0.5" />
                <p className="font-semibold">{item.cleanCoreImplication}</p>
              </div>
            </div>
          )}
        </>
      )}
    </span>
  );
}
