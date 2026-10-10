import type { CloudReadinessGrade } from './abap/abcd-classification';
import { RELEASE_PINNED_EDITIONS, type Edition } from './assessment-profile';
import {
  PUBLIC_CLOUD_FIT_BUCKET_LABELS,
  PUBLIC_CLOUD_FIT_BUCKETS,
  TARGET_PLATFORM_LABELS,
  type PublicCloudFitAssignment,
  type PublicCloudFitBucket,
  type TargetPlatform,
} from './abap/public-cloud-fit';
import type { ItFindingRow, ItFindingsSource, ItView } from './it-findings';
import { distinctFindingCount, placesInTheCode } from './it-findings';

/**
 * The IT view's arrangement of what `lib/it-findings.ts` already derived —
 * the facet tiles, the filter bar, the clean core level per SAP object and the
 * target profile in the side column (mockup v2.8 `s4`, gap audit row 6).
 *
 * Nothing here is a new judgement. Every count is a count over the findings
 * route's rows; every bucket is the Public-Cloud-Fit resolver's answer for an
 * object, looked up under the project's target profile (`useFitByPlatform`);
 * every catalog sentence names the snapshot the route says it read. Where a
 * fact is missing the function returns `null` and the reason, never a zero.
 *
 * Pure — no React, no Firestore, no `fetch`, no catalog — so the browser can
 * hold it and a spec can drive it from fixtures. The level stays a view: nothing
 * here is stored or signed (`CLAUDE.md`).
 */

/* --------------------------------------------------------------- kinds */

export interface KindCount {
  kind: string;
  /** "reads of SAP standard tables" — the router's words, or the kind itself. */
  label: string;
  count: number;
}

/** The plain words for a row's kind, as the route sent them. */
export function kindLabelOf(row: Pick<ItFindingRow, 'kind' | 'kindLabel'>): string {
  return row.kindLabel && row.kindLabel.trim() ? row.kindLabel : row.kind.replace(/-/g, ' ');
}

