'use client';

import React, { useCallback, useEffect, useState } from 'react';
import ProcessTour, { type TourMove } from '@/components/workspace/ProcessTour';
import { walkOrder } from '@/lib/process-walk';
import type { ProcessTour as Tour } from '@/lib/process-tour';
import type { ProcessMapModel } from '@/lib/process-map';
import { APP_VERSION } from '@/lib/version';

/**
 * The guided tour on the process map in the public demo (owner decisions
 * 21.10.2026): the tour an own project gets, with the same component and the
 * same engine sentences (`ProcessTour`, `lib/process-tour.ts`), read in this
 * browser from the demo's map. It asks nothing, so the demo shows it as it is;
 * no model is asked to reword anything — the demo calls no model.
 *
 * Since 3.2.0 (plan AB-4, O10) it runs on the page where the demo's map stands,
 * as in a project's Analyze (`inline`), with the same two endings on its last
 * card; its way in is the page's invitation, "Walk me through it".
 */
export default function DemoWalkThrough({
  model,
  source,
  designHref = null,
  initialTour = null,
  open,
  onOpenChange,
  endings = null,
  onMove,
}: {
  model: ProcessMapModel;
  source: string;
  /** The demo's Design stage, where the business questions stand. */
  designHref?: string | null;
  /** A tour handed in without reading it here (a rendered test). */
  initialTour?: Tour | null;
  /** Held by the page: its invitation opens the tour (the demo's Analyze, Business, as in a project's Analyze). */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The two endings, on the tour's last card. */
  endings?: React.ReactNode;
  /** Where the tour stands, for the page around the map. */
  onMove?: (move: TourMove | null) => void;
}) {
  const [tour, setTour] = useState<Tour | null>(initialTour);
  /** The tour could not be read (a module that did not load, a build that threw): said, never an endless "Reading …". */
  const [failed, setFailed] = useState(false);
  /** Pause: the next "Walk me through it" opens the tour at the same station. */
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  useEffect(() => {
    if (initialTour || !open || tour || failed) return;
    let cancelled = false;
    void Promise.all([import('@/lib/process-walk-guide'), import('@/lib/process-tour')])
      .then(([g, t]) => {
        if (cancelled) return;
        const guide = g.buildWalkGuide(source, model, walkOrder(model, null));
        setTour(t.buildProcessTour(guide, model, t.tourReadingOf(source, APP_VERSION)));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [model, source, initialTour, open, tour, failed]);
  // Closing clears a failure, so opening the tour again reads it again.
  const close = useCallback(() => {
    onOpenChange(false);
    onMove?.(null);
    setFailed(false);
    setPausedAt(null);
  }, [onOpenChange, onMove]);
  const pause = useCallback(
    (at: number) => {
      onOpenChange(false);
      onMove?.(null);
      setPausedAt(at);
    },
    [onOpenChange, onMove],
  );
  return open ? (
    <ProcessTour
      inline
      tour={tour}
      unavailable={failed}
      model={model}
      onClose={close}
      onPause={pause}
      onMove={onMove}
      initialStation={pausedAt ?? -1}
      designHref={designHref}
      demo={true}
      endings={endings}
    />
  ) : null;
}
