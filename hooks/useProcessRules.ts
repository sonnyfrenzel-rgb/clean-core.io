import { useEffect, useMemo, useState } from 'react';
import { sha256Hex } from '@/lib/artefact-digest';

/**
 * The business rules of the signed source, by skeleton node — roadmap 2.9.
 *
 * 3.4 derives `BR-nnn` from a source and says which skeleton nodes each rule
 * takes effect at. 2.9 needs the reverse of that — *which rules decide at this
 * element* — for two things it puts on screen: the **Hard-coded** overlay and
 * the **problem line** every level carries. `rulesForElement` is 3.4's own
 * function and is called once per node here rather than reimplemented.
 *
 * Derived, never stored: the same source gives the same rules with the same
 * numbers, so there is nothing to keep in step with anything. Nothing here
 * reaches a signed run, and no model is called — 2.9 navigates data that is
 * already there.
 *
 * `lib/abap/business-rule-set.ts` is imported inside the effect, not at the top
 * of the file: it pulls the statement reader, the block structure, the control
 * flow and the skeleton with it, and a reader who never opens a stage with the
 * map should not download them.
 */
export interface ProcessRules {
  /** Skeleton node id → the `BR-nnn` of every rule that decides there. */
  byNode: Map<string, string[]>;
  /** How many rules the source has in total, rules with no element included. */
  total: number;
  ready: boolean;
}

const EMPTY: ProcessRules = { byNode: new Map(), total: 0, ready: false };

/**
 * @param source the source the active run signed.
 * @param nodeIds the skeleton nodes of the drawn process. **Memoised by the
 *   caller** — it is an effect input, and a fresh array on every render would
 *   read the whole program again on every keystroke.
 */
export function useProcessRules(source: string | null, nodeIds: readonly string[]): ProcessRules {
  const [held, setHeld] = useState<{ key: string; value: ProcessRules }>({ key: '', value: EMPTY });
  const key = useMemo(() => (source ? sha256Hex(source) : ''), [source]);

  useEffect(() => {
    if (!source || !key) return;
    let cancelled = false;

    const build = async () => {
      const rules = await import('@/lib/abap/business-rule-set');
      if (cancelled) return;
      const set = rules.deriveBusinessRules(source);
      const byNode = new Map<string, string[]>();
      for (const nodeId of nodeIds) {
        if (byNode.has(nodeId)) continue;
        const found = rules.rulesForElement(set, nodeId).map((rule) => rule.id);
        if (found.length > 0) byNode.set(nodeId, found);
      }
      if (cancelled) return;
      setHeld({ key, value: { byNode, total: set.rules.length, ready: true } });
    };

    // A source the rule reader cannot get through is not a reason to lose the
    // map: the overlay is then empty and says so, like any other count of zero.
    build().catch(() => {
      if (!cancelled) setHeld({ key, value: { byNode: new Map(), total: 0, ready: true } });
    });

    return () => {
      cancelled = true;
    };
  }, [source, key, nodeIds]);

  return held.key === key ? held.value : EMPTY;
}
