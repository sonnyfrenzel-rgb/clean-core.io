/**
 * The decision as a manager reads it first — the headline, the four pillars it
 * rests on, and the open points in plain words.
 *
 * Owner, 03.10.2026: "Management: the decision must be shown, placed
 * prominently, and at the same time be graphically appealing." The record's own
 * sentences (`lib/project-decision-build.ts`) are exact and written for an
 * auditor — one of them names the catalog service's source file and the edition
 * its lookup does not take. A manager reads the decision through the lines
 * below; the record's sentences stay one action deeper, in the card's
 * "Technical basis" fold, with the product's source file paths taken out.
 *
 * Nothing here changes what is stored, fingerprinted or signed: every line is
 * derived from the record when it is shown. Pure and client-safe — it imports
 * no builder, no contract derivation and no engine, as `lib/decision-card.ts`
 * does not.
 */

import {
  DECISION_BINDING_LABELS,
  decisionCoverage,
  noContractBasis,
  type ConditionSource,
  type ConditionStatus,
  type DecisionCondition,
  type DecisionGapCode,
  type ProjectDecision,
} from './project-decision';
import type { ProvenanceValue } from './provenance';
import { contractParts } from './decision-card';
import { sapNamesForDisplay } from './sap-naming';
import { DECISION_OPTION_LABELS, optionOfArchitecture } from './decision-options';

/**
 * Where a point is resolved: a stage of the project, or another view of the
 * workspace — and, for a view, the exact place on it (`hash`, an element id the
 * view renders) and what the link says it does there (`action`), so a reader is
 * taken to the thing to do rather than to the top of a view (ADR-085).
 */
export type DecisionPlace = (
  | { kind: 'stage'; path: 'analyze' | 'design' | 'tco' }
  | { kind: 'view'; view: 'business' | 'it' | 'management' }
) & {
  /** An element id on the target view or stage (`not-determined`, `economics-compare`), without `#`. */
  hash?: string;
  /** What the link says: the action at that place ("Decide on 12 rules"). */
  action?: string;
};

/**
 * The places on other views the open conditions link to (ADR-085). Each is an
 * element id the view renders: `lib/it-sections.ts` owns the IT ones,
 * `components/workspace/BusinessRulesEditor.tsx` and `lib/business-layers.ts`
 * the Business ones. Kept as strings here because this module is pure and
 * imports no component; `tests/decision-card.spec.ts` holds them together.
 */
export const DECISION_PLACE_IDS = Object.freeze({
  itTargetProfile: 'it-target-profile',
  itFindings: 'it-findings',
  itOpenQuestions: 'not-determined',
  businessRules: 'business-rules',
  businessMap: 'process-map',
  businessStandard: 'standard',
  /** The options compared in Economics (`app/(app)/project/[projectId]/tco/page.tsx`). */
  economicsCompare: 'economics-compare',
});

export type PillarKey = 'need' | 'option' | 'cost' | 'contract';

export interface DecisionPillar {
  key: PillarKey;
  /** "Need", "Option", "Costs", "Architecture contract". */
  title: string;
  provenance: ProvenanceValue;
  /** A contract that is a draft with open limits: shown as the object status *draft* beside its provenance. */
  draft: boolean;
  /** One plain line. */
  line: string;
  /** Where it is filled or changed. */
  place: DecisionPlace;
  /** Whether something determined stands behind this pillar. */
  inPlace: boolean;
}

export interface DecisionPoint {
  id: string;
  /** Which part of the record raised it — the foundation it is listed under follows from it. */
  source: ConditionSource;
  /** Met or waived. */
  done: boolean;
  status: ConditionStatus;
  /** One plain line, never the record's full sentence. */
  line: string;
  place: DecisionPlace | null;
  /**
   * `act` — something a reader of this product can do. `limit` — it stays open
   * whatever anyone does here (SAP publishes no edition catalog or no
   * successor, the router does not assess standard fit); shown with the
   * decision, never hidden, but not counted as a task (ADR-085).
   */
  kind: 'act' | 'limit';
  /** The technical detail behind the line — one entry per kind of construct, with its first line. */
  details: string[];
}

export interface DecisionTechnicalEntry {
  key: string;
  label: string;
  text: string;
}

