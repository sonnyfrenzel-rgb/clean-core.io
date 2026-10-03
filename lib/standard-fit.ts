import {
  TARGET_PLATFORM_LABELS,
  type CloudReadinessGrade,
  type PublicCloudFitAssignment,
  type PublicCloudFitBucket,
  type TargetPlatform,
} from './abap/public-cloud-fit';
import type { ItFindingRow, ItFindingsSource } from './it-findings';
import type { ChartSegment, FitByPlatform, Loaded } from './management-overview';
import type { PhaseState } from './workflow-steps';
import type { ProvenanceValue } from './provenance';

/**
 * Fit to standard — one headline figure for the Management view (ADR-066,
 * owner 03.10.2026: "for Public Cloud a clear fit-to-standard value — not only
 * the four buckets … what prevents standard here and what does not").
 *
 * **Definition.** Of the SAP objects this code uses, the share that has a
 * released path on the project's target platform:
 *
 *   fits     = Keep (released for the platform, used as it is)
 *            + Rebuild on a path SAP names (`rebuild-path`: a released
 *              successor, or the object itself as a released API)
 *   counted  = every SAP object the buckets could sort, Retire left out
 *   figure   = fits of counted — printed as "n of m" and as a percentage
 *
 * What blocks the standard path is the rest of `counted`: an object SAP names
 * no path for (*No catalogued path*), and the project's own work on an SAP
 * object — a direct write to an SAP table (level D, ADR-062) or a
 * modification. The project's own objects (`own-object`, `heuristic` grades)
 * are not in the measure: they are not SAP's standard either way.
 *
 * **Not determined, never a default.** The figure is `not-determined`, with
 * its reason, when there is no signed run, when the source changed since the
 * signed run, when no target platform is set, while the evidence is read or
 * when it could not be read, and when there is no SAP object to count. It is
 * never 0 % for "nothing measured" and never 100 % for "nothing found"
 * (`tests/unearned-verdicts-guard.spec.ts`, `tests/standard-fit.spec.ts`).
 *
 * **Our measure, not SAP's.** SAP publishes the repository files the buckets
 * read; it publishes no fit-to-standard figure. The card says so beside the
 * number.
 *
 * Pure: no React, no Firestore, no `fetch`. A view, never stored or signed —
 * like the clean core level it rests on, it is not part of the audit pack.
 */

/** The definition in one paragraph — the card's information popover and the ADR say the same. */
export const STANDARD_FIT_DEFINITION =
  "Clean-Core.io's own measure, not an SAP figure. Of the SAP objects this code uses, the share that has a released "
  + 'path on the target platform: released for it and used as it is, or with a released successor SAP names. '
  + "Counted from the signed run's source and SAP's synced repository files. Objects that could not be sorted, "
  + "objects to retire and the project's own objects are not counted.";

export type StandardFitWhy =
  | 'reading'
  | 'unread'
  | 'no-run'
  | 'source-changed'
  | 'no-target'
  | 'no-objects'
  | 'none-sorted';

/** One object, named with its level, its line and where the statement comes from. */
export interface StandardFitItem {
  objectName: string;
  bucket: PublicCloudFitBucket;
  /** The level as the code uses the object — a direct write is D whatever the object is on its own (ADR-062). */
  level: CloudReadinessGrade;
  /** The first source line the engine found the object on, or `null` when no finding names a line. */
  line: number | null;
  /** In plain words: what blocks the standard path, or why it does not. */
  why: string;
  /** `imported` where SAP's repository says it, `reconstructed` where the engine read it from the code. */
  provenance: ProvenanceValue;
}

export type StandardFit =
  | {
      state: 'not-determined';
      why: StandardFitWhy;
      /** One sentence: why there is no figure, and what would give one. */
      reason: string;
      platform: TargetPlatform | null;
    }
  | {
      state: 'ready';
      /** `signed-run` in a project; `demo` on the demo, which can never be signed and says so. */
      basis: 'signed-run' | 'demo';
      platform: TargetPlatform;
      platformLabel: string;
      fits: number;
      counted: number;
      /** fits of counted, rounded, and never 0 or 100 unless it is exactly that. */
      percent: number;
      /** Fits split: used as released, and with a released successor named. */
      released: number;
      successor: number;
      blocking: number;
      /** SAP objects the buckets could not sort — named, not counted. */
      notSorted: number;
      retire: number;
      /** "5 of 8 SAP objects this code uses have a released path on Public Edition." */
      sentence: string;
      /** What was left out of the count, as one line — empty when nothing was. */
      coverage: string;
      blockers: StandardFitItem[];
      clear: StandardFitItem[];
      /**
       * The SAP objects across the four buckets, Rebuild split into the part on
       * a path SAP names and the project's own work, in the order of the meter:
       * what has a path, what blocks it, what is not counted.
       */
      groups: Array<{ key: 'fits' | 'blocks' | 'uncounted'; count: number; segments: ChartSegment[] }>;
    };

