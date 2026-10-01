'use client';

import { useState, type ReactNode } from 'react';
import { ArrowRight, Search } from 'lucide-react';
import { publicButton } from '@/components/landing/public-button';

/**
 * The object lookup of the landing page — landing mockup, section `catalog`.
 *
 * A form that sends `q` to `/catalog` (and works so without JavaScript), plus a
 * live answer for the objects the server handed in: their real level, release
 * state and successor, read from the catalog when the page was built. Any other
 * name is not guessed at — the result says to look it up in the full catalog.
 */

export interface LookupHit {
  name: string;
  levelChip: ReactNode;
  state: string;
  successor: string | null;
  href: string;
  hrefLabel: string;
}

export default function CatalogLookup({ hits, tryNames, initial }: { hits: LookupHit[]; tryNames: string[]; initial: string }) {
  const [q, setQ] = useState('');
  const key = (q.trim() || initial).toUpperCase();
  const hit = hits.find((h) => h.name === key);

  return (
    <>
      <form role="search" action="/catalog" method="get">
        <label htmlFor="landing-lookup">SAP object name</label>
        <div className="lk-row">
          <input
            className="lk-input"
            id="landing-lookup"
            name="q"
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="for example VBAK or BAPI_PO_CREATE1"
            aria-describedby="lk-help"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button className={publicButton('secondary')} type="submit">
            <Search size={18} aria-hidden="true" />
            Look up
          </button>
        </div>
        <p className="lk-examples" id="lk-help">
          Tables, CDS views, BAPIs, function modules and classes. Try{' '}
          {tryNames.map((n) => (
            <button key={n} type="button" className="anc" onClick={() => setQ(n)}>
              {n}
            </button>
          ))}
        </p>
      </form>
      <div className="lk-result" aria-live="polite">
        {hit ? (
          <div className="lk-hit">
            <div>
              <span className="k">Object</span>
              <code>{hit.name}</code>
            </div>
            <div>
              <span className="k">Level</span>
              {hit.levelChip}
            </div>
            <div>
              <span className="k">Release state</span>
              {hit.state}
            </div>
            <div>
              <span className="k">Successor</span>
              {hit.successor ? <code>{hit.successor}</code> : <span>none named</span>}
            </div>
            <div className="go">
              <a className="textlink" href={hit.href}>
                {hit.hrefLabel}
                <ArrowRight className="i" aria-hidden="true" />
              </a>
            </div>
          </div>
        ) : (
          <p className="lk-empty">
            {key} is not among the objects this page carries. Press Look up to search all of SAP&apos;s catalog.
          </p>
        )}
      </div>
    </>
  );
}
