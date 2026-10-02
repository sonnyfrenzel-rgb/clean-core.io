'use client';

import React from 'react';
import CcDisclosure from '@/components/cc/Disclosure';
import FoldedSection from '@/components/analyze/FoldedSection';
import { isLongList } from '@/lib/documentation-lists';

/**
 * A list on the Documentation stage that is not a section of its own — the
 * handbook's "In" and "Out" under the map. The same rule and the same control
 * as the stage's folded sections (`FoldedSection`, `lib/documentation-lists.ts`):
 * more than five rows and it starts closed with its count and one line; five
 * or fewer and it is open. Closed is not removed — the rows stay in the
 * document and print (`CcDisclosure`).
 */
export default function FoldedList({
  name,
  title,
  rows,
  summary,
  children,
}: {
  /** `data-doc-list` — what the specs and the screenshots find it by. */
  name: string;
  title: string;
  rows: number;
  /** The line seen while closed; only shown for a long list. */
  summary: string;
  children: React.ReactNode;
}) {
  const long = isLongList(rows);
  return (
    <div data-doc-list={name} data-doc-list-long={long ? 'true' : 'false'} className="min-w-0">
      <CcDisclosure title={title} count={rows} summary={long ? summary : undefined} defaultOpen={!long}>
        {children}
      </CcDisclosure>
    </div>
  );
}

/**
 * A list that is a section of its own — a card whose heading is the fold, the
 * look Analyze gave "Technical detail" and "Model summary" (02.10.2026). The
 * same rule: long starts closed with count and summary, short is open.
 */
export function FoldedListSection({
  name,
  title,
  rows,
  summary,
  level = 2,
  aside,
  children,
  ...data
}: {
  name: string;
  title: string;
  rows: number;
  summary: string;
  level?: 2 | 3 | 4;
  aside?: React.ReactNode;
  children: React.ReactNode;
} & { [key: `data-${string}`]: string | number | undefined }) {
  const long = isLongList(rows);
  return (
    <FoldedSection
      title={title}
      count={rows}
      summary={long ? summary : undefined}
      defaultOpen={!long}
      level={level}
      aside={aside}
      data-doc-list={name}
      data-doc-list-long={long ? 'true' : 'false'}
      {...data}
    >
      {children}
    </FoldedSection>
  );
}
