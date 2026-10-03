import type { Project } from '@/lib/types';
import { formatIsoDate } from '@/lib/format';
import type { ObjectStatusValue } from '@/lib/object-status';
import { staleness, workflowSteps, workflowSummary } from '@/lib/workflow-steps';
import { projectProgress, type ProjectStage } from '@/lib/project-progress';
import { countSourceLines } from '@/lib/source-lines';

/**
 * One row of "My workspace" — `DESIGN.md` §2.2, §2.4, mockup s7.
 *
 * A list report is where a product is most tempted to flatter. Eight columns of
 * green ticks and a percentage read as achievement whether or not anything was
 * achieved, and nobody checks a table. So every value this module produces is
 * either a fact with a source or an absence with a name, and there is no third
 * kind:
 *
 *   - **`null` is not zero.** `findings: null` means nothing analysed this
 *     project; `findings: 0` would mean the engine looked and found nothing.
 *     The screen prints a word for the first and a number for the second, and
 *     those words are catalogue keys (`workspace.notStaged`,
 *     `workspace.notAnalysed`) rather than literals in a cell.
 *   - **The status ladder is not a fourth copy.** It is derived from
 *     `workflowSteps()` — the one contract the stepper, the rail and the
 *     dashboard row already read (roadmap 1.7) — and never from `project.status`,
 *     a string a client can write.
 *   - **Stale is not a status.** `DESIGN.md` §4.1 is explicit: *signed* and
 *     *stale* are provenance, not object statuses, which is how "stale" once
 *     ended up next to "failed" in the same red. A stale row keeps whatever
 *     status it had and carries a *Stale* chip beside it.
 *
 * Pure: no React, no Firestore, no fetch. The screen is a client component and
 * the test reads this module directly.
 */

export interface WorkspaceRow {
  id: string;
  /** What the reader called it. */
  name: string;
  /** The line under the title, in mono — §2.4's Object Identifier. */
  identifier: string;
  isDemo: boolean;
  /** Lines of the analysed source, or `null` when nothing is staged. */
  lines: number | null;
  /**
   * True when `lines` is the figure the signed run recorded, false when it is a
   * count of text that nothing has analysed yet. Two different claims.
   */
  linesFromRun: boolean;
  /** Findings on record, or `null` when nothing has analysed this project. */
  findings: number | null;
  status: ObjectStatusValue;
  /** What the status is about, in the product's own words — from the phase contract. */
  statusDetail: string;
  /** Present when the result was built for a source that is no longer the one here. */
  stale: { note: string } | null;
  /** ISO 8601, for the mono date column. `null` when the project carries no date. */
  lastChange: string | null;
  /** A run can be started from this row: there is a source to run it on. */
  hasSource: boolean;
  /** Where the row opens. */
  href: string;
  /**
   * Whose it is. `shared` is a project another account invited this one to
   * read (roadmap 5.4) — read access only, so the row offers nothing that
   * writes: no run, no invitation, no duplicate, no delete.
   */
  access: 'own' | 'shared';
  /** A signed run is on record — the figures a row derives from the engine need one. */
  hasRun: boolean;
  /** Started from one of the shipped examples: fictitious code, real engine output. */
  fromExample: boolean;
  /**
   * Where the project stands in plain words (`lib/project-progress.ts`) — what
   * the Status filter offers. `null` for the demo, which is not a project of
   * anybody's and has no steps of its own.
   */
  stage: ProjectStage | null;
}

/**
 * How far this project has got, as one of the ten object statuses.
 *
 * Deliberately conservative at both ends. `not-started` is reached by a project
 * with nothing on it and by nothing else; `handed-over` needs an audit pack that
 * was actually exported (`auditMetadata.auditPackExportedAt`, written by the
 * export route), not a delivery phase that merely could be.
 *
 * `blocked-by-sap`, `mock-only`, `open` and `confirmed` are not produced here.
 * Each of them is a statement about one artefact — a rule, a test suite, a
 * standard candidate — and a project is not any of those. A vocabulary is only
 * a vocabulary while its values are not stretched to cover whatever is nearby.
 */
export function projectStatus(project: Project | null | undefined): {
  status: ObjectStatusValue;
  detail: string;
} {
  const steps = workflowSteps(project ?? null);
  const { doneCount, total, next } = workflowSummary(steps);
  const hasSource = typeof project?.legacyCode === 'string' && project.legacyCode.trim().length > 0;
  const hasRun = typeof project?.activeRunId === 'string' && project.activeRunId.trim().length > 0;

  if (project?.auditMetadata?.auditPackExportedAt) {
    return { status: 'handed-over', detail: 'An audit pack was exported for this project.' };
  }
  if (doneCount === total) {
    return { status: 'done', detail: 'Every phase has its own evidence on record.' };
  }
  if (!hasSource && !hasRun) {
    return { status: 'not-started', detail: 'No source staged and no run on record.' };
  }
  if (!hasRun) {
    return { status: 'draft', detail: 'Source staged — no signed run yet, and every later figure derives from one.' };
  }
  return { status: 'partial', detail: `${next.label} — ${next.badge}. ${next.detail}` };
}

/** Why this project's result is no longer current, or `null`. §4: *Stale*, not *failed*. */
export function projectStale(project: Project | null | undefined): { note: string } | null {
  const s = staleness(project ?? null);
  if (s.sourceChanged) return { note: 'source changed' };
  if (s.unverifiedInputs.length > 0) return { note: 'inputs changed' };
  return null;
}

