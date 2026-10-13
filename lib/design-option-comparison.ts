/**
 * The design reasons with SAP's standard, not past it (roadmap 3.0.13, moved
 * into 3.0.12 by the owner on 12.10.2026; CO review F14/F15, PP F11, SD R12).
 *
 * Four external reviews (FI, CO, PP, SD) found the same gap: the solution
 * design ruled the SAP standard out without comparing it — in the CO case
 * SAP's own allocation ran without journal entries and was never named — and
 * gave as its reason the route it had been handed ("CAP because the target
 * architecture is CAP"). The prompt asked the model to compare in one sentence
 * (`OPTION_COMPARISON_RULE`); nothing gave it the facts to compare with, and
 * nothing checked what came back.
 *
 * This module does three things, deterministically and without a model:
 *
 *   1. **Engine facts per option** (`engineOptionFacts`) — for the SAP
 *      standard, an in-app RAP extension and a side-by-side CAP application:
 *      what the code does that the option has to carry, the released
 *      successors SAP's catalog names, the constructs that force or do not
 *      force a split, what is not determined (target release, scope items),
 *      and a **release-bound data contract** for the figures the program reads
 *      (`dataContractRows`: actuals from ACDOCA, plan from ACDOCP or the
 *      planning source as configured, statistical key figures apart from plan,
 *      the currency the figures are read in). The prompt carries them; the
 *      model compares on them.
 *   2. **The schema the model answers in** (`OPTION_COMPARISON_SCHEMA`) —
 *      per option target release, fit-gap, effort, running cost and data
 *      contract, then the recommendation, its reason and the requirement the
 *      other options miss. Running cost is qualitative: no amount without
 *      approved cost assumptions (`lib/money-honesty.ts`), which Economics
 *      holds and the design does not.
 *   3. **The check on the answer** (`readOptionComparison`) — the comparison
 *      is model text and is shown as a proposal; a reason that is circular
 *      ("because the target is CAP") or names no requirement the other options
 *      miss is refused and said to be refused, never shown as a reason.
 *
 * Pure: no React, no Firestore, no engine import beyond types.
 */

import { containsAmount } from './money-honesty';

/** The three options the design compares, in the order a reader weighs them: the standard first. */
export const COMPARED_OPTIONS = ['standard', 'rap', 'cap'] as const;
export type ComparedOption = (typeof COMPARED_OPTIONS)[number];

export const COMPARED_OPTION_LABELS: Readonly<Record<ComparedOption, string>> = Object.freeze({
  standard: 'SAP standard',
  rap: 'In-app RAP extension',
  cap: 'Side-by-side CAP application',
});

/** The five things every option is compared on (CO review F14). */
export const COMPARISON_ASPECTS = ['targetRelease', 'fitGap', 'effort', 'runningCost', 'dataContract'] as const;
export type ComparisonAspect = (typeof COMPARISON_ASPECTS)[number];

export const COMPARISON_ASPECT_LABELS: Readonly<Record<ComparisonAspect, string>> = Object.freeze({
  targetRelease: 'Target release',
  fitGap: 'Fit-gap',
  effort: 'Effort',
  runningCost: 'Running cost',
  dataContract: 'Data contract',
});

/* ------------------------------------------------------- the data contract */

/** One row of the release-bound source matrix: which figure comes from where, on which condition. */
export interface DataContractRow {
  /** `actual` · `plan` · `statistical-key-figures` · `currency`. */
  measure: 'actual' | 'plan' | 'statistical-key-figures' | 'currency';
  label: string;
  /** Where the figure comes from on S/4HANA, with the condition that binds it. */
  source: string;
  /** The objects of the original that led to this row, upper case. */
  from: string[];
}

