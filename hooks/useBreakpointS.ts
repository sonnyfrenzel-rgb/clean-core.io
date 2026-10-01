'use client';

import { useEffect, useState } from 'react';

/**
 * Breakpoint S of `DESIGN.md` §2.9 — 600 px and narrower.
 *
 * For the few things that are not a matter of CSS but of *what* is rendered
 * there: the process starts as the step list ("Steps" is the start on S,
 * §5.7), and a coach mark is a hint strip rather than a floating popover
 * (§2.9). Everything that is only layout stays in CSS (`max-[600px]:`).
 *
 * `false` on the server and in the first client pass, then the real answer —
 * the wide rendering is the one a server can produce, and a phone sees the
 * switch one frame later rather than a hydration mismatch.
 */
export const BREAKPOINT_S_QUERY = '(max-width: 600px)';

export function useBreakpointS(): boolean {
  const [isS, setIsS] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const media = window.matchMedia(BREAKPOINT_S_QUERY);
    const update = () => setIsS(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return isS;
}
