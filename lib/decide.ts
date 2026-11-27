/**
 * Decide in one go (owner decisions 25.11.2026, ADR-145): the pure half of the Decide page
 * (`components/redesign/RedesignPage.tsx`, route `/project/[id]/redesign`) and of the `decide` command
 * (`lib/project-commands.ts`, `app/api/projects/[projectId]/commands/route.ts`).
 *
 *   - **the basis** — what the page read and the command binds besides the run: the run, its evidence, the need
 *     revision the answers stand at, and the decision record on the project. The browser computes it from the
 *     decision route's answer; the server computes it again, inside the deciding transaction, from the same
 *     derivation. A different basis is a 409, nothing written (`decision-moved`), exactly as a moved fingerprint was.
 *   - **the cost line** — the four options priced once, as a simulation: on the figures stored in Economics when they
 *     price all four, else on typical assumptions computed here and never stored (owner decision 5: Economics is no
 *     station; own figures stay there).
 *   - **the standard note** — box B of the fit-to-standard concept: the stronger hint, shown only when the engine has
 *     concrete signals for this program (owner decision 25.11.2026: box B only, no box without signals).
 *   - **the dialog** — every line the one confirmation shows; nothing is recorded that it does not show.
 *
 * Pure: no React, no Firestore, no model. Client-safe: `sha256Hex` is the isomorphic digest.
 */
import { sha256Hex } from './artefact-digest';
import { optionCost, type CostAssumptions, type CostOption } from './cost-assumptions';
import { DECISION_OPTIONS, DECISION_OPTION_LABELS, optionOfArchitecture, optionOfCostKind, type DecisionOption } from './decision-options';
import { formatMoney, formatMoneyRangeOutward, formatNumber } from './format';
import type { ProjectDecision } from './project-decision';
import { typicalPatch, usesTypical, TYPICAL_SHARED, type TypicalProposals } from './typical-assumptions';
import { anchorText, type StandardTouch, type TouchAnchor } from './standard-touch';
import type { TargetArchitectureCode } from './project-commands';

/* ------------------------------------------------------------------ basis */

/** What the basis is computed from: the decision route's answer, or the same derivation on the server. */
export interface DecideBasisSource {
  runId: string | null;
  evidenceDigest: string | null;
  /** The draft the route derives today (its `need` binding names the need revision the answers stand at). */
  draft: Pick<ProjectDecision, 'bindings'> | null;
  /** The record on the project, read back (`readStoredDecision`), or `null`. */
  stored: { fingerprint: string; status: string } | null;
}

/**
 * The digest a `decide` command is bound to besides the run (ADR-145 (2)). Changes when the run, its evidence, the
 * need revision (an answer given or changed) or the stored decision record changes: anything that would make the
 * dialog's lines untrue. Never stored; compared in the deciding transaction only.
 */
export function decisionBasisOf(src: DecideBasisSource): string {
  const need = src.draft?.bindings.find((b) => b.key === 'need')?.revision ?? null;
  return sha256Hex(
    JSON.stringify(['decide-basis/1', src.runId ?? null, src.evidenceDigest ?? null, need, src.stored?.fingerprint ?? null, src.stored?.status ?? null]),
  );
}

/* -------------------------------------------------------------- the route */

/** The codes a Rebuild can be recorded with on the Decide page: the engine's route and its one alternative. */
export const REBUILD_ROUTES: readonly TargetArchitectureCode[] = ['rap', 'cap', 'keyuser'];

/** "On-stack, RAP" — the route in the mock-up's words. */
export const ROUTE_WORDS: Readonly<Partial<Record<TargetArchitectureCode, string>>> = Object.freeze({
  rap: 'On-stack, RAP',
  cap: 'Side-by-side, CAP',
  keyuser: 'Key-user tools, no code',
  integration: 'SAP Integration Suite',
  event: 'SAP Event Mesh',
});

