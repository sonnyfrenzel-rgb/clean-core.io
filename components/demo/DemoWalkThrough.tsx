'use client';

import React, { useCallback, useEffect, useState } from 'react';
import ProcessTour from '@/components/workspace/ProcessTour';
import ProcessTourEntry from '@/components/workspace/ProcessTourEntry';
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
 */
export default function DemoWalkThrough({
  model,
  source,
  designHref = null,
  initialTour = null,
  open: openProp,
  onOpenChange,
  entry = true,
}: {
  model: ProcessMapModel;
  source: string;
  /** The demo's Design stage, where the business questions stand. */
  designHref?: string | null;
  /** A tour handed in without reading it here (a rendered test). */
  initialTour?: Tour | null;
  /**
   * Held by the page when its own invitation opens the tour (the demo's
   * Analyze, Business: "Walk me through it", as in a project's Analyze).
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** The entry card with its own button; off where the page's invitation is the way in. */
  entry?: boolean;
}) {
  const [ownOpen, setOwnOpen] = useState(false);
  const open = openProp ?? ownOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      if (openProp === undefined) setOwnOpen(next);
      onOpenChange?.(next);
    },
    [openProp, onOpenChange],
  );
  const [tour, setTour] = useState<Tour | null>(initialTour);
  /** The tour could not be read (a module that did not load, a build that threw): said, never an endless "Reading …". */
  const [failed, setFailed] = useState(false);
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
    setOpen(false);
    setFailed(false);
  }, [setOpen]);
  return (
    <>
      {entry ? <ProcessTourEntry projectId="demo" onOpen={() => setOpen(true)} /> : null}
      {open ? <ProcessTour tour={tour} unavailable={failed} model={model} onClose={close} designHref={designHref} demo={true} /> : null}
    </>
  );
}
