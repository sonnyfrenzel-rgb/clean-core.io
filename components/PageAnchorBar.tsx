'use client';

import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { nav } from '@/lib/messages/navigation';
import { currentAnchorKey, PAGE_ANCHOR_MAX, type AnchorRect, type PageAnchor } from '@/lib/page-anchors';

export type { PageAnchor } from '@/lib/page-anchors';

/**
 * "On this page" — one bar on every tool (ADR-126 (3), owner 15.11.2026: "die bekannte 'On this page' muss auf allen
 * Tools gleich sein und besser lesbar sein"; before it ADR-086 and ADR-091). One component so no tool can draw its
 * own; which sections each names, by which id, is `lib/page-anchors.ts` (IT: `lib/it-sections.ts`; Documentation:
 * the outline's chapters).
 *
 * The spec, as the family mock-ups draw it (sizes from `DESIGN.md` §1.2):
 *
 *   - a **48 px sticky white strip** under the shell bar, a rule and a soft shadow under it, reaching to the edges of
 *     the page's frame (its gutter included), 24 px above and below;
 *   - the label **"On this page"** in sentence case, 13 px / 600, muted — the component says it, a page cannot;
 *   - the items **15 px in full ink**, 500, the current one 600 with a **3 px bar** under it in the brand ink
 *     (`aria-current="location"`); a hover shows the bar faintly;
 *   - **at most six items** (`PAGE_ANCHOR_MAX`), in page order; a bar handed more names the first six;
 *   - **counts as quiet badges**: grey, amber only for open questions (`tone: 'open'`);
 *   - **one optional primary action** at the right end (`action`), hidden on a phone;
 *   - on a phone the label steps back and the items are **one horizontal row** that scrolls sideways, with a fade on
 *     the edge where more items wait;
 *   - a click jumps to the section and **moves the focus to its heading**, so a keyboard or screen-reader user goes
 *     on reading there;
 *   - **hidden when the page has only one section** (owner, 15.11.2026).
 *
 * Where the reader is follows the scroll — the section the reading line runs through, the main column's where two
 * do — and a click marks its target at once. Where it stands is the same on every tool (ADR-091): under the header
 * and the answer, before the first section, in an element that runs to the foot of the page, so it stays in view to
 * the last section it names. `tests/page-anchor-guard.spec.ts` holds the ids and the place, and
 * `tests/workflow-style-guard.spec.ts` the rendered place.
 *
 * `name` keeps each bar's own data attributes (`data-it-anchor`, `data-doc-chapter`, `data-analyze-anchor`…) for the
 * specs and the screenshots that find it by them; `data-page-anchors` is on every bar. `onJump` lets a page scroll
 * instead of navigating, where the fragment is taken by something else (the Documentation stage keeps the map's
 * level in the address).
 */
