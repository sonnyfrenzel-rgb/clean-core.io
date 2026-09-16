'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import type { CcDensity } from './Button';

/**
 * A button whose whole content is an icon — `DESIGN.md` §1.5.
 *
 * Looks like `ghost`, square, at button height, 16px icon. The part that is not
 * cosmetic: `label` is required and becomes `aria-label`, so there is no way to
 * ship one of these with no accessible name. Zoom, close, search and the menu
 * on small screens are all this component, and every one of them used to be a
 * `<button>` containing an `<svg>` and nothing else.
 *
 * At cozy density it is 44px, which is the touch target of §2.9 rather than a
 * larger picture.
 */
export interface CcIconButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'aria-label'> {
  /** The accessible name. Required — an icon alone is not a name. */
  label: string;
  density?: CcDensity;
  children: React.ReactNode;
}

export default function CcIconButton({
  label,
  density = 'compact',
  children,
  type = 'button',
  ...rest
}: CcIconButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      aria-label={label}
      data-cc-icon-button=""
      data-cc-density={density}
      className={cn(
        'inline-flex items-center justify-center rounded-cc-row border',
        'bg-cc-surface border-cc-field-border text-cc-ink-muted hover:bg-cc-surface-muted',
        'disabled:opacity-60 disabled:cursor-not-allowed',
        density === 'compact' ? 'h-8 w-8' : 'h-11 w-11',
      )}
    >
      {children}
    </button>
  );
}
