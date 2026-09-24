'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { ChevronDown } from 'lucide-react';
import { motion, useInView, useReducedMotion } from 'motion/react';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { STAGE_WORKER_LABEL, type LandingStage } from '@/lib/landing-stages';

export interface TimelineStage extends LandingStage {
  src: string;
  width: number;
  height: number;
  alt: string;
}

/**
 * The seven stages on the landing page, as a timeline with a detail panel —
 * roadmap 3.0.6 (Sonny, 24.09.2026). Replaces seven equal cards.
 *
 * - **Desktop (md+):** numbered nodes on one line, a WAI-ARIA tablist (arrow
 *   keys, Home/End, roving tabindex). The panel below holds a real capture of
 *   the stage from the demo project, two sentences and the provenance chips.
 * - **Phone:** the same seven as a list of disclosures, each with the same
 *   picture, text and chips.
 * - **Motion:** the line draws once, 1 → 7, when the section comes into view;
 *   the panel fades in on a change. With `prefers-reduced-motion` nothing moves.
 *   Nothing advances by itself.
 * - **Without JavaScript:** the server renders the first stage open and every
 *   other panel with `hidden`, so all seven texts are in the HTML.
 *
 * Words and chips come from `lib/landing-stages.ts`, order and names from
 * `PHASES`; this component holds no stage text of its own.
 */
