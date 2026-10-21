/**
 * The fit-to-standard gate — roadmap 3.0.20, step F1 of
 * `docs/design/fit-to-standard-concept.md` §3 (owner decisions of 18.10.2026).
 *
 * The question: is this program worth examining against SAP standard — is there
 * a standard process it bends, a view on standard data a standard app could
 * give, or standard transactions it drives? It is answered from **the kind of
 * program**, never from the clean core score (owner decision 1): the clearest
 * fit-to-standard cases score low, because an enhancement or a modification is
 * what costs points, and dropping exactly that deviation is what living with
 * the standard means. The score is shown beside the offer elsewhere; it is not
 * an input here (`tests/fit-to-standard-gate.spec.ts` guards the source).
 *
 * **Three outcomes, never two:**
 *
 *   - `offered`        — one or more candidacy classes, each signal with its lines;
 *   - `not-offered`    — an exclusion, with the reason and its lines (shown in the
 *                        IT view only, owner decision 2);
 *   - `not-determined` — what is missing (no current signed run, an opaque call
 *                        on the reached code, the SAP objects not sorted yet).
 *
 * Candidacy classes (§3.2):
 *
 *   | Class | Signal                                                                                  |
 *   |-------|-----------------------------------------------------------------------------------------|
 *   | A     | an enhancement, a BAdI or exit implementation, or a modification — a deviation from a standard process |
 *   | B     | no write of any kind, at least one read of a standard table, and every SAP object read has a path on the target edition — an own view on standard data |
 *   | C     | batch input or a call of an SAP object with a released path, and no own persistence — code driving standard transactions |
 *   | D     | a rule whose value the account marked as customizing — hard-coded configuration (weak, an add-on) |
 *
 * Exclusions (§3.3): no SAP object at all (`none-used`); own persistence as the
 * main effect (a write to an own table and no class A signal); integration as
 * the main effect (an outbound RFC, an ABAP proxy, a file written as the
 * program's only output); nothing comparable (no business-comparable step).
 *
 * The gate **offers an examination, it never claims coverage**: its sentence is
 * "worth examining against SAP standard", never "covered by the standard".
 * It is a view — derived when shown, never stored, hashed or signed, like the
 * clean core level and the distance to standard.
 *
 * "Reached code" stands for the concept's "main path": the findings the engine
 * did not mark as unreachable behind a constant gate or as standing in a routine
 * nothing calls, and the elements the process skeleton draws (it draws only what
 * an entry reaches).
 *
 * Pure, and with type imports only — no `lib/bpmn`, no catalog, no score. The
 * server adapter `lib/fit-to-standard-read.ts` gathers the readings.
 */

/** The four candidacy classes of the concept, §3.2. */
export type FitGateClass = 'A' | 'B' | 'C' | 'D';

export const FIT_GATE_CLASS_LABELS: Readonly<Record<FitGateClass, string>> = Object.freeze({
  A: 'Deviation from a standard process',
  B: 'Own view on standard data',
  C: 'Code driving standard transactions',
  D: 'Hard-coded customizing',
});

/** What living with the standard means for each class, in one sentence. */
export const FIT_GATE_CLASS_MEANING: Readonly<Record<FitGateClass, string>> = Object.freeze({
  A: 'The deviation is dropped and the standard process runs as SAP ships it.',
  B: 'A standard app or analytical query shows the data; the own presentation and filters are given up.',
  C: 'A standard mass-processing app, a scheduled standard job or a released API replaces the automation; the own orchestration is given up.',
  D: 'The hard-coded values become standard configuration.',
});

/** A finding as the gate reads it — `EvidenceFinding` satisfies it once the adapter adds `direction`/`outbound`. */
export interface FitGateFinding {
  kind: string;
  lineStart: number;
  lineEnd?: number;
  objectName?: string;
  /** For an `rfc-call`: the call leaves this system (`rfcCallTarget === 'outbound'`). */
  outbound?: boolean;
  /** For a file finding (`gui-download`, `dataset-io`): the program writes the file (`out`) or reads it (`in`). */
  direction?: 'in' | 'out' | null;
  /** True when the engine marked the finding unreachable or in a routine nothing calls. */
  notReached?: boolean;
}

/** An element of the process skeleton with its comparability class (`element-comparability.ts`). */
export interface FitGateElement {
  id: string;
  kind: string;
  comparability: 'business-comparable' | 'technical' | 'structural' | 'unknown';
  anchor: { lineStart: number; lineEnd: number } | null;
}

/** Where an SAP object the code uses stands on the target edition (from the four buckets). */
export type FitGateObjectPath = 'released' | 'successor' | 'no-path' | 'own-work' | 'not-sorted' | 'retire';

