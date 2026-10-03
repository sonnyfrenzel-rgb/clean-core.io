'use client';

import React, { useId, useRef } from 'react';
import { cn } from '@/lib/utils';
import type { LayerKey, WorkspaceLayer } from '@/lib/workspace-model';
import { wt } from '@/lib/workspace-messages';

/**
 * The section bar — `DESIGN.md` §2.3 item 4, roadmap 1.4.
 *
 * It carries **layers and nothing else**. The views are a segmented control in
 * the header and the seven stages are a toolbar, so each of the three
 * navigations has exactly one job (ADR-018): a view orders the same content, a
 * layer jumps to a section of this page, a tool opens a stage as its own page.
 *
 * **Unmistakably a navigation** (owner, 03.10.2026: "No recognisable menu; you
 * quickly lose the overview"). Before, it was a row of underlined words with
 * their counts run on in monospace, and the empty layers hid behind "More 1
 * empty". Now:
 *
 *   - a named container ("Sections") with the WAI-ARIA tabs pattern — a
 *     `tablist` with a name, `tab`s with `aria-selected`, the roving tabindex
 *     and the arrow keys of `CcTabs`, whose pill look it takes: a muted track,
 *     the chosen section a raised surface with an ink ring. Ink, never a state
 *     colour: where the reader stands is not evidence (roadmap 1.7);
 *   - each count a small badge of its own, not text glued to the label;
 *   - **sticky** under the shell bar while the reader is in the section, so
 *     where they are and the way to the next section stay in view; on a phone
 *     the row scrolls sideways inside its track and the page does not;
 *   - **every section is a tab, the empty ones included**, after the filled
 *     ones and marked "empty" — no dropdown. "More 1 empty" was a menu with one
 *     entry, and a reader who opened it found a sentence saying the section had
 *     nothing; as a muted tab the same sentence is one arrow key away, it opens
 *     with the section's own heading over it (roadmap 6.2), and the bar is one
 *     control with one keyboard pattern instead of two.
 *
 * The section itself (`LayerSection`) is the tab panel: its `id` is the layer
 * key, which is also the URL fragment, so `#evidence` stays a real anchor.
 */
export default function WorkspaceLayerBar({
  layers,
  current,
  onSelect,
}: {
  layers: WorkspaceLayer[];
  current: LayerKey;
  onSelect: (key: LayerKey) => void;
}) {
  const id = useId();
  const refs = useRef(new Map<LayerKey, HTMLButtonElement>());
  // Filled sections first, in their order; the empty ones after them. The
  // chosen one keeps its place either way.
  const ordered = [
    ...layers.filter((l) => l.count !== null || l.key === current),
    ...layers.filter((l) => l.count === null && l.key !== current),
  ];

  const select = (key: LayerKey, focus: boolean) => {
    onSelect(key);
    if (focus) {
      const button = refs.current.get(key);
      button?.focus();
      button?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const index = ordered.findIndex((l) => l.key === current);
    let target: number | null = null;
    if (event.key === 'ArrowRight') target = (index + 1) % ordered.length;
    else if (event.key === 'ArrowLeft') target = (index - 1 + ordered.length) % ordered.length;
    else if (event.key === 'Home') target = 0;
    else if (event.key === 'End') target = ordered.length - 1;
    if (target === null || !ordered[target]) return;
    event.preventDefault();
    select(ordered[target].key, true);
  };

  return (
    <nav
      data-workspace-layers=""
      aria-label={wt('layerBar.label')}
      className="cc-no-print sticky top-14 z-cc-sticky bg-cc-page py-2"
    >
      <div className="flex min-w-0 items-center gap-2 rounded-cc-card border border-cc-line bg-cc-surface p-1 shadow-cc">
        <span
          id={`${id}-lead`}
          aria-hidden={true}
          className="shrink-0 pl-2 text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase max-sm:hidden"
        >
          {wt('layerBar.lead')}
        </span>
        <div
          role="tablist"
          aria-label={wt('layerBar.label')}
          aria-orientation="horizontal"
          onKeyDown={onKeyDown}
          data-workspace-layer-tabs=""
          className="flex min-w-0 flex-1 flex-nowrap gap-1 overflow-x-auto rounded-cc-row bg-cc-surface-muted p-1 [scrollbar-width:thin] sm:flex-wrap"
        >
          {ordered.map((layer) => {
            const on = layer.key === current;
            const empty = layer.count === null;
            return (
              <button
                key={layer.key}
                ref={(el) => {
                  if (el) refs.current.set(layer.key, el);
                  else refs.current.delete(layer.key);
                }}
                id={`${id}-tab-${layer.key}`}
                type="button"
                role="tab"
                aria-selected={on}
                aria-controls={on ? layer.key : undefined}
                tabIndex={on ? 0 : -1}
                data-workspace-layer={layer.key}
                data-layer-state={on ? 'on' : 'off'}
                data-layer-empty={empty ? 'yes' : 'no'}
                title={empty ? layer.missing : undefined}
                onClick={() => select(layer.key, false)}
                className={cn(
                  'group inline-flex shrink-0 items-stretch rounded-cc-row text-left text-[13px] whitespace-nowrap pointer-coarse:min-h-11',
                  'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cc-focus',
                  on ? 'font-bold text-cc-ink' : empty ? 'font-medium text-cc-ink-muted hover:text-cc-ink' : 'font-semibold text-cc-ink',
                )}
              >
                {/* The raised surface of the chosen tab sits on an inner span, as
                    in `CcTabs` (pill): the button stays one without a surface
                    of its own (§1.5). */}
                <span
                  data-workspace-layer-pill=""
                  className={cn(
                    'inline-flex w-full items-center gap-2 rounded-cc-row px-3 py-1',
                    on ? 'bg-cc-surface shadow-cc ring-1 ring-cc-ink' : 'group-hover:bg-cc-surface',
                  )}
                >
                <span>{layer.label}</span>
                <span
                  data-workspace-layer-count=""
                  className={cn(
                    'rounded-full border px-2 text-[11px] leading-[18px] font-semibold',
                    empty
                      ? 'border-dashed border-cc-line text-cc-ink-muted'
                      : on
                        ? 'border-cc-ink text-cc-ink'
                        : 'border-cc-line bg-cc-surface text-cc-ink-muted',
                  )}
                >
                  {layer.count ?? wt('layerBar.empty')}
                </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