export interface StandardFitSource {
  mode: 'project' | 'demo';
  /** `Project.activeRunId` is set. */
  hasRun: boolean;
  /** The Analyze phase from `workflowSteps` — `done` means a current, readable signed run. */
  analyzeState: PhaseState;
  /** The digest of the source the signed run analysed, when the run recorded one. */
  signedSourceSha256: string | null;
  findings: Loaded<ItFindingsSource>;
  fit: Loaded<FitByPlatform>;
}

const LEVEL_RANK: Record<CloudReadinessGrade, number> = { A: 1, B: 2, C: 3, D: 4, Unknown: 0 };

const notDetermined = (why: StandardFitWhy, reason: string, platform: TargetPlatform | null = null): StandardFit => ({
  state: 'not-determined',
  why,
  reason,
  platform,
});

/** A share that is never rounded into a verdict it did not earn: 0 % and 100 % only when exact. */
export function fitPercent(fits: number, counted: number): number {
  if (counted <= 0) throw new Error('fitPercent needs a positive count');
  if (fits <= 0) return 0;
  if (fits >= counted) return 100;
  return Math.min(99, Math.max(1, Math.round((fits / counted) * 100)));
}

const isSapObject = (a: PublicCloudFitAssignment) =>
  a.levelProvenance === 'catalog' || a.levelProvenance === 'catalog-residual';

function rowsByObject(rows: readonly ItFindingRow[]): Map<string, ItFindingRow[]> {
  const out = new Map<string, ItFindingRow[]>();
  for (const r of rows) {
    const name = (r.objectName ?? '').trim().toUpperCase();
    if (!name) continue;
    const list = out.get(name) ?? [];
    list.push(r);
    out.set(name, list);
  }
  return out;
}

function itemFor(a: PublicCloudFitAssignment, rows: readonly ItFindingRow[], platformLabel: string): StandardFitItem {
  const write = rows.find((r) => r.kind === 'standard-table-write');
  const modification = rows.find((r) => r.kind === 'modification');
  // The level as the code uses the object: the strictest the engine gave any of
  // its findings, falling back to the object's own grade.
  const level = rows.reduce<CloudReadinessGrade>(
    (worst, r) => (r.level && LEVEL_RANK[r.level] > LEVEL_RANK[worst] ? r.level : worst),
    a.level,
  );
  const first = rows.reduce<number | null>((min, r) => (min === null || r.lineStart < min ? r.lineStart : min), null);

  let why: string;
  let provenance: ProvenanceValue = 'imported';
  let line = first;
  switch (a.rule) {
    case 'keep-platform-level':
      why = `Released for ${platformLabel} — used as it is.`;
      break;
    case 'rebuild-path':
      why = 'SAP names a released successor — known work.';
      break;
    case 'no-catalogued-path-none-named':
      why = 'SAP names no released successor and no extension path.';
      break;
    case 'no-catalogued-path-not-listed':
      why = "Not in SAP's release file — no path is named.";
      break;
    default:
      provenance = 'reconstructed';
      if (write) {
        why = 'The code writes directly to this SAP table.';
        line = write.lineStart;
      } else if (modification) {
        why = 'The code modifies this SAP object.';
        line = modification.lineStart;
      } else {
        why = "Below what the platform keeps — the project's own rebuild.";
      }
  }
  return { objectName: a.objectName, bucket: a.bucket as PublicCloudFitBucket, level, line, why, provenance };
}

/** Blockers: no path named first, then the project's own work; within each the stricter level, then the line. */
function byWeight(a: StandardFitItem, b: StandardFitItem): number {
  const group = (i: StandardFitItem) => (i.bucket === 'no-catalogued-path' ? 0 : 1);
  return (
    group(a) - group(b)
    || LEVEL_RANK[b.level] - LEVEL_RANK[a.level]
    || (a.line ?? Number.MAX_SAFE_INTEGER) - (b.line ?? Number.MAX_SAFE_INTEGER)
    || a.objectName.localeCompare(b.objectName)
  );
}

