'use client';

import { useEffect } from 'react';
import { BUSINESS_MAP_ID } from '@/lib/business-layers';

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
 */
export function useFollowHash(): void {
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
    const follow = () => {
      window.cancelAnimationFrame(frame);
      const id = idOf();
      if (!id) {
        stop = true;
        return;
      }
      stop = false;
      const started = performance.now();
      let lastTop: number | null = null;
      // Where the target stood in the document, and where the page was scrolled
      // to, right after the last bring-into-view. A page that has moved while
      // the target has not was scrolled by the reader — by the scrollbar too,
      // which sends no wheel, touch or key (QA d29f4fcf9481) — and ends it.
      let lastDocTop = 0;
      let lastScrollY = 0;
      let stillSince = started;
      const tick = (now: number) => {
        if (stop || idOf() !== id || now - started > 5000) return;
        const target = document.getElementById(id);
        if (target) {
          const top = Math.round(target.getBoundingClientRect().top);
          const docTop = Math.round(top + window.scrollY);
          // The page moved by more, or less, than the target did: only the reader
          // does that. Growth above moves both by the same amount (scroll
          // anchoring) or only the target; a drag while the target is still
          // moving moves both by different amounts (QA 2c33889165f6).
          const scrolled = window.scrollY - lastScrollY;
          if (lastTop !== null && Math.abs(scrolled) > 1 && Math.abs(scrolled - (docTop - lastDocTop)) > 1) return;
          if (lastTop === null || Math.abs(top - lastTop) > 1) {
            target.scrollIntoView({ block: 'start' });
            lastTop = Math.round(target.getBoundingClientRect().top);
            lastScrollY = window.scrollY;
            lastDocTop = Math.round(lastTop + lastScrollY);
            stillSince = now;
          } else if (now - stillSince > 500) {
            return;
          }
        }
        frame = window.requestAnimationFrame(tick);
      };
      frame = window.requestAnimationFrame(tick);
    };
    follow();
    window.addEventListener('hashchange', follow);
    window.addEventListener('wheel', end, { passive: true });
    window.addEventListener('touchmove', end, { passive: true });
    window.addEventListener('keydown', end);
    window.addEventListener('pointerdown', end, { passive: true });
    return () => {
      stop = true;
      window.cancelAnimationFrame(frame);
      window.removeEventListener('hashchange', follow);
      window.removeEventListener('wheel', end);
      window.removeEventListener('touchmove', end);
      window.removeEventListener('keydown', end);
      window.removeEventListener('pointerdown', end);
    };
  }, []);
}
