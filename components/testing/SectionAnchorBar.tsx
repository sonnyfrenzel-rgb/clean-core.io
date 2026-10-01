'use client';

import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * The anchor bar of an object page (proposal A): the sections of the tool as
 * links, sticky under the app header, the section in view underlined.
 *
 * Links, not tabs — every section stays on the page and the bar only moves the
 * reader to it, so it is a `nav` of in-page links with `aria-current` on the
 * one in view (scroll spy). A section that is not on the page (another tab is
 * open) is skipped rather than linked to nothing.
 */
export interface AnchorItem {
  id: string;
  label: string;
  count?: number;
}

export default function SectionAnchorBar({ items, label = 'Sections' }: { items: AnchorItem[]; label?: string }) {
  const [current, setCurrent] = useState(items[0]?.id ?? '');
  const ids = items.map((i) => i.id).join('|');

  useEffect(() => {
    const targets = ids
      .split('|')
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => !!el);
    if (targets.length === 0 || typeof IntersectionObserver === 'undefined') return undefined;
    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.set(e.target.id, e.boundingClientRect.top);
          else visible.delete(e.target.id);
        }
        const first = [...visible.entries()].sort((a, b) => a[1] - b[1])[0];
        if (first) setCurrent(first[0]);
      },
      { rootMargin: '-120px 0px -55% 0px' },
    );
    targets.forEach((t) => observer.observe(t));
    return () => observer.disconnect();
  }, [ids]);

  if (items.length === 0) return null;

  return (
    <nav
      aria-label={label}
      data-anchor-bar=""
      className="cc-no-print sticky top-14 z-cc-sticky -mx-4 mb-5 border-b border-cc-line bg-cc-surface px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
    >
      <ul className="m-0 flex list-none gap-1 overflow-x-auto p-0 [scrollbar-width:none]">
        {items.map((item) => {
          const on = item.id === current;
          return (
            <li key={item.id} className="shrink-0">
              <a
                href={`#${item.id}`}
                aria-current={on ? 'location' : undefined}
                onClick={() => setCurrent(item.id)}
                className={cn(
                  'inline-flex items-center gap-1 border-b-2 px-3 pt-3 pb-2 text-[13px] whitespace-nowrap text-cc-ink no-underline',
                  on ? 'border-cc-ink font-bold' : 'border-transparent font-medium hover:border-cc-line',
                )}
              >
                {item.label}
                {item.count !== undefined ? <span className="font-medium text-cc-ink-muted">({item.count})</span> : null}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
