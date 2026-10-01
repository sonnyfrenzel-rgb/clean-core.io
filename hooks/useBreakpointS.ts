import { useSyncExternalStore } from 'react';

/** Breakpoint S of `DESIGN.md` §2.9: a phone, 600 px and narrower. */
const QUERY = '(max-width: 600px)';

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const media = window.matchMedia(QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

function read(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(QUERY).matches;
}

/** True on breakpoint S. False on the server, where there is no width to ask. */
export function useBreakpointS(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}
