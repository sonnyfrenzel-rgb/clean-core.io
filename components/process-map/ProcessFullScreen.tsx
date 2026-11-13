'use client';

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Map as MapIcon, Play, SlidersHorizontal } from 'lucide-react';
import CcAnchor from '@/components/cc/Anchor';
import CcButton from '@/components/cc/Button';
import CcIconButton from '@/components/cc/IconButton';
import CcSwitch from '@/components/cc/Switch';
import { anchorText } from '@/lib/bpmn/layout';
import type { ProcessMapElement } from '@/lib/process-map';
import type { ProcessSearchHit } from '@/lib/process-navigation';
import { fullScreenHits, wt } from '@/lib/workspace-messages';
import type { CanvasFullscreenTools } from './BpmnCanvas';
import { CanvasFullscreenToggle, CanvasZoomControls } from './CanvasViewControls';
import type { ProcessSearchResults } from './ProcessSearch';

/**
 * The map's full screen on Analyze, Business — plan AB-5 (3.2.0), mockup states 14, 15 and 16, ADR-119.
 *
 * **One bar.** What the process is and where the reader is (the level path and the way up), find a step, zoom, fit,
 * the overview map, the *Edit* switch, *Walk me through it* and *Leave full screen* — in that order, wrapping on a
 * narrow screen with the way out kept at the end of the row. *Edit* is off whenever full screen opens; switched on,
 * the canvas becomes today's editor (`BpmnEditor`, `embedded`), whose own row carries undo, zoom, tidy, compare,
 * import, the downloads and its overview, so this bar keeps only what is not the editor's. On a phone *Edit* is
 * disabled with the sentence why (P3, `DESIGN.md` §5.7); an invited reader's with the owner-only sentence (P8).
 *
 * **On a phone, one row** (3.2.0, ADR-119): the level path with the way up, one 44 px button that opens a sheet, and
 * *Leave full screen* in words — the bar that wrapped to some 550 px left the canvas a sliver. The sheet holds
 * *Walk me through it*, "Map | Steps", find, zoom, fit, the overview map and the *Edit* switch, which a phone cannot
 * switch on (P3), with its sentence why. It lies over the top of the canvas and pushes nothing; opening it moves the
 * focus into it, Escape or the button closes it and the focus returns to the button.
 *
 * **One side column.** The walk-through when it runs (the caller's card, `tour`), else the code of the chosen step
 * (a click on the map opens it here; full screen stays), else the hits of a search by the name the map shows, else a
 * line that says what a click does — and under it the overview map while it is on.
 *
 * Presentational: the state is `ProcessMap`'s, the frame and the focus are `BpmnCanvas`'s (`fullscreenParts`).
 */

export interface FullScreenBarProps {
  tools: CanvasFullscreenTools;
  processName: string;
  /** The level path with the way up — where the reader is. */
  place: React.ReactNode;
  /** "Map | Steps": beside the level path on a wide screen, in the sheet on a phone. */
  viewSwitch?: React.ReactNode;
  /** A phone (breakpoint S): one row, the tools behind one button. */
  compact?: boolean;
  /** The step list stands in the canvas's place: zoom, fit and the overview have nothing to act on. */
  steps: boolean;
  /** The field that finds a step (`ProcessSearch` `compact`); absent while editing. */
  search?: React.ReactNode;
  editing: boolean;
  /** The editor's own row carries zoom, fit and its overview while editing; this bar does not repeat them. */
  overview: boolean;
  onOverviewChange: (on: boolean) => void;
  /** The map's own toggles after the overview (the keyboard help); absent while editing, as zoom is. */
  extra?: React.ReactNode;
  /** Disabled with this sentence (a phone, an invited reader); null when *Edit* can be switched. */
  editBlocked: string | null;
  onEditingChange: (on: boolean) => void;
  /** *Walk me through it* — absent where the page has no tour, or while it runs. */
  onWalk?: (() => void) | null;
}

export function FullScreenBar(props: FullScreenBarProps) {
  return props.compact ? <CompactFullScreenBar {...props} /> : <WideFullScreenBar {...props} />;
}

