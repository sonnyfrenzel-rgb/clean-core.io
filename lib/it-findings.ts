import { coverage, type Coverage, type CoverageExclusion } from './management-answers';
import { ALL_GRADES, type CloudReadinessGrade } from './abap/abcd-classification';
import { LEVEL_OVERLAY_NOTE } from './process-overlays';
import type { ProvenanceValue } from './provenance';

/**
 * The IT view's answers — roadmap step 8.1.
 *
 * *„IT-Sicht: Findings mit beiden Katalogsichten, Level-Verteilung, Spur
 * Anforderung → Anker → Finding → Zielentwurf."*
 *
 * This is the counterpart of `lib/management-answers.ts`, and it is deliberately
 * built out of the same parts: `Coverage` is imported from there rather than
 * written again, the figures carry `value | null` with an `absentReason`, and
 * *Not determined* is a statement with a reason and never a zero. One product,
 * one vocabulary — an IT view that invented a second way of saying "we did not
 * measure this" would leave a reader having to learn two.
 *
 * Four things decide the shape of this module.
 *
 * **1. The chain belongs to a chosen finding (ADR-029).** *„Die Kette gehört zu
 * einem gewählten Befund. Die Tabelle markiert die gewählte Zeile, die Kette
 * steht darüber … und die Abdeckung steht dabei."* So a chain is built **per
 * finding**, and the view carries `chainCoverage` — how many of all findings the
 * chain is complete for, and where the others stop. A chain that is visibly
 * about CC-017 without saying for how many findings it holds is precisely the
 * defect the ADR was written against.
 *
 * **2. A link is determined or it is not — nothing in between.** The four links
 * are *Requirement → Anchor → Finding → Target draft*. Measured on the product's
 * own 1.000-line example (`ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap`,
 * 23.09.2026): 42 findings, 42 with an anchor, 42 with a target option,
 * **0** whose line is covered by an anchor of a derived business rule. The
 * business-rule engine anchors a rule to its *condition* — 116 anchors on that
 * source, 6 of them longer than one line — and a finding sits on a `SELECT`, a
 * `CALL FUNCTION`, a `COMMIT WORK`. So the requirement link is honestly `null`
 * for every finding today.
 *
 * It would have been easy to make the number look better. 17 of those 42
 * findings stand in a routine in which the engine did derive a rule, and
 * printing "BR-011" there would have produced a chain that is complete for 17 of
 * 42. It would also have been a claim the engine cannot make: a rule in the same
 * `FORM` is a neighbourhood, not a cause. That count is therefore reported as
 * what it is — a place to look next, named in the link's own reason and counted
 * separately — and it never becomes a requirement.
 *
 * **3. The level is not answered per operating model, and the view says so.**
 * `lib/abap/catalog-service.ts` knows neither `deployment` nor `edition`
 * (measured 23.09.2026: zero occurrences), and the one snapshot this product
 * ships is `abap-atc-cr-cv-s4hc` — the released-object list of the **Public**
 * Edition. Roadmap 6.3 already put that sentence on the process-map overlay, and
 * this view prints the identical constant (`LEVEL_OVERLAY_NOTE`) rather than a
 * second wording of the same caveat.
 *
 * **4. The level never becomes content.** Nothing here is stored, hashed or
 * signed. `CLAUDE.md`: *"The grade is never part of the signed audit pack."*
 * This module is pure — no React, no Firestore, no `fetch` — and the route that
 * feeds it reads; `tests/it-findings.spec.ts` holds both halves.
 */

/* ------------------------------------------------------------------- rows */

/**
 * One finding as the server answered it — `GET /api/projects/{id}/findings`.
 *
 * Everything on it was computed by the deterministic engine over the project's
 * own source. It is the *input* of this module, so a spec can drive every state
 * below from fixtures without a browser, a catalog or an emulator.
 */
