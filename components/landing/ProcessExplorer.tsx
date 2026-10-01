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
 *
 * **Orientation first** (owner, 01.10.2026: "one must always know which level
 * one is on and how to find one's way"): the toolbar says the level ("Level 2
 * of 3"), the path in the names the map uses, and offers the way back; a row of
 * phases shows where this level sits in the whole process; a two-item legend
 * says what the plus and the line anchor mean. A level wider than the box says
 * so at its right edge rather than being cut off silently.
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

export default function ProcessExplorer({ planes, rootId, program }: { planes: ExplorerPlane[]; rootId: string; program?: string }) {
  const [current, setCurrent] = useState(rootId);
  const [view, setView] = useState<'map' | 'steps'>('map');
  const [technical, setTechnical] = useState(false);
  const [more, setMore] = useState(false);
  const byId = new Map(planes.map((p) => [p.id, p]));
  const hostRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const moved = useRef(false);
  const hasTechnical = planes.some((p) => p.technicalMap);

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

  const nameOf = (p: ExplorerPlane) => (p.id === rootId ? 'Overview' : technical ? (p.technicalLabel ?? p.label) : p.label);
  const trail: ExplorerPlane[] = [];
  for (let p = byId.get(current); p; p = p.parent ? byId.get(p.parent) : undefined) trail.unshift(p);
  const here = byId.get(current) ?? planes[0];
  const depthOf = (p: ExplorerPlane): number => (p.parent ? 1 + depthOf(byId.get(p.parent) as ExplorerPlane) : 1);
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
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cc-line px-4 py-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p data-explorer-level className="m-0 text-xs font-semibold uppercase tracking-[0.06em] text-cc-ink-muted">
            Level {trail.length} of {levels}
            {here.anchor ? <span className="font-cc-mono normal-case tracking-normal"> · called at {here.anchor}</span> : null}
          </p>
          <nav aria-label="Level of the process" className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            {program ? <span className="font-cc-mono text-xs text-cc-ink-muted">{program}</span> : null}
            {trail.map((p, i) => (
              <span key={p.id} className="flex items-center gap-2">
                {(i > 0 || program) && <span aria-hidden="true" className="text-cc-ink-muted">›</span>}
                {i < trail.length - 1 ? (
                  <button type="button" onClick={() => go(p.id)} className={`${technical ? 'font-cc-mono' : ''} font-semibold text-cc-brand-strong underline underline-offset-4`}>
                    {nameOf(p)}
                  </button>
                ) : (
                  <span aria-current="location" className={`${technical ? 'font-cc-mono' : ''} font-semibold text-cc-ink`}>
                    {nameOf(p)}
                  </span>
                )}
              </span>
            ))}
          </nav>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {here.parent && (
            <button type="button" onClick={() => go(rootId)} className={publicButton('ghost', 'sm')}>
              Back to overview
            </button>
          )}
          {here.parent && here.parent !== rootId && (
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
          {hasTechnical && (
            <button
              type="button"
              data-explorer-technical=""
              aria-pressed={technical}
              onClick={() => setTechnical((was) => !was)}
              className={publicButton(technical ? 'primary' : 'ghost', 'sm')}
            >
              Technical names
            </button>
          )}
        </div>
      </div>

      {phases.length > 0 && (
        <nav aria-label="Phases of the process" className="flex gap-2 overflow-x-auto border-b border-cc-line px-4 py-2">
          <span className="shrink-0 self-center pr-1 text-xs font-semibold text-cc-ink-muted">Phases:</span>
          {phases.map((p) => {
            const at = p.id === phaseHere;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => go(p.id)}
                aria-current={at ? 'true' : undefined}
                className={`shrink-0 ${technical ? 'font-cc-mono' : ''} ${publicButton(at ? 'primary' : 'ghost', 'sm')}`}
              >
                {nameOf(p)}
                {at ? <span className="sr-only"> (you are here)</span> : null}
              </button>
            );
          })}
        </nav>
      )}

      <p data-explorer-legend className="m-0 flex flex-wrap items-center gap-x-4 gap-y-1 px-4 pt-3 text-xs font-medium text-cc-ink-muted">
        {view === 'map' ? (
          <>
            <span className="inline-flex items-center gap-2">
              <span aria-hidden="true" className="inline-flex h-4 w-4 items-center justify-center rounded-sm border border-cc-ink-muted text-[11px] leading-none text-cc-ink">+</span>
              opens a phase — click it, or Tab to it and press Enter
            </span>
            <span className="inline-flex items-center gap-2">
              <span aria-hidden="true" className="font-cc-mono text-cc-ink">L182</span>
              the line in the code the step was read from
            </span>
            {here.parent ? <span>Esc goes one level up</span> : null}
          </>
        ) : (
          <span>The same level as a list, in the order the map draws it.</span>
        )}
      </p>
      {planes.map((p) => (
        <div key={p.id} hidden={p.id !== here.id} data-plane-host={p.id} tabIndex={-1} role="group" aria-label={nameOf(p)} className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cc-focus">
          {view === 'map' ? (
            <div className="relative">
              <div ref={p.id === here.id ? scrollRef : undefined} className="overflow-x-auto p-2">
                {technical && p.technicalMap ? p.technicalMap : p.map}
              </div>
              {p.id === here.id && more ? (
                <span aria-hidden="true" className="pointer-events-none absolute inset-y-2 right-0 flex items-center bg-gradient-to-l from-cc-surface via-cc-surface to-transparent pl-8 pr-3 text-xs font-semibold text-cc-ink-muted">
                  more →
                </span>
              ) : null}
            </div>
          ) : (
            <div className="p-4">
              {technical && p.technicalSteps ? p.technicalSteps : p.steps}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