function WideFullScreenBar({
  tools,
  processName,
  place,
  viewSwitch = null,
  steps,
  search,
  editing,
  overview,
  onOverviewChange,
  extra,
  editBlocked,
  onEditingChange,
  onWalk,
}: FullScreenBarProps) {
  const gap = <span aria-hidden={true} className="hidden h-6 border-l border-cc-line sm:inline" />;
  return (
    <div
      data-map-fullscreen-bar=""
      role="group"
      aria-label={wt('fullScreen.barLabel')}
      className="flex shrink-0 items-start gap-2 rounded-cc-card border border-cc-line bg-cc-surface p-2"
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
        <div data-map-fullscreen-title="" className="flex min-w-0 flex-col">
          <span className="truncate text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase">{processName}</span>
          <div data-map-level-path="" className="min-w-0">
            {viewSwitch ? (
              <div className="flex flex-wrap items-center gap-2">
                {viewSwitch}
                {place}
              </div>
            ) : place}
          </div>
        </div>
        {editing ? null : (
          <>
            {search}
            {steps ? null : gap}
            <div className={steps ? 'hidden' : 'flex flex-wrap items-center gap-2'}>
              <CanvasZoomControls scope="map" zoom={tools.zoom} onZoomBy={tools.zoomBy} onFit={tools.fit} />
              <CcIconButton
                data-map-fullscreen-overview=""
                label={wt('fullScreen.overview')}
                text={wt('fullScreen.overview')}
                aria-pressed={overview}
                onClick={() => onOverviewChange(!overview)}
              >
                <MapIcon size={16} aria-hidden={true} />
              </CcIconButton>
              {extra}
            </div>
          </>
        )}
        {gap}
        <div data-map-fullscreen-edit={editBlocked ? 'blocked' : editing ? 'on' : 'off'} className="min-w-0">
          <CcSwitch
            data-map-fullscreen-edit-switch=""
            label={wt('fullScreen.edit')}
            checked={editing}
            disabled={editBlocked !== null}
            onChange={onEditingChange}
            help={editBlocked ?? undefined}
          />
        </div>
        {onWalk ? (
          <CcButton data-map-fullscreen-walk="" icon={<Play size={16} aria-hidden={true} />} onClick={onWalk}>
            {wt('abiz.walk')}
          </CcButton>
        ) : null}
      </div>
      {/* The way out keeps the top right corner, where a reader looks for it, and takes the focus on the way in. */}
      <span className="shrink-0">
        <CanvasFullscreenToggle scope="map" filled={true} onToggle={tools.leave} buttonRef={tools.leaveRef} />
      </span>
    </div>
  );
}

