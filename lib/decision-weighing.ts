/**
 * The weighing behind a decision, in the decision record — release 3.0.13
 * (SD review of 3.0.12, A04).
 *
 * The record of the SD example gave as its reason "Build this object as
 * In-App ABAP Cloud (RAP), as the signed-off target architecture says": the
 * choice restated as its own reason. Two things let it through. The summary is
 * a sentence `decisionSummary()` writes (fingerprinted, so it stays as it is),
 * and nothing held it against `circularReason()` — that check ran on the
 * design's comparison and the router's rationale only; and the check's patterns
 * wanted "the target is RAP", never "the target … says". Both are closed: the
 * pattern is in `lib/design-option-comparison.ts`, and the record now carries
 * what was weighed, read from what the engine already says per option:
 *
 *   - Keep, Move to SAP standard, Retire and Rebuild — the option signals of
 *     `decisionOptionsView()` (`lib/decision-option-signals.ts`), the same
 *     readings the Management view shows; nothing new is measured here.
 *   - Rebuild split into its two routes, in-app (RAP) and side by side (CAP) —
 *     the engine's route (`recommendedArchitecture`) and the router's own
 *     rationale, which names the constructs that force or do not force a split.
 *   - Beside them, the design's option comparison where one is stored — model
 *     text, labelled a proposal, never the engine's reading.
 *
 * No amount and no effort is filled in (missing Economics figures stay missing),
 * and a reading the evidence does not give stays "not determined" with why.
 *
 * Pure. A view: derived when the record is written, never stored or signed.
 */

import { decisionOptionsView, OPTION_SIGNAL_WORDS, type OptionSignal } from './decision-option-signals';
import { circularReason, readOptionComparison, type ComparedOption } from './design-option-comparison';
import type { DecisionStatus, ProjectDecision } from './project-decision';
import type { StandardFit } from './standard-fit';
import type { UsageReport } from './abap/usage-model';
import type { KeyUserRouteBasis } from './abap/extensibility-router';

export type WeighingKey = 'keep' | 'standard' | 'keyuser' | 'rap' | 'cap' | 'retire';

export const WEIGHING_LABELS: Readonly<Record<WeighingKey, string>> = Object.freeze({
  keep: 'Keep',
  standard: 'Move to SAP standard',
  keyuser: 'Rebuild with key-user tools (configured, no code)',
  rap: 'Rebuild in-app (ABAP Cloud, RAP)',
  cap: 'Rebuild side by side (CAP)',
  retire: 'Retire',
});

export interface WeighingRow {
  key: WeighingKey;
  label: string;
  signal: OptionSignal;
  /** "Speaks for it" · "Speaks against it" · "Not determined". */
  reading: string;
  /** Why, in the engine's words. */
  why: string;
  /** The design's comparison for this option (model text), or `null` when it has none. */
  proposal: string | null;
}

export interface DecisionWeighing {
  rows: WeighingRow[];
  /** The weighing in one sentence — what the record gives as its reason. Never circular. */
  reason: string;
}

export interface DecisionWeighingSource {
  subject: string;
  hasRun: boolean;
  decision: ProjectDecision | null;
  status: DecisionStatus | null;
  /** The engine's route as an architecture code (`recommendedArchitecture`). */
  engineRoute: string | null;
  /** The router's rationale (`recommendationJustification`). */
  engineReasoning: string | null;
  usage: UsageReport | null;
  /** The stored solution design, JSON text or object — only its option comparison is read. */
  design: unknown;
  /** The fit to SAP standard when the caller read it; `null` says it was not read. */
  fit?: StandardFit | null;
  /**
   * Roadmap 3.0.19 — the route report's key-user reading
   * (`ExtensibilityRouteReport.keyUser`). Absent (`undefined`): the caller
   * predates the option and the weighing has no key-user row, so a record
   * written before reads as it did. `null`: the run has no reading (an engine
   * before 3.0.19) — the row says it is not determined.
   */
  keyUser?: Pick<KeyUserRouteBasis, 'scope' | 'sentence' | 'parts'> | null;
}

/** Said for Keep when the caller holds no fit to SAP standard (the delivery package reads none). */
export const FIT_NOT_READ =
  'The fit to SAP standard is not read into this file — the Management view shows it from the signed run.';

const FIT_UNREAD: StandardFit = { state: 'not-determined', why: 'unread', reason: FIT_NOT_READ, platform: null };

function designObject(design: unknown): unknown {
  if (typeof design !== 'string') return design;
  try {
    return JSON.parse(design.replace(/^```json\n?/gm, '').replace(/^```\n?/gm, '').trim());
  } catch {
    return null;
  }
}

const sentence = (s: string) => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t && !/[.!?]$/.test(t) ? `${t}.` : t;
};

