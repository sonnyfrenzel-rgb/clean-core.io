'use client';

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import CcButton from '@/components/cc/Button';
import CcCard from '@/components/cc/Card';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import CcSegmentedControl from '@/components/cc/SegmentedControl';
import { VIEW_LABELS, WORKSPACE_VIEWS, type WorkspaceView } from '@/lib/workspace-model';
import {
  STAGE_DWELL_MS,
  STAGE_FADE_MS,
  type StagePanel,
  type TravellingFact,
} from '@/lib/three-views-stage';

/**
 * The three views in motion — `DESIGN.md` §6.1.1, roadmap step 6.1.
 *
 * One fact out of the real run of the example travels through Business, IT and
 * Management. The **anchor stays where it is** — it is the sign that this is the
 * same fact — and only the content around it changes. `lib/three-views-stage.ts`
 * derives all of it from the engine; this file times it and draws it.
 *
 * **The switcher is the real one.** `CcSegmentedControl` with `label="View"` and
 * the labels out of `lib/workspace-model.ts`, so that the control someone meets
 * here is the control they meet in the workspace, in the one order of ADR-044:
 * Business, IT, Management, Business selected. A second switcher built for a
 * marketing stage would teach the wrong thing twice.
 *
 * **What moves, and for how long.** `DESIGN.md` §1.7 allows exactly two
 * stagings in the product and this is one of them: *„laufen einmal, sind
 * überspringbar und stehen bei reduzierter Bewegung still"*. So: one pass, 3.5 s
 * a view, a 200 ms cross-fade, then the stage rests on Business with *Replay*.
 * No loop. Hover and focus hold it; a click takes it over and ends the automatic
 * change for good, because somebody who has started steering is steering.
 *
 * **`prefers-reduced-motion` and small screens do not animate at all.** With
 * reduced motion the three views stand as three columns side by side — there is
 * nothing to switch, so the switcher is not drawn there. On a phone the stage is
 * one panel and the switcher chooses it. Both are the end state, reached
 * without a timer, which is the same promise the first look makes (§5.2).
 *
 * **Nothing here is stored.** Not on the account, not in the browser: which view
 * a stage on an intro page was showing is not a fact about anything. The state
 * is `useState` and dies with the page — see `tests/view-attribute-guard.spec.ts`.
 */
