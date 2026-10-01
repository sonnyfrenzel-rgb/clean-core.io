'use client';

import React from 'react';
import { cn } from '@/lib/utils';

/**
 * A section of the Analyze object page (proposal A, owner decision 01.10.2026):
 * a card with its title row — the `h2`, and whatever stands on the right of it
 * (a chip, a legend, a count, the list's controls) — an optional lead line, and
 * the body. The main column and the side column use the same card; the side is
 * only tighter.
 */
export default function ObjectSection({
  id,
  title,
  right,
  lead,
  side = false,
  className,
  children,
  ...data
}: {
  id?: string;
  title: React.ReactNode;
  right?: React.ReactNode;
  lead?: React.ReactNode;
  /** The narrower card of the side column. */
  side?: boolean;
  className?: string;
  children: React.ReactNode;
} & { [key: `data-${string}`]: string | number | undefined }) {
  return (
    <section
      id={id}
      aria-labelledby={id ? `${id}-title` : undefined}
      className={cn('min-w-0 scroll-mt-32 rounded-cc-card border border-cc-line bg-cc-surface shadow-cc', className)}
      {...data}
    >
      <header className={cn('flex flex-wrap items-center justify-between gap-3', side ? 'px-4 pt-4' : 'px-4 pt-4 sm:px-5')}>
        <h2 id={id ? `${id}-title` : undefined} className="m-0 flex flex-wrap items-center gap-2 cc-text-h2 text-cc-ink">
          {title}
        </h2>
        {right}
      </header>
      {lead ? <p className={cn('m-0 mt-1 cc-text-cell text-cc-ink-muted', side ? 'px-4' : 'px-4 sm:px-5')}>{lead}</p> : null}
      <div className={cn(side ? 'px-4 pt-3 pb-4' : 'px-4 pt-3 pb-4 sm:px-5 sm:pb-5')}>{children}</div>
    </section>
  );
}
