/**
 * The four button styles of `DESIGN.md` §1.5 in the public-page shape — a pill,
 * as §1.4 gives the public pages — for the landing page (roadmap 3.0.6).
 *
 * The colours are the same tokens `components/cc/Button.tsx` uses; only the
 * radius and the size differ, because the public pages are the generous room.
 * A plain module rather than an import from `Button.tsx`: that file is a client
 * module, and a server component reading a constant out of it would get a client
 * reference instead of a string.
 */
export type PublicButtonVariant = 'primary' | 'secondary' | 'ghost';

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-full border font-semibold leading-tight whitespace-nowrap transition-colors text-center';

const VARIANT: Record<PublicButtonVariant, string> = {
  primary: 'bg-cc-brand-strong border-cc-brand-strong text-cc-on-dark hover:bg-cc-brand-deep hover:border-cc-brand-deep',
  secondary: 'bg-cc-brand-surface border-cc-brand-strong text-cc-brand-strong hover:bg-green-100',
  ghost: 'bg-cc-surface border-cc-field-border text-cc-ink-muted hover:bg-cc-surface-muted',
};

const SIZE = {
  md: 'min-h-12 px-6 text-base',
  sm: 'min-h-10 px-[18px] text-sm',
} as const;

export function publicButton(variant: PublicButtonVariant, size: keyof typeof SIZE = 'md'): string {
  return `${BASE} ${VARIANT[variant]} ${SIZE[size]} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cc-focus`;
}
