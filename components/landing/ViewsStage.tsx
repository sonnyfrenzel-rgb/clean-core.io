'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import CcSegmentedControl from '@/components/cc/SegmentedControl';

export interface StageView {
  key: 'business' | 'it' | 'management';
  label: string;
  question: string;
  src: string;
  alt: string;
  width: number;
  height: number;
}

/**
 * The three views on the landing page — roadmap 3.0.6, `DESIGN.md` §1.7.
 *
 * Each picture is a capture of the real demo workspace (`lib/landing-shots.ts`),
 * never a drawing. The stage plays once — Business, IT, Management — and stops:
 * hovering or focusing it pauses, choosing a view takes over, and with reduced
 * motion it does not move at all. The switch is the product's own view switch,
 * `CcSegmentedControl` (DESIGN.md §1.5) — one radio group, arrow keys included.
 */
export default function ViewsStage({ views }: { views: StageView[] }) {
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const paused = useRef(false);

  useEffect(() => {
    let reduce = false;
    try {
      reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      /* no matchMedia: stay still */
      reduce = true;
    }
    if (!reduce) setPlaying(true);
  }, []);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      if (paused.current) return;
      setCurrent((i) => {
        if (i + 1 >= views.length) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, 4500);
    return () => window.clearInterval(timer);
  }, [playing, views.length]);

  const choose = (i: number) => {
    setPlaying(false);
    setCurrent(i);
  };

  const view = views[current];
  return (
    <div
      className="rounded-3xl border border-cc-line bg-cc-surface p-3 sm:p-5 shadow-[0_24px_64px_rgb(11_28_48/0.10)]"
      onMouseEnter={() => (paused.current = true)}
      onMouseLeave={() => (paused.current = false)}
      onFocusCapture={() => (paused.current = true)}
      onBlurCapture={() => (paused.current = false)}
      data-landing-views=""
    >
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <CcSegmentedControl
          label="View"
          segments={views.map((v) => ({ value: v.key, label: v.label }))}
          value={view.key}
          onChange={(key) => choose(views.findIndex((v) => v.key === key))}
        />
        <p className="text-sm font-medium text-cc-ink-muted">Demo project · fictitious code · captured from the workspace</p>
      </div>
      <div id="landing-view-panel" className="mt-4">
        <p className="text-base font-bold text-cc-ink">{view.question}</p>
        <div className="mt-3 overflow-hidden rounded-xl border border-cc-line bg-cc-page">
          <Image src={view.src} alt={view.alt} width={view.width} height={view.height} sizes="(min-width: 1024px) 720px, 100vw" className="h-auto w-full" />
        </div>
      </div>
      <p className="mt-3 text-xs font-medium text-cc-ink-muted">
        {playing ? 'Plays once. Hover or focus pauses it; choose a view to take over.' : 'Choose a view.'}
      </p>
    </div>
  );
}