/** Tables whose reading means the program works with actual postings. */
const ACTUAL_TABLES = new Set([
  'ACDOCA', 'BSEG', 'BKPF', 'FAGLFLEXA', 'FAGLFLEXT', 'GLT0', 'COEP', 'COBK', 'BSIS', 'BSAS', 'BSID', 'BSAD', 'BSIK', 'BSAK',
  'COSP', 'COSS', 'FAGLFLEXP',
]);
/** Tables that hold plan values (with a value type) or are S/4HANA's plan table. */
const PLAN_TABLES = new Set(['ACDOCP', 'COSP', 'COSS', 'COEJ', 'COEJL', 'COEJR', 'COEJT', 'BPEJ', 'BPJA', 'FAGLFLEXP', 'GLPCP']);
/** Tables of statistical key figures. */
const SKF_TABLES = new Set(['COSR', 'COKR', 'FINSSKF', 'TKA03', 'COMR']);
/** Tables whose amounts come in more than one currency. */
const CURRENCY_TABLES = new Set(['ACDOCA', 'ACDOCP', 'BSEG', 'COEP', 'COSP', 'COSS', 'FAGLFLEXA', 'FAGLFLEXT', 'GLT0']);

/**
 * The release-bound source matrix for the objects the program reads (CO
 * review F15): plan and actual are never both put on ACDOCA, statistical key
 * figures are sourced apart from plan, and the currency the figures are read
 * in is named. Only rows the code gives a reason for; an empty list when it
 * reads none of these objects. No release number is asserted that the
 * product cannot check — the condition is said instead ("as configured",
 * "confirm on the target release").
 */
export function dataContractRows(objects: readonly string[]): DataContractRow[] {
  const names = [...new Set(objects.map((o) => o.trim().toUpperCase()).filter(Boolean))].sort();
  const hit = (set: ReadonlySet<string>) => names.filter((n) => set.has(n));
  const rows: DataContractRow[] = [];
  const actual = hit(ACTUAL_TABLES);
  if (actual.length) {
    rows.push({
      measure: 'actual',
      label: 'Actuals',
      source: 'ACDOCA (Universal Journal) on every S/4HANA release — the classic totals and line-item tables are compatibility views over it, read through released CDS views (e.g. I_JournalEntryItem) in ABAP Cloud.',
      from: actual,
    });
  }
  const plan = hit(PLAN_TABLES);
  if (plan.length) {
    rows.push({
      measure: 'plan',
      label: 'Plan',
      source: 'Not ACDOCA. ACDOCP where plan data is kept in S/4HANA\'s plan table, or the planning source the customer runs (BW/BPC, SAP Analytics Cloud) — as configured; confirm on the target release before the design relies on either.',
      from: plan,
    });
  }
  const skf = hit(SKF_TABLES);
  if (skf.length) {
    rows.push({
      measure: 'statistical-key-figures',
      label: 'Statistical key figures',
      source: 'Their own source, apart from plan and from ACDOCA: FINSSKF on releases that keep statistical key figures there, COSR before — confirm on the target release.',
      from: skf,
    });
  }
  const currency = hit(CURRENCY_TABLES);
  if (currency.length) {
    rows.push({
      measure: 'currency',
      label: 'Currency contract',
      source: 'Name the currency the figures are read and compared in — transaction, company code or controlling area currency (ACDOCA: WSL, HSL, KSL) — and convert by the controlling area\'s rule, not per line.',
      from: currency,
    });
  }
  return rows;
}

/* --------------------------------------------------------- engine facts */

export interface OptionFactsInput {
  /** The route the contract recommends, or null when none is bound. */
  recommended: 'in-app-rap' | 'side-by-side-cap' | null;
  /** The constructs that chose a side-by-side route (`routeDrivers`), with their first line. */
  drivers: ReadonlyArray<{ label: string; firstLine: number }>;
  /** The findings as the IT view reads them. */
  findings: ReadonlyArray<{ kind: string; objectName: string | null; lineStart: number; successor?: string | null; level?: string | null }>;
  /** How many business rules / requirements the engine read, and how many it left open. */
  requirements: { total: number; open: number } | null;
  /** Public or Private Edition, or null when not bound. */
  deployment: 'public' | 'private' | null;
}

export interface OptionFacts {
  note: string;
  targetRelease: string;
  program: string[];
  options: Record<ComparedOption, string[]>;
  dataContract: DataContractRow[];
}

