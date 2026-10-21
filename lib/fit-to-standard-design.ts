import type { EvidenceLevelValue } from './evidence-level';
import type { FitGateClass, FitGateFinding, FitGateObject, FitToStandardGate } from './fit-to-standard-gate';

/**
 * The fit-to-standard design — roadmap 3.0.20, step F2 of
 * `docs/design/fit-to-standard-concept.md` §4 (owner decisions 18.10.2026;
 * the term "fit-to-standard design" is decision 8).
 *
 * What it says: what living with SAP standard would **give up**, what SAP
 * standard **might do instead** (a candidate to check, never more than E1 from
 * the engine), and what **remains a gap** (key user, organisational, open).
 * The engine proves the first half; the second half is the account's after a
 * fit-to-standard workshop. That hard limit is the header sentence, wherever
 * the design is shown (`FIT_DESIGN_HEADER`).
 *
 * The derivation, without a model (§4.3):
 *
 *   1. every element of the as-is skeleton is copied with its anchor — never
 *      a new one (`anchor !== null` exactly when `anchorBasis === 'code'`);
 *   2. technical and structural elements `goes-with-program`, never "not
 *      covered" (roadmap 7.8); `unknown` ones stay `unknown`;
 *   3. a business-comparable element inside the deviation the gate read is
 *      `given-up` with the findings that make it so (A: the hook's lines;
 *      B: the own presentation and filters; C: the orchestration around the
 *      standard call) — or `gap-key-user` where a 3.0.19 key-user candidate
 *      replaces exactly those lines;
 *   4. a rule the account marked as customizing makes its element `configuration`;
 *   5. a successor SAP's catalog names for an object the element uses makes it
 *      `covered` as a **candidate**: E1, check word `catalog`, "to verify";
 *   6. everything else business-comparable is `gap-open` — the honest default,
 *      which travels into the decision as a condition (owner decision 7).
 *
 * No scope item, app ID or API is produced here: a reference is only ever the
 * catalog successor of an object the code uses, or a key-user app name of
 * 3.0.19. The model step (F5) adds proposals through `checkSapReferences`.
 *
 * Pure and deterministic: the same inputs give a byte-identical design. No
 * clock, no model, no catalog — the server adapter passes the readings in.
 */

export const FIT_DESIGN_FORMAT_VERSION = 1;

/** The sentence every view of the design carries (§4.5). */
export const FIT_DESIGN_HEADER =
  'A fit-to-standard design says what living with the standard would give up. '
  + 'Whether the standard covers a step is confirmed by you, not by the code.';

/** The sentence a design made against the gate carries (owner decision 3). */
export const AGAINST_GATE_SENTENCE =
  'Made on request against the gate: the engine does not recommend this path for this program, and this design never counts as a recommendation.';

export type FitDisposition =
  | 'covered'
  | 'configuration'
  | 'given-up'
  | 'gap-key-user'
  | 'gap-organisational'
  | 'gap-open'
  | 'goes-with-program'
  | 'unknown';

export const FIT_DISPOSITIONS: readonly FitDisposition[] = Object.freeze([
  'given-up',
  'covered',
  'configuration',
  'gap-key-user',
  'gap-organisational',
  'gap-open',
  'goes-with-program',
  'unknown',
]);

/** One label and one short mark per disposition — never colour only (§4.5). */
export const FIT_DISPOSITION_LABELS: Readonly<Record<FitDisposition, { label: string; mark: string; meaning: string }>> = Object.freeze({
  'given-up': { label: 'Given up', mark: 'G', meaning: 'Behaviour of the program the standard does not have; living with the standard means losing it.' },
  covered: { label: 'SAP standard candidate', mark: 'S', meaning: 'SAP standard may do this step — a candidate to check in the workshop.' },
  configuration: { label: 'Configuration', mark: 'C', meaning: 'Becomes standard configuration instead of a value in the code.' },
  'gap-key-user': { label: 'Gap — key user', mark: 'K', meaning: 'Still needed, and a key-user extension could cover it.' },
  'gap-organisational': { label: 'Gap — organisational', mark: 'O', meaning: 'Still needed, handled by a change in the process or a role, without a build.' },
  'gap-open': { label: 'Gap — open', mark: '?', meaning: 'Still needed, and nothing covering it has been named yet.' },
  'goes-with-program': { label: 'Goes with the program', mark: '–', meaning: 'A technical step that disappears with the program. Not compared with the standard.' },
  unknown: { label: 'Unknown', mark: '…', meaning: 'A call or target the engine cannot read.' },
});

