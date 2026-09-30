'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { objectToSlug } from '@/lib/abap/catalog-index';

interface CatalogSearchProps {
  /** Slim list of object names, passed from the server index page. */
  names: string[];
}

/**
 * Convenience search over the catalog. Prefix + substring match, capped results.
 * The crawlable navigation is the A–Z browse; this is a UX convenience for humans.
 */
export default function CatalogSearch({ names }: CatalogSearchProps) {
  const [q, setQ] = useState('');

  // The landing page's lookup (roadmap 3.0.6) is a plain GET form to
  // `/catalog?q=…`, so it works without JavaScript. Read once in the browser
  // rather than through `useSearchParams`, which would take this static page
  // out of static rendering.
  useEffect(() => {
    try {
      const initial = new URLSearchParams(window.location.search).get('q');
      if (initial) setQ(initial.slice(0, 60));
    } catch {
      /* no query, nothing to fill */
    }
  }, []);

  const results = useMemo(() => {
    const term = q.trim().toUpperCase();
    if (term.length < 2) return [];
    const starts: string[] = [];
    const includes: string[] = [];
    for (const n of names) {
      if (n.startsWith(term)) starts.push(n);
      else if (n.includes(term)) includes.push(n);
      if (starts.length >= 40) break;
    }
    return [...starts, ...includes].slice(0, 40);
  }, [q, names]);

  return (
    <div className="w-full max-w-xl">
      <div className="relative">
        <Search aria-hidden="true" className="w-5 h-5 text-cc-ink-muted absolute left-4 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search an SAP object (e.g. MARA, BSEG, VBAK)…"
          className="w-full min-h-12 pl-12 pr-4 py-3 rounded-2xl border border-cc-field-border bg-cc-surface text-cc-ink font-medium placeholder:text-cc-ink-muted focus-visible:border-cc-focus focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cc-focus"
          aria-label="Search SAP objects"
        />
      </div>
      {results.length > 0 && (
        <div className="mt-3 bg-cc-surface border border-cc-line rounded-2xl overflow-hidden divide-y divide-cc-line">
          {results.map((n) => (
            <Link
              key={n}
              href={`/catalog/${objectToSlug(n)}`}
              className="block px-4 py-3 font-cc-mono text-sm font-semibold text-cc-ink underline-offset-4 hover:underline"
            >
              {n}
            </Link>
          ))}
        </div>
      )}
      {q.trim().length >= 2 && results.length === 0 && (
        <p className="mt-3 text-sm text-cc-ink-muted">No object matching “{q}”. Try the A–Z index below.</p>
      )}
    </div>
  );
}
