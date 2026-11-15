import { isWorkspaceView } from '@/lib/workspace-model';
import { BUSINESS_MAP_ID } from '@/lib/business-layers';

/**
 * A project opens in Analyze, Business view (plan
 * `docs/design/analyze-business-first-plan.md` §4.1, AB-2; ADR-109). Pure, so
 * the rules can be read and tested in one place
 * (`tests/analyze-business-first.spec.ts`).
 */

/** The query parameters an arrival carries over to Analyze: the view, the first visit, the way back and the asking place. */
export const ANALYZE_ENTRY_KEPT = ['view', 'first', 'from', 'origin'] as const;

/** `#L42`, `#L40-48`, `#L40-L48` (also with an en dash) to a line range; null for anything else. */
export function analyzeLinesFromHash(hash: string | null | undefined): { lineStart: number; lineEnd: number } | null {
  if (typeof hash !== 'string') return null;
  const m = /^#?L(\d{1,6})(?:\s*[-–]\s*L?(\d{1,6}))?$/.exec(hash.trim());
  if (!m) return null;
  const lineStart = Number(m[1]);
  const lineEnd = m[2] ? Number(m[2]) : lineStart;
  if (lineStart < 1 || lineEnd < lineStart) return null;
  return { lineStart, lineEnd };
}

/** The project's entry: Analyze, with nothing else in the address. */
export function analyzeHref(projectId: string): string {
  return `/project/${encodeURIComponent(projectId)}/analyze`;
}

/**
 * Where `/project/<id>` in the Business view (or with no view) goes: Analyze,
 * keeping `view`, `first`, `from`, `origin` and a line (`#L42`) or the map
 * (`#process-map`). Any other fragment — a workspace layer or a place that
 * Analyze does not have — is dropped: the map is the page. `null` for IT and
 * Management, which stay on the workspace until AB-9/AB-10.
 */
export function analyzeEntryHref({
  projectId,
  search,
  hash,
}: {
  projectId: string;
  search: string;
  hash: string;
}): string | null {
  const params = new URLSearchParams(search);
  const view = params.get('view');
  if (isWorkspaceView(view) && view !== 'business') return null;
  const kept = new URLSearchParams();
  for (const key of ANALYZE_ENTRY_KEPT) {
    const value = params.get(key);
    if (key === 'view' && value !== 'business') continue;
    if (value !== null && value !== '') kept.set(key, value);
  }
  const query = kept.toString();
  const bare = hash.replace(/^#/, '');
  const fragment = analyzeLinesFromHash(bare) ? `#${bare}` : bare === BUSINESS_MAP_ID ? `#${BUSINESS_MAP_ID}` : '';
  return `${analyzeHref(projectId)}${query ? `?${query}` : ''}${fragment}`;
}