/**
 * Firestore timestamp, `Date`, or ISO string → the ISO date §3 asks for in a
 * table. Delegates to `formatIsoDate` in `lib/format.ts` (block D, D.29), the
 * one place that turns a moment into "2026-09-15", so the list report and every
 * other table print the same day for the same instant. A falsy value (nothing
 * recorded, or a zero that is not a date anyone wrote) stays `null` here, as it
 * always did.
 */
export function isoDate(value: unknown): string | null {
  if (!value) return null;
  return formatIsoDate(value);
}

export function toWorkspaceRow(
  project: Project & { id: string },
  access: 'own' | 'shared' = 'own',
): WorkspaceRow {
  const source = typeof project.legacyCode === 'string' ? project.legacyCode : '';
  const hasSource = source.trim().length > 0;
  const hasRun = typeof project.activeRunId === 'string' && project.activeRunId.trim().length > 0;
  const recordedLines = project.auditMetadata?.inputFingerprint?.lineCount;

  // A recorded line count belongs to the signed run; a counted one belongs to
  // text nobody has analysed. Both are printed, and the row says which it has.
  const lines =
    typeof recordedLines === 'number'
      ? recordedLines
      : hasSource
        ? countSourceLines(source)
        : null;

  const { status, detail } = projectStatus(project);

  return {
    id: project.id,
    name: project.name,
    identifier: [project.id, project.auditMetadata?.inputFingerprint?.fileName]
      .filter((part): part is string => typeof part === 'string' && part.length > 0)
      .join(' · '),
    isDemo: false,
    lines,
    linesFromRun: typeof recordedLines === 'number',
    // Not `worklist.length || 0`: a project nothing has analysed has no finding
    // count, and 0 is a measurement.
    findings: hasRun && Array.isArray(project.worklist) ? project.worklist.length : null,
    status,
    statusDetail: detail,
    stale: projectStale(project),
    lastChange: isoDate(project.updatedAt) ?? isoDate(project.createdAt),
    hasSource,
    // The workspace of the project (roadmap 3.0): it opens on the Business
    // view, and every stage is one step from there.
    href: `/project/${project.id}`,
    access,
    hasRun,
    fromExample: project.fromExample === true,
    stage: projectProgress(project).stage,
  };
}

/** The status filter's options — "Any status" is the screen's, not this list's. */
/** The stages the rows are in, in the order a project moves — what the Status filter offers. */
export function stagesPresent(rows: readonly WorkspaceRow[]): ProjectStage[] {
  const order: ProjectStage[] = ['not-started', 'not-analysed', 'in-progress', 'all-done', 'handed-over'];
  return order.filter((stage) => rows.some((row) => row.stage === stage));
}

export function statusesPresent(rows: readonly WorkspaceRow[]): ObjectStatusValue[] {
  const seen: ObjectStatusValue[] = [];
  for (const row of rows) if (!seen.includes(row.status)) seen.push(row.status);
  return seen;
}

export interface WorkspaceFilter {
  search: string;
  /** A project stage (`ProjectStage`), or '' for any. */
  status: string;
  /** A clean core level the project has findings at — 'A' … 'D' — or '' for any. */
  level: string;
  /** Mine, shared with me, or both (''). */
  access: '' | 'own' | 'shared';
}

export const EMPTY_FILTER: WorkspaceFilter = { search: '', status: '', level: '', access: '' };

export function filterIsActive(filter: WorkspaceFilter): boolean {
  return (
    filter.search.trim().length > 0 ||
    filter.status.length > 0 ||
    filter.level.length > 0 ||
    filter.access.length > 0
  );
}

/** How the table is ordered. The demo stays first either way — it is not one of the reader's projects. */
export type WorkspaceSort = 'last-change' | 'name';

export function sortWorkspaceRows(rows: readonly WorkspaceRow[], sort: WorkspaceSort): WorkspaceRow[] {
  const demo = rows.filter((r) => r.isDemo);
  const rest = rows.filter((r) => !r.isDemo);
  const sorted =
    sort === 'name'
      ? [...rest].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
      : // Newest first; a project with no date at all goes last rather than first.
        [...rest].sort((a, b) => (b.lastChange ?? '').localeCompare(a.lastChange ?? ''));
  return [...demo, ...sorted];
}

/**
 * Live filtering, §2.5. Case-insensitive over the two things a reader has in
 * their head — what they called it and what it is called in the system.
 */
/**
 * @param hasLevel whether a row has findings at a level — `null` while that is
 *   not known yet. Only asked when a level filter is set; a row that is still
 *   being read is kept rather than hidden, so a filter never makes a project
 *   disappear because a request was slow.
 */
export function applyWorkspaceFilter(
  rows: readonly WorkspaceRow[],
  filter: WorkspaceFilter,
  hasLevel: (row: WorkspaceRow, level: string) => boolean | null = () => null,
): WorkspaceRow[] {
  const needle = filter.search.trim().toLowerCase();
  return rows.filter((row) => {
    if (filter.status && row.stage !== filter.status) return false;
    if (filter.access && (row.isDemo || row.access !== filter.access)) return false;
    if (filter.level && hasLevel(row, filter.level) === false) return false;
    if (!needle) return true;
    return `${row.name} ${row.identifier}`.toLowerCase().includes(needle);
  });
}
