'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

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

export default function ProcessExplorer({ planes, rootId, program, sub }: { planes: ExplorerPlane[]; rootId: string; program: string; sub: ReactNode }) {
  const [current, setCurrent] = useState(rootId);
  const [view, setView] = useState<'map' | 'steps'>('map');
  const byId = new Map(planes.map((p) => [p.id, p]));
  const hostRef = useRef<HTMLDivElement>(null);

  // On a phone the same content opens as the list of steps (landing mockup, phone).
  useEffect(() => {
    if (window.matchMedia('(max-width: 760px)').matches) setView('steps');
  }, []);
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
      <div className="flow-bar">
        <nav className="crumb" aria-label="Map level">
          {trail.map((p, i) => (
            <span key={p.id} className="crumb-step">
              {i > 0 && <ChevronRight className="i" aria-hidden="true" />}
              {i < trail.length - 1 ? (
                <button type="button" onClick={() => go(p.id)} className="crumb-link">
                  {i === 0 ? program : p.label}
                </button>
              ) : i === 0 ? (
                <>
                  <b>{program}</b>
                  <ChevronRight className="i" aria-hidden="true" />
                  <span aria-current="location">Overview</span>
                </>
              ) : (
                <b aria-current="location">{p.label}</b>
              )}
            </span>
          ))}
          {here.anchor && <span className="sub">called at {here.anchor}</span>}
        </nav>
        {here.parent && (
          <button type="button" onClick={() => go(here.parent as string)} className="wbtn">
            Close
          </button>
        )}
        <span className="sub">{sub}</span>
        <span className="r">
          <span className="segb" role="group" aria-label="Show as">
            <button type="button" aria-pressed={view === 'map'} onClick={() => setView('map')}>
              Map
            </button>
            <button type="button" aria-pressed={view === 'steps'} onClick={() => setView('steps')}>
              Steps
            </button>
          </span>
        </span>
      </div>
      <p className="kbdhint flow-help">
        {view === 'map'
          ? 'Tab into the map · Enter or click opens a phase in place · Escape closes it · Steps shows the same content as a list · wide levels scroll sideways'
          : 'The same level as a list, in the order the map draws it. A phase opens in place.'}
      </p>
      {planes.map((p) => (
        <div key={p.id} hidden={p.id !== here.id} data-plane-host={p.id} tabIndex={-1} role="group" aria-label={p.id === rootId ? 'Overview' : p.label} className="plane-host">
          {view === 'map' ? <div className="flow-canvas">{p.map}</div> : <div className="flow-steps">{p.steps}</div>}
        </div>
      ))}
    </div>
  );
}
