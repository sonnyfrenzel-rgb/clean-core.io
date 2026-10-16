import { capabilityPresence, isAbsent, readCapabilityFacts, type CapabilityFacts } from '@/lib/documentation-capabilities';
import { docStepName, processDocumentationToMarkdown, type DocAnchor, type ProcessDocumentation } from '@/lib/process-documentation';
import type { SopSentence } from '@/lib/sop-provenance';
import { BUSINESS_STEP_LEVEL, businessStepsOf, type BusinessStep } from '@/lib/business-steps';

/**
 * The prompt of the business SOP and RACI, and what is stored with its answer
 * — moved out of the Documentation page so it can be read and tested (owner
 * 11.10.2026, external review of the FI case, F-06).
 *
 * The review found a SOP that turned technical facts into organisational
 * practice. The prompt now:
 *
 *   - asks for each sentence of a step as a **claim with its basis** —
 *     `"code"` with the lines of the step that hold it, or `"proposal"`;
 *   - forbids upgrading a technical fact ("internal arithmetic checks" is not
 *     "reconciled against ledger control totals"; the current credit record is
 *     not a credit exposure analysis);
 *   - hands the model, before the documentation, the list of what the program
 *     does **not** do (`capabilityPresence`) and says that any organisational
 *     element — roles, approval, override, escalation, audit messages — is a
 *     proposal, never practice.
 *
 * Whatever the model answers, the stages that render the SOP judge each
 * sentence again (`lib/sop-provenance.ts`): the tag is the model's word, the
 * check is the engine's.
 */

export const SOP_STEPS_DESCRIPTION =
  'Process Documentation read from the ABAP code (a business page, the process, rules and exceptions, and as its appendix the BPMN elements with their ids and line ranges and every statement). Use the ids of the business steps listed below as stepId';

const lineWords = (a: DocAnchor | null) => (a ? (a.lineEnd > a.lineStart ? `L${a.lineStart}–${a.lineEnd}` : `L${a.lineStart}`) : 'lines not determined');

/** How many technical elements the prompt names under one business step; the rest are counted. */
export const PROMPT_TECHNICAL_PER_STEP = 30;

/**
 * The level the SOP and the RACI are written on (owner 16.10.2026): one row
 * per business step — the steps "How it works" lists — with the elements
 * under each named as its detail, never as rows of their own.
 */
export function businessStepsBlock(steps: readonly BusinessStep[]): string {
  const list = steps.map((step, i) => {
    const inside = step.technical.slice(0, PROMPT_TECHNICAL_PER_STEP).map((t) => `${t.name} (${t.kind}, ${lineWords(t.anchor)})`);
    const more = step.technical.length > PROMPT_TECHNICAL_PER_STEP ? `; and ${step.technical.length - PROMPT_TECHNICAL_PER_STEP} more` : '';
    return `${i + 1}. ${step.id} — ${step.name} (${lineWords(step.anchor)})${inside.length ? `. Inside: ${inside.join('; ')}${more}` : ''}`;
  });
  return `
CRITICAL — THE BUSINESS LEVEL (one row per business step, nothing finer):
- The process has ${steps.length} business step${steps.length === 1 ? '' : 's'} — the steps the description lists under "How it works". Write EXACTLY one raci_matrix row and one sop_details row for each of them, with its id as stepId, in this order.
- Write NO row for any other element id. The elements listed "Inside" a step — its decisions, loops, checks and calls — are that step's technical detail: read them to write the step (what it does, how it can end early), never as rows of their own.
- A step's lines are its own and those of the elements inside it.
${list.join('\n')}
`;
}

/** The facts block the prompt opens with: what the program does not do, in the engine's words. */
export function sopFactsBlock(facts: CapabilityFacts | null): string {
  if (!facts) return 'What the program does not do: not recorded with this documentation — treat every claim of posting, approval, reconciliation, correspondence or logging as a proposal.';
  const presence = capabilityPresence(facts);
  const absent = (Object.keys(presence) as Array<keyof typeof presence>).filter((k) => isAbsent(presence[k])).map((k) => `- ${presence[k].absent}`);
  return absent.length
    ? `What the program does NOT do (read from the whole source — never write the opposite as a fact):\n${absent.join('\n')}`
    : 'What the program does not do: the engine found no capability absent.';
}

/**
 * One part of a business layer written in parts (roadmap 3.0.13,
 * `lib/business-layer-parts.ts`): which part, the element ids it writes rows
 * for, and the roles the parts before it already use.
 */
