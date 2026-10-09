/**
 * What the Transformation tool shows, computed — the style-independent half of
 * the Object Page of proposal A (owner decision 01.10.2026), with the flow
 * "finding → target → file" of proposal B.
 *
 * Pure and deterministic. Every figure is a count of findings the engine
 * produced, of files the model's stored package holds, or of lines in those
 * files. Nothing is estimated and nothing is filled in: a finding the catalog
 * names no successor for says so, a custom table whose new home nobody decided
 * says so, and a generated file that does not mention a finding's object is
 * reported as "not found", not paired with the nearest file.
 *
 * The one rule worth naming: **the per-finding target is not the project's
 * route**. A finding's `targetOptions` are the engine's options for that kind of
 * construct, listed with the in-app option first for almost every kind. The
 * demo used to print that first option as "Route" on every row, so a project
 * whose route is side-by-side read "Developer Extensibility / RAP" thirty times.
 * `findingTarget` answers per finding — a released successor where the catalog
 * names one, the custom table where the code writes its own, and only for a
 * construct without an object the option that matches the project's route —
 * and says when the project's route is not among the finding's options.
 */

import { groupConstructs } from './open-questions';
import type { CoverageReport } from './abap/coverage';
import type { EvidenceFinding } from './abap/evidence-model';
import { calmTitle, findingRows, kindLabel } from './findings-view';
import { BTP } from './sap-naming';
import { countSourceLines } from '@/lib/source-lines';

/* ---------------------------------------------------------------- routes */

/** The project's track, as the contract or the stored route names it. */
export type ProjectTrack = 'side-by-side' | 'in-app';

export type TargetOption = EvidenceFinding['targetOptions'][number];

/** The finding options that belong to each track. */
const TRACK_OPTIONS: Record<ProjectTrack, readonly TargetOption[]> = {
  'side-by-side': ['Side-by-Side CAP', 'Integration Suite', 'Event Mesh'],
  'in-app': ['Developer Extensibility / RAP', 'Key User Extensibility'],
};

export const TRACK_LABEL: Record<ProjectTrack, string> = {
  'side-by-side': `Side-by-side on ${BTP}`,
  'in-app': 'In-app ABAP Cloud',
};

/** The router's route string → the track. */
export function trackOfRoute(route: string | null | undefined): ProjectTrack {
  return route && /side-by-side|btp/i.test(route) ? 'side-by-side' : 'in-app';
}

/* -------------------------------------------------------- per-finding target */

export type TargetKind = 'successor' | 'no-successor' | 'custom' | 'route' | 'route-other';

export interface FindingTarget {
  kind: TargetKind;
  /** "API_PURCHASEREQUISITION_SRV", "No released successor", "Side-by-Side CAP". */
  label: string;
  /** One plain line under the label. */
  sub: string;
  /** Where the target comes from, in the words of the box's eyebrow. */
  source: 'catalog' | 'route' | 'code';
  /** For `successor`: the catalog's object type and confidence. */
  successorType?: string;
  successorConfidence?: string;
  /** Whether the project's route is among the finding's options. Null when the finding names an object. */
  routeFit: 'matches' | 'differs' | null;
}

const isCustomObject = (name: string | undefined) => !!name && /^[ZY]/i.test(name.trim());

/**
 * The honest target of one finding, against the project's track.
 *
 * Exported because it is the fix for the demo's "every row says RAP" and a spec
 * runs it against the demo's real findings.
 */
export function findingTarget(finding: EvidenceFinding, track: ProjectTrack): FindingTarget {
  const options = finding.targetOptions ?? [];
  if (finding.sapReplacement?.objectName) {
    return {
      kind: 'successor',
      label: finding.sapReplacement.objectName,
      sub: `Released ${finding.sapReplacement.objectType === 'Unknown' ? 'object' : finding.sapReplacement.objectType} named by the catalog`,
      source: 'catalog',
      successorType: finding.sapReplacement.objectType,
      successorConfidence: finding.sapReplacement.confidence,
      routeFit: null,
    };
  }
  if (finding.objectName && isCustomObject(finding.objectName)) {
    return {
      kind: 'custom',
      label: 'Custom persistence',
      sub: `${finding.objectName} — where it lives after the move is not determined here`,
      source: 'code',
      routeFit: null,
    };
  }
  if (finding.objectName) {
    return {
      kind: 'no-successor',
      label: 'No released successor',
      sub: options.length > 0 ? `Options: ${options.join(' · ')}` : 'The catalog names none and the engine offers no option',
      source: 'catalog',
      routeFit: null,
    };
  }
  const onTrack = options.find((o) => TRACK_OPTIONS[track].includes(o));
  if (onTrack) {
    return { kind: 'route', label: onTrack, sub: `the project route — ${TRACK_LABEL[track]}`, source: 'route', routeFit: 'matches' };
  }
  return {
    kind: 'route-other',
    label: options.length > 0 ? options.join(' · ') : 'No option offered',
    sub: `The project route (${TRACK_LABEL[track]}) is not among this finding's options`,
    source: 'route',
    routeFit: 'differs',
  };
}

