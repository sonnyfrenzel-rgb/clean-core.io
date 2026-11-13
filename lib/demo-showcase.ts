import { createHash } from 'crypto';
import planesRecord from '@/lib/demo-showcase-planes.json';
import { buildDemoWorkspace, type DemoWorkspaceData } from '@/lib/demo-workspace';
import { readSource, revealedRules } from '@/lib/first-look';
import { assertNoTrustChain } from '@/lib/demo-project';
import { APP_VERSION } from '@/lib/version';
import { TOP_PLANE, type ShowcasePlane, type ShowcasePlanesRecord } from '@/lib/demo-showcase-planes';
import {
  SHOWCASE_CHANGE_CALLS,
  SHOWCASE_CHANGE_MARKS,
  SHOWCASE_RULES,
  SHOWCASE_STEP_SELECTIONS,
} from '@/lib/demo-showcase-copy';

/**
 * The public demo showcase at `/demo` (roadmap 3.5.0 item 8, DEMO-1;
 * mockup `docs/roadmap/demo-showcase-mockup.html` v3).
 *
 * Everything the click-through shows is computed here, on the server, by the
 * engine of this release over the shipped example — the same run the demo
 * project behind sign-in shows (`lib/demo-workspace.ts`): the figures, the
 * ends of a case, the objects and their level, the score and its lines, the
 * route, the seven tools' state. The only recorded part is the drawing of the
 * map (`lib/demo-showcase-planes.json`, `npx tsx scripts/regenerate-demo-showcase.ts`), whose BPMN
 * digest `tests/demo-showcase-record.spec.ts` compares with this checkout.
 *
 * The few statements the guide makes in its own words — which four rules the
 * card shows, which map element a change is marked on — sit in
 * `lib/demo-showcase-copy.ts`, and {@link showcaseDrift} says when the engine
 * no longer supports one of them; the same spec runs it.
 *
 * Nothing here signs, stores, fetches or calls a model, and the result carries
 * no field of the trust chain (`assertNoTrustChain`). Server-only.
 */

/** One map element: name, BPMN tag, first and last line, and the level it stands on. */
export type ShowcaseElement = [name: string, tag: string, lineStart: number | null, lineEnd: number | null, plane: string];

export interface ShowcaseEnd {
  /** The level it is drawn on; `process` for the top. */
  plane: string;
  planeLabel: string;
  /** The stop's words, joined, for the row's second line. */
  names: string[];
  lines: number[];
  ids: string[];
}

export interface ShowcaseChange {
  object: string;
  how: string;
  line: number;
  mark: string;
  plane: string;
}

export interface ShowcaseUse {
  object: string;
  use: string;
  level: string;
  lines: number[];
}

export interface ShowcaseRule {
  value: string;
  text: string;
  line: number;
}

export interface ShowcaseFacts {
  objectName: string;
  subject: string;
  engineVersion: string;
  catalogVersion: string;
  sourceSha256: string;
  totalLines: number;
  linesOfCode: number;
  topSteps: number;
  elements: number;
  levels: number;
  anchored: number;
  rules: number;
  findings: number;
  distinctFindings: number;
  severity: { critical: number; high: number; medium: number; low: number; info: number };
  critical: { object: string; line: number } | null;
  score: number;
  scoreLines: Array<{ label: string; count: number; points: number }>;
  unassessedKinds: number;
  unassessedPoints: number;
  notDetermined: Array<{ label: string; lines: number[] }>;
  notDeterminedCount: number;
  route: string;
  target: string;
  confidence: number;
  keyUser: { total: number; keyUser: number; code: number; candidates: string[] };
  commits: number;
  batchInputLine: number | null;
  uploadLine: number | null;
  writesDirect: Array<{ object: string; line: number }>;
  levelD: number;
  levelC: number;
  readsOnly: string[];
  rail: Array<{ label: string; state: string; badge: string; detail: string }>;
  handoverMissing: string[];
}

export interface ShowcaseData {
  planes: ShowcasePlane[];
  elements: Record<string, ShowcaseElement>;
  /** The example, one entry per line. */
  source: string[];
  facts: ShowcaseFacts;
  ends: ShowcaseEnd[];
  changes: ShowcaseChange[];
  uses: ShowcaseUse[];
  rules: ShowcaseRule[];
}

const LEVEL_ORDER = ['D', 'C', 'B', 'A', 'Unknown'];

