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
 */
export function useMaterialRules(source: string | null): { rules: MaterialRule[] | null; failed: boolean } {
  const [held, setHeld] = useState<{ source: string; rules: MaterialRule[] | null; failed: boolean } | null>(null);
  useEffect(() => {
    if (!source) return undefined;
    let cancelled = false;
    (async () => {
      const [{ deriveBusinessRules }, { materialRules }] = await Promise.all([
        import('@/lib/abap/business-rule-set'),
        import('@/lib/testing-rule-trace'),
      ]);
      const rules = materialRules(deriveBusinessRules(source));
      if (!cancelled) setHeld({ source, rules, failed: false });
    })().catch(() => {
      if (!cancelled) setHeld({ source, rules: null, failed: true });
    });
    return () => {
      cancelled = true;
    };
  }, [source]);
  if (!source || !held || held.source !== source) return { rules: null, failed: false };
  return { rules: held.rules, failed: held.failed };
}