export default function PageAnchorBar({
  anchors: given,
  label,
  name,
  plural,
  onJump,
  action,
  className,
}: {
  anchors: readonly PageAnchor[];
  /** The bar's accessible name. */
  label: string;
  /** `data-<name>` on each link, `data-<plural>` on the bar. */
  name: string;
  plural: string;
  onJump?: (event: React.MouseEvent<HTMLAnchorElement>, anchor: PageAnchor) => void;
  /** The one primary action at the right end of the bar (a `CcButton`/`CcLinkButton`). */
  action?: React.ReactNode;
  className?: string;
}) {
  const anchors = given.slice(0, PAGE_ANCHOR_MAX);
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
      // left. Before the first section, none; in a part of the page the bar
      // does not name, none — not the last section passed (owner 16.10.2026:
      // the Documentation stage's RACI marked "Open questions").
      const rects: AnchorRect[] = [];
      for (const { key, target } of list) {
        const el = document.getElementById(target);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        rects.push({ key, top: r.top, bottom: r.bottom, left: r.left });
      }
      setCurrent(currentAnchorKey(rects, LINE));
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

  // Sideways overflow of the item row: a fade on the edge where more items wait (a phone, a long bar).
  const rowRef = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState<{ start: boolean; end: boolean }>({ start: false, end: false });
  useEffect(() => {
    const row = rowRef.current;
    if (!row || typeof window === 'undefined') return;
    const read = () => {
      const more = row.scrollWidth - row.clientWidth > 1;
      setEdges({ start: more && row.scrollLeft > 1, end: more && row.scrollLeft + row.clientWidth < row.scrollWidth - 1 });
    };
    read();
    row.addEventListener('scroll', read, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(read);
    observer?.observe(row);
    return () => {
      row.removeEventListener('scroll', read);
      observer?.disconnect();
    };
  }, [keys]);

  // One section is not a page to navigate (owner, 15.11.2026): no bar.
  if (anchors.length < 2) return null;
  // The fade is a utility of `app/globals.css` (`cc-fade-*`): no colour or gradient literal in a component.
  const fade = edges.start && edges.end ? 'cc-fade-both' : edges.end ? 'cc-fade-end' : edges.start ? 'cc-fade-start' : undefined;
  return (
    <nav
      aria-label={label}
      data-page-anchors=""
      {...{ [`data-${plural}`]: '' }}
      className={cn(
        'cc-no-print sticky top-14 z-cc-sticky my-6 flex h-12 items-center gap-3 border-b border-cc-line bg-cc-surface',
        // To the edges of the frame, gutter included: the main column's padding, given back as the bar's own.
        '-mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 shadow-[var(--cc-shadow-strip)] max-sm:pr-0',
        className,
      )}
    >
      <span aria-hidden={true} data-page-anchors-label="" className="shrink-0 cc-text-identifier whitespace-nowrap text-cc-ink-muted max-sm:hidden">
        {nav('nav.onThisPage')}
      </span>
      {/* `relative`: the track holds the links' `sr-only` tooltips (position: absolute) inside its scroll; without it
          they escape to the sticky bar and the page scrolls sideways on a phone. */}
      <ul
        ref={rowRef}
        data-page-anchors-row=""
        className={cn(
          'relative m-0 flex h-full min-w-0 flex-1 list-none flex-nowrap gap-1 overflow-x-auto p-0 [scrollbar-width:none] max-sm:pr-6 [&::-webkit-scrollbar]:hidden',
          fade,
        )}
      >
        {anchors.map((a) => {
          const on = a.key === current;
          return (
            <li key={a.key} className="flex h-full shrink-0">
              <a
                href={`#${a.target}`}
                title={a.title}
                {...{ [`data-${name}`]: a.key, [`data-${name}-state`]: on ? 'on' : 'off' }}
                aria-current={on ? 'location' : undefined}
                onClick={(event) => {
                  pinned.current = { key: a.key, at: Date.now(), y: null };
                  setCurrent(a.key);
                  onJump?.(event, a);
                  focusSectionHeading(a.target);
                }}
                className={cn(
                  'group relative inline-flex h-12 items-center gap-2 px-4 text-[15px] leading-none whitespace-nowrap text-cc-ink no-underline',
                  'focus-visible:rounded-cc-row focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-cc-focus',
                  on ? 'font-semibold' : 'font-medium',
                )}
              >
                <span>{a.label}</span>
                {a.count ? (
                  <span
                    {...{ [`data-${name}-count`]: '' }}
                    data-tone={a.tone ?? 'quiet'}
                    className={cn(
                      'rounded-full px-2 cc-text-meta leading-[18px] text-cc-ink tabular-nums',
                      a.tone === 'open' ? 'bg-cc-warning-bg' : 'bg-cc-surface-muted ring-1 ring-cc-line ring-inset',
                    )}
                  >
                    {a.count}
                  </span>
                ) : null}
                {a.title ? <span className="sr-only">{` — ${a.title}`}</span> : null}
                {/* The 3 px bar: full for the section being read, faint on hover. */}
                <span
                  aria-hidden={true}
                  className={cn(
                    'pointer-events-none absolute right-4 bottom-0 left-4 h-[3px] rounded-t-[2px] bg-cc-brand-strong',
                    on ? 'opacity-100' : 'opacity-0 group-hover:opacity-30',
                  )}
                />
              </a>
            </li>
          );
        })}
      </ul>
      {action ? (
        <span data-page-anchors-action="" className="ml-auto shrink-0 max-sm:hidden">
          {action}
        </span>
      ) : null}
    </nav>
  );
}

/**
 * After a jump the focus goes to the section's heading (ADR-126 (3)), not only the scroll: a keyboard or screen-reader
 * reader goes on reading there. The heading gets `tabindex="-1"` if it has none; `preventScroll`, because the jump
 * already placed it.
 */
function focusSectionHeading(target: string) {
  if (typeof window === 'undefined') return;
  window.requestAnimationFrame(() => {
    const section = document.getElementById(target);
    if (!section) return;
    const heading = (section.matches('h1,h2,h3,h4,summary') ? section : section.querySelector('h2, h3, h4, summary')) as HTMLElement | null;
    const el = heading ?? section;
    if (!el.hasAttribute('tabindex') && el.tagName !== 'SUMMARY') el.setAttribute('tabindex', '-1');
    el.focus({ preventScroll: true });
  });
}
