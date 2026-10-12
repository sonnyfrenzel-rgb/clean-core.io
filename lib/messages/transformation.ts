/**
 * The words of the Transformation tool's two new surfaces (roadmap 3.0.12,
 * owner 12.10.2026; `docs/design/engine-led-transformation.md` §14–§15 and the
 * mockup `docs/roadmap/transformation-generation-mockup.html`): the tips before
 * a generation — "Before the run: raise the quality" — and the generation
 * screen, which shows what the generation builds on and what happens to it.
 *
 * One part of the catalogue in `lib/workspace-messages.ts`. The numbers come
 * from the project (`lib/transformation-chain.ts`); the sentences here only
 * say them. Every "In the code" line says what today's prompt does with the
 * input (the PLATFORM KNOWLEDGE block, `lib/transformation-context.ts`) — and
 * nothing here compares the product with anything else.
 */
export const TRANSFORMATION_MESSAGES = {
  // Before the run.
  'transformation.tipsTitle': 'Before the run: raise the quality',
  'transformation.tipsLead': 'Each of these changes what the generation uses. You come back here afterwards, with the counts updated.',
  'transformation.tipsDone': 'Everything the generation uses is decided and current.',
  'transformation.generateNow': 'Generate now',
  'transformation.regenerateNow': 'Regenerate now',
  'transformation.generateNote': 'Generating now is fine — open rules are implemented as the original has them and marked open.',
  'transformation.inCode': 'In the code:',
  'transformation.chainBeforeTitle': 'What this generation will use',
  'transformation.chainBeforeLead': 'From the tools before Transformation, in workflow order.',
  'transformation.notReadYet': 'Recorded here; the code model does not read it yet.',
  'transformation.opensNewTab': 'opens in a new tab',
  // The decision warning above the tips — never blocking (owner, 12.10.2026).
  'transformation.warnDecision.retire': 'The decision on record is to retire this program — generating a rebuild goes against it.',
  'transformation.warnDecision.keep': 'The decision on record is to keep this program as it is — generating a rebuild goes against it.',
  'transformation.warnDecision.standard': 'The decision on record is to move to SAP standard — generating a rebuild goes against it.',
  'transformation.warnDecision.standardFitOpen': 'Standard fit is not assessed yet — SAP standard may already cover this.',
  'transformation.warnDecision.openDecision': 'Open the decision',
  'transformation.warnDecision.checkStandardFit': 'Check standard fit',
  'transformation.warnDecision.lead': 'You can still generate — the decision stays yours.',

  'transformation.tip.rules.titleLoading': 'Decide the open rules',
  'transformation.tip.rules.impact':
    'each decided rule is implemented exactly as you chose (keep, change or drop) instead of copied as-is.',
  'transformation.tip.rules.inCode':
    'a kept rule is implemented as the original and names its id; a changed rule follows your wording; a dropped rule is left out with a comment that says so.',
  'transformation.tip.requirements.impact': 'accepted ones are handed to the model to implement as stated.',
  'transformation.tip.requirements.inCode': 'each accepted requirement goes into the prompt with its statement; proposals do not.',
  'transformation.tip.requirementsStart.title': 'Write the requirements specification',
  'transformation.tip.requirementsStart.impact':
    'the engine drafts it from the signed source, without a model call; what you accept is implemented as stated.',
  'transformation.tip.nfr.impact': 'they set limits the generated code enforces.',
  'transformation.tip.nfr.inCode':
    'accepted non-functional requirements replace the design model’s proposals, with their measurable targets.',
  'transformation.tip.target.title': 'Confirm the target in Design',
  'transformation.tip.target.impact': 'the code is generated for the route you confirmed.',
  'transformation.tip.target.inCode': 'the route and its reason; a route against the recommendation carries your reason.',
  'transformation.tip.decision.title': 'Record the decision',
  'transformation.tip.decision.impact': 'the package then names what was decided and on which evidence.',
  'transformation.tip.decision.inCode': 'the decision record goes into the prompt; a decision that builds nothing is said in every main file.',

  // The chain.
  'transformation.slot.insights': 'First insights',
  'transformation.slot.analyze': 'Analyze',
  'transformation.slot.rules': 'Business rules',
  'transformation.slot.design': 'Design',
  'transformation.slot.requirements': 'Requirements',
  'transformation.slot.decision': 'Decision record',
  'transformation.link.insights': 'Open Analyze',
  'transformation.link.analyze': 'Open Analyze',
  'transformation.link.rules': 'Open the rules',
  'transformation.link.design': 'Open Design',
  'transformation.link.requirements': 'Open the requirements',
  'transformation.link.decision': 'Open the decision',
  'transformation.fix.runAnalysis': 'Run the analysis',
  'transformation.fix.rules': 'Decide in the Business view',
  'transformation.fix.design': 'Update it in Design',
  'transformation.fix.target': 'Confirm in Design',
  'transformation.fix.requirements': 'Review in Design',
  'transformation.fix.requirementsStart': 'Open the requirements',
  'transformation.fix.decision': 'Decide in the Management view',
  'transformation.insights.noPurpose': 'What the program is for could not be read from the code.',
  'transformation.rules.none': 'The engine read the source and found no business rule in it.',
  'transformation.design.none': 'No solution design on record.',
  'transformation.design.document': 'The solution design document',
  'transformation.requirements.none': 'No requirements specification yet.',
  'transformation.warn.noRun': 'No signed analysis run yet.',
  'transformation.warn.runMoved': 'The source changed after the signed run.',
  'transformation.warn.designStale': 'Built for a previous source.',
  'transformation.warn.targetOpen': 'The target is not confirmed yet.',
  'transformation.warn.requirementsStale': 'Written for an earlier source.',
  'transformation.warn.noDecision': 'No decision recorded yet.',
  'transformation.warn.decisionOpen': 'The decision is not confirmed yet.',
  'transformation.state.willBeUsed': 'Will be used',
  'transformation.state.willBeUsedBetter': 'Will be used — can be better',
  'transformation.state.missing': 'Not on record',
  'transformation.state.unread': 'Could not be read',
  'transformation.state.waiting': 'Waiting',
  'transformation.state.loading': 'Loading…',
  'transformation.state.inContext': 'In the context',
  'transformation.state.inContextAttention': 'In the context — needs attention',
  'transformation.state.running': 'Running',
  'transformation.state.done': 'Done',
  'transformation.state.stopped': 'Stopped',

  // While it runs.
  'transformation.chainRunTitle': 'What it builds on',
  'transformation.chainCaption': 'Written from what the platform already knows about this program — not from the code alone.',
  'transformation.elapsed': 'Elapsed time',
  'transformation.stage.facts': 'Facts of the original',
  'transformation.stage.factsNote': 'no model',
  'transformation.stage.factsUnread': 'Could not be read — the model is told to take them from the source itself',
  'transformation.stage.model': 'The model writes the code',
  'transformation.stage.modelNote': 'one answer for the whole package',
  'transformation.stage.checks': 'Checks',
  'transformation.stage.checksNote': 'before saving',
  'transformation.stage.storing': 'Saved to the project',
  'transformation.stage.storingNote': 'only if the project is still where the generation started',
  'transformation.check.files': 'Every file has a path and content',
  'transformation.check.paths': 'No path answered twice',
  'transformation.check.artefacts': 'Every artefact the prompt asked for',
  'transformation.check.tests': 'The test suite is there',
  'transformation.check.literals': 'Hard-coded document or partner numbers in the logic',
  // Step E: the engine-led stages, the work panel and what is shown after the run.
  'transformation.stage.scaffold': 'Engine scaffold',
  'transformation.stage.scaffoldNote': 'no model',
  'transformation.stage.fills': 'Model fills',
  'transformation.stage.fillsNote': 'up to 4 at a time',
  'transformation.stage.repairs': 'Repairs',
  'transformation.stage.repairsNote': 'only the failing functions go back',
  'transformation.check.guards': 'Body guards — no body touched engine-written code',
  'transformation.check.lint': 'Lint checks of the candidate',
  'transformation.check.cases': 'Engine cases through the call contract',
  'transformation.check.probes': 'Failure-pattern probes',
  'transformation.unitsTitle': 'Functions',
  'transformation.unitsWaiting': 'Waiting for the scaffold',
  'transformation.unit.waiting': 'waiting',
  'transformation.unit.writing': 'writing…',
  'transformation.unit.written': 'written',
  'transformation.unit.refused': 'not written — declined',
  'transformation.unit.again': 'asked again',
  'transformation.cancel': 'Cancel',
  'transformation.cancelling': 'Cancelling…',
  'transformation.cancelled': 'Cancelled. Nothing was saved; calls already sent finish on the server and count against this generation.',
  'transformation.builtOnTitle': 'Built on',
  'transformation.builtOnStale': 'changed since',
  'transformation.legacyGeneration': 'Generated in one model call before 3.0.12 — regenerate to get functions anchored to ABAP lines and rule decisions.',
  'transformation.checkState.pending': 'not checked yet',
  'transformation.checkState.met': 'met',
  'transformation.checkState.warning': 'warning',
  'transformation.checkState.failed': 'failed',
} as const;

