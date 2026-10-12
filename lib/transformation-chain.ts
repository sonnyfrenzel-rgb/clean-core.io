/**
 * What a generation builds on, and what would raise its quality — one model
 * for the Transformation tool's two new surfaces (roadmap 3.0.12, owner
 * 12.10.2026):
 *
 *   - **the chain** (`chainSlots`): the contributions of the tools before
 *     Transformation, in workflow order — First insights, Analyze, the business
 *     rules, Design, and the decision record where there is one. Each slot says
 *     what is taken, from which tool, when, at which level (engine, your
 *     decision, model proposal), and honestly when it is missing, out of date
 *     or still being read. Economics comes after Transformation and is never
 *     part of it: the slots are the phases of `PHASES` *before* Transformation,
 *     and nothing else.
 *   - **the tips** (`qualityTips`): the open inputs that would change what the
 *     generation works from, ordered by impact, each with a real count from
 *     this project and one address to the place it is decided — with the way
 *     back to the tips (`?origin=transformation.quality`,
 *     `lib/choice-addresses.ts`).
 *   - **the stages** (`generationStages`): what happens to the answer, as data,
 *     so a later stage (an engine scaffold, parallel step fills, targeted
 *     repairs) is one more entry in `GENERATION_STAGE_ORDER` and not a redesign.
 *     Only the stages that exist today are in it.
 *
 * Pure: no React, no network, no engine pass. Every input is something the
 * page has already read — the hydrated project, the evidence the server
 * computed, the rule register, the contract the generation fetched — so a
 * spec runs it without a server, and the context pack
 * (`lib/transformation-context.ts`, roadmap 3.0.12) can take the same slots
 * into the prompt: that is the seam, and the reason `ChainSlot` carries
 * structured facts beside its words.
 *
 * **What the prompt reads today** is said, not implied (`PROMPT_READS`). The
 * chain and the tips describe the inputs the generation is meant to work from;
 * where the code model does not read one yet, the slot and the tip say so on
 * the screen. Flip the flag in the same change that puts the input into the
 * prompt — never before.
 */
import type { Project } from '@/lib/types';
import type { ProvenanceValue } from '@/lib/provenance';
import type { RuleRegister, RuleRow } from '@/lib/rule-register';
import { PHASES, staleness, type PhaseKey } from '@/lib/workflow-steps';
import { choiceHref, type OriginKey } from '@/lib/choice-addresses';
import { stageHref } from '@/lib/workspace-back-href';
import { formatTextDate } from '@/lib/format';
import {
  TRANSFORMATION_MESSAGES as M,
  tfAnalyzeLine,
  tfDecisionLine,
  tfOpenTool,
  tfReasonLine,
  tfRequirementsLine,
  tfRulesLine,
  tfRulesOpenCount,
  tfTargetLine,
  tfWhenLine,
} from '@/lib/messages/transformation';

/* ------------------------------------------------------------ prompt seam */

/**
 * Which inputs today's code-draft prompt actually reads. `true` only where the
 * prompt in `app/(app)/project/[projectId]/transformation/page.tsx` carries it:
 * the signed source and the run's narrative (`analysis`), the rules as the
 * engine reads them (`codeDraftFactsSection`), the solution design, and the
 * target the contract chose. The rest is shown, and marked as not read yet,
 * until the context pack carries it.
 */
export const PROMPT_READS = Object.freeze({
  purpose: false,
  analysis: true,
  rules: true,
  ruleDecisions: false,
  design: true,
  target: true,
  requirements: false,
  decision: false,
} satisfies Record<string, boolean>);

export type PromptInput = keyof typeof PROMPT_READS;

/** The origin every tip and slot link carries, so the target offers "Back to Transformation, Raise the quality". */
export const QUALITY_ORIGIN: OriginKey = 'transformation.quality';

/** The id of the tips on the Transformation page — the origin's anchor. */
export const QUALITY_ANCHOR = 'tf-quality';

/* ------------------------------------------------------------- the inputs */

/** The evidence the page read from the server, reduced to what the chain counts. */
export type ChainEvidence =
  | { state: 'loading' }
  | { state: 'failed'; reason: string }
  | {
      state: 'ready';
      findings: ReadonlyArray<{ sapReplacement?: { objectName?: string; confidence?: string } | null }>;
    };