/** The weighing of the five options — see the file comment. */
export function decisionWeighing(src: DecisionWeighingSource): DecisionWeighing {
  const view = decisionOptionsView({
    subject: src.subject,
    mode: 'project',
    hasRun: src.hasRun,
    fit: src.fit ?? FIT_UNREAD,
    decision: src.decision,
    status: src.status,
    confirmation: null,
    signOff: null,
    engineRoute: src.engineRoute,
    usage: src.usage,
    economics: null,
  });
  const card = (o: 'keep' | 'standard' | 'rebuild' | 'retire') => view.cards.find((c) => c.option === o)!;

  const comparison = readOptionComparison(designObject(src.design));
  const proposalOf = (o: ComparedOption): string | null => {
    if (comparison.state !== 'ready') return null;
    const a = comparison.options.find((x) => x.option === o);
    return a && !/^not determined\.?$/i.test(a.fitGap) ? a.fitGap : null;
  };

  const reasoning = src.engineReasoning?.replace(/\s+/g, ' ').trim() || null;
  const rebuild = card('rebuild');
  const routeRow = (key: 'rap' | 'cap'): Pick<WeighingRow, 'signal' | 'why'> => {
    if (!src.hasRun) return { signal: rebuild.signal, why: rebuild.reason };
    const other = key === 'rap' ? 'cap' : 'rap';
    // Roadmap 3.0.19 (owner decision 19.10.2026): the engine reads the whole
    // program as key user, so a build in code is the departure that needs a reason.
    if (src.engineRoute === 'keyuser') {
      return {
        signal: 'against',
        why: `The engine reads the whole program as key-user extensibility, so building it ${key === 'rap' ? 'in-app (RAP)' : 'side by side (CAP)'} departs from the recommendation and needs a reason. It stays the route for any part whose key-user candidate does not hold.`,
      };
    }
    if (src.engineRoute === key) {
      return {
        signal: rebuild.signal === 'against' ? 'against' : 'for',
        why: [sentence(rebuild.reason), reasoning ? `The router: ${sentence(reasoning)}` : ''].filter(Boolean).join(' '),
      };
    }
    if (src.engineRoute === other) {
      return {
        signal: 'against',
        why: reasoning
          ? `The engine routes this object ${other === 'rap' ? 'in-app (RAP)' : 'side by side (CAP)'}: ${sentence(reasoning)}`
          : `The engine routes this object ${other === 'rap' ? 'in-app (RAP)' : 'side by side (CAP)'}; it recorded no rationale.`,
      };
    }
    return { signal: 'not-determined', why: 'The engine named no route for this object.' };
  };

  // Roadmap 3.0.19: key user beside the two builds, from the engine's key-user reading.
  const keyUserRow = (): Pick<WeighingRow, 'signal' | 'why'> => {
    const ku = src.keyUser;
    if (!src.hasRun) return { signal: 'not-determined', why: rebuild.reason };
    if (!ku) return { signal: 'not-determined', why: 'The key-user reading of the signed run is not at hand here — an engine before 3.0.19, or the engine’s evidence could not be read — so whether key-user tools cover a part is not determined.' };
    if (ku.scope === 'whole-program') return { signal: 'for', why: ku.sentence };
    if (ku.scope === 'partial') return { signal: 'not-determined', why: `In part only: ${ku.sentence}` };
    return { signal: 'against', why: ku.sentence };
  };

  const rows: WeighingRow[] = [
    { key: 'keep', signal: card('keep').signal, why: card('keep').reason, proposal: null },
    { key: 'standard', signal: card('standard').signal, why: card('standard').reason, proposal: proposalOf('standard') },
    ...(src.keyUser !== undefined ? [{ key: 'keyuser', ...keyUserRow(), proposal: proposalOf('keyuser') }] : []),
    { key: 'rap', ...routeRow('rap'), proposal: proposalOf('rap') },
    { key: 'cap', ...routeRow('cap'), proposal: proposalOf('cap') },
    { key: 'retire', signal: card('retire').signal, why: card('retire').reason, proposal: null },
  ].map((r) => ({ ...r, key: r.key as WeighingKey, label: WEIGHING_LABELS[r.key as WeighingKey], reading: OPTION_SIGNAL_WORDS[r.signal] }));

  const by = (s: OptionSignal) => rows.filter((r) => r.signal === s).map((r) => r.label);
  const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
  const parts = [
    by('for').length ? `the evidence speaks for ${list(by('for'))}` : 'the evidence speaks for no option',
    by('against').length ? `against ${list(by('against'))}` : '',
    by('not-determined').length ? `and does not determine ${list(by('not-determined'))}` : '',
  ].filter(Boolean);
  const reason = `Weighed on the engine's readings of the signed run: ${parts.join('; ')}.`;
  // The weighing names its readings, never the choice as its own reason.
  return { rows, reason: circularReason(reason) ? 'The weighing could not be stated without restating the choice.' : reason };
}
