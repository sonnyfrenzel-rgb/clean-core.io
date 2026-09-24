'use client';

import React, { useId, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { t } from '@/lib/cc-messages';
import type { CcDensity } from './Button';

/**
 * "Business rules (7) · Show" — `DESIGN.md` §2.11, block D, step D.5c.
 *
 * The one way this product folds something away. §2.11 says the first screen
 * of a view shows the answer, one next action and at most three supporting
 * blocks, and everything else sits one action deeper — **folded, with its
 * count, never removed**. This component is that sentence as code:
 *
 *   - **The count is on the closed state.** A folded block that does not say how
 *     much is inside is a block nobody opens. `count` is optional only because
 *     some blocks are not lists ("Details").
 *   - **A real button with `aria-expanded`**, controlling a region named by that
 *     button (WAI-ARIA disclosure pattern). Not a clickable `div`, which a
 *     keyboard cannot reach (R9 of the design guard).
 *   - **Folded is not removed.** The closed region stays in the document,
 *     only not displayed, so what it holds does not have to be fetched again —
 *     and on paper everything is open (§7). A class rather than the `hidden`
 *     attribute, because Tailwind's preflight makes `[hidden]` `!important`
 *     and print could then never open it.
 *   - **Ink, not green.** Opening something proves nothing (§1.1).
 *
 * `level` wraps the button in a heading when the folded block is a section of
 * its own — the pattern WAI-ARIA gives for an accordion header — so the outline
 * of the page does not lose it while it is closed.
 */
export interface CcDisclosureProps {
  /** "Business rules" — the name of what is folded away. */
  title: string;
  /** How many items are inside — "(7)". */
  count?: number;
  /** Open on first render (uncontrolled). */
  defaultOpen?: boolean;
  /** Controlled open state; pass with `onOpenChange`. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Wrap the trigger in a heading of this level. */
  level?: 2 | 3 | 4;
  density?: CcDensity;
  children: React.ReactNode;
}

const HEIGHT: Record<CcDensity, string> = {
  compact: 'min-h-8',
  cozy: 'min-h-10',
};

export default function CcDisclosure({
  title,
  count,
  defaultOpen = false,
  open: openProp,
  onOpenChange,
  level,
  density = 'compact',
  children,
}: CcDisclosureProps) {
  const id = useId();
  const buttonId = `${id}-button`;
  const regionId = `${id}-region`;
  const titleId = `${id}-title`;
  const [openState, setOpenState] = useState(defaultOpen);
  const open = openProp ?? openState;

  const toggle = () => {
    const next = !open;
    if (openProp === undefined) setOpenState(next);
    onOpenChange?.(next);
  };

  const trigger = (
    <button
      id={buttonId}
      type="button"
      aria-expanded={open}
      aria-controls={regionId}
      data-cc-disclosure-trigger=""
      onClick={toggle}
      className={cn(
        'inline-flex items-center gap-1 rounded-cc-row text-left text-[13px] font-semibold text-cc-ink pointer-coarse:min-h-11',
        HEIGHT[density],
      )}
    >
      <ChevronRight
        size={16}
        aria-hidden={true}
        className={cn(
          'shrink-0 text-cc-ink-muted motion-safe:transition-transform motion-safe:duration-150',
          open && 'rotate-90',
        )}
      />
      <span id={titleId}>
        {title}
        {count !== undefined ? <span className="font-medium text-cc-ink-muted"> ({count})</span> : null}
      </span>
      <span aria-hidden={true} className="font-medium text-cc-ink-muted">
        ·
      </span>
      <span className="font-medium text-cc-ink-muted">{open ? t('disclosure.hide') : t('disclosure.show')}</span>
    </button>
  );

  const Heading = level ? (`h${level}` as 'h2' | 'h3' | 'h4') : null;

  return (
    <div data-cc-disclosure={open ? 'open' : 'closed'} className="flex min-w-0 flex-col">
      {Heading ? <Heading className="m-0 text-[13px] font-semibold">{trigger}</Heading> : trigger}
      <div
        id={regionId}
        role="region"
        aria-labelledby={titleId}
        data-cc-disclosure-region=""
        className={cn('pt-2', !open && 'hidden print:block')}
      >
        {children}
      </div>
    </div>
  );
}