export interface BusinessSopPart {
  index: number;
  total: number;
  stepIds: readonly string[];
  roles: readonly string[];
}

/** The block a part's prompt carries: its place, its element ids, the roles to reuse. */
export function sopPartBlock(part: BusinessSopPart): string {
  const roles = part.roles.length
    ? `\n- Roles the earlier part already uses: ${part.roles.join(', ')}. REUSE them; add a role only where none of them fits, and keep the whole matrix at 7 roles or fewer.`
    : '';
  return `
THIS IS PART ${part.index + 1} OF ${part.total}. The program is too large for one answer, so its business layer is written in ${part.total} parts and joined afterwards.
- The documentation below covers this part's steps (the summary at its top is the whole program's).
- Write raci_matrix and sop_details rows for EXACTLY these business step ids, and for no other: ${part.stepIds.join(', ')}.${roles}
`;
}

/**
 * The whole prompt, from the stored engine documentation — or, with `part`,
 * the prompt of one part of it. `steps` are the business steps the answer is
 * written for (default: those of `doc`; a part passes its own).
 */
export function businessSopPrompt(doc: ProcessDocumentation, part?: BusinessSopPart, steps?: readonly BusinessStep[]): string {
  const context = processDocumentationToMarkdown(doc);
  const facts = readCapabilityFacts(doc.facts);
  const level = businessStepsBlock(steps ?? businessStepsOf(doc));
  return `Act as an Enterprise Business Process, SOP & Compliance expert writing for a BUSINESS audience — process owners, master-data stewards, compliance and internal audit. This is the BUSINESS layer of the documentation.
Based on the following ${SOP_STEPS_DESCRIPTION}, generate the corresponding Business SOP & RACI Matrix layer.
${part ? sopPartBlock(part) : ''}${level}
CRITICAL — PURE BUSINESS LANGUAGE (no IT/technical content):
- Write exclusively in business and process terms. Describe WHAT happens for the business — never HOW it is implemented technically.
- Do NOT mention any technical or IT concept. Forbidden terms: source code, API/OData/CDS/CAP/RAP/SDK, database/table/Z-table, JSON/schema/payload, HANA, deployment/pipeline, HTTP, latency/milliseconds, unit test, retry/rollback. All technical detail already lives in the separate Technical Blueprint and must NOT be repeated here.
- RACI roles: a SMALL, REALISTIC set for this one process — typically 4 to 6 roles, never more than 7 in the whole matrix, one row per business step. Use short, generic role names (e.g. Requester, Buyer, Approver, Purchasing Lead, Process Owner, Finance), not the job titles of a large corporation, and REUSE the same roles across the steps. For a step the program runs on its own, name the business role that is responsible for its outcome.
- Every step has EXACTLY ONE Accountable ("a") and at least one Responsible ("r"). Consulted ("c") and Informed ("i") only where they matter; leave them empty otherwise. If you cannot tell who is accountable for a step, leave "a" empty rather than guessing.
- The roles are a proposal the business will confirm; do not invent organisational detail the process does not show. Avoid IT roles (Developer, Architect, System).
- Exceptions must be BUSINESS actions (escalation, dual approval, manual review) — not technical remediation. They are proposals for the business, not something the program does.
- Do NOT propose KPI targets, control objectives, audit controls or verification methods: the process does not show them, and the controls of this process are read from the code elsewhere.

CRITICAL — EVERY SENTENCE CARRIES ITS BASIS:
- Write each business step as "claims": one sentence per claim, 2 to 4 claims per step, about the step as a whole — not one claim per element inside it.
- "basis": "code" ONLY when the sentence is a sentence the documentation below writes for this step or an element inside it, copied word for word, and "lines" lists the source line numbers of THIS step that hold it (the line numbers printed in the documentation). Any other wording, and any sentence without such a line, has the basis "proposal".
- "basis": "proposal" for everything else: who does it, why, how often, and every organisational element — roles or job titles, approval, release, override, escalation, dual control, sign-off, policy, notification of people, audit or compliance records.
- NEVER upgrade a technical fact. Internal arithmetic checks are NOT a reconciliation against the general ledger or control totals. The current credit record is NOT a credit exposure analysis or a credit-limit breach. A warning shown to the user is NOT an audit message or log. Reading a reference is NOT taking over its terms. A list of proposals is NOT a posting, a clearing, a dunning run or a letter.
- Do not describe as current practice anything the list below says the program does not do. If you suggest it, write it as a proposal ("could", "a business may decide to") with "basis": "proposal".

${sopFactsBlock(facts)}

Return ONLY a JSON object wrapped in a markdown code block (\`\`\`json ... \`\`\`).
DO NOT include any text before or after the JSON.

Process Blueprint Context:
${context}

Structure the JSON exactly like this:
{
  "raci_matrix": [
    {
      "stepId": "Task1",
      "r": "Responsible role who performs the step (e.g. Buyer)",
      "a": "Exactly one Accountable role (e.g. Purchasing Lead)",
      "c": "Consulted role, only where it matters (e.g. Approver), else empty",
      "i": "Informed role, only where it matters (e.g. Requester), else empty"
    }
  ],
  "sop_details": [
    {
      "stepId": "Task1",
      "claims": [
        { "text": "One plain-business sentence of what happens at this step.", "basis": "code", "lines": [42] },
        { "text": "One sentence the business would decide or do around it.", "basis": "proposal", "lines": [] }
      ],
      "businessException": "Business fallback if the step cannot be completed (a proposal for the business, e.g. route for manual review)."
    }
  ]
}`;
}


