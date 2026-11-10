'use client';

import { useState, useSyncExternalStore } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { isRedirectPending } from '@/lib/auth-hint';

const LandingModals = dynamic(() => import('@/components/LandingModals'), { ssr: false });

/** The redirect mark does not change while the page is open, so there is nothing to subscribe to. */
const noChanges = () => () => {};

/**
 * The start page's sign-in, registration and legal dialogs, loaded when they
 * are needed rather than with the page (docs/perf/REPORT.md).
 *
 * `LandingModals` renders nothing until the address asks for a dialog
 * (`?auth=…`, `?legal=…`), and it is mounted only then — or when a Google
 * redirect sign-in that left this tab is waiting to be finished
 * (`isRedirectPending`, lib/auth-hint.ts). It used to be mounted on every
 * visit once the browser was idle, so that it could ask Firebase whether a
 * redirect had come back; that initialised the Auth SDK for every visitor,
 * which on mobile browsers and Safari loads Google's sign-in frame — a request
 * to Google from a page that promises to contact nobody before sign-in
 * (privacy policy section 7). Once mounted it stays mounted, so closing a
 * dialog keeps its exit as it was. Nothing about the dialogs themselves
 * changes.
 */
export default function LandingModalsLazy() {
  const searchParams = useSearchParams();
  const asked = searchParams.has('auth') || searchParams.has('legal');
  // `false` on the server and while hydrating, where sessionStorage does not exist.
  const redirectPending = useSyncExternalStore(noChanges, isRedirectPending, () => false);
  const [mounted, setMounted] = useState(false);
  const wanted = asked || redirectPending;
  if (wanted && !mounted) setMounted(true);

  if (!wanted && !mounted) return null;
  return <LandingModals />;
}
