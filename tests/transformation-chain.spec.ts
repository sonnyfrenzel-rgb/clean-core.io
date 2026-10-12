import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  CHAIN_PHASES,
  GENERATION_STAGE_ORDER,
  PROMPT_READS,
  QUALITY_ANCHOR,
  QUALITY_ORIGIN,
  chainSlots,
  enterStage,
  finishStages,
  generationStages,
  pendingChecks,
  qualityTips,
  setCheck,
  specOf,
  withChecks,
  type ChainInputs,
} from '../lib/transformation-chain';
import { ORIGINS, originBackHref, originBackLabel } from '../lib/choice-addresses';
import type { RuleRegister, RuleRow } from '../lib/rule-register';
import type { Project } from '../lib/types';
import { sha256Hex } from '../lib/artefact-digest';

/**
 * Roadmap 3.0.12 (owner 12.10.2026): the Transformation tool's tips before a
 * run and its generation screen, from one pure model. Server-free: every input
 * is a fixture, as the page holds it.
 */

const SOURCE = 'REPORT z_po_approval.\nSELECT SINGLE * FROM ekko INTO @DATA(ls) WHERE ebeln = @p_ebeln.\n';
const SHA = sha256Hex(SOURCE);

const row = (id: string, answer: RuleRow['answer'], at: string | null = null, revision: number | null = null): RuleRow => ({
  id,
  label: id,
  state: answer === 'keep' ? 'approved' : answer === 'change' || answer === 'drop' ? 'changed-on-purpose' : 'open',
  meaning: 'm',
  proposal: null,
  answer,
  by: answer ? 'Sonny' : null,
  at,
  implementation: null,
  tests: [],
  evidence: 'line 2',
  revision,
});

const register = (rows: RuleRow[]): RuleRegister => ({
  state: 'read',
  basis: 'confirmations',
  rows,
  counts: { keep: 0, change: 0, drop: 0, clarify: 0, undecided: rows.length },
});

const project = (over: Partial<Project> & Record<string, unknown> = {}): Project =>
  ({
    id: 'p1',
    name: 'Z_PO_APPROVAL',
    legacyCode: SOURCE,
    activeRunId: 'run-1',
    cleanCoreScore: 62,
    createdAt: '2026-10-12T08:00:00Z',
    solutionDesign: '{"approachDescription":"x"}',
    auditMetadata: { inputFingerprint: { sha256: SHA, fileName: 'a', lineCount: 2, byteSize: 1, uploadedAt: '', objectType: 'Report' } },
    ...over,
  }) as unknown as Project;

const inputs = (over: Partial<ChainInputs> = {}): ChainInputs => ({
  projectId: 'p1',
  project: project(),
  view: 'business',
  evidence: {
    state: 'ready',
    findings: [
      { sapReplacement: { objectName: 'I_PURCHASEORDERAPI01', confidence: 'Catalog Match' } },
      { sapReplacement: { objectName: 'i_purchaseorderapi01' } },
      { sapReplacement: { objectName: 'API_PURCHASEREQ_PROCESS_SRV' } },
      {},
    ],
  },
  rules: { state: 'ready', register: register([row('BR-001', 'keep', '2026-10-11T10:00:00Z', 2), row('BR-002', 'drop', '2026-10-12T09:00:00Z', 3), row('BR-003', null), row('BR-004', 'clarify')]) },
  ...over,
});

