/**
 * The project's workspace page dissolves (plan `docs/design/analyze-business-first-plan.md` §4.3, AB-11; ROADMAP
 * 3.5.0 item (3)): `/project/<id>` is no page any more, and every address it ever wrote — a bookmark, a mail, a
 * stage's way back, a choice's link — goes to the place in Analyze that holds its content.
 *
 *   /project/<id>[?view=…][#place]  →  /project/<id>/analyze[?view=…][#place]   (or a tool, for the costs)
 *
 * One function, one table (`WORKSPACE_PLACES`), tested against every address in `tests/workspace-redirect.spec.ts`.
 * The rules:
 *
 *   1. **The view stays the reader's.** Business (or none, or one the address cannot name) is Analyze's default view;
 *      IT and Management are Analyze's other two views (`?view=it`, `?view=management`; AB-9, AB-10). A view is a
 *      perspective, never a grant (ADR-018): an unknown one is dropped.
 *   2. **A place goes where its content lives now** — the table below; a place of another view takes the reader to
 *      that view (the decision is Management's, the objects IT's, the map Business'). A place nothing holds any more
 *      (the workspace's tool row, its status fold, its links-out row) opens the view at its top.
 *   3. **A line stays a line** (`#L42`, `#L40-48`): the code panel in Business and IT; Management shows no code, so a
 *      line asked there opens in Business.
 *   4. **What the address carries along**: `first` (a project's first visit), `from` (where a stage was left from),
 *      `origin` (the place that asked for a choice, `lib/choice-addresses.ts`) and `add` (`usage`/`atc`, the import
 *      dialog Analyze opens). Everything else — `focus` (ADR-057), a layer — is dropped.
 *
 * Pure: no React, no router.
 */
import { analyzeLinesFromHash } from '@/lib/analyze-entry';
import { BUSINESS_MAP_ID } from '@/lib/business-layers';
import { ANALYZE_IT_IDS } from '@/lib/analyze-it';

export type AnalyzeView = 'business' | 'it' | 'management';

/** Where one old place lands: a view of Analyze at a place (or its top), or a tool. */
export type WorkspacePlaceHome =
  | { kind: 'analyze'; view: AnalyzeView | 'same'; hash: string | null }
  | { kind: 'tool'; path: 'tco' };

const A = (view: AnalyzeView | 'same', hash: string | null = null): WorkspacePlaceHome => ({ kind: 'analyze', view, hash });

/**
 * Every place the workspace page had, and its home in Analyze. `same` keeps the view the address named. The keys are
 * the fragments as the workspace, its views and the tools wrote them.
 */
export const WORKSPACE_PLACES: Readonly<Record<string, WorkspacePlaceHome>> = Object.freeze({
  // The six layers of 1.4 and their later homes (ADR-080, ADR-086, ADR-087, ADR-096).
  need: A('business', BUSINESS_MAP_ID),
  standard: A('it', 'standard'),
  costs: { kind: 'tool', path: 'tco' },
  architecture: A('it', ANALYZE_IT_IDS.touch),
  evidence: A('it', 'it-trust'),
  changes: A('management', 'decision-card'),
  // Business: the map (ADR-080) and the next step.
  [BUSINESS_MAP_ID]: A('business', BUSINESS_MAP_ID),
  'next-step': A('same'),
  // IT's sections (ADR-086) and the answer's facets.
  'it-findings': A('it', ANALYZE_IT_IDS.kinds),
  findings: A('it', ANALYZE_IT_IDS.kinds),
  level: A('it', ANALYZE_IT_IDS.kinds),
  'it-objects': A('it', ANALYZE_IT_IDS.touch),
  uses: A('it', ANALYZE_IT_IDS.touch),
  'it-target-profile': A('it', 'it-target-profile'),
  'it-route': A('it', 'it-route'),
  'it-trust': A('it', 'it-trust'),
  'it-elsewhere': A('it'),
  'it-answers-heading': A('it', ANALYZE_IT_IDS.answer),
  'it-types': A('it', 'it-types'),
  'business-rules': A('it', 'business-rules'),
  // The project's one list of open questions (ADR-081) stands in IT's side column; Management keeps its own (below).
  'not-determined': A('it', ANALYZE_IT_IDS.notDetermined),
  // Management (ADR-087): the decision and what it rests on — Analyze's Management view (AB-10).
  'decision-card': A('management', 'decision-card'),
  'decision-rests-on': A('management', 'decision-rests-on'),
  'decision-rests-on-need': A('management', 'decision-rests-on-need'),
  'decision-rests-on-option': A('management', 'decision-rests-on-option'),
  'decision-rests-on-cost': A('management', 'decision-rests-on-cost'),
  'decision-rests-on-contract': A('management', 'decision-rests-on-contract'),
  'decision-options': A('management', 'decision-options'),
  'management-readiness': A('management', 'management-readiness'),
  'management-elsewhere': A('management'),
  // The workspace's own chrome: the tool row and the status fold are the tool header's now, read access is
  // "Invite to view" in that header (UX review L7).
  'workspace-tools': A('same'),
  'workspace-head-tools': A('same'),
  'workspace-status': A('same'),
  'workspace-access': A('same'),
});