/** The rule register, or that it is still being read. */
export type ChainRules = { state: 'loading' } | { state: 'ready'; register: RuleRegister };

/** What the contract the generation fetched says about the target. */
export interface ChainContract {
  /** "Side-by-side on SAP BTP (CAP)" — the decision's label for the chosen track. */
  label: string;
  /** The contract's headline — what is built and what was rejected — or null. */
  summary: string | null;
  contractId: string | null;
  /** False exactly when a deviation was declared. */
  followsRecommendation: boolean;
  /** The declared deviation's reason, when there is one. */
  deviationReason: string | null;
}

/** The program's purpose as the engine reads it (`lib/program-summary-text.ts`). */
export type ChainPurpose =
  | { state: 'loading' }
  | { state: 'ready'; text: string | null; anchors: ReadonlyArray<{ lineStart: number; lineEnd: number }> }
  | { state: 'unread'; reason: string };

export interface ChainInputs {
  projectId: string;
  project: Project | null;
  /** The reader's view (`?view=`), kept by every tool link. */
  view?: string | null;
  evidence: ChainEvidence;
  rules: ChainRules;
  /** Absent before a generation asked the server; `null` when the contract named none. */
  contract?: ChainContract | null | 'loading';
  purpose?: ChainPurpose;
  /** The origin the links carry; the tips' by default. */
  origin?: OriginKey | null;
}

/* -------------------------------------------------------------- the slots */

export type ChainSlotKey = 'insights' | 'analyze' | 'rules' | 'design' | 'decision';

/**
 * `ready` — established; `loading` — still being read; `missing` — not on
 * record; `stale` — on record, built for a previous source; `unread` — could
 * not be read.
 */
export type ChainSlotState = 'ready' | 'loading' | 'missing' | 'stale' | 'unread';

export interface ChainFact {
  /** A stable key, for a reader that wants the value rather than the words. */
  key: string;
  text: string;
  /** Whether today's prompt reads this fact (`PROMPT_READS`). */
  read: boolean;
}

export interface ChainLink {
  label: string;
  href: string;
}

export interface ChainSlot {
  key: ChainSlotKey;
  /** The tool the contribution comes from; `null` for the decision record (a view, not a tool). */
  phase: PhaseKey | null;
  title: string;
  state: ChainSlotState;
  /** The level of what is taken — engine, your decision, model proposal (`lib/provenance.ts`). */
  provenance: ProvenanceValue;
  facts: ChainFact[];
  /** "Signed run, 12 Oct 2026", "revision 3, 12 Oct 2026" — or null when nothing dates it. */
  when: string | null;
  /** The way to where it comes from. */
  source: ChainLink;
  /** Where a missing, stale or unread slot is put right. */
  fix: ChainLink | null;
  /** Why the slot is not `ready`, in a sentence. */
  note: string | null;
}

/**
 * The phases a generation builds on: those before Transformation in the
 * canonical order. Economics (phase 6) comes later and is never among them.
 */
export const CHAIN_PHASES: readonly PhaseKey[] = Object.freeze(
  PHASES.filter((p) => p.n < (PHASES.find((x) => x.key === 'transformation')?.n ?? 0)).map((p) => p.key),
);

/** The slots in workflow order — each with the phase it belongs to. */
export const CHAIN_SLOT_ORDER: ReadonlyArray<{ key: ChainSlotKey; phase: PhaseKey | null }> = Object.freeze([
  { key: 'insights', phase: 'analyze' },
  { key: 'analyze', phase: 'analyze' },
  { key: 'rules', phase: 'analyze' },
  { key: 'design', phase: 'design' },
  { key: 'decision', phase: null },
]);

const PHASE_LABEL = (key: PhaseKey): string => PHASES.find((p) => p.key === key)?.label ?? key;
const base = (projectId: string) => `/project/${encodeURIComponent(projectId)}`;
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const day = (v: unknown): string | null => formatTextDate(v);

/** The tool link of a slot or tip, keeping the reader's view and the origin. */
function toolHref(inputs: ChainInputs, path: string, hash?: string | null): string {
  return stageHref({ base: base(inputs.projectId), path, view: inputs.view ?? null, origin: originOf(inputs), hash: hash ?? null });
}

