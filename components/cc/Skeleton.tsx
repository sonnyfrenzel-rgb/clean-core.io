'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { t } from '@/lib/cc-messages';
import { CC_SKELETON_DELAY_MS, useCcDelayedFlag } from './delay';

/**
 * The skeleton of `DESIGN.md` §2.8 — block D, step D.5c. Replaces
 * `components/Skeleton.tsx` once its five users move (D.22).
 *
 * Used where the layout is known — a header, a table, cards — and only when
 * loading takes longer than 300 ms. Mounting it *is* the loading state; it
 * paints nothing for the first 300 ms, so a page that loads in 120 ms never
 * shows a flash of grey bars.
 *
 * What it deliberately is not:
 *
 *   - **not moving.** No pulse, no shimmer: §1.7 allows no perpetual motion,
 *     and a block that breathes forever says "something is happening" without
 *     saying what. The shape of the page that is coming is the message.
 *   - **not a spinner over the page.** The skeleton stands where the content
 *     will stand, and the rest of the page stays usable (§2.8).
 *   - **not open to a className.** Four shapes, each the outline of a pattern
 *     the library already has (`CcStageHeader`/object page head, `CcTable`,
 *     `CcCard` grid, running text).
 *
 * The container is a polite status region with the name "Loading …", so a
 * screen reader hears once that the content is on its way; the blocks
 * themselves are hidden from it.
 */
export type CcSkeletonShape = 'header' | 'table' | 'cards' | 'text';

export interface CcSkeletonProps {
  shape: CcSkeletonShape;
  /** What is loading, spoken after "Loading": "projects", "findings". */
  label: string;
  /** Rows of a table, cards of a grid, lines of text. */
  count?: number;
}

const BLOCK = 'block rounded-cc-row bg-cc-line';

function Bar({ width, height = 'h-3' }: { width: string; height?: string }) {
  return <span data-cc-skeleton-block="" className={cn(BLOCK, height, width)} />;
}

const TEXT_WIDTHS = ['w-full', 'w-11/12', 'w-10/12', 'w-9/12'] as const;

function Shape({ shape, count }: { shape: CcSkeletonShape; count: number }) {
  switch (shape) {
    case 'header':
      return (
        <span className="flex flex-col gap-2">
          <Bar width="w-1/3" height="h-6" />
          <Bar width="w-1/2" />
        </span>
      );
    case 'table':
      return (
        <span className="flex flex-col">
          <span className="flex gap-4 border-b border-cc-line px-3 pb-2">
            <Bar width="w-1/4" height="h-2" />
            <Bar width="w-1/6" height="h-2" />
            <Bar width="w-1/6" height="h-2" />
          </span>
          {Array.from({ length: count }, (_, i) => (
            <span key={i} className="flex items-center gap-4 border-b border-cc-line px-3 py-3">
              <span className="flex w-1/4 flex-col gap-1">
                <Bar width="w-full" />
                <Bar width="w-1/2" height="h-2" />
              </span>
              <Bar width="w-1/6" />
              <Bar width="w-1/6" />
            </span>
          ))}
        </span>
      );
    case 'cards':
      return (
        <span className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: count }, (_, i) => (
            <span key={i} className="flex flex-col gap-3 rounded-cc-card border border-cc-line bg-cc-surface p-4">
              <Bar width="w-1/2" height="h-4" />
              <Bar width="w-full" />
              <Bar width="w-3/4" />
            </span>
          ))}
        </span>
      );
    case 'text':
      return (
        <span className="flex flex-col gap-2">
          {Array.from({ length: count }, (_, i) => (
            <Bar key={i} width={TEXT_WIDTHS[i % TEXT_WIDTHS.length]} />
          ))}
        </span>
      );
  }
}

const DEFAULT_COUNT: Record<CcSkeletonShape, number> = { header: 1, table: 5, cards: 2, text: 3 };

export default function CcSkeleton({ shape, label, count }: CcSkeletonProps) {
  const shown = useCcDelayedFlag(true, CC_SKELETON_DELAY_MS);

  return (
    <div
      role="status"
      aria-live="polite"
      data-cc-skeleton={shape}
      data-cc-skeleton-shown={shown ? 'true' : 'false'}
      className="w-full"
    >
      <span className="sr-only">{shown ? `${t('state.loading')} ${label}` : null}</span>
      {shown ? (
        <span aria-hidden={true} className="block w-full">
          <Shape shape={shape} count={count ?? DEFAULT_COUNT[shape]} />
        </span>
      ) : null}
    </div>
  );
}
