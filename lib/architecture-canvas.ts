/**
 * The target-architecture canvas of the Design tool — what the picture shows,
 * derived and nothing else.
 *
 * Proposal B "Canvas first" (owner decision 01.10.2026) puts one picture at the
 * centre of the Design tool: the S/4HANA core with its clean-core boundary, the
 * released APIs and CDS views the catalog names as successors, the objects that
 * have none, the custom tables the code uses, and — depending on the route the
 * architecture contract chose — the side-by-side service on SAP BTP, part of
 * the SAP Business AI Platform, or the in-app RAP object on the stack. Every box
 * carries the lines of the code it stands for.
 *
 * **Where each part comes from.** Nothing here is a second opinion:
 *
 *   - the route is the contract's `route.chosen` (`lib/architecture-contract.ts`),
 *     so a declared deviation moves the picture as it moves generation;
 *   - successors, gaps and custom tables are the engine's findings as
 *     `GET /api/projects/{id}/findings` answers them (`lib/it-findings-build.ts`),
 *     grouped — the catalog's own successor name and object type, never a
 *     guess from a name prefix;
 *   - the reason the code leaves the stack is `routeDrivers()` of
 *     `lib/abap/extensibility-router.ts`, the one rule that chose the route.
 *
 * Pure: no React, no fetch. The component draws the model; the spec drives it.
 */
import type { ArchitectureContract, ContractField, TargetRoute } from './architecture-contract';
import { routeDrivers, type RouteDriver } from './abap/extensibility-router';

/** The part of a findings row the canvas reads (`ItFindingRow`, structurally). */
export interface CanvasFinding {
  id: string;
  kind: string;
  title: string;
  severity: string;
  objectName: string | null;
  lineStart: number;
  successor: string | null;
  successorType?: string | null;
  successorConfidence?: string | null;
}

export type SuccessorTag = 'odata' | 'cds' | 'other';

export interface CanvasSuccessor {
  key: string;
  name: string;
  tag: SuccessorTag;
  /** The catalog's object type, as the engine wrote it; `null` when not recorded. */
  type: string | null;
  /** The SAP objects the code uses that this successor replaces. */
  replaces: string[];
  lines: number[];
  findingIds: string[];
  /** Every use was named `Verified` by the catalog. Otherwise the weakest word is kept. */
  confidence: string | null;
}

export interface CanvasGap {
  key: string;
  object: string;
  /** "read", "read ×2", "BDC to the transaction" … */
  what: string;
  lines: number[];
  findingIds: string[];
}

export interface CanvasCustomTable {
  key: string;
  name: string;
  use: 'write' | 'read';
  lines: number[];
  findingIds: string[];
}

export interface CanvasFileTransfer {
  key: string;
  title: string;
  lines: number[];
  findingIds: string[];
}

/** A driver in the fewest words: the object where the finding names one. */
export interface CanvasDriverPhrase {
  text: string;
  line: number;
}

export interface ArchitectureCanvasModel {
  /** The route the contract chose; `null` when there is no contract to read. */
  route: TargetRoute | null;
  deviation: boolean;
  successors: CanvasSuccessor[];
  /** How many findings the successors stand for. */
  successorUses: number;
  gaps: CanvasGap[];
  customTables: CanvasCustomTable[];
  /** Front-end file services, which the side-by-side picture moves into a web client. */
  fileTransfers: CanvasFileTransfer[];
  /** The constructs that chose the route, by the router's own rule. */
  drivers: RouteDriver[];
  /** "BDC ME21N", "frontend file services" … with the first line, for the runtime box. */
  driverPhrases: CanvasDriverPhrase[];
  /** The contract's runtime sentence, where the contract states one. */
  runtime: string | null;
  /** The target artifact the runtime field names. */
  targetArtifact: string | null;
}

const STANDARD_KINDS = new Set(['standard-table-read', 'standard-table-write', 'bdc', 'unreleased-api', 'rfc-call']);
const CUSTOM_KINDS = new Set(['table-access', 'custom-table-write']);