export default function StageTimeline({ stages }: { stages: TimelineStage[] }) {
  const [current, setCurrent] = useState(0);
  const [open, setOpen] = useState<Set<number>>(() => new Set([0]));
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const reduce = useReducedMotion();

  // The line: drawn in the server HTML, so a page without JavaScript shows it.
  // After hydration it is taken back to zero once and drawn when it is seen.
  const track = useRef<HTMLDivElement>(null);
  const seen = useInView(track, { once: true, amount: 0.6 });
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (reduce === false) setArmed(true);
  }, [reduce]);
  const drawn = !armed || seen;

  // Only fade after the reader has chosen a stage: the first paint does not animate.
  const [chosen, setChosen] = useState(false);

  const choose = (i: number, focus = false) => {
    setChosen(true);
    setCurrent(i);
    if (focus) tabs.current[i]?.focus();
  };

  const onKey = (e: React.KeyboardEvent, i: number) => {
    const last = stages.length - 1;
    if (e.key === 'ArrowRight') choose(i === last ? 0 : i + 1, true);
    else if (e.key === 'ArrowLeft') choose(i === 0 ? last : i - 1, true);
    else if (e.key === 'Home') choose(0, true);
    else if (e.key === 'End') choose(last, true);
    else return;
    e.preventDefault();
  };

  const toggle = (i: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <div className="mx-auto mt-12 w-full max-w-6xl px-4 sm:px-6" data-stage-timeline="">
      {/* Desktop: the timeline and its panel. */}
      <div className="hidden md:block">
        <div className="relative" ref={track}>
          <div
            aria-hidden="true"
            className="absolute top-5 h-0.5 bg-cc-line"
            style={{ left: `${50 / stages.length}%`, right: `${50 / stages.length}%` }}
          />
          <motion.div
            aria-hidden="true"
            data-timeline-line=""
            data-drawn={drawn ? 'true' : 'false'}
            className="absolute top-5 h-0.5 origin-left bg-cc-brand-strong"
            style={{ left: `${50 / stages.length}%`, right: `${50 / stages.length}%` }}
            initial={false}
            animate={{ scaleX: drawn ? 1 : 0 }}
            // Taking it back to zero is instant; only the drawing is seen.
            transition={drawn && armed && !reduce ? { duration: 1.2, ease: 'easeInOut' } : { duration: 0 }}
          />
          <div
            role="tablist"
            aria-label="The seven stages"
            className="relative grid"
            style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))` }}
          >
            {stages.map((s, i) => {
              const selected = i === current;
              return (
                <button
                  key={s.key}
                  ref={(el) => {
                    tabs.current[i] = el;
                  }}
                  type="button"
                  role="tab"
                  id={`stage-tab-${s.key}`}
                  aria-selected={selected}
                  aria-controls={`stage-panel-${s.key}`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => choose(i)}
                  onKeyDown={(e) => onKey(e, i)}
                  data-landing-stage-tab={s.key}
                  className="group flex flex-col items-center gap-2 rounded-xl px-1 pb-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cc-focus"
                >
                  <span
                    aria-hidden="true"
                    className={`flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-bold transition-colors ${
                      selected
                        ? 'border-cc-ink bg-cc-ink text-white'
                        : 'border-cc-field-border bg-cc-surface text-cc-ink-muted group-hover:border-cc-ink group-hover:text-cc-ink'
                    }`}
                  >
                    {s.n}
                  </span>
                  <span
                    data-landing-phase-title=""
                    className={`text-sm ${selected ? 'font-bold text-cc-ink' : 'font-semibold text-cc-ink-muted group-hover:text-cc-ink'}`}
                  >
                    {s.title}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {stages.map((s, i) => (
          <div
            key={s.key}
            id={`stage-panel-${s.key}`}
            role="tabpanel"
            aria-labelledby={`stage-tab-${s.key}`}
            hidden={i !== current}
            data-landing-phase={s.key}
            className="mt-6"
          >
            {i === current && (
              <motion.div
                key={s.key}
                initial={chosen && !reduce ? { opacity: 0 } : false}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
              >
                <StageDetail stage={s} />
              </motion.div>
            )}
            {/* The inactive panels keep their words in the HTML — crawlers and no-JS readers. */}
            {i !== current && <StageDetail stage={s} />}
          </div>
        ))}
      </div>

      {/* Phone: the same seven, as disclosures. */}
      <ol className="m-0 list-none space-y-3 p-0 md:hidden" data-landing-stage-list="">
        {stages.map((s, i) => {
          const expanded = open.has(i);
          return (
            <li key={s.key} data-landing-stage-item={s.key} className="rounded-2xl border border-cc-line bg-cc-surface">
              <h3 className="m-0">
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={`stage-region-${s.key}`}
                  onClick={() => toggle(i)}
                  className="flex min-h-12 w-full items-center gap-3 rounded-2xl px-4 py-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cc-focus"
                >
                  <span
                    aria-hidden="true"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-cc-ink text-xs font-bold text-cc-ink"
                  >
                    {s.n}
                  </span>
                  <span className="flex-1 text-base font-bold text-cc-ink">{s.title}</span>
                  <ChevronDown
                    size={18}
                    aria-hidden="true"
                    className={`shrink-0 text-cc-ink-muted ${reduce ? '' : 'transition-transform'} ${expanded ? 'rotate-180' : ''}`}
                  />
                </button>
              </h3>
              <div id={`stage-region-${s.key}`} hidden={!expanded} className="px-4 pb-4">
                <StageDetail stage={s} compact />
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function StageDetail({ stage, compact = false }: { stage: TimelineStage; compact?: boolean }) {
  return (
    <div className={compact ? 'space-y-3' : 'grid items-start gap-6 rounded-3xl border border-cc-line bg-cc-surface p-5 lg:grid-cols-5 lg:p-6'}>
      <figure className={compact ? undefined : 'lg:col-span-3'}>
        <div className="overflow-hidden rounded-xl border border-cc-line bg-cc-page">
          <Image
            src={stage.src}
            alt={stage.alt}
            width={stage.width}
            height={stage.height}
            sizes="(min-width: 1024px) 680px, 100vw"
            className="h-auto w-full"
          />
        </div>
        <figcaption className="mt-2 text-xs font-medium text-cc-ink-muted">
          Demo project · fictitious code · captured from the workspace
        </figcaption>
      </figure>
      <div className={compact ? 'space-y-3' : 'space-y-4 lg:col-span-2'}>
        {!compact && (
          <h3 className="text-xl font-bold text-cc-ink">
            <span className="text-cc-ink-muted">{stage.n} · </span>
            {stage.title}
          </h3>
        )}
        <p className="text-sm leading-relaxed text-cc-ink sm:text-base">{stage.lines[0]}</p>
        <p className="text-sm leading-relaxed text-cc-ink-muted sm:text-base">{stage.lines[1]}</p>
        <div className="flex flex-wrap items-center gap-2" data-stage-provenance={stage.provenance.join(' ')}>
          {stage.provenance.map((v) => (
            <CcProvenanceChip key={v} value={v} />
          ))}
        </div>
        <p className="text-xs font-semibold text-cc-ink-muted" data-stage-worker={stage.worker}>
          {STAGE_WORKER_LABEL[stage.worker]}
        </p>
      </div>
    </div>
  );
}