const WRITE_KINDS = new Set(['standard-table-write', 'custom-table-write', 'bdc', 'batch-input']);

/**
 * What the engine knows that bears on each option — facts, each with its line
 * or its count, never a verdict. The model compares on these; where they are
 * silent (scope items, volumes, users), the comparison has to say "not
 * determined" rather than fill it in.
 */
export function engineOptionFacts(input: OptionFactsInput): OptionFacts {
  const f = input.findings;
  const objects = [...new Set(f.map((x) => x.objectName).filter((n): n is string => !!n))];
  const successors = f.filter((x) => x.objectName && x.successor);
  const successorLines = [...new Map(successors.map((x) => [x.objectName as string, `${x.objectName} → ${x.successor} (line ${x.lineStart})`])).values()];
  const writes = f.filter((x) => WRITE_KINDS.has(x.kind));
  const files = f.filter((x) => x.kind === 'gui-download');
  const program: string[] = [];
  if (input.recommended) {
    program.push(`The router recommends ${input.recommended === 'side-by-side-cap' ? 'a side-by-side CAP application' : 'an in-app RAP extension'} from the constructs below — a recommendation to compare, not a reason in itself.`);
  }
  if (input.requirements) {
    program.push(`${input.requirements.total} requirement(s) read from the code, ${input.requirements.open} left open by the engine.`);
  }
  program.push(writes.length ? `${writes.length} write(s) or posting(s), first at line ${Math.min(...writes.map((w) => w.lineStart))}.` : 'No database write found.');
  if (files.length) program.push(`${files.length} frontend file transfer(s) — never a reason for side-by-side on their own.`);

  const standard: string[] = [
    successorLines.length
      ? `Released successors SAP's catalog names: ${successorLines.slice(0, 12).join('; ')}${successorLines.length > 12 ? `; … ${successorLines.length - 12} more` : ''}.`
      : 'SAP\'s catalog names no released successor for the objects this code uses.',
    'Scope items and standard apps that cover the process are not determined by the engine — name the standard process (and SAP\'s own tool for it, e.g. an allocation or an import app) before ruling it out.',
  ];
  const rap: string[] = [];
  const cap: string[] = [];
  if (input.drivers.length) {
    const named = input.drivers.map((d) => `${d.label} (line ${d.firstLine})`).join(', ');
    rap.push(`Constructs that do not run on the ABAP Cloud stack as they are: ${named}.`);
    cap.push(`The route's drivers: ${named} — the reason a split is recommended, to be weighed against replacing them on-stack.`);
  } else {
    rap.push('No construct that forces a side-by-side split was found.');
    cap.push('No construct in the code forces a split: a side-by-side application needs a requirement the code does not show (external users, several systems, own orchestration, scale).');
  }
  if (files.length) rap.push('Frontend file transfers move on-stack: a download to a list report export, an upload to a RAP large object field (S/4HANA 2022 or later).');
  rap.push(input.deployment === 'public'
    ? 'Public Edition: released APIs only (clean core level A), no wrapper around an unreleased object.'
    : input.deployment === 'private'
      // DSAG ABAP guideline: clean-core/solution-approach.md § Level Concept
      ? 'Private Edition: released APIs first (clean core level A); where SAP offers none, a wrapper can encapsulate an unreleased object, with an influence request to SAP. The wrapper does not make the wrapped object stable.'
      : 'Deployment not bound: Public or Private Edition decides what an in-app extension may call.');
  cap.push('Running cost: its own runtime, database and operations beside S/4HANA — qualitative here; amounts only from approved cost assumptions in Economics.');

  return {
    note: 'Engine facts for the option comparison, read from the signed run without a model. Compare on them; where they are silent, say "not determined".',
    targetRelease: 'Not recorded on the project — only the deployment is. Name the S/4HANA release each option assumes; RAP large object fields need S/4HANA 2022 or later.',
    program,
    options: { standard, rap, cap },
    dataContract: dataContractRows(objects),
  };
}

