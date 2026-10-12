import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  CHAIN_PHASES,
  CHAIN_SLOTS,
  GENERATION_STAGE_ORDER,
  PROMPT_READS,
  QUALITY_ANCHOR,
  QUALITY_ORIGIN,
  chainSlots,
  enterStage,
  finishStages,
  generationStages,
  originalFactsLines,
  pendingChecks,
  purposeFromContext,
  qualityTips,
  setCheck,
  specOfRecord,
  tipsSettled,
  withChecks,
  withFacts,
  type ChainInputs,
} from '../lib/transformation-chain';
import { ORIGINS, originBackHref, originBackLabel } from '../lib/choice-addresses';
import { PHASES } from '../lib/workflow-steps';
import { buildTransformationContext } from '../lib/transformation-context';
import { tfCostLine, tfContextAnnouncement } from '../lib/messages/transformation';
import type { RuleRegister, RuleRow } from '../lib/rule-register';
import type { Project } from '../lib/types';
import { sha256Hex } from '../lib/artefact-digest';

/**
 * Roadmap 3.0.12 (owner 12.10.2026; design §14–§15, mockup
 * `docs/roadmap/transformation-generation-mockup.html`): the Transformation
 * tool's tips before a run and its generation screen, from one pure model.
 * Server-free: every input is a fixture, as the page holds it.
 */

const SOURCE = 'REPORT z_po_approval.\nSELECT SINGLE * FROM ekko INTO @DATA(ls) WHERE ebeln = @p_ebeln.\n';
const SHA = sha256Hex(SOURCE);

const row = (id: string, answer: RuleRow['answer'], revision: number | null = null): RuleRow => ({
  id,
  label: id,
  state: answer === 'keep' ? 'approved' : answer === 'change' || answer === 'drop' ? 'changed-on-purpose' : 'open',
  meaning: 'm',
  proposal: null,
  answer,
  by: answer ? 'Sonny' : null,
  at: answer ? '2026-10-12T09:00:00Z' : null,
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

const project = (over: Record<string, unknown> = {}): Project =>
  ({
    id: 'p1',
    name: 'Z_PO_APPROVAL',
    legacyCode: SOURCE,
    activeRunId: 'run-1',
    cleanCoreScore: 62,
    createdAt: '2026-10-12T08:00:00Z',
    solutionDesign: '{"approachDescription":"x"}',
    originalRecommendation: 'cap',
    recommendationJustification: 'It uploads files and runs outside the posting LUW.',
    auditMetadata: { inputFingerprint: { sha256: SHA, fileName: 'a', lineCount: 2, byteSize: 1, uploadedAt: '', objectType: 'Report' } },
    ...over,
  }) as unknown as Project;

const specRecord = (reqs: Array<[string, string]>, derivedFrom = SHA) => ({
  spec: { requirements: reqs.map(([kind, status], i) => ({ id: `R${i}`, kind, status })), decisions: [] },
  revision: 2,
  savedAt: '2026-10-11T09:00:00Z',
  derivedFrom,
});

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
  rules: { state: 'ready', register: register([row('BR-001', 'keep', 3), row('BR-002', 'drop', 3), row('BR-003', null), row('BR-004', 'clarify')]) },
  spec: { state: 'ready', spec: specOfRecord(specRecord([['functional', 'accepted'], ['functional', 'draft'], ['functional', 'clarify'], ['functional', 'rejected'], ['non-functional', 'draft']]), project()) },
  purpose: { state: 'ready', text: 'Approves purchase orders above the limit.' },
  ...over,
});