function originOf(inputs: ChainInputs): OriginKey | null {
  return inputs.origin === undefined ? QUALITY_ORIGIN : inputs.origin;
}

/** Distinct released successors the engine named, from the catalog or the curated layer. */
export function successorCount(findings: ChainEvidence & { state: 'ready' }): number {
  const names = new Set<string>();
  for (const f of findings.findings) {
    const name = f.sapReplacement?.objectName;
    if (typeof name === 'string' && name.trim()) names.add(name.trim().toUpperCase());
  }
  return names.size;
}

/** The SHA-256 of the source the active run signed, or null. */
function signedSha(project: Project | null): string | null {
  return (
    str(project?.auditMetadata?.inputFingerprint?.sha256) ??
    str((project as { inputFingerprint?: { sha256?: unknown } } | null)?.inputFingerprint?.sha256)
  );
}

/** What the requirements specification holds, read defensively from the project (ADR-078). */
export interface ChainSpec {
  functional: number;
  nonFunctional: number;
  accepted: number;
  openDecisions: number;
  revision: number;
  savedAt: string;
  stale: boolean;
}

export function specOf(project: Project | null): ChainSpec | null {
  const v = (project as { requirementsSpec?: unknown } | null)?.requirementsSpec;
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  const n = (x: unknown) => (typeof x === 'number' && Number.isInteger(x) && x >= 0 ? x : null);
  const functional = n(r.functional);
  const nonFunctional = n(r.nonFunctional);
  const accepted = n(r.accepted);
  const openDecisions = n(r.openDecisions);
  const revision = n(r.revision);
  if (functional === null || nonFunctional === null || accepted === null || openDecisions === null || revision === null) return null;
  if (typeof r.savedAt !== 'string' || typeof r.derivedFrom !== 'string') return null;
  // As `specIsStale`: without a signed source to compare it cannot be shown current.
  const sha = signedSha(project);
  return { functional, nonFunctional, accepted, openDecisions, revision, savedAt: r.savedAt, stale: !sha || r.derivedFrom !== sha };
}

/** The rule register's decided and open counts, from its rows. */
export function ruleTally(rows: readonly RuleRow[]): { keep: number; change: number; drop: number; open: number; total: number; lastAt: string | null; revision: number | null } {
  let keep = 0;
  let change = 0;
  let drop = 0;
  let lastAt: string | null = null;
  let revision: number | null = null;
  for (const r of rows) {
    if (r.answer === 'keep') keep += 1;
    else if (r.answer === 'change') change += 1;
    else if (r.answer === 'drop') drop += 1;
    if (r.at && (!lastAt || r.at > lastAt)) lastAt = r.at;
    if (typeof r.revision === 'number' && (revision === null || r.revision > revision)) revision = r.revision;
  }
  return { keep, change, drop, open: rows.length - keep - change - drop, total: rows.length, lastAt, revision };
}

/** The decision record stored on the project (`data.decision`), read defensively. */
function decisionOf(project: Project | null): { id: string; revision: number; summary: string | null; confirmedAt: string | null } | null {
  const d = (project as { decision?: unknown } | null)?.decision;
  if (!d || typeof d !== 'object') return null;
  const r = d as Record<string, unknown>;
  const id = str(r.decisionId);
  const revision = typeof r.revision === 'number' ? r.revision : null;
  if (!id || revision === null) return null;
  const confirmation = r.confirmation && typeof r.confirmation === 'object' ? (r.confirmation as Record<string, unknown>) : null;
  return { id, revision, summary: str(r.summary), confirmedAt: confirmation ? str(confirmation.at) : null };
}

function insightsSlot(inputs: ChainInputs): ChainSlot {
  const source = { label: tfOpenTool(PHASE_LABEL('analyze')), href: toolHref(inputs, 'analyze', 'analyze-in-short-title') };
  const p = inputs.purpose ?? { state: 'loading' as const };
  const shell = { key: 'insights' as const, phase: 'analyze' as const, title: M['transformation.slot.insights'], source, when: null, fix: null };
  if (p.state === 'loading') return { ...shell, state: 'loading', provenance: 'reconstructed', facts: [], note: null };
  if (p.state === 'unread') return { ...shell, state: 'unread', provenance: 'not-determined', facts: [], note: p.reason };
  if (!p.text) {
    return { ...shell, state: 'missing', provenance: 'not-determined', facts: [], note: M['transformation.insights.noPurpose'] };
  }
  return {
    ...shell,
    state: 'ready',
    provenance: 'reconstructed',
    facts: [{ key: 'purpose', text: p.text, read: PROMPT_READS.purpose }],
    note: null,
  };
}

