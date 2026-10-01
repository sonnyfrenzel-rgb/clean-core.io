'use client';

import React from 'react';
import { Check, Lock } from 'lucide-react';
import CcCard from '@/components/cc/Card';

/**
 * "What this tab does" — a short checklist in the right rail of each Testing
 * tab: what the tab does, ticked, and what it does not, behind a lock. The
 * plain-words home of what used to stand in three marketing tiles.
 */
export interface TabExplainerItem {
  text: React.ReactNode;
  /** Something the tab deliberately does not do. */
  not?: boolean;
}

export default function TabExplainer({ items, note }: { items: TabExplainerItem[]; note?: React.ReactNode }) {
  return (
    <CcCard title="What this tab does">
      <ul data-tab-explainer className="m-0 grid list-none gap-2 p-0">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 cc-text-cell text-cc-ink">
            {item.not ? (
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-cc-warning" aria-hidden="true" />
            ) : (
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-cc-ink-muted" aria-hidden="true" />
            )}
            <span className="min-w-0">{item.text}</span>
          </li>
        ))}
      </ul>
      {note ? <p className="mt-3 mb-0 cc-text-meta text-cc-ink-muted">{note}</p> : null}
    </CcCard>
  );
}
