'use client';

import React from 'react';
import { MotionConfig } from 'motion/react';

/**
 * Reduced motion for the `motion` library, app-wide — `DESIGN.md` §1.7 (block
 * D, D.6).
 *
 * `app/globals.css` stills every CSS animation and transition when the reader
 * asked the system for less motion (D.3). The `motion` library animates from
 * JavaScript and a stylesheet does not reach it, so its components went on
 * sliding and scaling. `reducedMotion="user"` makes every one of them follow
 * `prefers-reduced-motion`: transforms and layout animations are dropped,
 * opacity still changes, so a state change is still seen.
 *
 * Its own file because the root layout is a server component and
 * `MotionConfig` is a client one.
 */
export default function MotionPreference({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
