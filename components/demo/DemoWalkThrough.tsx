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
}: {
  model: ProcessMapModel;
  source: string;
  /** The demo's Design stage, where the business questions stand. */
  designHref?: string | null;
  /** A tour handed in without reading it here (a rendered test). */
  initialTour?: Tour | null;
}) {
  const [open, setOpen] = useState(false);
  const [tour, setTour] = useState<Tour | null>(initialTour);
  useEffect(() => {
    if (initialTour || !open || tour) return;
    let cancelled = false;
    void Promise.all([import('@/lib/process-walk-guide'), import('@/lib/process-tour')]).then(([g, t]) => {
      if (cancelled) return;
      const guide = g.buildWalkGuide(source, model, walkOrder(model, null));
      setTour(t.buildProcessTour(guide, model, t.tourClosingOf(source, APP_VERSION)));
    });
    return () => {
      cancelled = true;
    };
  }, [model, source, initialTour, open, tour]);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <ProcessTourEntry projectId="demo" onOpen={() => setOpen(true)} />
      {open ? <ProcessTour tour={tour} model={model} onClose={close} designHref={designHref} demo={true} /> : null}
    </>
  );
}
