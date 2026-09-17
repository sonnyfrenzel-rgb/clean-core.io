import { useCallback, useEffect, useRef, useState } from 'react';
import { formatMapAddress, parseMapAddress, type MapAddress } from '@/lib/process-navigation';

/**
 * The level and the selection, in the URL — roadmap 2.9, `DESIGN.md` §5.9 item 11.
 *
 * `#map=<plane>&node=<element>`. A shared link opens the same level with the
 * same selection, and Back and Forward do the ordinary thing, because every
 * change a reader makes is one `history.pushState` and every step of the
 * browser's own history is one `popstate` read back.
 *
 * The **fragment**, not the query string, and all three reasons apply here:
 *
 *   1. a fragment never leaves the browser, so a plane id read out of a
 *      customer's own ABAP is not written into a server log or a `Referer`;
 *   2. it changes without Next.js re-rendering the route around a client page
 *      that has just fetched a 37 kB source and built a model from it — the App
 *      Router's `replace` with a query does re-render, and the map would be
 *      rebuilt on every arrow key;
 *   3. `history.pushState` on it is the whole of Back and Forward.
 *
 * Two things that are not details:
 *
 * **`replace` versus `push`.** Following the reader's own selection with `push`
 * is what makes Back mean "the step I was on before". Normalising an address
 * that arrived with the page uses `replace`, or Back would need two presses to
 * leave the page it landed on.
 *
 * **One entry per move.** Reaching a step sets its level and its selection, and
 * that is one move, not two. So the history write is scheduled in a microtask
 * and the last value of the tick wins: two setters in one event handler leave
 * one entry behind, and Back goes back one step rather than half of one. The
 * state itself is set straight away — only the entry waits.
 */
export interface ProcessMapAddress extends MapAddress {
  /** Set the address and push a history entry. Takes the current address when given a function. */
  go: (next: MapAddress | ((current: MapAddress) => MapAddress)) => void;
  /** Set it without a history entry — for normalising, not for navigating. */
  replace: (next: MapAddress | ((current: MapAddress) => MapAddress)) => void;
}

const NOWHERE: MapAddress = { plane: null, node: null };

export function useProcessMapAddress(): ProcessMapAddress {
  const [address, setAddress] = useState<MapAddress>(NOWHERE);
  const latest = useRef<MapAddress>(NOWHERE);
  const pending = useRef<{ address: MapAddress; push: boolean } | null>(null);

  useEffect(() => {
    const read = () => {
      const next = parseMapAddress(window.location.hash);
      latest.current = next;
      setAddress(next);
    };
    read();
    // `popstate` covers Back and Forward; `hashchange` covers a link on the
    // page and a fragment typed into the address bar.
    window.addEventListener('popstate', read);
    window.addEventListener('hashchange', read);
    return () => {
      window.removeEventListener('popstate', read);
      window.removeEventListener('hashchange', read);
    };
  }, []);

  const write = useCallback((
    next: MapAddress | ((current: MapAddress) => MapAddress),
    push: boolean,
  ) => {
    const value = typeof next === 'function' ? next(latest.current) : next;
    latest.current = value;
    setAddress(value);

    const scheduled = pending.current;
    pending.current = { address: value, push: scheduled ? scheduled.push || push : push };
    if (scheduled) return;

    queueMicrotask(() => {
      const job = pending.current;
      pending.current = null;
      if (!job) return;
      const url = `${window.location.pathname}${window.location.search}${formatMapAddress(job.address)}`;
      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (url === current) return;
      if (job.push) window.history.pushState(null, '', url);
      else window.history.replaceState(null, '', url);
    });
  }, []);

  const go = useCallback((next: MapAddress | ((current: MapAddress) => MapAddress)) => write(next, true), [write]);
  const replace = useCallback((next: MapAddress | ((current: MapAddress) => MapAddress)) => write(next, false), [write]);

  return { ...address, go, replace };
}