/** A technical step as a stored row carries it: folded under its business step, with its lines. */
export interface SopTechnicalInfo {
  id: string;
  name: string;
  kind: string;
  lines: DocAnchor[];
  depth: number;
}

/** A step as the layer is stored with it: its business name, its lines and the engine's sentences of those lines. */
export interface SopStepInfo {
  id: string;
  name: string;
  lines: DocAnchor[];
  /** What the engine wrote for this step (`stepSentencesOf`) — the only wording a claim is Reconstructed with. */
  sentences: SopSentence[];
  /** The step's reference on the description's main path ("4a") where it differs from its number. */
  ref?: string;
  /** The technical steps folded under this business step (owner 16.10.2026). */
  technical?: SopTechnicalInfo[];
}

const inside = (a: DocAnchor, ranges: readonly DocAnchor[]) => ranges.some((r) => r.lineStart <= a.lineStart && a.lineEnd <= r.lineEnd);

/**
 * The engine's sentences of one step (QA review of 35b97d90c6e1): the 17.7
 * sentence standing at the element (and, for a business step, at every
 * element inside it), every engine sentence whose lines all lie in the step's
 * lines, and the step's plain name. Deterministic — read from the stored
 * documentation, never from the model.
 */
export function stepSentencesOf(
  doc: ProcessDocumentation,
  step: ProcessDocumentation['steps'][number],
  lines: readonly DocAnchor[],
  statementIds: ReadonlySet<string> = new Set(),
): SopSentence[] {
  const out: SopSentence[] = [];
  const seen = new Set<string>();
  const add = (text: string, anchors: readonly DocAnchor[]) => {
    if (!text.trim() || !anchors.length || seen.has(text)) return;
    seen.add(text);
    out.push({ text, anchors: anchors.map((a) => ({ lineStart: a.lineStart, lineEnd: a.lineEnd })) });
  };
  for (const st of doc.statements) {
    if (st.id === step.statementId || statementIds.has(st.id) || (lines.length > 0 && st.anchors.length > 0 && st.anchors.every((a) => inside(a, lines)))) add(st.text, st.anchors);
  }
  if (step.plainName && step.anchor) add(step.plainName, [step.anchor]);
  return out;
}

const copyAnchor = (a: DocAnchor): DocAnchor => ({ lineStart: a.lineStart, lineEnd: a.lineEnd });

/**
 * The business steps of the stored documentation (owner 16.10.2026), named
 * for a business reader (never a node id): each with its lines — its own, the
 * extra lines the caller knows (the body of the routine it runs) and those of
 * every element inside it — the engine's sentences of those lines, and its
 * technical steps. `steps` are the business steps when the caller has them
 * (the description's main path); without them they are read from `doc`.
 */
