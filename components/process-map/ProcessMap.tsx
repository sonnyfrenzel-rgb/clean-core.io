'use client';

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { List, Map as MapIcon } from 'lucide-react';
import CcSegmentedControl from '@/components/cc/SegmentedControl';
import CcMessageStrip from '@/components/cc/MessageStrip';
import { UNANCHORED } from '@/lib/process-naming';
import { elementsOfPlane, type ProcessMapElement, type ProcessMapModel } from '@/lib/process-map';
import BpmnCanvas from './BpmnCanvas';
import ProcessCodeCard from './ProcessCodeCard';
import ProcessMapLegend from './ProcessMapLegend';
import ProcessStepList from './ProcessStepList';

/**
 * The process map in the workspace — roadmap 2.5, reading only.
 *
 * What it shows is the BPMN 2.6 writes out of the signed source, with the
 * business names 2.4 proposed beside the technical ones. It calls no model and
 * stores no change: there is nothing here to edit, and the editor is roadmap
 * 3.1.
 *
 * Three things it is measured on:
 *
 *   1. **The legend is Reconstructed · Confirmed · Proven**, counted out of the
 *      file's own `cc:trace/@status`, and an element without a line anchor is
 *      visibly `Unanchored` rather than quietly tidy.
 *   2. **Selecting an element opens its code card with its lines marked** — the
 *      real lines of the source the run signed.
 *   3. **It works without a mouse, as an equal.** "Map | Steps" are two
 *      renderings of one model: same elements, same order, same names, same
 *      anchors. Each is **one** tab stop with a roving `tabindex`, and the key
 *      handling below is shared, so the two navigate identically. Enter opens
 *      the code card, Escape closes it and puts the focus back on the node.
 *      Every node is a control with a spoken name — never a bare id.
 *
 * ## The API roadmap 2.9 and 3.1 inherit
 *
 * `selected` / `onSelectedChange` and `plane` / `onPlaneChange` are controlled
 * when given and local otherwise. 2.9 puts both in the URL
 * (`#map=<plane>&node=<element>`); opening a level is `plane = <sub-process
 * element id>`, and `null` is the top level. 3.1 swaps `BpmnCanvas` for a
 * modeller behind the same two, so a selection survives the switch into editing.
 */
export type ProcessMapView = 'map' | 'steps';

export interface ProcessMapProps {
  /** `buildProcessMapModel(...)` — memoised by the caller; it is an effect input. */
  model: ProcessMapModel;
  /** The source the active run signed. The code card is built from this and nothing else. */
  source: string;
  /** The selected element's id. Controlled when given. */
  selected?: string | null;
  onSelectedChange?: (elementId: string | null) => void;
  /** The open level: null for the top plane, otherwise a sub-process element id. Controlled when given. */
  plane?: string | null;
  onPlaneChange?: (plane: string | null) => void;
  view?: ProcessMapView;
  onViewChange?: (view: ProcessMapView) => void;
  /** Starting view when uncontrolled. `steps` on a phone — `DESIGN.md` §5.7. */
  defaultView?: ProcessMapView;
  /** When the quote was last measured and stored for this source. */
  measuredAt?: string | null;
}