export interface ItFindingRow {
  /** `CC-017` — the engine's own id for the finding. */
  id: string;
  kind: string;
  title: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low' | 'Info';
  /** The SAP or customer object the finding is about, upper-cased. `null` when it is about a statement. */
  objectName: string | null;
  objectType: string | null;
  lineStart: number;
  lineEnd: number | null;
  /** The `FORM`/method the line sits in, upper-cased; `null` at program level. */
  routine: string | null;
  /** The clean core level, or `null` when the finding names no object to ask about. */
  level: CloudReadinessGrade | null;
  /**
   * The two SAP files, kept apart — `GradedObject.cloudView` / `classicView`,
   * already turned into the labels of `CLOUD_VIEW_META` / `CLASSIC_VIEW_META`.
   * `null` together with `level`.
   */
  releaseView: string | null;
  classificationView: string | null;
  /** The successor SAP publishes, where one is published. */
  successor: string | null;
  /** The extensibility targets the router named for this finding. Possibly empty. */
  targetOptions: string[];
  /** `BR-nnn` of every derived rule whose own anchor covers `lineStart`. */
  rulesCoveringLine: string[];
  /** `BR-nnn` of every derived rule in the same routine. A neighbourhood, never a cause. */
  rulesInRoutine: string[];
}

/** What the route answers besides the rows. */
export interface ItFindingsSource {
  rows: ItFindingRow[];
  /** SHA-256 of the source the engine read, so the view can be tied to a run. */
  sourceSha256: string;
  /** How many business rules the engine derived from that source at all. */
  rulesDerived: number;
}

/* ------------------------------------------------------------------ chain */

export const CHAIN_LINKS = ['requirement', 'anchor', 'finding', 'target'] as const;
export type ChainLinkId = (typeof CHAIN_LINKS)[number];

export const CHAIN_LABELS: Record<ChainLinkId, string> = {
  requirement: 'Requirement',
  anchor: 'Anchor',
  finding: 'Finding',
  target: 'Target draft',
};

export interface ChainLink {
  id: ChainLinkId;
  label: string;
  /** The link, as a reader reads it. `null` is *Not determined*, with `reason` set. */
  value: string | null;
  /** Set exactly when `value` is null — why this link could not be followed. */
  reason?: string;
  /** What the link says, beyond its value. Never empty. */
  detail: string;
  /** `L390`, `L380–L397`, or `null` where the link has no line of its own. */
  anchor: string | null;
  provenance: ProvenanceValue;
}

export interface ItChain {
  findingId: string;
  links: ChainLink[];
  /** Every one of the four links has a value. */
  complete: boolean;
  /** The first link with no value, or `null` when the chain is complete. */
  endsAt: ChainLinkId | null;
}

/**
 * Why a target draft is not an architecture contract, said where it is shown.
 *
 * Roadmap 8.2 records the contract — target context, runtime, persistence, APIs,
 * *and why the alternatives were rejected*. Until it exists, what is on record is
 * the route the deterministic router named and the successor SAP publishes.
 * Calling that "the target" without the distinction would be exactly the "the
 * standard covers it" claim `DESIGN.md` §5.3 forbids one layer up.
 */
export const TARGET_DRAFT_NOTE =
  'A target draft is what the engine derived — the extensibility route it named, and the successor SAP ' +
  'publishes where there is one. It is not an architecture contract: the contract, with the alternatives ' +
  'it rejected, is recorded from roadmap 8.2 onward, and nothing here stands in for it.';

function anchorOf(row: ItFindingRow): string {
  return row.lineEnd && row.lineEnd > row.lineStart
    ? `L${row.lineStart}–L${row.lineEnd}`
    : `L${row.lineStart}`;
}

const listOf = (items: readonly string[]): string => {
  if (items.length <= 2) return items.join(' and ');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
};

