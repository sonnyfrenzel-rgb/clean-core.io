'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';

const LandingModals = dynamic(() => import('@/components/LandingModals'), { ssr: false });

/**
 * The start page's sign-in, registration and legal dialogs, loaded when they
 * are needed rather than with the page (docs/perf/REPORT.md).
 *
 * `LandingModals` renders nothing until the address asks for a dialog
 * (`?auth=…`, `?legal=…`), so it never was part of the first paint — but its
 * code was, for every visitor. Now it is mounted at once when the address asks
 * for a dialog (a link from another page, a click on "Get Free Access"), and
 * otherwise as soon as the browser is idle after the page has loaded, so its
 * load-time work — finishing a Google redirect sign-in, sending on a reader
 * whose session is already in place — still runs on every visit. Nothing about
 * the dialogs themselves changes.
 */
export default function LandingModalsLazy() {
  const searchParams = useSearchParams();
  const asked = searchParams.has('auth') || searchParams.has('legal');
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(() => setIdle(true), { timeout: 2000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(() => setIdle(true), 200);
    return () => window.clearTimeout(id);
  }, []);

  if (!asked && !idle) return null;
  return <LandingModals />;
}