/** The phone's bar: one row, the tools in a sheet behind one button (3.2.0, ADR-119). */
function CompactFullScreenBar({
  tools,
  processName,
  place,
  viewSwitch = null,
  steps,
  search,
  editing,
  overview,
  onOverviewChange,
  editBlocked,
  onEditingChange,
  onWalk,
}: FullScreenBarProps) {
  const sheetId = useId();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) window.requestAnimationFrame(() => buttonRef.current?.focus());
  }, []);
  // Editing hides the tools the sheet holds: it closes with them.
  const sheetShown = open && !editing;
  // Open: the focus goes to the first control in the sheet.
  useEffect(() => {
    if (!sheetShown) return undefined;
    const frame = window.requestAnimationFrame(() => {
      sheetRef.current?.querySelector<HTMLElement>('input, button:not([disabled]), [tabindex="0"]')?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [sheetShown]);
  // Escape closes the sheet first, wherever the focus is in full screen, before anything behind it; a press outside
  // the bar closes it too.
  useEffect(() => {
    if (!sheetShown) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      close(true);
    };
    const onPointer = (event: PointerEvent) => {
      if (!barRef.current?.contains(event.target as Node | null)) close(false);
    };
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [sheetShown, close]);
  return (
    <div
      ref={barRef}
      data-map-fullscreen-bar="compact"
      role="group"
      aria-label={wt('fullScreen.barLabel')}
      className="relative flex shrink-0 items-center gap-1 rounded-cc-card border border-cc-line bg-cc-surface p-1"
    >
      <div data-map-fullscreen-title="" className="flex min-w-0 flex-1 flex-col pl-1">
        {/* The level path names the process at its top; the name above it would leave the level's name a few letters. */}
        <span className="sr-only">{processName}</span>
        <div data-map-level-path="" className="min-w-0">{place}</div>
      </div>
      {editing ? null : (
        <CcIconButton
          ref={buttonRef}
          data-map-fullscreen-tools=""
          density="cozy"
          label={wt('fullScreen.tools')}
          aria-expanded={sheetShown}
          aria-controls={sheetShown ? sheetId : undefined}
          onClick={() => (sheetShown ? close(false) : setOpen(true))}
        >
          <SlidersHorizontal size={16} aria-hidden={true} />
        </CcIconButton>
      )}
      {/* The way out in words, as everywhere in full screen (owner 03.10.2026). */}
      <span className="shrink-0">
        <CanvasFullscreenToggle scope="map" filled={true} onToggle={tools.leave} buttonRef={tools.leaveRef} />
      </span>
      {sheetShown ? (
        <div
          ref={sheetRef}
          id={sheetId}
          data-map-fullscreen-sheet=""
          role="group"
          aria-label={wt('fullScreen.toolsSheet')}
          className="absolute top-full right-0 left-0 z-cc-popover mt-1 flex flex-col gap-3 rounded-cc-card border border-cc-line bg-cc-surface p-3 shadow-cc-dialog"
        >
          {onWalk ? (
            <CcButton
              data-map-fullscreen-walk=""
              density="cozy"
              icon={<Play size={16} aria-hidden={true} />}
              onClick={() => {
                setOpen(false);
                onWalk();
              }}
            >
              {wt('abiz.walk')}
            </CcButton>
          ) : null}
          {viewSwitch}
          {search}
          <div className={steps ? 'hidden' : 'flex flex-wrap items-center gap-2'}>
            <CanvasZoomControls scope="map" zoom={tools.zoom} onZoomBy={tools.zoomBy} onFit={tools.fit} />
            <CcIconButton
              data-map-fullscreen-overview=""
              label={wt('fullScreen.overview')}
              text={wt('fullScreen.overview')}
              aria-pressed={overview}
              onClick={() => onOverviewChange(!overview)}
            >
              <MapIcon size={16} aria-hidden={true} />
            </CcIconButton>
          </div>
          <div data-map-fullscreen-edit={editBlocked ? 'blocked' : editing ? 'on' : 'off'} className="min-w-0">
            <CcSwitch
              data-map-fullscreen-edit-switch=""
              label={wt('fullScreen.edit')}
              checked={editing}
              disabled={editBlocked !== null}
              onChange={onEditingChange}
              help={editBlocked ?? undefined}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export interface FullScreenRailProps {
  /** The walk-through's card, while it runs in full screen (the caller's); it stands first. */
  tour?: React.ReactNode;
  /** The code of the chosen step (`ProcessCodeCard`), or null. */
  code: React.ReactNode;
  /** What the search field found, while something is typed. */
  results: ProcessSearchResults | null;
  /** The id the search field names in `aria-controls`. */
  listId: string;
  byId: ReadonlyMap<string, ProcessMapElement>;
  onJump: (hit: ProcessSearchHit) => void;
  /** The overview map (`ProcessMiniMap`), or null while it is off. */
  overview: React.ReactNode;
  /** The keyboard help while it is open, under the first panel. */
  help?: React.ReactNode;
}

export function FullScreenRail({ tour, code, results, listId, byId, onJump, overview, help = null }: FullScreenRailProps) {
  const headingId = useId();
  let first: React.ReactNode;
  if (tour) {
    first = tour;
  } else if (code) {
    first = code;
  } else if (results && results.query) {
    first = (
      <section
        data-map-fullscreen-hits={results.hits.length}
        aria-labelledby={headingId}
        className="flex flex-col gap-2 rounded-cc-card border border-cc-line bg-cc-surface p-3"
      >
        <h4 id={headingId} className="m-0 text-[13px] font-bold text-cc-ink">{fullScreenHits(results.hits.length, results.query)}</h4>
        {results.hits.length > 0 ? (
          <ul id={listId} role="listbox" aria-label={wt('fullScreen.hitsLabel')} className="m-0 flex list-none flex-col p-0">
            {results.hits.map((hit, index) => {
              const element = byId.get(hit.id);
              const anchor = element ? anchorText(element.anchor) : null;
              return (
                <li
                  key={hit.id}
                  role="option"
                  aria-selected={index === results.at}
                  data-map-fullscreen-hit={hit.id}
                  className="flex items-center justify-between gap-2 border-t border-cc-line py-1 first:border-t-0"
                >
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => onJump(hit)}
                    className="min-h-8 min-w-0 flex-1 cursor-pointer rounded-cc-row px-1 text-left text-[13px] font-medium text-cc-ink hover:bg-cc-surface-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cc-focus pointer-coarse:min-h-11"
                  >
                    {/* The name the map shows — what the reader searched by. */}
                    {hit.label}
                  </button>
                  {anchor ? <CcAnchor tone="unlinked">{anchor}</CcAnchor> : null}
                </li>
              );
            })}
          </ul>
        ) : null}
        {results.hits.length > 0 ? (
          <p className="m-0 text-[12px] font-medium text-cc-ink-muted">{wt('fullScreen.hitsHint')}</p>
        ) : null}
      </section>
    );
  } else {
    first = (
      <section
        data-map-fullscreen-nothing=""
        aria-labelledby={headingId}
        className="flex flex-col gap-1 rounded-cc-card border border-cc-line bg-cc-surface p-3"
      >
        <h4 id={headingId} className="m-0 text-[13px] font-bold text-cc-ink">{wt('fullScreen.nothingTitle')}</h4>
        <p className="m-0 text-[12px] font-medium text-cc-ink-muted">{wt('fullScreen.nothingBody')}</p>
      </section>
    );
  }
  return (
    <div data-map-fullscreen-column="" role="region" aria-label={wt('fullScreen.railLabel')} className="flex min-w-0 flex-col gap-2">
      {first}
      {help}
      {overview ? (
        <section data-map-fullscreen-overview-panel="" className="flex flex-col gap-1">
          <h4 className="m-0 text-[13px] font-bold text-cc-ink">{wt('fullScreen.overview')}</h4>
          {overview}
        </section>
      ) : null}
    </div>
  );
}
