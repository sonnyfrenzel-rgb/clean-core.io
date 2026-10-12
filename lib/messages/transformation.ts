/**
 * The words of the Transformation tool's two new surfaces (roadmap 3.0.12,
 * owner 12.10.2026): the tips before a generation — "Raise the quality" — and
 * the generation screen, which shows what the generation builds on and what
 * happens to the answer.
 *
 * One part of the catalogue in `lib/workspace-messages.ts`. The numbers come
 * from the project (`lib/transformation-chain.ts`); the sentences here only
 * say them. Nothing here compares the product with anything else — the screen
 * shows facts of this project, established as it reads them.
 */
export const TRANSFORMATION_MESSAGES = {
  // The tips before a generation.
  'transformation.qualityTitle': 'Raise the quality of the generated code',
  'transformation.qualityLead':
    'Optional, ordered by what changes the code most. Each item is something the generation works from; you can generate at any time.',
  'transformation.qualityNothingOpen': 'Nothing is open that would change what the generation works from.',
  'transformation.qualityShowAll': 'Show what it works from',
  'transformation.generateNow': 'Generate now',
  'transformation.regenerateNow': 'Regenerate now',
  'transformation.notReadYet': 'Recorded here; the code model does not read it yet.',

  'transformation.tip.rules.title': 'Decide the business rules',
  'transformation.tip.rules.impact':
    'Each decided rule is implemented exactly as you chose — keep, change or drop — instead of copied as-is.',
  'transformation.tip.rules.action': 'Decide the open rules',
  'transformation.tip.target.title': 'Confirm the target architecture',
  'transformation.tip.target.impact':
    'The code is generated for the target you confirm — or for another one, with your reason on record. Unconfirmed, it follows the engine’s recommendation.',
  'transformation.tip.target.action': 'Confirm in Design',
  'transformation.tip.requirements.title': 'Accept or improve the requirements',
  'transformation.tip.requirements.impact':
    'Accepted functional and non-functional requirements are written into the code as stated — targets, checks and limits included — instead of inferred from the source alone.',
  'transformation.tip.requirements.functional': 'Functional requirements',
  'transformation.tip.requirements.nonFunctional': 'Non-functional requirements',
  'transformation.tip.requirementsStart.title': 'Write the requirements specification',
  'transformation.tip.requirementsStart.impact':
    'The engine drafts it from the signed source, without a model call. Once you accept its requirements, they are written into the code as stated.',
  'transformation.tip.requirementsStart.action': 'Open the requirements',
  'transformation.tip.requirementsStale.title': 'Bring the requirements up to date',
  'transformation.tip.requirementsStale.impact':
    'The specification was written for an earlier source. Taking the current reading over keeps the requirements and the code on the same program.',

  // The generation screen.
  'transformation.generatingTitle': 'Generating the transformation',
  'transformation.chainTitle': 'What this generation builds on',
  'transformation.chainCaption': 'Written from what the platform already knows about this program — not from the code alone.',
  'transformation.stagesTitle': 'What happens to it',
  'transformation.slot.insights': 'First insights',
  'transformation.slot.analyze': 'Analyze',
  'transformation.slot.rules': 'Business rules',
  'transformation.slot.design': 'Design',
  'transformation.slot.decision': 'Decision record',
  'transformation.slot.loading': 'Reading…',
  'transformation.slot.missing': 'Not on record',
  'transformation.slot.stale': 'Out of date',
  'transformation.slot.unread': 'Could not be read',
  'transformation.slot.taken': 'Taken from',
  'transformation.insights.noPurpose': 'The program’s purpose could not be read from the code.',
  'transformation.rules.none': 'The engine read the source and found no business rule in it.',
  'transformation.design.none': 'No solution design on record.',
  'transformation.design.notConfirmed': 'Target not confirmed — the engine’s recommendation is followed.',
  'transformation.requirements.none': 'No requirements specification yet.',
  'transformation.stage.contract': 'Reading the architecture contract',
  'transformation.stage.facts': 'Reading the original’s checks and declarations',
  'transformation.stage.model': 'The model writes the code',
  'transformation.stage.modelNote': 'One answer for the whole package, so there is no percentage — only the time it has taken so far.',
  'transformation.stage.checks': 'Checks on the answer',
  'transformation.stage.storing': 'Saving to the project',
  'transformation.check.files': 'Every file has a path and content',
  'transformation.check.paths': 'No path answered twice',
  'transformation.check.artefacts': 'Every artefact the prompt asked for',
  'transformation.check.tests': 'The test suite is there',
  'transformation.check.literals': 'Hard-coded document or partner numbers in the logic',
  'transformation.stageState.pending': 'waiting',
  'transformation.stageState.active': 'running',
  'transformation.stageState.done': 'done',
  'transformation.stageState.failed': 'stopped',
  'transformation.checkState.pending': 'not checked yet',
  'transformation.checkState.passed': 'passed',
  'transformation.checkState.warning': 'warning',
  'transformation.checkState.failed': 'failed',
  'transformation.opensNewTab': 'opens in a new tab',
} as const;

