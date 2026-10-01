import { nextOpenPoint, type NextOpenPoint } from '@/lib/next-step';
import type { ModelStageSubject } from '@/lib/model-stages';
import type { WorkspaceRow } from '@/lib/workspace-rows';
import type { Project } from '@/lib/types';

/**
 * What "Your turn" in My workspace lists once the account has projects of its
 * own — `components/workspace/YourTurnCard.tsx`. Pure, for the spec.
 *
 * The next open step of each own project, from the same rule-based
 * `nextOpenPoint` the workspace's "Next step" card reads (no model call). A
 * project whose result no longer matches its source comes first; then the ones
 * that moved most recently. Shared projects and the demo never appear — their
 * reader can act on nothing in them.
 */
export interface YourTurnItem {
  row: WorkspaceRow;
  point: NextOpenPoint;
}

export function yourTurnItems(
  rows: readonly WorkspaceRow[],
  projects: readonly (Project & { id: string })[],
  account: ModelStageSubject | null,
): YourTurnItem[] {
  const byId = new Map(projects.map((p) => [p.id, p]));
  const items: YourTurnItem[] = [];
  for (const row of rows) {
    if (row.isDemo || row.access !== 'own') continue;
    const point = nextOpenPoint(byId.get(row.id) ?? null, account);
    if (point) items.push({ row, point });
  }
  return items.sort((a, b) => {
    const stale = Number(Boolean(b.row.stale)) - Number(Boolean(a.row.stale));
    if (stale !== 0) return stale;
    return (b.row.lastChange ?? '').localeCompare(a.row.lastChange ?? '');
  });
}

