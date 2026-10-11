'use client';

import { useEffect, useRef } from 'react';
import { REVEAL_EVENT } from '@/hooks/useFollowHash';

const PLACE_ID = /^[A-Za-z][\w-]{0,63}$/;

/**
 * Opens what holds a place before the page goes there — a tab, a fold, an
 * editing mode — when the address names it (owner 11.10.2026: every choice
 * leads straight to its place; `lib/choice-addresses.ts`).
 *
 * The rule `components/workspace/ManagementFold.tsx` wrote for its one fold,
 * for any component: `match(id)` says whether the place is this component's
 * to open, `reveal(id)` opens it. It runs
 *
 *   - once on mount, for the address the page was opened with — a component
 *     that renders late, after the project is read, still hears of it;
 *   - on `hashchange`, for a link to a place on the same page;
 *   - on `cc:reveal`, which `useFollowHash` sends before it waits for the
 *     place — the only signal a client navigation to a new query gives.
 *
 * `reveal` may run more than once for one arrival (a `hashchange` and the
 * follow's `cc:reveal`), so it must be idempotent: open, never toggle. The
 * scroll is the follow's: this only opens.
 */
export function useRevealOnHash(match: (id: string) => boolean, reveal: (id: string) => void): void {
  // The latest callbacks, so a component can pass inline functions without restarting the listeners.
  const matchRef = useRef(match);
  const revealRef = useRef(reveal);
  useEffect(() => {
    matchRef.current = match;
    revealRef.current = reveal;
  });

  useEffect(() => {
    const consider = (raw: unknown) => {
      if (typeof raw !== 'string') return;
      let id = raw.replace(/^#/, '');
      try {
        id = decodeURIComponent(id);
      } catch {
        return;
      }
      if (!PLACE_ID.test(id) || !matchRef.current(id)) return;
      revealRef.current(id);
    };
    const fromHash = () => consider(window.location.hash);
    const fromEvent = (event: Event) => consider((event as CustomEvent<{ id?: unknown }>).detail?.id);
    fromHash();
    window.addEventListener('hashchange', fromHash);
    window.addEventListener(REVEAL_EVENT, fromEvent);
    return () => {
      window.removeEventListener('hashchange', fromHash);
      window.removeEventListener(REVEAL_EVENT, fromEvent);
    };
  }, []);
}