function analyzeSlot(inputs: ChainInputs): ChainSlot {
  const { project } = inputs;
  const source = { label: tfOpenTool(PHASE_LABEL('analyze')), href: toolHref(inputs, 'analyze') };
  const shell = { key: 'analyze' as const, phase: 'analyze' as const, title: M['transformation.slot.analyze'], source };
  if (!str(project?.activeRunId)) {
    return { ...shell, state: 'missing', provenance: 'not-determined', facts: [], when: null, fix: source, note: null };
  }
  const score = typeof project?.cleanCoreScore === 'number' ? project.cleanCoreScore : null;
  const ev = inputs.evidence;
  const findings = ev.state === 'ready' ? ev.findings.length : null;
  const successors = ev.state === 'ready' ? successorCount(ev) : null;
  const when = tfWhenLine('Signed run', day(project?.createdAt));
  const stale = staleness(project);
  if (stale.sourceChanged || stale.unverifiedInputs.length > 0) {
    return {
      ...shell,
      state: 'stale',
      provenance: 'stale',
      facts: [{ key: 'score', text: tfAnalyzeLine(score, findings, successors), read: PROMPT_READS.analysis }],
      when,
      fix: source,
      note: null,
    };
  }
  if (ev.state === 'loading') {
    return { ...shell, state: 'loading', provenance: 'proven', facts: [], when, fix: null, note: null };
  }
  return {
    ...shell,
    state: ev.state === 'failed' ? 'unread' : 'ready',
    provenance: 'proven',
    facts: [{ key: 'score', text: tfAnalyzeLine(score, findings, successors), read: PROMPT_READS.analysis }],
    when,
    fix: null,
    note: ev.state === 'failed' ? ev.reason : null,
  };
}

function rulesSlot(inputs: ChainInputs): ChainSlot {
  const source = {
    label: M['transformation.tip.rules.action'],
    href: choiceHref({ base: base(inputs.projectId), choice: 'business.rules', origin: originOf(inputs), view: inputs.view ?? null }) ?? base(inputs.projectId),
  };
  const shell = { key: 'rules' as const, phase: 'analyze' as const, title: M['transformation.slot.rules'], source };
  if (inputs.rules.state === 'loading') {
    return { ...shell, state: 'loading', provenance: 'reconstructed', facts: [], when: null, fix: null, note: null };
  }
  const reg = inputs.rules.register;
  if (reg.state === 'not-read') {
    return { ...shell, state: 'unread', provenance: 'not-determined', facts: [], when: null, fix: null, note: reg.reason };
  }
  if (reg.state === 'not-detected') {
    return {
      ...shell,
      state: 'ready',
      provenance: 'reconstructed',
      facts: [{ key: 'none', text: M['transformation.rules.none'], read: PROMPT_READS.rules }],
      when: null,
      fix: null,
      note: null,
    };
  }
  const t = ruleTally(reg.rows);
  const decided = t.keep + t.change + t.drop;
  return {
    ...shell,
    state: 'ready',
    // A decided rule is the account's own word (a self-declaration); undecided ones are the engine's reading.
    provenance: decided > 0 ? 'confirmed' : 'reconstructed',
    facts: [
      { key: 'rules', text: tfRulesLine(t.total, t, t.open), read: decided > 0 ? PROMPT_READS.ruleDecisions : PROMPT_READS.rules },
    ],
    when: decided > 0 ? tfWhenLine(t.revision !== null ? `need revision ${t.revision}` : null, day(t.lastAt)) : null,
    fix: null,
    note: null,
  };
}