/** Every end of a case: the top level's own end and every stop on the way (an error end, or a routine left early). */
function endsOf(data: DemoWorkspaceData): ShowcaseEnd[] {
  const xml = data.processMap.xml;
  const errorEnds = new Set([...xml.matchAll(/<cc:trace\b[^>]*\bnode="([^"]+)"[^>]*\bkind="end-error"/g)].map((m) => m[1]));
  const label = new Map(data.processMap.planes.map((p) => [p.id ?? TOP_PLANE, p.label]));
  const groups = new Map<string, ShowcaseEnd>();
  for (const e of data.processMap.elements) {
    if (e.tag !== 'endEvent') continue;
    const plane = e.plane ?? TOP_PLANE;
    const stop = errorEnds.has(e.id) || e.early;
    if (plane !== TOP_PLANE && !stop) continue;
    const key = stop ? plane : `${TOP_PLANE}:end`;
    const group = groups.get(key) ?? { plane, planeLabel: label.get(plane) ?? plane, names: [], lines: [], ids: [] };
    group.names.push(e.label);
    if (e.anchor) group.lines.push(e.anchor.lineStart);
    group.ids.push(e.id);
    groups.set(key, group);
  }
  const all = [...groups.entries()];
  const normal = all.filter(([k]) => k === `${TOP_PLANE}:end`).map(([, g]) => g);
  const stops = all.filter(([k]) => k !== `${TOP_PLANE}:end`).map(([, g]) => g).sort((a, b) => b.ids.length - a.ids.length);
  return [...normal, ...stops];
}

export function buildDemoShowcase(data: DemoWorkspaceData = buildDemoWorkspace()): ShowcaseData {
  const { demo, processMap } = data;
  const objectUses = data.itFindings.uses ?? [];
  const planes = (planesRecord as ShowcasePlanesRecord).planes;

  const elements: Record<string, ShowcaseElement> = {};
  for (const e of processMap.elements) {
    elements[e.id] = [e.label, e.tag, e.anchor?.lineStart ?? null, e.anchor?.lineEnd ?? null, e.plane ?? TOP_PLANE];
  }
  const planeOf = (id: string) => elements[id]?.[4] ?? TOP_PLANE;

  const uses: ShowcaseUse[] = objectUses
    .map((u) => ({ object: u.object, use: u.use, level: u.level ?? 'Unknown', lines: [...u.lines] }))
    .sort((a, b) => LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level) || (a.lines[0] ?? 0) - (b.lines[0] ?? 0));

  const tableWrites = objectUses.filter((u) => u.kind === 'table' && u.use === 'write');
  const written = new Set(tableWrites.map((u) => u.object));
  const readsOnly = [...new Set(objectUses.filter((u) => u.kind === 'table' && u.use === 'read' && !written.has(u.object)).map((u) => u.object))];

  const changes: ShowcaseChange[] = [];
  for (const u of tableWrites) {
    const mark = SHOWCASE_CHANGE_MARKS[u.object] ?? '';
    changes.push({ object: u.object, how: u.custom ? 'changes its own table' : `changes SAP table ${u.object} directly`, line: u.lines[0], mark, plane: planeOf(mark) });
  }
  for (const call of SHOWCASE_CHANGE_CALLS) {
    const use = objectUses.find((u) => u.object === call.object && u.lines.includes(call.line));
    if (!use) continue;
    const mark = SHOWCASE_CHANGE_MARKS[call.object] ?? '';
    changes.push({ object: call.object, how: call.how, line: call.line, mark, plane: planeOf(mark) });
  }
  changes.sort((a, b) => a.line - b.line);

  const s = demo.analyze.summary;
  const critical = demo.analyze.findings.find((f) => f.severity === 'Critical');
  const groupsNd = new Map<string, number[]>();
  for (const gap of demo.analyze.coverage.unassessed) {
    groupsNd.set(gap.label, [...(groupsNd.get(gap.label) ?? []), gap.line]);
  }
  const keyUser = demo.design.keyUser;
  const rationale = demo.design.rationale ?? '';
  const commits = Number(/COMMIT WORK \((\d+)×\)/.exec(rationale)?.[1] ?? 0);
  const findUse = (object: string) => objectUses.find((u) => u.object === object)?.lines[0] ?? null;
  const topSteps = processMap.elements.filter((e) => e.plane === null && (e.tag === 'subProcess' || /task$/i.test(e.tag))).length;
  const source = data.source.split('\n');

  const facts: ShowcaseFacts = {
    objectName: demo.objectName,
    subject: demo.subject,
    engineVersion: APP_VERSION,
    catalogVersion: demo.catalogVersion,
    sourceSha256: createHash('sha256').update(data.source).digest('hex'),
    totalLines: demo.totalLines,
    linesOfCode: demo.linesOfCode,
    topSteps,
    elements: processMap.elements.length,
    levels: processMap.planes.length,
    anchored: processMap.traceability.anchored,
    rules: revealedRules(readSource(data.source, APP_VERSION).ruleSet).length,
    findings: demo.analyze.findings.length,
    distinctFindings: demo.analyze.distinctFindings,
    severity: { critical: s.criticalCount, high: s.highCount, medium: s.mediumCount, low: s.lowCount, info: s.infoCount },
    critical: critical ? { object: critical.objectName ?? '', line: critical.lineStart ?? 0 } : null,
    score: demo.analyze.cleanCoreScore,
    scoreLines: demo.analyze.scoreBreakdown.lines.map((l) => ({ label: l.label, count: l.count, points: l.points })),
    unassessedKinds: demo.analyze.scoreBreakdown.unassessedKinds,
    unassessedPoints: demo.analyze.scoreBreakdown.unassessedPoints,
    notDetermined: [...groupsNd.entries()].map(([label, lines]) => ({ label, lines })),
    notDeterminedCount: demo.analyze.coverage.unassessed.length,
    route: demo.design.recommendedRoute,
    target: demo.design.targetArtifact,
    confidence: demo.design.confidenceScore,
    keyUser: {
      total: keyUser?.parts.total ?? 0,
      keyUser: keyUser?.parts.keyUser ?? 0,
      code: keyUser?.parts.code ?? 0,
      candidates: (keyUser?.candidates ?? []).map((c) => c.part),
    },
    commits,
    batchInputLine: objectUses.find((u) => u.kind === 'transaction')?.lines[0] ?? null,
    uploadLine: findUse('GUI_UPLOAD'),
    writesDirect: tableWrites.filter((u) => !u.custom).map((u) => ({ object: u.object, line: u.lines[0] })),
    levelD: objectUses.filter((u) => u.level === 'D').length,
    levelC: objectUses.filter((u) => u.level === 'C').length,
    readsOnly,
    rail: demo.rail.map((r) => ({ label: r.label, state: r.state, badge: r.badge, detail: r.detail })),
    handoverMissing: demo.delivery.missing.map((m) => m.split(' — ')[0]),
  };

  const rules: ShowcaseRule[] = SHOWCASE_RULES.map((r) => ({ value: r.value, text: r.text, line: r.line }));

  const showcase: ShowcaseData = { planes, elements, source, facts, ends: endsOf(data), changes, uses, rules };
  assertNoTrustChain(showcase);
  return showcase;
}

