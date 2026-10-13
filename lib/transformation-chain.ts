/**
 * What a generation builds on, and what would raise its quality — one model
 * for the Transformation tool's two new surfaces (roadmap 3.0.12, owner
 * 12.10.2026; `docs/design/engine-led-transformation.md` §14–§15, mockup
 * `docs/roadmap/transformation-generation-mockup.html`):
 *
 *   - **the chain** (`chainSlots`): the contributions of the tools before
 *     Transformation, in workflow order, grouped by phase — First insights,
 *     Analyze and the business rules (Analyze phase); Design, the requirements
 *     and the decision record (Design phase). Each slot says what is taken,
 *     at which level, from which tool, when, and — where its input is missing
 *     or could be better — a warning line with the place to fix it. Economics
 *     comes after Transformation and is never part of it: the slots' phases are
 *     the phases of `PHASES` *before* Transformation, and a spec holds that.
 *   - **the tips** (`qualityTips`): the open inputs that change what the
 *     generation uses, ordered by impact, each with a real count from this
 *     project, its effect on the code, and one address to the place it is
 *     decided — with the way back to the tips (`?origin=transformation.tips`,
 *     `lib/choice-addresses.ts`).
 *   - **the stages** (`generationStages`): the generation's own steps after
 *     the chain, as data. Only the steps that exist today are listed; a later
 *     one (the engine scaffold, step-wise fills, contract cases, repairs) is
 *     one more key in `GENERATION_STAGE_ORDER`, not a redesign.
 *
 * **One set of sources.** The slots and the tips read what the PLATFORM
 * KNOWLEDGE block (`lib/transformation-context.ts`, built on the server by
 * `lib/transformation-context-build.ts`) reads: the rule answers of the
 * process states, the requirements specification, the decision record, the
 * sign-off and route, the engine's summary facts and the catalog successors
 * of the evidence. During a generation the purpose is taken from the block
 * itself (`purposeFromContext`), so the screen says what the prompt says.
 *
 * Pure: no React, no network, no engine pass.
 */
import type { Project } from '@/lib/types';
import type { ProvenanceValue } from '@/lib/provenance';
import type { RuleRegister, RuleRow } from '@/lib/rule-register';
import { PHASES, staleness, type PhaseKey } from '@/lib/workflow-steps';
import { choiceHref, type OriginKey } from '@/lib/choice-addresses';
import { stageHref } from '@/lib/workspace-back-href';
import { formatTextDate } from '@/lib/format';
import { TRANSFORMATION_MESSAGES as M } from '@/lib/messages/transformation';
import { decisionRecordIsLive, recordedDecisionOf } from '@/lib/transformation-context';

/* ------------------------------------------------------------ prompt seam */

/**
 * Which inputs the code-draft prompt reads. Since the PLATFORM KNOWLEDGE block
 * (roadmap 3.0.12) every slot of the chain is in it: the rule decisions, the
 * decision record and the route, what the program does, the successors, the
 * accepted requirements (else the model's NFR proposals). A fact whose input
 * the prompt does not read is marked so on the screen; flip a flag only in the
 * change that takes the input out of, or into, the prompt.
 */
export const PROMPT_READS = Object.freeze({
  purpose: true,
  analysis: true,
  successors: true,
  rules: true,
  ruleDecisions: true,
  design: true,
  target: true,
  requirements: true,
  decision: true,
} satisfies Record<string, boolean>);

/** The origin every tip and slot link carries: the target offers "Back to Transformation, Before the run". */
export const QUALITY_ORIGIN: OriginKey = 'transformation.tips';

/** The id of the tips on the Transformation page — the origin's anchor. */
export const QUALITY_ANCHOR = 'transformation-tips';

/** The most model calls today's generation makes: one, and one retry of an unusable answer. */
export const GENERATION_MAX_MODEL_CALLS = 2;

/* ------------------------------------------------------------- the inputs */

/** The evidence the page read from the server, reduced to what the chain counts. */
export type ChainEvidence =
  | { state: 'loading' }
  | { state: 'failed'; reason: string }
  | { state: 'ready'; findings: ReadonlyArray<{ sapReplacement?: { objectName?: string; confidence?: string } | null }> };

/** The rule register, or that it is still being read. */
export type ChainRules = { state: 'loading' } | { state: 'ready'; register: RuleRegister };

