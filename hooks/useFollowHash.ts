'use client';

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { BUSINESS_MAP_ID } from '@/lib/business-layers';
import { originOf } from '@/lib/choice-addresses';

/** Sent before the follow waits for its place: `detail.id` names it, so a closed tab or fold can open (`useRevealOnHash`). */
export const REVEAL_EVENT = 'cc:reveal';

const PLACE_ID = /^[A-Za-z][\w-]{0,63}$/;

/**
 * A link that names a place on the workspace — `?view=it#not-determined`,
 * `?view=business#business-rules` — arrives before that place exists: the
 * view reads the project, the run and the findings first, so the browser's own
 * jump to the fragment finds nothing and the reader stays at the top of the
 * page. The decision card's open conditions link to exactly such places
 * (ADR-085), so this waits for the element, brings it into view, and holds it
 * there until the blocks above it have stopped growing (about half a second
 * without a move), at most five seconds. A scroll, a touch, a key or a
 * pointer press by the reader ends it at once. The press matters as much as
 * the scroll: a layer tab sets `#evidence` and the reader then works in the
 * map above it — a step chosen, the full source opened — and every block that
 * grows there moved the section, which the follow brought back to the top,
 * scrolling the reader's own lines out of view (CI 38051799180). A press on a
 * link to a place ends the old follow and its `hashchange` starts the new one.
 *
 * Nothing is stored and nothing is selected: the fragment stays the address
 * bar's, as the layer's does (ADR-018). The process map has its own follower
 * in the shell, so its id is left to it.
 *
 * Every choice has one address (`lib/choice-addresses.ts`, owner 11.10.2026),
 * and three things follow from that here:
 *
 *   - **A new address on the same page is followed too.** A link from one view
 *     to another (`?view=it` → `?view=management#decision-card`) is a client
 *     navigation: no load, no `hashchange`. The follow starts again when the
 *     query changes and the fragment is a new one, or the address names an
 *     origin (a choice's link). A view switch that keeps its subject fragment
 *     (`#L42`) is not followed: the new view opens at its top.
 *   - **A hidden place is asked to show itself first.** Before waiting, the
 *     follow sends `cc:reveal` with the id, so a tab, a fold or an editing
 *     mode that holds the place can open (`hooks/useRevealOnHash.ts`).
 *   - **An arrival by a choice's link takes the focus.** Once the place has
 *     settled (half a second still, or the five-second cap) and the reader has
 *     not taken over, the control in it marked `data-choice-focus` — else the
 *     place itself — takes the focus without scrolling, and the place is marked
 *     `data-arrived`. Only where the address carries an origin: a layer tab or an
 *     anchor bar keeps the focus where the reader's keys put it.
 */
