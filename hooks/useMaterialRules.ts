'use client';

import { useEffect, useState } from 'react';
import type { MaterialRule } from '@/lib/testing-rule-trace';

/**
 * The material business rules of the signed source (3.0.10) — what the Testing
 * view counts a suite's rule coverage against. Derived from the text alone, the
 * same derivation the generation hands the model; never stored.
 *
 * `null` while the rules are read, or when there is no signed source.
 * `lib/abap/business-rule-set.ts` is imported inside the effect, as
 * `useProcessRules` does, so a reader who never opens Testing does not
 * download the reader.
 *
 * `engineVersion` is the engine of the run that signed `source`
 * (`engineVersionOfProject`): the demo switches the derivation drops are read
 * for that engine (3.0.20), not for the current one.
 */
export function useMaterialRules(
  source: string | null,
  engineVersion: string | null,
): { rules: MaterialRule[] | null; failed: boolean } {
  const [held, setHeld] = useState<{ source: string; engine: string | null; rules: MaterialRule[] | null; failed: boolean } | null>(null);
  useEffect(() => {
    if (!source) return undefined;
    let cancelled = false;
    (async () => {
      const [{ deriveBusinessRules }, { materialRules }] = await Promise.all([
        import('@/lib/abap/business-rule-set'),
        import('@/lib/testing-rule-trace'),
      ]);
      const rules = materialRules(deriveBusinessRules(source, engineVersion));
      if (!cancelled) setHeld({ source, engine: engineVersion, rules, failed: false });
    })().catch(() => {
      if (!cancelled) setHeld({ source, engine: engineVersion, rules: null, failed: true });
    });
    return () => {
      cancelled = true;
    };
  }, [source, engineVersion]);
  if (!source || !held || held.source !== source || held.engine !== engineVersion) return { rules: null, failed: false };
  return { rules: held.rules, failed: held.failed };
}
