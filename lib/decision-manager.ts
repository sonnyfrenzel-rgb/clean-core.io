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
  type ConditionStatus,
  type DecisionCondition,
  type DecisionGapCode,
  type ProjectDecision,
} from './project-decision';
import type { ProvenanceValue } from './provenance';
import { contractParts } from './decision-card';
import { sapNamesForDisplay } from './sap-naming';

/** Where a point is resolved: a stage of the project, or another view of the workspace. */
export type DecisionPlace =
  | { kind: 'stage'; path: 'analyze' | 'design' | 'tco' }
  | { kind: 'view'; view: 'business' | 'it' };

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
  /** Met or waived. */
  done: boolean;
  status: ConditionStatus;
  /** One plain line, never the record's full sentence. */
  line: string;
  place: DecisionPlace | null;
}

export interface DecisionTechnicalEntry {
  key: string;
  label: string;
  text: string;
}

export interface DecisionManagerView {
  /** "Rebuild as In-App ABAP Cloud (RAP)". */
  headline: string;
  /** One sentence of why. */
  why: string;
  pillars: DecisionPillar[];
  points: DecisionPoint[];
  openPoints: number;
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

/** The option binding (`rap · In-App ABAP Cloud (RAP)`) as the decision's headline. */
export function decisionHeadline(optionRevision: string | null): string {
  if (optionRevision === null) return 'No option chosen yet';
  const at = optionRevision.indexOf(' · ');
  const id = at > 0 ? optionRevision.slice(0, at) : optionRevision;
  const label = sapNamesForDisplay(at > 0 ? optionRevision.slice(at + 3) : optionRevision);
  if (id === 'retire') return 'Retire this object';
  const verb = OPTION_VERB[id];
  return verb ? `${verb} ${label}` : label;
}

function firstSentence(text: string): string {
  const m = /^(.+?[.!?])(\s|$)/.exec(text.trim());
  return m ? m[1] : text.trim();
}

/** The `need-open` condition's count, when the record carries one. */
function undecidedOf(decision: ProjectDecision): number | null {
  const c = decision.conditions.find((x) => x.source === 'need-open');
  const m = c?.evidence ? /^undecided:(\d+)$/.exec(c.evidence) : null;
  return m ? Number(m[1]) : null;
}

const elements = (n: number) => `${n} process element${n === 1 ? '' : 's'}`;

/**
 * What the Economics stage has stored, when the decision binds no cost
 * revision of it yet: how many options its figures price (never an amount).
 */
export type StoredCostScenario = { priced: number; total: number };

function pillarOf(decision: ProjectDecision, key: PillarKey, stored: StoredCostScenario | null = null): DecisionPillar {
  const b = decision.bindings.find((x) => x.key === key) ?? null;
  const revision = b?.revision ?? null;
  const provenance: ProvenanceValue = b && revision !== null ? b.provenance : 'not-determined';
  const base = { key, provenance, draft: false, inPlace: revision !== null && provenance !== 'not-determined' };

  if (key === 'need') {
    const undecided = undecidedOf(decision);
    const n = revision ? /^need\/r(\d+)$/.exec(revision)?.[1] : null;
    return {
      ...base,
      title: 'Need',
      line:
        revision !== null
          ? `Revision ${n ?? revision} of the need, confirmed by your account.`
          : undecided !== null
            ? `Not confirmed yet: ${elements(undecided)} carry no state.`
            : 'Not confirmed yet: the process has not been confirmed for this source.',
      place: { kind: 'view', view: 'business' },
    };
  }

  if (key === 'option') {
    return {
      ...base,
      title: 'Option',
      line: revision !== null ? `${decisionHeadline(revision)}, as signed off in Design.` : 'No target architecture is signed off yet.',
      place: { kind: 'stage', path: 'design' },
    };
  }

  if (key === 'cost') {
    const line =
      !b || revision === null
        ? stored && stored.priced > 0
          ? `${stored.priced} of ${stored.total} options priced in Economics — not bound to this decision.`
          : !b || /no cost assumptions were stated/i.test(b.notDeterminedReason ?? '')
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
  const base = { id: c.id, done, status: c.status };
  const evidence = c.evidence ?? '';
  const cut = evidence.indexOf(':');
  const code = cut < 0 ? evidence : evidence.slice(0, cut);
  const subject = cut < 0 ? null : evidence.slice(cut + 1) || null;

  if (c.source === 'need-open') {
    const n = /^undecided:(\d+)$/.exec(evidence)?.[1];
    return {
      ...base,
      line: n ? `${elements(Number(n))} have no confirmed state yet.` : 'The need is not complete yet.',
      place: { kind: 'view', view: 'business' },
    };
  }
  if (c.source === 'cost-gap') {
    return { ...base, line: `Costs: ${withoutSourcePaths(firstSentence(c.text))}`, place: { kind: 'stage', path: 'tco' } };
  }
  if (c.source === 'contract-limit') {
    switch (code) {
      case 'target-not-bound':
        return { ...base, line: 'No target system was set for the analysis.', place: { kind: 'stage', path: 'analyze' } };
      case 'inputs-not-bound':
      case 'inputs-differ':
        return { ...base, line: 'The code or its target changed since the analysis — run it again.', place: { kind: 'stage', path: 'analyze' } };
      case 'catalog-not-edition-specific':
        return {
          ...base,
          line: `The SAP catalog check is not specific to ${subject ? sapNamesForDisplay(subject) : 'the target edition'}.`,
          place: { kind: 'view', view: 'it' },
        };
      case 'modification-unreset':
        return { ...base, line: `${subject ?? 'Some'} SAP core modification(s) must be reset to standard first.`, place: { kind: 'view', view: 'it' } };
      case 'coverage-incomplete':
        return {
          ...base,
          line: subject ? `Part of the code was not assessed: ${subject}.` : 'Part of the code was not assessed.',
          place: { kind: 'view', view: 'it' },
        };
      case 'no-successor-published':
        return { ...base, line: `SAP publishes no successor for ${subject ?? 'an object'} yet.`, place: { kind: 'stage', path: 'design' } };
      case 'successor-unverified':
        return { ...base, line: `The successor named for ${subject ?? 'an object'} is not verified yet.`, place: { kind: 'stage', path: 'design' } };
      case 'standard-fit-not-assessed':
        return { ...base, line: 'Whether SAP standard already covers the need is still open.', place: { kind: 'view', view: 'business' } };
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
  'option-not-chosen': 'no target architecture is signed off',
};

export function decisionManagerView(decision: ProjectDecision, stored: StoredCostScenario | null = null): DecisionManagerView {
  const coverage = decisionCoverage(decision);
  const pillars = (['need', 'option', 'cost', 'contract'] as const).map((k) => pillarOf(decision, k, stored));
  const option = decision.bindings.find((b) => b.key === 'option')?.revision ?? null;
  const inPlace = pillars.filter((p) => p.inPlace).length;
  const points = decision.conditions.map(decisionPoint);
  const openPoints = points.filter((p) => !p.done).length;

  const why =
    option === null
      ? 'Sign off a target architecture in Design to give this decision an option.'
      : `It follows the target architecture signed off in Design; ${inPlace} of the 4 foundations below are in place.`;

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

  return { headline: decisionHeadline(option), why, pillars, points, openPoints, readiness, technical };
}