/* ------------------------------------------------------------- the prompt */

/** The schema key and the rule the design prompt adds after `OPTION_COMPARISON_RULE`. */
export const OPTION_COMPARISON_SCHEMA = `  optionComparison: {
    options: Array<{
      option: 'standard' | 'rap' | 'cap'; // one entry each, in this order: the SAP standard first
      targetRelease: string; // the S/4HANA release the option assumes, or "not determined" with what decides it
      fitGap: string; // what the option covers of what the program does, and the gap — from the engine facts (OPTION FACTS), naming SAP's standard process and app where one exists
      effort: string; // qualitative: what has to be built or configured; no person-days unless the facts give them
      runningCost: string; // qualitative only (runtime, operations, licences to check) — NEVER an amount of money
      dataContract: string; // where each figure comes from on the target, per the DATA CONTRACT rows: actuals, plan, statistical key figures, currency
    }>;
    recommended: 'standard' | 'rap' | 'cap'; // must agree with the design you write below
    decisionReason: string; // why this option over the other two — names the requirement the others miss; never "because the target/route is X"
    requirementOthersMiss: string; // that requirement, in one sentence, as a requirement of the business or the operation
  };`;

export const OPTION_COMPARISON_PROMPT_RULE =
  'Compare the SAP standard, an in-app RAP extension and a side-by-side CAP application in optionComparison, in that order, before you design. '
  + 'Ground each option in the OPTION FACTS of the engine evidence; where they are silent, write "not determined" and what would decide it. '
  + 'A frontend file upload or download alone never justifies side-by-side. Plan and actual are never both read from ACDOCA. '
  + 'Running cost is qualitative — no amounts. The decisionReason must name the requirement the other options miss; '
  + 'a reason that only restates the route or the target ("CAP because the target architecture is CAP") is refused.';

/* -------------------------------------------------------- the circular check */

const OPTION_WORDS = /\b(?:sap|s\/4hana|s4hana|btp|cap|rap|abap|cloud|side-by-side|side|by|in-app|in|app|on-stack|stack|standard|extension|application|option|route|target|architecture|platform|track|chosen|recommended|selected|approach|model|solution|design|the|a|an|is|are|was|be|because|since|as|so|this|that|it|of|for|to|and|or|with|we|our|best|better|right|fit|fits|suited|suitable|preferred|recommend|choose|use|uses|using|modern|clean|core)\b/gi;

/** "because the target architecture is CAP", "since the route is side-by-side", "as RAP is the chosen target". */
const CIRCULAR_PATTERNS: readonly RegExp[] = [
  /\b(?:because|since|as|given that)\b[^.;]{0,40}\b(?:target|chosen|recommended|selected|decided)\b[^.;]{0,30}\b(?:architecture|route|option|platform|track|target)?\b[^.;]{0,10}\b(?:is|was|=)\s+(?:the\s+)?(?:an?\s+)?(?:sap\s+)?(?:cap|rap|btp|side-by-side|in-app|standard)\b/i,
  /\b(?:because|since|as)\b[^.;]{0,20}\b(?:cap|rap|btp|side-by-side|in-app)\b[^.;]{0,20}\b(?:is|was)\s+(?:the\s+)?(?:target|chosen|recommended|selected)\b/i,
  /\b(?:the\s+)?(?:target|route|architecture)\s+(?:is|was)\s+(?:cap|rap|btp|side-by-side|in-app)\s*,?\s*(?:so|therefore|hence)\b/i,
];

/** The content words of a sentence once the options and the filler are taken out. */
function contentWords(text: string): string[] {
  return text
    .replace(OPTION_WORDS, ' ')
    .split(/[^A-Za-z0-9äöüÄÖÜß/_-]+/)
    .filter((w) => w.length > 2);
}

/**
 * Why a decision reason is circular, or `null` when it is not. Circular: it
 * restates the route or the target as its own reason, or — with the options
 * and the filler taken out — says nothing (fewer than three content words).
 * Used for the design's comparison and for the router's own rationale.
 */