function uniqSorted(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

function tagOf(type: string | null | undefined): SuccessorTag {
  if (type === 'OData API') return 'odata';
  if (type === 'CDS View') return 'cds';
  return 'other';
}

/** The weaker of two catalog words, so a group never reads stronger than its weakest use. */
const CONFIDENCE_ORDER = ['Verified', 'Catalog Match', 'Candidate', 'Needs Validation'];
function weaker(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return CONFIDENCE_ORDER.indexOf(a) >= CONFIDENCE_ORDER.indexOf(b) ? a : b;
}

function gapWord(kind: string): string {
  switch (kind) {
    case 'bdc':
      return 'BDC to the transaction';
    case 'standard-table-write':
      return 'write';
    case 'standard-table-read':
      return 'read';
    case 'rfc-call':
      return 'RFC call';
    default:
      return 'call';
  }
}

function field(contract: ArchitectureContract | null, key: string): ContractField | null {
  return contract?.fields.find((f) => f.key === key) ?? null;
}

/**
 * The model of the picture.
 *
 * `deployment` is the deployment model the router scored with — the project's
 * own, or `private`, exactly as `contractOfProject` (`lib/contract-build.ts`)
 * calls the router — so the reason printed under the runtime is the reason the
 * route was recommended, not one recomputed under another edition.
 */
export function architectureCanvasModel(args: {
  contract: ArchitectureContract | null;
  findings: readonly CanvasFinding[];
  deployment?: 'public' | 'private' | null;
}): ArchitectureCanvasModel {
  const { contract, findings } = args;

  const successorMap = new Map<string, CanvasSuccessor>();
  let successorUses = 0;
  for (const f of findings) {
    if (!f.successor) continue;
    successorUses += 1;
    const held = successorMap.get(f.successor) ?? {
      key: `successor:${f.successor}`,
      name: f.successor,
      tag: tagOf(f.successorType),
      type: f.successorType ?? null,
      replaces: [],
      lines: [],
      findingIds: [],
      confidence: null,
    };
    if (f.objectName && !held.replaces.includes(f.objectName)) held.replaces.push(f.objectName);
    held.lines.push(f.lineStart);
    held.findingIds.push(f.id);
    held.confidence = held.findingIds.length === 1 ? f.successorConfidence ?? null : weaker(held.confidence, f.successorConfidence ?? null);
    successorMap.set(f.successor, held);
  }
  // OData APIs, then CDS views, then the rest; within each by first line.
  const tagRank: Record<SuccessorTag, number> = { odata: 0, cds: 1, other: 2 };
  const successors = [...successorMap.values()]
    .map((s) => ({ ...s, lines: uniqSorted(s.lines) }))
    .sort((a, b) => tagRank[a.tag] - tagRank[b.tag] || a.lines[0] - b.lines[0]);

  const gapMap = new Map<string, { object: string; kind: string; lines: number[]; findingIds: string[] }>();
  for (const f of findings) {
    if (f.successor || !f.objectName || !STANDARD_KINDS.has(f.kind)) continue;
    const held = gapMap.get(f.objectName) ?? { object: f.objectName, kind: f.kind, lines: [], findingIds: [] };
    held.lines.push(f.lineStart);
    held.findingIds.push(f.id);
    gapMap.set(f.objectName, held);
  }
  // A screen automation first — it is the gap that decides the most — then by line.
  const gaps: CanvasGap[] = [...gapMap.values()]
    .sort((a, b) => (a.kind === 'bdc' ? 0 : 1) - (b.kind === 'bdc' ? 0 : 1) || a.lines[0] - b.lines[0])
    .map((g) => ({
    key: `gap:${g.object}`,
    object: g.object,
    what: g.findingIds.length > 1 && g.kind !== 'bdc' ? `${gapWord(g.kind)} ×${g.findingIds.length}` : gapWord(g.kind),
    lines: uniqSorted(g.lines),
    findingIds: g.findingIds,
  }));

  const tableMap = new Map<string, CanvasCustomTable>();
  for (const f of findings) {
    if (!f.objectName || !CUSTOM_KINDS.has(f.kind)) continue;
    const held = tableMap.get(f.objectName) ?? {
      key: `table:${f.objectName}`,
      name: f.objectName,
      use: 'read' as const,
      lines: [],
      findingIds: [],
    };
    if (f.kind === 'custom-table-write') held.use = 'write';
    held.lines.push(f.lineStart);
    held.findingIds.push(f.id);
    tableMap.set(f.objectName, held);
  }
  // Writes first: they are what decides where the tables have to live.
  const customTables = [...tableMap.values()]
    .map((t) => ({ ...t, lines: uniqSorted(t.lines) }))
    .sort((a, b) => (a.use === b.use ? 0 : a.use === 'write' ? -1 : 1));

  const fileTransfers: CanvasFileTransfer[] = findings
    .filter((f) => f.kind === 'gui-download')
    .map((f) => ({ key: `file:${f.id}`, title: f.title, lines: [f.lineStart], findingIds: [f.id] }));

  const drivers = routeDrivers({ findings }, args.deployment === 'public' ? 'public' : 'private');

  const SHORT_KIND: Record<string, string> = {
    bdc: 'BDC',
    'rfc-call': 'RFC',
    'native-sql': 'native SQL',
    'gui-download': 'frontend file services',
    'custom-table-write': 'writes to',
    'standard-table-write': 'writes to',
  };
  const driverPhrases = drivers.map((d) => {
    const first = findings.find((f) => f.id === d.findingIds[0]);
    const word = SHORT_KIND[d.kind] ?? d.label;
    const text = first?.objectName && d.kind !== 'gui-download' ? `${word} ${first.objectName}` : word;
    return { text: d.count > 1 ? `${text} (${d.count}×)` : text, line: d.firstLine };
  });

  const runtimeField = field(contract, 'runtime');
  const runtime = runtimeField?.statement ?? null;
  const artifactMatch = runtime ? /Target artifact: (.+?)\.?$/.exec(runtime) : null;

  return {
    route: contract ? contract.route.chosen : null,
    deviation: Boolean(contract?.route.deviation),
    successors,
    successorUses,
    gaps,
    customTables,
    fileTransfers,
    drivers,
    driverPhrases,
    runtime: runtime ? runtime.replace(/\s*Target artifact: .+$/, '') : null,
    targetArtifact: artifactMatch ? artifactMatch[1] : null,
  };
}

/** Every finding id a canvas key stands for — what the Evidence tab lists. */
export function findingIdsOfKey(model: ArchitectureCanvasModel, key: string): string[] {
  if (key === 'group:successors') return model.successors.flatMap((s) => s.findingIds);
  if (key === 'group:gaps') return model.gaps.flatMap((g) => g.findingIds);
  if (key === 'group:tables') return model.customTables.flatMap((t) => t.findingIds);
  if (key === 'runtime') return model.drivers.flatMap((d) => d.findingIds);
  const all = [...model.successors, ...model.gaps, ...model.customTables, ...model.fileTransfers];
  return all.find((x) => x.key === key)?.findingIds ?? [];
}

/** The plain-words name of a canvas key, for the Evidence tab's heading. */
export function titleOfKey(model: ArchitectureCanvasModel, key: string): string {
  if (key === 'group:successors') return `${model.successors.length} released APIs and views`;
  if (key === 'group:gaps') return `${model.gaps.length} objects without a released successor`;
  if (key === 'group:tables') return `${model.customTables.length} custom tables`;
  if (key === 'runtime') return model.route === 'in-app-rap' ? 'RAP business object' : 'CAP service';
  const s = model.successors.find((x) => x.key === key);
  if (s) return s.name;
  const g = model.gaps.find((x) => x.key === key);
  if (g) return `${g.object} — no released successor`;
  const t = model.customTables.find((x) => x.key === key);
  if (t) return `${t.name} — custom table`;
  const f = model.fileTransfers.find((x) => x.key === key);
  if (f) return f.title;
  return key;
}