/* ------------------------------------------------------------ the counts */

/**
 * One finding per pattern and object — the unit Analyze, the worklist, the
 * workspace row and the demo count (`findingRows`), here as its most severe
 * occurrence. The engine's list holds one entry per *place in the code*; a
 * figure labelled "findings" counts these, and the places are named as places
 * (owner decision 02.10.2026: one count under one word).
 */
export function findingUnits(findings: readonly EvidenceFinding[]): EvidenceFinding[] {
  return findingRows(findings).map((r) => r.finding);
}

export interface TransformationFigures {
  /** Findings — one per pattern and object (`findingUnits`). */
  findings: number;
  /** Places in the code — the engine's occurrences, one per source line. */
  places: number;
  /** Findings with at least one target option. */
  planned: number;
  /** Findings with none — left out rather than guessed at. */
  unplanned: number;
  successorNamed: number;
  successorDistinct: number;
}

export function transformationFigures(occurrences: readonly EvidenceFinding[]): TransformationFigures {
  const findings = findingUnits(occurrences);
  const named = findings.filter((f) => f.sapReplacement?.objectName);
  return {
    findings: findings.length,
    places: occurrences.length,
    planned: findings.filter((f) => (f.targetOptions ?? []).length > 0).length,
    unplanned: findings.filter((f) => (f.targetOptions ?? []).length === 0).length,
    successorNamed: named.length,
    successorDistinct: new Set(named.map((f) => f.sapReplacement!.objectName)).size,
  };
}

/* ----------------------------------------------------------- plan by kind */

export interface KindPlan {
  kind: string;
  label: string;
  total: number;
  withSuccessor: number;
  worst: EvidenceFinding['severity'];
}

const RANK: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3, Info: 4 };

/** One row per kind of finding — counted per finding (pattern and object), not per place — the most severe kind first. */
export function planByKind(occurrences: readonly EvidenceFinding[]): KindPlan[] {
  const findings = findingUnits(occurrences);
  const map = new Map<string, EvidenceFinding[]>();
  for (const f of findings) map.set(f.kind, [...(map.get(f.kind) ?? []), f]);
  const out: KindPlan[] = [];
  for (const [kind, list] of map) {
    const worst = [...list].sort((a, b) => (RANK[a.severity] ?? 9) - (RANK[b.severity] ?? 9))[0].severity;
    out.push({
      kind,
      label: kindLabel(kind, list.length),
      total: list.length,
      withSuccessor: list.filter((f) => f.sapReplacement?.objectName).length,
      worst,
    });
  }
  return out.sort((a, b) => (RANK[a.worst] ?? 9) - (RANK[b.worst] ?? 9) || b.total - a.total || a.label.localeCompare(b.label));
}

/* ------------------------------------------------------------ the flow */

export interface FlowTargetNode {
  kind: TargetKind;
  label: string;
  sub: string;
  count: number;
}

export interface FlowLink {
  from: string;
  to: TargetKind;
  count: number;
}

export interface TransformationFlow {
  kinds: KindPlan[];
  targets: FlowTargetNode[];
  links: FlowLink[];
}

const TARGET_ORDER: TargetKind[] = ['successor', 'no-successor', 'custom', 'route', 'route-other'];

function joinShort(names: string[], max = 5): string {
  const unique = Array.from(new Set(names));
  return unique.length <= max ? unique.join(', ') : `${unique.slice(0, max).join(', ')} and ${unique.length - max} more`;
}

