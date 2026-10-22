'use client';

import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Footprints, RotateCcw, X } from 'lucide-react';
import CcAnchor from '@/components/cc/Anchor';
import CcButton from '@/components/cc/Button';
import CcLinkButton from '@/components/cc/LinkButton';
import CcSkeleton from '@/components/cc/Skeleton';
import { useCcModal, useCcPortalTarget } from '@/components/cc/modal';
import TourCanvas, { type TourBox } from '@/components/process-map/TourCanvas';
import { AsReadFromCode, WordedChip } from './WordedText';
import { ENGINE_ONLY, type WordedSentence } from '@/lib/plain-wording';
import type { ProcessMapModel } from '@/lib/process-map';
import type { ProcessTour as Tour, TourOverview, TourStation } from '@/lib/process-tour';
import type { WalkLine, WalkRange } from '@/lib/process-walk-guide';
import { withoutCodes } from '@/lib/program-summary-text';
import { walkChecks, walkLinesLabel, walkMapLabel, walkStepOf, walkStops, walkStoryStep, wt } from '@/lib/workspace-messages';

/**
 * The guided tour on the process map — owner decision 21.10.2026. It replaced
 * the walk-through, which "showed something at the top and at the bottom of
 * the process without you getting it onto one screen", and asked for an
 * answer before the reader understood the step.
 *
 * **One screen.** The tour is a layer over the page: at every station the map
 * moves to the station's element, marks it and lets the rest step back
 * (`TourCanvas`). Nothing on the page has to be scrolled to. A small card says
 * in two or three plain sentences what happens here, why it matters and where
 * the process goes next. No question, no answer, no code and no rule id:
 * "More about it" holds the full list of cases, what the step checks and
 * where it can end, the lines, what decides it and the engine's own sentences
 * behind a model's wording.
 *
 * **First an overview** (owner, 22.10.2026): the whole map, and a card "What
 * this process is about" — engine sentences only. It is not a step: the
 * stations stay "Step 1 of N".
 *
 * **Three layouts** (owner decisions 22.10.2026, option A), chosen by CSS
 * from the first paint (`process-map.css`) and by the same media queries here
 * for the camera:
 *
 *   - **wide** ({@link TOUR_WIDE}): the map fills the layer and the card stands
 *     beside the element;
 *   - **stacked** (a phone upright): the map on top, the card under it at most
 *     46 % of the screen high, and Back / Next pinned in a bar under the card,
 *     outside what scrolls — Next is always on the screen;
 *   - **landscape** ({@link TOUR_LANDSCAPE}, a phone on its side): the card in a
 *     column beside the map, the buttons under the card.
 *
 * On a phone "More about it" opens as a panel over the whole tour with "Back
 * to the map"; on a wide screen it opens in the card. A swipe across the card
 * (never the map, which pans) moves a step, as the arrow keys do.
 *
 * **Chapters.** The phases stand in a slim bar on top, with "Step 4 of 9"; a
 * phase can be jumped to. **Per click only** — Back and Next, the arrow keys,
 * a swipe; nothing moves by itself, and nothing opens by itself. At the end
 * "That was the process" and a quiet link to the business questions in Design.
 *
 * Modal the product's one way (`useCcModal`): the page behind is inert, the
 * focus moves to the card's title at every station and goes back to the
 * button that opened the tour. Presentational: the tour is read by the caller
 * (`lib/process-tour.ts`), the wording comes through `say`. Nothing here writes.
 */
export interface ProcessTourProps {
  /** The tour, read from the code; null while it is being read. */
  tour: Tour | null;
  /** The tour could not be read: said in place of "Reading …", which would never end. */
  unavailable?: boolean;
  model: ProcessMapModel;
  onClose: () => void;
  /** Each engine sentence as it is shown: reworded or as written. Without it, as written. */
  say?: (text: string, anchor: WalkRange | null) => WordedSentence;
  /** Where the business questions are answered (Design); none in a place without one. */
  designHref?: string | null;
  /** The public demo: the same tour, said as the demo's. */
  demo?: boolean;
  /** The station the tour opens at (a rendered test); the overview (-1) otherwise. */
  initialStation?: number;
}

