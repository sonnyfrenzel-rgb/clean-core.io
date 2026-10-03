'use client';

import React from 'react';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  CC_BUTTON_BASE,
  CC_BUTTON_DENSITY_CLASSES,
  CC_BUTTON_VARIANT_CLASSES,
  type CcButtonVariant,
  type CcDensity,
} from './Button';
import { ccDataAttributes, type CcDataAttributes } from './Field';

/**
 * A control that **goes somewhere**, wearing one of the four styles — not a
 * fifth style (`DESIGN.md` §1.5).
 *
 * Added in roadmap 1.4 for the workspace toolbar, where the seven stages are
 * tools that open a page each (§2.3 item 3, ADR-018). Those had to be real
 * links: a `<button>` that calls the router loses middle-click, "open in new
 * tab", the status bar preview and the way a screen reader announces a
 * destination — and a workspace whose seven exits are not links is a workspace
 * nobody can open two stages of at once.
 *
 * It renders an `<a>` and takes its looks from `Button.tsx` by importing the
 * tables rather than restating them. That is the whole reason it is here and
 * not a local `className` in the toolbar: the product reached 78 button styles
 * by writing each one where it was needed, and "it's only a link" is exactly
 * how the 79th would arrive.
 *
 * It carries `data-cc-button` like the button does, so the rendered guard that
 * measures the four styles measures this too when it appears on the gallery.
 *
 * Block D, D.31: `external` opens the target in a new tab — a plain `<a>` with
 * `target="_blank" rel="noopener noreferrer"`, because the router has nothing
 * to do with a page outside the product. Leaving the page is announced twice:
 * a visible arrow-out-of-the-box after the text, and the hint in words for a
 * screen reader, appended to the link's name. The words are the caller's for
 * now (`external="opens in a new tab"`): the component writes no text of its
 * own, and the catalogue key belongs to the text-key step.
 */
export interface CcLinkButtonProps extends CcDataAttributes {
  href: string;
  variant?: CcButtonVariant;
  density?: CcDensity;
  /** Leading icon, 16px, from lucide-react. */
  icon?: React.ReactNode;
  /** Set when this link points at the page the reader is already on. */
  current?: boolean;
  /**
   * Opens in a new tab. The value is the hint a screen reader hears after the
   * name ("opens in a new tab"); sighted readers see the external-link icon.
   */
  external?: string;
  /** The id of an element that describes the link — its accessible description, not its name. */
  describedBy?: string;
  children: React.ReactNode;
}

export default function CcLinkButton(props: CcLinkButtonProps) {
  const { href, variant = 'ghost', density = 'compact', icon, current = false, external, describedBy, children } = props;
  const className = cn(
    CC_BUTTON_BASE,
    'no-underline',
    CC_BUTTON_VARIANT_CLASSES[variant],
    CC_BUTTON_DENSITY_CLASSES[density],
    // The page the reader is on: selection is ink, never green (ADR-007) — the
    // border and the text take `--cc-ink`, the surface the hover's grey, so
    // "you are here" reads without a colour that claims anything.
    current && 'border-cc-ink bg-cc-surface-muted text-cc-ink',
  );
  const common = {
    ...ccDataAttributes(props),
    'data-cc-button': variant,
    'data-cc-density': density,
    'data-cc-tone': 'default',
    'aria-current': current ? ('page' as const) : undefined,
    'aria-describedby': describedBy,
    className,
  };

  if (external) {
    return (
      <a {...common} href={href} target="_blank" rel="noopener noreferrer" data-cc-external="">
        {icon}
        {children}
        <ExternalLink size={14} aria-hidden={true} data-cc-external-mark="" />
        <span className="sr-only">({external})</span>
      </a>
    );
  }

  return (
    <Link {...common} href={href}>
      {icon}
      {children}
    </Link>
  );
}
