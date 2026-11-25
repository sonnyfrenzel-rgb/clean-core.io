/**
 * `analyze_abap` and `export_bpmn` of the MCP beta (docs/design/mcp-beta.md):
 * the deterministic reading the web app makes before any model step, mapped to
 * a small answer for another assistant.
 *
 * Same engine, same order, same pre-checks as the server half of
 * `app/api/runs/create/route.ts`: the 256 KiB ceiling before anything is
 * computed, `looksLikeAbap`, the edition `public` or `private`, the catalog
 * snapshot that edition reads, and this release's engine (`APP_VERSION`) — so a
 * finding that appears in a chat would appear the same way in a run made from
 * the same source with this release.
 *
 * Nothing here calls a model, the network or a store: the engine is pure, and
 * `tests/mcp-beta.spec.ts` walks the import graph of `lib/mcp/` to keep it so.
 * Nothing is written and nothing about the source is logged here.
 */
import crypto from 'crypto';
import { APP_VERSION } from '../version';
import { looksLikeAbap } from '../abap-input-check';
import { countSourceLines } from '../source-lines';
import { buildAbapEvidence, type EvidenceFinding } from '../abap/evidence-model';
import { routeExtensibility } from '../abap/extensibility-router';
import { buildProcessSkeleton } from '../abap/process-skeleton';
import { deriveBusinessRules } from '../abap/business-rule-set';
import { readNoResultStates } from '../abap/no-result-states';
import { getLevelRuleVersion, gradeSapObjectUse } from '../abap/catalog-service';
import { catalogSnapshotRefFor } from '../abap/catalog-snapshots';
import type { ObjectUse } from '../abap/abcd-classification';
import { buildBpmnExport, READING_WRAP } from '../bpmn/export';
import { neutralise, neutraliseDeep, quoteSource, stripComments, stripLineComment } from './sanitize';

/** The most ABAP one call may be asked to analyse — the ceiling of `runs/create` (`MAX_ANALYSED_SOURCE_BYTES`). */
export const MAX_SOURCE_BYTES = 256 * 1024;

export const SCHEMA_VERSION = '1';

export type Edition = 'public' | 'private';
export const DEFAULT_EDITION: Edition = 'private';

export const ANALYZE_PARTS = ['process', 'rules', 'findings', 'not_determined', 'no_result_states'] as const;
export type AnalyzePart = (typeof ANALYZE_PARTS)[number];

export const DEFAULT_MAX_ITEMS = 40;
export const MAX_MAX_ITEMS = 200;

/** A refusal the caller can act on: said in a sentence, with a stable code. */
export class ToolInputError extends Error {
  constructor(
    readonly code: 'source-too-large' | 'not-abap' | 'edition-not-supported' | 'empty-source',
    message: string,
  ) {
    super(message);
  }
}

const APP_ORIGIN = 'https://clean-core.io';

/** Where the answer came from, on every result (roadmap 3.0.17 (3)): the engine, not a model. */
const PROVENANCE = { origin: 'engine', ai_generated: false, signed: false } as const;

function engineStamp(edition: Edition) {
  const snapshot = catalogSnapshotRefFor(edition, '');
  return {
    version: APP_VERSION,
    edition,
    catalog_snapshot: { key: snapshot.registryKey, sha256: snapshot.sourceSha256 },
    level_rule_version: getLevelRuleVersion().version,
  };
}