/** The Sankey of proposal B: kind of finding → target → (the generated package, drawn by the caller). */
export function transformationFlow(occurrences: readonly EvidenceFinding[], track: ProjectTrack): TransformationFlow {
  const findings = findingUnits(occurrences);
  const kinds = planByKind(findings);
  const byTarget = new Map<TargetKind, EvidenceFinding[]>();
  const linkCount = new Map<string, number>();
  for (const f of findings) {
    const t = findingTarget(f, track);
    byTarget.set(t.kind, [...(byTarget.get(t.kind) ?? []), f]);
    const key = `${f.kind}→${t.kind}`;
    linkCount.set(key, (linkCount.get(key) ?? 0) + 1);
  }
  const targets: FlowTargetNode[] = [];
  for (const kind of TARGET_ORDER) {
    const list = byTarget.get(kind);
    if (!list?.length) continue;
    const n = list.length;
    if (kind === 'successor') {
      const distinct = new Set(list.map((f) => f.sapReplacement!.objectName)).size;
      targets.push({ kind, label: 'Released API or CDS view', sub: `${distinct} named by the catalog`, count: n });
    } else if (kind === 'no-successor') {
      targets.push({ kind, label: 'No released successor', sub: joinShort(list.map((f) => f.objectName ?? '')), count: n });
    } else if (kind === 'custom') {
      targets.push({ kind, label: 'Custom persistence', sub: 'where it lives: not determined', count: n });
    } else if (kind === 'route') {
      targets.push({ kind, label: `The project route · ${TRACK_LABEL[track]}`, sub: joinShort(list.map((f) => kindLabel(f.kind, 1)), 3), count: n });
    } else {
      targets.push({ kind, label: 'Outside the project route', sub: 'the finding offers only other options', count: n });
    }
  }
  const links: FlowLink[] = [];
  for (const k of kinds) {
    for (const t of TARGET_ORDER) {
      const count = linkCount.get(`${k.kind}→${t}`) ?? 0;
      if (count > 0) links.push({ from: k.kind, to: t, count });
    }
  }
  return { kinds, targets, links };
}

/* ---------------------------------------------------- finding to change */

export interface GeneratedFile {
  path: string;
  content: string;
}

export interface ChangeExcerpt {
  path: string;
  /** The 1-based line of the match. */
  line: number;
  /** What was searched for and found. */
  term: string;
  /** The match line, with its real number, cut to a window around the term. */
  lines: Array<{ number: number; text: string; highlighted: boolean }>;
}

/**
 * Where the stored package mentions this finding's successor or object — a
 * text search, nothing more. The caller says so: a mention is a place to look,
 * not proof the change is right. Null when no file mentions either.
 */
export function changeExcerpt(finding: EvidenceFinding, files: readonly GeneratedFile[]): ChangeExcerpt | null {
  const terms = [finding.sapReplacement?.objectName, finding.objectName].filter(
    (t): t is string => !!t && t.trim().length >= 3,
  );
  for (const term of terms) {
    const re = new RegExp(`(^|[^A-Za-z0-9_])${term.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}(?![A-Za-z0-9_])`, 'i');
    for (const file of files) {
      const lines = file.content.split('\n');
      const at = lines.findIndex((l) => re.test(l));
      if (at < 0) continue;
      // The match line alone, cut to a window around the term so it reads in a
      // narrow box; an ellipsis marks every cut.
      const raw = lines[at].replace(/\s+$/, '').trimStart();
      const m = raw.search(re);
      const start = Math.max(0, m - 24);
      const end = Math.min(raw.length, start + 72);
      const text = `${start > 0 ? '…' : ''}${raw.slice(start, end)}${end < raw.length ? '…' : ''}`;
      const excerpt = [{ number: at + 1, text, highlighted: true }];
      return { path: file.path, line: at + 1, term, lines: excerpt };
    }
  }
  return null;
}

const SEVERITY_RANK = (f: EvidenceFinding) => RANK[f.severity] ?? 9;

/**
 * The findings the "From finding to change" section shows first: the most
 * severe of each target kind, so the three boxes show three different answers
 * (a successor, none published, the route) rather than three reads of one
 * table. The rest follow, most severe first, behind "Show all".
 */
export function changeOrder(occurrences: readonly EvidenceFinding[], track: ProjectTrack): EvidenceFinding[] {
  // One change per finding; its places in the code travel with it (`findingRows`).
  const sorted = findingUnits(occurrences).sort((a, b) => SEVERITY_RANK(a) - SEVERITY_RANK(b) || a.lineStart - b.lineStart);
  const first: EvidenceFinding[] = [];
  const seen = new Set<TargetKind>();
  for (const f of sorted) {
    const k = findingTarget(f, track).kind;
    if (seen.has(k)) continue;
    seen.add(k);
    first.push(f);
    if (first.length === 3) break;
  }
  return [...first, ...sorted.filter((f) => !first.includes(f))];
}