export function sopStepInfos(
  doc: ProcessDocumentation,
  names?: ReadonlyMap<string, string>,
  lines?: ReadonlyMap<string, readonly DocAnchor[]>,
  steps?: readonly BusinessStep[],
  refs?: ReadonlyMap<string, string>,
): SopStepInfo[] {
  const byId = new Map(doc.steps.map((s) => [s.id, s]));
  return (steps ?? businessStepsOf(doc)).flatMap((business) => {
    const step = byId.get(business.id);
    if (!step) return [];
    const own = [
      ...(step.anchor ? [step.anchor] : []),
      ...(lines?.get(step.id) ?? []),
      ...business.technical.flatMap((t) => (t.anchor ? [t.anchor] : [])),
    ].map(copyAnchor);
    const statementIds = new Set(business.technical.map((t) => byId.get(t.id)?.statementId).filter((x): x is string => !!x));
    const ref = refs?.get(step.id);
    return [{
      id: step.id,
      name: names?.get(step.id) ?? docStepName(step),
      lines: own,
      sentences: stepSentencesOf(doc, step, own, statementIds),
      ...(ref ? { ref } : {}),
      technical: business.technical.map((t) => ({
        id: t.id,
        name: names?.get(t.id) ?? t.name,
        kind: t.kind,
        lines: t.anchor ? [copyAnchor(t.anchor)] : [],
        depth: t.depth,
      })),
    }];
  });
}

/** Fields of a stored row that are the engine's — whatever the model wrote under these names is dropped. */
const ENGINE_ROW_FIELDS = ['stepName', 'stepLines', 'stepSentences', 'stepRef', 'stepTechnical'] as const;

/**
 * The model's answer as it is stored: every SOP and RACI row carries the
 * business name and the lines of its step, the narrative is the claims in one
 * paragraph (for a reader that predates the claims), and the program's
 * capability facts travel with the layer — so the delivery package's file can
 * name each step and judge each sentence without the source.
 *
 * Since 16.10.2026 the layer is written on the business level: it says so
 * (`level: 'business-step'`), each row carries the technical steps folded
 * under it (`stepTechnical`), the rows stand in the order of the business
 * steps, and a row the model wrote for an element inside a business step —
 * a level finer than asked — is not kept.
 */
export function enrichBusinessLayer(parsed: Record<string, unknown>, steps: readonly SopStepInfo[], facts: CapabilityFacts | null): Record<string, unknown> {
  const byId = new Map(steps.map((s) => [s.id, s]));
  const position = new Map(steps.map((s, i) => [s.id, i]));
  const technicalIds = new Set(steps.flatMap((s) => (s.technical ?? []).map((t) => t.id)).filter((id) => !byId.has(id)));
  const rows = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
  const withStep = (row: unknown) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
    const r = { ...(row as Record<string, unknown>) };
    // What a later reader takes as the engine's — name, lines, sentences, technical steps — is never the model's.
    for (const field of ENGINE_ROW_FIELDS) delete r[field];
    const step = typeof r.stepId === 'string' ? byId.get(r.stepId) : undefined;
    if (step) {
      r.stepName = step.name;
      r.stepLines = step.lines;
      r.stepSentences = step.sentences;
      if (step.ref) r.stepRef = step.ref;
      if (step.technical) r.stepTechnical = step.technical;
    }
    if (Array.isArray(r.claims) && (typeof r.narrative !== 'string' || !r.narrative.trim())) {
      r.narrative = r.claims
        .map((c) => (c && typeof c === 'object' && typeof (c as Record<string, unknown>).text === 'string' ? ((c as Record<string, unknown>).text as string).trim() : ''))
        .filter(Boolean)
        .join(' ');
    }
    return r;
  };
  const idOf = (row: unknown): string => {
    const id = row && typeof row === 'object' ? (row as Record<string, unknown>).stepId : undefined;
    return typeof id === 'string' ? id : '';
  };
  // In the order of the business steps; a row of an unknown id keeps its place after them.
  const ordered = (value: unknown) => rows(value)
    .filter((row) => !technicalIds.has(idOf(row)))
    .map((row, i) => ({ row, i }))
    .sort((a, b) => (position.get(idOf(a.row)) ?? steps.length + a.i) - (position.get(idOf(b.row)) ?? steps.length + b.i))
    .map(({ row }) => withStep(row));
  // A `facts` the model wrote is dropped: a later reader takes the field as the engine's
  // capability evidence (QA review of 35b97d90c6e1). Only the engine's facts travel with the layer.
  const { facts: _modelFacts, level: _modelLevel, ...answer } = parsed;
  void _modelFacts;
  void _modelLevel;
  return {
    ...answer,
    level: BUSINESS_STEP_LEVEL,
    raci_matrix: ordered(parsed.raci_matrix),
    sop_details: ordered(parsed.sop_details),
    ...(facts ? { facts } : {}),
  };
}