/** The requirements specification, counted by kind and status (ADR-078). */
export interface ChainSpec {
  functional: { accepted: number; proposed: number };
  nonFunctional: { accepted: number; proposed: number };
  revision: number;
  savedAt: string | null;
  /** Written for a source other than the signed one. */
  stale: boolean;
}

/** `null` in `ready`: no specification is stored. */
export type ChainSpecRead = { state: 'loading' } | { state: 'ready'; spec: ChainSpec | null } | { state: 'unread' };

/** The program's purpose as the engine reads it (`lib/program-summary-text.ts`). */
export type ChainPurpose = { state: 'loading' } | { state: 'ready'; text: string | null } | { state: 'unread'; reason: string };

export interface ChainInputs {
  projectId: string;
  project: Project | null;
  /** The reader's view (`?view=`), kept by every tool link. */
  view?: string | null;
  evidence: ChainEvidence;
  rules: ChainRules;
  spec: ChainSpecRead;
  purpose: ChainPurpose;
  /** The origin the links carry; the tips' by default. */
  origin?: OriginKey | null;
}

/* -------------------------------------------------------------- the slots */

export type ChainSlotKey = 'first-insights' | 'analyze' | 'business-rules' | 'design' | 'requirements' | 'decision-record';

/**
 * The slots in workflow order, each with its phase — the shape of
 * `CONTEXT_SLOTS` in the design (§15.2): Analyze gives First insights, Analyze
 * and the rules; Design gives Design, the requirements and the decision record.
 */
export const CHAIN_SLOTS: ReadonlyArray<{ key: ChainSlotKey; phase: PhaseKey }> = Object.freeze([
  { key: 'first-insights', phase: 'analyze' },
  { key: 'analyze', phase: 'analyze' },
  { key: 'business-rules', phase: 'analyze' },
  { key: 'design', phase: 'design' },
  { key: 'requirements', phase: 'design' },
  { key: 'decision-record', phase: 'design' },
]);

/** The phases a generation builds on: those before Transformation. Economics (phase 6) never is one. */
export const CHAIN_PHASES: readonly PhaseKey[] = Object.freeze(
  PHASES.filter((p) => p.n < (PHASES.find((x) => x.key === 'transformation')?.n ?? 0)).map((p) => p.key),
);

/**
 * `ready` — read; `loading` — still being read; `missing` — not on record;
 * `unread` — could not be read. Whether a ready slot "could be better" is
 * `warn`, not a state of its own.
 */
export type ChainSlotState = 'ready' | 'loading' | 'missing' | 'unread';

export interface ChainFact {
  /** A stable key, for a reader that wants the value rather than the words. */
  key: string;
  text: string;
  /** The level of the fact — engine, your decision, model proposal, SAP's catalog (`lib/provenance.ts`). */
  provenance: ProvenanceValue;
  /** Whether the prompt reads it (`PROMPT_READS`). */
  read: boolean;
}

export interface ChainLink {
  label: string;
  href: string;
}

export interface ChainSlot {
  key: ChainSlotKey;
  phase: PhaseKey;
  title: string;
  state: ChainSlotState;
  facts: ChainFact[];
  /** "signed run 12 Oct 2026", "need revision 3", "revision 2" — or null. */
  when: string | null;
  /** The way to where it comes from. */
  source: ChainLink;
  /** What is missing or could be better, with where to put it right. */
  warn: { text: string; fix: ChainLink } | null;
}

const PHASE_LABEL = (key: PhaseKey): string => PHASES.find((p) => p.key === key)?.label ?? key;
const base = (projectId: string) => `/project/${encodeURIComponent(projectId)}`;
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const day = (v: unknown): string | null => formatTextDate(v);
const n = (v: number) => v.toLocaleString('en');
const plural = (count: number, one: string, many = `${one}s`) => `${n(count)} ${count === 1 ? one : many}`;
const fact = (key: string, text: string, provenance: ProvenanceValue, read: boolean): ChainFact => ({ key, text, provenance, read });

/** The phase heading of a group of slots — "Analyze phase". */
export function phaseHeading(phase: PhaseKey): string {
  return `${PHASE_LABEL(phase)} phase`;
}

function originOf(inputs: Pick<ChainInputs, 'origin'>): OriginKey | null {
  return inputs.origin === undefined ? QUALITY_ORIGIN : inputs.origin;
}

type Addressing = Pick<ChainInputs, 'projectId' | 'view' | 'origin'>;

