import { isWorkspaceView, LAYERS, VIEW_LABELS, type LayerKey } from '@/lib/workspace-model';
import { DEMO_WORKSPACE_ROUTE } from '@/lib/demo-marks';

const LAYER_ID = /^[A-Za-z][\w-]{0,63}$/;

/**
 * Where "Back to workspace" leads. Pure, so the rule can be read and tested in
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
  const view = params.get('view');
  const from = params.get('from');
  const layer = layerParam(params.get('layer'));
  const query = isWorkspaceView(view) ? `?view=${view}` : '';
  // A layer the stage was opened from wins over the control it was opened by:
  // the workspace holds the layer in its fragment (ADR-018), and returning to
  // the toolbar of another layer would lose the place the reader was reading.
  const hash = layer ? `#${layer}` : from && LAYER_ID.test(from) ? `#${from}` : '';
  return `${workspace}${query}${hash}`;
}

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

/** A layer key from an address, or `null` — `#need` and `need` both read as `need`. */
export function layerParam(value: string | null | undefined): LayerKey | null {
  if (typeof value !== 'string') return null;
  const bare = value.replace(/^#/, '');
  return (LAYERS as readonly string[]).includes(bare) ? (bare as LayerKey) : null;
}

/**
 * Where "Back to workspace" leads, in words: `Business, Need & process`. Only
 * what the address carries and the workspace understands; `null` when it
 * carries neither, so the link then says nothing it does not know.
 */
export function stageBackPlace(search: string): string | null {
  const params = new URLSearchParams(search);
  const view = params.get('view');
  const layer = layerParam(params.get('layer'));
  const parts = [isWorkspaceView(view) ? VIEW_LABELS[view] : null, layer ? LAYER_LABELS[layer] : null].filter(
    (p): p is string => Boolean(p),
  );
  return parts.length > 0 ? parts.join(', ') : null;
}
