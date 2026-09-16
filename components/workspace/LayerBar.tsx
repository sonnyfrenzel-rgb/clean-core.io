'use client';

import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import CcButton from '@/components/cc/Button';
import type { LayerKey, WorkspaceLayer } from '@/lib/workspace-model';

/**
 * The Anchor Bar — `DESIGN.md` §2.3 item 4, roadmap 1.4.
 *
 * It carries **layers and nothing else**. The views are a segmented control in
 * the header and the seven stages are a toolbar under it, so each of the three
 * navigations has exactly one job (ADR-018): a view orders the same content, a
 * layer jumps to a section of this page, a tool opens a stage as its own page.
 *
 * Layers with content stand in the bar; empty ones sit under "More" and say
 * there **what is missing** (§2.11, ADR-037). That is the rule this bar exists
 * to follow: six confident-looking tabs over four empty sections is how a first
 * screen ends up offering ten things and answering none.
 *
 * The current layer is marked with `--cc-ink` and a rule under it, never with a
 * state colour: where the reader is standing is not evidence (roadmap 1.7).
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
  const [moreOpen, setMoreOpen] = useState(false);
  const filled = layers.filter((l) => l.count !== null);
  const empty = layers.filter((l) => l.count === null);

  return (
    <nav
      data-workspace-layers=""
      aria-label="Layers"
      className="relative flex flex-wrap items-center gap-x-1 gap-y-1 border-b border-cc-line"
    >
      {filled.map((layer) => {
        const on = layer.key === current;
        return (
          <button
            key={layer.key}
            type="button"
            data-workspace-layer={layer.key}
            data-layer-state={on ? 'on' : 'off'}
            aria-current={on ? 'true' : undefined}
            onClick={() => onSelect(layer.key)}
            className={cn(
              'inline-flex items-center gap-1.5 border-b-2 px-2.5 py-2 text-[13px] whitespace-nowrap',
              on
                ? 'border-cc-ink font-bold text-cc-ink'
                : 'border-transparent font-medium text-cc-ink-muted',
            )}
          >
            {layer.label}
            <span className="font-cc-mono text-[11px] font-semibold text-cc-ink-muted">{layer.count}</span>
          </button>
        );
      })}

      {empty.length > 0 && (
        <>
          <button
            type="button"
            data-workspace-layer-more=""
            aria-expanded={moreOpen}
            aria-haspopup="menu"
            onClick={() => setMoreOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 border-b-2 border-transparent px-2.5 py-2 text-[13px] font-medium text-cc-ink-muted whitespace-nowrap"
          >
            More
            <span className="font-cc-mono text-[11px] font-semibold">{empty.length} empty</span>
            <ChevronDown size={14} aria-hidden={true} />
          </button>
          {moreOpen && (
            <div
              role="menu"
              data-workspace-layer-more-panel=""
              className="absolute top-full right-0 z-20 mt-1 w-80 max-w-[calc(100vw-2rem)] rounded-cc-card border border-cc-line bg-cc-surface p-3 shadow-cc-dialog"
            >
              <ul className="m-0 list-none space-y-2.5 p-0">
                {empty.map((layer) => (
                  <li key={layer.key} data-workspace-layer-empty={layer.key}>
                    <div className="text-[13px] font-bold text-cc-ink">{layer.label}</div>
                    <p className="m-0 mt-0.5 text-[12px] leading-snug font-medium text-cc-ink-muted">
                      {layer.missing}
                    </p>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex justify-end">
                <CcButton variant="ghost" onClick={() => setMoreOpen(false)}>
                  Close
                </CcButton>
              </div>
            </div>
          )}
        </>
      )}
    </nav>
  );
}