export function useFollowHash(): void {
  const search = useSearchParams()?.toString() ?? '';
  const followRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    let frame = 0;
    let stop = true;
    const end = () => {
      stop = true;
    };
    const idOf = (): string | null => {
      let id = window.location.hash.slice(1);
      try {
        id = decodeURIComponent(id);
      } catch {
        return null;
      }
      return PLACE_ID.test(id) && id !== BUSINESS_MAP_ID ? id : null;
    };
    // The fragment the last follow started for, so a query change that keeps it is not a new arrival.
    let lastHash: string | null = null;
    const arrive = (target: HTMLElement) => {
      if (!originOf(window.location.search)) return;
      const control = target.querySelector<HTMLElement>('[data-choice-focus]') ?? target;
      if (control === target && !target.hasAttribute('tabindex') && target.tabIndex < 0) target.tabIndex = -1;
      control.focus({ preventScroll: true });
      if (!target.hasAttribute('data-arrived')) target.setAttribute('data-arrived', '');
    };
    const follow = () => {
      window.cancelAnimationFrame(frame);
      lastHash = window.location.hash;
      const id = idOf();
      if (!id) {
        stop = true;
        return;
      }
      stop = false;
      window.dispatchEvent(new CustomEvent(REVEAL_EVENT, { detail: { id } }));
      const started = performance.now();
      let lastTop: number | null = null;
      // Where the target stood in the document, and where the page was scrolled
      // to, right after the last bring-into-view. A page that has moved while
      // the target has not was scrolled by the reader — by the scrollbar too,
      // which sends no wheel, touch or key (QA d29f4fcf9481) — and ends it.
      let lastDocTop = 0;
      let lastScrollY = 0;
      // The page moves by itself too, and that is not the reader (roadmap, "a
      // same-page choice link settles short of its place"; `tests/choice-walk.spec.ts`
      // measured the decision card ~26 px above the viewport): a block inside the
      // place grows above the node the browser anchors to, and the browser scrolls
      // by the growth; or the page ends below the place and is clamped when it
      // shrinks. Either moves the page by no more than the place and the page
      // changed in height since the last bring-into-view. And a place the last
      // bring-into-view could not reach — the page ended first — is brought again
      // once the page has grown.
      let lastHeight = 0;
      let lastDocHeight = 0;
      let lastClamped = false;
      let stillSince = started;
      const tick = (now: number) => {
        if (stop || idOf() !== id) return;
        if (now - started > 5000) {
          const late = document.getElementById(id);
          if (late) arrive(late);
          return;
        }
        const target = document.getElementById(id);
        if (target) {
          const box = target.getBoundingClientRect();
          const top = Math.round(box.top);
          const docTop = Math.round(top + window.scrollY);
          const docHeight = document.documentElement.scrollHeight;
          // The page moved by more, or less, than the target did: only the reader
          // does that. Growth above moves both by the same amount (scroll
          // anchoring) or only the target; a drag while the target is still
          // moving moves both by different amounts (QA 2c33889165f6) — unless the
          // difference is no more than the place and the page changed in height,
          // which is the browser's own move (see above).
          const scrolled = window.scrollY - lastScrollY;
          const unexplained = Math.abs(scrolled - (docTop - lastDocTop));
          const resized = Math.abs(box.height - lastHeight) + Math.abs(docHeight - lastDocHeight);
          if (lastTop !== null && Math.abs(scrolled) > 1 && unexplained > 1 && unexplained > resized + 1) return;
          if (lastTop === null || Math.abs(top - lastTop) > 1 || (lastClamped && docHeight !== lastDocHeight)) {
            target.scrollIntoView({ block: 'start' });
            lastTop = Math.round(target.getBoundingClientRect().top);
            lastScrollY = window.scrollY;
            lastDocTop = Math.round(lastTop + lastScrollY);
            lastHeight = target.getBoundingClientRect().height;
            lastDocHeight = document.documentElement.scrollHeight;
            lastClamped = lastTop > 1 && window.scrollY + window.innerHeight >= lastDocHeight - 1;
            stillSince = now;
          } else if (now - stillSince > 500) {
            arrive(target);
            return;
          }
        }
        frame = window.requestAnimationFrame(tick);
      };
      frame = window.requestAnimationFrame(tick);
    };
    follow();
    followRef.current = () => {
      if (window.location.hash !== lastHash || originOf(window.location.search)) follow();
    };
    window.addEventListener('hashchange', follow);
    window.addEventListener('wheel', end, { passive: true });
    window.addEventListener('touchmove', end, { passive: true });
    window.addEventListener('keydown', end);
    window.addEventListener('pointerdown', end, { passive: true });
    return () => {
      stop = true;
      followRef.current = null;
      window.cancelAnimationFrame(frame);
      window.removeEventListener('hashchange', follow);
      window.removeEventListener('wheel', end);
      window.removeEventListener('touchmove', end);
      window.removeEventListener('keydown', end);
      window.removeEventListener('pointerdown', end);
    };
  }, []);

  // A client navigation changed the query: follow the new address, if it is one.
  // The first run is the mount, which the effect above has followed already.
  const seen = useRef(search);
  useEffect(() => {
    if (seen.current === search) return;
    seen.current = search;
    followRef.current?.();
  }, [search]);
}
