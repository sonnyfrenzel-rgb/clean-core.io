'use client';

import { useEffect, useState } from 'react';
import { readSource, type SourceReading } from '@/lib/first-look';

/**
 * The reading of a source — skeleton, rules, tables — where no first look is
 * on the page to hand it up (ADR-086: the IT view no longer renders the first
 * look, yet the search, the print sheet and the counts read the same reading).
 *
 * The same `readSource` the first look stages in four steps, run once after
 * the first paint and only while `enabled` — so a page that also mounts the
 * first look never pays the parse twice. Tied to the source it read: a new
 * source drops the old reading before it can be shown against the new one.
 */
export function useSourceReading(source: string, enabled: boolean): SourceReading | null {
  const [read, setRead] = useState<{ source: string; reading: SourceReading } | null>(null);
  const has = source.trim().length > 0;
  const done = read !== null && read.source === source;
  useEffect(() => {
    if (!enabled || !has || done) return;
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      try {
        setRead({ source, reading: readSource(source) });
      } catch {
        // A source the reader cannot walk has no reading; the page says what
        // it says without one, as it did before the first look had answered.
      }
    };
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      const handle = window.requestAnimationFrame(run);
      return () => {
        cancelled = true;
        window.cancelAnimationFrame(handle);
      };
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [source, enabled, has, done]);
  return done ? read.reading : null;
}