/** The tool link of a slot or tip, keeping the reader's view and the origin. */
function toolHref(inputs: Addressing, path: string, hash?: string | null): string {
  return stageHref({ base: base(inputs.projectId), path, view: inputs.view ?? null, origin: originOf(inputs), hash: hash ?? null });
}

function choice(inputs: Addressing, key: Parameters<typeof choiceHref>[0]['choice']): string {
  return choiceHref({ base: base(inputs.projectId), choice: key, origin: originOf(inputs), view: inputs.view ?? null }) ?? base(inputs.projectId);
}

/** Distinct released successors the engine named for the objects the program uses. */
export function successorCount(findings: ReadonlyArray<{ sapReplacement?: { objectName?: string } | null }>): number {
  const names = new Set<string>();
  for (const f of findings) {
    const name = f.sapReplacement?.objectName;
    if (typeof name === 'string' && name.trim()) names.add(name.trim().toUpperCase());
  }
  return names.size;
}

/** The SHA-256 of the source the active run signed, or null. */
export function signedSha(project: Project | null): string | null {
  return (
    str(project?.auditMetadata?.inputFingerprint?.sha256) ??
    str((project as { inputFingerprint?: { sha256?: unknown } } | null)?.inputFingerprint?.sha256)
  );
}

/**
 * The requirements specification as `GET /api/projects/{id}/requirements-spec`
 * answers it, counted by kind: accepted, and proposed (draft or needs
 * clarification). Rejected requirements count as neither.
 */
export function specOfRecord(record: unknown, project: Project | null): ChainSpec | null {
  if (!record || typeof record !== 'object') return null;
  const r = record as { spec?: { requirements?: unknown }; revision?: unknown; savedAt?: unknown; derivedFrom?: unknown };
  const reqs = Array.isArray(r.spec?.requirements) ? (r.spec!.requirements as Array<Record<string, unknown>>) : [];
  const count = (kind: string) => {
    const of = reqs.filter((q) => q.kind === kind);
    return {
      accepted: of.filter((q) => q.status === 'accepted').length,
      proposed: of.filter((q) => q.status === 'draft' || q.status === 'clarify').length,
    };
  };
  const sha = signedSha(project);
  return {
    functional: count('functional'),
    nonFunctional: count('non-functional'),
    revision: typeof r.revision === 'number' ? r.revision : 0,
    savedAt: str(r.savedAt),
    stale: !sha || r.derivedFrom !== sha,
  };
}

/** The model's NFR proposals stored with the design, by topic (`projects/{id}.nonFunctionalRequirements`). */
export function nfrProposalCount(project: Project | null): number {
  const v = (project as { nonFunctionalRequirements?: unknown } | null)?.nonFunctionalRequirements;
  if (!v || typeof v !== 'object') return 0;
  return Object.values(v as Record<string, unknown>).filter((x) => typeof x === 'string' && x.trim()).length;
}

/** The rule register's decided and open counts, from its rows. A Clarify is a question, and open. */
export function ruleTally(rows: readonly RuleRow[]): { keep: number; change: number; drop: number; open: number; total: number; revision: number | null } {
  let keep = 0;
  let change = 0;
  let drop = 0;
  let revision: number | null = null;
  for (const r of rows) {
    if (r.answer === 'keep') keep += 1;
    else if (r.answer === 'change') change += 1;
    else if (r.answer === 'drop') drop += 1;
    if (typeof r.revision === 'number' && (revision === null || r.revision > revision)) revision = r.revision;
  }
  return { keep, change, drop, open: rows.length - keep - change - drop, total: rows.length, revision };
}

/** The decision record stored on the project (`data.decision`), read defensively. */
export function decisionOf(project: Project | null): { id: string; revision: number; summary: string | null; confirmedAt: string | null } | null {
  const d = (project as { decision?: unknown } | null)?.decision;
  if (!d || typeof d !== 'object') return null;
  const r = d as Record<string, unknown>;
  const id = str(r.decisionId);
  const revision = typeof r.revision === 'number' ? r.revision : null;
  if (!id || revision === null) return null;
  const confirmation = r.confirmation && typeof r.confirmation === 'object' ? (r.confirmation as Record<string, unknown>) : null;
  return { id, revision, summary: str(r.summary), confirmedAt: confirmation ? str(confirmation.at) : null };
}

/**
 * The purpose sentence of the PLATFORM KNOWLEDGE block — the line the prompt
 * carries under "C. WHAT THE PROGRAM DOES". `null` when the block has none.
 */