/* ------------------------------------------------------- not generated */

export interface NotGeneratedItem {
  key: string;
  text: string;
  lines: number[];
}

/** What a generation cannot carry over from this source, and why — each from the engine. */
export function notGeneratedReasons(findings: readonly EvidenceFinding[], coverage: CoverageReport | null): NotGeneratedItem[] {
  const out: NotGeneratedItem[] = [];
  const none = findings.filter((f) => f.objectName && !f.sapReplacement?.objectName && !isCustomObject(f.objectName));
  if (none.length > 0) {
    const names = Array.from(new Set(none.map((f) => f.objectName!)));
    out.push({
      key: 'no-successor',
      text: `No released successor for ${joinShort(names, 4)} — the catalog names none, so there is nothing released to call.`,
      lines: Array.from(new Set(none.map((f) => f.lineStart))).slice(0, 4),
    });
  }
  const custom = Array.from(new Set(findings.filter((f) => isCustomObject(f.objectName)).map((f) => f.objectName!)));
  if (custom.length > 0) {
    out.push({
      key: 'custom',
      text: `Where the ${custom.length === 1 ? 'custom table' : `${custom.length} custom tables`} ${custom.length === 1 ? 'lives' : 'live'} after the move is not determined here (${joinShort(custom, 3)}).`,
      lines: [],
    });
  }
  const unassessed = coverage?.unassessed ?? [];
  if (unassessed.length > 0) {
    // The one grouper (ADR-081), keyed by the engine's kind.
    const kinds = groupConstructs(unassessed.map((u) => ({ label: u.label, why: u.why, anchor: `L${u.line}`, gap: u.gap })));
    out.push({
      key: 'unassessed',
      text: `${kinds.length} construct ${kinds.length === 1 ? 'kind' : 'kinds'} the engine did not assess: ${kinds.map((k) => k.label).join(', ').toLowerCase()}.`,
      lines: kinds.map((k) => Number(k.anchors[0].slice(1))),
    });
  }
  return out;
}

/* --------------------------------------------------------------- files */

export type FileType = 'code' | 'config' | 'container' | 'model' | 'test' | 'other';

export interface FileCard {
  path: string;
  type: FileType;
  /** One line: what this file does — read off its path, the way the generation prompt names it. */
  role: string;
  lines: number;
  bytes: number;
}

const ROLES: Array<[RegExp, FileType, string]> = [
  [/(^|\/)service\.(ts|js)$/i, 'code', 'Service handlers'],
  [/(^|\/)package\.json$/i, 'config', 'Package manifest'],
  [/(^|\/)Dockerfile$/i, 'container', 'Container build'],
  [/\.cds$/i, 'model', 'Data model (CDS)'],
  [/\.clas\.abap$/i, 'code', 'ABAP class'],
  [/\.clas\.xml$/i, 'config', 'Class metadata for abapGit'],
  [/\.ddls\.asddls$/i, 'model', 'CDS data definition'],
  [/\.bdef\.asbdef$/i, 'model', 'Behavior definition'],
  [/\.srvd\.assrvd$/i, 'model', 'Service definition'],
  [/\.srvb\.assrvb$/i, 'config', 'Service binding'],
  [/playwright\.config\.(ts|js)$/i, 'test', 'Test configuration'],
  [/\.spec\.(ts|js)$/i, 'test', 'Tests'],
  [/\.(ts|js)$/i, 'code', 'Source file'],
  [/\.json$/i, 'config', 'Configuration'],
];

export function fileCard(file: GeneratedFile): FileCard {
  const hit = ROLES.find(([re]) => re.test(file.path));
  const content = file.content ?? '';
  return {
    path: file.path,
    type: hit?.[1] ?? 'other',
    role: hit?.[2] ?? 'File',
    lines: countSourceLines(content),
    bytes: new TextEncoder().encode(content).length,
  };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
}

/** Folders and root files, "srv/ 1 · root 2". */
export function packageShape(files: readonly GeneratedFile[]): string {
  const folders = new Map<string, number>();
  let root = 0;
  for (const f of files) {
    const i = f.path.indexOf('/');
    if (i < 0) root += 1;
    else folders.set(f.path.slice(0, i + 1), (folders.get(f.path.slice(0, i + 1)) ?? 0) + 1);
  }
  const parts = Array.from(folders, ([d, n]) => `${d} ${n}`);
  if (root) parts.push(`root ${root}`);
  return parts.join(' · ');
}

export { calmTitle };