export interface FitGateObject {
  /** Upper-cased. */
  name: string;
  path: FitGateObjectPath;
  /** The code calls it (a function module or BAPI) rather than reading or writing it. */
  called: boolean;
  /** The first line the code uses it on, or `null`. */
  line: number | null;
}

export type FitGateSapObjects =
  | { state: 'none-used' }
  | { state: 'ready'; objects: FitGateObject[] }
  | { state: 'not-determined'; reason: string };

/** The phase states the gate needs to tell apart — structurally `PhaseState` of `workflow-steps.ts`. */
export type FitGateAnalyzeState = 'empty' | 'partial' | 'done' | 'stale' | 'not-applicable';

export interface FitToStandardGateInput {
  /** `demo` never has a signed run and says so; `project` needs one. */
  mode: 'project' | 'demo';
  hasRun: boolean;
  /** The Analyze phase — `done` means a current, readable signed run. */
  analyzeState: FitGateAnalyzeState;
  signedSourceSha256: string | null;
  /** The digest of the source the readings below were made from. */
  sourceSha256: string | null;
  /** The run's target edition; a project without one reads Public (`lib/target-edition.ts`). */
  edition: 'public' | 'private' | null;
  findings: readonly FitGateFinding[];
  sapObjects: FitGateSapObjects;
  elements: readonly FitGateElement[];
  /** Rules whose value source the account marked `customizing` (`process-states.ts`), with their lines. */
  customizing?: ReadonlyArray<{ ruleId: string; lineStart: number; lineEnd?: number }>;
}

/** One signal or reason, always with its lines — "enhancement at L212–L288". */
export interface FitGateSignal {
  kind: string;
  lineStart: number | null;
  lineEnd: number | null;
  objectName: string | null;
  /** One sentence, ready to show. */
  sentence: string;
}

export type FitGateExclusion = 'none-used' | 'own-persistence' | 'integration' | 'nothing-comparable' | 'no-signal';

export type FitGateMissing = 'no-run' | 'stale-run' | 'unread-run' | 'source-changed' | 'objects-not-sorted' | 'opaque-call' | 'no-elements';

export type FitToStandardGate =
  | {
      outcome: 'offered';
      /** In the order A, B, C, D; the first is the primary class. */
      classes: FitGateClass[];
      primary: FitGateClass;
      strength: 'strong' | 'medium' | 'weak';
      edition: 'public' | 'private';
      /** True when the edition was not set and Public was assumed. */
      editionAssumed: boolean;
      signals: Array<FitGateSignal & { gateClass: FitGateClass }>;
      /** "Worth examining against SAP standard: …" — never "covered". */
      sentence: string;
      /** Private Edition: Keep stays a real alternative (owner decision 4). `null` on Public. */
      editionNote: string | null;
    }
  | {
      outcome: 'not-offered';
      exclusion: FitGateExclusion;
      reason: string;
      signals: FitGateSignal[];
    }
  | {
      outcome: 'not-determined';
      missing: FitGateMissing;
      reason: string;
      signals: FitGateSignal[];
    };

/** The sentence every surface that shows the offer carries. */
export const FIT_GATE_HONESTY =
  'The offer is a reading of the signed run. It says the program is worth examining against SAP standard — '
  + 'never that the standard covers it.';

const WRITE_KINDS = new Set(['standard-table-write', 'custom-table-write', 'bdc', 'batch-input', 'update-task', 'commit-work']);
const DEVIATION_KINDS = new Set(['enhancement', 'hook-implementation', 'modification']);
const OUTPUT_KINDS = new Set(['classic-alv', 'form-output']);
const FILE_KINDS = new Set(['gui-download', 'dataset-io']);

const DEVIATION_WORDS: Readonly<Record<string, string>> = {
  enhancement: 'Enhancement of a standard program',
  'hook-implementation': 'Implementation of a BAdI or exit',
  modification: 'Modification of a standard object',
};

function lines(lineStart: number | null, lineEnd?: number | null): string {
  if (lineStart === null) return 'no line';
  return typeof lineEnd === 'number' && lineEnd > lineStart ? `L${lineStart}–L${lineEnd}` : `L${lineStart}`;
}

function signalOf(f: FitGateFinding, sentence: string): FitGateSignal {
  return {
    kind: f.kind,
    lineStart: f.lineStart,
    lineEnd: typeof f.lineEnd === 'number' ? f.lineEnd : f.lineStart,
    objectName: f.objectName ? f.objectName.toUpperCase() : null,
    sentence: `${sentence} at ${lines(f.lineStart, f.lineEnd)}.`,
  };
}

