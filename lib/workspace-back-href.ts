import { isWorkspaceView, LAYERS, VIEW_LABELS, type LayerKey, type WorkspaceView } from '@/lib/workspace-model';
import { DEMO_WORKSPACE_ROUTE } from '@/lib/demo-marks';
import { nav, navViewLabel } from '@/lib/messages/navigation';
import { BUSINESS_LAYER_ELSEWHERE, BUSINESS_MAP_ID } from '@/lib/business-layers';
import { IT_LAYER_ELSEWHERE, IT_SECTION_IDS } from '@/lib/it-sections';

const LAYER_ID = /^[A-Za-z][\w-]{0,63}$/;

/**
 * Where "Back to project workspace" leads. Pure, so the rule can be read and tested in
 * one place: the view and the layer come from the stage's own address and are
 * checked against what the workspace understands — a view in the URL is a
 * perspective, never a grant (ADR-018), and an unknown one is simply dropped.
 */
export function workspaceBackHref({
  projectId,
  search,
}: {
  projectId: string;
  /** The stage's `location.search`, e.g. `?view=it&from=it-answers-heading`. */
  search: string;
}): string {
  return backTo(`/project/${encodeURIComponent(projectId)}`, search);
}

/**
 * The same rule for the demo: its stages lead back to the demo workspace
 * (`/demo/workspace`), in the view and layer they were opened from (owner
 * 02.10.2026: "from the demo, a button back to the workspace at the top").
 * The tour's place lives in the browser (`lib/demo-tour.ts`), so it is kept
 * without travelling in the address.
 */
export function demoWorkspaceBackHref(search: string): string {
  return backTo(DEMO_WORKSPACE_ROUTE, search);
}

function backTo(workspace: string, search: string): string {
  const params = new URLSearchParams(search);
  const asked = params.get('view');
  const from = params.get('from');
  const layer = layerParam(params.get('layer'));
  // A layer the stage was opened from wins over the control it was opened by:
  // the workspace holds the layer in its fragment (ADR-018), and returning to
  // the toolbar of another layer would lose the place the reader was reading.
  // *Need & process* is not a section of Business since ADR-080: a stage
  // opened from it there (a link from before 3.0.6) returns to the map, which
  // is where the process stands in that view. IT has no layers since ADR-086:
  // a layer it was opened from returns to where that content lives now.
  const home = layer ? layerHome(asked, layer) : null;
  const view = home ? home.view : asked;
  const query = isWorkspaceView(view) ? `?view=${view}` : '';
  const hash = home
    ? `#${home.hash}`
    : layer && !(asked === 'it')
      ? `#${mapInBusiness(asked, layer) ? BUSINESS_MAP_ID : layer}`
      : from && LAYER_ID.test(from)
        ? `#${from}`
        : '';
  return `${workspace}${query}${hash}`;
}

/**
 * Where a layer address leads in a view that no longer has that layer: in IT
 * (ADR-086) every layer has a new home — Business, Management or IT's own
 * section — except the costs, whose home is the Economics tool itself; a way
 * back from a tool does not lead into a tool, so it returns to the IT view at
 * the control it left by. `null` where the view keeps its layers.
 */
function layerHome(view: string | null, layer: LayerKey): { view: WorkspaceView; hash: string; label: string } | null {
  if (view !== 'it') return null;
  const home = IT_LAYER_ELSEWHERE[layer];
  if (home.kind !== 'view') return null;
  return { view: home.view, hash: home.hash, label: IT_HOME_LABELS[home.hash] ?? LAYER_LABELS[layer] };
}

/** The place names of the IT layer homes, as the way back says them. */
const IT_HOME_LABELS: Readonly<Record<string, string>> = {
  [BUSINESS_MAP_ID]: 'Process map',
  standard: 'Standard fit',
  [IT_SECTION_IDS.objects]: 'Objects & dependencies',
  [IT_SECTION_IDS.trust]: 'Run & trust',
  'decision-card': 'Decision',
};

/**
 * What the stage header shows where "Back to workspace" stands: the link to the
 * project's workspace on a project's stage, the link to the demo workspace on
 * a demo stage, and nothing where there is neither.
 *
 * Since roadmap 3.0.1 (ADR-061) every account has the workspace, so where the
 * link leads no longer depends on who is reading. It used to: until the profile
 * was read every account looked like one without a workspace, and the header
 * held an invisible place rather than send a workspace reader to the dashboard
 * (QA review of 472315d93455, f8d5367e0a00). There is nothing left to wait for.
 */
export function stageBackLink({
  projectId,
  search,
  demo = false,
}: {
  projectId: string;
  search: string;
  /** A demo stage (`/demo/<stage>`): back to `/demo/workspace`. */
  demo?: boolean;
}): { kind: 'none' } | { kind: 'link'; href: string } {
  if (demo) return { kind: 'link', href: demoWorkspaceBackHref(search) };
  if (!projectId) return { kind: 'none' };
  return { kind: 'link', href: workspaceBackHref({ projectId, search }) };
}