/**
 * One foundation of the decision with the open conditions that belong to it —
 * the four pillars and the conditions are the same four subjects, so they are
 * said once, in one list (owner decision 10.10.2026, ADR-087). Presentation
 * only: the record, its fingerprint and its conditions are unchanged.
 */
export interface DecisionFoundation {
  pillar: DecisionPillar;
  /**
   * The conditions under this foundation a reader can act on, or that are met
   * — never one whose fact the foundation's own line already says (the need's
   * open rules and decision points are the Need row's line and its action).
   */
  points: DecisionPoint[];
  /** What stays open whatever is done here (ADR-085) — under the contract, said as one folded line. */
  limits: DecisionPoint[];
}

export interface DecisionManagerView {
  /** "Rebuild as In-App ABAP Cloud (RAP)". */
  headline: string;
  /** One sentence of why. */
  why: string;
  pillars: DecisionPillar[];
  /** How many of the four foundations are in place — the heading of the merged list. */
  inPlace: number;
  /** The four foundations, each with its conditions nested under it. */
  foundations: DecisionFoundation[];
  /** Conditions the account stated that name none of the four — shown after them, never dropped. */
  other: DecisionPoint[];
  points: DecisionPoint[];
  openPoints: number;
  /** Of those, the ones a reader can act on, and the ones that stay open whatever is done here (ADR-085). */
  todo: number;
  limits: number;
  /** "Can be confirmed — …" / "Cannot be confirmed yet: …" / '' when nothing qualifies it. */
  readiness: string;
  /** The record's own sentences, for IT readers, without source file paths. */
  technical: DecisionTechnicalEntry[];
}

/**
 * A sentence with the product's own source file paths taken out — the record
 * may name a file of this code base; a reader of the card never needs to. A
 * parenthesis that cites a file goes as a whole; any other file path becomes
 * "the product"; the remaining code marks are dropped.
 */
