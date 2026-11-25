import { homeRowsOf, type HomeRow } from '@/lib/home-rows';

/**
 * The two asynchronous flows of the own list (`components/workspace/WorkspaceListReport.tsx`), as functions of what
 * they call, so that the order in which answers arrive can be played through in a test without a page
 * (`tests/workspace-row-flow.spec.ts`). The component hands in its fetch, its project read, its state setters and
 * `runAnalysis`; nothing here imports Firebase or React.
 */

export interface OwnRowsApply {
  /** The rows of this account, as the route answered them. */
  rows: (uid: string, rows: HomeRow[], truncated: boolean) => void;
  /** The read for this account failed. */
  failed: (uid: string) => void;
}

/**
 * The reader of the own rows (`GET /api/workspace-rows`, H-O9). Only the newest request may write: an older answer
 * arriving after a newer one — rows or a failure — would put back what the newer one had already corrected.
 */
export function ownRowsReader(apply: OwnRowsApply): (uid: string, request: () => Promise<Response>) => Promise<void> {
  let seq = 0;
  return async (uid, request) => {
    const mine = ++seq;
    try {
      const res = await request();
      const body = (await res.json().catch(() => null)) as { truncated?: unknown } | null;
      const rows = res.ok ? homeRowsOf(body) : null;
      if (mine !== seq) return;
      if (!rows) {
        apply.failed(uid);
        return;
      }
      apply.rows(uid, rows, body?.truncated === true);
    } catch {
      if (mine === seq) apply.failed(uid);
    }
  };
}

export interface RowRunSteps<P, S> {
  /** The project, read whole through the rules: the row carries no source (H-O9). */
  read: () => Promise<P | null>;
  /** Whether this run still owns the row: Cancel, a second start or leaving the list take it away. */
  owns: () => boolean;
  signal: AbortSignal;
  sourceOf: (project: P) => string | null;
  /** The error for a project without source. */
  noSource: () => Error;
  /** What the run will cover, once the source is known. */
  scope: (source: string) => void;
  /** The stages as the run reports them. */
  stages: (stages: S) => void;
  /** The run itself (`runAnalysis`), with a stage report that writes only while the run owns the row. */
  run: (project: P, source: string, onStages: (stages: S) => void) => Promise<void>;
}

/**
 * A run started from a row, from the project read to the end of the run. Cancelled, or the list left, while the
 * project was read: nothing more is set up, no request is sent and no stage is shown — `'cancelled'`.
 */
export async function runRowSteps<P, S>(steps: RowRunSteps<P, S>): Promise<'cancelled' | 'ran'> {
  const project = await steps.read();
  if (!steps.owns() || steps.signal.aborted) return 'cancelled';
  const source = project ? steps.sourceOf(project) : null;
  if (!project || source === null || !source.trim()) throw steps.noSource();
  if (steps.owns()) steps.scope(source);
  await steps.run(project, source, (stages) => {
    if (steps.owns()) steps.stages(stages);
  });
  return 'ran';
}
