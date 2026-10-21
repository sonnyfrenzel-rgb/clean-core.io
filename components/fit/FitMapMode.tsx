'use client';

import React, { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import CcSegmentedControl from '@/components/cc/SegmentedControl';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import CcButton from '@/components/cc/Button';
import { useFitToStandard } from '@/hooks/useFitToStandard';
import { FIT_DESIGN_HEADER, FIT_DISPOSITION_LABELS, type FitEntry, type FitToStandardDesign } from '@/lib/fit-to-standard-design';
import { parseBpmn } from '@/lib/process-map';
import type { FitMap } from '@/lib/fit-to-standard-map';
import type { BpmnCanvasNode } from '@/components/process-map/BpmnCanvas';
import { FitDispositionMark } from '@/components/fit/FitToStandardView';
import type { Project } from '@/lib/types';

/** bpmn-js on demand, as the as-is map loads it. */
const BpmnCanvas = dynamic(() => import('@/components/process-map/BpmnCanvas'), { ssr: false });

export type FitMapModeValue = 'as-is' | 'fit';

const MODE_SEGMENTS = [
  { value: 'as-is' as const, label: 'As is' },
  { value: 'fit' as const, label: 'Fit to standard' },
];

/** FNV-1a over the text — a change marker for the drawn map, not a digest anything is bound to. */
function marker(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${text.length.toString(36)}.${h.toString(36)}`;
}

/**
 * The key the drawn fit map is held under: the whole source and the whole
 * design, not their lengths — another body of the same length, or the same
 * steps with another reason or anchor, draws the map again.
 */
export function fitMapKey(source: string, fileName: string, processName: string, entries: readonly FitEntry[]): string {
  return `${fileName}:${marker(processName)}:${marker(source)}:${marker(JSON.stringify(entries))}`;
}

const lines = (a: FitEntry['anchor']) => (a ? (a.lineEnd > a.lineStart ? `L${a.lineStart}–L${a.lineEnd}` : `L${a.lineStart}`) : 'Unanchored');

/** The given-up steps with their reasons, and the gaps — under the map, in the business reader's words. */
export function FitMapLists({ entries }: { entries: readonly FitEntry[] }) {
  const givenUp = entries.filter((e) => e.disposition === 'given-up');
  const gaps = entries.filter((e) => e.disposition === 'gap-open' || e.disposition === 'gap-key-user' || e.disposition === 'gap-organisational' || e.disposition === 'unknown');
  const row = (e: FitEntry) => (
    <li key={e.elementId} data-fit-map-row={e.elementId} className="flex flex-col gap-1">
      <span className="flex flex-wrap items-center gap-2">
        <FitDispositionMark disposition={e.disposition} />
        <span className="text-[13px] font-semibold text-cc-ink">{e.plainLabel ?? e.label}</span>
        <span className="font-mono text-[12px] text-cc-ink-muted">{lines(e.anchor)}</span>
      </span>
      <span className="text-[12px] leading-snug text-cc-ink-muted">{e.why}</span>
    </li>
  );
  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
      <section aria-labelledby="fit-map-given-up" data-fit-map-list="given-up" className="flex min-w-0 flex-col gap-2">
        <h3 id="fit-map-given-up" className="m-0 cc-text-h3 text-cc-ink">Given up — greyed on the map</h3>
        {givenUp.length > 0 ? <ul className="m-0 flex list-none flex-col gap-2 p-0">{givenUp.map(row)}</ul> : <p className="m-0 text-[13px] text-cc-ink-muted">Nothing is given up in this design.</p>}
      </section>
      <section aria-labelledby="fit-map-gaps" data-fit-map-list="gaps" className="flex min-w-0 flex-col gap-2">
        <h3 id="fit-map-gaps" className="m-0 cc-text-h3 text-cc-ink">Still a gap — marked on the map</h3>
        {gaps.length > 0 ? <ul className="m-0 flex list-none flex-col gap-2 p-0">{gaps.map(row)}</ul> : <p className="m-0 text-[13px] text-cc-ink-muted">No gap remains in this design.</p>}
      </section>
    </div>
  );
}

/** The map of the design: the as-is with the given-up steps greyed, the gaps named and the bridges drawn. */
export function FitMapCanvas({ map, entries }: { map: FitMap; entries: readonly FitEntry[] }) {
  const [plane, setPlane] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const parsed = useMemo(() => parseBpmn(map.xml), [map.xml]);
  const byNode = useMemo(() => new Map(entries.map((e) => [e.elementId, e])), [entries]);
  const nodes = useMemo(() => {
    const out = new Map<string, BpmnCanvasNode>();
    for (const el of parsed.elements) {
      const t = el.trace;
      const anchor = t && t.lineStart !== null && t.lineEnd !== null ? (t.lineEnd > t.lineStart ? `L${t.lineStart}–${t.lineEnd}` : `L${t.lineStart}`) : null;
      const d = map.disposition[el.id];
      out.set(el.id, {
        accessibleName: `${el.name}${d ? `, ${FIT_DISPOSITION_LABELS[d].label}` : ''}${anchor ? `, ${anchor}` : ', Unanchored'}`,
        unanchored: anchor === null,
        unanchoredLabel: 'Unanchored',
        anchor,
      });
    }
    return out;
  }, [parsed, map.disposition]);
  const givenUp = useMemo(() => new Set(map.givenUp), [map.givenUp]);
  // Everything but the given-up steps stays lit: the given-up ones step back to grey.
  const lit = useMemo(() => new Set(parsed.elements.map((e) => e.id).filter((id) => !givenUp.has(id))), [parsed, givenUp]);
  const chosen = active ? byNode.get(map.elementNode[active] ?? '') ?? null : null;
  return (
    <div data-fit-map="" className="flex min-w-0 flex-col gap-3">
      <BpmnCanvas
        xml={map.xml}
        label={`The fit-to-standard design on the process map: ${map.givenUp.length} step${map.givenUp.length === 1 ? '' : 's'} given up, ${map.bridges.length} bridge${map.bridges.length === 1 ? '' : 's'}.`}
        nodes={nodes}
        plane={plane}
        onPlaneChange={setPlane}
        active={active}
        onActivate={setActive}
        onActiveChange={setActive}
        focusToken={0}
        onKeyDown={() => {}}
        lit={lit}
        excluded={givenUp}
        controls
        openFit="whole"
        tools={plane !== null ? <CcButton onClick={() => setPlane(null)}>Top level</CcButton> : null}
      />
      {chosen ? (
        <p data-fit-map-chosen={chosen.elementId} className="m-0 flex flex-wrap items-center gap-2 text-[13px] text-cc-ink">
          <FitDispositionMark disposition={chosen.disposition} />
          <span className="font-semibold">{chosen.plainLabel ?? chosen.label}</span>
          <span className="font-mono text-[12px] text-cc-ink-muted">{lines(chosen.anchor)}</span>
          <span className="text-cc-ink-muted">{chosen.why}</span>
        </p>
      ) : null}
    </div>
  );
}

/**
 * "As is / Fit to standard" over the Business view's process map — roadmap
 * 3.0.20, F4 (owner decision 21.10.2026). Shown only where a fit-to-standard
 * design exists for the current run (the stored one, or the engine's where the
 * gate offers); otherwise the as-is map stands alone, as before. The mode is a
 * reading choice of this screen, never stored.
 */
export default function FitMapMode({
  projectId,
  project,
  source,
  fileName,
  processName,
  children,
}: {
  projectId: string;
  project: Project | null;
  source: string;
  fileName: string;
  processName: string;
  /** The as-is map, drawn as it was. */
  children: React.ReactNode;
}) {
  const { fit } = useFitToStandard(projectId, project);
  const design = fit.phase === 'ready' ? fit.value.design : null;
  const stored = fit.phase === 'ready' ? fit.value.stored : null;
  const [mode, setMode] = useState<FitMapModeValue>('as-is');
  const [map, setMap] = useState<{ key: string; map: FitMap } | null>(null);
  const entries = useMemo(() => design?.entries ?? [], [design]);
  const key = useMemo(() => fitMapKey(source, fileName, processName, entries), [source, fileName, processName, entries]);

  useEffect(() => {
    if (mode !== 'fit' || entries.length === 0 || map?.key === key) return;
    let live = true;
    // Read once more from the signed source, after the switch is drawn — never on the way in.
    const timer = window.setTimeout(() => {
      void import('@/lib/fit-to-standard-map').then((m) => {
        if (!live) return;
        setMap({ key, map: m.buildFitMap(source, entries, { processName, sourceFileName: fileName }) });
      });
    }, 0);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [mode, entries, key, map?.key, source, processName, fileName]);

  return (
    <FitMapModeView mode={mode} onMode={setMode} design={design} stored={stored} map={map && map.key === key ? map.map : null}>
      {children}
    </FitMapModeView>
  );
}

/** The switch and the two modes, without the reading — what the specs render. */
export function FitMapModeView({
  mode,
  onMode,
  design,
  stored,
  map,
  children,
}: {
  mode: FitMapModeValue;
  onMode: (mode: FitMapModeValue) => void;
  design: Pick<FitToStandardDesign, 'entries' | 'againstGate'> | null;
  stored: { stale: boolean; kind: string } | null;
  /** The drawn map of the design, once read; `null` while it is being read. */
  map: FitMap | null;
  children: React.ReactNode;
}) {
  const entries = design?.entries ?? [];
  if (!design || entries.length === 0) return <>{children}</>;
  const confirmed = !!stored && !stored.stale && stored.kind === 'confirmation';
  const setMode = onMode;
  return (
    <div data-fit-map-mode={mode} className="flex min-w-0 flex-col gap-3">
      <div className="cc-no-print flex flex-wrap items-center gap-3">
        <CcSegmentedControl label="Process map" segments={MODE_SEGMENTS} value={mode} onChange={setMode} />
        {mode === 'fit' ? <CcProvenanceChip value={confirmed ? 'confirmed' : 'reconstructed'} note={confirmed ? 'confirmed by you' : 'not confirmed'} /> : null}
      </div>
      {mode === 'as-is' ? (
        children
      ) : (
        <div data-fit-map-view="" className="flex min-w-0 flex-col gap-4">
          <p data-fit-header="" className="m-0 text-[13px] leading-snug text-cc-ink">{FIT_DESIGN_HEADER}</p>
          {design.againstGate ? (
            <p data-fit-against-gate="" className="m-0 text-[13px] leading-snug text-cc-ink-muted">{design.againstGate.sentence}</p>
          ) : null}
          <p className="m-0 text-[12px] text-cc-ink-muted">
            Grey and dashed: given up. Named on the step: what it becomes — a gap, a standard candidate, configuration. A flow named &ldquo;Bridge — standard&rdquo; goes around a step that is given up.
          </p>
          {map ? (
            <FitMapCanvas map={map} entries={entries} />
          ) : (
            <p data-fit-map-loading="" className="m-0 text-[13px] text-cc-ink-muted">Drawing the fit-to-standard design on the map…</p>
          )}
          <FitMapLists entries={entries} />
        </div>
      )}
    </div>
  );
}
