import type { LayerKey, WorkspaceView } from './workspace-model';
import { BUSINESS_MAP_ID } from './business-layers';
import type { Project } from './types';

/**
 * The IT view's own sections and its anchor bar (owner decision 10.10.2026,
 * ADR-086, amending ADR-018 and `DESIGN.md` §2.3 item 4).
 *
 * IT shows only its own content: the answer, then **Findings → Objects &
 * dependencies → Open questions** in the main column and **target profile
 * (with imports) → Route & contract → Run & trust** in the side column. The
 * anchor bar mirrors that order and jumps within the page; a section with
 * nothing in it has no anchor — never an "empty" chip. Business and
 * Management keep the six layers.
 *
 * Like a layer, the place is held in the URL fragment and nowhere else: the
 * view is a lens, never stored on a project, run or pack.
 */
export const IT_SECTIONS = ['findings', 'objects', 'questions', 'profile', 'route', 'trust'] as const;
export type ItSectionKey = (typeof IT_SECTIONS)[number];

/** The element id — and so the fragment — of each IT section. */
export const IT_SECTION_IDS: Readonly<Record<ItSectionKey, string>> = {
  findings: 'it-findings',
  objects: 'it-objects',
  // The open questions keep the address every view and stage already links to.
  questions: 'not-determined',
  profile: 'it-target-profile',
  route: 'it-route',
  trust: 'it-trust',
};

/**
 * The anchors the bar offers, in the page's order. The target profile has no
 * anchor of its own: it heads the side column directly beside the findings,
 * and five anchors are what the owner named.
 */
export const IT_ANCHORS = ['findings', 'objects', 'questions', 'route', 'trust'] as const satisfies readonly ItSectionKey[];

/**
 * Where a layer address lands when the reader is in IT — the IT view has no
 * layers any more, so an old link (`?view=it#need`, a bookmark, a mail, a
 * stage's way back) goes where that content lives now: the process and the
 * standard fit to Business, the costs to the Economics tool, the decision to
 * Management, architecture and evidence to IT's own sections.
 */
export type LayerHome = { kind: 'view'; view: WorkspaceView; hash: string } | { kind: 'economics' };

export const IT_LAYER_ELSEWHERE: Readonly<Record<LayerKey, LayerHome>> = {
  need: { kind: 'view', view: 'business', hash: BUSINESS_MAP_ID },
  standard: { kind: 'view', view: 'business', hash: 'standard' },
  costs: { kind: 'economics' },
  architecture: { kind: 'view', view: 'it', hash: IT_SECTION_IDS.objects },
  evidence: { kind: 'view', view: 'it', hash: IT_SECTION_IDS.trust },
  changes: { kind: 'view', view: 'management', hash: 'decision-card' },
};

/* ------------------------------------------------------------ Run & trust */

export interface RunTrust {
  /** A signed run on record and readable. */
  signed: boolean;
  /** A run id is on record but the run could not be read. */
  unreadable: boolean;
  /** The first eight characters of the run id. */
  runId: string | null;
  /** `2026-10-09` — when the run's analysis was made, where recorded. */
  runDay: string | null;
  fingerprint: { sha: string; fileName: string | null } | null;
  /** The day the audit pack was exported for this run, or `null`. */
  packDay: string | null;
}

const short = (v: unknown): string | null => (typeof v === 'string' && v.length >= 8 ? v.slice(0, 8) : null);
const day = (v: unknown): string | null => (typeof v === 'string' && v.length >= 10 ? v.slice(0, 10) : null);

/**
 * What the IT reader checks before trusting the rest: which run was signed,
 * over which source, and whether its audit pack left the building. Read off
 * the project the page already holds; the versions of engine, rules and
 * catalog stay in the header's "Details" line, said once.
 */
export function runTrust(project: Project | null): RunTrust {
  const runId = typeof project?.activeRunId === 'string' ? project.activeRunId.trim() : '';
  const unreadable = runId.length > 0 && project?._runLoadFailed === true;
  const signed = runId.length > 0 && !unreadable;
  const fp = project?.auditMetadata?.inputFingerprint ?? null;
  const meta = project?.auditMetadata;
  // A pack exported for an earlier run is not this run's pack.
  const packForThisRun =
    typeof meta?.auditPackExportedAt === 'string' &&
    (typeof meta.auditPackExportedRunId !== 'string' || meta.auditPackExportedRunId === runId);
  return {
    signed,
    unreadable,
    runId: signed ? short(runId) ?? runId : null,
    runDay: signed ? day(meta?.modelCard?.analysisTimestamp) : null,
    fingerprint: signed && short(fp?.sha256) ? { sha: short(fp?.sha256) as string, fileName: fp?.fileName || null } : null,
    packDay: signed && packForThisRun ? day(meta?.auditPackExportedAt) : null,
  };
}

/**
 * Brings the element with this id into view once it has rendered — after a
 * view switch the place is not on the page yet, and a client navigation does
 * not scroll to a fragment it cannot find. Gives up after three seconds.
 */
export function scrollToWhenThere(id: string): void {
  if (typeof window === 'undefined') return;
  const started = performance.now();
  const land = () => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ block: 'start' });
    else if (performance.now() - started < 3000) window.requestAnimationFrame(land);
  };
  window.requestAnimationFrame(land);
}
