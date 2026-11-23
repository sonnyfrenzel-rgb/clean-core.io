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
import type { FilledBy, Trace } from './transformation/types';
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

/**
 * Released targets, counted (ADR-129 (2), mock-up T3): a finding has a *released* target when SAP's catalog names a
 * released successor for its object, or when it is a construct without an object the project route handles itself
 * (RAP's save sequence, RAP's authorization). A custom table whose new home nobody decided, an SAP object without a
 * released successor and a construct whose options do not include the project route are *open* — never "planned",
 * whatever target options the engine lists for their kind. "19 of 19 planned" counted options; this counts targets.
 */
export interface ReleasedTargets {
  /** Findings, one per pattern and object. */
  findings: number;
  /** `successor` + `route`. */
  released: number;
  successor: number;
  route: number;
  /** `findings - released`: wait for a decision. */
  open: number;
  noSuccessor: number;
  custom: number;
  routeOther: number;
}

export function releasedTargets(occurrences: readonly EvidenceFinding[], track: ProjectTrack): ReleasedTargets {
  const count: Record<TargetKind, number> = { successor: 0, route: 0, 'no-successor': 0, custom: 0, 'route-other': 0 };
  const findings = findingUnits(occurrences);
  for (const f of findings) count[findingTarget(f, track).kind] += 1;
  const released = count.successor + count.route;
  return {
    findings: findings.length,
    released,
    successor: count.successor,
    route: count.route,
    open: findings.length - released,
    noSuccessor: count['no-successor'],
    custom: count.custom,
    routeOther: count['route-other'],
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
/** SAP GUI list and file output: ALV, the classic list, front-end file transfer. */
const UI_OUTPUT = /^(REUSE_ALV_|REUSE_LIST|CL_SALV_|CL_GUI_|GUI_(DOWNLOAD|UPLOAD)$|WS_(DOWNLOAD|UPLOAD)$)/i;

export function notGeneratedReasons(findings: readonly EvidenceFinding[], coverage: CoverageReport | null): NotGeneratedItem[] {
  const out: NotGeneratedItem[] = [];
  const none = findings.filter((f) => f.objectName && !f.sapReplacement?.objectName && !isCustomObject(f.objectName));
  // Classic list and file output has no function-module successor, but it has
  // a target all the same — a Fiori app — and Design says so. Said apart, so the
  // two tools do not read as a contradiction (dev acceptance 14.10.2026).
  const ui = none.filter((f) => UI_OUTPUT.test(f.objectName!));
  const rest = none.filter((f) => !UI_OUTPUT.test(f.objectName!));
  if (ui.length > 0) {
    const names = Array.from(new Set(ui.map((f) => f.objectName!)));
    out.push({
      key: 'ui-output',
      text: `List and file output (${joinShort(names, 4)}) has no function module to call instead — in the target it becomes a Fiori app with its list and export, which is not part of the generated package.`,
      lines: Array.from(new Set(ui.map((f) => f.lineStart))).slice(0, 4),
    });
  }
  if (rest.length > 0) {
    const names = Array.from(new Set(rest.map((f) => f.objectName!)));
    out.push({
      key: 'no-successor',
      text: `No released successor for ${joinShort(names, 4)} — the catalog names none, so there is nothing released to call.`,
      lines: Array.from(new Set(rest.map((f) => f.lineStart))).slice(0, 4),
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
  [/\.clas\.locals_(imp|def)\.abap$/i, 'code', 'Local classes of the class'],
  [/\.clas\.testclasses\.abap$/i, 'test', 'ABAP Unit test classes'],
  [/\.clas\.xml$/i, 'config', 'Class metadata for abapGit'],
  [/\.intf\.abap$/i, 'code', 'ABAP interface'],
  [/\.tabl\.xml$/i, 'model', 'Database table'],
  [/\.dcls\.asdcls$/i, 'model', 'Access control (DCL)'],
  [/\.(intf|ddls|bdef|dcls|srvd|srvb|tabl|devc)\.xml$/i, 'config', 'Object metadata for abapGit'],
  [/(^|\/)\.abapgit\.xml$/i, 'config', 'abapGit repository settings'],
  [/\.md$/i, 'other', 'Document'],
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

/** One object of the package and its files: a class with its local classes and metadata, a CDS view, a table. */
export interface PackageGroup {
  key: string;
  /** The object's name as the system knows it, or "Package documents" for the files at the root. */
  name: string;
  /** What the object is — the role of its main file. */
  kind: string;
  type: FileType;
  files: FileCard[];
  lines: number;
  bytes: number;
  /**
   * Who wrote it. `model`: the model wrote function bodies into it (it holds
   * fill markers); `engine`: built by the engine alone; `whole-model`: the
   * package came from one model call, every file is the model's.
   */
  author: 'model' | 'engine' | 'whole-model';
}

const MAIN_TYPE: FileType[] = ['code', 'model', 'test', 'container', 'config', 'other'];
const FILL_MARK = /@cc-fill BEGIN /;
const ABAP_FILE = /\.(abap|xml|asddls|asbdef|asdcls|assrvd|assrvb)$/i;

/**
 * The package by object instead of file by file (dev acceptance 14.10.2026:
 * 36 tiles told a reader nothing). Files under a folder group by the name
 * before their first dot (`zcl_x.clas.abap`, `zcl_x.clas.locals_imp.abap` and
 * `zcl_x.clas.xml` are one class); files at the root are the package's own
 * documents. Order: code, then data model, then tests, then the rest.
 */
/**
 * The object a file of the package belongs to — the key `packageGroups` groups by. ABAP files are one object under
 * several names (`.clas.abap`, `.clas.xml`); a Node package's files are modules, and their folder is the unit; files
 * at the root are the package's own documents.
 */
/** The name a group key is shown under: `ZCL_X`, `srv/units/`, or "Package documents". */
export function groupName(key: string): string {
  if (key === '(root)') return 'Package documents';
  return key.endsWith('/') ? key : key.slice(key.lastIndexOf('/') + 1).toUpperCase();
}

export function packageGroupKey(path: string): string {
  const slash = path.lastIndexOf('/');
  const base = path.slice(slash + 1);
  return slash < 0 ? '(root)' : ABAP_FILE.test(base) ? `${path.slice(0, slash + 1)}${base.split('.')[0]}` : path.slice(0, slash + 1);
}

export function packageGroups(files: readonly GeneratedFile[]): PackageGroup[] {
  const engineLed = files.some((f) => FILL_MARK.test(f.content ?? ''));
  const byKey = new Map<string, { files: GeneratedFile[] }>();
  for (const f of files) {
    const key = packageGroupKey(f.path);
    const g = byKey.get(key) ?? { files: [] };
    g.files.push(f);
    byKey.set(key, g);
  }
  const out: PackageGroup[] = [];
  for (const [key, g] of byKey) {
    const cards = g.files.map(fileCard);
    const main = [...cards].sort((a, b) => MAIN_TYPE.indexOf(a.type) - MAIN_TYPE.indexOf(b.type))[0];
    const root = key === '(root)';
    out.push({
      key,
      name: groupName(key),
      kind: root ? 'README, status and trace' : key.endsWith('/') ? 'Folder' : main.role,
      type: root ? 'other' : main.type,
      files: cards,
      lines: cards.reduce((n, c) => n + c.lines, 0),
      bytes: cards.reduce((n, c) => n + c.bytes, 0),
      author: !engineLed ? 'whole-model' : g.files.some((f) => FILL_MARK.test(f.content ?? '')) ? 'model' : 'engine',
    });
  }
  const rank = (g: PackageGroup) => (g.key === '(root)' ? 99 : MAIN_TYPE.indexOf(g.type));
  return out.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
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

/**
 * The "Code generated" step of the Object Page's "Status of the code" (3.0.23). Files on record are not a finished
 * step: when the tool bar's Transformation phase (`workflowSteps`) is not done — the server's check found the stored
 * package not activatable or not runnable, or functions were left as stubs — the step carries no done tick and says
 * what the tool bar says, with its badge and its detail. Without a phase (the demo) it reads from the files alone.
 */
export function codeGeneratedStep(input: {
  generated: boolean;
  /** "12 objects — frame by the engine, …" or "4 files, AI-generated": what the package holds. */
  packageNote: string;
  /** Shown when nothing is generated: "not yet", "not in a demo". */
  emptyNote: string;
  phase?: { state: string; badge: string; detail: string } | null;
}): { done: boolean; text: string; note: string } {
  if (!input.generated) return { done: false, text: 'Code generated', note: input.emptyNote };
  if (input.phase && input.phase.state !== 'done') return { done: false, text: input.phase.badge, note: `${input.packageNote}. ${input.phase.detail}` };
  return { done: true, text: 'Code generated', note: input.packageNote };
}

/* ------------------------------------------- the trace: finding → function → object */

/** Where in the new code a finding now is: the function of the package whose ABAP lines hold one of its places. */
export interface FindingWhere {
  /** The object's name as `packageGroups` shows it (`ZCL_POAPPR_LOGIC`, `srv/units/`). */
  object: string;
  /** Its group key (`packageGroupKey`). */
  objectKey: string;
  /** The function's name in the package. */
  fn: string;
  unitId: string | null;
  file: string;
}

const span = (r: { lineStart: number; lineEnd: number }) => r.lineEnd - r.lineStart;

/**
 * For every finding (one per pattern and object, keyed by the id of the occurrence that stands for it), the function
 * of the package that carries it — read from the package's own `traceability.json`, where the engine wrote each
 * function's ABAP lines (ADR-101), not from a text search. The narrowest function whose lines hold a place of the
 * finding wins, so the main path that spans the whole program never shadows the routine that holds the line. `null`
 * where no function's lines hold any of its places: the finding is not in the package.
 */
export function findingWhere(occurrences: readonly EvidenceFinding[], trace: Trace | null): Map<string, FindingWhere | null> {
  const out = new Map<string, FindingWhere | null>();
  for (const row of findingRows(occurrences)) {
    let best: { fn: Trace['functions'][number]; width: number } | null = null;
    if (trace) {
      for (const line of row.lines) {
        for (const fn of trace.functions) {
          for (const r of fn.abap) {
            if (line < r.lineStart || line > r.lineEnd) continue;
            if (!best || span(r) < best.width) best = { fn, width: span(r) };
          }
        }
      }
    }
    if (!best) {
      out.set(row.finding.id, null);
      continue;
    }
    const key = packageGroupKey(best.fn.file);
    out.set(row.finding.id, { object: groupName(key), objectKey: key, fn: best.fn.name, unitId: best.fn.unitId, file: best.fn.file });
  }
  return out;
}

export interface FlowObjectNode {
  /** The group key, or `out` for "not in the package". */
  key: string;
  label: string;
  sub: string;
  count: number;
}

export interface ObjectFlow {
  objects: FlowObjectNode[];
  links: Array<{ from: TargetKind; to: string; count: number }>;
}

/**
 * The flow's third column (ADR-129 (4), mock-up T5): target → the object of the package that now carries each
 * finding, from the trace. Objects by count, "Not in the package" last. Null without a trace — a package from one
 * model call, from before 3.0.12, or none: nothing records which object answers which finding, so no band is drawn.
 */
export function objectFlow(occurrences: readonly EvidenceFinding[], track: ProjectTrack, trace: Trace | null, files: readonly GeneratedFile[]): ObjectFlow | null {
  if (!trace) return null;
  const where = findingWhere(occurrences, trace);
  const kinds = new Map(packageGroups(files).map((g) => [g.key, g.kind]));
  const counts = new Map<string, number>();
  const linkCount = new Map<string, number>();
  for (const f of findingUnits(occurrences)) {
    const to = where.get(f.id)?.objectKey ?? 'out';
    const from = findingTarget(f, track).kind;
    counts.set(to, (counts.get(to) ?? 0) + 1);
    linkCount.set(`${from}\u0000${to}`, (linkCount.get(`${from}\u0000${to}`) ?? 0) + 1);
  }
  const objects: FlowObjectNode[] = [...counts]
    .filter(([key]) => key !== 'out')
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key, count]) => {
      const fns = new Set(trace.functions.filter((fn) => packageGroupKey(fn.file) === key).map((fn) => fn.name)).size;
      return { key, label: groupName(key), sub: `${kinds.get(key) ?? 'Object'} · ${fns} ${fns === 1 ? 'function' : 'functions'}`, count };
    });
  const out = counts.get('out');
  if (out) objects.push({ key: 'out', label: 'Not in the package', sub: 'no function of the package carries it', count: out });
  const links: ObjectFlow['links'] = [];
  for (const t of TARGET_ORDER) {
    for (const o of objects) {
      const count = linkCount.get(`${t}\u0000${o.key}`) ?? 0;
      if (count > 0) links.push({ from: t, to: o.key, count });
    }
  }
  return { objects, links };
}

/** One finding of the trace table ("Finding by finding", ADR-129 (4), mock-up T9). */
export interface TraceRow {
  id: string;
  severity: EvidenceFinding['severity'];
  title: string;
  object: string | null;
  /** Every place in the old code, sorted. */
  lines: number[];
  target: FindingTarget;
  /** Released (a successor or the route) or open. */
  open: boolean;
  where: FindingWhere | null;
}

export function traceRows(occurrences: readonly EvidenceFinding[], track: ProjectTrack, trace: Trace | null): TraceRow[] {
  const where = findingWhere(occurrences, trace);
  return findingRows(occurrences).map((r) => {
    const target = findingTarget(r.finding, track);
    return {
      id: r.finding.id,
      severity: r.finding.severity,
      title: calmTitle(r.finding.title),
      object: r.finding.objectName ?? null,
      lines: r.lines.length > 0 ? r.lines : [r.finding.lineStart],
      target,
      open: target.kind !== 'successor' && target.kind !== 'route',
      where: where.get(r.finding.id) ?? null,
    };
  });
}

/* ------------------------------------------------------------- still open */

/** Where an open item is decided. */
export type OpenItemAction = 'design' | 'analyze' | 'business';

/** One line of "Still open" (ADR-129 (4), mock-up T6): what is open, why, and the one place that decides it. */
export interface OpenItem {
  key: string;
  title: string;
  detail: string;
  lines: number[];
  action: OpenItemAction;
  actionLabel: string;
  /** Where the action leads, in words: "Design · Custom persistence". */
  place: string;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * "Still open" as one list: custom tables without a home, calls without a released successor, output that becomes a
 * Fiori app, findings whose options leave the project route, constructs the engine did not assess, rules without a
 * decision. The same items the project's open questions name (ADR-081: `groupConstructs` keys the constructs), filtered
 * to what touches this code. Pure, and empty when nothing is open.
 */
export function openItems(
  occurrences: readonly EvidenceFinding[],
  coverage: CoverageReport | null,
  track: ProjectTrack,
  openRules: readonly string[] | null,
): OpenItem[] {
  const findings = findingUnits(occurrences);
  const out: OpenItem[] = [];
  const custom = Array.from(new Set(findings.filter((f) => isCustomObject(f.objectName)).map((f) => f.objectName!.trim())));
  if (custom.length > 0) {
    out.push({
      key: 'custom',
      title: custom.length === 1 ? '1 custom table has no new home' : `${custom.length} custom tables have no new home`,
      detail: `${joinShort(custom, 5)}. Decide whether ${custom.length === 1 ? 'it moves' : 'they move'} into the business object, ${custom.length === 1 ? 'stays' : 'stay'}, or ${custom.length === 1 ? 'becomes' : 'become'} configuration; until then the code reads and writes ${custom.length === 1 ? 'it' : 'them'} as the original does.`,
      lines: Array.from(new Set(findings.filter((f) => isCustomObject(f.objectName)).map((f) => f.lineStart))).sort((a, b) => a - b).slice(0, 4),
      action: 'design',
      actionLabel: 'Decide in Design',
      place: 'Design · Custom persistence',
    });
  }
  const none = findings.filter((f) => f.objectName && !f.sapReplacement?.objectName && !isCustomObject(f.objectName));
  const ui = none.filter((f) => UI_OUTPUT.test(f.objectName!));
  const calls = none.filter((f) => !UI_OUTPUT.test(f.objectName!));
  if (calls.length > 0) {
    const names = Array.from(new Set(calls.map((f) => f.objectName!)));
    out.push({
      key: 'no-successor',
      title: names.length === 1 ? '1 call has no released successor' : `${names.length} calls have no released successor`,
      detail: `${joinShort(names, 5)}. SAP's catalog names none, so there is nothing released to call; decide what replaces ${names.length === 1 ? 'it' : 'each one'}.`,
      lines: Array.from(new Set(calls.map((f) => f.lineStart))).sort((a, b) => a - b).slice(0, 4),
      action: 'design',
      actionLabel: 'Decide in Design',
      place: 'Design · Calls without successor',
    });
  }
  if (ui.length > 0) {
    const names = Array.from(new Set(ui.map((f) => f.objectName!)));
    out.push({
      key: 'ui-output',
      title: 'The list and file output become a Fiori app',
      detail: `${joinShort(names, 4)} ${names.length === 1 ? 'has' : 'have'} no function module to call instead. In the target ${names.length === 1 ? 'it becomes' : 'they become'} part of a Fiori app, which is not part of the generated package.`,
      lines: Array.from(new Set(ui.map((f) => f.lineStart))).sort((a, b) => a - b).slice(0, 4),
      action: 'design',
      actionLabel: 'See the app in Design',
      place: 'Design · User interface',
    });
  }
  const other = findings.filter((f) => findingTarget(f, track).kind === 'route-other');
  if (other.length > 0) {
    out.push({
      key: 'route-other',
      title: `${plural(other.length, 'finding')} ${other.length === 1 ? 'points' : 'point'} outside the project route`,
      detail: `Their options do not include ${TRACK_LABEL[track]}. Confirm the route or choose another one in Design.`,
      lines: Array.from(new Set(other.map((f) => f.lineStart))).sort((a, b) => a - b).slice(0, 4),
      action: 'design',
      actionLabel: 'Check the route in Design',
      place: 'Design · Route',
    });
  }
  const unassessed = coverage?.unassessed ?? [];
  if (unassessed.length > 0) {
    const kinds = groupConstructs(unassessed.map((u) => ({ label: u.label, why: u.why, anchor: `L${u.line}`, gap: u.gap })));
    out.push({
      key: 'unassessed',
      title: kinds.length === 1 ? '1 construct was not assessed' : `${kinds.length} constructs were not assessed`,
      detail: `${kinds.map((k) => k.label).join(', ')}. The engine could not read what ${kinds.length === 1 ? 'it does' : 'they do'}, so the code carries ${kinds.length === 1 ? 'it' : 'them'} as the original has ${kinds.length === 1 ? 'it' : 'them'}.`,
      lines: kinds.map((k) => Number(k.anchors[0].slice(1))),
      action: 'analyze',
      actionLabel: 'See them in Analyze',
      place: 'Analyze · Not determined',
    });
  }
  const rules = Array.from(new Set(openRules ?? []));
  if (rules.length > 0) {
    out.push({
      key: 'rules',
      title: rules.length === 1 ? '1 rule has no decision' : `${rules.length} rules have no decision`,
      detail: `${joinShort(rules, 5)}. Implemented as the original has ${rules.length === 1 ? 'it' : 'them'} and marked open.`,
      lines: [],
      action: 'business',
      actionLabel: 'Decide the rules',
      place: 'Business view · Rules',
    });
  }
  return out;
}

/* ------------------------------------------------------- the package's functions */

/** One function of the package, as the package section lists it under its object (mock-up T7). */
export interface PackageFunction {
  name: string;
  unitId: string | null;
  /** The routine's words ("Validate the policy"), or empty for an engine-written function without a unit. */
  title: string;
  file: string;
  /** Who wrote the body: the engine alone, or a model (`fill`). */
  owner: 'engine' | 'fill';
  /** `L60–L75, L80` — the original's lines, or empty where it has none. */
  abap: string;
  rules: string[];
  /** For a fill: who filled it — `model`, a repair round, `empty` or `not-filled`. */
  filledBy: FilledBy | null;
  note: string | null;
}

/** The functions of the trace by the object (`packageGroupKey`) their file belongs to, in the trace's order. */
export function functionsByObject(trace: Trace | null): Map<string, PackageFunction[]> {
  const out = new Map<string, PackageFunction[]>();
  if (!trace) return out;
  const units = new Map(trace.units.map((u) => [u.unitId, u]));
  for (const fn of trace.functions) {
    const unit = fn.unitId ? units.get(fn.unitId) : undefined;
    const key = packageGroupKey(fn.file);
    const list = out.get(key) ?? [];
    list.push({
      name: fn.name,
      unitId: fn.unitId,
      title: unit?.title ?? '',
      file: fn.file,
      owner: fn.owner,
      abap: fn.abap.map((a) => (a.lineStart === a.lineEnd ? `L${a.lineStart}` : `L${a.lineStart}–L${a.lineEnd}`)).join(', '),
      rules: unit ? unit.rules.map((r) => r.id) : fn.rules,
      filledBy: unit?.filledBy ?? null,
      note: unit?.note ?? null,
    });
    out.set(key, list);
  }
  return out;
}

/* ----------------------------------------------------------- the code drawer */

/** One line of the new code, marked with who wrote it (ADR-129 (4): every line marked engine or model). */
export interface AuthoredLine {
  number: number;
  text: string;
  author: 'engine' | 'model';
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const BLOCK_END = /^\s*(ENDMETHOD|ENDFORM|ENDFUNCTION)\s*\.|^\}\s*;?\s*$|^ {2}\}\s*;?\s*$/i;

/**
 * The lines of one function of a generated file, each marked with its author. A model's body stands between the
 * engine's markers `@cc-fill BEGIN <unit>` and `@cc-fill END <unit>`; every other line — the header comment, the
 * signature, the guards, the markers — is the engine's. Read from the file as stored: nothing is reformatted. In a
 * package from one model call (no markers anywhere) every line is the model's. Null when the function is not found.
 */
export function functionLines(content: string, fn: { name: string; unitId: string | null }, wholeModel = false): AuthoredLine[] | null {
  const lines = content.split('\n');
  const begin = fn.unitId ? lines.findIndex((l) => new RegExp(`@cc-fill BEGIN ${escapeRe(fn.unitId!)}\\b`).test(l)) : -1;
  const header = new RegExp(`(^|[^A-Za-z0-9_])(METHOD|FORM|FUNCTION|function)\\s+${escapeRe(fn.name)}\\b|(^|\\s)(async\\s+)?${escapeRe(fn.name)}\\s*\\(|(const|let)\\s+${escapeRe(fn.name)}\\s*=`, 'i');
  let start = -1;
  if (begin >= 0) {
    for (let i = begin; i >= Math.max(0, begin - 60); i -= 1) {
      if (header.test(lines[i])) {
        start = i;
        break;
      }
    }
    if (start < 0) start = begin;
  } else {
    start = lines.findIndex((l) => header.test(l));
    if (start < 0) return null;
  }
  // The header comment above the signature belongs to the function.
  while (start > 0 && /^\s*("!|\*|\/\*\*|\/\/|")/.test(lines[start - 1])) start -= 1;
  const endMark = begin >= 0 ? lines.findIndex((l, i) => i > begin && new RegExp(`@cc-fill END ${escapeRe(fn.unitId!)}\\b`).test(l)) : -1;
  // The function ends at the first block end after its body (or after its header, for the engine's own functions).
  const scanFrom = endMark >= 0 ? endMark : begin >= 0 ? begin : start;
  let end = Math.min(lines.length - 1, scanFrom + 1);
  for (let i = scanFrom + 1; i < Math.min(lines.length, scanFrom + 400); i += 1) {
    if (BLOCK_END.test(lines[i])) {
      end = i;
      break;
    }
  }
  const out: AuthoredLine[] = [];
  for (let i = start; i <= end; i += 1) {
    const inBody = begin >= 0 && i > begin && (endMark < 0 || i < endMark);
    out.push({ number: i + 1, text: lines[i].replace(/\s+$/, ''), author: wholeModel || inBody ? 'model' : 'engine' });
  }
  return out;
}

/** Every line of a file with its author — for a file opened whole. */
export function authoredFile(content: string, wholeModel = false): AuthoredLine[] {
  const lines = content.split('\n');
  const out: AuthoredLine[] = [];
  let inside: string | null = null;
  lines.forEach((text, i) => {
    // The markers are the engine's; the lines between them the model's.
    if (inside !== null && new RegExp(`@cc-fill END ${escapeRe(inside)}\\b`).test(text)) inside = null;
    out.push({ number: i + 1, text: text.replace(/\s+$/, ''), author: wholeModel || inside !== null ? 'model' : 'engine' });
    const begin = /@cc-fill BEGIN (\S+)/.exec(text);
    if (begin) inside = begin[1];
  });
  return out;
}

/** The original's lines for a function's ranges, with their real numbers; a gap between two ranges is one `null`. */
export function sourceExcerpt(source: string, ranges: ReadonlyArray<{ lineStart: number; lineEnd: number }>, max = 400): Array<{ number: number; text: string } | null> {
  const lines = source.split('\n');
  const out: Array<{ number: number; text: string } | null> = [];
  const sorted = [...ranges].sort((a, b) => a.lineStart - b.lineStart);
  for (const [i, r] of sorted.entries()) {
    if (i > 0) out.push(null);
    for (let n = Math.max(1, r.lineStart); n <= Math.min(lines.length, r.lineEnd); n += 1) {
      out.push({ number: n, text: lines[n - 1].replace(/\s+$/, '') });
      if (out.length >= max) return out;
    }
  }
  return out;
}

export { calmTitle };