export function standardFit(src: StandardFitSource): StandardFit {
  // What the figure stands on, in the order a reader can fix it.
  if (src.mode === 'project') {
    if (!src.hasRun) {
      return notDetermined('no-run', 'No signed run yet — this figure is computed only from a signed run.');
    }
    if (src.analyzeState === 'stale') {
      return notDetermined('source-changed', 'The source or an input changed after the signed run — run the analysis again.');
    }
    if (src.analyzeState !== 'done') {
      return notDetermined('no-run', 'The signed run could not be read, so nothing it found can be counted.');
    }
  }
  if (src.findings.state === 'loading' || src.fit.state === 'loading') {
    return notDetermined('reading', 'Still being read.');
  }
  if (src.findings.state === 'absent') return notDetermined('unread', src.findings.reason);
  if (src.fit.state === 'absent') return notDetermined('unread', src.fit.reason);
  if (
    src.mode === 'project'
    && src.signedSourceSha256
    && src.findings.value.sourceSha256
    && src.findings.value.sourceSha256 !== src.signedSourceSha256
  ) {
    return notDetermined('source-changed', 'The source on this project is not the one the signed run read — run the analysis again.');
  }

  const platform = src.fit.value.target;
  if (!platform) {
    return notDetermined('no-target', 'No target platform is set — the figure depends on it. Choose one in Analyze.');
  }
  const platformLabel = TARGET_PLATFORM_LABELS[platform];
  const assignments = src.fit.value[platform].assignments.filter(isSapObject);
  const retire = assignments.filter((a) => a.bucket === 'retire').length;
  const inScope = assignments.filter((a) => a.bucket !== 'retire');
  if (inScope.length === 0) {
    return notDetermined('no-objects', 'The signed run names no SAP object to measure, so there is no figure.', platform);
  }
  const sorted = inScope.filter((a) => a.bucket !== null);
  const notSorted = inScope.length - sorted.length;
  if (sorted.length === 0) {
    return notDetermined(
      'none-sorted',
      `None of the ${inScope.length} SAP objects could be sorted into a bucket, so there is no figure.`,
      platform,
    );
  }

  const rows = rowsByObject(src.findings.value.rows);
  const items = sorted.map((a) => itemFor(a, rows.get(a.objectName.toUpperCase()) ?? [], platformLabel));
  const fitting = (a: PublicCloudFitAssignment) => a.rule === 'keep-platform-level' || a.rule === 'rebuild-path';
  const clear: StandardFitItem[] = [];
  const blockers: StandardFitItem[] = [];
  sorted.forEach((a, n) => (fitting(a) ? clear : blockers).push(items[n]));
  blockers.sort(byWeight);
  clear.sort((a, b) => (a.bucket === b.bucket ? a.objectName.localeCompare(b.objectName) : a.bucket === 'keep' ? -1 : 1));

  const released = sorted.filter((a) => a.rule === 'keep-platform-level').length;
  const fits = clear.length;
  const counted = sorted.length;
  const left = [
    notSorted > 0 ? `${notSorted} SAP object${notSorted === 1 ? '' : 's'} could not be sorted` : null,
    retire > 0 ? `${retire} to retire` : null,
  ].filter(Boolean);

  const seg = (key: string, label: string, count: number, tone: ChartSegment['tone'], nd = false): ChartSegment => ({
    key,
    label,
    count,
    tone,
    notDetermined: nd,
  });
  const groups: Extract<StandardFit, { state: 'ready' }>['groups'] = [
    {
      key: 'fits',
      count: fits,
      segments: [
        seg('keep', 'Keep', released, 'chart-4'),
        seg('rebuild-path', 'Rebuild · path named', fits - released, 'chart-3'),
      ],
    },
    {
      key: 'blocks',
      count: blockers.length,
      segments: [
        seg('no-catalogued-path', 'No catalogued path', sorted.filter((a) => a.bucket === 'no-catalogued-path').length, 'chart-2'),
        seg('rebuild-own', 'Rebuild · own work', sorted.filter((a) => a.bucket === 'rebuild' && a.rule !== 'rebuild-path').length, 'chart-5'),
      ],
    },
    {
      key: 'uncounted',
      count: retire + notSorted,
      segments: [seg('retire', 'Retire', retire, 'chart-1'), seg('not-assigned', 'Not assigned', notSorted, 'not-determined', true)],
    },
  ];

  return {
    state: 'ready',
    groups,
    basis: src.mode === 'demo' ? 'demo' : 'signed-run',
    platform,
    platformLabel,
    fits,
    counted,
    percent: fitPercent(fits, counted),
    released,
    successor: fits - released,
    blocking: blockers.length,
    notSorted,
    retire,
    sentence: `${fits} of ${counted} SAP object${counted === 1 ? '' : 's'} this code uses ${counted === 1 ? 'has' : 'have'} a released path on ${platformLabel}.`,
    coverage: left.length > 0 ? `Not counted: ${left.join(', ')}.` : '',
    blockers,
    clear,
  };
}