test.describe('the chain', () => {
  test('is the phases before Transformation, in workflow order — Economics is never part of it', () => {
    expect(CHAIN_PHASES).toEqual(['analyze', 'design']);
    expect(CHAIN_PHASES).not.toContain('tco');
    const slots = chainSlots(inputs({ contract: 'loading', purpose: { state: 'loading' } }));
    expect(slots.map((s) => s.key)).toEqual(['insights', 'analyze', 'rules', 'design']);
    expect(slots.every((s) => s.phase === null || CHAIN_PHASES.includes(s.phase))).toBe(true);
    for (const s of slots) expect(s.source.href, s.key).not.toMatch(/\/tco\b/);
  });

  test('a slot is "loading" until its contribution is read, then lights with the facts of this project', () => {
    const before = chainSlots(inputs({ contract: 'loading', purpose: { state: 'loading' }, rules: { state: 'loading' } }));
    expect(before.find((s) => s.key === 'insights')!.state).toBe('loading');
    expect(before.find((s) => s.key === 'rules')!.state).toBe('loading');
    expect(before.find((s) => s.key === 'design')!.state).toBe('loading');
    // The evidence was already read by the page: Analyze is lit at once.
    expect(before.find((s) => s.key === 'analyze')!.state).toBe('ready');

    const after = chainSlots(
      inputs({
        contract: { label: 'Side-by-side on SAP BTP', summary: 'Build a CAP service; reject in-app RAP.', contractId: 'AC-1', followsRecommendation: true, deviationReason: null },
        purpose: { state: 'ready', text: 'Approves purchase orders above the limit.', anchors: [{ lineStart: 1, lineEnd: 2 }] },
      }),
    );
    const by = (k: string) => after.find((s) => s.key === k)!;
    expect(by('insights').facts[0].text).toBe('Approves purchase orders above the limit.');
    expect(by('insights').provenance).toBe('reconstructed');
    // Analyze: the signed score, the findings, the distinct successors (case folded).
    expect(by('analyze').facts[0].text).toBe('Clean Core Score 62 · 4 findings · 2 released successors');
    expect(by('analyze').provenance).toBe('proven');
    expect(by('analyze').when).toBe('Signed run, 12 Oct 2026');
    // Rules: 4 rules, keep 1 + drop 1 decided; a Clarify is still open.
    expect(by('rules').facts[0].text).toBe('4 business rules · 2 decided by you (1 keep, 0 change, 1 drop) · 2 open');
    expect(by('rules').provenance).toBe('confirmed');
    expect(by('rules').when).toBe('need revision 3, 12 Oct 2026');
    // Design: the contract's target and its reason; no sign-off, so a proposal.
    expect(by('design').facts.map((f) => f.key)).toEqual(['target', 'reason', 'requirements']);
    expect(by('design').facts[0].text).toBe('Target: Side-by-side on SAP BTP');
    expect(by('design').facts[1].text).toBe('Reason: Build a CAP service; reject in-app RAP.');
    expect(by('design').provenance).toBe('proposed');
  });

  test('says honestly what is missing, stale or unread — each with the way to put it right', () => {
    const noDesign = chainSlots(inputs({ project: project({ solutionDesign: '' }), contract: null, purpose: { state: 'ready', text: null, anchors: [] } }));
    const design = noDesign.find((s) => s.key === 'design')!;
    expect(design.state).toBe('missing');
    expect(design.fix?.href).toBe('/project/p1/design?view=business&origin=transformation.quality');
    expect(noDesign.find((s) => s.key === 'insights')!.state).toBe('missing');

    const unread = chainSlots(inputs({ rules: { state: 'ready', register: { state: 'not-read', reason: 'the source is too large for the rule reader.' } } }));
    expect(unread.find((s) => s.key === 'rules')!).toMatchObject({ state: 'unread', note: 'the source is too large for the rule reader.' });

    // The source changed after the signed run: Analyze and everything on it is stale.
    const moved = chainSlots(inputs({ project: project({ legacyCode: `${SOURCE}\n* changed` }), contract: null }));
    expect(moved.find((s) => s.key === 'analyze')!.state).toBe('stale');
    expect(moved.find((s) => s.key === 'design')!.state).toBe('stale');
    expect(moved.find((s) => s.key === 'design')!.fix).not.toBeNull();

    const noRun = chainSlots(inputs({ project: project({ activeRunId: '' }) }));
    expect(noRun.find((s) => s.key === 'analyze')!.state).toBe('missing');
  });

  test('a design whose target was confirmed is the account’s own, dated by the sign-off', () => {
    const slots = chainSlots(
      inputs({
        project: project({ approvedByArchitect: true, architectSignOffAt: '2026-10-10T12:00:00Z', architectJustifiedOverride: 'External partners need the API.' }),
        contract: { label: 'Side-by-side on SAP BTP', summary: 's', contractId: 'AC-2', followsRecommendation: false, deviationReason: 'External partners need the API.' },
      }),
    );
    const design = slots.find((s) => s.key === 'design')!;
    expect(design.provenance).toBe('confirmed');
    expect(design.facts[0].text).toBe('Target: Side-by-side on SAP BTP, confirmed');
    expect(design.facts[1].text).toBe('Reason: External partners need the API.');
    expect(design.when).toBe('Target confirmed, 10 Oct 2026');
  });

  test('the decision record appears only when one is stored', () => {
    expect(chainSlots(inputs()).some((s) => s.key === 'decision')).toBe(false);
    const withDecision = chainSlots(
      inputs({ project: project({ decision: { decisionId: 'DEC-1', revision: 3, summary: 'Rebuild side by side.', confirmation: { account: 'a@b.c', at: '2026-10-12T10:00:00Z' } } }) }),
    );
    const d = withDecision.find((s) => s.key === 'decision')!;
    expect(d.facts.map((f) => f.text)).toEqual(['DEC-1, revision 3, confirmed', 'Rebuild side by side.']);
    expect(d.provenance).toBe('confirmed');
    expect(d.source.href).toBe('/project/p1?view=management&origin=transformation.quality#decision-card');
  });

  test('every fact says whether today’s prompt reads it, from one flag list', () => {
    const slots = chainSlots(inputs({ contract: null, purpose: { state: 'ready', text: 'P', anchors: [] } }));
    const fact = (slot: string, key: string) => slots.find((s) => s.key === slot)!.facts.find((f) => f.key === key)!;
    expect(fact('insights', 'purpose').read).toBe(PROMPT_READS.purpose);
    expect(fact('analyze', 'score').read).toBe(PROMPT_READS.analysis);
    // Decided rules are the decisions; the decisions are what the flag names.
    expect(fact('rules', 'rules').read).toBe(PROMPT_READS.ruleDecisions);
    expect(fact('design', 'requirements').read).toBe(PROMPT_READS.requirements);
  });
});

