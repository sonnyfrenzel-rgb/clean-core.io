'use client';

import React from 'react';
import Link from 'next/link';

/**
 * Where Economics' priced range stands on Design (ADR-130 (3)): a guard rail, not data. Design computes no amount and
 * shows none (ADR-022); it says what the decision was priced on and leads to Economics.
 *
 * A local slot until Economics' own read-side part is merged in (3.5.0, the Economics rebuild): it draws the cost
 * basis sentence the decision route already answers, or a neutral line when there is none.
 */
export default function EconomicsRangeSlot({ costLine, economicsHref }: { costLine: string | null; economicsHref: string | null }) {
  return (
    <p data-design-economics-range={costLine ? 'priced' : 'none'} className="m-0 cc-text-cell text-cc-ink-muted">
      {costLine ?? 'The amounts stand in Economics; Design shows none.'}{' '}
      {economicsHref ? (
        <Link href={economicsHref} className="font-semibold text-cc-information underline-offset-2 hover:underline">
          Economics
        </Link>
      ) : null}
    </p>
  );
}
