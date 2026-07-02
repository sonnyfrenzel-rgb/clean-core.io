'use client';

import { useState, useMemo } from 'react';
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
        <Search className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search an SAP object (e.g. MARA, BSEG, VBAK)…"
          className="w-full pl-12 pr-4 py-3.5 rounded-2xl border border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none text-slate-900 font-medium"
          aria-label="Search SAP objects"
        />
      </div>
      {results.length > 0 && (
        <div className="mt-3 bg-white border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100">
          {results.map((n) => (
            <Link
              key={n}
              href={`/catalog/${objectToSlug(n)}`}
              className="block px-4 py-3 hover:bg-slate-50 font-mono text-sm font-bold text-slate-800"
            >
              {n}
            </Link>
          ))}
        </div>
      )}
      {q.trim().length >= 2 && results.length === 0 && (
        <p className="mt-3 text-sm text-slate-500">No object matching “{q}”. Try the A–Z index below.</p>
      )}
    </div>
  );
}
