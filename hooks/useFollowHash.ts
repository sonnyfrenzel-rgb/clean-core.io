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
 * without a move), at most five seconds. A scroll, a touch or a key by the
 * reader ends it at once.
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
      let stillSince = started;
      const tick = (now: number) => {
        if (stop || idOf() !== id || now - started > 5000) return;
        const target = document.getElementById(id);
        if (target) {
          const top = Math.round(target.getBoundingClientRect().top);
          if (lastTop === null || Math.abs(top - lastTop) > 1) {
            target.scrollIntoView({ block: 'start' });
            lastTop = Math.round(target.getBoundingClientRect().top);
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
    return () => {
      stop = true;
      window.cancelAnimationFrame(frame);
      window.removeEventListener('hashchange', follow);
      window.removeEventListener('wheel', end);
      window.removeEventListener('touchmove', end);
      window.removeEventListener('keydown', end);
    };
  }, []);
}