export function withoutSourcePaths(text: string): string {
  return text
    .replace(/\s*\([^()]*`[^`]*\.(?:tsx?|mjs|js)`[^()]*\)/g, '')
    .replace(/`[^`]*\.(?:tsx?|mjs|js)`/g, 'the product')
    .replace(/\b(?:lib|app|components|scripts)\/[\w./[\]-]+\.(?:tsx?|mjs|js)\b/g, 'the product')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

const OPTION_VERB: Readonly<Record<string, string>> = Object.freeze({
  rap: 'Rebuild as',
  cap: 'Rebuild as',
  integration: 'Rebuild on',
  event: 'Rebuild on',
});

/** The architecture code of an option binding (`rap · In-App ABAP Cloud (RAP)` → `rap`), or `null`. */
export function optionCodeOf(optionRevision: string | null): string | null {
  if (optionRevision === null) return null;
  const at = optionRevision.indexOf(' · ');
  return at > 0 ? optionRevision.slice(0, at) : optionRevision;
}

/** The option binding (`rap · In-App ABAP Cloud (RAP)`) as the decision's headline. */
export function decisionHeadline(optionRevision: string | null): string {
  if (optionRevision === null) return 'No option chosen yet';
  const at = optionRevision.indexOf(' · ');
  const id = at > 0 ? optionRevision.slice(0, at) : optionRevision;
  const label = sapNamesForDisplay(at > 0 ? optionRevision.slice(at + 3) : optionRevision);
  if (id === 'retire') return 'Retire this object';
  // ADR-079: the two options chosen in Management say their name and nothing else.
  if (id === 'keep') return DECISION_OPTION_LABELS.keep;
  if (id === 'standard') return DECISION_OPTION_LABELS.standard;
  const verb = OPTION_VERB[id];
  return verb ? `${verb} ${label}` : label;
}

function firstSentence(text: string): string {
  const m = /^(.+?[.!?])(\s|$)/.exec(text.trim());
  return m ? m[1] : text.trim();
}

/**
 * The `need-open` condition's count, as the record carries it: since ADR-085
 * `undecided:<n>;rules:<r>;decisions:<d>` — the rules and the decision points
 * without a business answer. A record from before carries `undecided:<n>` over
 * every element of the map; that count is not shown, because it counted
 * starts, ends and error boundaries nobody is asked about.
 */
export function needOpenOf(evidence: string | null | undefined): { rules: number; decisions: number } | 'legacy' | null {
  if (!evidence) return null;
  const m = /^undecided:(\d+)(?:;rules:(\d+);decisions:(\d+))?$/.exec(evidence);
  if (!m) return null;
  return m[2] === undefined ? 'legacy' : { rules: Number(m[2]), decisions: Number(m[3]) };
}

function needOpenOfDecision(decision: ProjectDecision): ReturnType<typeof needOpenOf> {
  return needOpenOf(decision.conditions.find((x) => x.source === 'need-open')?.evidence);
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "12 rules and 13 decision points" — the parts that are open, never a zero. */
function needOpenWords(open: { rules: number; decisions: number }): string {
  return [
    open.rules > 0 ? plural(open.rules, 'rule', 'rules') : null,
    open.decisions > 0 ? plural(open.decisions, 'decision point', 'decision points') : null,
  ]
    .filter((p): p is string => p !== null)
    .join(' and ');
}

/** One rule or one decision point open in all — the verb is singular. */
const one = (open: ReturnType<typeof needOpenOf>): boolean =>
  !!open && open !== 'legacy' && open.rules + open.decisions === 1;

/** Where the need is answered: the rules first — one batch — then the walk through the map. */
function needPlace(open: ReturnType<typeof needOpenOf>): DecisionPlace {
  if (open && open !== 'legacy' && open.rules > 0) {
    return {
      kind: 'view',
      view: 'business',
      hash: DECISION_PLACE_IDS.businessRules,
      action: `Decide on ${plural(open.rules, 'rule', 'rules')}`,
    };
  }
  return { kind: 'view', view: 'business', hash: DECISION_PLACE_IDS.businessMap, action: 'Walk through the process' };
}

/**
 * The constructs of a `coverage-incomplete` limit
 * (`3 × local function-module call (from line 165), 2 × …`): how many places
 * in all, and one line per kind for the detail. `null` when the subject is not
 * in that shape — the line then says only that part was not assessed.
 */
export function unassessedParts(subject: string | null): { places: number; details: string[] } | null {
  if (!subject) return null;
  const parts = [...subject.matchAll(/(\d+) × ([^,(]+?)\s*\(from line (\d+)\)/g)];
  if (parts.length === 0) return null;
  return {
    places: parts.reduce((sum, p) => sum + Number(p[1]), 0),
    details: parts.map((p) => `${p[1]} × ${p[2]} — first at line ${p[3]}`),
  };
}

/**
 * What the Economics stage has stored, when the decision binds no cost
 * revision of it: how many options its figures price (never an amount).
 *
 * The decision never binds them: `lib/decision-draft.ts` derives every draft
 * with `assumptions: null` — binding a revision of the stored comparison is not
 * built (ADR-085, amendment of 10.10.2026). So figures on record are not an
 * older decision's blind spot, and recording the decision again would not take
 * them in; the pillar says what they are (a simulation in Economics) and that
 * the decision does not record them.
 */
export type StoredCostScenario = { priced: number; total: number };

function pillarOf(decision: ProjectDecision, key: PillarKey, stored: StoredCostScenario | null = null): DecisionPillar {
  const b = decision.bindings.find((x) => x.key === key) ?? null;
  const revision = b?.revision ?? null;
  const provenance: ProvenanceValue = b && revision !== null ? b.provenance : 'not-determined';
  const base = { key, provenance, draft: false, inPlace: revision !== null && provenance !== 'not-determined' };

  if (key === 'need') {
    const open = needOpenOfDecision(decision);
    const words = open && open !== 'legacy' ? needOpenWords(open) : '';
    const n = revision ? /^need\/r(\d+)$/.exec(revision)?.[1] : null;
    return {
      ...base,
      title: 'Need',
      line:
        revision !== null
          ? `Revision ${n ?? revision} of the need, confirmed by your account.`
          : words
            ? `Not confirmed yet: ${words} ${one(open) ? 'has' : 'have'} no business answer.`
            : 'Not confirmed yet: the process has not been confirmed for this source.',
      place: { kind: 'view', view: 'business', hash: DECISION_PLACE_IDS.businessMap },
    };
  }

  if (key === 'option') {
    // ADR-083 (a): all four options are the program decision of the
    // Management view, chosen by the signed-in account. A Rebuild also has its
    // target architecture signed off in Design — said as that separate fact,
    // and only where the record carries it (the option binding of a Rebuild
    // exists only once that sign-off does).
    const rebuild = revision !== null && optionOfArchitecture(optionCodeOf(revision)) === 'rebuild';
    return {
      ...base,
      title: 'Option',
      line:
        revision === null
          ? 'No option is chosen yet — choose one of the four above.'
          : rebuild
            ? `${decisionHeadline(revision)}, as chosen by your account. Its target architecture is signed off in Design.`
            : `${decisionHeadline(revision)}, as chosen by your account.`,
      place: { kind: 'view', view: 'management' },
    };
  }

  if (key === 'cost') {
    // Figures in Economics the decision does not record (ADR-085, amendment of
    // 10.10.2026): the chip says what they are — a simulation — and the line
    // says where they stand. "Not determined" beside "4 of 4 priced" read as a
    // contradiction (owner, 10.10.2026). Never in place: nothing is bound.
    if ((!b || revision === null) && stored && stored.priced > 0) {
      const which =
        stored.priced !== stored.total
          ? `${stored.priced} of ${stored.total} options`
          : stored.total === 1
            ? 'the one option'
            : `all ${stored.total} options`;
      return {
        ...base,
        provenance: 'simulation',
        inPlace: false,
        title: 'Costs',
        line: `Economics prices ${which} on your own assumptions; the decision does not record costs.`,
        place: { kind: 'stage', path: 'tco', hash: DECISION_PLACE_IDS.economicsCompare, action: 'Compare the options in Economics' },
      };
    }
    const line =
      !b || revision === null
        ? !b || /no cost assumptions were stated/i.test(b.notDeterminedReason ?? '')
          ? 'No cost assumptions entered yet, so no option is priced.'
          : 'The cost assumptions are incomplete, so no amount is shown.'
        : provenance === 'simulation'
          ? 'A simulation on your own assumptions — not a quote.'
          : 'Priced, but no cheapest option is named yet.';
    return { ...base, title: 'Costs', line, place: { kind: 'stage', path: 'tco' } };
  }

  // The architecture contract.
  const title = 'Architecture contract';
  const place: DecisionPlace = { kind: 'stage', path: 'design' };
  if (!b || revision === null) {
    return { ...base, title, line: 'No architecture contract has been derived for this run.', place };
  }
  const none = noContractBasis(revision);
  if (none) {
    return {
      ...base,
      title,
      line: none.current
        ? 'None needed — nothing is built; the decision rests on the sign-off.'
        : 'None needed, but the sign-off it rests on is not current — sign off again.',
      place,
    };
  }
  const c = contractParts(revision);
  const route = c ? c.routeLabel : revision;
  return {
    ...base,
    title,
    draft: c?.state === 'qualified' || b.provenance === 'proposed',
    line:
      c?.state === 'blocked'
        ? `${route} — blocked by a limit.`
        : c?.state === 'qualified'
          ? `${route} — a draft with open limits.`
          : `${route} — complete.`,
    place,
  };
}

/** A condition as one plain line, with the place it is resolved. */
export function decisionPoint(c: DecisionCondition): DecisionPoint {
  const done = c.status === 'met' || c.status === 'waived';
  const base: Pick<DecisionPoint, 'id' | 'source' | 'done' | 'status' | 'kind' | 'details'> = {
    id: c.id,
    source: c.source,
    done,
    status: c.status,
    kind: 'act',
    details: [],
  };
  const it = (hash: string, action: string): DecisionPlace => ({ kind: 'view', view: 'it', hash, action });
  const evidence = c.evidence ?? '';
  const cut = evidence.indexOf(':');
  const code = cut < 0 ? evidence : evidence.slice(0, cut);
  const subject = cut < 0 ? null : evidence.slice(cut + 1) || null;

  if (c.source === 'need-open') {
    const open = needOpenOf(evidence);
    const words = open && open !== 'legacy' ? needOpenWords(open) : '';
    return {
      ...base,
      line: words
        ? `${words} still ${one(open) ? 'needs' : 'need'} a business answer.`
        : 'The process is not confirmed by the business yet.',
      place: needPlace(open),
    };
  }
  if (c.source === 'cost-gap') {
    return { ...base, line: `Costs: ${withoutSourcePaths(firstSentence(c.text))}`, place: { kind: 'stage', path: 'tco' } };
  }
  if (c.source === 'contract-limit') {
    switch (code) {
      case 'target-not-bound':
        return {
          ...base,
          line: 'No target system was set for the analysis.',
          place: { kind: 'stage', path: 'analyze', action: 'Set the target' },
        };
      case 'inputs-not-bound':
      case 'inputs-differ':
        return {
          ...base,
          line: 'The code or its target changed since the analysis — run it again.',
          place: { kind: 'stage', path: 'analyze', action: 'Run the analysis again' },
        };
      case 'catalog-not-edition-specific':
        // A limit of this build, not a task: no catalog for the edition ships,
        // and no setting of the project changes that — `architecture-contract`
        // states it for every bound target, a release set or not. The link
        // shows what the target is and what its release means.
        return {
          ...base,
          kind: 'limit',
          line: `The SAP catalog check is not specific to ${subject ? sapNamesForDisplay(subject) : 'the target edition'}.`,
          place: it(DECISION_PLACE_IDS.itTargetProfile, 'See the target profile'),
        };
      case 'modification-unreset':
        return {
          ...base,
          line: `${subject ?? 'Some'} SAP core modification(s) must be reset to standard first.`,
          place: it(DECISION_PLACE_IDS.itFindings, 'Review the findings'),
        };
      case 'coverage-incomplete': {
        const parts = unassessedParts(subject);
        return {
          ...base,
          line: parts
            ? `${plural(parts.places, 'place', 'places')} in the code could not be assessed.`
            : 'Part of the code could not be assessed.',
          details: parts ? parts.details : subject ? [subject] : [],
          place: it(
            DECISION_PLACE_IDS.itOpenQuestions,
            parts ? `Review ${plural(parts.places, 'place', 'places')} in the code` : 'Review the open questions',
          ),
        };
      }
      case 'no-successor-published':
        // SAP's publication gap: carried, not filled in — nobody here can close it.
        return {
          ...base,
          kind: 'limit',
          line: `SAP publishes no successor for ${subject ?? 'an object'} yet.`,
          place: it(DECISION_PLACE_IDS.itFindings, 'See the finding'),
        };
      case 'successor-unverified':
        return {
          ...base,
          line: `The successor named for ${subject ?? 'an object'} is not verified yet.`,
          place: it(DECISION_PLACE_IDS.itFindings, 'Check the finding'),
        };
      case 'standard-fit-not-assessed':
        // The router never assesses it, so the condition stays open; the
        // Standard fit section is where a reader sees how much SAP covers.
        return {
          ...base,
          kind: 'limit',
          line: 'Whether SAP standard already covers the need is still open.',
          place: { kind: 'view', view: 'business', hash: DECISION_PLACE_IDS.businessStandard, action: 'Check standard fit' },
        };
      default:
        break;
    }
  }
  return { ...base, line: withoutSourcePaths(firstSentence(c.text)), place: null };
}

const BLOCKING_WORDS: Partial<Record<DecisionGapCode, string>> = {
  'run-not-bound': 'there is no signed analysis run',
  'contract-not-bound': 'there is no architecture contract',
  'sign-off-not-current': 'the sign-off is not current',
  'contract-blocked': 'a limit of the architecture contract blocks it',
  'option-not-chosen': 'no option is chosen yet',
};

export function decisionManagerView(decision: ProjectDecision, stored: StoredCostScenario | null = null): DecisionManagerView {
  const coverage = decisionCoverage(decision);
  const pillars = (['need', 'option', 'cost', 'contract'] as const).map((k) => pillarOf(decision, k, stored));
  const option = decision.bindings.find((b) => b.key === 'option')?.revision ?? null;
  const inPlace = pillars.filter((p) => p.inPlace).length;
  const points = decision.conditions.map(decisionPoint);
  const openPoints = points.filter((p) => !p.done).length;
  const todo = points.filter((p) => !p.done && p.kind === 'act').length;
  const limits = openPoints - todo;

  // ADR-083 (a): every option is chosen by the account, in this view.
  const why =
    option === null
      ? 'Choose one of the four options above.'
      : `Chosen by your account; ${inPlace} of the 4 foundations below are in place.`;

  const blocking = [
    ...new Set(
      coverage.gaps
        .filter((g) => g.severity === 'blocks')
        .map((g) => BLOCKING_WORDS[g.code] ?? 'a required binding is missing'),
    ),
  ];
  const readiness =
    decision.status === 'confirmed'
      ? coverage.state === 'clear'
        ? ''
        : 'Confirmed with what is still open visible beside it.'
      : coverage.state === 'blocked'
      ? `Cannot be confirmed yet: ${blocking.join('; ')}.`
      : coverage.state === 'qualified'
        ? 'Can be confirmed — what is still open stays visible with the decision.'
        : '';

  const technical: DecisionTechnicalEntry[] = [];
  for (const b of decision.bindings) {
    const text = b.revision === null ? b.notDeterminedReason : b.note;
    if (text) technical.push({ key: `binding:${b.key}`, label: b.label || DECISION_BINDING_LABELS[b.key], text: withoutSourcePaths(text) });
  }
  for (const c of decision.conditions) {
    technical.push({ key: `condition:${c.id}`, label: 'Condition', text: withoutSourcePaths(c.text) });
  }
  technical.push({ key: 'reversible', label: 'Reversible', text: withoutSourcePaths(decision.reversibility.reason) });
  if (coverage.sentence) technical.push({ key: 'coverage', label: 'Coverage', text: withoutSourcePaths(coverage.sentence) });

  const { foundations, other } = groupUnderPillars(pillars, decision, points);

  return {
    headline: decisionHeadline(option),
    why,
    pillars,
    inPlace,
    foundations,
    other,
    points,
    openPoints,
    todo,
    limits,
    readiness,
    technical,
  };
}

/** The foundation a condition source belongs to — the account's own conditions belong to none. */
const PILLAR_OF_SOURCE: Readonly<Record<ConditionSource, PillarKey | null>> = {
  'need-open': 'need',
  'cost-gap': 'cost',
  'contract-limit': 'contract',
  account: null,
};

/**
 * The conditions nested under the foundation they belong to (ADR-087). The
 * need's open rules and decision points are the Need row's own line, so the
 * `need-open` condition is not repeated under it: its place — "Decide on 12
 * rules" — becomes the row's action. An account's statement about a derived
 * condition stands under that condition's row; one that names none, after the
 * four rows. Nothing is dropped and nothing is counted differently.
 */
function groupUnderPillars(
  pillars: readonly DecisionPillar[],
  decision: ProjectDecision,
  points: readonly DecisionPoint[],
): { foundations: DecisionFoundation[]; other: DecisionPoint[] } {
  const sourceOfId = new Map(decision.conditions.map((c) => [c.id, c.source] as const));
  const pillarOf = (p: DecisionPoint): PillarKey | null => {
    if (p.source !== 'account') return PILLAR_OF_SOURCE[p.source];
    const named = p.id.startsWith('account:') ? sourceOfId.get(p.id.slice('account:'.length)) : undefined;
    return named && named !== 'account' ? PILLAR_OF_SOURCE[named] : null;
  };
  const needOpen = points.find((p) => p.source === 'need-open' && !p.done) ?? null;
  const foundations = pillars.map((pillar): DecisionFoundation => {
    // The need-open condition is the Need row's own line while the need is not
    // confirmed, and met once it is; only an open one beside a confirmed need
    // revision says something the line does not, and stands under it.
    const mine = points.filter(
      (p) => pillarOf(p) === pillar.key && (p.source !== 'need-open' || (!p.done && pillar.inPlace)),
    );
    return {
      pillar:
        pillar.key === 'need' && needOpen?.place && !pillar.inPlace ? { ...pillar, place: needOpen.place } : pillar,
      points: mine.filter((p) => p.done || p.kind === 'act'),
      limits: mine.filter((p) => !p.done && p.kind === 'limit'),
    };
  });
  const other = points.filter((p) => pillarOf(p) === null);
  return { foundations, other };
}