/**
 * The chain of one finding — *Requirement → Anchor → Finding → Target draft*.
 *
 * Each link is built from what is on record for this one finding, and a link
 * that is not on record is `null` with the reason in its own words. The chain is
 * never shortened to its determined part: a reader has to be able to see where
 * it stops, which is the whole of ADR-029's second half.
 */
export function chainOf(row: ItFindingRow): ItChain {
  const anchor = anchorOf(row);

  const requirement: ChainLink = row.rulesCoveringLine.length > 0
    ? {
        id: 'requirement',
        label: CHAIN_LABELS.requirement,
        value: listOf(row.rulesCoveringLine),
        detail:
          `The engine derived ${row.rulesCoveringLine.length === 1 ? 'this rule' : 'these rules'} ` +
          `from the code at ${anchor}, so the requirement and the finding stand on the same lines.`,
        anchor,
        provenance: 'reconstructed',
      }
    : {
        id: 'requirement',
        label: CHAIN_LABELS.requirement,
        value: null,
        reason:
          row.rulesInRoutine.length > 0
            ? `No derived business rule covers ${anchor}. ` +
              `${listOf(row.rulesInRoutine)} ${row.rulesInRoutine.length === 1 ? 'stands' : 'stand'} in the same routine ` +
              `${row.routine ? `(${row.routine})` : '(the program level)'} — the engine ties a rule to its condition, ` +
              'not to this statement, so that is a place to look and not the requirement.'
            : `No derived business rule covers ${anchor}, and none stands in the same routine ` +
              `${row.routine ? `(${row.routine})` : '(the program level)'} either.`,
        detail:
          'A requirement is a business rule the engine derived from a condition in the code. ' +
          'Confirming a rule against a finding is not something this release records.',
        anchor,
        provenance: 'not-determined',
      };

  const anchorLink: ChainLink = {
    id: 'anchor',
    label: CHAIN_LABELS.anchor,
    value: anchor,
    detail: row.routine
      ? `In ${row.routine}, of the staged source this view read.`
      : 'At program level, of the staged source this view read.',
    anchor,
    provenance: 'reconstructed',
  };

  const findingLink: ChainLink = {
    id: 'finding',
    label: CHAIN_LABELS.finding,
    value: `${row.id} · ${row.severity}`,
    detail: row.title,
    anchor,
    provenance: 'reconstructed',
  };

  const targetParts = [
    row.successor ? `successor ${row.successor}` : null,
    row.targetOptions.length > 0 ? listOf(row.targetOptions) : null,
  ].filter((part): part is string => part !== null);

  const target: ChainLink = targetParts.length > 0
    ? {
        id: 'target',
        label: CHAIN_LABELS.target,
        value: targetParts.join(' · '),
        detail: TARGET_DRAFT_NOTE,
        anchor: null,
        // The successor is SAP's published data and the route is derived from
        // the code. Where the successor carries the answer the chip is
        // *Imported*; a route alone is *Reconstructed*. Neither is a proposal by
        // a model: nothing in this chain calls one.
        provenance: row.successor ? 'imported' : 'reconstructed',
      }
    : {
        id: 'target',
        label: CHAIN_LABELS.target,
        value: null,
        reason:
          'SAP publishes no successor for this object and the router named no extensibility route, ' +
          'so there is nothing to draft a target from.',
        detail: TARGET_DRAFT_NOTE,
        anchor: null,
        provenance: 'not-determined',
      };

  const links = [requirement, anchorLink, findingLink, target];
  const open = links.find((link) => link.value === null) ?? null;
  return { findingId: row.id, links, complete: open === null, endsAt: open?.id ?? null };
}

/* ------------------------------------------------------------------ figures */

export interface ItFigure {
  key: string;
  label: string;
  /** Already formatted, or `null` when nothing measured it. Never a zero for "we did not look". */
  value: string | null;
  /** Set exactly when `value` is null. */
  absentReason?: string;
  provenance: ProvenanceValue;
  coverage: Coverage;
}

/* ------------------------------------------------- the level distribution */