export type TransformationMessageKey = keyof typeof TRANSFORMATION_MESSAGES;

const count = (n: number) => n.toLocaleString('en');
const plural = (n: number, one: string, many = `${one}s`) => `${count(n)} ${n === 1 ? one : many}`;

/** "optional · 4 things you can still do" — beside the tips' title. */
export function tfTipsMeta(n: number): string {
  return `optional · ${n === 1 ? 'one thing' : `${count(n)} things`} you can still do`;
}

/** "No analysis run used · up to 2 model calls on the community key for this generation". */
export function tfCostLine(maxCalls: number, keySource: 'byok' | 'community' | null): string {
  const key = keySource === 'community' ? ' on the community key' : keySource === 'byok' ? ' on your own Gemini key' : '';
  return `No analysis run used · up to ${plural(maxCalls, 'model call')}${key} for this generation`;
}

/** "Writing the code for ZCO_CC_CLOSE_SIMULATION". */
export function tfRunTitle(program: string | null | undefined): string {
  const name = typeof program === 'string' ? program.trim() : '';
  return name ? `Writing the code for ${name}` : 'Writing the code';
}

/** "Context loaded: 6 sources, 2 need attention." — the one announcement when the chain has been read. */
export function tfContextAnnouncement(sources: number, attention: number): string {
  return `Context loaded: ${plural(sources, 'source')}${attention > 0 ? `, ${count(attention)} need${attention === 1 ? 's' : ''} attention` : ''}.`;
}