export default function ProcessMap({
  model,
  source,
  selected: selectedProp,
  onSelectedChange,
  plane: planeProp,
  onPlaneChange,
  view: viewProp,
  onViewChange,
  defaultView = 'map',
  measuredAt = null,
}: ProcessMapProps) {
  const [viewLocal, setViewLocal] = useState<ProcessMapView>(defaultView);
  const [selectedLocal, setSelectedLocal] = useState<string | null>(null);
  const [planeLocal, setPlaneLocal] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [focusToken, setFocusToken] = useState(0);
  /** Which branch of a decision the arrow keys last stepped to. */
  const branch = useRef<{ id: string; index: number }>({ id: '', index: -1 });

  const view = viewProp ?? viewLocal;
  const selected = selectedProp !== undefined ? selectedProp : selectedLocal;
  const plane = planeProp !== undefined ? planeProp : planeLocal;

  const setView = useCallback((next: ProcessMapView) => {
    setViewLocal(next);
    onViewChange?.(next);
  }, [onViewChange]);

  const setSelected = useCallback((next: string | null) => {
    setSelectedLocal(next);
    onSelectedChange?.(next);
  }, [onSelectedChange]);

  const setPlane = useCallback((next: string | null) => {
    setPlaneLocal(next);
    onPlaneChange?.(next);
  }, [onPlaneChange]);

  const planeElements = useMemo(() => elementsOfPlane(model, plane), [model, plane]);
  const byId = useMemo(() => new Map(model.elements.map((e) => [e.id, e])), [model]);
  const canvasNodes = useMemo(
    () => new Map(model.elements.map((e) => [e.id, {
      accessibleName: e.accessibleName,
      unanchored: e.anchor === null,
      unanchoredLabel: UNANCHORED,
    }])),
    [model],
  );

  const selectedElement: ProcessMapElement | null = selected ? (byId.get(selected) ?? null) : null;

  /** Move the roving focus, and keep an open code card on the node the reader is on. */
  const focusTo = useCallback((id: string | undefined) => {
    if (!id) return;
    setActive(id);
    setFocusToken((token) => token + 1);
    // `DESIGN.md` §5.7: focus is hover. While the source column is open it
    // follows the node, so arrowing along the flow reads the code along with it.
    if (selected !== null) setSelected(id);
  }, [selected, setSelected]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLElement>) => {
    const order = planeElements;
    if (!order.length) return;

    if (event.key === 'Escape') {
      if (selected === null) return;
      event.preventDefault();
      setSelected(null);
      // Back to the node it was opened from — not to the top of the page.
      setFocusToken((token) => token + 1);
      return;
    }

    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      if (!active) return;
      event.preventDefault();
      setSelected(active);
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      focusTo(order[0]?.id);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      focusTo(order[order.length - 1]?.id);
      return;
    }

    const vertical = event.key === 'ArrowDown' || event.key === 'ArrowUp';
    const horizontal = event.key === 'ArrowRight' || event.key === 'ArrowLeft';
    if (!vertical && !horizontal) return;
    event.preventDefault();

    const index = order.findIndex((element) => element.id === active);
    const current = index >= 0 ? order[index] : null;

    // At a decision the vertical keys choose the branch — `DESIGN.md` §5.7.
    if (vertical && current && current.branches.length > 1) {
      const targets = current.branches.map((b) => b.to).filter((id) => order.some((e) => e.id === id));
      if (targets.length > 0) {
        const step = event.key === 'ArrowDown' ? 1 : -1;
        const at = branch.current.id === current.id ? branch.current.index : -1;
        const next = at < 0
          ? (step > 0 ? 0 : targets.length - 1)
          : (at + step + targets.length) % targets.length;
        branch.current = { id: current.id, index: next };
        focusTo(targets[next]);
        return;
      }
    }

    branch.current = { id: '', index: -1 };
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
    const from = index >= 0 ? index : step > 0 ? -1 : order.length;
    const next = Math.min(order.length - 1, Math.max(0, from + step));
    focusTo(order[next]?.id);
  }, [active, focusTo, planeElements, selected, setSelected]);

  const activate = useCallback((id: string) => {
    setActive(id);
    setSelected(id);
  }, [setSelected]);

  const openLevel = plane ? byId.get(plane) : null;

  return (
    <section data-process-map="" aria-label="Process reconstructed from code" className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h3 data-process-map-title className="text-[15px] font-bold text-cc-ink">
            Process — reconstructed from code
          </h3>
          <p data-process-map-overview className="mt-0.5 text-[13px] font-medium text-cc-ink-muted">
            {model.overview}
          </p>
          <p data-process-map-traceability className="mt-0.5 text-[13px] font-medium text-cc-ink-muted">
            {model.traceability.sentence}
            {measuredAt ? ` Measured and kept with this model on ${measuredAt.slice(0, 10)}.` : ''}
          </p>
        </div>
        <CcSegmentedControl<ProcessMapView>
          label="Process view"
          value={view}
          onChange={setView}
          segments={[
            { value: 'map', label: 'Map', icon: <MapIcon size={14} aria-hidden={true} /> },
            { value: 'steps', label: 'Steps', icon: <List size={14} aria-hidden={true} /> },
          ]}
        />
      </div>

      <ProcessMapLegend
        entries={model.legend}
        unanchored={model.traceability.unanchored}
        unanchoredLabel={UNANCHORED}
      />

      {model.naming.notice ? (
        <CcMessageStrip state="neutral" headline="Business names">
          {model.naming.notice}
        </CcMessageStrip>
      ) : null}

      {model.lanes.length > 0 ? (
        <p data-process-map-lanes className="text-[12px] font-medium text-cc-ink-muted">
          Lanes proposed: {model.lanes.map((lane) => lane.name).join(' · ')}. {model.lanes[0].statement}
        </p>
      ) : null}

      {openLevel ? (
        <p data-process-map-level className="text-[12px] font-medium text-cc-ink-muted">
          Level: {openLevel.label}
        </p>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          {view === 'map' ? (
            <BpmnCanvas
              xml={model.xml}
              label={`${model.processName}. ${model.overview}`}
              nodes={canvasNodes}
              plane={plane}
              onPlaneChange={setPlane}
              active={active}
              onActivate={activate}
              onActiveChange={setActive}
              focusToken={focusToken}
              onKeyDown={handleKeyDown}
            />
          ) : (
            <ProcessStepList
              elements={planeElements}
              label={`Steps. ${model.overview}`}
              active={active}
              selected={selected}
              onActivate={activate}
              onActiveChange={setActive}
              focusToken={focusToken}
              onKeyDown={handleKeyDown}
            />
          )}
        </div>
        {selectedElement ? (
          <ProcessCodeCard
            element={selectedElement}
            source={source}
            fileName={model.fileName}
            onClose={() => {
              setSelected(null);
              setFocusToken((token) => token + 1);
            }}
          />
        ) : (
          <p
            data-process-map-hint
            className="rounded-cc-card border border-cc-line bg-cc-surface-muted p-3 text-[13px] font-medium text-cc-ink-muted"
          >
            Select a step to open the code it was read from. With the keyboard: Tab to the{' '}
            {view === 'map' ? 'map' : 'step list'}, the arrow keys to move, Enter to open, Escape to close.
          </p>
        )}
      </div>
    </section>
  );
}
