'use client';

import React from 'react';
import { LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CC_BUSY_DELAY_MS, useCcDelayedFlag } from './delay';

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
 *
 * `busy` is the busy indicator of §2.8 on the element that started the action
 * (block D, step D.5c). Three rules, each one a reason the old
 * `Loader2 animate-spin` beside a label was not enough:
 *
 *   - **Said at once, painted after 400 ms.** `aria-busy` follows `busy`
 *     directly; the indicator appears only when the work has taken 400 ms, so a
 *     fast save does not blink.
 *   - **No layout shift.** The label stays where it is and only turns
 *     transparent; the indicator is laid over it. The button keeps its width,
 *     and the accessible name stays the label — "Save", not "Loading".
 *   - **The page stays usable, the button does not fire twice.** A busy button
 *     keeps its focus (it is not `disabled`, which would drop the focus to
 *     `body`), says `aria-disabled`, and swallows the click. Everything else on
 *     the page works as before.
 *
 * The indicator turns only under `motion-safe:` and stands still under reduced
 * motion (§1.7).
 */
export type CcButtonVariant = 'primary' | 'secondary' | 'ghost' | 'dark';
export type CcDensity = 'compact' | 'cozy';

/**
 * Exported for `CcLinkButton` alone — the one control that has to be an `<a>`
 * because it opens a page, and must not therefore be a fifth button style.
 * Shared rather than copied: two tables are two values waiting to drift, which
 * is how the product reached 78 styles in the first place.
 */
export const CC_BUTTON_VARIANT_CLASSES: Record<CcButtonVariant, string> = {
  primary: 'bg-cc-brand-strong border-cc-brand-strong text-cc-on-dark hover:bg-cc-brand-deep hover:border-cc-brand-deep',
  secondary: 'bg-cc-brand-surface border-cc-brand-strong text-cc-brand-strong hover:bg-cc-brand-surface',
  ghost: 'bg-cc-surface border-cc-field-border text-cc-ink-muted hover:bg-cc-surface-muted',
  dark: 'bg-cc-surface-dark border-cc-surface-dark text-cc-on-dark hover:bg-cc-ink',
};

export const CC_BUTTON_DENSITY_CLASSES: Record<CcDensity, string> = {
  compact: 'min-h-[32px] px-3 text-[13px] pointer-coarse:min-h-11',
  cozy: 'min-h-[40px] px-4 text-[14px] pointer-coarse:min-h-11',
};

/** The shape both the button and the link wear, so neither can drift from it. */
export const CC_BUTTON_BASE =
  'relative inline-flex items-center justify-center gap-1 rounded-cc-row border font-semibold leading-none whitespace-nowrap';

const VARIANT_CLASSES = CC_BUTTON_VARIANT_CLASSES;
const DENSITY_CLASSES = CC_BUTTON_DENSITY_CLASSES;

export interface CcButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: CcButtonVariant;
  density?: CcDensity;
  /** Only meaningful on `ghost`: destructive text, not a destructive surface. */
  tone?: 'default' | 'danger';
  /** Leading icon, 16px, from lucide-react. */
  icon?: React.ReactNode;
  /**
   * The action this button started is running (§2.8). Announced at once,
   * painted after 400 ms, the click is swallowed until it ends.
   */
  busy?: boolean;
  children: React.ReactNode;
}

export default function CcButton({
  variant = 'ghost',
  density = 'compact',
  tone = 'default',
  icon,
  busy = false,
  children,
  type = 'button',
  onClick,
  ...rest
}: CcButtonProps) {
  const busyShown = useCcDelayedFlag(busy, CC_BUSY_DELAY_MS);

  return (
    <button
      {...rest}
      type={type}
      aria-busy={busy || rest['aria-busy'] || undefined}
      aria-disabled={busy || rest['aria-disabled'] || undefined}
      onClick={
        busy
          ? (event) => {
              event.preventDefault();
            }
          : onClick
      }
      data-cc-button={variant}
      data-cc-density={density}
      data-cc-tone={tone}
      data-cc-busy={busy ? (busyShown ? 'shown' : 'pending') : undefined}
      className={cn(
        CC_BUTTON_BASE,
        'disabled:opacity-60 disabled:cursor-not-allowed',
        VARIANT_CLASSES[variant],
        DENSITY_CLASSES[density],
        variant === 'ghost' && tone === 'danger' && 'text-cc-error',
        busy && 'cursor-progress',
      )}
    >
      <span className={cn('inline-flex items-center gap-1', busyShown && 'opacity-0')}>
        {icon}
        {children}
      </span>
      {busyShown ? (
        <span data-cc-busy-indicator="" aria-hidden={true} className="absolute inset-0 flex items-center justify-center">
          <LoaderCircle size={16} className="motion-safe:animate-spin" />
        </span>
      ) : null}
    </button>
  );
}