export function purposeFromContext(text: string | null | undefined): string | null {
  const m = /^\s*Purpose:\s*(.+)$/m.exec(String(text ?? ''));
  return m ? m[1].trim() : null;
}

/** "Side-by-side (CAP)" / "In-app (RAP)" — the route the project is generated for. */
function routeLabel(project: Project | null): string | null {
  const arch = project?.approvedByArchitect === true ? project?.targetArchitecture : (project?.originalRecommendation ?? project?.targetArchitecture);
  if (arch === 'cap') return 'Side-by-side (CAP)';
  if (arch === 'rap') return 'In-app (RAP)';
  const route = str(project?.extensibilityRoute);
  if (!route) return null;
  return /side|btp|cap/i.test(route) ? 'Side-by-side (CAP)' : 'In-app (RAP)';
}

function insightsSlot(inputs: ChainInputs): ChainSlot {
  const source = { label: M['transformation.link.insights'], href: toolHref(inputs, 'analyze', 'analyze-in-short-title') };
  const d = day(inputs.project?.createdAt);
  const shell = { key: 'first-insights' as const, phase: 'analyze' as const, title: M['transformation.slot.insights'], source, when: d ? `run of ${d}` : null };
  const p = inputs.purpose;
  if (p.state === 'loading') return { ...shell, state: 'loading', facts: [], warn: null };
  if (p.state === 'unread') return { ...shell, state: 'unread', facts: [fact('purpose', p.reason, 'not-determined', PROMPT_READS.purpose)], warn: null };
  if (!p.text) {
    return { ...shell, state: 'missing', facts: [fact('purpose', M['transformation.insights.noPurpose'], 'not-determined', PROMPT_READS.purpose)], warn: null };
  }
  return { ...shell, state: 'ready', facts: [fact('purpose', `What it is for: ${p.text}`, 'reconstructed', PROMPT_READS.purpose)], warn: null };
}

function analyzeSlot(inputs: ChainInputs): ChainSlot {
  const { project } = inputs;
  const source = { label: M['transformation.link.analyze'], href: toolHref(inputs, 'analyze') };
  const d = day(project?.createdAt);
  const shell = { key: 'analyze' as const, phase: 'analyze' as const, title: M['transformation.slot.analyze'], source, when: d ? `signed run ${d}` : null };
  if (!str(project?.activeRunId)) {
    return { ...shell, state: 'missing', facts: [], warn: { text: M['transformation.warn.noRun'], fix: { label: M['transformation.fix.runAnalysis'], href: source.href } } };
  }
  const ev = inputs.evidence;
  if (ev.state === 'loading') return { ...shell, state: 'loading', facts: [], warn: null };
  const score = typeof project?.cleanCoreScore === 'number' ? `Clean Core Score ${project.cleanCoreScore}` : 'Clean Core Score not on record';
  if (ev.state === 'failed') {
    return { ...shell, state: 'unread', facts: [fact('score', score, 'reconstructed', PROMPT_READS.analysis)], warn: null };
  }
  const successors = successorCount(ev.findings);
  const facts = [
    fact('score', `${score} · ${plural(ev.findings.length, 'finding')}`, 'reconstructed', PROMPT_READS.analysis),
    fact('successors', `${plural(successors, 'released SAP successor')} for the objects it uses`, 'imported', PROMPT_READS.successors),
  ];
  const s = staleness(project);
  const moved = s.sourceChanged || s.unverifiedInputs.length > 0;
  return { ...shell, state: 'ready', facts, warn: moved ? { text: M['transformation.warn.runMoved'], fix: { label: M['transformation.fix.runAnalysis'], href: source.href } } : null };
}