test.describe('the chain', () => {
  test('is the phases before Transformation, in workflow order — Economics is never part of it', () => {
    expect(CHAIN_PHASES).toEqual(['analyze', 'design']);
    const transformation = PHASES.find((p) => p.key === 'transformation')!.n;
    for (const s of CHAIN_SLOTS) expect(PHASES.find((p) => p.key === s.phase)!.n, s.key).toBeLessThan(transformation);
    const slots = chainSlots(inputs());
    expect(slots.map((s) => s.key)).toEqual(['first-insights', 'analyze', 'business-rules', 'design', 'requirements', 'decision-record']);
    expect(slots.map((s) => s.phase)).toEqual(['analyze', 'analyze', 'analyze', 'design', 'design', 'design']);
    for (const s of slots) {
      expect(s.phase, s.key).not.toBe('tco');
      expect(s.source.href, s.key).not.toMatch(/\/tco\b/);
    }
  });

  test('every slot says the facts of this project, each with its level', () => {
    const by = (k: string) => chainSlots(inputs()).find((s) => s.key === k)!;
    expect(by('first-insights').facts.map((f) => [f.text, f.provenance])).toEqual([['What it is for: Approves purchase orders above the limit.', 'reconstructed']]);
    // Analyze: the signed score with the findings, then the distinct successors (case folded) from SAP's catalog.
    expect(by('analyze').facts.map((f) => [f.text, f.provenance])).toEqual([
      ['Clean Core Score 62 · 4 findings', 'reconstructed'],
      ['2 released SAP successors for the objects it uses', 'imported'],
    ]);
    expect(by('analyze').when).toBe('signed run 12 Oct 2026');
    // Rules: keep 1 + drop 1 decided; a Clarify is a question and still open.
    expect(by('business-rules').facts.map((f) => [f.text, f.provenance])).toEqual([
      ['4 rules — 2 decided by you: 1 keep, 0 change, 1 drop', 'confirmed'],
      ['2 open — implemented as the original and marked open', 'not-determined'],
    ]);
    expect(by('business-rules').when).toBe('need revision 3');
    expect(by('business-rules').warn?.text).toBe('2 rules have no decision yet.');
    expect(by('business-rules').warn?.fix.href).toBe('/project/p1?view=business&origin=transformation.tips#business-rules');
    // Design: the route with its reason, a proposal until confirmed; the warning leads to the sign-off.
    expect(by('design').facts[0]).toMatchObject({ text: 'Target: Side-by-side (CAP) — reason: It uploads files and runs outside the posting LUW.', provenance: 'proposed' });
    expect(by('design').warn?.fix.href).toBe('/project/p1/design?view=business&origin=transformation.tips#architect-sign-off');
    // Requirements: functional accepted against proposed (rejected count as neither).
    expect(by('requirements').facts.map((f) => f.text)).toEqual([
      '3 functional requirements — 1 accepted, 2 proposed',
      '1 non-functional requirement — 0 accepted, 1 proposed',
    ]);
    expect(by('requirements').when).toBe('revision 2');
    expect(by('requirements').warn?.fix.href).toBe('/project/p1/design/requirements?view=business&origin=transformation.tips#spec-s3');
    // No decision on record: said, with the place to record it.
    expect(by('decision-record')).toMatchObject({ state: 'missing', warn: { text: 'No decision recorded yet.' } });
    expect(by('decision-record').warn?.fix.href).toBe('/project/p1?view=management&origin=transformation.tips#decision-options');
  });

  test('says honestly what is loading, missing, unread or out of date', () => {
    const loading = chainSlots(inputs({ rules: { state: 'loading' }, spec: { state: 'loading' }, purpose: { state: 'loading' }, evidence: { state: 'loading' } }));
    expect(loading.filter((s) => s.state === 'loading').map((s) => s.key)).toEqual(['first-insights', 'analyze', 'business-rules', 'requirements']);

    const noDesign = chainSlots(inputs({ project: project({ solutionDesign: '' }), purpose: { state: 'ready', text: null } }));
    expect(noDesign.find((s) => s.key === 'design')).toMatchObject({ state: 'missing' });
    expect(noDesign.find((s) => s.key === 'first-insights')).toMatchObject({ state: 'missing' });

    const unread = chainSlots(inputs({ rules: { state: 'ready', register: { state: 'not-read', reason: 'the source is too large for the rule reader.' } } }));
    expect(unread.find((s) => s.key === 'business-rules')).toMatchObject({ state: 'unread' });

    // The source changed after the signed run: Analyze and the design say so.
    const moved = chainSlots(inputs({ project: project({ legacyCode: `${SOURCE}\n* changed` }) }));
    expect(moved.find((s) => s.key === 'analyze')!.warn?.text).toBe('The source changed after the signed run.');
    expect(moved.find((s) => s.key === 'design')!.warn?.text).toBe('Built for a previous source.');

    // A specification written for another source.
    const staleSpec = chainSlots(inputs({ spec: { state: 'ready', spec: specOfRecord(specRecord([['functional', 'accepted']], 'f'.repeat(64)), project()) } }));
    expect(staleSpec.find((s) => s.key === 'requirements')!.warn?.text).toBe('Written for an earlier source.');
  });

  test('a confirmed target and a confirmed decision are the account’s own', () => {
    const slots = chainSlots(
      inputs({
        project: project({
          approvedByArchitect: true,
          targetArchitecture: 'rap',
          architectSignOffAt: '2026-10-10T12:00:00Z',
          architectJustifiedOverride: 'Runs inside the posting LUW.',
          decision: { decisionId: 'DEC-1', revision: 3, summary: 'Rebuild side by side.', confirmation: { account: 'a@b.c', at: '2026-10-11T10:00:00Z' } },
        }),
      }),
    );
    const design = slots.find((s) => s.key === 'design')!;
    expect(design.facts[0]).toMatchObject({ text: 'Target: In-app (RAP) — reason: Runs inside the posting LUW.', provenance: 'confirmed' });
    expect(design.when).toBe('target confirmed 10 Oct 2026');
    expect(design.warn).toBeNull();
    const decision = slots.find((s) => s.key === 'decision-record')!;
    expect(decision).toMatchObject({ state: 'ready', when: 'confirmed 11 Oct 2026', warn: null });
    expect(decision.facts[0]).toMatchObject({ text: 'DEC-1, revision 3: Rebuild side by side.', provenance: 'confirmed' });
  });

  test('the purpose during a run is the PLATFORM KNOWLEDGE block’s own sentence', () => {
    const block = buildTransformationContext({
      track: 'node',
      rules: { basis: 'source', revision: null, items: [] },
      decision: { route: { chosen: 'side-by-side-cap', recommended: 'side-by-side-cap', deviationReason: null }, record: null, signedOff: null, reference: null },
      summary: { program: 'Z', purpose: ['Approves purchase orders above the limit.'], reads: [], changes: 'none', changesInFlow: [], changesOnCommand: [], outputs: [], frontEnd: null },
      objects: [],
      nfr: null,
      accepted: null,
      dataMode: null,
      originalFactsBelow: true,
    });
    expect(purposeFromContext(block.text)).toBe('Approves purchase orders above the limit.');
    expect(purposeFromContext('')).toBeNull();
  });

  test('every fact says whether the prompt reads it, from one flag list — today all of them', () => {
    for (const s of chainSlots(inputs())) for (const f of s.facts) expect(f.read, `${s.key}.${f.key}`).toBe(true);
    expect(Object.values(PROMPT_READS).every(Boolean)).toBe(true);
  });
});

