'use client';

import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/** One in-page jump of the bar: where it goes, what it is called, what is in it. */
export interface PageAnchor {
  key: string;
  /** The id of the section on the page — the link's fragment. */
  target: string;
  label: string;
  /** A count or a word ("none", "signed"); empty or null shows the label alone. */
  count?: string | null;
  /** The reader question the section answers — the chip's tooltip. */
  title?: string;
}

/**
 * The in-page anchor bar — first IT's (ADR-086), now also the Documentation
 * stage's chapter bar (owner review 10.10.2026: "like the IT view's anchor
 * bar"). One component so the two cannot drift apart.
 *
 * It looks like the layer bar (`components/workspace/LayerBar.tsx`) so the views
 * and the tools share one navigation strip: a delimited surface with its
 * eyebrow ("On this page"), a muted track, and the section the reader is in
 * raised with an ink ring and `aria-current="location"`. Links, not tabs: each
 * is a jump, so the WAI-ARIA tabs pattern of the layer bar does not apply.
 * Where the reader is follows the scroll — the section the reading line runs
 * through, the main column's where two do — and a click marks its target at
 * once. Sticky under the shell bar; on a phone the row scrolls sideways inside
 * its track and the page does not.
 *
 * `name` keeps each bar's own data attributes (`data-it-anchor`,
 * `data-doc-chapter`) for the specs and the screenshots that find it by them.
 * `onJump` lets a page scroll instead of navigating, where the fragment is
 * taken by something else (the Documentation stage keeps the map's level in
 * the address).
 */
export default function PageAnchorBar({
  anchors,
  label,
  lead,
  name,
  plural,
  onJump,
  className,
}: {
  anchors: readonly PageAnchor[];
  /** The bar's accessible name. */
  label: string;
  /** The eyebrow: "On this page". */
  lead: string;
  /** `data-<name>` on each link, `data-<plural>` on the bar. */
  name: string;
  plural: string;
  onJump?: (event: React.MouseEvent<HTMLAnchorElement>, anchor: PageAnchor) => void;
  className?: string;
}) {
  const [current, setCurrent] = useState<string | null>(null);
  /** A section the reader jumped to stays marked until they scroll away from where the jump landed. */
  const pinned = useRef<{ key: string; at: number; y: number | null } | null>(null);
  const keys = anchors.map((a) => `${a.key}=${a.target}`).join(' ');

  useEffect(() => {
    const list = keys ? keys.split(' ').map((pair) => { const [key, target] = pair.split('='); return { key, target }; }) : [];
    if (list.length === 0 || typeof window === 'undefined') return;
    // The line a section has to reach to count as the one being read: under
    // the shell bar and this bar, with a little room.
    const LINE = 160;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const pin = pinned.current;
      if (pin) {
        // The jump scrolls smoothly; while it runs, and until the reader moves
        // on from where it landed, the section they chose is the one marked.
        if (Date.now() - pin.at < 1000) {
          pin.y = window.scrollY;
          setCurrent(pin.key);
          return;
        }
        if (pin.y === null || Math.abs(window.scrollY - pin.y) < 80) {
          setCurrent(pin.key);
          return;
        }
        pinned.current = null;
      }
      // The section the line runs through; where two do (a side column beside
      // the main one on a wide screen), the main column's — the one further
      // left. Before the first section, none.
      let at: { key: string; left: number } | null = null;
      let passed: string | null = null;
      for (const { key, target } of list) {
        const el = document.getElementById(target);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (r.top > LINE) continue;
        passed = key;
        if (r.bottom > LINE && (!at || r.left < at.left)) at = { key, left: r.left };
      }
      setCurrent(at ? at.key : passed);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    // An observer per section says when one crosses the line; the scroll
    // listener covers sections taller than the screen, which cross nothing
    // while the reader is inside them.
    const observer =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(schedule, { rootMargin: `-${LINE}px 0px 0px 0px`, threshold: [0, 1] });
    for (const { target } of list) {
      const el = document.getElementById(target);
      if (el) observer?.observe(el);
    }
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('hashchange', schedule);
    schedule();
    return () => {
      observer?.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('hashchange', schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [keys]);

  if (anchors.length === 0) return null;
  return (
    <nav
      aria-label={label}
      {...{ [`data-${plural}`]: '' }}
      className={cn('cc-no-print sticky top-14 z-cc-sticky bg-cc-page py-2', className)}
    >
      <div className="flex min-w-0 items-center gap-2 rounded-cc-card border border-cc-line bg-cc-surface p-1 shadow-cc">
        <span
          aria-hidden={true}
          className="shrink-0 pl-2 text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase max-sm:hidden"
        >
          {lead}
        </span>
        {/* `relative`: the track holds the links' `sr-only` tooltips
            (position: absolute) inside its scroll; without it they escape to
            the sticky bar and the page scrolls sideways on a phone. */}
        <ul className="relative m-0 flex min-w-0 flex-1 list-none flex-nowrap gap-1 overflow-x-auto rounded-cc-row bg-cc-surface-muted p-1 [scrollbar-width:thin] sm:flex-wrap">
          {anchors.map((a) => {
            const on = a.key === current;
            return (
              <li key={a.key} className="shrink-0">
                <a
                  href={`#${a.target}`}
                  title={a.title}
                  {...{ [`data-${name}`]: a.key, [`data-${name}-state`]: on ? 'on' : 'off' }}
                  aria-current={on ? 'location' : undefined}
                  onClick={(event) => {
                    pinned.current = { key: a.key, at: Date.now(), y: null };
                    setCurrent(a.key);
                    onJump?.(event, a);
                  }}
                  className={cn(
                    'group inline-flex items-stretch rounded-cc-row text-[13px] whitespace-nowrap text-cc-ink no-underline pointer-coarse:min-h-11',
                    'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cc-focus',
                    on ? 'font-bold' : 'font-semibold',
                  )}
                >
                  {/* The raised surface sits on an inner span, as in the layer
                      bar: the link keeps no surface of its own (§1.5). */}
                  <span
                    className={cn(
                      'inline-flex w-full items-center gap-2 rounded-cc-row px-3 py-1',
                      on ? 'bg-cc-surface shadow-cc ring-1 ring-cc-ink' : 'group-hover:bg-cc-surface',
                    )}
                  >
                    <span>{a.label}</span>
                    {a.count ? (
                      <span
                        {...{ [`data-${name}-count`]: '' }}
                        className={cn(
                          'rounded-full border px-2 text-[11px] leading-[18px] font-semibold tabular-nums',
                          on ? 'border-cc-ink text-cc-ink' : 'border-cc-line bg-cc-surface text-cc-ink-muted',
                        )}
                      >
                        {a.count}
                      </span>
                    ) : null}
                    {a.title ? <span className="sr-only">{` — ${a.title}`}</span> : null}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