function rulesSlot(inputs: ChainInputs): ChainSlot {
  const href = choice(inputs, 'business.rules');
  const source = { label: M['transformation.link.rules'], href };
  const shell = { key: 'business-rules' as const, phase: 'analyze' as const, title: M['transformation.slot.rules'], source };
  if (inputs.rules.state === 'loading') return { ...shell, state: 'loading', facts: [], when: null, warn: null };
  const reg = inputs.rules.register;
  if (reg.state === 'not-read') {
    return { ...shell, state: 'unread', facts: [fact('none', reg.reason, 'not-determined', PROMPT_READS.rules)], when: null, warn: null };
  }
  if (reg.state === 'not-detected') {
    return { ...shell, state: 'ready', facts: [fact('none', M['transformation.rules.none'], 'reconstructed', PROMPT_READS.rules)], when: null, warn: null };
  }
  const t = ruleTally(reg.rows);
  const decided = t.keep + t.change + t.drop;
  const facts: ChainFact[] = [
    decided > 0
      ? fact('decided', `${plural(t.total, 'rule')} — ${n(decided)} decided by you: ${n(t.keep)} keep, ${n(t.change)} change, ${n(t.drop)} drop`, 'confirmed', PROMPT_READS.ruleDecisions)
      : fact('decided', `${plural(t.total, 'rule')} — none decided yet`, 'reconstructed', PROMPT_READS.rules),
  ];
  if (t.open > 0) facts.push(fact('open', `${n(t.open)} open — implemented as the original and marked open`, 'not-determined', PROMPT_READS.rules));
  return {
    ...shell,
    state: 'ready',
    facts,
    when: t.revision !== null ? `need revision ${t.revision}` : null,
    warn: t.open > 0 ? { text: t.open === 1 ? 'One rule has no decision yet.' : `${n(t.open)} rules have no decision yet.`, fix: { label: M['transformation.fix.rules'], href } } : null,
  };
}

function designSlot(inputs: ChainInputs): ChainSlot {
  const { project } = inputs;
  const href = toolHref(inputs, 'design');
  const source = { label: M['transformation.link.design'], href };
  const shell = { key: 'design' as const, phase: 'design' as const, title: M['transformation.slot.design'], source };
  if (!str(project?.solutionDesign)) {
    return { ...shell, state: 'missing', facts: [], when: null, warn: { text: M['transformation.design.none'], fix: { label: M['transformation.fix.design'], href } } };
  }
  const s = staleness(project);
  const confirmed = project?.approvedByArchitect === true && !s.signOff;
  const route = routeLabel(project);
  const reason = str(project?.architectJustifiedOverride) ?? str(project?.recommendationJustification);
  const facts: ChainFact[] = [];
  if (route) {
    facts.push(fact('target', `Target: ${route}${reason ? ` — reason: ${reason}` : ''}`, confirmed ? 'confirmed' : 'proposed', PROMPT_READS.target));
  }
  facts.push(fact('document', M['transformation.design.document'], 'proposed', PROMPT_READS.design));
  const stale = s.design || s.signOff;
  const warn = stale
    ? { text: M['transformation.warn.designStale'], fix: { label: M['transformation.fix.design'], href } }
    : !confirmed
      ? { text: M['transformation.warn.targetOpen'], fix: { label: M['transformation.fix.target'], href: choice(inputs, 'design.target-signoff') } }
      : null;
  const signed = confirmed ? day(project?.architectSignOffAt) : null;
  return { ...shell, state: 'ready', facts, when: signed ? `target confirmed ${signed}` : null, warn };
}

function requirementsSlot(inputs: ChainInputs): ChainSlot {
  const href = toolHref(inputs, 'design/requirements');
  const source = { label: M['transformation.link.requirements'], href };
  const shell = { key: 'requirements' as const, phase: 'design' as const, title: M['transformation.slot.requirements'], source };
  if (inputs.spec.state === 'loading') return { ...shell, state: 'loading', facts: [], when: null, warn: null };
  if (inputs.spec.state === 'unread') return { ...shell, state: 'unread', facts: [], when: null, warn: null };
  const spec = inputs.spec.spec;
  const proposals = nfrProposalCount(inputs.project);
  if (!spec) {
    const facts = proposals > 0 ? [fact('nfr', `${plural(proposals, 'non-functional proposal')} from the design model`, 'proposed', PROMPT_READS.requirements)] : [];
    return { ...shell, state: 'missing', facts, when: null, warn: { text: M['transformation.requirements.none'], fix: { label: M['transformation.fix.requirementsStart'], href } } };
  }
  const f = spec.functional;
  const nf = spec.nonFunctional;
  const facts = [
    fact('functional', `${plural(f.accepted + f.proposed, 'functional requirement')} — ${n(f.accepted)} accepted, ${n(f.proposed)} proposed`, f.accepted > 0 ? 'confirmed' : 'proposed', PROMPT_READS.requirements),
    fact('non-functional', `${plural(nf.accepted + nf.proposed, 'non-functional requirement')} — ${n(nf.accepted)} accepted, ${n(nf.proposed)} proposed`, nf.accepted > 0 ? 'confirmed' : 'proposed', PROMPT_READS.requirements),
  ];
  const open = f.proposed + nf.proposed;
  const warn = spec.stale
    ? { text: M['transformation.warn.requirementsStale'], fix: { label: M['transformation.fix.requirements'], href } }
    : open > 0
      ? {
          text: open === 1 ? 'One requirement is still a proposal.' : `${n(open)} requirements are still proposals.`,
          fix: { label: M['transformation.fix.requirements'], href: toolHref(inputs, 'design/requirements', f.proposed > 0 ? 'spec-s3' : 'spec-s4') },
        }
      : null;
  return { ...shell, state: 'ready', facts, when: `revision ${spec.revision}`, warn };
}

