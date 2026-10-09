'use client';

import { useEffect, useMemo, useState } from 'react';
import { getAuth } from '@/lib/firebase';
import { assessCoverage } from '@/lib/abap/coverage';
import { catalogLookupTargetOf } from '@/lib/assessment-target';
import type { CatalogAnswerAt, CatalogAnswers } from '@/lib/open-questions';
import type { Project } from '@/lib/types';

/** `MAX_OBJECTS` of `app/api/abcd-classify/route.ts`: the most names one request may carry. */
export const FUNCTION_MODULE_BATCH = 500;

interface ModuleAnswer {
  name: string;
  state: string;
  file: 'release' | 'classification';
  answer: string;
}

/**
 * What SAP's catalog says about the function modules a project's code calls
 * locally (roadmap 3.0.6, ADR-081) — asked of the server through
 * `/api/abcd-classify` (`functionModules`), so the ~4 MB catalog never ships to
 * the browser. The engine's own coverage (`assessCoverage(code, { answerCall })`)
 * then matches each answer to its line, the same way the evidence engine does
 * on the server.
 *
 * `null` where the code calls no function module locally: there is nothing to
 * ask. `loading` until the answer is in, `failed` after it could not be had —
 * in both cases nothing counts as answered, and the calls stay questions.
 */
export function useFunctionModuleAnswers(project: Project | null): CatalogAnswers | null {
  const source = typeof project?.legacyCode === 'string' ? project.legacyCode : '';
  const target = catalogLookupTargetOf(project);
  const edition = target.edition;
  const release = target.release;

  // The names the engine would ask about, read by the engine itself.
  const names = useMemo(() => {
    if (!source.trim()) return [] as string[];
    const seen = new Set<string>();
    assessCoverage(source, {
      answerCall: (name) => {
        seen.add(name.trim().toUpperCase());
        return null;
      },
    });
    return [...seen].filter(Boolean).sort();
  }, [source]);
  const requestKey = names.length ? `${names.join('|')}#${edition}@${release}` : '';

  const [settled, setSettled] = useState<{ key: string; status: 'ready' | 'failed'; modules: Record<string, ModuleAnswer | null> } | null>(null);

  useEffect(() => {
    if (!requestKey) return;
    let cancelled = false;
    const fail = () => {
      if (!cancelled) setSettled({ key: requestKey, status: 'failed', modules: {} });
    };
    const attempt = async (retriesLeft: number) => {
      if (cancelled) return;
      // Inside the `try`: a token refresh that rejects ends in `failed` like
      // any other miss, rather than an unhandled rejection that leaves the
      // list loading for good (QA review of dd8e99691c8d).
      try {
        const token = await getAuth().currentUser?.getIdToken();
        if (!token) {
          if (retriesLeft > 0) setTimeout(() => void attempt(retriesLeft - 1), 500);
          else fail();
          return;
        }
        // The route answers at most FUNCTION_MODULE_BATCH names per request;
        // a program that calls more is asked in batches and the answers merged.
        const modules: Record<string, ModuleAnswer | null> = {};
        for (let i = 0; i < names.length; i += FUNCTION_MODULE_BATCH) {
          const res = await fetch('/api/abcd-classify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ objects: [], functionModules: names.slice(i, i + FUNCTION_MODULE_BATCH), profile: { edition, release } }),
          });
          if (cancelled) return;
          if (!res.ok) {
            fail();
            return;
          }
          const json = (await res.json()) as { functionModules?: Record<string, ModuleAnswer | null> };
          Object.assign(modules, json.functionModules ?? {});
        }
        if (!cancelled) setSettled({ key: requestKey, status: 'ready', modules });
      } catch {
        fail();
      }
    };
    void attempt(10);
    return () => {
      cancelled = true;
    };
    // `requestKey` carries the names and the target.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  return useMemo(() => {
    if (!requestKey) return null;
    if (!settled || settled.key !== requestKey) return { status: 'loading', answered: [] };
    if (settled.status === 'failed') return { status: 'failed', answered: [] };
    const report = assessCoverage(source, {
      answerCall: (name) => {
        const hit = settled.modules[name.trim().toUpperCase()];
        return hit && typeof hit.answer === 'string' && typeof hit.state === 'string' ? hit : null;
      },
    });
    const answered: CatalogAnswerAt[] = (report.answered ?? []).map((a) => ({
      name: a.name,
      state: a.state,
      answer: a.answer,
      line: a.line,
    }));
    return { status: 'ready', answered };
  }, [requestKey, settled, source]);
}