/** Findings per kind, largest first, then by label — one entry per kind present. */
export function kindBreakdown(rows: readonly ItFindingRow[]): KindCount[] {
  const map = new Map<string, KindCount>();
  for (const row of rows) {
    const held = map.get(row.kind) ?? { kind: row.kind, label: kindLabelOf(row), count: 0 };
    held.count += 1;
    map.set(row.kind, held);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/* --------------------------------------------------------------- levels */

/** The level counts the answer leads with. `null` when no finding carries a level. */
export function worstLevel(rows: readonly ItFindingRow[]): { grade: CloudReadinessGrade; count: number } | null {
  for (const grade of ['D', 'C', 'B', 'A'] as const) {
    const count = rows.filter((row) => row.level === grade).length;
    if (count > 0) return { grade, count };
  }
  return null;
}

/* --------------------------------------------------------------- answer */

export interface ItAnswerHead {
  /** "25 findings at 31 places in the code · 2 places at level D" — the first line of the IT view. */
  title: string;
  /** What the engine read, beside it: "in 668 lines · 9 constructs not assessed". */
  coverage: string;
}

export function itAnswerHead(source: ItFindingsSource | null): ItAnswerHead {
  if (source === null) {
    return {
      title: 'The findings of this project could not be read',
      coverage: 'Nothing here is answered — an empty table would say there were none.',
    };
  }
  const rows = source.rows;
  const n = rows.length;
  const worst = worstLevel(rows);
  // Findings as Analyze counts them; the rows, and so the level count, are places in the code.
  const f = distinctFindingCount(rows);
  const lead = `${f} ${f === 1 ? 'finding' : 'findings'} at ${n} ${placesInTheCode(n)}`;
  const title =
    n === 0
      ? 'No findings in the staged source'
      : worst
        ? `${lead} · ${worst.count} ${worst.count === 1 ? 'place' : 'places'} at level ${worst.grade}`
        : `${lead} · no clean core level determined`;
  const cov = source.coverage;
  const notAssessed = cov ? cov.gaps.reduce((sum, g) => sum + g.count, 0) : null;
  const coverage = cov
    ? `in ${cov.lines} ${cov.lines === 1 ? 'line' : 'lines'} the engine read` +
      (notAssessed && notAssessed > 0
        ? ` · ${notAssessed} ${notAssessed === 1 ? 'construct' : 'constructs'} it saw but does not assess`
        : ' · every construct it saw is assessed')
    : 'how much of the source was read is not recorded for this answer';
  return { title, coverage };
}

/**
 * "Is it right" in one sentence — how far the chain from requirement to target
 * holds, and where it stops. Built from `ItView.chainCoverage` and
 * `chainEnds`; the unreadable and empty cases keep the view's own headline.
 */
export function isItRight(view: Pick<ItView, 'rows' | 'unreadable' | 'headline' | 'chainCoverage' | 'chainEnds'>): string {
  if (view.unreadable || view.rows.length === 0) return view.headline;
  const n = view.rows.length;
  const complete = view.chainCoverage.counted ?? 0;
  const ends = view.chainEnds.filter((e) => e.count > 0).map((e) => `${e.count} stop at ${e.label}`);
  return (
    `The chain from requirement to target is complete for ${complete} of ${n} ${placesInTheCode(n)}` +
    (ends.length > 0 ? ` — ${ends.join(', ')}.` : '.')
  );
}

/* ------------------------------------------------------- where to: buckets */

export const NOT_ASSIGNED = 'not-assigned' as const;
export type BucketKey = PublicCloudFitBucket | typeof NOT_ASSIGNED;

export const BUCKET_LABELS: Record<BucketKey, string> = {
  ...PUBLIC_CLOUD_FIT_BUCKET_LABELS,
  [NOT_ASSIGNED]: 'Not assigned',
};

/** The four buckets and *not assigned*, in the order DESIGN.md §5.6 lists them. */
export const BUCKET_KEYS: readonly BucketKey[] = [...PUBLIC_CLOUD_FIT_BUCKETS, NOT_ASSIGNED];

export interface WhereTo {
  platform: TargetPlatform;
  platformLabel: string;
  /** The project declared this platform — or it is only the comparison. */
  declared: boolean;
  /** Objects per bucket on this platform, in `BUCKET_KEYS` order. */
  counts: Array<{ bucket: BucketKey; label: string; count: number }>;
  /** Assignment per object name, for the table's Target column. */
  byObject: Map<string, PublicCloudFitAssignment>;
  /** "For the Private Edition — your target: 5 rebuild, 3 without a catalogued path …". */
  sentence: string;
}

/**
 * Where the objects go on the project's own platform.
 *
 * The project that declares no platform is read on the Public Edition — the
 * same default the run route and `catalogLookupTargetOf` take — and the
 * sentence says it was not declared rather than calling it the target.
 */
export function whereTo(
  fit: { target: TargetPlatform | null; private: { assignments: PublicCloudFitAssignment[] }; public: { assignments: PublicCloudFitAssignment[] } },
): WhereTo {
  const platform: TargetPlatform = fit.target ?? 'public';
  const declared = fit.target !== null;
  const assignments = fit[platform].assignments;
  const byObject = new Map(assignments.map((a) => [a.objectName, a]));
  const counts = BUCKET_KEYS.map((bucket) => ({
    bucket,
    label: BUCKET_LABELS[bucket],
    count: assignments.filter((a) => (a.bucket ?? NOT_ASSIGNED) === bucket).length,
  }));
  const platformLabel = TARGET_PLATFORM_LABELS[platform];
  const parts = counts
    .filter((c) => c.count > 0)
    .map((c) => `${c.count} ${c.label.toLowerCase()}`);
  const lead = declared
    ? `For the ${platformLabel} — the project's target`
    : `For the ${platformLabel} — no target is declared, so the default the run uses`;
  const sentence =
    assignments.length === 0
      ? `${lead}: no finding names an SAP object, so there is nothing to place.`
      : `${lead}: ${parts.join(', ')} ${assignments.length === 1 ? '(1 object)' : `(of ${assignments.length} objects)`}.`;
  return { platform, platformLabel, declared, counts, byObject, sentence };
}

/* ------------------------------------------------------- the filter bar */

/** `''` is "all"; `none` on the level is the findings that carry no level. */
export interface ItFilters {
  search: string;
  kind: string;
  level: '' | CloudReadinessGrade | 'none';
  bucket: '' | BucketKey;
}

export const NO_FILTERS: ItFilters = { search: '', kind: '', level: '', bucket: '' };

export function filtersActive(f: ItFilters): boolean {
  return Boolean(f.search.trim() || f.kind || f.level || f.bucket);
}

/**
 * The rows that pass every filter. The search reads the object, the finding id,
 * the title, the routine, the kind and the line (`L141` or `141`).
 *
 * The bucket filter needs a bucket per object; while the lookup has not
 * answered (`where` is `null`) it filters nothing rather than everything — a
 * table that empties itself because a lookup is slow reads as "no findings".
 */
export function filterRows(
  rows: readonly ItFindingRow[],
  f: ItFilters,
  where: WhereTo | null,
): ItFindingRow[] {
  const q = f.search.trim().toLowerCase();
  const line = /^l?(\d+)$/i.exec(q);
  return rows.filter((row) => {
    if (f.kind && row.kind !== f.kind) return false;
    if (f.level === 'none' && row.level !== null) return false;
    if (f.level && f.level !== 'none' && row.level !== f.level) return false;
    if (f.bucket && where) {
      const a = row.objectName ? where.byObject.get(row.objectName) : undefined;
      // A finding about a statement has no object, so no bucket at all — it is
      // in none of the five, *not assigned* included.
      if (!a) return false;
      if ((a.bucket ?? NOT_ASSIGNED) !== f.bucket) return false;
    }
    if (!q) return true;
    if (line) {
      const n = Number(line[1]);
      if (row.lineStart === n || (row.lineEnd !== null && n >= row.lineStart && n <= row.lineEnd)) return true;
    }
    return [row.objectName, row.id, row.title, row.routine, row.kind, kindLabelOf(row)]
      .filter((v): v is string => typeof v === 'string')
      .some((v) => v.toLowerCase().includes(q));
  });
}

/* ----------------------------------------- the clean core level per object */

export interface ItObjectRow {
  name: string;
  type: string | null;
  /** Every distinct level its findings carry, worst first — a read and a write of one table can differ. */
  levels: CloudReadinessGrade[];
  releaseView: string | null;
  classificationView: string | null;
  successor: string | null;
  /** The findings on this object, in source order. */
  findings: Array<{ id: string; line: number }>;
}

const LEVEL_ORDER: Record<CloudReadinessGrade, number> = { D: 0, C: 1, B: 2, A: 3, Unknown: 4 };

/**
 * One row per SAP object the findings name, with the level the catalog of the
 * target profile gives it. Findings about a statement name no object and are
 * counted apart (`withoutObject`) — never folded in as Unknown.
 */
export function objectsOf(rows: readonly ItFindingRow[]): { objects: ItObjectRow[]; withoutObject: number } {
  const map = new Map<string, ItObjectRow>();
  let withoutObject = 0;
  for (const row of rows) {
    if (!row.objectName) {
      withoutObject += 1;
      continue;
    }
    const held: ItObjectRow = map.get(row.objectName) ?? {
      name: row.objectName,
      type: row.objectType,
      levels: [],
      releaseView: null,
      classificationView: null,
      successor: null,
      findings: [],
    };
    if (row.level && !held.levels.includes(row.level)) held.levels.push(row.level);
    held.type = held.type ?? row.objectType;
    held.releaseView = held.releaseView ?? row.releaseView;
    held.classificationView = held.classificationView ?? row.classificationView;
    held.successor = held.successor ?? row.successor;
    held.findings.push({ id: row.id, line: row.lineStart });
    map.set(row.objectName, held);
  }
  const objects = [...map.values()].map((o) => ({
    ...o,
    levels: [...o.levels].sort((a, b) => LEVEL_ORDER[a] - LEVEL_ORDER[b]),
    findings: [...o.findings].sort((a, b) => a.line - b.line),
  }));
  objects.sort(
    (a, b) =>
      (LEVEL_ORDER[a.levels[0] ?? 'Unknown'] - LEVEL_ORDER[b.levels[0] ?? 'Unknown']) ||
      a.name.localeCompare(b.name),
  );
  return { objects, withoutObject };
}

/* ------------------------------------------------------- the target profile */

export interface CatalogProfile {
  /** "S/4HANA Cloud Private Edition" — or the default, said as one. */
  edition: string;
  editionDeclared: boolean;
  /** The declared release, or `null` when none is declared. */
  release: string | null;
  /**
   * Whether a release can change what this edition's levels are read from.
   * Only for the Private Edition does SAP publish release-pinned lists
   * (`RELEASE_PINNED_EDITIONS`); for the Public Edition the current list is the
   * list, so a missing release is not a gap there and is not shown as one.
   */
  releaseMatters: boolean;
  /** "SAP's list for the Private Edition (moving list)", or `null` when the answer named none. */
  catalog: string | null;
  /** `pce-latest · 3f9a…` — the technical name, one level deeper. */
  catalogKey: string | null;
  /** The sentence beside the level distribution. Names the snapshot, or says it was not recorded. */
  note: string;
}

const EDITION_WORDS: Record<string, string> = {
  public: 'S/4HANA Cloud Public Edition',
  private: 'S/4HANA Cloud Private Edition',
  btp: 'SAP BTP ABAP environment',
  'on-premise': 'S/4HANA on-premise',
};

/** The words for a snapshot key the sync script writes; `null` for a key this build does not name. */
export function catalogSnapshotWords(key: string): string | null {
  if (key === 'latest') return 'SAP’s release list for the Public Edition (moving list)';
  if (key === 'pce-latest') return 'SAP’s release list for the Private Edition (moving list)';
  if (key === 'btp-latest') return 'SAP’s release list for the SAP BTP ABAP environment (moving list)';
  const pinned = /^pce-(20\d{2})-(\d{1,2})$/.exec(key);
  if (pinned) {
    return `SAP’s release list for the Private Edition ${pinned[1]} FPS${pinned[2].padStart(2, '0')} (release-pinned)`;
  }
  return null;
}

/**
 * The target profile the levels were read under — edition and release from the
 * project (`catalogLookupTargetOf`), the snapshot from the findings answer.
 */
export function catalogProfile(
  target: { edition: string; release: string },
  editionDeclared: boolean,
  catalog: ItFindingsSource['catalog'] | null,
): CatalogProfile {
  const edition = EDITION_WORDS[target.edition] ?? target.edition;
  const words = catalog?.registryKey ? catalogSnapshotWords(catalog.registryKey) : null;
  const catalogKey = catalog?.registryKey
    ? `${catalog.registryKey}${catalog.sourceSha256 ? ` · ${catalog.sourceSha256.slice(0, 8)}` : ''}`
    : null;
  const note = catalog?.registryKey
    ? `Levels come from SAP’s abap-atc-cr-cv-s4hc repository, ${words ?? `snapshot ${catalog.registryKey}`} — ` +
      'the list the signed run reads for this project’s target. They are SAP’s published classification, never stored with the run.'
    : 'Which snapshot of SAP’s abap-atc-cr-cv-s4hc repository answered is not recorded for this answer.';
  return {
    edition,
    editionDeclared,
    release: target.release && target.release.trim() ? target.release.trim() : null,
    releaseMatters: RELEASE_PINNED_EDITIONS.has(target.edition as Edition),
    catalog: words ?? (catalog?.registryKey ? catalog.registryKey : null),
    catalogKey,
    note,
  };
}

/* ------------------------------------------------------- routes the router named */

/** How often the router named each extensibility route on a finding, largest first. */
export function routesNamed(rows: readonly ItFindingRow[]): Array<{ route: string; count: number }> {
  const map = new Map<string, number>();
  for (const row of rows) for (const r of row.targetOptions) map.set(r, (map.get(r) ?? 0) + 1);
  return [...map.entries()]
    .map(([route, count]) => ({ route, count }))
    .sort((a, b) => b.count - a.count || a.route.localeCompare(b.route));
}
