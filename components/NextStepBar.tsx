'use client';

import React from 'react';
import { ArrowRight } from 'lucide-react';
import CcLinkButton from '@/components/cc/LinkButton';
import type { JourneyNext } from '@/lib/journey-next';

/**
 * The one "next step" of every tool (journey review 26.11.2026, M2): a bar along the foot of the window with one named
 * action, worked out by Re-design's own rule (`journeyNext` → `redesignModel`), decision included, and handed in by
 * the header that also tags the tool row with it — one source, so the two never disagree. It is the page's way on;
 * nothing is locked by it — every tool stays one click away in the tool row.
 *
 * Nothing while the way is not known yet (`way === null`), and nothing on the Re-design page, which is that step list.
 */
export default function NextStepBar({ way, base }: { way: JourneyNext | null; base: string }) {
  if (!way) return null;
  const target = way.after ?? (way.next && !way.next.done ? { label: way.next.label, path: way.next.path } : null);
  if (!target) return null;
  const note = way.after ? null : way.next?.note ?? null;
  return (
    <div
      data-next-step-bar=""
      className="cc-no-print fixed inset-x-0 bottom-0 z-cc-sticky border-t border-cc-line bg-cc-surface shadow-[var(--cc-shadow-strip)]"
    >
      <div className="mx-auto flex max-w-[1536px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 pr-20 sm:px-6 sm:pr-24 lg:px-8 lg:pr-28">
        <span className="cc-text-label text-cc-ink-muted">{way.after ? 'After this page' : 'Next step'}</span>
        <CcLinkButton href={`${base}/${target.path}`} variant="secondary" data-next-step-target={target.path}>
          {target.label}
          <ArrowRight size={16} aria-hidden={true} />
        </CcLinkButton>
        {note ? <span className="cc-text-meta text-cc-ink-muted max-sm:hidden">{note}</span> : null}
      </div>
    </div>
  );
}