function decisionSlot(inputs: ChainInputs): ChainSlot {
  const d = decisionOf(inputs.project);
  const href = choice(inputs, 'management.options');
  const source = { label: M['transformation.link.decision'], href: choice(inputs, 'management.confirm') };
  const shell = { key: 'decision-record' as const, phase: 'design' as const, title: M['transformation.slot.decision'], source };
  if (!d) {
    return { ...shell, state: 'missing', facts: [], when: null, warn: { text: M['transformation.warn.noDecision'], fix: { label: M['transformation.fix.decision'], href } } };
  }
  const confirmed = d.confirmedAt !== null;
  const text = d.summary ? `${d.id}, revision ${n(d.revision)}: ${d.summary}` : `${d.id}, revision ${n(d.revision)}`;
  return {
    ...shell,
    state: 'ready',
    facts: [fact('record', text, confirmed ? 'confirmed' : 'proposed', PROMPT_READS.decision)],
    when: confirmed ? `confirmed ${day(d.confirmedAt) ?? ''}`.trim() : null,
    warn: confirmed ? null : { text: M['transformation.warn.decisionOpen'], fix: { label: M['transformation.fix.decision'], href } },
  };
}

/** The chain, in workflow order — only the phases before Transformation. */
export function chainSlots(inputs: ChainInputs): ChainSlot[] {
  const build: Record<ChainSlotKey, () => ChainSlot> = {
    'first-insights': () => insightsSlot(inputs),
    analyze: () => analyzeSlot(inputs),
    'business-rules': () => rulesSlot(inputs),
    design: () => designSlot(inputs),
    requirements: () => requirementsSlot(inputs),
    'decision-record': () => decisionSlot(inputs),
  };
  return CHAIN_SLOTS.filter((s) => CHAIN_PHASES.includes(s.phase)).map((s) => build[s.key]());
}

/* --------------------------------------------------------------- the tips */

export type QualityTipKey = 'rules' | 'requirements' | 'non-functional' | 'target' | 'decision';

export interface QualityTip {
  key: QualityTipKey;
  /** The design's numbering (§14.2): 1 changes the code most. */
  rank: number;
  /** The real count from this project, for the badge; `null` while it is being read or where there is none. */
  count: number | null;
  /** "Decide the 62 open rules". */
  title: string;
  /** What it does to the generated code, positively. */
  impact: string;
  /** "In the code: …" — what changes, as the prompt carries it today. */
  inCode: string;
  link: ChainLink;
  /** Whether the prompt reads what the tip changes (`PROMPT_READS`). */
  read: boolean;
}

type TipInputs = Pick<ChainInputs, 'projectId' | 'project' | 'view' | 'rules' | 'spec' | 'origin'>;

/**
 * The tips, by impact; empty when nothing open changes what the generation
 * uses. A tip that would not change it is not shown (design §14.2). The
 * design's first tip — a design older than the latest run — is not one here:
 * a design built for a previous source blocks the stage (`generationBlockers`)
 * and the stage says so, and no date tells a design written before a re-run
 * of the same source (the design store records none).
 */