/** The pre-checks of `runs/create`, in its order: size, then "is this ABAP", then the edition. */
export function checkSource(source: string, edition: unknown): Edition {
  const bytes = Buffer.byteLength(source, 'utf8');
  if (bytes > MAX_SOURCE_BYTES) {
    throw new ToolInputError(
      'source-too-large',
      `That source is ${Math.round(bytes / 1024)} KB. One call reads at most ${MAX_SOURCE_BYTES / 1024} KB of ABAP; analyze the program in parts.`,
    );
  }
  if (source.trim() === '') throw new ToolInputError('empty-source', 'The source is empty.');
  if (!looksLikeAbap(source)) {
    throw new ToolInputError(
      'not-abap',
      'That does not look like ABAP. The engine needs at least one ABAP construct: a REPORT, CLASS, FORM, FUNCTION, METHOD, a declaration or a SELECT.',
    );
  }
  const asked = edition === undefined || edition === null || edition === '' ? DEFAULT_EDITION : edition;
  if (asked !== 'public' && asked !== 'private') {
    throw new ToolInputError(
      'edition-not-supported',
      'The engine assesses against SAP S/4HANA Cloud Public Edition ("public") and SAP Cloud ERP Private ("private") only.',
    );
  }
  return asked;
}

/** What was received: hash, size and the first line with code on it, so the caller can see what was read. */
function inputOf(source: string) {
  const lines = source.split(/\r\n|\r|\n/);
  let firstLine = '';
  let firstLineNumber: number | null = null;
  for (let i = 0; i < lines.length; i++) {
    const code = stripLineComment(lines[i]).trim();
    if (code) {
      firstLine = quoteSource(code);
      firstLineNumber = i + 1;
      break;
    }
  }
  return {
    sha256: crypto.createHash('sha256').update(source, 'utf8').digest('hex'),
    bytes: Buffer.byteLength(source, 'utf8'),
    lines: countSourceLines(source),
    first_line: firstLine,
    first_line_number: firstLineNumber,
  };
}

function objectType(source: string): string {
  if (/^\s*CLASS\s+/im.test(source)) return 'Class';
  if (/^\s*INTERFACE\s+/im.test(source)) return 'Interface';
  if (/^\s*FUNCTION\s+/im.test(source)) return 'Function Module';
  if (/^\s*REPORT\s+/im.test(source)) return 'Report';
  if (/^\s*FORM\s+/im.test(source)) return 'Form Routine';
  return 'ABAP Source';
}

/** The use a finding's object is graded for: a write is graded as a write, a read as a read. */
function useOf(finding: EvidenceFinding): ObjectUse | null {
  if (finding.kind === 'standard-table-write' || finding.kind === 'custom-table-write') return 'write';
  if (finding.kind === 'standard-table-read' || finding.kind === 'table-access') return 'read';
  return null;
}

function span(lineStart: number, lineEnd?: number): [number, number] {
  return [lineStart, lineEnd && lineEnd >= lineStart ? lineEnd : lineStart];
}

function take<T>(items: readonly T[], max: number): { kept: T[]; dropped: number } {
  return { kept: items.slice(0, max), dropped: Math.max(0, items.length - max) };
}

export interface AnalyzeArgs {
  source: string;
  edition?: unknown;
  include?: readonly AnalyzePart[];
  maxItems?: number;
}

