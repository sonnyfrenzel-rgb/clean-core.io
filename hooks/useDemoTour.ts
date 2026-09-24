'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  TOUR_START,
  endTour,
  nextStep,
  pauseTour,
  readTourProgress,
  resumeTour,
  writeTourProgress,
  type TourProgress,
} from '@/lib/demo-tour';
import { SHOW_TIPS_EVENT } from '@/lib/show-tips-again';

/**
 * The demo tour's progress, held once for the whole screen — roadmap 3.0.7.
 *
 * One hook for the same reason `useCoachMarks` is one hook: slots that each
 * read storage are several copies of "where is the reader", and the first
 * "Next" leaves the others stale. The slots render what they are handed.
 *
 * `null` until storage has been read: a station shown on the server pass and
 * replaced a frame later by the one the reader was really at is worse than one
 * that arrives a frame late.
 */
export interface DemoTour {
  progress: TourProgress | null;
  next: () => void;
  pause: () => void;
  resume: () => void;
  end: () => void;
  restart: () => void;
}

export function useDemoTour(): DemoTour {
  const [progress, setProgress] = useState<TourProgress | null>(null);

  useEffect(() => {
    setProgress(readTourProgress());
    const again = () => setProgress(readTourProgress());
    window.addEventListener(SHOW_TIPS_EVENT, again);
    return () => window.removeEventListener(SHOW_TIPS_EVENT, again);
  }, []);

  const apply = useCallback((step: (p: TourProgress) => TourProgress) => {
    setProgress((prev) => {
      const next = step(prev ?? { ...TOUR_START });
      writeTourProgress(next);
      return next;
    });
  }, []);

  return {
    progress,
    next: useCallback(() => apply(nextStep), [apply]),
    pause: useCallback(() => apply(pauseTour), [apply]),
    resume: useCallback(() => apply(resumeTour), [apply]),
    end: useCallback(() => apply(endTour), [apply]),
    restart: useCallback(() => apply(() => ({ ...TOUR_START })), [apply]),
  };
}
