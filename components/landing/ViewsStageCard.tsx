'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * "One case, three views" in motion — landing mockup, section `views`.
 *
 * The mockup's stage card: a segmented Business | IT | Management switch whose
 * highlight slides, one fact with its anchor, and the view's answer below it.
 * It plays once (Business → IT → Management → Business) when it scrolls into
 * view, pauses on hover or focus, and hands over the moment a reader chooses a
 * view. With reduced motion it shows the three views side by side; on a phone it
 * waits to be chosen. The list beside it (`[data-view-item]`) follows the
 * current view.
 */

export interface StageCardView {
  key: string;
  label: string;
  question: string;
  answer: string;
  detail: ReactNode;
}

const ORDER = [0, 1, 2, 0];
const DWELL = 3500;

export default function ViewsStageCard({ views, label, fact }: { views: StageCardView[]; label: string; fact: ReactNode }) {
  const [cur, setCur] = useState(0);
  const [mode, setMode] = useState<'auto' | 'manual' | 'static'>('auto');
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const hl = useRef<HTMLSpanElement>(null);
  const step = useRef(0);
  const paused = useRef(false);

  const show = useCallback((i: number) => {
    setCur(i);
    const list = card.current?.closest('[data-views]')?.querySelectorAll('[data-view-item]');
    list?.forEach((li, k) => li.classList.toggle('cur', k === i));
  }, []);

  // Place the sliding highlight under the chosen tab.
  useEffect(() => {
    const b = tabs.current[cur];
    if (!b || !hl.current) return;
    hl.current.style.width = `${b.offsetWidth}px`;
    hl.current.style.transform = `translateX(${b.offsetLeft - 2}px)`;
  }, [cur, mode]);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setMode(reduce.matches ? 'static' : window.innerWidth < 760 ? 'manual' : 'auto');
    apply();
    reduce.addEventListener('change', apply);
    window.addEventListener('resize', apply);
    return () => {
      reduce.removeEventListener('change', apply);
      window.removeEventListener('resize', apply);
    };
  }, []);

  // The loop: one view every DWELL, held while the card is hovered or focused.
  useEffect(() => {
    if (!playing) return;
    let id: ReturnType<typeof setTimeout>;
    const run = () => {
      if (paused.current) {
        id = setTimeout(run, 250);
        return;
      }
      step.current += 1;
      show(ORDER[step.current]);
      if (step.current >= ORDER.length - 1) {
        setPlaying(false);
        return;
      }
      id = setTimeout(run, DWELL);
    };
    id = setTimeout(run, DWELL);
    return () => clearTimeout(id);
  }, [playing, show]);

  const play = useCallback(() => {
    setStarted(true);
    step.current = 0;
    show(0);
    setPlaying(true);
  }, [show]);

  const stop = () => {
    setPlaying(false);
    setStarted(true);
  };

  // Plays once, when half of the card is on screen.
  useEffect(() => {
    if (mode !== 'auto' || started || !card.current || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          play();
        }
      },
      { threshold: 0.5 },
    );
    io.observe(card.current);
    return () => io.disconnect();
  }, [mode, started, play]);

  useEffect(() => {
    if (mode !== 'auto') setPlaying(false);
  }, [mode]);

  const choose = (i: number) => {
    stop();
    show(i);
  };

  const caption =
    mode === 'static'
      ? 'The same rule in three views, side by side.'
      : mode === 'manual'
        ? 'Choose a view. Only the content around the anchor changes.'
        : 'Plays once. Hover or focus pauses it; choose a view to take over.';

  return (
    <div
      ref={card}
      className={`stagecard${mode === 'static' ? ' static' : ''}`}
      onMouseEnter={() => (paused.current = true)}
      onMouseLeave={() => (paused.current = false)}
      onFocus={() => (paused.current = true)}
      onBlur={(e) => {
        if (!card.current?.contains(e.relatedTarget as Node | null)) paused.current = false;
      }}
    >
      <div className="st-top">
        <div className="seg3" role="tablist" aria-label="View">
          <span className="hl" ref={hl} aria-hidden="true" />
          {views.map((v, k) => (
            <button
              key={v.key}
              ref={(el) => {
                tabs.current[k] = el;
              }}
              type="button"
              role="tab"
              id={`v3t-${v.key}`}
              aria-selected={cur === k}
              aria-controls={`v3p-${v.key}`}
              tabIndex={cur === k ? 0 : -1}
              onClick={() => choose(k)}
              onKeyDown={(e) => {
                let n: number | null = null;
                if (e.key === 'ArrowRight') n = (k + 1) % views.length;
                if (e.key === 'ArrowLeft') n = (k + views.length - 1) % views.length;
                if (e.key === 'Home') n = 0;
                if (e.key === 'End') n = views.length - 1;
                if (n !== null) {
                  e.preventDefault();
                  choose(n);
                  tabs.current[n]?.focus();
                }
              }}
            >
              {v.label}
            </button>
          ))}
        </div>
        <span className="st-label">{label}</span>
      </div>
      <div className="panel3">
        <div className="fact3">{fact}</div>
        {views.map((v, k) => (
          <div key={v.key} className={`view3${cur === k ? ' on' : ''}`} id={`v3p-${v.key}`} role="tabpanel" aria-labelledby={`v3t-${v.key}`} hidden={mode === 'static'}>
            <p className="q">{v.question}</p>
            <p className="s">{v.answer}</p>
            <div className="d">{v.detail}</div>
          </div>
        ))}
      </div>
      <div className="rm3" aria-label="The same rule in three views">
        {views.map((v) => (
          <div key={v.key}>
            <h3>{v.label}</h3>
            <p className="q">{v.question}</p>
            <div className="d">{fact}</div>
            <p className="s">{v.answer}</p>
            <div className="d">{v.detail}</div>
          </div>
        ))}
      </div>
      <div className="st-foot">
        <p className="st-cap">{caption}</p>
        {mode === 'auto' && started && (
          <button type="button" className="ctl wbtn" onClick={() => (playing ? stop() : play())}>
            {playing ? 'Pause' : 'Replay'}
          </button>
        )}
      </div>
    </div>
  );
}
