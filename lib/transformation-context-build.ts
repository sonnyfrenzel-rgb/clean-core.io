import type { Firestore } from 'firebase-admin/firestore';
import { deriveBusinessRules, type BusinessRuleSet } from '@/lib/abap/business-rule-set';
import type { AbapEvidenceReport } from '@/lib/abap/evidence-model';
import { gradeSapObject } from '@/lib/abap/catalog-service';
import { isCustomerObject } from '@/lib/abap/abcd-classification';
import type { ArchitectureContract } from '@/lib/architecture-contract';
import { sha256Hex } from '@/lib/artefact-digest';
import { programSummaryFactsOf } from '@/lib/program-summary-facts';
import { programSummary, type ProgramSummaryFacts } from '@/lib/program-summary-text';
import {
  PROCESS_STATE_COLLECTION,
  PROCESS_STATE_FORMAT_VERSION,
  isStateEntry,
  readProcessStates,
  type StateEntry,
} from '@/lib/process-states';
import { MAX_RULE_READ_BYTES } from '@/lib/rule-register';
import { NFR_CATEGORIES, NFR_CATEGORY_LABEL, NFR_MODEL_KEY, type NFRData } from '@/lib/non-functional-requirements';
import { referencePatternLine, SAP_REFERENCE_ARCHITECTURES } from '@/lib/sap-reference-architectures';
import type { TargetArchitectureCode } from '@/lib/project-commands';
import {
  buildTransformationContext,
  decisionOptionOf,
  type ContextDecision,
  type ContextObject,
  type ContextRule,
  type ContextRules,
  type ContextSummary,
  type TransformationContext,
} from '@/lib/transformation-context';

/**
 * The server's half of the PLATFORM KNOWLEDGE block (owner, 12.10.2026;
 * roadmap 3.0.12): what the contract route already holds — the project, the
 * engine's evidence of the contract it just built — plus the owner's rule
 * answers, read in one query beside revision 1 of the process.
 *
 * **Speed.** Nothing here builds the BPMN map: the rules come from
 * `deriveBusinessRules` (the rule register's own reader, bounded by
 * `MAX_RULE_READ_BYTES`), the summary facts from `programSummaryFactsOf` with
 * that rule set handed in, the evidence from the contract build the route has
 * already made. The route builds the block only for a generation
 * (`?for=generation`), never for the IT rail or the Design stage, which read
 * the same route for the contract alone.
 *
 * **The token.** `stamp.rules` and `stamp.decision` are revisions of what the
 * owner decided, and `stamp.text` is the block itself: all three enter the
 * generation token (`lib/generation-revision.ts`), so a rule answered or a
 * decision recorded in another tab while the model runs turns the store into
 * `generation-stale` instead of storing code written against the old answers.
 */

/** What the generation token covers of the block. */
export interface TransformationContextStamp {
  text: string;
  /** Revision of the rule answers: basis, need revision and a digest of the answers applied. */
  rules: string;
  /** Revision of the decision: the stored record and the architecture sign-off. */
  decision: string;
}

/** What `readRuleAnswers` found: the answers to apply, and on what they rest. */
export interface RuleAnswers {
  basis: 'confirmations' | 'source' | 'source-moved';
  revision: number | null;
  entries: StateEntry[];
}

/**
 * `PROCESS_REVISION_COLLECTION` of `lib/process-revisions.ts`, written out:
 * that module imports the BPMN parser, and the block must not load the map
 * (tests/transformation-context.spec.ts holds both).
 */
export const REVISION_COLLECTION = 'process_revisions';

const isoOf = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  const maybe = value as { toDate?: () => Date } | null;
  return maybe && typeof maybe.toDate === 'function' ? maybe.toDate().toISOString() : '';
};

/**
 * The owner's rule answers — the newest need revision, read as
 * `process-states` reads it, and revision 1 of the process to check the
 * answers were given against this source. Two reads, in parallel.
 */
export async function readRuleAnswers(db: Firestore, projectId: string, source: string): Promise<RuleAnswers> {
  const project = db.collection('projects').doc(projectId);
  const [baseline, latest] = await Promise.all([
    project.collection(REVISION_COLLECTION).doc('1').get(),
    project.collection(PROCESS_STATE_COLLECTION).orderBy('revision', 'desc').limit(1).get(),
  ]);
  if (!baseline.exists) return { basis: 'source', revision: null, entries: [] };
  const sourceSha = (baseline.data() as { sourceSha256?: unknown } | undefined)?.sourceSha256;
  if (typeof sourceSha !== 'string' || sourceSha !== sha256Hex(source)) {
    return { basis: 'source-moved', revision: null, entries: [] };
  }
  if (latest.empty) return { basis: 'confirmations', revision: 0, entries: [] };
  const data = (latest.docs[0].data() || {}) as Record<string, unknown>;
  if (data.formatVersion !== PROCESS_STATE_FORMAT_VERSION) return { basis: 'confirmations', revision: 0, entries: [] };
  const raw = Array.isArray(data.entries) ? data.entries : [];
  return {
    basis: 'confirmations',
    revision: typeof data.revision === 'number' ? data.revision : 0,
    entries: raw
      .map((e) => ({ ...(e as Record<string, unknown>), confirmedAt: isoOf((e as Record<string, unknown>).confirmedAt) }))
      .filter(isStateEntry) as StateEntry[],
  };
}

