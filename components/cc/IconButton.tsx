'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { CC_BUTTON_VARIANT_CLASSES, type CcDensity } from './Button';

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
 *
 * `text` puts a word beside the icon from 768 px up (owner 11.10.2026, on the
 * map's row: "button labels — and the one circled button does nothing, or I
 * can't see it"). Below 768 px the button stays the square it was, so a phone
 * keeps its 44 px target and its row. The word is part of `label`, so what a
 * sighted reader sees is what a speech user says (WCAG 2.5.3).
 *
 * A toggle that is on (`aria-pressed`) wears the selected segment's look —
 * `--cc-ink`, white — so its state is seen and not only announced (§1.5).
 */
export interface CcIconButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'aria-label'> {
  /** The accessible name. Required — an icon alone is not a name. */
  label: string;
  /** A short word shown beside the icon from 768 px up; contained in `label`. */
  text?: string;
  density?: CcDensity;
  /** The button element, e.g. for a menu trigger (React 19: `ref` is a prop; D.5e). */
  ref?: React.Ref<HTMLButtonElement>;
  children: React.ReactNode;
}

/** The selected segment's look (`SegmentedControl`), for a toggle that is on. */
const PRESSED_CLASSES = 'bg-cc-ink border-cc-ink text-cc-on-dark hover:bg-cc-ink';

export default function CcIconButton({
  label,
  text,
  density = 'compact',
  children,
  type = 'button',
  ref,
  ...rest
}: CcIconButtonProps) {
  const pressed = rest['aria-pressed'] === true || rest['aria-pressed'] === 'true';
  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      aria-label={label}
      data-cc-icon-button=""
      data-cc-density={density}
      data-cc-icon-text={text ? '' : undefined}
      className={cn(
        'inline-flex items-center justify-center rounded-cc-row border',
        // "Like ghost" (§1.5) by reference, not by copy: the same classes the
        // ghost button wears, so the two cannot drift apart.
        pressed ? PRESSED_CLASSES : CC_BUTTON_VARIANT_CLASSES.ghost,
        'disabled:opacity-60 disabled:cursor-not-allowed',
        density === 'compact' ? 'h-8 w-8 pointer-coarse:h-11 pointer-coarse:w-11' : 'h-11 w-11',
        text && 'md:w-auto md:pointer-coarse:w-auto md:gap-1 md:px-3 text-[13px] font-semibold leading-none whitespace-nowrap',
      )}
    >
      {children}
      {text ? <span aria-hidden={true} className="hidden md:inline">{text}</span> : null}
    </button>
  );
}
