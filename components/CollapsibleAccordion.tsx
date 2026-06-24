'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Info } from 'lucide-react';
import clsx from 'clsx';

interface CollapsibleAccordionProps {
  /** Icon rendered before the title (optional) */
  icon?: React.ReactNode;
  /** Main title label */
  title: string;
  /** Short summary badge (e.g., "12 objects detected · 3 high-risk tables") */
  badge?: string;
  /** Severity color for the badge dot: green, amber, red */
  badgeSeverity?: 'green' | 'amber' | 'red';
  /** Tooltip text shown on hover over the ℹ️ icon */
  tooltip?: string;
  /** Whether to start expanded */
  defaultOpen?: boolean;
  /** Children rendered inside the body */
  children: React.ReactNode;
}

export default function CollapsibleAccordion({
  icon,
  title,
  badge,
  badgeSeverity = 'green',
  tooltip,
  defaultOpen = false,
  children,
}: CollapsibleAccordionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [height, setHeight] = useState<number | undefined>(defaultOpen ? undefined : 0);
  const contentRef = useRef<HTMLDivElement>(null);
  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const el = contentRef.current;
      if (el) {
        setHeight(el.scrollHeight);
        // After the transition completes, set height to auto for dynamic content
        const timer = setTimeout(() => setHeight(undefined), 250);
        return () => clearTimeout(timer);
      }
    } else {
      // Collapse: first set explicit height for the transition, then to 0
      const el = contentRef.current;
      if (el) {
        setHeight(el.scrollHeight);
        requestAnimationFrame(() => {
          setHeight(0);
        });
      }
    }
  }, [isOpen]);

  const severityColors = {
    green: 'bg-emerald-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden transition-all duration-200">
      {/* Header — always visible */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between gap-3 px-4 sm:px-6 py-4 text-left hover:bg-slate-50/50 transition-colors group"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {icon && (
            <div className="shrink-0 text-slate-500 group-hover:text-slate-700 transition-colors">
              {icon}
            </div>
          )}
          <span className="font-bold text-slate-800 text-sm truncate">{title}</span>

          {badge && (
            <div className="hidden sm:flex items-center gap-1.5 bg-slate-100 text-slate-600 text-[11px] font-semibold px-2.5 py-0.5 rounded-full shrink-0">
              <span className={clsx('w-1.5 h-1.5 rounded-full', severityColors[badgeSeverity])} />
              {badge}
            </div>
          )}

          {/* Mobile badge — shown on its own row */}
          {badge && (
            <div className="flex sm:hidden items-center gap-1.5 bg-slate-100 text-slate-600 text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0">
              <span className={clsx('w-1.5 h-1.5 rounded-full', severityColors[badgeSeverity])} />
              <span className="truncate max-w-[140px]">{badge}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {tooltip && (
            <div className="relative">
              <Info
                size={14}
                className="text-slate-400 hover:text-slate-600 cursor-help transition-colors"
                onMouseEnter={() => setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
              />
              {showTooltip && (
                <div className="absolute z-50 bottom-full right-0 mb-2 w-64 sm:w-72 bg-slate-900 text-white text-xs p-3 rounded-xl shadow-xl border border-slate-700 pointer-events-none">
                  {tooltip}
                  <div className="absolute bottom-0 right-4 translate-y-1/2 rotate-45 w-2 h-2 bg-slate-900 border-r border-b border-slate-700" />
                </div>
              )}
            </div>
          )}
          <ChevronDown
            size={16}
            className={clsx(
              'text-slate-400 transition-transform duration-200',
              isOpen && 'rotate-180'
            )}
          />
        </div>
      </button>

      {/* Collapsible body */}
      <div
        ref={contentRef}
        style={{ height: height !== undefined ? `${height}px` : 'auto' }}
        className={clsx(
          'transition-[height] duration-250 ease-in-out overflow-hidden',
          !isOpen && 'border-t-0'
        )}
      >
        <div className={clsx('px-4 sm:px-6 pb-5 pt-2', isOpen && 'border-t border-slate-100')}>
          {children}
        </div>
      </div>
    </div>
  );
}
