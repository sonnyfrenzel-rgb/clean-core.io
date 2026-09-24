/**
 * What a project stored by an earlier version of this product does not carry —
 * roadmap 3.0.2 (C23-A02).
 *
 * Every project a community account ever created opens in the workspace, in the
 * shape it was stored in. None of them is migrated on the way: opening a
 * project writes nothing to it, mints no run and touches no signature, because
 * a migration on read is a change nobody asked for to a record somebody signed.
 * So the shapes stay, and the workspace has to say what each one cannot answer.
 *
 * The historical forms, as the code records them (not as anybody remembers them):
 *
 *   - **before signed runs** (before v1.10): `analysis`, `cleanCoreScore` and a
 *     worklist written onto the project document, no `activeRunId`, no
 *     `auditMetadata`. The figures are there and nothing signed them.
 *   - **a run that cannot be read**: `activeRunId` names a run whose document is
 *     gone, or which the rules refused (`lib/project-loader.ts` sets
 *     `_runLoadFailed`, in memory only).
 *   - **a run signed before the input manifest** (before roadmap 0.5): no
 *     `inputManifest` on the run and none mirrored in `auditMetadata`. The
 *     signature verifies as it was sealed (`recomputeStoredRunHash`); which
 *     catalog, rule set and engine produced it is not recorded.
 *   - **a run signed before model participation** (before roadmap 1.2): no
 *     `modelParticipation`. Whether a model wrote the narrative is not recorded.
 *   - **dependencies stored before ownership** (before 2.16): `dataCoupling`
 *     entries without `isStandard`, so a name that is not a customer name is
 *     not therefore an SAP table.
 *
 * Not a gap: the stored workflow `status` (`created` … `completed`). It is
 * still written by every stage page today, the hydration overwrites it with the
 * run's own lifecycle `status`, and nothing in the workspace reads it
 * (`lib/workflow-steps.ts`) — a project that says `completed` with nothing on
 * record is shown as what is on record, which needs no sentence of its own.
 *
 * Pure, and the only place that decides: the workspace renders what this
 * returns, next to what the engine could not work out, and computes nothing of
 * its own. Each entry is a *not determined* with its reason — never a zero and
 * never a success, because the absence is a fact about the record and not a
 * result of anything.
 */

import type { Project } from './types';

export const HISTORICAL_FORMS = [
  'before-signed-runs',
  'run-unreadable',
  'run-before-manifest',
  'run-before-model-record',
  'coupling-before-ownership',
] as const;
export type HistoricalForm = (typeof HISTORICAL_FORMS)[number];

export interface RecordGap {
  form: HistoricalForm;
  /** What is not determined, in the reader's words. */
  label: string;
  /** Why — which version of the product stored the record, and what it lacks. */
  why: string;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim().length > 0 ? v.trim() : null);

/** A run id is quoted at the length a person can compare by eye. */
const shortId = (id: string) => (id.length > 8 ? id.slice(0, 8) : id);

function hasManifest(project: Project): boolean {
  const m = project.inputManifest ?? project.auditMetadata?.inputManifest ?? null;
  return Boolean(m && typeof m === 'object' && typeof (m as { hash?: unknown }).hash === 'string');
}

function hasModelRecord(project: Project): boolean {
  const onRun = (project as { modelParticipation?: unknown }).modelParticipation;
  const onCard = project.auditMetadata?.modelCard?.modelParticipation;
  return onRun !== undefined || onCard !== undefined;
}

/**
 * The record gaps of one project — empty for a project stored by this version.
 *
 * Reads a hydrated project (`loadProjectAndHydrate`) and a bare document alike;
 * on a bare document a run that was never loaded is not reported as missing,
 * only one the loader tried and failed to read.
 */
export function recordGaps(project: Project | null): RecordGap[] {
  if (!project) return [];
  const out: RecordGap[] = [];
  const runId = str(project.activeRunId);
  const runUnreadable = Boolean(runId) && project._runLoadFailed === true;

  if (!runId) {
    const analysis = str(project.analysis);
    const score = typeof project.cleanCoreScore === 'number' || typeof project.cleanCoreScore === 'string';
    const worklist = Array.isArray(project.worklist) && project.worklist.length > 0;
    if (analysis || score || worklist) {
      out.push({
        form: 'before-signed-runs',
        label: 'Analysis without a signed run',
        why:
          'This project holds an analysis stored before every analysis was captured as a signed run. ' +
          'Nothing signed it, so its score and findings are not determined here. ' +
          'Running the analysis again signs a new run; the old record stays as it is.',
      });
    }
  }

  if (runId && runUnreadable) {
    const error = str(project._runLoadError);
    out.push({
      form: 'run-unreadable',
      label: 'Signed run could not be read',
      why:
        `The project names run ${shortId(runId)} as its active run, and it could not be read` +
        `${error ? ` (${error.replace(/\.$/, '')})` : ''}. ` +
        'Its signature, score and findings are not determined. Nothing on the project was changed.',
    });
  }

  if (runId && !runUnreadable && !hasManifest(project)) {
    out.push({
      form: 'run-before-manifest',
      label: 'Inputs of the signed run',
      why:
        'This run was signed before runs recorded their inputs. Which catalog, rule set and engine ' +
        'build produced it is not determined. Nothing re-signs it: its signature covers what it recorded, and no more.',
    });
  }

  if (runId && !runUnreadable && !hasModelRecord(project)) {
    out.push({
      form: 'run-before-model-record',
      label: 'Model participation',
      why:
        'This run was signed before runs recorded what part a model had in them. ' +
        'Whether a model wrote its narrative is not determined.',
    });
  }

  const coupling = Array.isArray(project.dataCoupling) ? project.dataCoupling : [];
  const unowned = coupling.filter(
    (e) => e && typeof e === 'object' && e.isCustom !== true && typeof e.isStandard !== 'boolean',
  ).length;
  if (unowned > 0) {
    out.push({
      form: 'coupling-before-ownership',
      label: 'Table ownership',
      why:
        `${unowned} ${unowned === 1 ? 'dependency was' : 'dependencies were'} stored before ownership was recorded. ` +
        'A name that is not a customer name is not therefore an SAP table, so whose table it is is not determined.',
    });
  }

  return out;
}