/** Who may set what (§4.2): the engine proposes, the account confirms. */
export const ACCOUNT_SETTABLE: Readonly<Record<FitDisposition, boolean>> = Object.freeze({
  'given-up': true,
  covered: true,
  configuration: true,
  'gap-key-user': true,
  'gap-organisational': true,
  'gap-open': true,
  // A technical step is never turned into a business statement, and an opaque call is not resolved by a word.
  'goes-with-program': false,
  unknown: false,
});

export type FitRefKind = 'fiori-app' | 'scope-item' | 'api' | 'cds-view' | 'key-user-tool';
export type FitRefCheck = 'verified' | 'mismatch' | 'catalog' | 'unverified';

export interface FitStandardRef {
  kind: FitRefKind;
  id: string;
  /** SAP's title where SAP's own data in the repository names one; `null` otherwise — never filled in. */
  title: string | null;
  check: FitRefCheck;
  /** Where it came from: the catalog, a key-user candidate, a model proposal, the account. */
  source: string;
}

export type FitProvenance = 'reconstructed' | 'model-proposal' | 'confirmed';
export type FitAnchorBasis = 'code' | 'unanchored';

export interface FitEntry {
  elementId: string;
  /** The element's own token ("CALL FUNCTION …") — code, kept for the IT reader. */
  label: string;
  /** A plain name for the business reader, when the wording reader has one; `null` otherwise. */
  plainLabel: string | null;
  kind: string;
  /** COPIED from the as-is element, never produced. */
  anchor: { lineStart: number; lineEnd: number } | null;
  anchorBasis: FitAnchorBasis;
  comparability: 'business-comparable' | 'technical' | 'structural' | 'unknown';
  disposition: FitDisposition;
  standardRef: FitStandardRef | null;
  evidenceLevel: EvidenceLevelValue;
  provenance: FitProvenance;
  /** Why the engine proposed this disposition, in one sentence with its lines. */
  why: string;
  /** The gate class whose deviation this element is part of, when it is. */
  gateClass: FitGateClass | null;
  note: string | null;
}

export interface FitDesignCounts {
  elements: number;
  givenUp: number;
  covered: number;
  configuration: number;
  gapKeyUser: number;
  gapOrganisational: number;
  gapOpen: number;
  goesWithProgram: number;
  unknown: number;
}

export interface FitToStandardDesign {
  formatVersion: typeof FIT_DESIGN_FORMAT_VERSION;
  edition: 'public' | 'private';
  /** The classes the gate offered on — empty for a design made against the gate. */
  gateClasses: FitGateClass[];
  /** Set when the design was made although the gate did not offer (owner decision 3). */
  againstGate: { sentence: string; gateReason: string } | null;
  entries: FitEntry[];
  counts: FitDesignCounts;
}

/** The element as the derivation reads it — `SkeletonNode` with its comparability. */
export interface FitDesignElement {
  id: string;
  kind: string;
  label: string;
  anchor: { lineStart: number; lineEnd: number } | null;
  comparability: FitEntry['comparability'];
  /** `mayCarryStandardCandidate` of `element-comparability.ts`: a step, not a decision. */
  mayCarryCandidate: boolean;
  /**
   * For a call site of a routine (`anchor.secondary`, `routine-definition`): the
   * routine's own lines. What the routine does is what the step does — its reads,
   * its hook logic — so it is read for the disposition; the entry's anchor stays the call's.
   */
  routine?: { lineStart: number; lineEnd: number } | null;
}