export function analyzeAbap(args: AnalyzeArgs) {
  const { source } = args;
  const edition = checkSource(source, args.edition);
  const include = new Set<AnalyzePart>(args.include && args.include.length ? args.include : ANALYZE_PARTS);
  const max = Math.min(MAX_MAX_ITEMS, Math.max(1, Math.floor(args.maxItems ?? DEFAULT_MAX_ITEMS)));
  const snapshot = catalogSnapshotRefFor(edition, '');

  const evidence = buildAbapEvidence(source, 'source.abap', edition, snapshot.registryKey, APP_VERSION);
  const route = routeExtensibility(evidence, edition, APP_VERSION);
  // Only what the engine produced: a narrative source is not an engine finding, whatever the type allows.
  const findings = evidence.findings.filter((f) => f.source !== 'llm-narrative');

  const truncated: Record<string, number> = {};
  const levelsUnknown = new Set<string>();
  const result: Record<string, unknown> = {
    schema_version: SCHEMA_VERSION,
    ...PROVENANCE,
    engine: engineStamp(edition),
    input: { ...inputOf(source), object_type: objectType(source) },
    summary: {
      clean_core_score: route.cleanCoreScore,
      route: route.recommendedRoute,
      findings_by_severity: {
        Critical: evidence.summary.criticalCount,
        High: evidence.summary.highCount,
        Medium: evidence.summary.mediumCount,
        Low: evidence.summary.lowCount,
        Info: evidence.summary.infoCount,
      },
      coverage_complete: evidence.coverage.complete,
    },
  };

  if (include.has('findings')) {
    const { kept, dropped } = take(findings, max);
    if (dropped) truncated.findings = dropped;
    result.findings = kept.map((f) => {
      let object: Record<string, unknown> | undefined;
      if (f.objectName) {
        const graded = gradeSapObjectUse(f.objectName, useOf(f), snapshot.registryKey);
        if (graded.grade === 'Unknown') levelsUnknown.add(f.objectName.toUpperCase());
        object = {
          name: f.objectName,
          ...(f.objectType ? { type: f.objectType } : {}),
          level: graded.grade,
          level_basis: graded.provenance,
          ...(graded.state ? { sap_state: graded.state } : {}),
          ...(graded.use ? { use: graded.use } : {}),
          ...(graded.objectGrade ? { level_of_object_alone: graded.objectGrade } : {}),
        };
      }
      return {
        id: f.id,
        kind: f.kind,
        title: f.title,
        severity: f.severity,
        confidence: f.confidence,
        lines: f.lines && f.lines.length ? f.lines.slice(0, 50) : span(f.lineStart, f.lineEnd),
        ...(object ? { object } : {}),
        recommendation: f.recommendation,
        code_quoted: quoteSource(f.snippet),
        ...(f.unreachable ? { unreachable: { gate_line: f.unreachable.gateLine } } : {}),
        ...(f.uncalled ? { uncalled_routine: f.uncalled.routine } : {}),
      };
    });
  }

  if (include.has('process')) {
    const skeleton = buildProcessSkeleton(source, { engineVersion: APP_VERSION });
    const { kept, dropped } = take(skeleton.nodes, max);
    if (dropped) truncated.steps = dropped;
    const keptIds = new Set(kept.map((n) => n.id));
    const edges = skeleton.edges.filter((e) => keptIds.has(e.from) && keptIds.has(e.to));
    const edgeTake = take(edges, max * 2);
    if (edgeTake.dropped || edges.length < skeleton.edges.length) {
      truncated.edges = skeleton.edges.length - edgeTake.kept.length;
    }
    const laneOf = new Map<string, string>();
    for (const lane of skeleton.lanes) for (const id of lane.nodeIds) if (!laneOf.has(id)) laneOf.set(id, lane.id);
    result.process = {
      entries_quoted: skeleton.entries.map((e) => quoteSource(e)),
      lanes: skeleton.lanes.map((l) => ({ id: l.id, kind: l.kind, name_quoted: quoteSource(l.name) })),
      steps: kept.map((n) => ({
        id: n.id,
        kind: n.kind,
        label_quoted: quoteSource(n.label),
        lines: n.anchor ? span(n.anchor.lineStart, n.anchor.lineEnd) : null,
        ...(n.anchor ? {} : { unanchored_reason: n.unanchoredReason ?? 'no line range' }),
        ...(laneOf.has(n.id) ? { lane: laneOf.get(n.id) } : {}),
      })),
      edges: edgeTake.kept.map((e) => ({
        from: e.from,
        to: e.to,
        kind: e.kind,
        ...(e.condition ? { condition_quoted: quoteSource(e.condition) } : {}),
      })),
      not_drawn: {
        unreached_routines: skeleton.notDrawn.unreached.length,
        unreached_lines: skeleton.notDrawn.unreachedLines,
        technical_helpers: skeleton.notDrawn.technicalHelpers.length,
      },
      unanchored_steps: skeleton.unanchoredNodes,
    };
  }

  if (include.has('rules')) {
    const rules = deriveBusinessRules(source, APP_VERSION);
    const { kept, dropped } = take(rules.rules, max);
    if (dropped) truncated.business_rules = dropped;
    result.business_rules = kept.map((r) => {
      const lines: Array<[number, number]> = [];
      const seen = new Set<string>();
      for (const s of r.sentences) {
        for (const a of s.anchors) {
          const key = `${a.lineStart}-${a.lineEnd}`;
          if (!seen.has(key) && lines.length < 20) {
            seen.add(key);
            lines.push(span(a.lineStart, a.lineEnd));
          }
        }
      }
      return {
        id: r.id,
        type: r.type,
        label_quoted: quoteSource(r.label),
        text_quoted: quoteSource(r.text, 400),
        lines,
        parameters: r.parameters.slice(0, 10).map((p) => ({
          ...(p.subject ? { subject_quoted: quoteSource(p.subject, 80) } : {}),
          operator_quoted: quoteSource(p.operator, 20),
          value_quoted: quoteSource(p.literal, 80),
          lines: span(p.lineStart, p.lineEnd),
        })),
      };
    });
  }

  if (include.has('no_result_states')) {
    const states = readNoResultStates(source);
    const { kept, dropped } = take(states, max);
    if (dropped) truncated.no_result_states = dropped;
    result.no_result_states = kept.map((s) => ({ kind: s.kind, lines: span(s.lineStart, s.lineEnd), code_quoted: quoteSource(s.text) }));
  }

  if (include.has('not_determined')) {
    result.not_determined = {
      unassessed: evidence.coverage.gaps.map((g) => ({ gap: g.gap, label: g.label, count: g.count, first_line: g.firstLine })),
      levels_unknown: [...levelsUnknown].sort(),
    };
  }

  result.truncated = truncated;
  result.next = {
    open_in_app: `${APP_ORIGIN}/`,
    note:
      'This is not a signed run and nothing was stored. Line numbers, levels and findings come from the Clean-Core.io evidence engine; any wording around them comes from your assistant. Upload the same source in Clean-Core.io for the process map, the three views and a signed run; its source hash will match input.sha256.',
  };
  return neutraliseDeep(result);
}