/* ------------------------------------------------------------------ pieces */

function rulesOf(set: BusinessRuleSet | null, answers: RuleAnswers, reason: string | null): ContextRules {
  if (!set) return { basis: 'not-read', revision: null, reason, items: [] };
  if (set.rules.length === 0) return { basis: 'not-detected', revision: null, items: [] };
  const read = readProcessStates(answers.entries, { elements: [], rules: set.rules.map((r) => r.id) });
  const items: ContextRule[] = set.rules.map((rule) => {
    const e = read.bySubject[rule.id] ?? null;
    const first = rule.sentences.find((s) => s.anchors.length > 0)?.anchors[0];
    return {
      id: rule.id,
      condition: rule.label,
      meaning: rule.text,
      answer: e ? e.state : null,
      note: e?.note ?? null,
      line: first ? first.lineStart : null,
    };
  });
  return { basis: answers.basis, revision: answers.revision, items };
}

const OUTPUT_WORDS: Array<[keyof ProgramSummaryFacts['outputs'], string]> = [
  ['list', 'list on screen'],
  ['screen', 'screen of its own'],
  ['fileOut', 'file download to the PC'],
  ['fileIn', 'file upload from the PC'],
  ['serverIn', 'file read on the application server'],
  ['serverOut', 'file written on the application server'],
  ['print', 'print'],
  ['mail', 'mail'],
];

export function contextSummaryOf(facts: ProgramSummaryFacts): ContextSummary {
  const summary = programSummary(facts);
  const named = (word: string | null, name: string) => (word ? `${word} (${name})` : name);
  const unique = (items: string[]) => [...new Set(items)];
  const reads = unique(facts.reads.filter((r) => r.kind === 'business' || r.kind === 'custom').map((r) => named(r.word, r.name)));
  const writeWord = (w: { word: string | null; name: string }) => `writes ${named(w.word, w.name)}`;
  const actionWord = (a: ProgramSummaryFacts['changes']['actions'][number]) =>
    `${a.word} (${a.name}${a.via === 'simulated-entry' ? ', by simulated entry' : ''})`;
  return {
    program: facts.program,
    purpose: summary.lines.filter((l) => l.key === 'purpose').map((l) => l.text),
    reads,
    changes: facts.changes.state,
    changesInFlow: unique([
      ...facts.writes.filter((w) => !w.onCommand).map(writeWord),
      ...facts.changes.actions.filter((a) => !a.onCommand).map(actionWord),
    ]),
    changesOnCommand: unique([
      ...facts.writes.filter((w) => w.onCommand).map(writeWord),
      ...facts.changes.actions.filter((a) => a.onCommand).map(actionWord),
    ]),
    outputs: OUTPUT_WORDS.filter(([key]) => typeof facts.outputs[key] === 'number').map(([key, word]) => `${word} (L${facts.outputs[key]})`),
    frontEnd: facts.frontEnd ?? null,
  };
}

/**
 * The SAP objects the engine's findings name, with the successor the catalog
 * names and the clean core level. Customer objects (Z/Y) have no SAP
 * successor and are left out; the grade is a name lookup in the synced
 * catalog (`gradeSapObject`), never part of anything signed.
 */
export function contextObjectsOf(
  evidence: Pick<AbapEvidenceReport, 'findings'>,
  grade: (name: string) => string | null,
): ContextObject[] {
  const byName = new Map<string, ContextObject>();
  for (const f of evidence.findings) {
    const name = (f.objectName ?? '').toUpperCase().trim();
    if (!name || isCustomerObject(name) || !/^[A-Z0-9_/]+$/.test(name)) continue;
    const held = byName.get(name);
    const rep = f.sapReplacement;
    if (held && (held.successor || !rep)) continue;
    byName.set(name, {
      object: name,
      level: held?.level ?? grade(name),
      successor: rep?.objectName ?? null,
      successorType: rep?.objectType ?? null,
      confidence: rep?.confidence ?? null,
    });
  }
  return [...byName.values()].sort((a, b) => Number(!a.successor) - Number(!b.successor) || a.object.localeCompare(b.object));
}

const ROUTE_CODE: Record<ContextDecision['route']['chosen'], TargetArchitectureCode> = {
  'in-app-rap': 'rap',
  'side-by-side-cap': 'cap',
};

/** The reference pattern line for the target, with the RA titles it rests on. */
export function referenceLineOf(code: TargetArchitectureCode): string {
  const line = referencePatternLine(code);
  const titles = line.ras.map((ra) => `${ra} ${SAP_REFERENCE_ARCHITECTURES[ra].title}`);
  return titles.length ? `${line.text.replace(/\.$/, '')} (${titles.join('; ')}).` : line.text;
}

interface StoredDecision {
  decisionId?: unknown;
  revision?: unknown;
  status?: unknown;
  summary?: unknown;
  fingerprint?: unknown;
  bindings?: unknown;
}

