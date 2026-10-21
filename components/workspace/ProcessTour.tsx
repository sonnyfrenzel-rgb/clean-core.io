'use client';

import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, ChevronLeft, ChevronRight, Footprints, RotateCcw, X } from 'lucide-react';
import CcAnchor from '@/components/cc/Anchor';
import CcButton from '@/components/cc/Button';
import CcDisclosure from '@/components/cc/Disclosure';
import CcLinkButton from '@/components/cc/LinkButton';
import CcSkeleton from '@/components/cc/Skeleton';
import { useCcModal, useCcPortalTarget } from '@/components/cc/modal';
import TourCanvas, { type TourBox } from '@/components/process-map/TourCanvas';
import { AsReadFromCode, WordedChip } from './WordedText';
import { ENGINE_ONLY, type WordedSentence } from '@/lib/plain-wording';
import type { ProcessMapModel } from '@/lib/process-map';
import type { ProcessTour as Tour, TourStation } from '@/lib/process-tour';
import type { WalkLine, WalkRange } from '@/lib/process-walk-guide';
import { withoutCodes } from '@/lib/program-summary-text';
import { walkLinesLabel, walkMapLabel, walkStepOf, wt } from '@/lib/workspace-messages';

/**
 * The guided tour on the process map — owner decision 21.10.2026. It replaced
 * the walk-through, which "showed something at the top and at the bottom of
 * the process without you getting it onto one screen", and asked for an
 * answer before the reader understood the step.
 *
 * **One screen.** The tour is a layer over the page: the map fills it, and at
 * every station the map moves to the station's element, marks it and lets the
 * rest step back (`TourCanvas`). Nothing on the page has to be scrolled to.
 * Beside the element stands a small card — on a phone under the map — that
 * says in two or three plain sentences what happens here, why it matters and
 * where the process goes next. No question, no answer, no code and no rule
 * id: "More about it" folds the lines, what decides the step and the engine's
 * own sentences behind a model's wording.
 *
 * **Chapters.** The phases stand in a slim bar on top, with "Step 4 of 9";
 * a phase can be jumped to. **Per click only** — Back and Next, or the arrow
 * keys; nothing moves by itself, and nothing opens by itself. At the end, one
 * sentence about the whole program and a quiet link to the business questions
 * in Design.
 *
 * Modal the product's one way (`useCcModal`): the page behind is inert, the
 * focus moves to the card's title at every station and goes back to the
 * button that opened the tour. Presentational: the tour is read by the caller
 * (`lib/process-tour.ts`), the wording comes through `say`. Nothing here writes.
 */
export interface ProcessTourProps {
  /** The tour, read from the code; null while it is being read. */
  tour: Tour | null;
  model: ProcessMapModel;
  onClose: () => void;
  /** Each engine sentence as it is shown: reworded or as written. Without it, as written. */
  say?: (text: string, anchor: WalkRange | null) => WordedSentence;
  /** Where the business questions are answered (Design); none in a place without one. */
  designHref?: string | null;
  /** The public demo: the same tour, said as the demo's. */
  demo?: boolean;
  /** The station the tour opens at (a rendered test); 0 otherwise. */
  initialStation?: number;
}

/** The layer, portalled to the page. */
export default function ProcessTour(props: ProcessTourProps) {
  const target = useCcPortalTarget();
  if (!target) return null;
  return createPortal(<ProcessTourLayer {...props} />, target);
}

/** Wide enough for the card beside the element: the `md` step. */
const WIDE = '(min-width: 768px)';
const GAP = 28;
const EDGE = 16;