/** The routes a reader may pick for a Rebuild: RAP and CAP, and key user only where the engine names it. */
export function rebuildRoutes(engineRoute: TargetArchitectureCode | null): TargetArchitectureCode[] {
  return engineRoute === 'keyuser' ? ['keyuser', 'rap', 'cap'] : ['rap', 'cap'];
}

/** The architecture code a choice records: the route for a Rebuild, the option itself otherwise. */
export function codeOfChoice(option: DecisionOption, route: TargetArchitectureCode | null): TargetArchitectureCode | null {
  if (option === 'rebuild') return route && optionOfArchitecture(route) === 'rebuild' ? route : null;
  return option;
}

/**
 * Whether the choice needs a reason on the record: a departure from what the analysis indicates. For a Rebuild that
 * is another route than the engine's; for the other three, any option the analysis does not indicate. The server
 * holds the same line (`approve-architecture`'s departure check, and a decision that builds nothing rests on a sign-off
 * with its reason).
 */
export function reasonRequired(args: { option: DecisionOption; route: TargetArchitectureCode | null; indicated: DecisionOption | null; engineRoute: TargetArchitectureCode | null }): boolean {
  if (args.option === 'rebuild') return args.engineRoute !== null && args.route !== null && args.route !== args.engineRoute;
  return args.indicated !== args.option;
}

/**
 * The reason recorded when the reader follows the indication of an option that builds nothing (Keep or Retire read
 * from the evidence): no question is asked, and the record says in words why the option was chosen. Shown in the
 * dialog before anything is recorded.
 */
export function followedIndicationReason(option: DecisionOption, evidence: string): string {
  return `Follows the analysis, which indicates ${DECISION_OPTION_LABELS[option]}: ${evidence}`.slice(0, 4000);
}

/* -------------------------------------------------------------- cost line */

export interface DecideCostLine {
  /** `stored`: the figures in Economics price all four; `typical`: computed here on typical assumptions, never stored. */
  basis: 'stored' | 'typical' | 'none';
  /** Per option, the cost over the period in words, or `null` where it is not priced. */
  cost: Readonly<Record<DecisionOption, string | null>>;
  /** "5 years". */
  period: string | null;
  /** The chips under the line: what it is priced on. */
  chips: { label: string; value: string }[];
  /** Whether any of it is a typical value. */
  typical: boolean;
}

const NO_COST: Record<DecisionOption, string | null> = { keep: null, rebuild: null, standard: null, retire: null };

function costsOf(a: CostAssumptions): Record<DecisionOption, string | null> {
  const out: Record<DecisionOption, string | null> = { ...NO_COST };
  for (const option of DECISION_OPTIONS) {
    const matching = a.options.filter((o) => optionOfCostKind(o.kind) === option && o.kind !== 'keyuser');
    const pick: CostOption | undefined = matching.find((o) => o.kind === 'do-nothing') ?? matching[0];
    if (!pick) continue;
    const c = optionCost(a, pick);
    out[option] = c.total ? formatMoneyRangeOutward(c.total, a.currency) : null;
  }
  return out;
}

function chipsOf(a: CostAssumptions): DecideCostLine['chips'] {
  const chips: DecideCostLine['chips'] = [];
  const dev = formatMoney(a.devDayRate, a.currency);
  const test = formatMoney(a.testDayRate, a.currency);
  if (dev) chips.push({ label: 'Developer day', value: dev });
  if (test) chips.push({ label: 'Key-user day', value: test });
  if (typeof a.horizonYears === 'number') chips.push({ label: 'Period', value: `${formatNumber(a.horizonYears)} years` });
  if (a.releaseCadence) {
    const n = a.releaseCadence.perYear;
    chips.push({ label: 'Releases', value: `${formatNumber(n, { maximumFractionDigits: 2 })} a year` });
  }
  return chips;
}

/**
 * The cost line of the Decide page. `stored` is the Economics record's assumptions (restored), `seed` the four empty
 * options Economics starts from, `proposals` the size proposals of the source (`proposeEffort`,
 * `proposeMaintenanceBaseline`). Stored figures win where they price all four options; otherwise the stored ones are
 * completed with typical values in memory, as "Use typical assumptions" would, and nothing is written.
 */