export function qualityTips(inputs: TipInputs): QualityTip[] {
  const { project } = inputs;
  if (!project) return [];
  const tips: QualityTip[] = [];
  const rulesHref = choice(inputs, 'business.rules');

  // 2 — the rules.
  if (inputs.rules.state === 'loading') {
    tips.push({
      key: 'rules', rank: 2, count: null,
      title: M['transformation.tip.rules.titleLoading'],
      impact: M['transformation.tip.rules.impact'],
      inCode: M['transformation.tip.rules.inCode'],
      link: { label: M['transformation.fix.rules'], href: rulesHref },
      read: PROMPT_READS.ruleDecisions,
    });
  } else if (inputs.rules.register.state === 'read') {
    const t = ruleTally(inputs.rules.register.rows);
    if (t.open > 0) {
      tips.push({
        key: 'rules', rank: 2, count: t.open,
        title: t.open === 1 ? 'Decide the open rule' : `Decide the ${n(t.open)} open rules`,
        impact: M['transformation.tip.rules.impact'],
        inCode: M['transformation.tip.rules.inCode'],
        link: { label: M['transformation.fix.rules'], href: rulesHref },
        read: PROMPT_READS.ruleDecisions,
      });
    }
  }

  // 3, 4 — the requirements (ADR-078). Without a specification the model's
  // NFR proposals are what the prompt carries; with one, its accepted ones.
  if (inputs.spec.state === 'ready') {
    const spec = inputs.spec.spec;
    if (!spec) {
      tips.push({
        key: 'requirements', rank: 3, count: null,
        title: M['transformation.tip.requirementsStart.title'],
        impact: M['transformation.tip.requirementsStart.impact'],
        inCode: M['transformation.tip.requirements.inCode'],
        link: { label: M['transformation.fix.requirementsStart'], href: toolHref(inputs, 'design/requirements') },
        read: PROMPT_READS.requirements,
      });
    } else {
      if (spec.functional.proposed > 0) {
        const c = spec.functional.proposed;
        tips.push({
          key: 'requirements', rank: 3, count: c,
          title: c === 1 ? 'Accept the proposed requirement' : `Accept the ${n(c)} proposed requirements`,
          impact: M['transformation.tip.requirements.impact'],
          inCode: M['transformation.tip.requirements.inCode'],
          link: { label: M['transformation.fix.requirements'], href: toolHref(inputs, 'design/requirements', 'spec-s3') },
          read: PROMPT_READS.requirements,
        });
      }
      if (spec.nonFunctional.proposed > 0) {
        const c = spec.nonFunctional.proposed;
        tips.push({
          key: 'non-functional', rank: 4, count: c,
          title: c === 1 ? 'Accept the proposed non-functional requirement' : `Accept the ${n(c)} proposed non-functional requirements`,
          impact: M['transformation.tip.nfr.impact'],
          inCode: M['transformation.tip.nfr.inCode'],
          link: { label: M['transformation.fix.requirements'], href: choice(inputs, 'requirements.nfr-questions') },
          read: PROMPT_READS.requirements,
        });
      }
    }
  }

  // 5 — the target. A sign-off given for a previous source is a blocker the
  // stage already says, never a tip as well.
  const s = staleness(project);
  if (str(project.solutionDesign) && project.approvedByArchitect !== true && !s.signOff) {
    tips.push({
      key: 'target', rank: 5, count: 1,
      title: M['transformation.tip.target.title'],
      impact: M['transformation.tip.target.impact'],
      inCode: M['transformation.tip.target.inCode'],
      link: { label: M['transformation.fix.target'], href: choice(inputs, 'design.target-signoff') },
      read: PROMPT_READS.target,
    });
  }

  // 6 — the decision record.
  const d = decisionOf(project);
  if (!d || !d.confirmedAt) {
    tips.push({
      key: 'decision', rank: 6, count: 1,
      title: M['transformation.tip.decision.title'],
      impact: M['transformation.tip.decision.impact'],
      inCode: M['transformation.tip.decision.inCode'],
      link: { label: M['transformation.fix.decision'], href: choice(inputs, 'management.options') },
      read: PROMPT_READS.decision,
    });
  }

  return tips.sort((a, z) => a.rank - z.rank);
}

/* ------------------------------------------------- the decision warning */

/**
 * A highlighted, never blocking warning above the tips (owner, 12.10.2026:
 * no rebuild gate — the decision stays the reader's). It says plainly when a
 * generation would go against the decision on record, or when nothing on
 * record has weighed SAP standard against a rebuild yet:
 *
 *   - `against-decision` — a live decision record whose option is retire,
 *     keep or move to SAP standard. The record is read exactly as the
 *     PLATFORM KNOWLEDGE block reads it (`recordedDecisionOf`), so the
 *     prompt's "DRAFT AGAINST THE DECISION ON RECORD" and this line agree.
 *   - `standard-fit-open` — no live record names an option. The router never
 *     assesses whether SAP standard already covers the need (architecture
 *     contract limit `standard-fit-not-assessed`); the decision record is
 *     where a reader weighs it. A live record that chose rebuild has.
 *
 * "Generate now" stays; the page does not start a generation by itself while
 * the warning shows.
 */
