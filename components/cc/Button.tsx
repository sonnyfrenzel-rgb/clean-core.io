'use client';

import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Four button styles. Not five — `DESIGN.md` §1.5.
 *
 * The count before this file was 78. Not 78 buttons: 78 *styles*, each written
 * where it was needed, and about a dozen of them green in a product where green
 * is supposed to mean proven. That is the whole reason this component exists and
 * accepts no `className`: a variant list is only a list while nothing can add to
 * it from outside.
 *
 *   primary    the one action of a region — a card, a dialog, a bar. Brand
 *              surface at 5.0:1 with white, not `--cc-brand` at 3.3:1.
 *   secondary  further actions.
 *   ghost      cancel and side actions; `tone="danger"` colours the *text*, not
 *              a red button that looks like the primary path.
 *   dark       the binding confirmation, and only that. Never beside a primary
 *              in the same bar — two dark-on-light blocks read as two primaries.
 *
 * Destructive work goes through a Message Box (§2.6), never `window.confirm`.
 *
 * Height is 32px compact and 40px cozy (§2.9): the density follows the input
 * device, so it is passed in rather than guessed here.
 */
export type CcButtonVariant = 'primary' | 'secondary' | 'ghost' | 'dark';
export type CcDensity = 'compact' | 'cozy';

const VARIANT_CLASSES: Record<CcButtonVariant, string> = {
  primary: 'bg-cc-brand-strong border-cc-brand-strong text-cc-on-dark hover:bg-cc-brand-deep hover:border-cc-brand-deep',
  secondary: 'bg-cc-brand-surface border-cc-brand-strong text-cc-brand-strong hover:bg-cc-brand-surface',
  ghost: 'bg-cc-surface border-cc-field-border text-cc-ink-muted hover:bg-cc-surface-muted',
  dark: 'bg-cc-surface-dark border-cc-surface-dark text-cc-on-dark hover:bg-cc-ink',
};

const DENSITY_CLASSES: Record<CcDensity, string> = {
  compact: 'min-h-[32px] px-3 text-[13px]',
  cozy: 'min-h-[40px] px-4 text-[14px]',
};

export interface CcButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: CcButtonVariant;
  density?: CcDensity;
  /** Only meaningful on `ghost`: destructive text, not a destructive surface. */
  tone?: 'default' | 'danger';
  /** Leading icon, 16px, from lucide-react. */
  icon?: React.ReactNode;
  children: React.ReactNode;
}

export default function CcButton({
  variant = 'ghost',
  density = 'compact',
  tone = 'default',
  icon,
  children,
  type = 'button',
  ...rest
}: CcButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      data-cc-button={variant}
      data-cc-density={density}
      data-cc-tone={tone}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-cc-row border font-semibold leading-none whitespace-nowrap',
        'disabled:opacity-60 disabled:cursor-not-allowed',
        VARIANT_CLASSES[variant],
        DENSITY_CLASSES[density],
        variant === 'ghost' && tone === 'danger' && 'text-cc-error',
      )}
    >
      {icon}
      {children}
    </button>
  );
}