test.describe('the tips', () => {
  test('are ordered by impact, each with a real count and its place', () => {
    const tips = qualityTips(inputs());
    expect(tips.map((t) => t.key)).toEqual(['rules', 'requirements', 'target']);
    expect(tips.map((t) => t.rank)).toEqual([1, 2, 3]);
    const [rules, requirements, target] = tips;
    expect(rules.count).toBe('2 of 4 rules open');
    expect(rules.impact).toMatch(/keep, change or drop/);
    expect(rules.links[0].href).toBe('/project/p1?view=business&origin=transformation.quality#business-rules');
    expect(requirements.title).toBe('Write the requirements specification');
    expect(requirements.links[0].href).toBe('/project/p1/design/requirements?view=business&origin=transformation.quality');
    expect(target.links[0].href).toBe('/project/p1/design?view=business&origin=transformation.quality#architect-sign-off');
  });

  test('a requirements specification gives its accepted and open counts, and both sections as links', () => {
    const spec = { functional: 12, nonFunctional: 9, accepted: 5, openDecisions: 3, clarify: 0, revision: 4, savedAt: '2026-10-12T09:00:00Z', derivedFrom: SHA };
    const tips = qualityTips(inputs({ project: project({ requirementsSpec: spec }) }));
    const r = tips.find((t) => t.key === 'requirements')!;
    expect(r.title).toBe('Accept or improve the requirements');
    expect(r.count).toBe('5 of 21 requirements accepted · 3 open decisions');
    expect(r.links.map((l) => [l.label, l.href])).toEqual([
      ['Functional requirements (12)', '/project/p1/design/requirements?view=business&origin=transformation.quality#spec-s3'],
      ['Non-functional requirements (9)', '/project/p1/design/requirements?view=business&origin=transformation.quality#spec-s4'],
    ]);
    // Written for another source: the tip says so instead of counting it as current.
    const stale = qualityTips(inputs({ project: project({ requirementsSpec: { ...spec, derivedFrom: 'f'.repeat(64) } }) }));
    expect(stale.find((t) => t.key === 'requirements')!.title).toBe('Bring the requirements up to date');
    expect(specOf(project({ requirementsSpec: { ...spec, derivedFrom: 'f'.repeat(64) } }))!.stale).toBe(true);
    // Everything accepted and decided: no requirements tip.
    const done = qualityTips(inputs({ project: project({ requirementsSpec: { ...spec, accepted: 21, openDecisions: 0 } }) }));
    expect(done.some((t) => t.key === 'requirements')).toBe(false);
  });

  test('nothing open is an empty list — the card is one line then', () => {
    const spec = { functional: 2, nonFunctional: 1, accepted: 3, openDecisions: 0, revision: 1, savedAt: 'x', derivedFrom: SHA };
    const tips = qualityTips(
      inputs({
        project: project({ requirementsSpec: spec, approvedByArchitect: true }),
        rules: { state: 'ready', register: register([row('BR-001', 'keep'), row('BR-002', 'change')]) },
      }),
    );
    expect(tips).toEqual([]);
    // No rules in the source: no rules tip, never "0 of 0".
    const none = qualityTips(inputs({ rules: { state: 'ready', register: { state: 'not-detected', reason: 'r' } } }));
    expect(none.some((t) => t.key === 'rules')).toBe(false);
  });

  test('while the rules are being read the tip says so — no stale count', () => {
    const tips = qualityTips(inputs({ rules: { state: 'loading' } }));
    expect(tips[0]).toMatchObject({ key: 'rules', count: null });
  });

  test('a sign-off given for a previous source is the blocker the stage says, never a tip as well', () => {
    const p = project({
      approvedByArchitect: true,
      legacyCode: `${SOURCE}\n* moved`,
    });
    expect(qualityTips(inputs({ project: p })).some((t) => t.key === 'target')).toBe(false);
  });

  test('the origin is one of the closed list, and its way back lands on the tips', () => {
    expect(QUALITY_ORIGIN).toBe('transformation.quality');
    expect(ORIGINS[QUALITY_ORIGIN].anchor).toBe(QUALITY_ANCHOR);
    expect(originBackHref({ base: '/project/p1', origin: QUALITY_ORIGIN, search: '?view=business&origin=transformation.quality' })).toBe(
      '/project/p1/transformation?view=business#tf-quality',
    );
    expect(originBackLabel(QUALITY_ORIGIN)?.place).toBe('Transformation, Raise the quality');
  });
});