export type DecisionWarning =
  | { kind: 'against-decision'; option: 'retire' | 'keep' | 'standard'; recordId: string; text: string; link: ChainLink }
  | { kind: 'standard-fit-open'; text: string; link: ChainLink };

const AGAINST_TEXT: Record<'retire' | 'keep' | 'standard', string> = {
  retire: M['transformation.warnDecision.retire'],
  keep: M['transformation.warnDecision.keep'],
  standard: M['transformation.warnDecision.standard'],
};

export function decisionWarning(inputs: Pick<ChainInputs, 'projectId' | 'project' | 'view' | 'origin'>): DecisionWarning | null {
  if (!inputs.project) return null;
  const record = recordedDecisionOf((inputs.project as { decision?: unknown }).decision);
  const live = decisionRecordIsLive(record) ? record : null;
  if (live && live.optionKind && live.optionKind !== 'rebuild') {
    return {
      kind: 'against-decision',
      option: live.optionKind,
      recordId: live.id,
      text: AGAINST_TEXT[live.optionKind],
      link: { label: M['transformation.warnDecision.openDecision'], href: choice(inputs, 'management.confirm') },
    };
  }
  if (live && live.optionKind === 'rebuild') return null;
  return {
    kind: 'standard-fit-open',
    text: M['transformation.warnDecision.standardFitOpen'],
    link: { label: M['transformation.warnDecision.checkStandardFit'], href: choice(inputs, 'it.standard-fit') },
  };
}

/** Whether every count of the tips has been read, so "nothing open" can be said — and acted on. */
export function tipsSettled(inputs: Pick<ChainInputs, 'rules' | 'spec'>): boolean {
  return inputs.rules.state === 'ready' && inputs.spec.state !== 'loading';
}

/* ------------------------------------------------------------- the stages */

/**
 * The generation's own steps after the chain, in the order they happen — the
 * ones that exist today, and only those. A later step is one more key here.
 * The contract and the PLATFORM KNOWLEDGE block are read first; that read is
 * what lights the chain, so it is not a step of its own.
 */
export const GENERATION_STAGE_ORDER = ['facts', 'model', 'checks', 'storing'] as const;
export type GenerationStageKey = (typeof GENERATION_STAGE_ORDER)[number];

export type GenerationStageState = 'pending' | 'active' | 'done' | 'failed';
export type GenerationCheckState = 'pending' | 'met' | 'warning' | 'failed';

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
  /** What the stage established — "14 checks that refuse, stop or skip …". */
  facts?: string[];
  /** What the reader should know while it runs — "Retrying once …". Shown, never announced. */
  detail?: string;
  checks?: GenerationCheck[];
}

export type GenerationStageLog = Partial<Record<GenerationStageKey, GenerationStageRecord>>;

export interface GenerationStage extends GenerationStageRecord {
  key: GenerationStageKey;
  label: string;
  /** "no model", "one answer" — the stage's own short note. */
  note: string;
  provenance: ProvenanceValue;
}

const STAGE_META: Record<GenerationStageKey, { label: string; note: string; provenance: ProvenanceValue }> = {
  facts: { label: M['transformation.stage.facts'], note: M['transformation.stage.factsNote'], provenance: 'reconstructed' },
  model: { label: M['transformation.stage.model'], note: M['transformation.stage.modelNote'], provenance: 'proposed' },
  checks: { label: M['transformation.stage.checks'], note: M['transformation.stage.checksNote'], provenance: 'reconstructed' },
  storing: { label: M['transformation.stage.storing'], note: M['transformation.stage.storingNote'], provenance: 'reconstructed' },
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

/** Add what a stage established. */
export function withFacts(log: GenerationStageLog, key: GenerationStageKey, facts: string[]): GenerationStageLog {
  const r = log[key] ?? { state: 'pending' as const, startedAt: null, endedAt: null };
  return { ...log, [key]: { ...r, facts } };
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
    return { key, ...STAGE_META[key], ...r };
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

/** What the engine read of the original for the prompt — the facts stage's lines. */
export function originalFactsLines(contract: { guards: readonly unknown[]; decimals: readonly unknown[]; inputs: readonly unknown[] } | null): string[] {
  if (!contract) return [M['transformation.stage.factsUnread']];
  return [
    `${plural(contract.guards.length, 'check')} that refuse, stop or skip — kept with their lines`,
    `${plural(contract.decimals.length, 'packed decimal field')} with exact places and bounds`,
    `${plural(contract.inputs.length, 'selection input')} — each honoured or refused`,
  ];
}