function designSlot(inputs: ChainInputs): ChainSlot {
  const { project } = inputs;
  const source = { label: tfOpenTool(PHASE_LABEL('design')), href: toolHref(inputs, 'design') };
  const shell = { key: 'design' as const, phase: 'design' as const, title: M['transformation.slot.design'], source };
  if (!str(project?.solutionDesign)) {
    return { ...shell, state: 'missing', provenance: 'not-determined', facts: [], when: null, fix: source, note: M['transformation.design.none'] };
  }
  const stale = staleness(project);
  const contract = inputs.contract;
  if (contract === 'loading') {
    return { ...shell, state: 'loading', provenance: 'proposed', facts: [], when: null, fix: null, note: null };
  }
  const confirmed = project?.approvedByArchitect === true && !stale.signOff;
  const facts: ChainFact[] = [];
  if (contract) {
    facts.push({ key: 'target', text: tfTargetLine(contract.label, confirmed), read: PROMPT_READS.target });
    const reason = contract.deviationReason ?? str(project?.architectJustifiedOverride) ?? contract.summary ?? str(project?.recommendationJustification);
    if (reason) facts.push({ key: 'reason', text: tfReasonLine(reason), read: PROMPT_READS.target });
  } else if (!confirmed) {
    facts.push({ key: 'target', text: M['transformation.design.notConfirmed'], read: PROMPT_READS.target });
  }
  const spec = specOf(project);
  facts.push(
    spec
      ? {
          key: 'requirements',
          text: tfRequirementsLine(spec.accepted, spec.functional + spec.nonFunctional, spec.openDecisions),
          read: PROMPT_READS.requirements,
        }
      : { key: 'requirements', text: M['transformation.requirements.none'], read: PROMPT_READS.requirements },
  );
  const designStale = stale.design || stale.signOff;
  return {
    ...shell,
    state: designStale ? 'stale' : 'ready',
    // The design is the model's proposal; a confirmed target makes it the account's.
    provenance: designStale ? 'stale' : confirmed ? 'confirmed' : 'proposed',
    facts,
    when: confirmed ? tfWhenLine('Target confirmed', day(project?.architectSignOffAt)) : null,
    fix: designStale ? source : null,
    note: null,
  };
}

function decisionSlot(inputs: ChainInputs): ChainSlot | null {
  const d = decisionOf(inputs.project);
  if (!d) return null;
  const href = choiceHref({ base: base(inputs.projectId), choice: 'management.confirm', origin: originOf(inputs), view: inputs.view ?? null }) ?? base(inputs.projectId);
  const facts: ChainFact[] = [{ key: 'record', text: tfDecisionLine(d.id, d.revision, d.confirmedAt !== null), read: PROMPT_READS.decision }];
  if (d.summary) facts.push({ key: 'summary', text: d.summary, read: PROMPT_READS.decision });
  return {
    key: 'decision',
    phase: null,
    title: M['transformation.slot.decision'],
    state: 'ready',
    provenance: d.confirmedAt ? 'confirmed' : 'proposed',
    facts,
    when: d.confirmedAt ? tfWhenLine('Confirmed', day(d.confirmedAt)) : null,
    source: { label: tfOpenTool('Management view'), href },
    fix: null,
    note: null,
  };
}

/**
 * The chain, in workflow order. A slot whose tool comes after Transformation
 * is never built; the decision record appears only where one is stored.
 */
export function chainSlots(inputs: ChainInputs): ChainSlot[] {
  const build: Record<ChainSlotKey, () => ChainSlot | null> = {
    insights: () => insightsSlot(inputs),
    analyze: () => analyzeSlot(inputs),
    rules: () => rulesSlot(inputs),
    design: () => designSlot(inputs),
    decision: () => decisionSlot(inputs),
  };
  return CHAIN_SLOT_ORDER.filter((s) => s.phase === null || CHAIN_PHASES.includes(s.phase))
    .map((s) => build[s.key]())
    .filter((s): s is ChainSlot => s !== null);
}

/* --------------------------------------------------------------- the tips */

export type QualityTipKey = 'rules' | 'requirements' | 'target';

export interface QualityTip {
  key: QualityTipKey;
  /** 1 changes the code most. */
  rank: number;
  title: string;
  /** What it changes in the generated code, positively. */
  impact: string;
  /** The real count from this project — "4 of 11 rules open". `null` while it is being read. */
  count: string | null;
  links: ChainLink[];
  /** Whether today's prompt reads what the tip changes (`PROMPT_READS`). */
  read: boolean;
}