function useWide(): boolean {
  const [wide, setWide] = useState(true);
  useEffect(() => {
    let query: MediaQueryList;
    try {
      query = window.matchMedia(WIDE);
    } catch {
      return undefined;
    }
    const update = () => setWide(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return wide;
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
export function ProcessTourLayer({ tour, model, onClose, say = ENGINE_ONLY, designHref = null, demo = false, initialStation = 0 }: ProcessTourProps) {
  const stations = tour?.stations ?? [];
  const end = stations.length;
  const [at, setAt] = useState(() => Math.max(0, Math.min(initialStation, end)));
  const station: TourStation | null = tour && at < end ? stations[at] : null;
  const titleId = useId();
  const layerRef = useCcModal<HTMLDivElement>({ open: true, onClose });
  const wide = useWide();

  const go = useCallback((index: number) => setAt(Math.max(0, Math.min(index, end))), [end]);

  /* The focus moves to the card's title at every station, so a screen reader reads where the tour is. */
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    // The layer took the focus on open (useCcModal); the title takes it from there.
    headingRef.current?.focus({ preventScroll: true });
  }, [at, tour]);

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
    if (tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (event.key === 'ArrowRight' && at < end) {
      event.preventDefault();
      go(at + 1);
    } else if (event.key === 'ArrowLeft' && at > 0) {
      event.preventDefault();
      go(at - 1);
    }
  };

  /* The card beside the element, on a wide screen. */
  const areaRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLElement>(null);
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
        data-tour-at={station ? at + 1 : tour ? 'end' : 'reading'}
        className="flex h-full w-full flex-col bg-cc-surface"
      >
        {/* The slim bar: what this is, the parts of the process, where the tour is, the way out. */}
        <header className="flex flex-col gap-2 border-b border-cc-line px-4 py-2 md:px-6">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <p className="m-0 flex min-w-0 items-center gap-2 text-[12px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase">
              <Footprints size={14} aria-hidden={true} />
              <span className="min-w-0 truncate">{wt('walk.eyebrow')}</span>
              {demo ? <span className="font-medium tracking-normal normal-case">{wt('walk.demoNote')}</span> : null}
            </p>
            <div className="flex items-center gap-3">
              {station ? (
                <span data-tour-position="" className="text-[13px] font-semibold text-cc-ink">
                  {walkStepOf(at + 1, end)}
                </span>
              ) : null}
              <CcButton variant="ghost" icon={<X size={16} aria-hidden={true} />} onClick={onClose} data-tour-close="">
                {wt('walk.close')}
              </CcButton>
            </div>
          </div>
          {tour && tour.chapters.length > 1 ? (
            <>
              <nav aria-label={wt('walk.chaptersLabel')} className="hidden md:block">
                <ol className="m-0 flex list-none flex-wrap gap-1 p-0">
                  {tour.chapters.map((c, i) => {
                    const here = station?.chapter === i;
                    return (
                      <li key={c.id} className="min-w-0 max-w-full">
                        <CcButton
                          variant={here ? 'dark' : 'ghost'}
                          onClick={() => go(c.first)}
                          aria-current={here ? 'step' : undefined}
                          data-tour-chapter={i + 1}
                        >
                          {/* A long name wraps inside its chip rather than widening the bar. */}
                          <span className="min-w-0 text-left break-words whitespace-normal">{c.label}</span>
                        </CcButton>
                      </li>
                    );
                  })}
                </ol>
              </nav>
              <label className="flex min-w-0 items-center gap-2 text-[12px] font-semibold text-cc-ink-muted md:hidden">
                <span className="shrink-0">{wt('walk.chapterSelect')}</span>
                <select
                  value={station ? String(station.chapter) : ''}
                  onChange={(event) => {
                    const c = tour.chapters[Number(event.target.value)];
                    if (c) go(c.first);
                  }}
                  data-tour-chapter-select=""
                  className="min-w-0 flex-1 rounded-cc-row border border-cc-line bg-cc-surface px-2 py-1 text-[13px] font-semibold text-cc-ink"
                >
                  {station ? null : <option value="">{wt('walk.endTitle')}</option>}
                  {tour.chapters.map((c, i) => (
                    <option key={c.id} value={String(i)}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : null}
        </header>

        {/* The map fills the rest; the card stands beside the element (under the map on a phone). */}
        <div ref={areaRef} className="relative flex min-h-0 flex-1 flex-col md:block">
          <TourCanvas
            xml={model.xml}
            plane={station?.plane ?? null}
            focus={station?.id ?? null}
            align={wide ? 'side' : 'center'}
            label={walkMapLabel(station?.title ?? null)}
            onPlaced={setBox}
            className="h-[44dvh] w-full shrink-0 border-b border-cc-line md:absolute md:inset-0 md:h-full md:border-b-0"
          />
          <article
            ref={cardRef}
            data-tour-card={station ? station.id : 'end'}
            aria-labelledby={titleId}
            style={wide ? (place ? { left: place.left, top: place.top } : { right: EDGE, top: EDGE }) : undefined}
            className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-cc-surface p-4 md:absolute md:max-h-[calc(100%-32px)] md:w-[380px] md:flex-none md:rounded-cc-card md:border md:border-cc-line md:shadow-cc"
          >
            {!tour ? (
              <>
                <h2 id={titleId} ref={headingRef} tabIndex={-1} className="m-0 text-[22px] leading-tight font-bold text-cc-ink">
                  {wt('walk.title')}
                </h2>
                <p className="m-0 text-[13px] font-medium text-cc-ink-muted">{wt('walk.preparing')}</p>
                <CcSkeleton shape="text" count={3} label={wt('walk.title')} />
              </>
            ) : station ? (
              <StationCard
                station={station}
                chapterLabel={chapter && chapter.label !== station.title ? chapter.label : null}
                titleId={titleId}
                headingRef={headingRef}
                shown={shown}
              />
            ) : (
              <EndCard tour={tour} titleId={titleId} headingRef={headingRef} shown={shown} designHref={designHref} />
            )}
            {tour ? (
              <div className="cc-no-print mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-cc-line pt-3">
                {station ? (
                  <>
                    <CcButton icon={<ChevronLeft size={16} aria-hidden={true} />} onClick={at > 0 ? () => go(at - 1) : undefined} disabled={at === 0} data-tour-back="">
                      {wt('walk.back')}
                    </CcButton>
                    <CcButton variant="secondary" onClick={() => go(at + 1)} data-tour-next="">
                      {at + 1 < end ? wt('walk.next') : wt('walk.toEnd')}
                      <ChevronRight size={16} aria-hidden={true} />
                    </CcButton>
                  </>
                ) : (
                  <>
                    {end > 0 ? (
                      <CcButton icon={<ChevronLeft size={16} aria-hidden={true} />} onClick={() => go(end - 1)} data-tour-back="">
                        {wt('walk.back')}
                      </CcButton>
                    ) : null}
                    {end > 0 ? (
                      <CcButton icon={<RotateCcw size={16} aria-hidden={true} />} onClick={() => go(0)} data-tour-again="">
                        {wt('walk.again')}
                      </CcButton>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}
            <p className="sr-only m-0 text-[12px]">{wt('walk.keys')}</p>
          </article>
        </div>
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
  const happens = shown(station.happens);
  const matters = shown(station.matters);
  const more = [...station.decides, ...(station.data ? [station.data] : [])];
  const said = [happens, matters, ...more.map(shown)];
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
        <Said said={happens} />
        <Said said={matters} />
        <p data-tour-next-sentence="" className="m-0 text-[14px] leading-relaxed font-semibold text-cc-ink">
          {station.next}
        </p>
        {station.aside ? (
          <p data-tour-aside="" className="m-0 text-[13px] leading-snug font-medium text-cc-ink-muted">
            {station.aside}
          </p>
        ) : null}
      </div>
      <div data-tour-more="" className="cc-no-print">
        <CcDisclosure title={wt('walk.more')}>
          <div className="flex flex-col gap-3 pt-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] font-semibold text-cc-ink-muted">{wt('walk.lines')}</span>
              {station.anchor ? <Lines range={station.anchor} /> : <span className="text-[12px] font-medium text-cc-ink-muted">{wt('walk.noLines')}</span>}
            </div>
            {station.decides.length > 0 ? (
              <MoreList title={wt('walk.decides')} lines={station.decides} shown={shown} />
            ) : null}
            {station.data ? <MoreList title={wt('walk.data')} lines={[station.data]} shown={shown} /> : null}
            {station.engine ? (
              <p className="m-0 text-[12px] leading-snug font-medium text-cc-ink-muted">
                <span className="font-semibold text-cc-ink">{wt('walk.engineReading')}: </span>
                {station.engine}
              </p>
            ) : null}
            <AsReadFromCode said={said} />
          </div>
        </CcDisclosure>
      </div>
    </>
  );
}

/** A sentence as the card says it: the plain wording, without table codes on top (they stay one fold down). */
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
  shown,
  designHref,
}: {
  tour: Tour;
  titleId: string;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  shown: (line: WalkLine) => WordedSentence;
  designHref: string | null;
}) {
  const closing = tour.closing ? shown(tour.closing) : null;
  return (
    <div data-tour-end="" className="flex flex-col gap-3">
      <h2 id={titleId} ref={headingRef} tabIndex={-1} className="m-0 text-[22px] leading-tight font-bold text-cc-ink">
        {tour.stations.length > 0 ? wt('walk.endTitle') : wt('walk.title')}
      </h2>
      {tour.stations.length === 0 ? <p className="m-0 text-[14px] leading-relaxed font-medium text-cc-ink">{wt('walk.empty')}</p> : null}
      {closing ? (
        <p data-tour-closing="" className="m-0 text-[14px] leading-relaxed font-medium text-cc-ink">
          {withoutCodes(closing.text)}
          <WordedChip said={closing} />
          {tour.closing?.anchor ? (
            <>
              {' '}
              <Lines range={tour.closing.anchor} />
            </>
          ) : null}
        </p>
      ) : (
        <p className="m-0 text-[13px] leading-snug font-medium text-cc-ink-muted">{wt('walk.endNone')}</p>
      )}
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
