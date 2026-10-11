import { capabilityPresence, isAbsent, readCapabilityFacts, type CapabilityFacts } from '@/lib/documentation-capabilities';
import { docStepName, readStoredDocumentation, type ProcessDocumentation } from '@/lib/process-documentation';
import { RACI_LETTERS, lettersOf, raciMatrix, sopSteps, stepsNotInProcess, type ProcessStepRef, type SopStep, type StoredBusinessLayer } from '@/lib/business-summary';
import { layerFacts, sopStatementLine, SOP_BASIS } from '@/lib/sop-provenance';

/**
 * The business SOP as the delivery package's `business-documentation.md` —
 * owner 11.10.2026, on the external review of the FI Collection Worklist
 * package (F-06, F-07).
 *
 * The file used to print the model's JSON as it came: a RACI with job titles
 * keyed by node ids, and 48 tasks headed "Task: `nd-316-0`", each a paragraph
 * that read as practice — "cross-checked against company ledger control
 * totals", "request AR Lead review". Now:
 *
 *   - every step is headed by its business name and its lines, never a node id;
 *   - every sentence carries its basis — Reconstructed (from the code, with its
 *     line), Model proposal, or **Proposal — not in the program** for roles,
 *     approval, escalation and every capability the program does not have
 *     (`lib/sop-provenance.ts`, `lib/documentation-capabilities.ts`);
 *   - the business exception is a proposal, always;
 *   - the RACI is a proposal unless the owner saved one, and says so;
 *   - the page opens with what the program does not do, so no sentence below
 *     can be read as the opposite.
 *
 * Reads the stored layer as written — with the step names, lines and facts
 * stored with it since 3.0.10 — and, when the caller has it, the stored
 * process documentation for the names and order of the steps.
 */

type Json = Record<string, unknown>;

const parse = (raw: string): Json | null => {
  try {
    const cleaned = raw.replace(/^```json\n?/gm, '').replace(/^```\n?/gm, '').trim();
    const data = JSON.parse(cleaned);
    return data && typeof data === 'object' && !Array.isArray(data) ? (data as Json) : null;
  } catch {
    return null;
  }
};

const cell = (text: string) => text.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim();
const lines = (a: { lineStart: number; lineEnd: number } | null | undefined) =>
  (a ? (a.lineEnd > a.lineStart ? `L${a.lineStart}–${a.lineEnd}` : `L${a.lineStart}`) : 'lines not determined');

/** The steps a file names: the documentation's when given, else none (the layer's own names are used). */
function processOf(documentation: ProcessDocumentation | null): ProcessStepRef[] {
  if (!documentation) return [];
  return documentation.steps.map((s) => ({
    id: s.id,
    name: docStepName(s),
    technicalName: s.technicalName,
    anchor: s.anchor,
    provenance: s.provenance,
  }));
}

/** A step's name for a reader: the documentation's, the one stored with the row, or its number — never an id. */
function nameOf(step: SopStep, layer: Json): string {
  if (step.step) return step.step.name;
  const rows = [...(Array.isArray(layer.sop_details) ? layer.sop_details : []), ...(Array.isArray(layer.raci_matrix) ? layer.raci_matrix : [])];
  const row = rows.find((r) => r && typeof r === 'object' && (r as Json).stepId === step.stepId) as Json | undefined;
  return typeof row?.stepName === 'string' && row.stepName.trim() ? row.stepName.trim() : `Step ${step.number}`;
}

function stepLines(step: SopStep, layer: Json): string {
  if (step.step?.anchor) return lines(step.step.anchor);
  const row = (Array.isArray(layer.sop_details) ? layer.sop_details : []).find((r) => r && typeof r === 'object' && (r as Json).stepId === step.stepId) as Json | undefined;
  const first = Array.isArray(row?.stepLines) ? (row!.stepLines[0] as { lineStart: number; lineEnd: number } | undefined) : undefined;
  return lines(first);
}

/**
 * What the file says when the stored layer cannot be read. The model's raw
 * text is never printed in its place: it carries no basis per sentence, and as
 * the file's whole body it would read as the SOP (QA review of 11e3bc7d90e8).
 */
export const UNREADABLE_SOP_MARKDOWN = [
  '# Business SOP',
  '',
  '## Could not be read — not verified',
  '',
  'A business SOP is stored for this project, but it is not in a form this file can read, so it is not printed. '
    + 'Nothing here is a statement about the process. Generating it again in the Documentation tool replaces it.',
  '',
].join('\n');