export default function ThreeViewsStage({
  fact,
  onSkip,
}: {
  /** Derived from the example's own source. `null` renders nothing at all. */
  fact: TravellingFact | null;
  /** *„Skip intro" ist immer sichtbar* — folds part 1 away, as "Hide this" does. */
  onSkip: () => void;
}) {
  const [view, setView] = useState<WorkspaceView>('business');
  const [auto, setAuto] = useState(true);
  const [held, setHeld] = useState(false);
  const [fading, setFading] = useState(false);
  /**
   * `null` until the browser has been asked, the same reason the workspace's
   * layer is: this renders on the server too, and a stage that started moving
   * and then discovered the reader had asked for no movement would have already
   * broken the promise.
   */
  const [still, setStill] = useState<boolean | null>(null);
  const [narrow, setNarrow] = useState(false);
  const fade = useRef<number | null>(null);
  const labelId = useId();

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const small = window.matchMedia('(max-width: 600px)');
    const read = () => {
      setStill(motion.matches);
      setNarrow(small.matches);
    };
    read();
    motion.addEventListener('change', read);
    small.addEventListener('change', read);
    return () => {
      motion.removeEventListener('change', read);
      small.removeEventListener('change', read);
    };
  }, []);

  useEffect(
    () => () => {
      if (fade.current !== null) window.clearTimeout(fade.current);
    },
    [],
  );

  /**
   * A cross-fade for the automatic change; a click switches at once.
   *
   * The pending fade is cancelled first, and that is not tidiness. The last
   * automatic change and the stop happen together — `setAuto(false)` lands
   * while the 200 ms fade back to Business is still in flight — so a reader who
   * clicks in that window used to get their view for a fifth of a second and
   * then be dragged back to Business by a timer that had already been
   * overtaken. The guard in `tests/view-attribute-guard.spec.ts` clicks exactly
   * there, which is how it was found.
   */
  const show = useCallback(
    (next: WorkspaceView, immediate: boolean) => {
      if (fade.current !== null) {
        window.clearTimeout(fade.current);
        fade.current = null;
      }
      if (immediate || still !== false) {
        setFading(false);
        setView(next);
        return;
      }
      setFading(true);
      fade.current = window.setTimeout(() => {
        setView(next);
        setFading(false);
      }, STAGE_FADE_MS);
    },
    [still],
  );

  const moving = auto && still === false && !narrow;

  useEffect(() => {
    if (!moving || held) return;
    const at = WORKSPACE_VIEWS.indexOf(view);
    const timer = window.setTimeout(() => {
      const next = WORKSPACE_VIEWS[at + 1];
      if (next) {
        show(next, false);
      } else {
        // One pass. It comes to rest where it started (§6.1.1), and the only
        // way it moves again is the reader pressing Replay.
        show('business', false);
        setAuto(false);
      }
    }, STAGE_DWELL_MS);
    return () => window.clearTimeout(timer);
  }, [moving, held, view, show]);

  if (!fact) return null;

  const panels = fact.panels;
  const current = panels.find((p) => p.view === view) ?? panels[0];
  const columns = still === true;

  return (
    <CcCard title="One case, three views" level={2}>
      <div
        data-three-views-stage={columns ? 'columns' : 'stage'}
        data-three-views-auto={moving ? 'running' : 'stopped'}
        onMouseEnter={() => setHeld(true)}
        onMouseLeave={() => setHeld(false)}
        onFocusCapture={() => setHeld(true)}
        onBlurCapture={() => setHeld(false)}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* The real switcher — and nothing to switch in the column layout, so
              it is not drawn there rather than drawn and inert. */}
          {columns ? (
            <span id={labelId} className="text-[12px] font-semibold text-cc-ink">
              Business, IT and Management on the same fact
            </span>
          ) : (
            <span id={labelId}>
              <CcSegmentedControl
                label="View"
                value={view}
                onChange={(next) => {
                  // "Ein Klick auf eine Sicht übernimmt und beendet das
                  // automatische Wechseln" — and it does not come back.
                  setAuto(false);
                  show(next, true);
                }}
                segments={WORKSPACE_VIEWS.map((v) => ({ value: v, label: VIEW_LABELS[v] }))}
              />
            </span>
          )}
          <span className="flex flex-wrap items-center gap-2">
            {!columns && !narrow && !auto ? (
              <CcButton
                data-three-views-replay=""
                onClick={() => {
                  show('business', true);
                  setAuto(true);
                }}
              >
                Replay
              </CcButton>
            ) : null}
            <CcButton data-three-views-skip="" onClick={onSkip}>
              Skip intro
            </CcButton>
          </span>
        </div>

        {/* The anchor, outside everything that fades: same fact, other view,
            same place. It is the one thing on this stage that never moves. */}
        <p
          data-three-views-anchor=""
          className="m-0 mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 font-cc-mono text-[12px] text-cc-ink"
        >
          <b className="font-semibold">{fact.program}</b>
          <span data-three-views-anchor-line="" className="text-cc-ink-muted">
            {fact.anchor}
          </span>
          <span className="text-cc-ink-muted">{fact.table}</span>
        </p>

        <div
          className={
            columns
              ? 'mt-3 grid grid-cols-1 gap-3 md:grid-cols-3'
              : fading
                ? 'mt-3 opacity-0 transition-opacity duration-200 motion-reduce:transition-none'
                : 'mt-3 opacity-100 transition-opacity duration-200 motion-reduce:transition-none'
          }
        >
          {(columns ? panels : [current]).map((panel) => (
            <StageView key={panel.view} panel={panel} labelledBy={labelId} />
          ))}
        </div>

        <p
          data-three-views-label=""
          className="m-0 mt-3 text-[11px] leading-snug font-medium text-cc-ink-muted"
        >
          {fact.label} — read by the same engine that reads your own upload. Every line above comes
          from the source, and nothing on this stage is stored anywhere.
        </p>
      </div>
    </CcCard>
  );
}

/**
 * One view's panel.
 *
 * `aria-live` is deliberately absent: §6.1.1 — *„automatisches Wechseln sagt
 * nichts an"*. A stage that narrated itself every 3.5 seconds would make the
 * page unusable with a screen reader, which is the opposite of what the second
 * of the three difference lines promises.
 */
function StageView({ panel, labelledBy }: { panel: StagePanel; labelledBy: string }) {
  return (
    <div
      role="group"
      aria-labelledby={labelledBy}
      data-three-views-panel={panel.view}
      className="rounded-cc-card border border-cc-line bg-cc-surface p-3"
    >
      <p
        data-three-views-question=""
        className="m-0 text-[12px] leading-snug font-semibold text-cc-ink"
      >
        {VIEW_LABELS[panel.view]} — {panel.question}
      </p>
      <ul className="m-0 mt-2 list-none space-y-2 p-0">
        {panel.lines.map((line) => (
          <li key={line.key} data-three-views-line={line.key}>
            <span className="block text-[12px] leading-snug font-medium text-cc-ink-muted">
              {line.text}
            </span>
            <span className="mt-1 inline-flex">
              <CcProvenanceChip value={line.provenance} />
            </span>
          </li>
        ))}
      </ul>
      {panel.options ? (
        <p
          data-three-views-options=""
          className="m-0 mt-2 text-[11px] leading-snug font-medium text-cc-ink-muted"
        >
          Offered here: {panel.options.join(' · ')} — options on a screen, not a decision on record.
        </p>
      ) : null}
    </div>
  );
}
