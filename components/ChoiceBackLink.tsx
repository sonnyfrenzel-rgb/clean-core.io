'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { BACK_LINK_CLASS } from '@/components/BackLink';
import { CC_BUTTON_BASE, CC_BUTTON_DENSITY_CLASSES, CC_BUTTON_VARIANT_CLASSES } from '@/components/cc/Button';

/**
 * The way back from a choice to the place that asked for it — "← Back to
 * Management view, Options" (owner 11.10.2026: "every choice leads straight to
 * its place — and back"; `lib/choice-addresses.ts`).
 *
 * Two forms of one link:
 *
 *   - **in the header** (the slot): where the page's own way back stands — the
 *     stage header puts it in place of "Back to project workspace" while the
 *     address carries an origin. It is the link, always there.
 *   - **a pill** at the bottom left, on a phone only, and only while the header
 *     link is out of view: a reader who scrolled down to the choice and made it
 *     should not have to scroll back up to find the way back. It never sits over
 *     a sticky bar at the foot of the page (the rules editor's Save bar, the
 *     design canvas's actions): it rises above the highest one beneath it.
 *
 * Navigation does not print (§7.1): both carry `cc-no-print`. Nothing here is
 * stored; the origin is the address bar's, as the view and the layer are (ADR-018).
 */

/** " · " with no-break spaces, as in `StageBackText`. */
const SEP = ' · ';
/** The pill's distance from the edges, and the room it keeps above a sticky bar. */
const GAP = 16;
/** The widest the pill can be, for the overlap test with a bar at the foot. */
const PILL_MAX = 288;

export default function ChoiceBackLink({
  href,
  label,
  stage = false,
}: {
  href: string;
  label: { lead: string; place: string };
  /** The stage header's way back (`data-stage-back="origin"`). */
  stage?: boolean;
}) {
  const slotRef = useRef<HTMLAnchorElement>(null);
  const [slotOut, setSlotOut] = useState(false);
  const [lift, setLift] = useState(0);

  // The pill shows while the header link is out of view.
  useEffect(() => {
    const slot = slotRef.current;
    if (!slot || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setSlotOut(!entry.isIntersecting));
    observer.observe(slot);
    return () => observer.disconnect();
  }, []);

  // …and stands above any bar stuck to the foot of the viewport where it would be.
  useEffect(() => {
    if (!slotOut) return;
    let frame = 0;
    const measure = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => setLift(footBarHeight()));
    };
    measure();
    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [slotOut]);

  const words = (
    <>
      <ArrowLeft size={16} aria-hidden="true" className="shrink-0" />
      <span data-choice-back-lead="">{label.lead}</span>
      <span data-choice-back-place="" className="min-w-0 truncate font-medium">
        {SEP}
        {label.place}
      </span>
    </>
  );

  return (
    <>
      <Link
        ref={slotRef}
        href={href}
        data-choice-back="header"
        data-stage-back={stage ? 'origin' : undefined}
        className={`${BACK_LINK_CLASS} cc-no-print mb-3 flex-wrap`}
      >
        {words}
      </Link>
      {slotOut ? (
        <Link
          href={href}
          data-choice-back="pill"
          tabIndex={-1}
          aria-hidden="true"
          style={{ bottom: GAP + lift, maxWidth: `min(${PILL_MAX}px, calc(100vw - ${2 * GAP}px))` }}
          className={`${CC_BUTTON_BASE} ${CC_BUTTON_VARIANT_CLASSES.ghost} ${CC_BUTTON_DENSITY_CLASSES.compact} cc-no-print fixed left-4 z-cc-float no-underline shadow-cc sm:hidden`}
        >
          {words}
        </Link>
      ) : null}
    </>
  );
}

/**
 * The height of the highest bar stuck to the foot of the viewport under the
 * pill's column — a `sticky` or `fixed` element whose bottom touches the
 * viewport's and whose horizontal extent overlaps the pill's. `0` when there is none.
 */
function footBarHeight(): number {
  const vh = window.innerHeight;
  let height = 0;
  for (const el of Array.from(document.body.querySelectorAll<HTMLElement>('[class*="sticky"], [class*="fixed"]'))) {
    if (el.dataset.choiceBack) continue;
    const position = window.getComputedStyle(el).position;
    if (position !== 'sticky' && position !== 'fixed') continue;
    const rect = el.getBoundingClientRect();
    if (rect.height === 0 || rect.top >= vh || Math.abs(rect.bottom - vh) > 2) continue;
    if (rect.right < GAP || rect.left > GAP + PILL_MAX) continue;
    height = Math.max(height, vh - rect.top);
  }
  return Math.round(height);
}