export interface LevelSlice {
  grade: CloudReadinessGrade;
  count: number;
}

export interface LevelDistribution {
  /** Every one of A, B, C, D and Unknown — including the ones that are zero here. */
  slices: LevelSlice[];
  /** Findings that carry a level at all. */
  graded: number;
  coverage: Coverage;
  /** The one snapshot that answered, word for word as roadmap 6.3 says it. */
  note: string;
  /** What the reader is told instead of, or beside, the bar. */
  sentence: string;
}

const FINDING_BASIS = 'findings in this run';

/**
 * The A–D distribution over the findings of this run.
 *
 * **Unknown is a slice, not a remainder.** `ALL_GRADES` carries it, the bar
 * draws it, and a finding the catalog cannot place is counted there rather than
 * quietly left out of the denominator. A finding that names no object at all is
 * a different statement again — the catalog was never asked — and it is an
 * exclusion with its own sentence, never folded in with the Unknowns.
 */
export function levelDistribution(rows: readonly ItFindingRow[]): LevelDistribution {
  const counts = new Map<CloudReadinessGrade, number>(ALL_GRADES.map((g) => [g, 0]));
  let graded = 0;
  for (const row of rows) {
    if (row.level === null) continue;
    counts.set(row.level, (counts.get(row.level) ?? 0) + 1);
    graded += 1;
  }

  const withoutObject = rows.filter((row) => row.objectName === null).length;
  const unknown = counts.get('Unknown') ?? 0;
  const excluded: CoverageExclusion[] = [
    { count: withoutObject, why: 'about a statement, naming no object the catalog can be asked about' },
  ];

  const sentence =
    rows.length === 0
      ? 'No findings in this run, so there is no distribution to draw.'
      : graded === 0
        ? `None of the ${rows.length} findings names an object the catalog can be asked about, ` +
          'so no level is shown rather than a bar of zeros.'
        : `${graded} of ${rows.length} findings carry a level` +
          (unknown > 0
            ? `; ${unknown} of them are Unknown — the catalog places them nowhere, which is its own answer and not a D.`
            : '.');

  return {
    slices: ALL_GRADES.map((grade) => ({ grade, count: counts.get(grade) ?? 0 })),
    graded,
    coverage: coverage(graded, rows.length, FINDING_BASIS, excluded),
    note: LEVEL_OVERLAY_NOTE,
    sentence,
  };
}

/* --------------------------------------------------------------- the view */

export interface ItView {
  /** The view's own question (`lib/workspace-model.ts`), repeated so this model is self-contained. */
  question: string;
  /** One sentence that answers it for this project — ADR-029, *first the answer, then the figure*. */
  headline: string;
  rows: ItFindingRow[];
  /** The chain of the chosen finding, or `null` when there is no finding to choose. */
  chain: ItChain | null;
  /** The sentence over the chain — which finding it is for, and how far it holds. */
  chainTitle: string;
  /** How many findings the chain is complete for, and where the rest stop. */
  chainCoverage: Coverage;
  /** The count per link the chains stop at — never a remainder, one entry per link. */
  chainEnds: Array<{ link: ChainLinkId; label: string; count: number }>;
  /** The neighbourhood count of rule 2 in the module doc. Reported, never counted as a requirement. */
  requirementNote: string;
  distribution: LevelDistribution;
  figures: ItFigure[];
  /** Set when the findings could not be read at all — a different statement from "none". */
  unreadable: boolean;
}

export const IT_QUESTION = 'What exactly, where to, and is it right?';

/**
 * The whole IT view of one project.
 *
 * `source` is `null` when the findings could not be read — refused, offline, or
 * no source staged. That is reported as *the findings could not be read*, which
 * is not the same statement as "there are none", and the difference decides
 * whether a reader trusts an empty table.
 *
 * `selectedId` is the reader's chosen finding. An id that is not among the rows
 * falls back to the first row rather than to nothing: a chain area that empties
 * itself because a filter moved underneath it reads as a fault.
 */