/**
 * Where a stage is left *from*, on the workspace page — the element "Back to
 * workspace" scrolls back to. Ids that stand on the object page, each owned by
 * the component that renders the link (block D, D.29).
 */
export const WORKSPACE_RETURN = {
  tools: 'workspace-tools',
  nextStep: 'next-step',
  status: 'workspace-status',
} as const;

export type WorkspaceReturnPoint = (typeof WORKSPACE_RETURN)[keyof typeof WORKSPACE_RETURN];

/**
 * A link from the workspace into a stage that remembers where it came from:
 * `/project/<id>/<path>?view=<view>&from=<element>`. `workspaceBackHref` reads
 * the same two parameters on the way back, so "Back to workspace" returns to the
 * view the reader was in and to the control they left by (the coordinator's
 * addendum to D.9). Without a view — the demo, which has no workspace to return
 * to — the link is the stage's plain address.
 */
export function stageHref({
  base,
  path,
  view,
  from,
  layer,
}: {
  /** `/project/<id>`, or `/demo` for the demo's stages. */
  base: string;
  path: string;
  view?: string | null;
  from?: WorkspaceReturnPoint;
  /** The layer the reader is in (`#need`), so the way back returns to it. */
  layer?: string | null;
}): string {
  const target = `${base}/${path}`;
  if (!isWorkspaceView(view)) return target;
  const params = new URLSearchParams({ view });
  if (from) params.set('from', from);
  const known = layerParam(layer);
  if (known) params.set('layer', known);
  return `${target}?${params.toString()}`;
}

/**
 * The names of the workspace's layers, as the Anchor Bar shows them
 * (`workspaceLayers` in `lib/workspace-model.ts`). Kept here, beside the rule
 * that reads them, so the way back can say where it leads without computing a
 * project's layers; `tests/stage-frame.spec.ts` holds the two lists together.
 */
export const LAYER_LABELS: Readonly<Record<LayerKey, string>> = {
  need: 'Need & process',
  standard: 'Standard fit',
  costs: 'Costs & assumptions',
  architecture: 'Architecture & dependencies',
  evidence: 'Evidence & controls',
  changes: 'Changes & commitments',
};

/** The process map's place in the way back, where Business has no section of that name (ADR-080). */
export const BUSINESS_MAP_LABEL = 'Process map';

/** Business reached by a layer it no longer shows, whose content is its map (ADR-080). */
function mapInBusiness(view: string | null, layer: LayerKey): boolean {
  return view === 'business' && BUSINESS_LAYER_ELSEWHERE[layer] === 'map';
}

/** A layer key from an address, or `null` — `#need` and `need` both read as `need`. */
export function layerParam(value: string | null | undefined): LayerKey | null {
  if (typeof value !== 'string') return null;
  const bare = value.replace(/^#/, '');
  return (LAYERS as readonly string[]).includes(bare) ? (bare as LayerKey) : null;
}

/**
 * Where "Back to project workspace" leads, in words: `Business view, Need &
 * process`. Only what the address carries and the workspace understands;
 * `null` when it carries neither, so the link then says nothing it does not
 * know. "view" is said (owner 06.10.2026), so "IT" is not read as a team.
 */
export function stageBackPlace(search: string): string | null {
  const params = new URLSearchParams(search);
  const asked = params.get('view');
  const layer = layerParam(params.get('layer'));
  const home = layer ? layerHome(asked, layer) : null;
  const view = home ? home.view : asked;
  const parts = [
    isWorkspaceView(view) ? navViewLabel(VIEW_LABELS[view]) : null,
    home
      ? home.label
      : layer && asked !== 'it'
        ? mapInBusiness(asked, layer)
          ? BUSINESS_MAP_LABEL
          : LAYER_LABELS[layer]
        : null,
  ].filter((p): p is string => Boolean(p));
  return parts.length > 0 ? parts.join(', ') : null;
}

/**
 * The words of a stage's way back to its project (owner 06.10.2026: two
 * terms, so the project's workspace is never mistaken for "My workspace", the
 * list of all projects): `Back to project workspace` and, after it, the
 * project's name and the place — `Order limit check · IT view, Need & process`.
 * A name not read yet, or a place the address does not carry, is left out
 * rather than guessed.
 */
export function stageBackLabel({
  projectName,
  search,
}: {
  projectName?: string | null;
  search: string;
}): { lead: string; project: string | null; place: string | null } {
  const name = typeof projectName === 'string' ? projectName.trim() : '';
  return { lead: nav('nav.backToProjectWorkspace'), project: name || null, place: stageBackPlace(search) };
}