const notDetermined = (missing: FitGateMissing, reason: string, signals: FitGateSignal[] = []): FitToStandardGate => ({
  outcome: 'not-determined',
  missing,
  reason,
  signals,
});

const notOffered = (exclusion: FitGateExclusion, reason: string, signals: FitGateSignal[] = []): FitToStandardGate => ({
  outcome: 'not-offered',
  exclusion,
  reason,
  signals,
});

const byLine = (a: FitGateFinding, b: FitGateFinding) => a.lineStart - b.lineStart || a.kind.localeCompare(b.kind);

/**
 * The gate. Rules, not percentage thresholds; the order is the order a reader
 * can act on: what the reading stands on, then what excludes the path, then
 * what makes it a candidate.
 */
export function fitToStandardGate(input: FitToStandardGateInput): FitToStandardGate {
  // 3.1 — what the gate stands on.
  if (input.mode === 'project') {
    if (!input.hasRun) return notDetermined('no-run', 'No signed run yet — the offer is read only from a signed run.');
    if (input.analyzeState === 'stale') {
      return notDetermined('stale-run', 'The source or an input changed after the signed run — run the analysis again.');
    }
    if (input.analyzeState !== 'done') {
      return notDetermined('unread-run', 'The signed run could not be read, so nothing it found can be weighed.');
    }
    if (input.signedSourceSha256 && input.sourceSha256 && input.signedSourceSha256 !== input.sourceSha256) {
      return notDetermined('source-changed', 'The source on this project is not the one the signed run read — run the analysis again.');
    }
  }
  if (input.sapObjects.state === 'not-determined') {
    return notDetermined('objects-not-sorted', input.sapObjects.reason);
  }

  const reached = input.findings.filter((f) => !f.notReached).slice().sort(byLine);
  const elements = input.elements;

  // 3.3 — exclusions.
  if (input.sapObjects.state === 'none-used') {
    return notOffered(
      'none-used',
      'The code reads, writes and calls no SAP object — it is an own application, so there is no standard process to fit it to.',
    );
  }
  if (elements.length === 0) {
    return notDetermined('no-elements', 'No process could be read from the code, so nothing can be compared with the standard.');
  }
  const opaque = elements.filter((e) => e.kind === 'call-opaque');
  if (opaque.length > 0) {
    return notDetermined(
      'opaque-call',
      'The code calls something whose source is not part of the upload, so what the program does cannot be weighed against the standard. Upload the called program.',
      opaque.map((e) => ({
        kind: 'call-opaque',
        lineStart: e.anchor?.lineStart ?? null,
        lineEnd: e.anchor?.lineEnd ?? null,
        objectName: null,
        sentence: `A call whose source is not in the upload at ${lines(e.anchor?.lineStart ?? null, e.anchor?.lineEnd ?? null)}.`,
      })),
    );
  }
  if (!elements.some((e) => e.comparability === 'business-comparable')) {
    return notOffered(
      'nothing-comparable',
      'Every step the code takes is technical or structural (reads, writes, checks of a return code), so there is no business step to compare with the standard.',
    );
  }

  const integration = [
    ...reached.filter((f) => f.kind === 'rfc-call' && f.outbound).map((f) => signalOf(f, 'Call to another system')),
    ...reached.filter((f) => f.kind === 'abap-proxy').map((f) => signalOf(f, 'Message to another system through an ABAP proxy')),
  ];
  const fileOut = reached.filter((f) => FILE_KINDS.has(f.kind) && f.direction === 'out');
  const hasOutput = reached.some((f) => OUTPUT_KINDS.has(f.kind));
  if (fileOut.length > 0 && !hasOutput) {
    integration.push(...fileOut.map((f) => signalOf(f, 'A file written for another consumer as the program\'s result')));
  }
  if (integration.length > 0) {
    return notOffered(
      'integration',
      'The program exchanges data with another system or a file consumer — that is integration, not a process the standard runs instead.',
      integration,
    );
  }

  const deviations = reached.filter((f) => DEVIATION_KINDS.has(f.kind));
  const ownWrites = reached.filter((f) => f.kind === 'custom-table-write');
  if (ownWrites.length > 0 && deviations.length === 0) {
    return notOffered(
      'own-persistence',
      'The program keeps its own business data in its own tables — that is an own business object (a rebuild, or a key-user custom business object), not something the standard covers.',
      ownWrites.map((f) => signalOf(f, `Write to the own table ${f.objectName ? f.objectName.toUpperCase() : ''}`.trim())),
    );
  }

  // 3.2 — candidacy.
  const objects = input.sapObjects.objects;
  const signals: Array<FitGateSignal & { gateClass: FitGateClass }> = [];
  const classes: FitGateClass[] = [];

  if (deviations.length > 0) {
    classes.push('A');
    for (const f of deviations) signals.push({ ...signalOf(f, DEVIATION_WORDS[f.kind] ?? 'Deviation'), gateClass: 'A' });
  }

  const writes = reached.filter((f) => WRITE_KINDS.has(f.kind));
  const reads = reached.filter((f) => f.kind === 'standard-table-read');
  const readObjects = new Set(reads.map((f) => (f.objectName ?? '').toUpperCase()).filter(Boolean));
  const readPaths = objects.filter((o) => readObjects.has(o.name));
  const everyReadHasPath = readPaths.length > 0 && readPaths.every((o) => o.path === 'released' || o.path === 'successor');
  if (writes.length === 0 && reads.length > 0 && everyReadHasPath) {
    classes.push('B');
    const seen = new Set<string>();
    for (const f of reads) {
      const name = (f.objectName ?? '').toUpperCase();
      if (seen.has(name)) continue;
      seen.add(name);
      signals.push({ ...signalOf(f, `Read of the standard table ${name}, which has a released path`), gateClass: 'B' });
    }
    for (const f of reached.filter((x) => OUTPUT_KINDS.has(x.kind))) {
      signals.push({ ...signalOf(f, 'Own presentation of the data'), gateClass: 'B' });
    }
  }

  const drivenCalls = objects.filter((o) => o.called && (o.path === 'released' || o.path === 'successor'));
  const batchInput = reached.filter((f) => f.kind === 'bdc' || f.kind === 'batch-input');
  if (ownWrites.length === 0 && (drivenCalls.length > 0 || batchInput.length > 0)) {
    classes.push('C');
    for (const o of drivenCalls) {
      signals.push({
        kind: 'call',
        lineStart: o.line,
        lineEnd: o.line,
        objectName: o.name,
        sentence: `Call of ${o.name}, which has a released path, at ${lines(o.line)}.`,
        gateClass: 'C',
      });
    }
    for (const f of batchInput) signals.push({ ...signalOf(f, 'Batch input into a standard transaction'), gateClass: 'C' });
  }

  for (const rule of input.customizing ?? []) {
    if (!classes.includes('D')) classes.push('D');
    signals.push({
      kind: 'customizing',
      lineStart: rule.lineStart,
      lineEnd: rule.lineEnd ?? rule.lineStart,
      objectName: null,
      sentence: `${rule.ruleId}: a value you marked as customizing, at ${lines(rule.lineStart, rule.lineEnd)}.`,
      gateClass: 'D',
    });
  }

  if (classes.length === 0) {
    // Name what came closest, so the IT view says why a near miss is a miss.
    const near: FitGateSignal[] = [];
    for (const o of readPaths.filter((x) => x.path !== 'released' && x.path !== 'successor')) {
      near.push({
        kind: 'read-without-path',
        lineStart: o.line,
        lineEnd: o.line,
        objectName: o.name,
        sentence: `${o.name} is read, and SAP names no released path for it on this edition, at ${lines(o.line)}.`,
      });
    }
    for (const o of objects.filter((x) => x.called && x.path !== 'released' && x.path !== 'successor')) {
      near.push({
        kind: 'call-without-path',
        lineStart: o.line,
        lineEnd: o.line,
        objectName: o.name,
        sentence: `${o.name} is called, and SAP names no released path for it on this edition, at ${lines(o.line)}.`,
      });
    }
    return notOffered(
      'no-signal',
      'The code neither bends a standard process, nor only shows standard data with a released path, nor drives standard transactions with a released path — nothing in it points to a standard process to fit to.',
      near,
    );
  }

  const edition = input.edition ?? 'public';
  const primary = classes[0];
  const strength = primary === 'A' ? 'strong' : primary === 'D' ? 'weak' : 'medium';
  return {
    outcome: 'offered',
    classes,
    primary,
    strength,
    edition,
    editionAssumed: input.edition === null,
    signals,
    sentence: `Worth examining against SAP standard: ${FIT_GATE_CLASS_LABELS[primary].toLowerCase()}. ${FIT_GATE_CLASS_MEANING[primary]}`,
    editionNote: edition === 'private'
      ? 'On SAP Cloud ERP Private keeping the program stays a real alternative — compare it with what living with the standard gives up.'
      : null,
  };
}

/** The one line the IT view shows for a gate that does not offer — with the lines it rests on. */
export function fitGateReasonLine(gate: FitToStandardGate): string | null {
  if (gate.outcome === 'offered') return null;
  const where = gate.signals.slice(0, 3).map((s) => lines(s.lineStart, s.lineEnd)).join(', ');
  return where ? `${gate.reason} (${where}${gate.signals.length > 3 ? ', …' : ''})` : gate.reason;
}