/** The query parameters an old address carries over. */
export const WORKSPACE_REDIRECT_KEPT = ['first', 'from', 'origin', 'add'] as const;

const VIEWS: readonly AnalyzeView[] = ['business', 'it', 'management'];
const isView = (v: unknown): v is AnalyzeView => typeof v === 'string' && (VIEWS as readonly string[]).includes(v);

/**
 * Where an address of the dissolved workspace page goes. `search` and `hash` as the browser has them (with or
 * without `?`/`#`). Always an address of this project, never another origin.
 */
export function workspaceRedirectHref({ projectId, search, hash }: { projectId: string; search: string; hash: string }): string {
  return workspaceRedirectFrom(`/project/${encodeURIComponent(projectId)}`, search, hash);
}

/**
 * The same, for a caller that holds the project's base already encoded (`/project/<encoded id>`, as `stageHref` and
 * `lib/choice-addresses.ts` build it).
 */
export function workspaceRedirectFrom(projectBase: string, search: string, hash: string): string {
  const params = new URLSearchParams(search.replace(/^\?/, ''));
  const asked = params.get('view');
  const named: AnalyzeView = isView(asked) ? asked : 'business';
  let place = hash.replace(/^#/, '');
  try {
    place = decodeURIComponent(place);
  } catch {
    place = '';
  }

  let view: AnalyzeView = named;
  let fragment = '';
  let tool: string | null = null;
  if (place) {
    const lines = analyzeLinesFromHash(place);
    if (lines) {
      view = named === 'management' ? 'business' : named;
      fragment = place;
    } else if (/^oq-[a-z-]{1,40}$/.test(place)) {
      // One group of the open questions (`#oq-add-atc`, a choice's address): where the list stands.
      view = named === 'management' ? 'management' : 'it';
      fragment = place;
    } else if (Object.prototype.hasOwnProperty.call(WORKSPACE_PLACES, place)) {
      const home = WORKSPACE_PLACES[place];
      if (place === ANALYZE_IT_IDS.notDetermined && named === 'management') {
        // Management keeps its own "still open" (AB-10); Business and IT read the one list in IT's side column.
        view = 'management';
        fragment = place;
      } else if (home.kind === 'tool') {
        tool = home.path;
      } else {
        view = home.view === 'same' ? named : home.view;
        fragment = home.hash ?? '';
      }
    }
  }

  const kept = new URLSearchParams();
  // Business is Analyze's default: said in the address only when the old one said it. A tool keeps the view asked.
  if (view !== 'business' || asked === 'business') kept.set('view', view);
  for (const key of WORKSPACE_REDIRECT_KEPT) {
    const value = params.get(key);
    if (value === null || value === '') continue;
    if (key === 'add' && value !== 'usage' && value !== 'atc') continue;
    kept.set(key, value);
  }
  const query = kept.toString();
  const base = `${projectBase}/${tool ?? 'analyze'}`;
  return `${base}${query ? `?${query}` : ''}${fragment ? `#${fragment}` : ''}`;
}

/** The place a redirected address lands on, in words, for a way back: "Analyze, IT view". */
export function workspaceRedirectPlace(href: string): string {
  const bare = href.split('#')[0];
  const [path, rest = ''] = bare.split('?');
  if (path.endsWith('/tco')) return 'Economics';
  const view = new URLSearchParams(rest).get('view');
  return view === 'it' ? 'Analyze, IT view' : view === 'management' ? 'Analyze, Management view' : 'Analyze';
}