export function decideCostLine(args: { stored: CostAssumptions | null; seed: CostAssumptions; proposals: TypicalProposals }): DecideCostLine {
  const own = args.stored;
  if (own) {
    const cost = costsOf(own);
    if (DECISION_OPTIONS.every((o) => cost[o] !== null)) {
      return { basis: 'stored', cost, period: yearsOf(own), chips: chipsOf(own), typical: usesTypical(own) };
    }
  }
  const start = own ?? args.seed;
  const filled: CostAssumptions = { ...start, ...typicalPatch(start, args.proposals) };
  const cost = costsOf(filled);
  if (!DECISION_OPTIONS.some((o) => cost[o] !== null)) {
    return { basis: 'none', cost: NO_COST, period: null, chips: [], typical: false };
  }
  return { basis: 'typical', cost, period: yearsOf(filled), chips: chipsOf(filled), typical: true };
}

function yearsOf(a: CostAssumptions): string | null {
  return typeof a.horizonYears === 'number' ? `${formatNumber(a.horizonYears)} years` : null;
}

/** The period of the typical assumptions, for the line's title before anything is computed. */
export const TYPICAL_PERIOD = `${TYPICAL_SHARED.horizonYears.value} years`;

/* -------------------------------------------------------- standard note (B) */

export interface StandardNote {
  /** "SAP standard may fit better than keeping or rebuilding this code." */
  head: string;
  /** The first sign, in plain words, and how many more. */
  sub: string;
  /** Each sign with its lines, for the open note. */
  signs: { text: string; lines: string[] }[];
  /** The area the program works in mainly, with its SAP objects, or `null`. */
  area: string | null;
}

const SIGN_WORDS: Readonly<Record<'A' | 'B' | 'C', string>> = Object.freeze({
  A: 'This code changes a standard SAP process.',
  B: 'This code only reads standard SAP data.',
  C: 'This code calls a standard SAP transaction.',
});

/**
 * Box B of the fit-to-standard concept (owner decision 25.11.2026: only B). Shown only when the gate is `offered` with
 * class A, B or C (D alone never), and only while the choice is open, Keep or Rebuild: not once Move to SAP standard or
 * Retire is chosen, and not while nothing is chosen and the analysis indicates Retire. `null`: no box.
 */
export function standardNote(touch: StandardTouch | null, chosen: DecisionOption | null, indicated: DecisionOption | null): StandardNote | null {
  if (!touch || touch.gate.outcome !== 'offered') return null;
  if (chosen === 'standard' || chosen === 'retire') return null;
  if (chosen === null && indicated === 'retire') return null;
  const signals = touch.gate.signals.filter((s) => s.cls !== 'D');
  if (signals.length === 0) return null;
  const than = chosen === 'keep' ? 'than keeping this code' : chosen === 'rebuild' ? 'than a rebuild' : 'than keeping or rebuilding this code';
  const first = SIGN_WORDS[signals[0].cls as 'A' | 'B' | 'C'];
  const more = signals.length - 1;
  const lines = (anchors: TouchAnchor[]) => anchors.slice(0, 4).map(anchorText);
  const area = touch.areas[0] ?? null;
  return {
    head: `SAP standard may fit better ${than}.`,
    sub: `${first}${more > 0 ? ` And ${more} more ${more === 1 ? 'sign' : 'signs'}.` : ''} We cannot prove the fit.`,
    signs: [
      ...signals.map((s) => ({ text: s.text, lines: lines(s.anchors) })),
      ...touch.departures.filter((d) => d.kind !== 'hardcoded-customizing').map((d) => ({ text: `${d.label}.`, lines: lines(d.anchors) })),
    ],
    area: area ? `It works mainly in the SAP area ${area.component}: ${area.objects.slice(0, 4).join(', ')}.` : null,
  };
}

