import { capabilityPresence, isAbsent, readCapabilityFacts, type CapabilityFacts } from '@/lib/documentation-capabilities';
import { docStepName, processDocumentationToMarkdown, type DocAnchor, type ProcessDocumentation } from '@/lib/process-documentation';

/**
 * The prompt of the business SOP and RACI, and what is stored with its answer
 * — moved out of the Documentation page so it can be read and tested (owner
 * 11.10.2026, external review of the FI Collection Worklist package, F-06).
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
  'Process Documentation read from the ABAP code (a business page, the process, rules and exceptions, and as its appendix the BPMN elements with their ids and line ranges and every statement). Use the element ids as stepId';

/** The facts block the prompt opens with: what the program does not do, in the engine's words. */
export function sopFactsBlock(facts: CapabilityFacts | null): string {
  if (!facts) return 'What the program does not do: not recorded with this documentation — treat every claim of posting, approval, reconciliation, correspondence or logging as a proposal.';
  const presence = capabilityPresence(facts);
  const absent = (Object.keys(presence) as Array<keyof typeof presence>).filter((k) => isAbsent(presence[k])).map((k) => `- ${presence[k].absent}`);
  return absent.length
    ? `What the program does NOT do (read from the whole source — never write the opposite as a fact):\n${absent.join('\n')}`
    : 'What the program does not do: the engine found no capability absent.';
}

/** The whole prompt, from the stored engine documentation. */
export function businessSopPrompt(doc: ProcessDocumentation): string {
  const context = processDocumentationToMarkdown(doc);
  const facts = readCapabilityFacts(doc.facts);
  return `Act as an Enterprise Business Process, SOP & Compliance expert writing for a BUSINESS audience — process owners, master-data stewards, compliance and internal audit. This is the BUSINESS layer of the documentation.
Based on the following ${SOP_STEPS_DESCRIPTION}, generate the corresponding Business SOP & RACI Matrix layer.

CRITICAL — PURE BUSINESS LANGUAGE (no IT/technical content):
- Write exclusively in business and process terms. Describe WHAT happens for the business — never HOW it is implemented technically.
- Do NOT mention any technical or IT concept. Forbidden terms: source code, API/OData/CDS/CAP/RAP/SDK, database/table/Z-table, JSON/schema/payload, HANA, deployment/pipeline, HTTP, latency/milliseconds, unit test, retry/rollback. All technical detail already lives in the separate Technical Blueprint and must NOT be repeated here.
- RACI roles: a SMALL, REALISTIC set for this one process — typically 4 to 6 roles, never more than 7 in the whole matrix. Use short, generic role names (e.g. Requester, Buyer, Approver, Purchasing Lead, Process Owner, Finance), not the job titles of a large corporation, and REUSE the same roles across the steps. For a step the program runs on its own, name the business role that is responsible for its outcome.
- Every step has EXACTLY ONE Accountable ("a") and at least one Responsible ("r"). Consulted ("c") and Informed ("i") only where they matter; leave them empty otherwise. If you cannot tell who is accountable for a step, leave "a" empty rather than guessing.
- The roles are a proposal the business will confirm; do not invent organisational detail the process does not show. Avoid IT roles (Developer, Architect, System).
- Exceptions must be BUSINESS actions (escalation, dual approval, manual review) — not technical remediation. They are proposals for the business, not something the program does.
- Do NOT propose KPI targets, control objectives, audit controls or verification methods: the process does not show them, and the controls of this process are read from the code elsewhere.

CRITICAL — EVERY SENTENCE CARRIES ITS BASIS:
- Write each step as "claims": one sentence per claim, 2 to 4 claims per step.
- "basis": "code" ONLY when the sentence restates what the documentation below says the program does at this step, and "lines" lists the source line numbers of THIS step that hold it (the line numbers printed in the documentation). Without such a line the basis is "proposal".
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

/** A step as the layer is stored with it: its business name and its lines. */
export interface SopStepInfo {
  id: string;
  name: string;
  lines: DocAnchor[];
}

/** The steps of the stored documentation, named for a business reader (never a node id). */
export function sopStepInfos(doc: ProcessDocumentation, names?: ReadonlyMap<string, string>, lines?: ReadonlyMap<string, readonly DocAnchor[]>): SopStepInfo[] {
  return doc.steps.map((step) => ({
    id: step.id,
    name: names?.get(step.id) ?? docStepName(step),
    lines: [...(step.anchor ? [step.anchor] : []), ...(lines?.get(step.id) ?? [])].map((a) => ({ lineStart: a.lineStart, lineEnd: a.lineEnd })),
  }));
}

/**
 * The model's answer as it is stored: every SOP and RACI row carries the
 * business name and the lines of its step, the narrative is the claims in one
 * paragraph (for a reader that predates the claims), and the program's
 * capability facts travel with the layer — so the delivery package's file can
 * name each step and judge each sentence without the source.
 */
export function enrichBusinessLayer(parsed: Record<string, unknown>, steps: readonly SopStepInfo[], facts: CapabilityFacts | null): Record<string, unknown> {
  const byId = new Map(steps.map((s) => [s.id, s]));
  const rows = (value: unknown) => (Array.isArray(value) ? value : []);
  const withStep = (row: unknown) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
    const r = { ...(row as Record<string, unknown>) };
    const step = typeof r.stepId === 'string' ? byId.get(r.stepId) : undefined;
    if (step) {
      r.stepName = step.name;
      r.stepLines = step.lines;
    }
    if (Array.isArray(r.claims) && (typeof r.narrative !== 'string' || !r.narrative.trim())) {
      r.narrative = r.claims
        .map((c) => (c && typeof c === 'object' && typeof (c as Record<string, unknown>).text === 'string' ? ((c as Record<string, unknown>).text as string).trim() : ''))
        .filter(Boolean)
        .join(' ');
    }
    return r;
  };
  return {
    ...parsed,
    raci_matrix: rows(parsed.raci_matrix).map(withStep),
    sop_details: rows(parsed.sop_details).map(withStep),
    ...(facts ? { facts } : {}),
  };
}
