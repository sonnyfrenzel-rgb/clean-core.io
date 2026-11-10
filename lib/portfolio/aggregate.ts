/**
 * The aggregated view — roadmap 3.0.21 (2).
 *
 * Counts over many programs, each figure with the programs behind it, and
 * nothing more: no figure here is computed that a single project does not
 * already show for itself. Pure — the server reads the facts per program out
 * of each project's signed run (`lib/portfolio/program-facts.ts`) and hands
 * them in; a spec can drive every state without Firestore or the catalog.
 *
 * **Never a portfolio score** (roadmap 3.0.21): the score is a grade per
 * program, not a compliance percentage, and averaging it would invent a
 * figure. This module has no average, no sum of scores and no share — the
 * distribution over the bands is shown instead, and a spec holds that no field
 * of the result is one.
 *
 * **Every figure names its coverage** ("412 of 430 programs analysed · 18
 * without a signed run · 37 with includes not read") and **links to its
 * projects**: every count is the length of a list of program references.
 *
 * **"Not determined" is its own area**, never folded into another: a program
 * without a signed run is in no band, an object with an unknown level is not
 * counted as A–D, an object no bucket could be concluded for is "not
 * assigned", with the reason counted.
 *
 * **Nothing aggregated is signed or put into an audit pack.** The result
 * carries no hash and no signature, and no route stores it.
 */

import { bandRange, SCORE_BANDS, scoreBand, type ScoreBandKey } from '../clean-core-score';
import type { CloudReadinessGrade, PublicCloudFitBucket, PublicCloudFitReasonCode } from '../abap/public-cloud-fit';

export interface ProgramRef {
  projectId: string;
  name: string;
}

export interface ProgramObjectFact {
  /** Upper-cased object name. */
  name: string;
  /** An SAP object (not a customer Z/Y object). */
  sap: boolean;
  level: CloudReadinessGrade;
  /** How the program uses it, where its findings say. */
  use: 'read' | 'write' | null;
  bucket: PublicCloudFitBucket | null;
  /** Why no bucket, when `bucket` is null. */
  notAssigned: PublicCloudFitReasonCode | null;
}

export interface ProgramFacts extends ProgramRef {
  /** The project has an active signed run. */
  analysed: boolean;
  /** The signed run's score; `null` without a run. */
  score: number | null;
  /** INCLUDE statements in the stored source that name a text not uploaded. */
  includesNotRead: string[];
  objects: ProgramObjectFact[];
  /** Findings of the signed run, by kind. */
  kinds: { kind: string; label: string; count: number }[];
}

export interface BandFigure {
  key: ScoreBandKey;
  label: string;
  range: string;
  programs: ProgramRef[];
}

export interface LevelFigure {
  grade: CloudReadinessGrade;
  /** One per program and object. */
  uses: number;
  programs: ProgramRef[];
}

export type BucketKey = PublicCloudFitBucket | 'not-assigned';

export interface BucketFigure {
  bucket: BucketKey;
  /** One per program and object. */
  objects: number;
  programs: ProgramRef[];
}

export interface RecurringObject {
  object: string;
  /** "written" wins over "read"; "used" when no finding says how. */
  use: 'read' | 'written' | 'used';
  programs: ProgramRef[];
}

export interface KindFigure {
  kind: string;
  label: string;
  findings: number;
  programs: ProgramRef[];
}

export type NotDeterminedKey =
  | 'not-analysed'
  | 'includes-not-read'
  | 'level-unknown'
  | 'level-not-determined'
  | 'target-platform-not-set'
  | 'catalog-evidence-missing';

export interface NotDeterminedFigure {
  key: NotDeterminedKey;
  /** Programs affected. */
  programs: ProgramRef[];
  /** For object-level gaps: how many object uses. `null` for program-level gaps. */
  objects: number | null;
}

export interface PortfolioCoverage {
  /** Projects the view was asked to read. */
  projects: number;
  analysed: number;
  notAnalysed: number;
  includesNotRead: number;
  /** Listed in a selection, but no longer there (deleted, or not the owner's). */
  missingProjects: number;
}

export interface PortfolioView {
  coverage: PortfolioCoverage;
  bands: BandFigure[];
  levels: LevelFigure[];
  /** Object uses with a level, SAP objects only. */
  levelUses: number;
  buckets: BucketFigure[];
  /** Object uses sorted into a bucket or not assigned. */
  bucketObjects: number;
  recurring: RecurringObject[];
  kinds: KindFigure[];
  notDetermined: NotDeterminedFigure[];
  programs: ProgramFacts[];
}

const LEVELS: readonly CloudReadinessGrade[] = ['A', 'B', 'C', 'D', 'Unknown'];
const BUCKETS: readonly BucketKey[] = ['retire', 'keep', 'rebuild', 'no-catalogued-path', 'not-assigned'];

/** How many recurring objects the view lists. */
export const RECURRING_SHOWN = 25;

function ref(p: ProgramRef): ProgramRef {
  return { projectId: p.projectId, name: p.name };
}

function byName(a: ProgramRef, b: ProgramRef): number {
  return a.name.localeCompare(b.name, 'en') || a.projectId.localeCompare(b.projectId, 'en');
}

