'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import type { OverlayDefinition, RunSwitch, RunVariant } from '@/lib/process-navigation';

/**
 * The filter row over the map — roadmap 2.9, `DESIGN.md` §5.9 items 6, 7 and 8.
 *
 * Three groups of toggles, and they do three different things, which is why
 * they are three groups and not one bar of chips:
 *
 *   - **path highlight** (item 6). *Main path* leaves the way to the normal end
 *     over the default branches lit; *Show paths to here* leaves every way from
 *     the start of the level to the selected element lit. Everything else steps
 *     back — it stays readable, it is never hidden, and one click clears it;
 *   - **overlays as filters** (item 8). Each has a count and each **marks**
 *     matching elements with a text identifier — `BR-004`, `Unanchored`. The
 *     flow does not change: an overlay narrows the outline and the line above it
 *     says by how much, and every element and every arrow of the map stays where
 *     it is;
 *   - **run variants** (item 7). The switches of the selection screen, with the
 *     value the code declares as their position, and only the switches a
 *     condition in the drawn process reads literally.
 *
 * All three start off (`DESIGN.md` §5.7: *"Overlays der Karte sind beim ersten
 * Öffnen aus"*). The first thing a reader sees is the process, not a filtered
 * version of it they did not ask for.
 */
export type PathHighlight = 'none' | 'main' | 'to-selected';

export interface ProcessFiltersProps {
  highlight: PathHighlight;
  onHighlightChange: (next: PathHighlight) => void;
  /** Disabled while nothing is selected — there is no "here" to show paths to. */
  canShowPathsToHere: boolean;

  overlays: readonly OverlayDefinition[];
  activeOverlays: ReadonlySet<string>;
  onOverlaysChange: (next: Set<string>) => void;

  switches: readonly RunSwitch[];
  positions: ReadonlyMap<string, boolean>;
  onPositionsChange: (next: Map<string, boolean>) => void;
  variantOpen: boolean;
  onVariantOpenChange: (next: boolean) => void;
  variant: RunVariant;
}

function toggleClass(on: boolean): string {
  return cn(
    'rounded-cc-row border px-2 py-0.5 text-[11px] font-semibold',
    'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cc-focus',
    on
      ? 'border-cc-ink bg-cc-surface-muted text-cc-ink'
      : 'border-cc-line bg-cc-surface text-cc-ink-muted hover:text-cc-ink',
  );
}

export default function ProcessFilters({
  highlight,
  onHighlightChange,
  canShowPathsToHere,
  overlays,
  activeOverlays,
  onOverlaysChange,
  switches,
  positions,
  onPositionsChange,
  variantOpen,
  onVariantOpenChange,
  variant,
}: ProcessFiltersProps) {
  return (
    <div data-process-filters="" className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-semibold tracking-[0.06em] text-cc-ink-muted uppercase">Path</span>
        <button
          type="button"
          data-path-toggle="main"
          aria-pressed={highlight === 'main'}
          onClick={() => onHighlightChange(highlight === 'main' ? 'none' : 'main')}
          className={toggleClass(highlight === 'main')}
        >
          Main path
        </button>
        <button
          type="button"
          data-path-toggle="to-selected"
          aria-pressed={highlight === 'to-selected'}
          disabled={!canShowPathsToHere}
          onClick={() => onHighlightChange(highlight === 'to-selected' ? 'none' : 'to-selected')}
          className={cn(toggleClass(highlight === 'to-selected'), !canShowPathsToHere && 'opacity-50')}
        >
          Show paths to here
        </button>

        <span className="ml-2 text-[11px] font-semibold tracking-[0.06em] text-cc-ink-muted uppercase">Overlays</span>
        {overlays.map((overlay) => {
          const on = activeOverlays.has(overlay.key);
          return (
            <button
              key={overlay.key}
              type="button"
              data-overlay-toggle={overlay.key}
              aria-pressed={on}
              onClick={() => {
                const next = new Set(activeOverlays);
                if (on) next.delete(overlay.key);
                else next.add(overlay.key);
                onOverlaysChange(next);
              }}
              className={toggleClass(on)}
            >
              {overlay.label} <span data-overlay-count={overlay.key} className="font-cc-mono">{overlay.ids.length}</span>
            </button>
          );
        })}

        {switches.length > 0 ? (
          <button
            type="button"
            data-variants-toggle=""
            aria-pressed={variantOpen}
            aria-expanded={variantOpen}
            onClick={() => onVariantOpenChange(!variantOpen)}
            className={cn('ml-2', toggleClass(variantOpen))}
          >
            Run variants <span className="font-cc-mono">{switches.length}</span>
          </button>
        ) : null}
      </div>

      {variantOpen && switches.length > 0 ? (
        <div data-process-variants="" className="flex flex-col gap-1 rounded-cc-row border border-cc-line bg-cc-surface p-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {switches.map((entry) => {
              const on = positions.get(entry.name) ?? entry.defaultOn ?? true;
              return (
                <button
                  key={entry.name}
                  type="button"
                  data-run-switch={entry.name}
                  aria-pressed={on}
                  onClick={() => {
                    const next = new Map(positions);
                    next.set(entry.name, !on);
                    onPositionsChange(next);
                  }}
                  className={toggleClass(on)}
                >
                  <span className="font-cc-mono">{entry.name}</span> {on ? 'on' : 'off'}
                </button>
              );
            })}
          </div>
          <p data-variant-sentence className="text-[11px] font-medium text-cc-ink-muted">
            {variant.sentence}
          </p>
          <p className="text-[11px] font-medium text-cc-ink-muted">
            A step behind a switch is dimmed together with the level it opens. What comes after it is not:
            the code skips the step and goes on, and the file draws that guard as an arrow with nothing beside it.
          </p>
        </div>
      ) : null}
    </div>
  );
}