export function circularReason(reason: string | null | undefined): string | null {
  const text = String(reason ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return 'No reason is given.';
  for (const re of CIRCULAR_PATTERNS) {
    if (re.test(text)) return 'The reason restates the route or the target as its own reason.';
  }
  if (contentWords(text).length < 3) return 'The reason names the option, not a requirement.';
  return null;
}

/* ------------------------------------------------------ reading the answer */

export interface OptionAssessment {
  option: ComparedOption;
  targetRelease: string;
  fitGap: string;
  effort: string;
  runningCost: string;
  dataContract: string;
}

export interface OptionComparison {
  options: OptionAssessment[];
  recommended: ComparedOption;
  decisionReason: string;
  requirementOthersMiss: string;
}

/** What the reader is shown of the stored comparison. */
export type OptionComparisonView =
  | { state: 'absent' }
  | { state: 'malformed'; why: string }
  | {
      state: 'ready';
      options: OptionAssessment[];
      recommended: ComparedOption;
      /** The reason and the requirement, or `null` with why when they were refused. */
      reason: { text: string; requirement: string } | null;
      refused: string | null;
      /** Options the model left out — said, never filled in. */
      missing: ComparedOption[];
    };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, max = 1200): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const isOption = (v: unknown): v is ComparedOption => typeof v === 'string' && (COMPARED_OPTIONS as readonly string[]).includes(v);


/**
 * The stored design's comparison, read for a reader: shape checked, options
 * in the order standard · RAP · CAP, a circular reason refused with why, and
 * an amount in a running cost replaced by what the rule says (no amounts
 * without approved cost assumptions). Never throws.
 */
export function readOptionComparison(design: unknown): OptionComparisonView {
  const raw = isObj(design) ? design.optionComparison : undefined;
  if (raw === undefined || raw === null) return { state: 'absent' };
  if (!isObj(raw) || !Array.isArray(raw.options)) return { state: 'malformed', why: 'The comparison has no list of options.' };
  const byOption = new Map<ComparedOption, OptionAssessment>();
  for (const entry of raw.options) {
    if (!isObj(entry) || !isOption(entry.option) || byOption.has(entry.option)) continue;
    const running = text(entry.runningCost);
    byOption.set(entry.option, {
      option: entry.option,
      targetRelease: text(entry.targetRelease) || 'Not determined.',
      fitGap: text(entry.fitGap) || 'Not determined.',
      effort: text(entry.effort) || 'Not determined.',
      runningCost: containsAmount(running) ? 'Not stated here — an amount needs approved cost assumptions (Economics).' : running || 'Not determined.',
      dataContract: text(entry.dataContract) || 'Not determined.',
    });
  }
  if (byOption.size === 0) return { state: 'malformed', why: 'The comparison names none of the three options.' };
  if (!isOption(raw.recommended)) return { state: 'malformed', why: 'The comparison recommends no option.' };
  const reasonText = text(raw.decisionReason);
  const requirement = text(raw.requirementOthersMiss);
  const refused = circularReason(reasonText) ?? (circularReason(requirement) ? `The requirement the other options miss is not named: ${circularReason(requirement)}` : null);
  return {
    state: 'ready',
    options: COMPARED_OPTIONS.filter((o) => byOption.has(o)).map((o) => byOption.get(o) as OptionAssessment),
    recommended: raw.recommended,
    reason: refused ? null : { text: reasonText, requirement },
    refused,
    missing: COMPARED_OPTIONS.filter((o) => !byOption.has(o)),
  };
}

/**
 * Whether the comparison weighed the SAP standard on facts: the standard is
 * among the options with a fit-gap that is not "not determined", and the
 * reason is not refused. Read by `standardFitAssessed` (`lib/standard-fit-gate.ts`).
 */
export function comparisonWeighsStandard(view: OptionComparisonView): boolean {
  if (view.state !== 'ready' || view.refused) return false;
  const standard = view.options.find((o) => o.option === 'standard');
  return Boolean(standard && !/^not determined\.?$/i.test(standard.fitGap));
}
