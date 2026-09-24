'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Info } from 'lucide-react';
import clsx from 'clsx';
import { STATE_CLASSES } from '@/components/cc/state';

interface CollapsibleAccordionProps {
  /** Icon rendered before the title (optional) */
  icon?: React.ReactNode;
  /** Main title label */
  title: string;
  /** Short summary badge (e.g., "12 objects detected · 3 high-risk tables") */
  badge?: string;
  /**
   * Severity of the badge dot. The names are the callers'; the colours are the
   * semantic states of `DESIGN.md` §1.1 — `red` is `error`, `amber` is
   * `warning`, and `green` is `neutral`, because "nothing high-risk found" is
   * not a proof and green in the workspace means proven.
   */
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
    green: STATE_CLASSES.neutral.mark,
    amber: STATE_CLASSES.warning.mark,
    red: STATE_CLASSES.error.mark,
  };

  return (
    <div className="bg-cc-surface rounded-cc-card border border-cc-line shadow-cc overflow-hidden">
      {/* Header — always visible */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between gap-3 px-4 sm:px-6 py-4 text-left group"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {icon && (
            <div className="shrink-0 text-cc-ink-muted group-hover:text-cc-ink transition-colors">
              {icon}
            </div>
          )}
          <span className="cc-text-h3 text-cc-ink truncate">{title}</span>

          {badge && (
            <div className="hidden sm:flex items-center gap-1 border border-cc-line bg-cc-surface-muted text-cc-ink-muted cc-text-meta px-2 py-0.5 rounded-full shrink-0">
              <span className={clsx('w-1.5 h-1.5 rounded-full', severityColors[badgeSeverity])} />
              {badge}
            </div>
          )}

          {/* Mobile badge — shown on its own row */}
          {badge && (
            <div className="flex sm:hidden items-center gap-1 border border-cc-line bg-cc-surface-muted text-cc-ink-muted cc-text-meta px-2 py-0.5 rounded-full shrink-0">
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
                className="text-cc-ink-muted hover:text-cc-ink cursor-help transition-colors"
                onMouseEnter={() => setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
              />
              {showTooltip && (
                <div className="absolute z-50 bottom-full right-0 mb-2 w-64 sm:w-72 bg-cc-overlay text-cc-on-dark cc-text-meta p-3 rounded-cc-row shadow-cc-dialog pointer-events-none">
                  {tooltip}
                  <div className="absolute bottom-0 right-4 translate-y-1/2 rotate-45 w-2 h-2 bg-cc-overlay" />
                </div>
              )}
            </div>
          )}
          <ChevronDown
            size={16}
            className={clsx(
              'text-cc-ink-muted group-hover:text-cc-ink transition-transform duration-200',
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
          'transition-[height] duration-200 ease-in-out overflow-hidden motion-reduce:transition-none',
          !isOpen && 'border-t-0'
        )}
      >
        <div className={clsx('px-4 sm:px-6 pb-5 pt-2', isOpen && 'border-t border-cc-line')}>
          {children}
        </div>
      </div>
    </div>
  );
}