export function businessSopMarkdown(rawJson: string, documentation?: string | ProcessDocumentation | null): string {
  if (!rawJson) return '';
  const layer = parse(rawJson);
  if (!layer) return UNREADABLE_SOP_MARKDOWN;
  const doc = typeof documentation === 'string'
    ? (() => { const stored = readStoredDocumentation(documentation); return stored.kind === 'engine' ? stored.doc : null; })()
    : documentation ?? null;
  const facts: CapabilityFacts | null = readCapabilityFacts(doc?.facts) ?? layerFacts(layer);
  const steps = sopSteps(layer as StoredBusinessLayer, processOf(doc), { facts });
  const out: string[] = [];

  out.push(`# Business SOP${doc ? ` — ${doc.processName}` : ''}`, '');
  out.push('> Written by a language model from the process documentation; not current practice until the business confirms it. '
    + 'Every sentence says its basis: **Reconstructed** — read from the code, with its line; **Model proposal** — the model\'s wording, unchecked; '
    + '**Proposal — not in the program** — roles, approval, escalation, and anything the program does not do.', '');

  if (facts) {
    const presence = capabilityPresence(facts);
    const absent = (Object.keys(presence) as Array<keyof typeof presence>).filter((k) => isAbsent(presence[k]));
    if (absent.length) {
      out.push('## What the program does not do', '');
      out.push('Read from the whole source (Reconstructed). A sentence below that says otherwise is a proposal, not in the program.', '');
      for (const k of absent) out.push(`- ${presence[k].absent}`);
      out.push('');
    }
  }

  out.push('## Steps', '');
  if (steps.length === 0) out.push('The proposal names no step of the process.', '');
  const dropped = stepsNotInProcess(layer as StoredBusinessLayer, processOf(doc));
  if (dropped) out.push(`${dropped} ${dropped === 1 ? 'row names a step' : 'rows name steps'} the process does not have; ${dropped === 1 ? 'it is' : 'they are'} not printed.`, '');
  for (const step of steps) {
    out.push(`### ${step.number}. ${nameOf(step, layer)} (${stepLines(step, layer)})`, '');
    if (step.statements.length === 0) out.push('- Not determined — the proposal says nothing about this step.');
    for (const st of step.statements) out.push(`- ${sopStatementLine(st)}`);
    if (step.exceptionStatement) out.push(`- **If it cannot be completed:** ${sopStatementLine(step.exceptionStatement)}`);
    out.push('');
  }

  const matrix = raciMatrix(steps);
  if (matrix.steps.length) {
    const roles = [...matrix.roles, ...matrix.moreRoles];
    out.push(`## Who is responsible (RACI) — ${SOP_BASIS['not-in-program'].label}`, '');
    out.push('The code names no role: the roles are a proposal for the business to confirm, not current practice. '
      + `${RACI_LETTERS.map((l) => `${l} = ${({ R: 'Responsible', A: 'Accountable', C: 'Consulted', I: 'Informed' } as const)[l]}`).join(' · ')}.`, '');
    out.push(`| No. | Step | ${roles.map((r) => cell(r.name)).join(' | ')} |`);
    out.push(`| :--- | :--- | ${roles.map(() => ':---:').join(' | ')} |`);
    for (const s of matrix.steps) {
      out.push(`| ${s.number} | ${cell(nameOf(s, layer))} | ${roles.map((r) => lettersOf(s, r.name).join(' ')).join(' | ')} |`);
    }
    out.push('');
  }

  // A layer written before 3.0.7 may still hold control proposals; they are kept as data and marked.
  const controls = Array.isArray(layer.audit_controls) ? layer.audit_controls.filter((c): c is Json => !!c && typeof c === 'object') : [];
  if (controls.length) {
    const name = new Map(steps.map((s) => [s.stepId, nameOf(s, layer)]));
    out.push(`## Controls an earlier proposal named — ${SOP_BASIS['not-in-program'].label}`, '');
    // QA review of 11e3bc7d90e8: the rows are model proposals only — the sentence
    // that introduces them must not read as if they came from the code.
    out.push('These rows are historical: a language model proposed them before 3.0.7, and nothing in them was read from or checked against the code.', '');
    out.push('Separately, the controls the code actually has are listed in the process documentation.', '');
    out.push('| Step | Control objective | Mitigation | Assertion |');
    out.push('| :--- | :--- | :--- | :--- |');
    for (const c of controls) {
      const id = typeof c.stepId === 'string' ? c.stepId : '';
      out.push(`| ${cell(name.get(id) ?? 'A step not in the process')} | ${cell(String(c.controlObjective ?? 'Not determined'))} | ${cell(String(c.mitigationAction ?? 'Not determined'))} | ${cell(String(c.assertionMethod ?? 'Not determined'))} |`);
    }
    out.push('');
  }
  return out.join('\n');
}