export interface BpmnArgs {
  source: string;
  edition?: unknown;
  processName?: string;
}

/**
 * The BPMN 2.0 file of the engine's process map, as the app's download builds it
 * (`buildReadingExports`: plain engine labels, no stored naming — so no name a
 * model wrote). The labels are read from the source with its comment text
 * removed, so no author's comment is quoted into the file; the map itself is
 * drawn from the source as received.
 */
export function exportBpmn(args: BpmnArgs) {
  const { source } = args;
  const edition = checkSource(source, args.edition);
  const name = neutralise((args.processName || 'ABAP process').replace(/\s+/g, ' ').trim()).slice(0, 80) || 'ABAP process';
  // The plain file of `buildReadingExports`, with one difference: the words of the labels are read from the source
  // without its comments, while the map is drawn from the source as received, so every line anchor is the same.
  const skeleton = buildProcessSkeleton(source, { engineVersion: APP_VERSION });
  const plain = buildBpmnExport(skeleton, {
    processName: name,
    sourceFileName: 'source.abap',
    exporterVersion: APP_VERSION,
    source: stripComments(source),
    names: 'plain',
    wrap: READING_WRAP,
  });
  return neutraliseDeep({
    schema_version: SCHEMA_VERSION,
    ...PROVENANCE,
    engine: engineStamp(edition),
    input: inputOf(source),
    stats: plain.stats,
    bpmn_xml: plain.xml,
    note: 'BPMN 2.0 XML with the engine\'s labels; no AI model named any element. Save it as a .bpmn file to open it in SAP Signavio or another BPMN tool.',
  });
}
