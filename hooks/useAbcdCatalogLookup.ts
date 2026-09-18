'use client';

import { useEffect, useMemo, useState } from 'react';
import { getAuth } from '@/lib/firebase';
import { gradeKey, type GradedObject, type ObjectUse } from '@/lib/abap/abcd-classification';

/**
 * Batch clean-core-level and "no released API path" lookups through
 * `/api/abcd-classify`, so a client component never imports
 * `lib/abap/catalog-service.ts` (the ~4 MB generated Cloudification Repository
 * artifacts) itself — CLAUDE.md's rule that `gradeSapObject()` is server-only
 * and clients batch through this route, and roadmap "SAP-Katalog im
 * Browser-Bundle", which found `components/analyze/UsageRiskMatrix.tsx` and
 * `components/workspace/PublicCloudFitPanel.tsx` breaking exactly that rule
 * via `lib/abap/usage-join.ts` and `lib/abap/public-cloud-fit-resolver.ts`.
 *
 * `status` is the point of this hook, not an afterthought: it starts
 * 'loading' and only becomes 'ready' once a real answer has arrived, or
 * 'error' once every attempt has failed. A caller must render those as
 * visible states — this repository's rule is that an unknown fact is shown as
 * unknown, never quietly stood in for with a default ("has a path", "grade
 * A") that would make an unresolved lookup look like a concluded one.
 *
 * Retries briefly while there is no signed-in user yet (mirrors
 * `useModelAvailability`): the auth listener elsewhere in the app can still be
 * initializing when this hook first runs, and that is not the same as the
 * call having failed.
 */

export type AbcdCatalogLookupStatus = 'loading' | 'ready' | 'error';

export interface AbcdCatalogLookupObject {
  name: string;
  /** `null`/absent when the use is not known — graded from the name alone. */
  use?: ObjectUse | null;
}

export interface AbcdCatalogLookup {
  status: AbcdCatalogLookupStatus;
  /** Keyed by `gradeKey(name, use)`. Empty until `status` is 'ready'. */
  grades: Record<string, GradedObject>;
  /**
   * Whether the Cloudification Repository shows no released successor and no
   * extension path — `catalog-service.ts`'s `hasNoReleasedApiPath()`, looked
   * up server-side. Keyed by the plain, upper-cased object name (use-independent).
   * Empty until `status` is 'ready'.
   */
  noPath: Record<string, boolean>;
}

const EMPTY: { grades: Record<string, GradedObject>; noPath: Record<string, boolean> } = { grades: {}, noPath: {} };

/** One completed (or failed) fetch, tagged with the request key it answers. */
interface Settled {
  key: string;
  status: 'ready' | 'error';
  grades: Record<string, GradedObject>;
  noPath: Record<string, boolean>;
}

export function useAbcdCatalogLookup(objects: AbcdCatalogLookupObject[]): AbcdCatalogLookup {
  // A stable string key over the requested objects, so the effect below only
  // re-fires when the actual set of objects to grade changes — not on every
  // render that happens to build a new array with the same contents.
  const requestKey = useMemo(
    () =>
      objects
        .filter((o) => o.name)
        .map((o) => gradeKey(o.name, o.use ?? null))
        .sort()
        .join('|'),
    [objects],
  );

  // Only ever set once a fetch for a given key actually settles (inside the
  // async callback below, never synchronously in the effect body itself) —
  // 'loading' is not a state of its own here, it is simply "no settled result
  // matches the current key yet" (derived below). That keeps this hook from
  // needing a setState call at the top of the effect just to flip back to
  // 'loading' whenever `requestKey` changes.
  const [settled, setSettled] = useState<Settled | null>(null);

  useEffect(() => {
    if (!requestKey) return;
    let cancelled = false;

    // Mirrors AbcdClassificationPanel.tsx's own decoding of the same gradeKey
    // shape — object names never contain '@', so a plain split is safe.
    const payload = requestKey.split('|').map((key) => {
      const [name, use] = key.split('@');
      return use ? { name, use } : name;
    });

    const attempt = async (retriesLeft: number) => {
      if (cancelled) return;
      const token = await getAuth().currentUser?.getIdToken();
      if (!token) {
        // The auth listener elsewhere may still be initializing; that is not
        // the same as "not signed in", so this retries briefly before giving up.
        if (retriesLeft > 0) {
          setTimeout(() => attempt(retriesLeft - 1), 500);
        } else if (!cancelled) {
          setSettled({ key: requestKey, status: 'error', ...EMPTY });
        }
        return;
      }
      try {
        const res = await fetch('/api/abcd-classify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ objects: payload }),
        });
        if (cancelled) return;
        if (!res.ok) {
          setSettled({ key: requestKey, status: 'error', ...EMPTY });
          return;
        }
        const json = (await res.json()) as { grades?: Record<string, GradedObject>; noPath?: Record<string, boolean> };
        setSettled({ key: requestKey, status: 'ready', grades: json.grades ?? {}, noPath: json.noPath ?? {} });
      } catch {
        if (!cancelled) setSettled({ key: requestKey, status: 'error', ...EMPTY });
      }
    };

    attempt(10);
    return () => {
      cancelled = true;
    };
  }, [requestKey]);

  if (!requestKey) return { status: 'ready', ...EMPTY };
  // A settled result for an OLDER key (the objects to grade changed since it
  // was fetched) is stale, not an answer to today's question — treated the
  // same as not having fetched yet, i.e. 'loading'.
  if (!settled || settled.key !== requestKey) return { status: 'loading', ...EMPTY };
  return { status: settled.status, grades: settled.grades, noPath: settled.noPath };
}
