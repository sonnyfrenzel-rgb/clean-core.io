'use client';

import React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import {
  CC_BUTTON_BASE,
  CC_BUTTON_DENSITY_CLASSES,
  CC_BUTTON_VARIANT_CLASSES,
  type CcButtonVariant,
  type CcDensity,
} from './Button';

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
 */
export interface CcLinkButtonProps {
  href: string;
  variant?: CcButtonVariant;
  density?: CcDensity;
  /** Leading icon, 16px, from lucide-react. */
  icon?: React.ReactNode;
  /** Set when this link points at the page the reader is already on. */
  current?: boolean;
  children: React.ReactNode;
}

export default function CcLinkButton({
  href,
  variant = 'ghost',
  density = 'compact',
  icon,
  current = false,
  children,
}: CcLinkButtonProps) {
  return (
    <Link
      href={href}
      data-cc-button={variant}
      data-cc-density={density}
      data-cc-tone="default"
      aria-current={current ? 'page' : undefined}
      className={cn(
        CC_BUTTON_BASE,
        'no-underline',
        CC_BUTTON_VARIANT_CLASSES[variant],
        CC_BUTTON_DENSITY_CLASSES[density],
      )}
    >
      {icon}
      {children}
    </Link>
  );
}
