'use client';

import React from 'react';
import { Check, CircleX, LoaderCircle } from 'lucide-react';
import CcButton from '@/components/cc/Button';
import { savedTimeText, type SectionSave } from '@/lib/economics-help';

/** The reader's own time zone, so "Saved · 14:05" is the time on their clock — with the zone named. */
function readerZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Whether one part of Economics is saved (owner, 11.10.2026: "show clearly
 * when something was saved — more feedback"): "Saving…", "Saved · 14:05
 * GMT+2" with a check, or "Not saved — why · Retry". The same line as the
 * specification's save line (`components/requirements/RequirementsWorkspace.tsx`):
 * a failed save says so and keeps the edit; Retry stores it.
 *
 * `live` makes it a polite live region — once per step, not once per card, so
 * a screen reader hears one "Saved", not five.
 */
export default function SaveStatus({
  status,
  onRetry,
  live = false,
  scope,
}: {
  status: SectionSave;
  onRetry: () => void;
  live?: boolean;
  /** What the line is about, for its data attribute: "rates", "option:rebuild". */
  scope: string;
}) {
  const liveProps = live ? { role: 'status' as const, 'aria-live': 'polite' as const } : {};
  if (status.state === 'none') {
    return <span data-economics-section-save="none" data-economics-save-scope={scope} {...liveProps} />;
  }
  if (status.state === 'failed') {
    return (
      <span
        data-economics-section-save="failed"
        data-economics-save-scope={scope}
        {...liveProps}
        className="inline-flex flex-wrap items-center gap-2 cc-text-meta text-cc-error"
      >
        <CircleX size={14} aria-hidden={true} className="shrink-0" />
        <span>Not saved — {status.message}</span>
        <CcButton variant="ghost" onClick={onRetry} data-economics-section-retry={scope}>
          Retry
        </CcButton>
      </span>
    );
  }
  if (status.state === 'saving') {
    return (
      <span
        data-economics-section-save="saving"
        data-economics-save-scope={scope}
        {...liveProps}
        className="inline-flex items-center gap-1 cc-text-meta text-cc-ink-muted"
      >
        <LoaderCircle size={14} aria-hidden={true} className="shrink-0 motion-safe:animate-spin" />
        <span>Saving…</span>
      </span>
    );
  }
  const time = savedTimeText(status.at, readerZone());
  return (
    <span
      data-economics-section-save="saved"
      data-economics-save-scope={scope}
      {...liveProps}
      className="inline-flex items-center gap-1 cc-text-meta text-cc-ink-muted"
    >
      <Check size={14} strokeWidth={3} aria-hidden={true} className="shrink-0 text-cc-information" />
      <span>{time ? `Saved · ${time}` : 'Saved'}</span>
    </span>
  );
}