export interface FitKeyUserPart {
  /** `KU-1`. */
  id: string;
  /** The key-user app ("Custom Logic"). */
  app: string;
  /** The lines the tool takes over. */
  replaced: Array<{ lineStart: number; lineEnd: number }>;
}

export interface FitDesignInput {
  gate: FitToStandardGate;
  /** True when the account asked for the design although the gate did not offer. */
  requestedAgainstGate: boolean;
  edition: 'public' | 'private';
  elements: readonly FitDesignElement[];
  findings: readonly FitGateFinding[];
  objects: readonly FitGateObject[];
  /** The successor SAP's catalog names, by upper-cased object. */
  successors: ReadonlyMap<string, string> | Readonly<Record<string, string>>;
  keyUser?: readonly FitKeyUserPart[];
  customizing?: ReadonlyArray<{ ruleId: string; lineStart: number; lineEnd?: number }>;
  /** Plain names of elements, by id (`plainLabels(...).nodes`). */
  plainLabels?: ReadonlyMap<string, string>;
}

type Range = { lineStart: number; lineEnd: number };

const overlaps = (a: Range, b: Range) => a.lineStart <= b.lineEnd && b.lineStart <= a.lineEnd;
const contains = (r: Range, line: number) => line >= r.lineStart && line <= r.lineEnd;
const rangeOf = (f: FitGateFinding): Range => ({ lineStart: f.lineStart, lineEnd: typeof f.lineEnd === 'number' ? f.lineEnd : f.lineStart });
const lines = (r: Range) => (r.lineEnd > r.lineStart ? `L${r.lineStart}–L${r.lineEnd}` : `L${r.lineStart}`);

const DEVIATION_KINDS = new Set(['enhancement', 'hook-implementation', 'modification']);
/** Class B: the own presentation and filters — a list or screen and the decisions on what it shows. */
const PRESENTATION_KINDS = new Set(['user-task', 'output', 'gateway']);
/** Class C: the orchestration around the standard call — the decisions and rules that drive it. */
const ORCHESTRATION_KINDS = new Set(['gateway', 'loop', 'business-rule-task', 'task']);

function refKindOf(successor: string): FitRefKind {
  return /^[IC]_/i.test(successor) ? 'cds-view' : 'api';
}

function successorOf(map: FitDesignInput['successors'], name: string): string | null {
  if (map instanceof Map) return map.get(name) ?? null;
  return (map as Readonly<Record<string, string>>)[name] ?? null;
}

export function emptyCounts(): FitDesignCounts {
  return { elements: 0, givenUp: 0, covered: 0, configuration: 0, gapKeyUser: 0, gapOrganisational: 0, gapOpen: 0, goesWithProgram: 0, unknown: 0 };
}

export function countEntries(entries: readonly FitEntry[]): FitDesignCounts {
  const c = emptyCounts();
  c.elements = entries.length;
  for (const e of entries) {
    switch (e.disposition) {
      case 'given-up': c.givenUp += 1; break;
      case 'covered': c.covered += 1; break;
      case 'configuration': c.configuration += 1; break;
      case 'gap-key-user': c.gapKeyUser += 1; break;
      case 'gap-organisational': c.gapOrganisational += 1; break;
      case 'gap-open': c.gapOpen += 1; break;
      case 'goes-with-program': c.goesWithProgram += 1; break;
      case 'unknown': c.unknown += 1; break;
    }
  }
  return c;
}

/**
 * The engine's fit-to-standard design (revision 1 of §4.1). `null` when the gate
 * did not offer and nobody asked against it — no design is made silently.
 */
