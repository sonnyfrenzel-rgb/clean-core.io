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
 *
 * **Orientation first** (owner, 01.10.2026: "one must always know which level
 * one is on and how to find one's way"): the bar says the level ("Level 2 of
 * 3"), the path in the names the map uses, and offers the way back to the
 * overview; a row of phases shows where this level sits in the whole process; a
 * short legend says what the plus and the line anchor mean. A level wider than
 * the box says so at its right edge. Names are plain language by default; the
 * code's own names are one switch away ("Technical names").
 */

export interface ExplorerPlane {
  id: string;
  label: string;
  /** The plane's name in the Technical names view. */
  technicalLabel?: string;
  parent: string | null;
  anchor: string | null;
  map: ReactNode;
  steps: ReactNode;
  technicalMap?: ReactNode;
  technicalSteps?: ReactNode;
}

export default function ProcessExplorer({ planes, rootId, program, sub }: { planes: ExplorerPlane[]; rootId: string; program: string; sub: ReactNode }) {
  const [current, setCurrent] = useState(rootId);
  const [view, setView] = useState<'map' | 'steps'>('map');
  const [technical, setTechnical] = useState(false);
  const [more, setMore] = useState(false);
  const byId = new Map(planes.map((p) => [p.id, p]));
  const hostRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasTechnical = planes.some((p) => p.technicalMap);

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

  // A level wider than the box says so at its right edge.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const check = () => setMore(el.scrollWidth - el.scrollLeft - el.clientWidth > 8);
    check();
    el.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    return () => {
      el.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
    };
  }, [current, view, technical]);

  const go = (id: string) => {
    moved.current = true;
    setCurrent(id);
  };

  const nameOf = (p: ExplorerPlane) => (technical ? (p.technicalLabel ?? p.label) : p.label);
  const trail: ExplorerPlane[] = [];
  for (let p = byId.get(current); p; p = p.parent ? byId.get(p.parent) : undefined) trail.unshift(p);
  const here = byId.get(current) ?? planes[0];
  const depthOf = (p: ExplorerPlane): number => (p.parent && byId.get(p.parent) ? 1 + depthOf(byId.get(p.parent) as ExplorerPlane) : 1);
  const levels = Math.max(...planes.map(depthOf));
  const phases = planes.filter((p) => p.parent === rootId);
  const phaseHere = trail[1]?.id ?? null;

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
        <span className="lvl" data-explorer-level="">
          Level {trail.length} of {levels}
        </span>
        <nav className="crumb" aria-label="Map level">
          {trail.map((p, i) => (
            <span key={p.id} className="crumb-step">
              {i > 0 && <ChevronRight className="i" aria-hidden="true" />}
              {i < trail.length - 1 ? (
                <button type="button" onClick={() => go(p.id)} className="crumb-link">
                  {i === 0 ? program : nameOf(p)}
                </button>
              ) : i === 0 ? (
                <>
                  <b>{program}</b>
                  <ChevronRight className="i" aria-hidden="true" />
                  <span aria-current="location">Overview</span>
                </>
              ) : (
                <b aria-current="location">{nameOf(p)}</b>
              )}
            </span>
          ))}
          {here.anchor && <span className="sub">called at {here.anchor}</span>}
        </nav>
        {here.parent && (
          <button type="button" onClick={() => go(rootId)} className="wbtn">
            Back to overview
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
          {hasTechnical && (
            <span className="segb" role="group" aria-label="Names">
              <button type="button" data-explorer-technical="" aria-pressed={technical} onClick={() => setTechnical((was) => !was)}>
                Technical names
              </button>
            </span>
          )}
        </span>
      </div>
      {phases.length > 0 && (
        <nav className="phase-row" aria-label="Phases of the process">
          <span className="k">Phases</span>
          {phases.map((p) => {
            const at = p.id === phaseHere;
            return (
              <button key={p.id} type="button" onClick={() => go(p.id)} aria-current={at ? 'true' : undefined} className={`wbtn${at ? ' primary' : ''}`}>
                {nameOf(p)}
                {at ? <span className="sr-only"> (you are here)</span> : null}
              </button>
            );
          })}
        </nav>
      )}
      <p className="kbdhint flow-help">
        {view === 'map' ? (
          <>
            <span className="mk" aria-hidden="true">+</span> opens a phase in place · <span className="anc">L182</span> the line the step was read from ·
            Enter or click opens, Escape goes one level up · Steps shows the same content as a list
          </>
        ) : (
          'The same level as a list, in the order the map draws it. A phase opens in place.'
        )}
      </p>
      {planes.map((p) => (
        <div key={p.id} hidden={p.id !== here.id} data-plane-host={p.id} tabIndex={-1} role="group" aria-label={p.id === rootId ? 'Overview' : nameOf(p)} className="plane-host">
          {view === 'map' ? (
            <div className="flow-wrap">
              <div ref={p.id === here.id ? scrollRef : undefined} className="flow-canvas">
                {technical && p.technicalMap ? p.technicalMap : p.map}
              </div>
              {p.id === here.id && more ? <span className="flow-more" aria-hidden="true">more →</span> : null}
            </div>
          ) : (
            <div className="flow-steps">{technical && p.technicalSteps ? p.technicalSteps : p.steps}</div>
          )}
        </div>
      ))}
    </div>
  );
}