/* ----------------------------------------------------------------- dialog */

export interface DecideDialogFacts {
  account: string | null;
  option: DecisionOption;
  route: TargetArchitectureCode | null;
  edition: string | null;
  runDate: string | null;
  costBasis: DecideCostLine['basis'];
  answers: { total: number; open: number } | null;
  limits: number | null;
  reason: string;
  indicated: DecisionOption | null;
  /** The reason is the analysis' own, recorded because the reader followed the indication. */
  reasonFollowsIndication: boolean;
}

/** The dialog's title: "Record: Rebuild?" */
export function decideDialogTitle(option: DecisionOption): string {
  return `Record: ${DECISION_OPTION_LABELS[option]}?`;
}

/** The sentence above the lines: whose decision it is, and what that is. */
export function decideDialogLead(account: string | null): string {
  return `${account ?? 'Your signed-in account'} records this decision. A self-declaration by the signed-in account, not an organisational mandate.`;
}

/** Every line the one confirmation shows (ADR-145 (2)): the option, the route, the run, the answers, the limits. */
export function decideDialogLines(f: DecideDialogFacts): string[] {
  const label = DECISION_OPTION_LABELS[f.option];
  const target = f.edition ? `, for ${f.edition}` : '';
  const run = f.runDate ? `Bound to the signed run of ${f.runDate}.` : 'Bound to the signed run of this project.';
  const cost =
    f.costBasis === 'stored'
      ? 'The costs shown come from the figures stored in Economics; their revision is recorded with the decision.'
      : f.costBasis === 'typical'
        ? 'The costs shown are a simulation on typical assumptions; they are not part of the record.'
        : 'No costs are recorded: nothing is priced yet.';
  if (f.option === 'rebuild') {
    const route = f.route ? ROUTE_WORDS[f.route] ?? f.route : 'the route the engine names';
    const lines = [`Rebuild as ${route}${target}.`, run, cost];
    if (f.answers && f.answers.total > 0) {
      const given = f.answers.total - f.answers.open;
      lines.push(`${f.answers.total} business ${f.answers.total === 1 ? 'question' : 'questions'}: ${given} answered, ${f.answers.open} open. Open ones stay open in the design.`);
    }
    if (f.limits !== null && f.limits > 0) {
      lines.push(`${f.limits} ${f.limits === 1 ? 'limit' : 'limits'} of the architecture contract stay visible with the decision.`);
    }
    if (f.reason.trim()) lines.push(`Your reason for this route: “${clip(f.reason)}”`);
    return lines;
  }
  const lines = [`${label}: nothing is built${target}.`, run, cost];
  if (f.reasonFollowsIndication) {
    lines.push(`Follows the analysis' indication. Recorded as the reason: “${clip(f.reason)}”`);
  } else {
    lines.push(`Your reason: “${clip(f.reason)}”`);
    if (f.indicated && f.indicated !== f.option) {
      lines.push(`Departs from the analysis' indication (${DECISION_OPTION_LABELS[f.indicated]}); the reason is on the record.`);
    }
  }
  return lines;
}

function clip(text: string): string {
  const t = text.trim();
  return t.length > 160 ? `${t.slice(0, 157)}...` : t;
}

/** What follows a choice that builds nothing, as the page says it before anything is recorded. */
export function nothingBuiltFollows(option: Exclude<DecisionOption, 'rebuild'>): string[] {
  const head =
    option === 'keep'
      ? 'Nothing is built; what blocks clean core stays. Transformation, Documentation, Testing and Delivery read “Not needed”.'
      : 'Nothing is built. Transformation, Documentation, Testing and Delivery read “Not needed”.';
  const design =
    option === 'retire'
      ? 'Design shows what the decision means: who still needs it, the callers not read, the data that stays behind.'
      : option === 'standard'
        ? 'Design shows what the decision means: which steps the standard has to take over, for your fit-to-standard workshop.'
        : 'Design shows what the decision means: what stays in place, by Level.';
  return [head, design];
}