export type TransformationMessageKey = keyof typeof TRANSFORMATION_MESSAGES;

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en')} ${n === 1 ? one : many}`;

/** "4 of 11 rules open" — the count of the rules tip. */
export function tfRulesOpenCount(open: number, total: number): string {
  return `${open.toLocaleString('en')} of ${plural(total, 'rule')} open`;
}

/** "11 business rules · 7 decided by you (5 keep, 1 change, 1 drop) · 4 open" — the rules slot. */
export function tfRulesLine(total: number, decided: { keep: number; change: number; drop: number }, open: number): string {
  const n = decided.keep + decided.change + decided.drop;
  const parts = [`${decided.keep} keep`, `${decided.change} change`, `${decided.drop} drop`];
  return `${plural(total, 'business rule')} · ${n.toLocaleString('en')} decided by you${n > 0 ? ` (${parts.join(', ')})` : ''} · ${open.toLocaleString('en')} open`;
}

/** "5 of 21 accepted · 3 open decisions" — the requirements tip and slot. */
export function tfRequirementsLine(accepted: number, total: number, openDecisions: number): string {
  return `${accepted.toLocaleString('en')} of ${plural(total, 'requirement')} accepted · ${plural(openDecisions, 'open decision')}`;
}

/** "Clean Core Score 62 · 14 findings · 3 released successors" — the Analyze slot. */
export function tfAnalyzeLine(score: number | null, findings: number | null, successors: number | null): string {
  const parts: string[] = [];
  parts.push(score === null ? 'Clean Core Score not on record' : `Clean Core Score ${score}`);
  if (findings !== null) parts.push(plural(findings, 'finding'));
  if (successors !== null) parts.push(plural(successors, 'released successor'));
  return parts.join(' · ');
}

/** "Signed run, 12 Oct 2026" / "revision 3, 12 Oct 2026" — the date line of a slot. */
export function tfWhenLine(what: string | null, date: string | null): string | null {
  if (what && date) return `${what}, ${date}`;
  return what ?? date;
}

/** "Open Analyze" — the way back to a slot's tool. */
export function tfOpenTool(tool: string): string {
  return `Open ${tool}`;
}

/** "Target: Side-by-side (CAP)" — the design slot's first fact. */
export function tfTargetLine(label: string, confirmed: boolean): string {
  return confirmed ? `Target: ${label}, confirmed` : `Target: ${label}`;
}

/** "Reason: …" — the route's reason. */
export function tfReasonLine(reason: string): string {
  return `Reason: ${reason}`;
}

/** "3 hard-coded values found" / "none found" — the literal scan's result. */
export function tfLiteralsResult(n: number): string {
  return n === 0 ? 'none found' : `${plural(n, 'value')} found — listed with the code`;
}

/** "5 files" — the size of the answer. */
export function tfFilesResult(n: number): string {
  return plural(n, 'file');
}

/** "Attempt 2 of 2" — said only when the model is asked a second time. */
export function tfAttempt(n: number, of: number): string {
  return `Attempt ${n} of ${of}`;
}

/** "1:23 so far" — the honest clock of the model step. */
export function tfElapsed(clock: string): string {
  return `${clock} so far`;
}

/** "1:23" taken — a finished step's duration. */
export function tfTook(clock: string): string {
  return `took ${clock}`;
}

/** "Read: Analyze — Clean Core Score 62 …" — what the live region announces when a slot is established. */
export function tfSlotAnnouncement(title: string, line: string): string {
  return `${title}: ${line}`;
}

/** "DEC-1, revision 3, confirmed" — the decision record slot. */
export function tfDecisionLine(id: string, revision: number, confirmed: boolean): string {
  return `${id}, revision ${revision}${confirmed ? ', confirmed' : ', not confirmed yet'}`;
}