/** The tips, by impact; empty when nothing open would change what the generation works from. */
export function qualityTips(inputs: Omit<ChainInputs, 'contract' | 'purpose'>): QualityTip[] {
  const { project } = inputs;
  if (!project) return [];
  const tips: QualityTip[] = [];
  const b = base(inputs.projectId);
  const origin = originOf(inputs);
  const view = inputs.view ?? null;

  // 1 — the rules. Only where there are rules to decide, and only while one is open.
  const rulesHref = choiceHref({ base: b, choice: 'business.rules', origin, view }) ?? b;
  if (inputs.rules.state === 'loading') {
    tips.push({
      key: 'rules',
      rank: 1,
      title: M['transformation.tip.rules.title'],
      impact: M['transformation.tip.rules.impact'],
      count: null,
      links: [{ label: M['transformation.tip.rules.action'], href: rulesHref }],
      read: PROMPT_READS.ruleDecisions,
    });
  } else if (inputs.rules.register.state === 'read') {
    const t = ruleTally(inputs.rules.register.rows);
    if (t.open > 0) {
      tips.push({
        key: 'rules',
        rank: 1,
        title: M['transformation.tip.rules.title'],
        impact: M['transformation.tip.rules.impact'],
        count: tfRulesOpenCount(t.open, t.total),
        links: [{ label: M['transformation.tip.rules.action'], href: rulesHref }],
        read: PROMPT_READS.ruleDecisions,
      });
    }
  }

  // 2 — the requirements specification (ADR-078).
  const spec = specOf(project);
  const requirementsHref = toolHref(inputs, 'design/requirements');
  if (!spec) {
    tips.push({
      key: 'requirements',
      rank: 2,
      title: M['transformation.tip.requirementsStart.title'],
      impact: M['transformation.tip.requirementsStart.impact'],
      count: M['transformation.requirements.none'],
      links: [{ label: M['transformation.tip.requirementsStart.action'], href: requirementsHref }],
      read: PROMPT_READS.requirements,
    });
  } else if (spec.stale) {
    tips.push({
      key: 'requirements',
      rank: 2,
      title: M['transformation.tip.requirementsStale.title'],
      impact: M['transformation.tip.requirementsStale.impact'],
      count: tfRequirementsLine(spec.accepted, spec.functional + spec.nonFunctional, spec.openDecisions),
      links: [{ label: M['transformation.tip.requirementsStart.action'], href: requirementsHref }],
      read: PROMPT_READS.requirements,
    });
  } else if (spec.accepted < spec.functional + spec.nonFunctional || spec.openDecisions > 0) {
    tips.push({
      key: 'requirements',
      rank: 2,
      title: M['transformation.tip.requirements.title'],
      impact: M['transformation.tip.requirements.impact'],
      count: tfRequirementsLine(spec.accepted, spec.functional + spec.nonFunctional, spec.openDecisions),
      links: [
        {
          label: `${M['transformation.tip.requirements.functional']} (${spec.functional.toLocaleString('en')})`,
          href: toolHref(inputs, 'design/requirements', 'spec-s3'),
        },
        {
          label: `${M['transformation.tip.requirements.nonFunctional']} (${spec.nonFunctional.toLocaleString('en')})`,
          href: choiceHref({ base: b, choice: 'requirements.nfr-questions', origin, view }) ?? requirementsHref,
        },
      ],
      read: PROMPT_READS.requirements,
    });
  }

  // 3 — the target. A sign-off given for a previous source is a blocker the
  // stage already says, never a tip as well (nothing twice).
  const stale = staleness(project);
  if (str(project.solutionDesign) && project.approvedByArchitect !== true && !stale.signOff) {
    tips.push({
      key: 'target',
      rank: 3,
      title: M['transformation.tip.target.title'],
      impact: M['transformation.tip.target.impact'],
      count: M['transformation.design.notConfirmed'],
      links: [
        {
          label: M['transformation.tip.target.action'],
          href: choiceHref({ base: b, choice: 'design.target-signoff', origin, view }) ?? toolHref(inputs, 'design'),
        },
      ],
      read: PROMPT_READS.target,
    });
  }

  return tips.sort((a, z) => a.rank - z.rank);
}

/* ------------------------------------------------------------- the stages */