test.describe('the tips', () => {
  test('are ordered by impact, each with a real count, its effect in the code and its place', () => {
    const tips = qualityTips(inputs());
    expect(tips.map((t) => [t.key, t.rank, t.count])).toEqual([
      ['rules', 2, 2],
      ['requirements', 3, 2],
      ['non-functional', 4, 1],
      ['target', 5, 1],
      ['decision', 6, 1],
    ]);
    const [rules, reqs, nfr, target, decision] = tips;
    expect(rules.title).toBe('Decide the 2 open rules');
    expect(rules.impact).toMatch(/keep, change or drop/);
    expect(rules.inCode).toMatch(/dropped rule is left out/);
    expect(rules.link.href).toBe('/project/p1?view=business&origin=transformation.tips#business-rules');
    expect(reqs.title).toBe('Accept the 2 proposed requirements');
    expect(reqs.link.href).toBe('/project/p1/design/requirements?view=business&origin=transformation.tips#spec-s3');
    expect(nfr.title).toBe('Accept the proposed non-functional requirement');
    expect(nfr.link.href).toBe('/project/p1/design/requirements?view=business&origin=transformation.tips#spec-s4');
    expect(target.link.href).toBe('/project/p1/design?view=business&origin=transformation.tips#architect-sign-off');
    expect(decision.link.href).toBe('/project/p1?view=management&origin=transformation.tips#decision-options');
  });

  test('no specification: one tip to start it — and nothing open is an empty list', () => {
    const none = qualityTips(inputs({ spec: { state: 'ready', spec: null } }));
    expect(none.find((t) => t.key === 'requirements')).toMatchObject({ title: 'Write the requirements specification', count: null });
    expect(none.some((t) => t.key === 'non-functional')).toBe(false);

    const allDone = inputs({
      project: project({
        approvedByArchitect: true,
        targetArchitecture: 'cap',
        decision: { decisionId: 'DEC-1', revision: 1, summary: 's', confirmation: { account: 'a', at: '2026-10-11T10:00:00Z' } },
      }),
      rules: { state: 'ready', register: register([row('BR-001', 'keep'), row('BR-002', 'change')]) },
      spec: { state: 'ready', spec: specOfRecord(specRecord([['functional', 'accepted'], ['non-functional', 'accepted'], ['functional', 'rejected']]), project()) },
    });
    expect(qualityTips(allDone)).toEqual([]);
    expect(tipsSettled(allDone)).toBe(true);
    // No rules in the source: no rules tip, never "0 open".
    expect(qualityTips(inputs({ rules: { state: 'ready', register: { state: 'not-detected', reason: 'r' } } })).some((t) => t.key === 'rules')).toBe(false);
  });

  test('while the counts are being read, the rules tip has no number and nothing is "settled"', () => {
    const reading = inputs({ rules: { state: 'loading' }, spec: { state: 'loading' } });
    expect(qualityTips(reading)[0]).toMatchObject({ key: 'rules', count: null });
    expect(tipsSettled(reading)).toBe(false);
  });

  test('a sign-off given for a previous source is the blocker the stage says, never a tip as well', () => {
    const p = project({ approvedByArchitect: true, legacyCode: `${SOURCE}\n* moved` });
    expect(qualityTips(inputs({ project: p })).some((t) => t.key === 'target')).toBe(false);
  });

  test('the origin is one of the closed list, and its way back lands on the tips', () => {
    expect(QUALITY_ORIGIN).toBe('transformation.tips');
    expect(ORIGINS[QUALITY_ORIGIN].anchor).toBe(QUALITY_ANCHOR);
    expect(originBackHref({ base: '/project/p1', origin: QUALITY_ORIGIN, search: '?view=business&origin=transformation.tips' })).toBe(
      '/project/p1/transformation?view=business#transformation-tips',
    );
    expect(originBackLabel(QUALITY_ORIGIN)?.place).toBe('Transformation, Before the run');
  });

  test('the cost line says the calls this generation can make, and on whose key', () => {
    expect(tfCostLine(2, 'community')).toBe('No analysis run used · up to 2 model calls on the community key for this generation');
    expect(tfCostLine(2, 'byok')).toBe('No analysis run used · up to 2 model calls on your own Gemini key for this generation');
    expect(tfContextAnnouncement(6, 2)).toBe('Context loaded: 6 sources, 2 need attention.');
  });
});

