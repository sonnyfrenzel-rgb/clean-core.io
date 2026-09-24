'use client';

import React from 'react';
import { Compass, Plus } from 'lucide-react';
import CcButton from '@/components/cc/Button';
import CcLinkButton from '@/components/cc/LinkButton';
import {
  TOUR_INVITATION_ACTION,
  TOUR_INVITATION_HREF,
  TOUR_INVITATION_TITLE,
  tourPositionLabel,
  type TourSlot,
} from '@/lib/demo-tour';

/**
 * One tour stop, where it belongs — roadmap 3.0.7, `DESIGN.md` §6.1.2.
 *
 * Inline, in the flow, directly above the place it is about — the reasons are
 * the coach marks' (`components/workspace/CoachMarks.tsx`): a floating bubble
 * breaks on a phone and is missed by the keyboard; a note in the flow is the
 * next Tab stop. Never a dialog, never blocking.
 *
 * It renders what `tourSlot` answered for its place, which is at most one
 * thing on the whole screen: a station with *"3 of 12"* and "Next", "Pause
 * tour", "End tour" — or, after every third station and at the end, the
 * invitation card with a `primary` "New project".
 */
export default function DemoTourStop({
  slot,
  onNext,
  onPause,
  onEnd,
}: {
  slot: TourSlot;
  onNext: () => void;
  onPause: () => void;
  onEnd: () => void;
}) {
  if (!slot) return null;

  if (slot.kind === 'invitation') {
    return (
      <div
        data-demo-tour-invitation={slot.station.place}
        role="note"
        aria-label={TOUR_INVITATION_TITLE}
        className="mb-2 flex flex-wrap items-center gap-3 rounded-cc-card border border-cc-line bg-cc-surface px-4 py-3"
      >
        <span className="min-w-0 flex-1">
          <b className="block text-[14px] font-bold text-cc-ink">{TOUR_INVITATION_TITLE}</b>
          <span className="block text-[12px] leading-snug font-medium text-cc-ink-muted">
            An example costs nothing and is analysed by the same engine as this demo. Your own code stays yours.
          </span>
        </span>
        <span className="flex shrink-0 flex-wrap items-center gap-1.5">
          <span data-demo-tour-new-project="" className="contents">
            <CcLinkButton
              href={TOUR_INVITATION_HREF}
              variant="primary"
              icon={<Plus size={16} aria-hidden={true} />}
            >
              {TOUR_INVITATION_ACTION}
            </CcLinkButton>
          </span>
          {slot.last ? (
            <CcButton onClick={onEnd} data-demo-tour-end="">
              End tour
            </CcButton>
          ) : (
            <CcButton onClick={onNext} data-demo-tour-continue="">
              Continue tour
            </CcButton>
          )}
        </span>
      </div>
    );
  }

  const { station, index, total } = slot;
  return (
    <div
      data-demo-tour-station={station.place}
      role="note"
      aria-label={`Tour, ${tourPositionLabel(index, total)}: ${station.title}`}
      className="mb-2 flex flex-wrap items-start gap-2.5 rounded-cc-row border border-cc-information-border bg-cc-information-bg px-3 py-2"
    >
      <span aria-hidden={true} className="mt-0.5 shrink-0 text-cc-information">
        <Compass size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span data-demo-tour-position="" className="block text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase">
          Tour · {tourPositionLabel(index, total)}
        </span>
        <b className="text-[13px] font-semibold text-cc-ink">{station.title}</b>
        <span className="block text-[12px] leading-snug font-medium text-cc-ink-muted">{station.body}</span>
      </span>
      <span className="flex shrink-0 flex-wrap items-center gap-1.5">
        <CcButton variant="secondary" onClick={onNext} data-demo-tour-next="">
          Next
        </CcButton>
        <CcButton onClick={onPause} data-demo-tour-pause="">
          Pause tour
        </CcButton>
        <CcButton onClick={onEnd} data-demo-tour-end="">
          End tour
        </CcButton>
      </span>
    </div>
  );
}