/**
 * What happens to the answer, in the order it happens. The stages that exist
 * today — and only those. A later stage is one more key here, with its own
 * entry in the log the page keeps; the screen draws whatever this lists.
 */
export const GENERATION_STAGE_ORDER = ['contract', 'facts', 'model', 'checks', 'storing'] as const;
export type GenerationStageKey = (typeof GENERATION_STAGE_ORDER)[number];

export type GenerationStageState = 'pending' | 'active' | 'done' | 'failed';
export type GenerationCheckState = 'pending' | 'passed' | 'warning' | 'failed';

export interface GenerationCheck {
  key: string;
  label: string;
  state: GenerationCheckState;
  result?: string;
}

/** One stage as the page records it while the generation runs. */
export interface GenerationStageRecord {
  state: GenerationStageState;
  startedAt: number | null;
  endedAt: number | null;
  /** Which call of the model this is, when there is more than one. */
  attempt?: { n: number; of: number };
  /** What the stage is doing that the reader should know — "Retrying once …". Shown, never announced. */
  detail?: string;
  checks?: GenerationCheck[];
}

export type GenerationStageLog = Partial<Record<GenerationStageKey, GenerationStageRecord>>;

export interface GenerationStage extends GenerationStageRecord {
  key: GenerationStageKey;
  label: string;
  /** A sentence under the label that says what the stage is honest about. */
  note: string | null;
}

const STAGE_LABEL: Record<GenerationStageKey, string> = {
  contract: M['transformation.stage.contract'],
  facts: M['transformation.stage.facts'],
  model: M['transformation.stage.model'],
  checks: M['transformation.stage.checks'],
  storing: M['transformation.stage.storing'],
};

/** Enter `key` at `at`: the stage that was running is done, every later one stays pending. */
export function enterStage(log: GenerationStageLog, key: GenerationStageKey, at: number, extra: Partial<GenerationStageRecord> = {}): GenerationStageLog {
  const next: GenerationStageLog = { ...log };
  for (const k of GENERATION_STAGE_ORDER) {
    const r = next[k];
    if (r?.state === 'active' && k !== key) next[k] = { ...r, state: 'done', endedAt: at };
  }
  const prev = next[key];
  next[key] = { ...prev, ...extra, state: 'active', startedAt: prev?.startedAt ?? at, endedAt: null };
  return next;
}

/** End the generation: the running stage is done — or failed, when the generation stopped. */
export function finishStages(log: GenerationStageLog, at: number, outcome: 'done' | 'failed'): GenerationStageLog {
  const next: GenerationStageLog = { ...log };
  for (const k of GENERATION_STAGE_ORDER) {
    const r = next[k];
    if (r?.state === 'active') next[k] = { ...r, state: outcome, endedAt: at };
  }
  return next;
}

/** Record the checks of the answer as they are made. */
export function withChecks(log: GenerationStageLog, checks: GenerationCheck[]): GenerationStageLog {
  const r = log.checks ?? { state: 'pending' as const, startedAt: null, endedAt: null };
  return { ...log, checks: { ...r, checks } };
}

/** The stages to draw, in order, from the log. */
export function generationStages(log: GenerationStageLog): GenerationStage[] {
  return GENERATION_STAGE_ORDER.map((key) => {
    const r = log[key] ?? { state: 'pending' as const, startedAt: null, endedAt: null };
    return { key, label: STAGE_LABEL[key], note: key === 'model' ? M['transformation.stage.modelNote'] : null, ...r };
  });
}

/** The checks the page makes on an answer, before any of them ran. */
export function pendingChecks(): GenerationCheck[] {
  return [
    { key: 'files', label: M['transformation.check.files'], state: 'pending' },
    { key: 'paths', label: M['transformation.check.paths'], state: 'pending' },
    { key: 'artefacts', label: M['transformation.check.artefacts'], state: 'pending' },
    { key: 'tests', label: M['transformation.check.tests'], state: 'pending' },
    { key: 'literals', label: M['transformation.check.literals'], state: 'pending' },
  ];
}

/** One check set to its result. */
export function setCheck(checks: GenerationCheck[], key: string, state: GenerationCheckState, result?: string): GenerationCheck[] {
  return checks.map((c) => (c.key === key ? { ...c, state, ...(result !== undefined ? { result } : {}) } : c));
}