export function itFindingsView(
  source: ItFindingsSource | null,
  selectedId: string | null = null,
): ItView {
  const rows = source?.rows ?? [];
  const unreadable = source === null;

  const chains = rows.map((row) => chainOf(row));
  const complete = chains.filter((chain) => chain.complete).length;

  const ends = CHAIN_LINKS.map((link) => ({
    link,
    label: CHAIN_LABELS[link],
    count: chains.filter((chain) => chain.endsAt === link).length,
  }));

  const chainCoverage = coverage(
    unreadable ? null : complete,
    unreadable ? null : rows.length,
    unreadable ? 'findings — they could not be read' : `${FINDING_BASIS}, chain complete`,
    ends
      .filter((end) => end.count > 0)
      .map((end) => ({ count: end.count, why: `end at ${end.label}` })),
  );

  const selected = rows.find((row) => row.id === selectedId) ?? rows[0] ?? null;
  const chain = selected ? chains.find((c) => c.findingId === selected.id) ?? null : null;

  const chainTitle = selected
    ? `Chain for ${selected.id} — select a finding to follow its chain`
    : unreadable
      ? 'No chain: the findings of this project could not be read.'
      : 'No chain: the engine reported no finding in the staged source, so there is nothing to follow.';

  const neighbourhood = rows.filter(
    (row) => row.rulesCoveringLine.length === 0 && row.rulesInRoutine.length > 0,
  ).length;
  const requirementNote =
    rows.length === 0
      ? 'No findings, so no requirement was looked for.'
      : `${neighbourhood} of ${rows.length} findings have a derived business rule in the same routine but none ` +
        'on their own lines. A rule in the same routine is a neighbourhood, not a cause, so it is named as a ' +
        'place to look and never counted as the requirement.';

  const distribution = levelDistribution(rows);

  const figures: ItFigure[] = [
    {
      key: 'findings',
      label: 'findings the engine reported',
      value: unreadable ? null : String(rows.length),
      ...(unreadable ? { absentReason: 'the findings of this project could not be read' } : {}),
      provenance: unreadable ? 'not-determined' : 'reconstructed',
      coverage: unreadable
        ? coverage(null, null, 'findings — they could not be read')
        : coverage(rows.length, rows.length, FINDING_BASIS),
    },
    {
      key: 'chain-complete',
      label: 'findings the chain is complete for',
      value: unreadable || rows.length === 0 ? null : String(complete),
      ...(unreadable
        ? { absentReason: 'the findings of this project could not be read' }
        : rows.length === 0
          ? { absentReason: 'the engine reported no finding in the staged source' }
          : {}),
      provenance: complete > 0 && !unreadable ? 'reconstructed' : 'not-determined',
      coverage: chainCoverage,
    },
    {
      key: 'level',
      label: 'findings that carry a clean core level',
      value: unreadable || distribution.graded === 0 ? null : String(distribution.graded),
      ...(unreadable
        ? { absentReason: 'the findings of this project could not be read' }
        : distribution.graded === 0
          ? { absentReason: distribution.sentence }
          : {}),
      provenance: distribution.graded > 0 ? 'imported' : 'not-determined',
      coverage: distribution.coverage,
    },
  ];

  const headline = unreadable
    ? 'The findings of this project could not be read, so nothing here is answered — an empty table would say there were none.'
    : rows.length === 0
      ? 'The engine reported no finding in the source staged on this project, so there is nothing to trace yet.'
      : `${rows.length} findings, the chain is complete for ${complete} of them, and ${distribution.graded} carry a clean core level.`;

  return {
    question: IT_QUESTION,
    headline,
    rows,
    chain,
    chainTitle,
    chainCoverage,
    chainEnds: ends,
    requirementNote,
    distribution,
    figures,
    unreadable,
  };
}
