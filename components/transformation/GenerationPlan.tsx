'use client';

import React from 'react';
import CcMessageStrip from '@/components/cc/MessageStrip';
import { cn } from '@/lib/utils';
import { wt } from '@/lib/workspace-messages';
import type { Preflight } from '@/lib/transformation/preflight';

/** What the start screen knows of the plan before the click. */
export type PlanView = { state: 'reading' } | { state: 'unavailable' } | { state: 'ready'; preflight: Preflight };

/**
 * The plan and its limits, before the click (owner, 13.10.2026): how many
 * functions in how many calls, the call budget, how many at once, the
 * per-call deadline, the generation's time limit, the prompt cap, the
 * generations left this hour, and the expected duration — each a number the
 * server enforces (`lib/transformation/preflight.ts`). A plan that cannot
 * succeed says why, with its code and what to do, and the button above stays
 * off; functions that will not be written are named before the start.
 *
 * A part of the "Before the run" card, not a card of its own — no heading
 * style of its own beyond the card's `h3` label.
 */
export default function GenerationPlan({ plan }: { plan: PlanView }) {
  return (
    <section aria-labelledby="transformation-plan-title" data-generation-plan={plan.state} className="mt-4 rounded-cc-row border border-cc-line p-3">
      <h3 id="transformation-plan-title" className="m-0 cc-text-label text-cc-ink-muted">
        {wt('transformation.planTitle')}
      </h3>
      {plan.state === 'reading' ? (
        <p className="m-0 mt-2 text-[13px] font-medium text-cc-ink-muted">{wt('transformation.planReading')}</p>
      ) : plan.state === 'unavailable' ? (
        <p className="m-0 mt-2 text-[13px] font-medium text-cc-ink-muted">{wt('transformation.planUnavailable')}</p>
      ) : (
        <>
          {plan.preflight.blocked ? (
            <div className="mt-2" data-generation-blocked={plan.preflight.blocked.code}>
              <CcMessageStrip state="warning" headline={wt('transformation.planBlocked')}>
                <span className="font-cc-mono font-semibold">{plan.preflight.blocked.label}</span> — {plan.preflight.blocked.title}.{' '}
                {plan.preflight.blocked.detail} {plan.preflight.blocked.action}
              </CcMessageStrip>
            </div>
          ) : null}
          <dl className="m-0 mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-[13px] sm:grid-cols-[auto_minmax(0,1fr)]">
            {plan.preflight.limits.map((l) => (
              <div key={l.key} data-plan-limit={l.key} className="contents">
                <dt className="font-semibold text-cc-ink-muted">{l.label}</dt>
                <dd className={cn('m-0 min-w-0 font-medium [overflow-wrap:anywhere]', l.attention ? 'text-cc-warning' : 'text-cc-ink')}>{l.value}</dd>
              </div>
            ))}
          </dl>
          {plan.preflight.notWritten.length > 0 ? (
            <div className="mt-2" data-plan-not-written={plan.preflight.notWritten.length}>
              <p className="m-0 text-[13px] font-semibold text-cc-ink">{wt('transformation.planNotWritten')}</p>
              <ul className="m-0 mt-1 list-none p-0 text-[12px] font-medium text-cc-ink-muted">
                {plan.preflight.notWritten.map((u) => (
                  <li key={u.unitId} data-plan-unit={u.unitId}>
                    <span className="font-cc-mono font-semibold text-cc-ink">{u.unitId}</span> ·{' '}
                    <span className="font-cc-mono">{u.issue.label}</span> — {u.issue.detail} {u.issue.action}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