test.describe('the stages', () => {
  test('are the stages that exist today, and only those', () => {
    expect(GENERATION_STAGE_ORDER).toEqual(['contract', 'facts', 'model', 'checks', 'storing']);
    expect(generationStages({}).every((s) => s.state === 'pending')).toBe(true);
  });

  test('advance in order: entering one ends the one before; a failure stops the running one', () => {
    let log = enterStage({}, 'contract', 1000);
    log = enterStage(log, 'facts', 1500);
    log = enterStage(log, 'model', 2000, { attempt: { n: 1, of: 2 } });
    expect(generationStages(log).map((s) => s.state)).toEqual(['done', 'done', 'active', 'pending', 'pending']);
    // A second model call continues the same stage from its first start.
    log = enterStage(log, 'model', 9000, { attempt: { n: 2, of: 2 }, detail: 'Retrying once' });
    const model = generationStages(log).find((s) => s.key === 'model')!;
    expect(model).toMatchObject({ startedAt: 2000, attempt: { n: 2, of: 2 }, detail: 'Retrying once' });
    expect(model.note).toMatch(/no percentage/);
    log = withChecks(enterStage(log, 'checks', 10_000), pendingChecks());
    log = withChecks(log, setCheck(log.checks!.checks!, 'files', 'passed', '5 files'));
    log = withChecks(log, setCheck(log.checks!.checks!, 'paths', 'failed', 'srv/a.ts'));
    log = finishStages(log, 10_500, 'failed');
    const stages = generationStages(log);
    expect(stages.find((s) => s.key === 'checks')!.state).toBe('failed');
    expect(stages.find((s) => s.key === 'storing')!.state).toBe('pending');
    expect(stages.find((s) => s.key === 'checks')!.checks!.map((c) => c.state)).toEqual(['passed', 'failed', 'pending', 'pending', 'pending']);
  });
});

test.describe('the page', () => {
  const PAGE = fs.readFileSync(path.resolve(__dirname, '..', 'app/(app)/project/[projectId]/transformation/page.tsx'), 'utf8');
  const code = PAGE.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  test('no generation starts from the load; the tips and the header start it, through one handler', () => {
    const load = code.slice(code.indexOf('const fetchProject = async'), code.indexOf('fetchProject();'));
    expect(load).not.toContain('generateTransformation(');
    expect(code).not.toContain('awaitingAutoGeneration');
    expect(code).toMatch(/<QualityTips[\s\S]*?onGenerate=\{startGeneration\}/);
    expect(code).toMatch(/data-generate-code=""/);
  });

  test('the generation screen is the chain, not a bar that estimates or a log written ahead of the work', () => {
    expect(code).toContain('<GenerationChain');
    expect(code).not.toContain('role="progressbar"');
    expect(code).not.toMatch(/Parsing legacy ABAP structures|Initializing transformation engine|Optimizing imports/);
  });

  test('the prompt seam: what the screen calls read is what the prompt carries', () => {
    // The prompt carries the source, the narrative and the design ...
    expect(PROMPT_READS.analysis && PROMPT_READS.design && PROMPT_READS.rules).toBe(true);
    expect(code).toMatch(/Legacy ABAP Code:\s*\$\{legacyCode\}/);
    expect(code).toMatch(/Solution Design:\s*\$\{design\}/);
    // ... and nothing of the decisions or requirements yet; a flag flips with the input.
    if (!PROMPT_READS.ruleDecisions) expect(code).not.toMatch(/ruleRegister[^\n]*prompt|prompt[^\n]*ruleRegister/);
  });
});