export function aggregatePortfolio(facts: readonly ProgramFacts[], missingProjects = 0): PortfolioView {
  const programs = [...facts].sort(byName);
  const analysed = programs.filter((p) => p.analysed);

  const bands: BandFigure[] = SCORE_BANDS.map((b) => ({ key: b.key, label: b.label, range: bandRange(b), programs: [] }));
  for (const p of analysed) {
    if (typeof p.score !== 'number') continue;
    const key = scoreBand(p.score).key;
    bands.find((b) => b.key === key)!.programs.push(ref(p));
  }

  const levels: LevelFigure[] = LEVELS.map((grade) => ({ grade, uses: 0, programs: [] }));
  const buckets: BucketFigure[] = BUCKETS.map((bucket) => ({ bucket, objects: 0, programs: [] }));
  const objectsAcross = new Map<string, { programs: ProgramRef[]; written: boolean; read: boolean }>();
  const kindsAcross = new Map<string, KindFigure>();
  const nd: Record<NotDeterminedKey, { programs: ProgramRef[]; objects: number | null }> = {
    'not-analysed': { programs: [], objects: null },
    'includes-not-read': { programs: [], objects: null },
    'level-unknown': { programs: [], objects: 0 },
    'level-not-determined': { programs: [], objects: 0 },
    'target-platform-not-set': { programs: [], objects: 0 },
    'catalog-evidence-missing': { programs: [], objects: 0 },
  };
  const addOnce = (list: ProgramRef[], p: ProgramRef) => {
    if (!list.some((r) => r.projectId === p.projectId)) list.push(ref(p));
  };

  for (const p of programs) {
    if (!p.analysed) addOnce(nd['not-analysed'].programs, p);
    if (p.includesNotRead.length > 0) addOnce(nd['includes-not-read'].programs, p);
    if (!p.analysed) continue;

    for (const o of p.objects) {
      if (o.sap) {
        const level = levels.find((l) => l.grade === o.level)!;
        level.uses += 1;
        addOnce(level.programs, p);
        if (o.level === 'Unknown') {
          nd['level-unknown'].objects! += 1;
          addOnce(nd['level-unknown'].programs, p);
        }
        const across = objectsAcross.get(o.name) ?? { programs: [], written: false, read: false };
        addOnce(across.programs, p);
        if (o.use === 'write') across.written = true;
        if (o.use === 'read') across.read = true;
        objectsAcross.set(o.name, across);
      }
      const key: BucketKey = o.bucket ?? 'not-assigned';
      const bucket = buckets.find((b) => b.bucket === key)!;
      bucket.objects += 1;
      addOnce(bucket.programs, p);
      if (!o.bucket && o.notAssigned) {
        nd[o.notAssigned].objects! += 1;
        addOnce(nd[o.notAssigned].programs, p);
      }
    }

    for (const k of p.kinds) {
      const figure = kindsAcross.get(k.kind) ?? { kind: k.kind, label: k.label, findings: 0, programs: [] };
      figure.findings += k.count;
      addOnce(figure.programs, p);
      kindsAcross.set(k.kind, figure);
    }
  }

  const recurring: RecurringObject[] = [...objectsAcross.entries()]
    .filter(([, v]) => v.programs.length >= 2)
    .map(([object, v]) => ({
      object,
      use: (v.written ? 'written' : v.read ? 'read' : 'used') as RecurringObject['use'],
      programs: v.programs.sort(byName),
    }))
    .sort((a, b) => b.programs.length - a.programs.length || a.object.localeCompare(b.object, 'en'))
    .slice(0, RECURRING_SHOWN);

  const kinds = [...kindsAcross.values()]
    .map((k) => ({ ...k, programs: k.programs.sort(byName) }))
    .sort((a, b) => b.programs.length - a.programs.length || b.findings - a.findings || a.label.localeCompare(b.label, 'en'));

  const notDetermined: NotDeterminedFigure[] = (Object.keys(nd) as NotDeterminedKey[])
    .map((key) => ({ key, programs: nd[key].programs.sort(byName), objects: nd[key].objects }))
    .filter((f) => f.programs.length > 0);

  for (const b of bands) b.programs.sort(byName);
  for (const l of levels) l.programs.sort(byName);
  for (const b of buckets) b.programs.sort(byName);

  return {
    coverage: {
      projects: programs.length + missingProjects,
      analysed: analysed.length,
      notAnalysed: programs.length - analysed.length,
      includesNotRead: nd['includes-not-read'].programs.length,
      missingProjects,
    },
    bands,
    levels,
    levelUses: levels.reduce((n, l) => n + l.uses, 0),
    buckets,
    bucketObjects: buckets.reduce((n, b) => n + b.objects, 0),
    recurring,
    kinds,
    notDetermined,
    programs,
  };
}

/** One program's level counts, A to Unknown — for the table and the exports. */
export function levelCountsOf(p: ProgramFacts): Record<CloudReadinessGrade, number> {
  const out: Record<CloudReadinessGrade, number> = { A: 0, B: 0, C: 0, D: 0, Unknown: 0 };
  for (const o of p.objects) if (o.sap) out[o.level] += 1;
  return out;
}

/** One program's bucket counts — for the table and the exports. */
export function bucketCountsOf(p: ProgramFacts): Record<BucketKey, number> {
  const out: Record<BucketKey, number> = { retire: 0, keep: 0, rebuild: 0, 'no-catalogued-path': 0, 'not-assigned': 0 };
  for (const o of p.objects) out[o.bucket ?? 'not-assigned'] += 1;
  return out;
}
