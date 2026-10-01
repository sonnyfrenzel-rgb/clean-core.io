'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import CcSegmentedControl from '@/components/cc/SegmentedControl';
import { publicButton } from '@/components/landing/public-button';

/**
 * The process map of the landing page, made navigable — roadmap 3.0.6,
 * section `process` of the landing mockup (mockups s12/s13).
 *
 * Every plane arrives already drawn: the server renders each one as SVG
 * (`BpmnPlaneSvg`) and its step list as HTML, and this component only chooses
 * which of them is visible. A collapsed sub-process carries `data-opens`; a
 * click, Enter or Space on it opens its plane in the same place, the path above
 * leads back, Escape goes one level up. No diagram library is loaded.
 */

export interface ExplorerPlane {
  id: string;
  label: string;
  parent: string | null;
  anchor: string | null;
  map: ReactNode;
  steps: ReactNode;
}

export default function ProcessExplorer({ planes, rootId }: { planes: ExplorerPlane[]; rootId: string }) {
  const [current, setCurrent] = useState(rootId);
  const [view, setView] = useState<'map' | 'steps'>('map');
  const byId = new Map(planes.map((p) => [p.id, p]));
  const hostRef = useRef<HTMLDivElement>(null);
  const moved = useRef(false);

  // The element that opened a level is hidden with the level it sat on; the
  // keyboard continues on the level that opened, not at the top of the page.
  useEffect(() => {
    if (!moved.current) return;
    hostRef.current?.querySelector<HTMLElement>(`[data-plane-host="${current}"]`)?.focus();
  }, [current]);

  const go = (id: string) => {
    moved.current = true;
    setCurrent(id);
  };

  const trail: ExplorerPlane[] = [];
  for (let p = byId.get(current); p; p = p.parent ? byId.get(p.parent) : undefined) trail.unshift(p);
  const here = byId.get(current) ?? planes[0];

  const open = (target: EventTarget | null) => {
    const el = (target as Element | null)?.closest?.('[data-opens]');
    const id = el?.getAttribute('data-opens');
    if (id && byId.has(id)) {
      go(id);
      return true;
    }
    return false;
  };

  const onClick = (e: MouseEvent) => {
    if (open(e.target)) e.preventDefault();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ' ') && open(e.target)) {
      e.preventDefault();
    } else if (e.key === 'Escape' && here.parent) {
      e.preventDefault();
      go(here.parent);
    }
  };

  return (
    <div ref={hostRef} data-process-explorer="" role="group" aria-label="Process map" onClick={onClick} onKeyDown={onKeyDown}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cc-line px-4 py-3">
        <nav aria-label="Level of the process" className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          {trail.map((p, i) => (
            <span key={p.id} className="flex items-center gap-2">
              {i > 0 && <span aria-hidden="true" className="text-cc-ink-muted">›</span>}
              {i < trail.length - 1 ? (
                <button type="button" onClick={() => go(p.id)} className="font-cc-mono font-semibold text-cc-brand-strong underline underline-offset-4">
                  {i === 0 ? 'Overview' : p.label}
                </button>
              ) : (
                <span aria-current="location" className="font-cc-mono font-semibold text-cc-ink">
                  {i === 0 ? 'Overview' : p.label}
                </span>
              )}
            </span>
          ))}
          {here.anchor && <span className="font-cc-mono text-xs text-cc-ink-muted">called at {here.anchor}</span>}
        </nav>
        <div className="flex items-center gap-2">
          {here.parent && (
            <button type="button" onClick={() => go(here.parent as string)} className={publicButton('ghost', 'sm')}>
              One level up
            </button>
          )}
          <CcSegmentedControl
            label="Show the process as"
            value={view}
            onChange={setView}
            segments={[
              { value: 'map' as const, label: 'Map' },
              { value: 'steps' as const, label: 'Steps' },
            ]}
          />
        </div>
      </div>
      <p className="px-4 pt-3 text-sm font-medium text-cc-ink-muted">
        {view === 'map'
          ? 'A step with a plus is a phase: click it, or Tab to it and press Enter, to open it here. Escape goes one level up. Wide levels scroll sideways.'
          : 'The same level as a list, in the order the map draws it.'}
      </p>
      {planes.map((p) => (
        <div key={p.id} hidden={p.id !== here.id} data-plane-host={p.id} tabIndex={-1} role="group" aria-label={p.id === rootId ? 'Overview' : p.label} className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cc-focus">
          {view === 'map' ? (
            <div className="overflow-x-auto p-2">
              {p.map}
            </div>
          ) : (
            <div className="p-4">
              {p.steps}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
