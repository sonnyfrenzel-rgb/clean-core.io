import { useEffect, useMemo, useState } from 'react';
import { sha256Hex } from '@/lib/artefact-digest';
import type { ProcessMapModel } from '@/lib/process-map';
import type { ProcessHandbook } from '@/lib/process-handbook';

/**
 * The process handbook of the signed source — the chapters the Documentation
 * stage reads beside its map (owner decision 01.10.2026, proposal B).
 *
 * Derived on the reader's machine from what is already there: the map model
 * the page drew, and the source the active run signed. The rule reader, the
 * table and call readers and the business statements are imported inside the
 * effect, like `useProcessRules` does, so a reader who never opens the stage
 * never downloads them. No model is called and nothing is stored.
 *
 * Held by source digest and model: a handbook built for another source is
 * never shown as this one's, it is simply not there yet.
 */
export interface ProcessHandbookState {
  handbook: ProcessHandbook | null;
  status: 'idle' | 'loading' | 'ready' | 'failed';
}

export function useProcessHandbook(source: string | null, model: ProcessMapModel | null): ProcessHandbookState {
  const key = useMemo(() => (source && model ? `${sha256Hex(source)}|${model.xml.length}|${model.elements.length}` : ''), [source, model]);
  const [held, setHeld] = useState<{ key: string; value: ProcessHandbookState }>({
    key: '',
    value: { handbook: null, status: 'idle' },
  });

  useEffect(() => {
    if (!source || !model || !key) return;
    let cancelled = false;

    const build = async () => {
      const [rulesModule, tablesModule, callsModule, docModule, overlaysModule, navModule, handbookModule] =
        await Promise.all([
          import('@/lib/abap/business-rule-set'),
          import('@/lib/abap/table-dependencies'),
          import('@/lib/abap/call-graph'),
          import('@/lib/process-documentation-build'),
          import('@/lib/process-overlays'),
          import('@/lib/process-navigation'),
          import('@/lib/process-handbook'),
        ]);
      if (cancelled) return;
      const nav = navModule.buildNavigation(model);
      const calls = callsModule.readCallGraph(source);
      const sites = overlaysModule.sitesByElement(
        model,
        nav,
        overlaysModule.objectSites(tablesModule.readTableDependencies(source), calls),
        calls,
      );
      let rules = null;
      try {
        rules = rulesModule.deriveBusinessRules(source);
      } catch {
        // A source the rule reader cannot get through still has chapters; the
        // rules tab then says there are none it could read.
        rules = null;
      }
      let doc = null;
      try {
        doc = docModule.buildProcessDocumentation({ source, map: model });
      } catch {
        doc = null;
      }
      const handbook = handbookModule.buildProcessHandbook({ model, nav, doc, rules, sites, source });
      if (cancelled) return;
      setHeld({ key, value: { handbook, status: 'ready' } });
    };

    build().catch(() => {
      if (!cancelled) setHeld({ key, value: { handbook: null, status: 'failed' } });
    });

    return () => {
      cancelled = true;
    };
  }, [source, model, key]);

  if (!key) return { handbook: null, status: 'idle' };
  return held.key === key ? held.value : { handbook: null, status: 'loading' };
}
