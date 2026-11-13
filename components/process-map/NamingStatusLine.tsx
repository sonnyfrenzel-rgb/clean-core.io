'use client';

import React from 'react';
import { PenLine } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MapNameArrival } from '@/lib/naming-arrival';
import { aiNamesLegend } from '@/lib/messages/ai-names';

/**
 * The one status line under the map while the AI names arrive, and after — roadmap 3.1.0 item 4, mockup states 1, 2,
 * 3 and 18: "Naming steps in plain language … 13 of 25", then "Names are ready." with how many steps keep the name
 * the engine read. A failed or slow model is one sentence here and nothing anywhere else.
 *
 * A polite live region: the count is read out when it settles, not on every swap (the region holds one line, and a
 * screen reader reads the last one). The pen mark's legend stands beside it once a name is on the map.
 */
export default function NamingStatusLine({ arrival }: { arrival: MapNameArrival }) {
  const { status } = arrival;
  if (!status) return null;
  const busy = status.tone === 'busy';
  return (
    <div className="flex flex-col gap-2">
      <div
        role="status"
        aria-live="polite"
        data-naming-status={arrival.phase}
        data-naming-named={arrival.named}
        data-naming-total={arrival.total}
        className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-cc-card border border-cc-line bg-cc-surface px-3 py-2 text-[13px] font-medium text-cc-ink"
      >
        <span
          aria-hidden="true"
          className={cn(
            'h-2 w-2 shrink-0 rounded-full',
            busy ? 'cc-naming-pulse bg-cc-information' : 'bg-cc-success',
          )}
        />
        <span data-naming-status-text="">{status.text}</span>
        {status.progress !== null ? (
          <span aria-hidden="true" className="h-1 w-[140px] shrink-0 overflow-hidden rounded-full bg-cc-line">
            <span
              className="block h-full bg-cc-ink transition-[width] duration-300"
              style={{ width: `${Math.round(status.progress * 100)}%` }}
            />
          </span>
        ) : null}
        {status.sub ? <span className="text-[12px] text-cc-ink-muted">{status.sub}</span> : null}
      </div>
      {arrival.shown.size > 0 ? (
        <p data-naming-legend="" className="m-0 flex items-center gap-2 text-[12px] font-medium text-cc-ink-muted">
          <PenLine size={14} aria-hidden={true} className="shrink-0 text-cc-warning" />
          {aiNamesLegend()}
        </p>
      ) : null}
    </div>
  );
}
