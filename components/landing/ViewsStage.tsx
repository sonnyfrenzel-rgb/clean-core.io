'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';

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
 * motion it does not move at all. Tabs follow the ARIA tab pattern, arrow keys
 * included.
 */
export default function ViewsStage({ views }: { views: StageView[] }) {
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const paused = useRef(false);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);

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

  const choose = (i: number, focus = false) => {
    setPlaying(false);
    setCurrent(i);
    if (focus) tabs.current[i]?.focus();
  };

  const onKey = (e: React.KeyboardEvent, i: number) => {
    const last = views.length - 1;
    if (e.key === 'ArrowRight') choose(i === last ? 0 : i + 1, true);
    else if (e.key === 'ArrowLeft') choose(i === 0 ? last : i - 1, true);
    else if (e.key === 'Home') choose(0, true);
    else if (e.key === 'End') choose(last, true);
    else return;
    e.preventDefault();
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
        <div role="tablist" aria-label="View" className="inline-flex rounded-lg border border-cc-field-border bg-cc-surface-muted p-0.5">
          {views.map((v, i) => (
            <button
              key={v.key}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`landing-view-tab-${v.key}`}
              aria-selected={i === current}
              aria-controls="landing-view-panel"
              tabIndex={i === current ? 0 : -1}
              onClick={() => choose(i)}
              onKeyDown={(e) => onKey(e, i)}
              className={`min-h-9 rounded-md px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cc-focus ${
                i === current ? 'bg-cc-ink text-white' : 'text-cc-ink-muted hover:text-cc-ink'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
        <p className="text-sm font-medium text-cc-ink-muted">Demo project · fictitious code · captured from the workspace</p>
      </div>
      <div id="landing-view-panel" role="tabpanel" aria-labelledby={`landing-view-tab-${view.key}`} className="mt-4">
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