function decisionOf(project: Record<string, unknown>, contract: ArchitectureContract): ContextDecision {
  const stored = (project.decision && typeof project.decision === 'object' ? project.decision : null) as StoredDecision | null;
  let record: ContextDecision['record'] = null;
  if (stored && typeof stored.decisionId === 'string' && typeof stored.revision === 'number') {
    const bindings = Array.isArray(stored.bindings) ? (stored.bindings as Array<{ key?: unknown; revision?: unknown }>) : [];
    const option = bindings.find((b) => b && b.key === 'option');
    const optionText = option && typeof option.revision === 'string' ? option.revision : null;
    record = {
      id: stored.decisionId,
      revision: stored.revision,
      status: typeof stored.status === 'string' ? stored.status : 'draft',
      summary: typeof stored.summary === 'string' ? stored.summary : '',
      option: optionText,
      optionKind: decisionOptionOf(optionText),
    };
  }
  const signedOff =
    project.approvedByArchitect === true && typeof project.targetArchitecture === 'string' ? project.targetArchitecture : null;
  return {
    route: {
      chosen: contract.route.chosen,
      recommended: contract.route.recommended,
      deviationReason: contract.route.deviation?.reason ?? null,
    },
    record,
    signedOff,
    reference: referenceLineOf(ROUTE_CODE[contract.route.chosen]),
  };
}

function nfrOf(project: Record<string, unknown>): Array<{ topic: string; text: string }> | null {
  const data = project.nonFunctionalRequirements as NFRData | null | undefined;
  if (!data || typeof data !== 'object') return null;
  const out: Array<{ topic: string; text: string }> = [];
  for (const category of NFR_CATEGORIES) {
    const text = data[NFR_MODEL_KEY[category]];
    if (typeof text === 'string' && text.trim()) out.push({ topic: NFR_CATEGORY_LABEL[category], text });
  }
  return out.length ? out : null;
}

/** The digest of the decision as the block reads it — record and sign-off, nothing the block does not show. */
function decisionStamp(project: Record<string, unknown>): string {
  const stored = (project.decision && typeof project.decision === 'object' ? project.decision : null) as StoredDecision | null;
  return sha256Hex(
    JSON.stringify([
      stored ? stored.decisionId ?? null : null,
      stored ? stored.revision ?? null : null,
      stored ? stored.status ?? null : null,
      stored ? stored.fingerprint ?? null : null,
      project.targetArchitecture ?? null,
      project.approvedByArchitect === true,
      typeof project.architectJustifiedOverride === 'string' ? project.architectJustifiedOverride : null,
    ]),
  ).slice(0, 16);
}

/** The digest of the rule answers the block applies. */
function rulesStamp(rules: ContextRules): string {
  const applied = rules.items.map((r) => [r.id, r.answer, r.note]);
  return `${rules.basis}:r${rules.revision ?? 0}:${sha256Hex(JSON.stringify(applied)).slice(0, 16)}`;
}

export interface AssembleArgs {
  source: string;
  project: Record<string, unknown>;
  answers: RuleAnswers;
  evidence: Pick<AbapEvidenceReport, 'findings'>;
  contract: ArchitectureContract;
  isAbapCloud: boolean;
  /** The project's catalog snapshot key, for the level lookup. */
  catalogSnapshot?: string;
  /** Override for tests: the level of an object, or null. */
  grade?: (name: string) => string | null;
}

/**
 * The block and its stamp, from what the route has in hand. Synchronous and
 * Firestore-free — `readRuleAnswers` is the one read, made before.
 */
export function assembleTransformationContext(args: AssembleArgs): { context: TransformationContext; stamp: TransformationContextStamp } {
  const { source } = args;
  let set: BusinessRuleSet | null = null;
  let reason: string | null = null;
  if (new TextEncoder().encode(source).length > MAX_RULE_READ_BYTES) {
    reason = 'the source is too large for the rule reader';
  } else {
    try {
      set = deriveBusinessRules(source);
    } catch {
      reason = 'the rule reader could not walk the source';
    }
  }
  let summary: ContextSummary | null = null;
  try {
    summary = contextSummaryOf(programSummaryFactsOf(source, set ? { ruleSet: set } : {}));
  } catch {
    summary = null;
  }
  const grade =
    args.grade ??
    ((name: string) => {
      const g = gradeSapObject(name, args.catalogSnapshot).grade;
      return g === 'Unknown' ? null : g;
    });
  const rules = rulesOf(set, args.answers, reason);
  const context = buildTransformationContext({
    track: args.isAbapCloud ? 'rap' : 'node',
    rules,
    decision: decisionOf(args.project, args.contract),
    summary,
    objects: contextObjectsOf(args.evidence, grade),
    nfr: nfrOf(args.project),
    // No run records a data mode today (`lib/delivery-package.ts`, dataMode).
    dataMode: null,
    originalFactsBelow: !args.isAbapCloud,
  });
  return {
    context,
    stamp: { text: context.text, rules: rulesStamp(rules), decision: decisionStamp(args.project) },
  };
}