test.describe('the stages', () => {
  test('are the steps that exist today, and only those', () => {
    expect(GENERATION_STAGE_ORDER).toEqual(['facts', 'model', 'checks', 'storing']);
    expect(generationStages({}).every((s) => s.state === 'pending')).toBe(true);
  });

  test('advance in order: entering one ends the one before; a failure stops the running one', () => {
    let log = enterStage({}, 'facts', 1000);
    log = withFacts(log, 'facts', originalFactsLines({ guards: [1, 2, 3], decimals: [1], inputs: [1, 2] }));
    log = enterStage(log, 'model', 2000, { attempt: { n: 1, of: 2 } });
    expect(generationStages(log).map((s) => s.state)).toEqual(['done', 'active', 'pending', 'pending']);
    expect(generationStages(log)[0].facts).toEqual([
      '3 checks that refuse, stop or skip — kept with their lines',
      '1 packed decimal field with exact places and bounds',
      '2 selection inputs — each honoured or refused',
    ]);
    // A second model call continues the same stage from its first start.
    log = enterStage(log, 'model', 9000, { attempt: { n: 2, of: 2 }, detail: 'Retrying once' });
    expect(generationStages(log)[1]).toMatchObject({ startedAt: 2000, attempt: { n: 2, of: 2 }, detail: 'Retrying once', provenance: 'proposed' });
    log = withChecks(enterStage(log, 'checks', 10_000), pendingChecks());
    log = withChecks(log, setCheck(log.checks!.checks!, 'files', 'met', '5 files'));
    log = withChecks(log, setCheck(log.checks!.checks!, 'paths', 'failed', 'srv/a.ts'));
    log = finishStages(log, 10_500, 'failed');
    const stages = generationStages(log);
    expect(stages.find((s) => s.key === 'checks')!.state).toBe('failed');
    expect(stages.find((s) => s.key === 'storing')!.state).toBe('pending');
    expect(stages.find((s) => s.key === 'checks')!.checks!.map((c) => c.state)).toEqual(['met', 'failed', 'pending', 'pending', 'pending']);
  });
});

test.describe('the page', () => {
  const PAGE = fs.readFileSync(path.resolve(__dirname, '..', 'app/(app)/project/[projectId]/transformation/page.tsx'), 'utf8');
  const code = PAGE.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  test('the load starts nothing; the first generation starts by itself only when no tip is open', () => {
    const load = code.slice(code.indexOf('const fetchProject = async'), code.indexOf('fetchProject();'));
    expect(load).not.toContain('generateTransformation(');
    expect(code).toMatch(/const nothingOpen = settled && tips\.length === 0;/);
    expect(code).toMatch(/if \(autoStarted\.current \|\| !nothingOpen \|\| !canGenerate \|\| files\.length > 0/);
    expect(code).toMatch(/<QualityTips[\s\S]*?onGenerate=\{startGeneration\}/);
  });

  test('the generation screen is the chain, not a bar that estimates or a log written ahead of the work', () => {
    expect(code).toContain('<GenerationChain');
    expect(code).not.toContain('role="progressbar"');
    expect(code).not.toMatch(/Parsing legacy ABAP structures|Initializing transformation engine|Optimizing imports/);
  });

  test('the chain lights from the block the prompt carries, and the prompt carries it', () => {
    expect(code).toMatch(/const platformKnowledge = generation\.inputs\.context\.text;/);
    expect(code).toMatch(/purposeFromContext\(platformKnowledge\)/);
    expect(code).toMatch(/Solution Design:\s*\$\{design\}\s*\$\{platformKnowledge\}/);
  });
});