/** The layer, portalled to the page. */
export default function ProcessTour(props: ProcessTourProps) {
  const target = useCcPortalTarget();
  if (!target) return null;
  return createPortal(<ProcessTourLayer {...props} />, target);
}

/** Wide and tall enough for the card beside the element. The same query stands in `process-map.css`. */
export const TOUR_WIDE = '(min-width: 768px) and (min-height: 560px)';
/** A phone on its side: the card in a column beside the map. The same query stands in `process-map.css`. */
export const TOUR_LANDSCAPE = '(max-width: 1023px) and (max-height: 559px) and (orientation: landscape)';
export type TourMode = 'wide' | 'landscape' | 'stacked';

/** The layout for what the screen matches. Pure: exported for the spec. */
export function tourModeOf(matches: (query: string) => boolean): TourMode {
  if (matches(TOUR_WIDE)) return 'wide';
  if (matches(TOUR_LANDSCAPE)) return 'landscape';
  return 'stacked';
}

/** The index the overview stands at, before the first station. */
const OVERVIEW = -1;
const GAP = 28;
const EDGE = 16;
/** The least sideways travel of a swipe, in pixels. */
const SWIPE_MIN = 48;

function readMode(): TourMode {
  try {
    return tourModeOf((query) => window.matchMedia(query).matches);
  } catch {
    return 'stacked';
  }
}

/**
 * The layout, read from the media queries at once — never a wide first paint
 * on a phone (the camera of a wide card would put the element off to the side
 * of a phone's map until the next frame).
 */
function useMode(): TourMode {
  const [mode, setMode] = useState<TourMode>(() => (typeof window === 'undefined' ? 'stacked' : readMode()));
  useEffect(() => {
    let queries: MediaQueryList[];
    try {
      queries = [TOUR_WIDE, TOUR_LANDSCAPE].map((query) => window.matchMedia(query));
    } catch {
      return undefined;
    }
    const update = () => setMode(readMode());
    update();
    for (const query of queries) query.addEventListener('change', update);
    return () => {
      for (const query of queries) query.removeEventListener('change', update);
    };
  }, []);
  return mode;
}

/** A swipe across the card: 1 for the next step (to the left), -1 for the one before, 0 for none. Pure: exported for the spec. */
export function swipeStep(dx: number, dy: number): -1 | 0 | 1 {
  if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < 1.5 * Math.abs(dy)) return 0;
  return dx < 0 ? 1 : -1;
}

/** Where the card stands beside the element: right of it, else left of it, inside the map. Pure: exported for the spec. */
export function cardPlace(box: TourBox, card: { width: number; height: number }, area: { width: number; height: number }): { left: number; top: number } {
  let left = box.x + box.width + GAP;
  if (left + card.width > area.width - EDGE) left = box.x - GAP - card.width;
  left = Math.max(EDGE, Math.min(left, area.width - card.width - EDGE));
  const top = Math.max(EDGE, Math.min(box.y + box.height / 2 - card.height / 2, area.height - card.height - EDGE));
  return { left, top };
}