/**
 * Every statement of the guide's own words the engine no longer supports, one
 * line each — empty when the showcase is current. Read by
 * `tests/demo-showcase-record.spec.ts`.
 */
export function showcaseDrift(data: DemoWorkspaceData = buildDemoWorkspace()): string[] {
  const out: string[] = [];
  const recorded = planesRecord as ShowcasePlanesRecord;
  const xmlSha = createHash('sha256').update(data.processMap.xml).digest('hex');
  if (recorded.xmlSha256 !== xmlSha) out.push('the map drawings were made from another BPMN file: run npx tsx scripts/regenerate-demo-showcase.ts');
  const planeIds = new Set(data.processMap.planes.map((p) => p.id ?? TOP_PLANE));
  const drawn = new Set(recorded.planes.map((p) => p.id));
  for (const id of planeIds) if (!drawn.has(id)) out.push(`level ${id} has no drawing`);
  const ids = new Set(data.processMap.elements.map((e) => e.id));
  for (const [object, mark] of Object.entries(SHOWCASE_CHANGE_MARKS)) {
    if (!ids.has(mark)) out.push(`the change of ${object} is marked on ${mark}, which the map no longer has`);
  }
  for (const call of SHOWCASE_CHANGE_CALLS) {
    if (!(data.itFindings.uses ?? []).some((u) => u.object === call.object && u.lines.includes(call.line))) {
      out.push(`${call.object} is no longer used at line ${call.line}`);
    }
  }
  for (const [step, id] of Object.entries(SHOWCASE_STEP_SELECTIONS)) {
    if (!ids.has(id)) out.push(`step ${step} selects ${id}, which the map no longer has`);
  }
  const anchors = new Map<string, string[]>();
  for (const r of revealedRules(readSource(data.source, APP_VERSION).ruleSet)) anchors.set(r.id, r.anchors);
  for (const r of SHOWCASE_RULES) {
    const a = anchors.get(r.ruleId);
    if (!a) out.push(`rule ${r.ruleId} (${r.value}) is no longer revealed`);
    else if (!a.some((x) => x === `L${r.line}` || x.startsWith(`L${r.line}-`))) out.push(`rule ${r.ruleId} no longer starts at line ${r.line}`);
    if (!data.source.split('\n')[r.line - 1]?.includes(r.literal)) out.push(`line ${r.line} no longer reads ${r.literal}`);
  }
  return out;
}
