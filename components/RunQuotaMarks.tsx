import React from 'react';
import { cn } from '@/lib/utils';
import { runsAreSelfFunded, runsRemaining, COMMUNITY_QUOTA_FALLBACK, type QuotaSubject } from '@/lib/run-quota-rule';

/**
 * The free runs as small marks beside the shell's quota line (AB-14b, mockup `shell`: "the free runs as five small
 * marks in the shell"). One mark per run of the free allowance: filled while it is left, hollow once used.
 *
 * Decorative only — the words beside it ("3 of 5 runs left", `runsLeftLabel`) carry the meaning, so the marks are
 * hidden from assistive technology and never the only cue. Not drawn for an own key or an allowance above ten, where
 * there is nothing to count off.
 */
export const QUOTA_MARKS_MAX = 10;

export default function RunQuotaMarks({ profile }: { profile: QuotaSubject | null | undefined }) {
  if (!profile || runsAreSelfFunded(profile)) return null;
  const limit = typeof profile.transformationsLimit === 'number' ? profile.transformationsLimit : COMMUNITY_QUOTA_FALLBACK;
  if (limit < 1 || limit > QUOTA_MARKS_MAX) return null;
  const left = runsRemaining(profile);
  return (
    <span aria-hidden={true} data-shell-quota-marks={`${left}/${limit}`} className="inline-flex items-center gap-0.5">
      {Array.from({ length: limit }, (_, i) => (
        <i
          key={i}
          className={cn('inline-block h-2 w-2 rounded-full border border-cc-ink-muted', i < left ? 'bg-cc-ink-muted' : 'bg-transparent')}
        />
      ))}
    </span>
  );
}