/** The dialog itself — exported so a server-free render can read it without a portal. */
export function ProcessTourLayer({ tour, unavailable = false, model, onClose, say = ENGINE_ONLY, designHref = null, demo = false, initialStation = OVERVIEW }: ProcessTourProps) {
  const stations = tour?.stations ?? [];
  const end = stations.length;
  const [at, setAt] = useState(() => Math.max(OVERVIEW, Math.min(initialStation, end)));
  const station: TourStation | null = tour && at >= 0 && at < end ? stations[at] : null;
  const overview = !!tour && at === OVERVIEW;
  const titleId = useId();
  const moreId = useId();
  const mode = useMode();
  const wide = mode === 'wide';

  /* "More about it" belongs to one station: moving on closes it. */
  const [moreAt, setMoreAt] = useState<number | null>(null);
  const more = station !== null && moreAt === at;
  const morePanel = more && !wide;
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const backToMapRef = useRef<HTMLButtonElement>(null);
  const closeMore = useCallback(() => {
    setMoreAt(null);
    // The focus goes back to the button that opened it.
    requestAnimationFrame(() => moreButtonRef.current?.focus({ preventScroll: true }));
  }, []);

  /* Escape closes the panel over the map first, then the tour (the modal ignores a handled key). */
  const layerRef = useCcModal<HTMLDivElement>({ open: true, onClose });

  const go = useCallback((index: number) => setAt(Math.max(OVERVIEW, Math.min(index, end))), [end]);

  /* The focus moves to the card's title at every station, so a screen reader reads where the tour is. */
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    // The layer took the focus on open (useCcModal); the title takes it from there.
    headingRef.current?.focus({ preventScroll: true });
  }, [at, tour]);
  useEffect(() => {
    if (morePanel) backToMapRef.current?.focus({ preventScroll: true });
  }, [morePanel]);

  /* The page behind does not scroll under the layer. */
  useEffect(() => {
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => {
      root.style.overflow = before;
    };
  }, []);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const tag = (event.target as HTMLElement).tagName;
    if (event.key === 'Escape' && morePanel) {
      event.preventDefault();
      closeMore();
      return;
    }
    if (tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (morePanel) return;
    if (event.key === 'ArrowRight' && tour && at < end) {
      event.preventDefault();
      go(at + 1);
    } else if (event.key === 'ArrowLeft' && tour && at > OVERVIEW) {
      event.preventDefault();
      go(at - 1);
    }
  };

  /* A swipe across the card moves a step — a touch or a pen, never a mouse selecting text, never on the map. */
  const swipe = useRef<{ x: number; y: number; id: number } | null>(null);
  const onPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    swipe.current = event.pointerType === 'mouse' ? null : { x: event.clientX, y: event.clientY, id: event.pointerId };
  };
  const onPointerUp = (event: React.PointerEvent<HTMLElement>) => {
    const start = swipe.current;
    swipe.current = null;
    if (!start || start.id !== event.pointerId || !tour) return;
    const step = swipeStep(event.clientX - start.x, event.clientY - start.y);
    if (step === 1 && at < end) go(at + 1);
    else if (step === -1 && at > OVERVIEW) go(at - 1);
  };

  /* The card beside the element, on a wide screen. */
  const areaRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<TourBox | null>(null);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);
  const measure = useCallback(() => {
    const area = areaRef.current;
    const card = cardRef.current;
    if (!area || !card || !box || !wide) {
      setPlace(null);
      return;
    }
    setPlace(cardPlace(box, { width: card.offsetWidth, height: card.offsetHeight }, { width: area.clientWidth, height: area.clientHeight }));
  }, [box, wide]);
  useLayoutEffect(measure, [measure, at]);
  useEffect(() => {
    const card = cardRef.current;
    if (!card || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => measure());
    observer.observe(card);
    return () => observer.disconnect();
  }, [measure]);

  const chapter = station && tour ? tour.chapters[station.chapter] : null;
  const shown = (line: WalkLine) => say(line.text, line.anchor);
  const position = overview ? wt('walk.overview') : station ? walkStepOf(at + 1, end) : null;
  const moreContent = station ? <MoreAbout station={station} shown={shown} /> : null;

  return (
    <div className="cc cc-tour-layer">
      <div
        ref={layerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        data-process-tour=""
        data-tour-mode={mode}
        data-tour-at={!tour ? 'reading' : overview ? 'overview' : station ? at + 1 : 'end'}
        className="flex h-full w-full flex-col bg-cc-surface"
      >
        {/* The slim bar, one row on a phone: where the tour is, the part of the process, the way out. */}
        <header className="cc-tour-head border-b border-cc-line">
          <div className="flex min-w-0 items-center gap-2 md:gap-4">
            <p className="cc-tour-wide-only m-0 min-w-0 items-center gap-2 text-[12px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase">
              <Footprints size={14} aria-hidden={true} />
              <span className="min-w-0 truncate">{wt('walk.eyebrow')}</span>
              {demo ? <span className="font-medium tracking-normal normal-case">{wt('walk.demoNote')}</span> : null}
            </p>
            {position ? (
              // On a phone the part select says "Overview" itself; the counter would say it twice.
              <span
                data-tour-position=""
                className={`shrink-0 text-[13px] font-semibold text-cc-ink ${overview && tour && tour.chapters.length > 1 ? 'cc-tour-wide-only' : ''}`}
              >
                {position}
              </span>
            ) : null}
            {tour && tour.chapters.length > 1 ? (
              <label className="cc-tour-narrow-only min-w-0 flex-1 items-center gap-2 text-[12px] font-semibold text-cc-ink-muted">
                <span className="sr-only">{wt('walk.chapterSelect')}</span>
                <select
                  value={overview ? 'overview' : station ? String(station.chapter) : 'end'}
                  onChange={(event) => {
                    if (event.target.value === 'overview') {
                      go(OVERVIEW);
                      return;
                    }
                    const c = tour.chapters[Number(event.target.value)];
                    if (c) go(c.first);
                  }}
                  data-tour-chapter-select=""
                  className="min-w-0 flex-1 rounded-cc-row border border-cc-line bg-cc-surface px-2 py-1 text-[13px] font-semibold text-cc-ink"
                >
                  <option value="overview">{wt('walk.overview')}</option>
                  {tour.chapters.map((c, i) => (
                    <option key={c.id} value={String(i)}>
                      {c.label}
                    </option>
                  ))}
                  {overview || station ? null : <option value="end">{wt('walk.endTitle')}</option>}
                </select>
              </label>
            ) : (
              <span className="flex-1" />
            )}
            <span className="ml-auto shrink-0">
              <CcButton variant="ghost" icon={<X size={16} aria-hidden={true} />} onClick={onClose} aria-label={wt('walk.close')} data-tour-close="">
                <span className="cc-tour-wide-only">{wt('walk.close')}</span>
              </CcButton>
            </span>
          </div>
          {tour && tour.chapters.length > 1 ? (
            <nav aria-label={wt('walk.chaptersLabel')} className="cc-tour-wide-only mt-2">
              <ol className="m-0 flex list-none flex-wrap gap-1 p-0">
                {tour.chapters.map((c, i) => {
                  const here = station?.chapter === i;
                  return (
                    <li key={c.id} className="min-w-0 max-w-full">
                      <CcButton variant={here ? 'dark' : 'ghost'} onClick={() => go(c.first)} aria-current={here ? 'step' : undefined} data-tour-chapter={i + 1}>
                        {/* A long name wraps inside its chip rather than widening the bar. */}
                        <span className="min-w-0 text-left break-words whitespace-normal">{c.label}</span>
                      </CcButton>
                    </li>
                  );
                })}
              </ol>
            </nav>
          ) : null}
        </header>

        {/* The map, and the card with its buttons: beside the element, under the map, or beside the map. */}
        <div ref={areaRef} className="cc-tour-body">
          <TourCanvas
            xml={model.xml}
            plane={station?.plane ?? null}
            focus={station?.id ?? null}
            align={wide ? 'side' : 'center'}
            label={walkMapLabel(station?.title ?? null)}
            onPlaced={setBox}
            className="cc-tour-map"
          />
          <div
            ref={cardRef}
            data-tour-sheet=""
            style={wide ? (place ? { left: place.left, top: place.top } : { right: EDGE, top: EDGE }) : undefined}
            className="cc-tour-side bg-cc-surface"
          >
            <article
              data-tour-card={overview ? 'overview' : station ? station.id : tour ? 'end' : 'reading'}
              aria-labelledby={titleId}
              onPointerDown={onPointerDown}
              onPointerUp={onPointerUp}
              onPointerCancel={() => {
                swipe.current = null;
              }}
              className="cc-tour-card"
            >
              {!tour ? (
                <>
                  <h2 id={titleId} ref={headingRef} tabIndex={-1} className="m-0 text-[22px] leading-tight font-bold text-cc-ink">
                    {wt('walk.title')}
                  </h2>
                  {unavailable ? (
                    <p role="alert" data-tour-unavailable="" className="m-0 text-[13px] font-medium text-cc-ink-muted">
                      {wt('walk.unavailable')}
                    </p>
                  ) : (
                    <>
                      <p className="m-0 text-[13px] font-medium text-cc-ink-muted">{wt('walk.preparing')}</p>
                      <CcSkeleton shape="text" count={3} label={wt('walk.title')} />
                    </>
                  )}
                </>
              ) : overview ? (
                <OverviewCard overview={tour.overview} titleId={titleId} headingRef={headingRef} shown={shown} />
              ) : station ? (
                <>
                  <StationCard
                    station={station}
                    chapterLabel={chapter && chapter.label !== station.title ? chapter.label : null}
                    titleId={titleId}
                    headingRef={headingRef}
                    shown={shown}
                  />
                  <div data-tour-more="" className="cc-no-print">
                    <button
                      ref={moreButtonRef}
                      type="button"
                      aria-expanded={more}
                      aria-controls={moreId}
                      onClick={() => (more ? closeMore() : setMoreAt(at))}
                      data-tour-more-open=""
                      className="inline-flex min-h-8 items-center gap-1 rounded-cc-row text-left text-[13px] font-semibold text-cc-ink pointer-coarse:min-h-11"
                    >
                      {wt('walk.more')}
                      <ChevronRight size={16} aria-hidden={true} className={wide && more ? 'rotate-90 text-cc-ink-muted' : 'text-cc-ink-muted'} />
                    </button>
                  </div>
                  {wide ? (
                    <div id={moreId} data-tour-more-body="" hidden={!more}>
                      {moreContent}
                    </div>
                  ) : null}
                </>
              ) : (
                <EndCard tour={tour} titleId={titleId} headingRef={headingRef} designHref={designHref} />
              )}
              <p className="sr-only m-0 text-[12px]">{wt('walk.keys')}</p>
            </article>
            {tour ? (
              <div data-tour-nav="" className="cc-tour-nav cc-no-print border-t border-cc-line">
                {overview || station ? (
                  <>
                    <CcButton icon={<ChevronLeft size={16} aria-hidden={true} />} onClick={at > OVERVIEW ? () => go(at - 1) : undefined} disabled={at === OVERVIEW} data-tour-back="">
                      {wt('walk.back')}
                    </CcButton>
                    <CcButton variant="secondary" onClick={() => go(at + 1)} data-tour-next="">
                      {at + 1 < end ? wt('walk.next') : wt('walk.toEnd')}
                      <ChevronRight size={16} aria-hidden={true} />
                    </CcButton>
                  </>
                ) : (
                  <>
                    <CcButton icon={<ChevronLeft size={16} aria-hidden={true} />} onClick={() => go(end - 1)} data-tour-back="">
                      {wt('walk.back')}
                    </CcButton>
                    <CcButton icon={<RotateCcw size={16} aria-hidden={true} />} onClick={() => go(OVERVIEW)} data-tour-again="">
                      {wt('walk.again')}
                    </CcButton>
                  </>
                )}
              </div>
            ) : null}
          </div>
          {/* On a phone "More about it" is a panel over the whole tour, with its own way back. */}
          {station && !wide ? (
            <section id={moreId} data-tour-more-panel="" aria-labelledby={`${moreId}-title`} hidden={!more} className="cc-tour-more-panel bg-cc-surface">
              <div className="flex items-center gap-2 border-b border-cc-line px-4 py-2">
                <CcButton ref={backToMapRef} variant="ghost" icon={<ArrowLeft size={16} aria-hidden={true} />} onClick={closeMore} data-tour-back-to-map="">
                  {wt('walk.backToMap')}
                </CcButton>
              </div>
              <div className="cc-tour-more-scroll">
                <h3 id={`${moreId}-title`} className="m-0 text-[15px] leading-snug font-bold break-words text-cc-ink">
                  {station.title}
                </h3>
                <p className="m-0 text-[12px] font-semibold text-cc-ink-muted">{wt('walk.more')}</p>
                {moreContent}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function OverviewCard({
  overview,
  titleId,
  headingRef,
  shown,
}: {
  overview: TourOverview;
  titleId: string;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  shown: (line: WalkLine) => WordedSentence;
}) {
  const said = [...overview.purpose, ...(overview.trigger ? [overview.trigger] : []), ...(overview.result ? [overview.result] : [])];
  return (
    <div data-tour-overview="" className="flex flex-col gap-3">
      <h2 id={titleId} ref={headingRef} tabIndex={-1} className="m-0 text-[22px] leading-tight font-bold break-words text-cc-ink">
        {wt('walk.overviewTitle')}
      </h2>
      <div data-tour-narration="" className="flex flex-col gap-2">
        {overview.purpose.map((line, i) => (
          <Said key={i} said={shown(line)} />
        ))}
        {overview.trigger ? <Said said={shown(overview.trigger)} /> : null}
        {overview.route ? (
          <p data-tour-route="" className="m-0 text-[14px] leading-relaxed font-medium text-cc-ink">
            {overview.route}
          </p>
        ) : null}
        {overview.involved ? (
          <p data-tour-involved="" className="m-0 text-[14px] leading-relaxed font-medium text-cc-ink">
            {overview.involved}
          </p>
        ) : null}
        {overview.result ? <Said said={shown(overview.result)} /> : null}
        {said.length === 0 ? <p className="m-0 text-[13px] leading-snug font-medium text-cc-ink-muted">{wt('walk.overviewEmpty')}</p> : null}
        <p data-tour-count="" className="m-0 text-[14px] leading-relaxed font-semibold text-cc-ink">
          {overview.count}
        </p>
      </div>
    </div>
  );
}

function StationCard({
  station,
  chapterLabel,
  titleId,
  headingRef,
  shown,
}: {
  station: TourStation;
  chapterLabel: string | null;
  titleId: string;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  shown: (line: WalkLine) => WordedSentence;
}) {
  return (
    <>
      <div className="flex flex-col gap-1">
        {chapterLabel ? (
          <p data-tour-chapter-name="" className="m-0 text-[12px] font-semibold text-cc-ink-muted">
            {chapterLabel}
          </p>
        ) : null}
        <h2 id={titleId} ref={headingRef} tabIndex={-1} className="m-0 text-[22px] leading-tight font-bold break-words text-cc-ink">
          {station.title}
        </h2>
      </div>
      <div data-tour-narration="" className="flex flex-col gap-2">
        <Said said={shown(station.happens)} />
        <Said said={shown(station.matters)} />
        {station.next ? (
          <p data-tour-next-sentence="" className="m-0 text-[14px] leading-relaxed font-semibold text-cc-ink">
            {station.next}
          </p>
        ) : null}
      </div>
    </>
  );
}

/**
 * One level down: first what a business reader asks next — the full list of
 * cases, what the step checks and where it can end, the next part, what the
 * tour leaves out here — then the lines, what decides it, the data it touches
 * and the engine's own sentences.
 */
function MoreAbout({ station, shown }: { station: TourStation; shown: (line: WalkLine) => WordedSentence }) {
  const more = [...station.decides, ...(station.data ? [station.data] : [])];
  const said = [shown(station.happens), shown(station.matters), ...(station.cases ? [shown(station.cases)] : []), ...more.map(shown)];
  return (
    <div className="flex flex-col gap-3 pt-2">
      {station.cases || station.story.length > 0 ? (
        <div data-tour-more-business="" className="flex flex-col gap-2 rounded-cc-row border border-cc-line bg-cc-surface-muted p-3">
          {station.cases ? (
            <div data-tour-cases="" className="flex flex-col gap-1">
              <p className="m-0 text-[12px] font-semibold text-cc-ink-muted">{wt('walk.cases')}</p>
              <Said said={shown(station.cases)} />
            </div>
          ) : null}
          {station.story.map((note, i) => (
            <div key={i} data-tour-story="" className="flex flex-col gap-1">
              {note.step ? <p className="m-0 text-[12px] font-semibold text-cc-ink-muted">{walkStoryStep(note.step)}</p> : null}
              {note.checks.length > 0 ? (
                <p data-tour-story-checks="" className="m-0 text-[13px] leading-snug font-medium text-cc-ink">
                  {walkChecks(note.checks)}
                </p>
              ) : null}
              {note.stops.length > 0 ? (
                <p data-tour-story-stops="" className="m-0 text-[13px] leading-snug font-medium text-cc-ink">
                  {walkStops(note.stops)}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {station.nextPart ? (
        <p data-tour-next-part="" className="m-0 text-[13px] leading-snug font-semibold text-cc-ink">
          {station.nextPart}
        </p>
      ) : null}
      {station.aside ? (
        <p data-tour-aside="" className="m-0 text-[13px] leading-snug font-medium text-cc-ink-muted">
          {station.aside}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-semibold text-cc-ink-muted">{wt('walk.lines')}</span>
        {station.anchor ? <Lines range={station.anchor} /> : <span className="text-[12px] font-medium text-cc-ink-muted">{wt('walk.noLines')}</span>}
      </div>
      {station.decides.length > 0 ? <MoreList title={wt('walk.decides')} lines={station.decides} shown={shown} /> : null}
      {station.data ? <MoreList title={wt('walk.data')} lines={[station.data]} shown={shown} /> : null}
      {station.engine ? (
        <p className="m-0 text-[12px] leading-snug font-medium text-cc-ink-muted">
          <span className="font-semibold text-cc-ink">{wt('walk.engineReading')}: </span>
          {station.engine}
        </p>
      ) : null}
      <AsReadFromCode said={said} />
    </div>
  );
}

/** A sentence as the card says it: the plain wording, without table codes on top (they stay one level down). */
function Said({ said }: { said: WordedSentence }) {
  return (
    <p data-tour-worded={said.worded ? 'yes' : 'no'} className="m-0 text-[14px] leading-relaxed font-medium text-cc-ink">
      {withoutCodes(said.text)}
      <WordedChip said={said} />
    </p>
  );
}

function Lines({ range }: { range: WalkRange }) {
  return (
    <CcAnchor label={walkLinesLabel(range.lineStart, range.lineEnd)}>
      {range.lineStart === range.lineEnd ? `L${range.lineStart}` : `L${range.lineStart}-${range.lineEnd}`}
    </CcAnchor>
  );
}

function MoreList({ title, lines, shown }: { title: string; lines: readonly WalkLine[]; shown: (line: WalkLine) => WordedSentence }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="m-0 text-[12px] font-semibold text-cc-ink-muted">{title}</p>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {lines.map((line, i) => (
          <li key={i} className="text-[13px] leading-snug font-medium text-cc-ink">
            {shown(line).text} {line.anchor ? <Lines range={line.anchor} /> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function EndCard({
  tour,
  titleId,
  headingRef,
  designHref,
}: {
  tour: Tour;
  titleId: string;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  designHref: string | null;
}) {
  return (
    <div data-tour-end="" className="flex flex-col gap-3">
      <h2 id={titleId} ref={headingRef} tabIndex={-1} className="m-0 text-[22px] leading-tight font-bold text-cc-ink">
        {tour.stations.length > 0 ? wt('walk.endTitle') : wt('walk.title')}
      </h2>
      {tour.stations.length === 0 ? <p className="m-0 text-[14px] leading-relaxed font-medium text-cc-ink">{wt('walk.empty')}</p> : null}
      {designHref ? (
        <span className="cc-no-print">
          <CcLinkButton href={designHref} variant="ghost" data-tour-to-design="">
            {wt('walk.toDesign')}
            <ArrowRight size={16} aria-hidden={true} />
          </CcLinkButton>
        </span>
      ) : null}
    </div>
  );
}