export function buildFitToStandardDesign(input: FitDesignInput): FitToStandardDesign | null {
  const gate = input.gate;
  if (gate.outcome === 'not-determined') return null;
  if (gate.outcome === 'not-offered' && !input.requestedAgainstGate) return null;

  const classes: FitGateClass[] = gate.outcome === 'offered' ? gate.classes : [];
  const reached = input.findings.filter((f) => !f.notReached);
  const deviations = reached.filter((f) => DEVIATION_KINDS.has(f.kind)).map((f) => ({ f, r: rangeOf(f) }));
  const objectsByLine = input.objects.filter((o) => o.line !== null);
  const findingObjects = reached.filter((f) => f.objectName);

  const entries: FitEntry[] = input.elements.map((el) => {
    const base = {
      elementId: el.id,
      label: el.label,
      plainLabel: input.plainLabels?.get(el.id) ?? null,
      kind: el.kind,
      anchor: el.anchor ? { lineStart: el.anchor.lineStart, lineEnd: el.anchor.lineEnd } : null,
      anchorBasis: (el.anchor ? 'code' : 'unanchored') as FitAnchorBasis,
      comparability: el.comparability,
      standardRef: null as FitStandardRef | null,
      evidenceLevel: 'E0' as EvidenceLevelValue,
      provenance: 'reconstructed' as FitProvenance,
      gateClass: null as FitGateClass | null,
      note: null,
    };
    if (el.comparability === 'technical' || el.comparability === 'structural') {
      return { ...base, disposition: 'goes-with-program', why: 'A technical or structural step: it disappears with the program and is not compared with the standard.' };
    }
    if (el.comparability === 'unknown') {
      return { ...base, disposition: 'unknown', why: 'The engine cannot read what this step calls, so it cannot say what happens to it.' };
    }
    const anchor = el.anchor;
    if (!anchor) {
      return { ...base, disposition: 'gap-open', why: 'No line was read for this step, so nothing can be said about it from the code. Open until you decide.' };
    }

    // 3 — the deviation the gate read.
    const routine = el.routine ?? null;
    const inStep = (line: number) => contains(anchor, line) || (routine !== null && contains(routine, line));
    const touches = (r: Range) => overlaps(anchor, r) || (routine !== null && overlaps(routine, r));
    const dev = deviations.find((d) => touches(d.r));
    let gateClass: FitGateClass | null = null;
    let why: string | null = null;
    if (dev && classes.includes('A')) {
      gateClass = 'A';
      why = `Part of the deviation from the standard process at ${lines(dev.r)}.`;
    } else if (classes.includes('B') && PRESENTATION_KINDS.has(el.kind)) {
      gateClass = 'B';
      why = `The program's own presentation or filter of standard data at ${lines(anchor)}.`;
    } else if (classes.includes('C') && ORCHESTRATION_KINDS.has(el.kind)
      && !objectsByLine.some((o) => o.called && inStep(o.line!))) {
      gateClass = 'C';
      why = `The program's own orchestration around the standard call at ${lines(anchor)}.`;
    }
    if (gateClass && why) {
      const ku = (input.keyUser ?? []).find((k) => k.replaced.some((r) => touches(r)));
      if (ku) {
        return {
          ...base,
          gateClass,
          disposition: 'gap-key-user',
          standardRef: { kind: 'key-user-tool', id: ku.id, title: ku.app, check: 'catalog', source: 'Key-user candidate read from the code (3.0.19)' },
          evidenceLevel: 'E0',
          why: `${why} A key-user extension (${ku.app}, ${ku.id}) could keep it — whether it is still needed is yours to say.`,
        };
      }
      return { ...base, gateClass, disposition: 'given-up', why: `${why} Living with the standard means losing this.` };
    }

    // 4 — a value the account marked as customizing.
    const rule = (input.customizing ?? []).find((c) => inStep(c.lineStart));
    if (rule) {
      return { ...base, disposition: 'configuration', why: `${rule.ruleId} is a value you marked as customizing, at ${lines({ lineStart: rule.lineStart, lineEnd: rule.lineEnd ?? rule.lineStart })}.` };
    }

    // 5 — a catalog successor of an object this step uses: a candidate, E1.
    if (el.mayCarryCandidate) {
      const used = findingObjects.find((f) => inStep(f.lineStart) && successorOf(input.successors, f.objectName!.toUpperCase()))
        ?? null;
      const usedObject = used?.objectName?.toUpperCase()
        ?? objectsByLine.find((o) => inStep(o.line!) && successorOf(input.successors, o.name))?.name
        ?? null;
      const successor = usedObject ? successorOf(input.successors, usedObject) : null;
      if (usedObject && successor) {
        return {
          ...base,
          disposition: 'covered',
          standardRef: { kind: refKindOf(successor), id: successor, title: null, check: 'catalog', source: `SAP's catalog names it as the successor of ${usedObject}` },
          evidenceLevel: 'E1',
          why: `SAP's catalog names ${successor} as the successor of ${usedObject}, used at ${lines(anchor)} — a candidate, to verify.`,
        };
      }
    }

    // 6 — the honest default.
    return { ...base, disposition: 'gap-open', why: `A business step at ${lines(anchor)} nobody has resolved yet — open until you decide.` };
  });

  // A deviation the skeleton does not draw (a BAdI method, an exit routine no
  // entry performs) is still what living with the standard gives up: it gets
  // an entry of its own, anchored on the finding's lines — read from the code,
  // never produced.
  if (classes.includes('A')) {
    for (const d of deviations) {
      if (entries.some((e) => e.gateClass === 'A' && e.anchor && overlaps(e.anchor, d.r))) continue;
      const ku = (input.keyUser ?? []).find((k) => k.replaced.some((r) => overlaps(d.r, r)));
      const name = d.f.objectName ?? null;
      const what = d.f.kind === 'modification' ? 'Modification' : d.f.kind === 'enhancement' ? 'Enhancement' : 'BAdI or exit implementation';
      const why = `The deviation from the standard process at ${lines(d.r)}.`;
      entries.push({
        elementId: `deviation-L${d.r.lineStart}`,
        label: name ?? d.f.kind,
        plainLabel: name ? `${what} ${name}` : what,
        kind: 'deviation',
        anchor: { lineStart: d.r.lineStart, lineEnd: d.r.lineEnd },
        anchorBasis: 'code',
        comparability: 'business-comparable',
        disposition: ku ? 'gap-key-user' : 'given-up',
        standardRef: ku ? { kind: 'key-user-tool', id: ku.id, title: ku.app, check: 'catalog', source: 'Key-user candidate read from the code (3.0.19)' } : null,
        evidenceLevel: 'E0',
        provenance: 'reconstructed',
        why: ku
          ? `${why} A key-user extension (${ku.app}, ${ku.id}) could keep it — whether it is still needed is yours to say.`
          : `${why} Living with the standard means losing this.`,
        gateClass: 'A',
        note: null,
      });
    }
  }

  return {
    formatVersion: FIT_DESIGN_FORMAT_VERSION,
    edition: input.edition,
    gateClasses: classes,
    againstGate: gate.outcome === 'not-offered' ? { sentence: AGAINST_GATE_SENTENCE, gateReason: gate.reason } : null,
    entries,
    counts: countEntries(entries),
  };
}

/** The three lists under the map (§4.5), in the business reader's order. */
export function fitDesignLists(design: Pick<FitToStandardDesign, 'entries'>): {
  givenUp: FitEntry[];
  standardDoes: FitEntry[];
  gaps: FitEntry[];
} {
  const business = design.entries;
  return {
    givenUp: business.filter((e) => e.disposition === 'given-up'),
    standardDoes: business.filter((e) => e.disposition === 'covered' || e.disposition === 'configuration'),
    gaps: business.filter((e) => e.disposition === 'gap-key-user' || e.disposition === 'gap-organisational' || e.disposition === 'gap-open'),
  };
}

/** "3 given up, 2 gaps (1 key user, 0 organisational, 1 open)" — the Management line of §5.6. */
export function fitDesignSummary(counts: FitDesignCounts): string {
  const gaps = counts.gapKeyUser + counts.gapOrganisational + counts.gapOpen;
  return `${counts.givenUp} given up, ${gaps} gap${gaps === 1 ? '' : 's'} (${counts.gapKeyUser} key user, ${counts.gapOrganisational} organisational, ${counts.gapOpen} open)`;
}
