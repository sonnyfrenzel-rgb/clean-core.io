'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ProcessWalkThrough from '@/components/workspace/ProcessWalkThrough';
import { walkOrder } from '@/lib/process-walk';
import { walkStops, type WalkGuide, type WalkRange } from '@/lib/process-walk-guide';
import type { ProcessMapModel } from '@/lib/process-map';
import type { StateEntry } from '@/lib/process-states';

/**
 * The guided walk-through in the public demo — roadmap 3.0.20, owner decision
 * 21.10.2026 (7): the demo shows the walk an own project leads with, read only.
 *
 * The same component and the same engine sentences as in a project
 * (`ProcessWalkThrough`, `lib/process-walk-guide.ts`), read in this browser
 * from the demo's map. What the demo leaves out is everything that would
 * write: the answers are shown and disabled, with "Demo: nothing is saved",
 * and no model is asked to reword anything — the demo calls no model.
 */
const NO_ANSWERS: Readonly<Record<string, StateEntry>> = Object.freeze({});

export default function DemoWalkThrough({
  model,
  source,
  fileName,
  onShowStep,
  onOpenLines,
  initialGuide = null,
}: {
  model: ProcessMapModel;
  source: string;
  fileName: string;
  /** Select a step on the map beside the walk. */
  onShowStep?: (elementId: string, plane: string | null) => void;
  onOpenLines?: (range: WalkRange) => void;
  /** A walk handed in without reading it here (a rendered test). */
  initialGuide?: WalkGuide | null;
}) {
  const [guide, setGuide] = useState<WalkGuide | null>(initialGuide);
  useEffect(() => {
    if (initialGuide) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void import('@/lib/process-walk-guide').then((m) => {
        if (!cancelled) setGuide(m.buildWalkGuide(source, model, walkOrder(model, null)));
      });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [model, source, initialGuide]);
  const stops = useMemo(() => (guide ? walkStops(guide) : []), [guide]);
  const [at, setAt] = useState<number | null>(null);
  const go = useCallback(
    (index: number) => {
      const stop = stops[index];
      if (!stop) return;
      setAt(index);
      if (stop.kind === 'step') {
        const element = model.elements.find((e) => e.id === stop.id);
        if (element) onShowStep?.(element.id, element.plane);
      }
    },
    [stops, model, onShowStep],
  );
  const nothing = useCallback(() => undefined, []);
  return (
    <ProcessWalkThrough
      projectId="demo"
      guide={guide}
      stops={stops}
      at={at}
      answers={NO_ANSWERS}
      subjectOf={() => null}
      owner={false}
      answering={null}
      onAnswer={nothing}
      onAnswerMany={nothing}
      onGo={go}
      onClose={() => setAt(null)}
      onOpenLines={onOpenLines ?? nothing}
      source={source}
      fileName={fileName}
      demo={true}
    />
  );
}
