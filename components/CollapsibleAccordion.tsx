'use client';

import { useState, useRef, useEffect, useId } from 'react';
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
   * State of the badge dot — a semantic state of `DESIGN.md` §1.1, named as
   * one. It was `'green' | 'amber' | 'red'` until block D, D.31: a colour name
   * in the prop invited `'green'` for "nothing high-risk found", which is not a
   * proof, and green in the workspace means proven — the dot was already
   * `neutral` behind the name.
   */
  badgeSeverity?: 'neutral' | 'warning' | 'error';
  /**
   * What this section shows, behind an info button beside the title. Opens on
   * hover, on focus and on click, closes on Escape — the WhyPopover pattern
   * (D.9 addendum, D.31). It used to open only on hover, over an icon inside
   * the header button, so a keyboard never reached it.
   */
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
  badgeSeverity = 'neutral',
  tooltip,
  defaultOpen = false,
  children,
}: CollapsibleAccordionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [height, setHeight] = useState<number | undefined>(defaultOpen ? undefined : 0);
  const contentRef = useRef<HTMLDivElement>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipId = useId();

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

  // Escape closes the explanation. It is read, not operated, so nothing inside
  // it could want the key; the focus stays where it was.
  useEffect(() => {
    if (!showTooltip) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowTooltip(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showTooltip]);

  const severityColors = {
    neutral: STATE_CLASSES.neutral.mark,
    warning: STATE_CLASSES.warning.mark,
    error: STATE_CLASSES.error.mark,
  };

  return (
    // Not `overflow-hidden`: the explanation opens above the header, outside
    // the card, and a clipping card cut it off. The body clips itself.
    <div className="bg-cc-surface rounded-cc-card border border-cc-line shadow-cc">
      {/* Header — always visible. The info button is a sibling of the toggle,
          not inside it: a button inside a button is not a control a keyboard
          can reach. It sits over a spacer in the toggle, so the row reads as
          before — title, badge, info, chevron. */}
      <div className="relative">
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
            {tooltip && <span aria-hidden="true" className="block w-6 h-6" />}
            <ChevronDown
              size={16}
              className={clsx(
                'text-cc-ink-muted group-hover:text-cc-ink transition-transform duration-200',
                isOpen && 'rotate-180'
              )}
            />
          </div>
        </button>

        {tooltip && (
          <div
            className="absolute top-1/2 -translate-y-1/2 right-10 sm:right-12"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
          >
            <button
              type="button"
              data-accordion-info=""
              aria-label={`About: ${title}`}
              aria-expanded={showTooltip}
              aria-describedby={showTooltip ? tooltipId : undefined}
              onClick={() => setShowTooltip(true)}
              onFocus={() => setShowTooltip(true)}
              onBlur={() => setShowTooltip(false)}
              className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-transparent p-0 text-cc-ink-muted hover:text-cc-ink cursor-help transition-colors"
            >
              <Info size={14} aria-hidden="true" />
            </button>
            {showTooltip && (
              <div
                id={tooltipId}
                role="tooltip"
                data-accordion-tooltip=""
                className="absolute z-cc-popover bottom-full right-0 mb-2 w-64 sm:w-72 bg-cc-overlay text-cc-on-dark cc-text-meta p-3 rounded-cc-row shadow-cc-dialog pointer-events-none"
              >
                {tooltip}
                <div className="absolute bottom-0 right-4 translate-y-1/2 rotate-45 w-2 h-2 bg-cc-overlay" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Collapsible body. Clipped to zero height it was still in the tab order
          and read out under a header announced as collapsed; `inert` takes it
          out of both while it is closed, and the height transition stays. */}
      <div
        ref={contentRef}
        inert={!isOpen}
        data-accordion-body=""
        style={{ height: height !== undefined ? `${height}px` : 'auto' }}
        className={clsx(
          'transition-[height] duration-200 ease-in-out overflow-hidden rounded-b-cc-card motion-reduce:transition-none',
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