/** "5 files" — the size of the answer. */
export function tfFilesResult(n: number): string {
  return plural(n, 'file');
}

/** "3 values found — listed with the code" / "none found" — the literal scan's result. */
export function tfLiteralsResult(n: number): string {
  return n === 0 ? 'none found' : `${plural(n, 'value')} found — listed with the code`;
}

/** "14 of 20 functions written" — the work panel's counter, from the events. */
export function tfUnitsCounter(written: number, total: number): string {
  return `${count(written)} of ${plural(total, 'function')} written`;
}

/** "Show all 20 functions" — the phone's way to the whole list. */
export function tfShowAllUnits(total: number): string {
  return `Show all ${plural(total, 'function')}`;
}

/** "up to 4 at a time · up to 22 model calls under this generation's lease". */
export function tfFillsNote(budget: number): string {
  return `up to 4 at a time · up to ${plural(budget, 'model call')} under this generation’s lease`;
}

/** The fallback's note on the screen, in STATUS and above the result (design §16.2). */
export function tfSingleCallNote(reason: string | null): string {
  return `Generated in one model call — the engine could not build a scaffold for this program${reason ? ` (${reason})` : ''}. Functions are not anchored to ABAP lines.`;
}

/** "1 of 20 functions not written: U07 Upload attachment — the model declined: …" */
export function tfNotWritten(n: number, total: number): string {
  return `${count(n)} of ${plural(total, 'function')} not written — left as ${n === 1 ? 'a stub' : 'stubs'} with the reason below and in STATUS.md.`;
}

/** "Generated 12 Oct 2026 · 1:24" — the Built-on card's meta. */
export function tfBuiltOnMeta(date: string | null, clock: string | null): string {
  return [date ? `generated ${date}` : null, clock].filter(Boolean).join(' · ');
}

/** "attempt 2 of 2" — said only when the model is asked a second time. */
export function tfAttempt(n: number, of: number): string {
  return `attempt ${n} of ${of}`;
}

/** "1:23 so far" — the honest clock of a running step. */
export function tfElapsed(clock: string): string {
  return `${clock} so far`;
}

/** "Done · 0:42" — a finished step's word and duration. */
export function tfTook(word: string, clock: string): string {
  return `${word} · ${clock}`;
}
