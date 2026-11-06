import { test, expect } from '@playwright/test';
import type { Project } from '../lib/types';
import { workflowSteps } from '../lib/workflow-steps';
import { abapCheck } from '../lib/transformation/abap-check';
import { abaplintPackageCheck } from '../lib/transformation/abaplint-check';
import { localObjectTypes } from '../lib/transformation/rap-contract';
import { candidateFiles, prepareEngineLed } from '../lib/transformation/engine-led';
import { readEngineFacts } from '../lib/transformation';
import { FILL_COMPACT_CONDITION_MAX_CHARS, LEASED_PROMPT_MAX_CHARS, bundleFills, compactFillUnitOf, fillPrompt } from '../lib/transformation/fill-prompt';
import type { FillRequestUnit } from '../lib/transformation/types';
import fs from 'node:fs';
import path from 'node:path';
import { checkAbapTestClass, shortenLongAbapMethodNames } from '../lib/testing-abap-unit';
import { abapMethodMatches } from '../lib/abap-unit-method';
import { MODEL_NETWORK_CODE, providerConnectionFailure } from '../lib/model-deadline';
import { modelErrorKind } from '../lib/transformation/orchestrator';
import { absentClaims, capabilityPresence } from '../lib/documentation-capabilities';
import { capabilityFactsOf } from '../lib/documentation-facts';
import { buildProcessSkeleton } from '../lib/abap/process-skeleton';
import { programSummaryFactsOf } from '../lib/program-summary-facts';
import { programSummary } from '../lib/program-summary-text';
import { EMPTY_SECTION } from '../lib/process-document';
import { effortProposalFor, proposeEffort, type CostOption, type OptionKind } from '../lib/cost-assumptions';
import { effortDerivation } from '../lib/economics-help';
import { takeOverPatch, type OptionProposals } from '../components/tco/OptionComparison';
import { countSourceLines } from '../lib/source-lines';
import { aiAuthorshipFactsOf, markedTransformationDraft, withProjectExportAiGeneration } from '../lib/ai-authorship';

/**
 * Hotfix 3.0.22 (docs/design/analyze-business-first-plan.md §4.0, HF-a to HF-e), from a full run of owner example A
 * on 06.11.2026. The owner's program stays outside the repository; the fixtures here are written for this spec and
 * only share its shape (a local interface, a service class holding a reference to it, a local exception class).
 * Server-free: library code only.
 */

/** A small object-oriented report: a store interface, an in-memory store, a service that holds `REF TO` the interface. */
export const OO_SHAPE = [
  'REPORT zccio_oo_shape.',
  'TYPES: BEGIN OF ty_item,',
  '         id    TYPE i,',
  '         state TYPE string,',
  '       END OF ty_item.',
  'TYPES tt_items TYPE STANDARD TABLE OF ty_item WITH EMPTY KEY.',
  'CLASS lcx_refused DEFINITION INHERITING FROM cx_static_check FINAL.',
  '  PUBLIC SECTION.',
  '    DATA code TYPE string.',
  'ENDCLASS.',
  'CLASS lcx_refused IMPLEMENTATION.',
  'ENDCLASS.',
  'INTERFACE lif_items.',
  '  METHODS read IMPORTING iv_id TYPE i RETURNING VALUE(rs_item) TYPE ty_item.',
  '  METHODS save IMPORTING is_item TYPE ty_item.',
  'ENDINTERFACE.',
  'CLASS lcl_items DEFINITION FINAL.',
  '  PUBLIC SECTION.',
  '    INTERFACES lif_items.',
  '  PRIVATE SECTION.',
  '    DATA mt_items TYPE tt_items.',
  'ENDCLASS.',
  'CLASS lcl_items IMPLEMENTATION.',
  '  METHOD lif_items~read.',
  '    READ TABLE mt_items INTO rs_item WITH KEY id = iv_id.',
  '  ENDMETHOD.',
  '  METHOD lif_items~save.',
  '    APPEND is_item TO mt_items.',
  '  ENDMETHOD.',
  'ENDCLASS.',
  'CLASS lcl_service DEFINITION FINAL.',
  '  PUBLIC SECTION.',
  '    METHODS constructor IMPORTING io_items TYPE REF TO lif_items.',
  '    METHODS submit IMPORTING iv_id TYPE i.',
  '  PRIVATE SECTION.',
  '    DATA mo_items TYPE REF TO lif_items.',
  'ENDCLASS.',
  'CLASS lcl_service IMPLEMENTATION.',
  '  METHOD constructor.',
  '    mo_items = io_items.',
  '  ENDMETHOD.',
  '  METHOD submit.',
  '    DATA ls_item TYPE ty_item.',
  '    ls_item = mo_items->read( iv_id ).',
  "    IF ls_item-state <> 'DRAFT'.",
  '      RETURN.',
  '    ENDIF.',
  "    ls_item-state = 'SUBMITTED'.",
  '    mo_items->save( ls_item ).',
  '  ENDMETHOD.',
  'ENDCLASS.',
  'CLASS lcl_batch DEFINITION FINAL.',
  '  PUBLIC SECTION.',
  '    CLASS-METHODS run IMPORTING io_service TYPE REF TO lcl_service.',
  'ENDCLASS.',
  'CLASS lcl_batch IMPLEMENTATION.',
  '  METHOD run.',
  '    io_service->submit( 1 ).',
  '  ENDMETHOD.',
  'ENDCLASS.',
  'START-OF-SELECTION.',
  '  DATA lo_items TYPE REF TO lif_items.',
  '  lo_items = NEW lcl_items( ).',
  '  lcl_batch=>run( NEW lcl_service( lo_items ) ).',
].join('\n');

const ooPrep = () => {
  const prep = prepareEngineLed({ source: OO_SHAPE, track: 'rap', program: null, decisions: [], contextText: '' });
  if (!prep.ok) throw new Error(prep.reason);
  return prep;
};

test.describe('HF-a: the frame of an object-oriented program names only types the package has', () => {
  test('the original’s own classes and interfaces are read, a local exception class maps to its global ancestor', () => {
    const types = localObjectTypes(readEngineFacts(OO_SHAPE).statements);
    expect(Object.fromEntries(types)).toEqual({ lif_items: null, lcx_refused: 'cx_static_check', lcl_items: null, lcl_service: null, lcl_batch: null });
  });

  test('no declaration of the logic class names a local type of the original; the stubs activate', () => {
    const prep = ooPrep();
    const logic = prep.scaffold.files.find((f) => /_logic\.clas\.abap$/.test(f.path))!;
    const frame = logic.content.split('\n').filter((l) => !/^\s*"/.test(l));
    expect(frame.filter((l) => /\bREF\s+TO\s+(?:lif_|lcl_|lcx_)/i.test(l))).toEqual([]);
    expect(logic.content).toMatch(/io_items TYPE REF TO zcl_\w+_logic/);
    const r = abapCheck(prep.scaffold.files);
    if (!r.ran) throw new Error(r.reason);
    expect(r.findings.filter((f) => f.kind === 'parser' || f.kind === 'syntax')).toEqual([]);
    expect(r.activation.activatable).toBe(true);
  });

  test('the tool bar never says "done" while the stored activation check fails', () => {
    const prep = ooPrep();
    const bodies = new Map<string, string>(prep.fillUnits.map((u) => [u.unitId, 'RETURN.']));
    const project = (broken: boolean) => {
      if (broken) bodies.set(prep.fillUnits[0].unitId, 'me->no_such_method( ).');
      else bodies.set(prep.fillUnits[0].unitId, 'RETURN.');
      const files = candidateFiles(prep, bodies);
      return {
        id: 'p-oo',
        userId: 'u',
        legacyCode: OO_SHAPE,
        activeRunId: 'run-1',
        analysis: JSON.stringify({ cleanCoreScore: 90 }),
        solutionDesign: '# RAP',
        approvedByArchitect: true,
        generatedCode: JSON.stringify(files),
        generationBinding: { path: 'engine-led', engine: { status: 'complete', units: prep.fillUnits.length, notWritten: [] }, abaplint: abaplintPackageCheck(files) },
      } as unknown as Project;
    };
    const step = (p: Project) => workflowSteps(p).find((s) => s.key === 'transformation')!;
    const broken = step(project(true));
    expect(broken.state).toBe('partial');
    expect(broken.badge).toBe('Generated · not activatable');
    expect(broken.detail).toMatch(/not activatable/);
    expect(step(project(false)).state).toBe('done');
  });
});

test.describe('HF-b: a unit over the cap with its rules by title and no context still travels, compacted', () => {
  const abap = (lines: number) => Array.from({ length: lines }, (_, i) => `${String(i + 1).padStart(4, '0')}   ${'x'.repeat(80)}`).join('\n');
  const big = (lines: number, guards: number): FillRequestUnit => ({
    unitId: 'U25',
    function: { name: 'dispatch', file: 'src/zcl_x_logic.clas.abap', signature: 'METHOD dispatch.', returns: 'rs_result' },
    abap: { ranges: [{ lineStart: 1, lineEnd: lines, routine: 'DISPATCH' }], text: abap(lines) },
    rules: Array.from({ length: 15 }, (_, i) => ({
      id: `BR-${String(i + 1).padStart(3, '0')}`,
      decision: i === 0 ? ('change' as const) : ('open' as const),
      text: `In DISPATCH, the code tests is_command-action = 'STEP_${i}'. If it holds, the code of this branch runs and the request moves on.`,
      ...(i === 0 ? { proposal: 'At most 50 patches, read from configuration � the owner�s decision, never cut.' } : {}),
    })),
    guards: Array.from({ length: guards }, (_, i) => ({
      id: `G-${String(700 + i * 3).padStart(4, '0')}`,
      rule: `BR-${String((i % 15) + 1).padStart(3, '0')}`,
      helper: `guard_BR_${i}`,
      condition: `ls_req-version <> is_command-expected_version AND ls_req-state <> 'APPLIED' AND lv_case_${i} IS INITIAL`,
      effect: 'raise lcx_rejected with the code of this check, as the original raises it',
      line: 700 + i * 3,
      placement: 'body' as const,
      values: ['lsReq', 'isCommand'],
    })),
    facts: { decimals: [] },
    available: { helpers: [], callees: [] },
  });
  const context = Array.from({ length: 40 }, (_, i) => `- platform fact ${i}: ${'k'.repeat(50)}`).join('\n');

  test('first the code-draft rules by title and the context, then the rules� and checks� text by their start � never the ABAP', () => {
    const unit = big(150, 30);
    const brief = fillPrompt({ schema: 'cc.fill.v1', track: 'rap', program: 'ZX', context: '', rules: 'See CODE-DRAFT RULES in the header.', units: [unit], repair: null }, { briefRules: true });
    // The case of owner example A: over the cap even with the rules by title and no context at all.
    expect(brief.length).toBeGreaterThan(LEASED_PROMPT_MAX_CHARS);
    const [b] = bundleFills([unit], { track: 'rap', program: 'ZX', context });
    expect(b.prompt.length).toBeLessThanOrEqual(LEASED_PROMPT_MAX_CHARS);
    expect(b.trimmed.map((t) => t.what)).toEqual(['rules', 'context', 'guards']);
    const sent = b.request.units[0];
    expect(sent.abap.text).toBe(unit.abap.text);
    expect(sent.guards.map((g) => g.id)).toEqual(unit.guards.map((g) => g.id));
    expect(sent.guards.every((g) => g.condition.length <= FILL_COMPACT_CONDITION_MAX_CHARS)).toBe(true);
    // The owner's change travels with its proposal whole.
    expect(sent.rules[0]).toMatchObject({ decision: 'change', proposal: unit.rules[0].proposal });
    expect(b.prompt).toBe(fillPrompt(b.request, { briefRules: true }));
  });

  test('a unit too large even compacted is still sent over the cap with its whole ABAP, so the orchestrator names it', () => {
    const [b] = bundleFills([big(400, 18)], { track: 'rap', program: 'ZX', context });
    expect(b.prompt.length).toBeGreaterThan(LEASED_PROMPT_MAX_CHARS);
    expect(b.request.units[0].abap.text).toBe(big(400, 18).abap.text);
  });

  test('compacting keeps every id, line, value and decision', () => {
    const unit = big(10, 3);
    const c = compactFillUnitOf(unit);
    expect(c.guards.map(({ id, line, values, placement }) => ({ id, line, values, placement }))).toEqual(unit.guards.map(({ id, line, values, placement }) => ({ id, line, values, placement })));
    expect(c.rules.map((r) => [r.id, r.decision])).toEqual(unit.rules.map((r) => [r.id, r.decision]));
    expect(c.abap).toEqual(unit.abap);
  });
});

test.describe('HF-c: Testing — names shortened, never a failed attempt; a failed call says what it was', () => {
  const suite = [
    'CLASS ltcl_test DEFINITION FINAL FOR TESTING DURATION SHORT RISK LEVEL HARMLESS.',
    '  PRIVATE SECTION.',
    '    METHODS tc_01_submit_request_from_draft_ok FOR TESTING.',
    '    METHODS tc_02_submit_request_from_draft_no FOR TESTING.',
    '    METHODS tc_03_short FOR TESTING.',
    'ENDCLASS.',
    'CLASS ltcl_test IMPLEMENTATION.',
    '  METHOD tc_01_submit_request_from_draft_ok.',
    "    \" tc_01_submit_request_from_draft_ok stays in this comment",
    "    cl_abap_unit_assert=>assert_true( act = abap_true msg = 'tc_02_submit_request_from_draft_no' ).",
    '  ENDMETHOD.',
    '  METHOD tc_02_submit_request_from_draft_no.',
    '    me->tc_03_short( ).',
    '  ENDMETHOD.',
    '  METHOD tc_03_short.',
    '  ENDMETHOD.',
    'ENDCLASS.',
  ].join('\n');

  test('every name over 30 characters is cut to 30, unique, everywhere it is used — comments and literals untouched', () => {
    const before = checkAbapTestClass(suite, []);
    expect(before.problems.filter((p) => p.kind === 'name-too-long').map((p) => p.name)).toEqual(['tc_01_submit_request_from_draft_ok', 'tc_02_submit_request_from_draft_no']);
    const short = shortenLongAbapMethodNames(suite);
    expect(short.renamed).toEqual([
      { from: 'tc_01_submit_request_from_draft_ok', to: 'tc_01_submit_request_from_draf' },
      { from: 'tc_02_submit_request_from_draft_no', to: 'tc_02_submit_request_from_draf' },
    ]);
    const after = checkAbapTestClass(short.code, []);
    expect(after.problems.filter((p) => p.kind === 'name-too-long')).toEqual([]);
    expect(short.code).toContain('METHOD tc_01_submit_request_from_draf.');
    expect(short.code).toContain('" tc_01_submit_request_from_draft_ok stays in this comment');
    expect(short.code).toContain("msg = 'tc_02_submit_request_from_draft_no'");
    expect(short.code.split('\n')[0]).toMatch(/^" Clean-Core\.io: 2 method names longer than 30 characters shortened: /);
    // The scenario a method stands for still matches it by its prefix.
    expect(abapMethodMatches('tc_01_submit_request_from_draf', 'TC_01')).toBe(true);
    expect(shortenLongAbapMethodNames(short.code.split('\n').slice(1).join('\n')).renamed).toEqual([]);
  });

  test('a collision gets a numbered name; the same input always gives the same names', () => {
    const twins = suite.replace(/tc_02_submit_request_from_draft_no/g, 'tc_01_submit_request_from_draft_no');
    const a = shortenLongAbapMethodNames(twins);
    expect(a.renamed.map((r) => r.to)).toEqual(['tc_01_submit_request_from_draf', 'tc_01_submit_request_from_dr_2']);
    expect(a.renamed.every((r) => r.to.length <= 30)).toBe(true);
    expect(shortenLongAbapMethodNames(twins)).toEqual(a);
  });

  test('the Testing hook shortens before it checks, and stores the shortened code', () => {
    const hook = fs.readFileSync(path.join(__dirname, '..', 'hooks', 'useTestGeneration.ts'), 'utf8');
    expect(hook.indexOf('shortenLongAbapMethodNames(')).toBeGreaterThan(0);
    expect(hook.indexOf('shortenLongAbapMethodNames(')).toBeLessThan(hook.indexOf('checkAbapTestClass(seamed.code'));
    expect(hook).toContain('short.renamed.length > 0');
  });

  test('a call that waited past undici’s header timeout is a timeout, not a network or regional problem', () => {
    const headers = Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('Headers Timeout Error'), { name: 'HeadersTimeoutError', code: 'UND_ERR_HEADERS_TIMEOUT' }) });
    const t = providerConnectionFailure(headers, 304_000)!;
    expect(t).toMatchObject({ kind: 'timeout', code: 'UND_ERR_HEADERS_TIMEOUT' });
    expect(t.message).toBe('The connection to the model provider timed out after 304 seconds while waiting for its answer (UND_ERR_HEADERS_TIMEOUT), so the call was stopped. Nothing from it was used — try again.');
    const dns = providerConnectionFailure(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } }), 120)!;
    expect(dns).toMatchObject({ kind: 'network', code: 'ENOTFOUND' });
    expect(dns.message).toBe('The connection to the model provider failed (ENOTFOUND): no answer was received. Nothing from it was used — try again.');
    expect(providerConnectionFailure(new TypeError('fetch failed'))).toMatchObject({ kind: 'network', code: null });
    expect(providerConnectionFailure(new Error('400 INVALID_ARGUMENT'))).toBeNull();
    for (const f of [t, dns]) expect(f.message).not.toMatch(/regional/i);
    // The orchestrator asks such a call once more, as it asked the "Network error" it replaces.
    expect(modelErrorKind(Object.assign(new Error(t.message), { status: 504, code: MODEL_NETWORK_CODE }))).toBe('retry-transient');
    const route = fs.readFileSync(path.join(__dirname, '..', 'app', 'api', 'gemini', 'route.ts'), 'utf8');
    expect(route).not.toContain('regional restrictions');
    expect(route).toContain('providerConnectionFailure(error, Date.now() - arrivedAt)');
  });
});

test.describe('HF-d: no text asserts an absence the engine did not check', () => {
  const approvalShape = [
    'REPORT zccio_approval_shape.',
    'PARAMETERS p_action TYPE string DEFAULT `APPROVE`.',
    'DATA gv_state TYPE string VALUE `SUBMITTED`.',
    'DATA gv_approver TYPE string.',
    'START-OF-SELECTION.',
    '  CASE p_action.',
    "    WHEN 'APPROVE'.",
    "      gv_state = 'APPROVED'.",
    '      gv_approver = sy-uname.',
    "    WHEN 'APPLY'.",
    "      IF gv_state <> 'APPROVED'.",
    "        MESSAGE 'Not approved' TYPE 'E'.",
    '      ENDIF.',
    '  ENDCASE.',
    '  WRITE / gv_state.',
  ].join('\n');
  const plainShape = ['REPORT zccio_plain_shape.', 'PARAMETERS p_n TYPE i DEFAULT 3.', 'DATA gv_sum TYPE i.', 'START-OF-SELECTION.', '  gv_sum = p_n * 2.', '  " approval is not a word of this code', '  WRITE / gv_sum.'].join('\n');

  test('an approval the program writes in its own code keeps "no approval" unsaid, and a sentence about it is no false claim', () => {
    const facts = capabilityFactsOf(approvalShape, buildProcessSkeleton(approvalShape));
    // The program's name, the parameter's default, the approver and the state: first line per name.
    expect(facts.ownApproval?.map((o) => `${o.name}@${o.line}`)).toEqual(['ZCCIO_APPROVAL_SHAPE@1', 'APPROVE@2', 'GV_APPROVER@4', 'APPROVED@8']);
    const approval = capabilityPresence(facts).approval;
    expect(approval.present).toBe(false);
    expect(approval.determined).toBe(false);
    expect(absentClaims('The reviewer approves the request before it is applied.', facts)).toEqual([]);
  });

  test('where the engine did read the whole program and found none, it says what it read — not more', () => {
    const facts = capabilityFactsOf(plainShape, buildProcessSkeleton(plainShape));
    expect(facts.ownApproval).toEqual([]);
    const approval = capabilityPresence(facts).approval;
    expect(approval.determined).toBe(true);
    expect(approval.absent).toBe('No SAP workflow or release function is called; its own code approves or overrides nothing.');
    expect(absentClaims('The manager approves each exception.', facts).map((c) => c.capability)).toEqual(['approval']);
    // Facts stored before 3.0.22 never read the program's own code for it: their sentence stops at the calls.
    const { ownApproval: _unread, ...stored } = facts;
    void _unread;
    expect(capabilityPresence(stored).approval.absent).toBe('No SAP workflow or release function is called.');
    for (const s of Object.values(capabilityPresence(facts))) expect(s.absent).not.toMatch(/no approval, release or override workflow/);
  });

  test('a program that approves in its own code is not called "read-only"; one that does not still is', () => {
    const approving = programSummary(programSummaryFactsOf(approvalShape));
    const purpose = approving.lines.find((l) => l.key === 'purpose')!.text;
    expect(purpose).not.toMatch(/read-only/);
    expect(approving.lines.map((l) => l.text).join(' ')).toContain('It does not post or change data in SAP');
    const plain = programSummary(programSummaryFactsOf(plainShape));
    expect(plain.lines.find((l) => l.key === 'purpose')!.text).toMatch(/^A read-only report/);
  });

  test('an empty section says only what the engine reads: never "holds no control" or "calls nothing by name"', () => {
    expect(EMPTY_SECTION.systems).toBe('It reads no table by name and calls no function module, transaction or other program by name.');
    expect(EMPTY_SECTION.controls).toMatch(/^None of the controls the engine reads: no AUTHORITY-CHECK/);
    for (const s of Object.values(EMPTY_SECTION)) expect(s).not.toMatch(/holds no control|calls nothing by name/);
  });
});

test.describe('HF-e: each option its own effort, one count and one line count', () => {
  const option = (kind: OptionKind): CostOption => ({ id: kind, kind, label: kind, oneOff: null, perRelease: null, maintenanceBaselinePerYear: null, upgradeDelay: null, effortSource: 'stated' });

  test('Rebuild, Move to SAP standard and Retire no longer share one proposal; Retire has no running effort, Keep no one-off', () => {
    const base = proposeEffort(936)!;
    const of = (kind: OptionKind) => effortProposalFor(base, kind)!;
    expect(of('rebuild')).toBe(base);
    expect(of('retire').perRelease).toEqual({ devDays: 0, testDays: 0 });
    expect(of('retire').oneOff.high.devDays).toBeLessThan(of('rebuild').oneOff.low.devDays);
    expect(of('keep').oneOff).toEqual({ low: { devDays: 0, testDays: 0 }, high: { devDays: 0, testDays: 0 } });
    expect(of('keep').perRelease).toEqual(base.perRelease);
    expect(of('standard').perRelease.devDays).toBe(0);
    expect(new Set(['rebuild', 'standard', 'retire', 'keep'].map((k) => JSON.stringify([of(k as OptionKind).oneOff, of(k as OptionKind).perRelease]))).size).toBe(4);
    // The derivation the card shows is the option's own.
    expect(effortDerivation(936, of('retire')).find((l) => l.key === 'release-dev')!.result).toMatch(/^0 days$/);
  });

  test('taking the proposals over writes each option its own figures', () => {
    const proposals: OptionProposals = { effort: proposeEffort(936), baseline: null };
    const retire = takeOverPatch(option('retire'), proposals);
    const rebuild = takeOverPatch(option('rebuild'), proposals);
    expect(retire.perRelease).toEqual({ devDays: 0, testDays: 0 });
    expect(rebuild.perRelease).toEqual(proposeEffort(936)!.perRelease);
    expect(retire.oneOff).not.toEqual(rebuild.oneOff);
  });

  test('Documentation counts the source’s lines as every other tool does; Delivery names what was confirmed', () => {
    const page = fs.readFileSync(path.join(__dirname, '..', 'app', '(app)', 'project', '[projectId]', 'documentation', 'page.tsx'), 'utf8');
    expect(page).toContain('${countSourceLines(signedSource.source)} lines of');
    expect(page).not.toMatch(/source\.split\('\\n'\)\.length\} lines/);
    expect(countSourceLines('a\nb\n')).toBe(2);
    const handover = fs.readFileSync(path.join(__dirname, '..', 'lib', 'handover.ts'), 'utf8');
    expect(handover).not.toContain('— no decision recorded yet`');
    expect(handover).toContain('Design target confirmed');
  });
});

test.describe('raw JSON project exports carry the AI-marking field like every other export', () => {
  test('one marking per model-written source, none where no model wrote anything', () => {
    const project = {
      generatedCode: JSON.stringify([{ path: 'src/x.clas.abap', content: 'CLASS x.' }]),
      generationBinding: { path: 'engine-led', model: { receipt: 'verified', provider: 'google-gemini', modelId: 'gemini-x', byok: false, generatedAt: '2026-11-06T10:00:00.000Z', appVersion: 'v3.0.21' } },
      analysis: '# narrative',
      auditMetadata: { modelCard: { modelParticipation: 'none' } },
    };
    const facts = aiAuthorshipFactsOf(project, { documentationFromEngine: true });
    const marked = withProjectExportAiGeneration({ name: 'P' }, facts, 'v3.0.22') as { aiGeneration?: { basis: string; note: string; sources: Record<string, { statement: string; model: string | null }> } };
    expect(Object.keys(marked.aiGeneration!.sources)).toEqual(['code']);
    expect(marked.aiGeneration!.sources.code).toMatchObject({ model: 'gemini-x', provider: 'google-gemini', keyOwner: 'platform', generatedOn: '2026-11-06', basis: 'EU AI Act, Article 50(2)' });
    expect(marked.aiGeneration!.sources.code.statement).toMatch(/^Generated with AI assistance \(.+ gemini-x\) by Clean-Core\.io v3\.0\.21, 2026-11-06$/);
    expect(marked.aiGeneration!.note).toContain('generatedCode');
    expect(Object.keys(marked)[0]).toBe('aiGeneration');
    const none = withProjectExportAiGeneration({ name: 'Q' }, aiAuthorshipFactsOf({ legacyCode: 'REPORT z.' } as never, { documentationFromEngine: true }), 'v3.0.22');
    expect(none).toEqual({ name: 'Q' });
  });

  test('the Transformation draft says it is model-written; the three download sites use the markings', () => {
    const draft = JSON.parse(markedTransformationDraft(JSON.stringify([{ path: 'a', content: 'b' }]), null, 'v3.0.22'));
    expect(draft.aiGeneration.statement).toBe('Generated with AI assistance (provider and model not recorded) by Clean-Core.io v3.0.22, date not recorded');
    expect(draft.files).toEqual([{ path: 'a', content: 'b' }]);
    const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
    expect(read('app', '(app)', 'dashboard', 'page.tsx')).toMatch(/withProjectExportAiGeneration\(exportData,[\s\S]*JSON\.stringify\(marked, null, 2\)/);
    expect(read('components', 'workspace', 'WorkspaceListReport.tsx')).toMatch(/withProjectExportAiGeneration\(data,[\s\S]*JSON\.stringify\(marked, null, 2\)/);
    expect(read('app', '(app)', 'project', '[projectId]', 'transformation', 'page.tsx')).toContain('new Blob([markedTransformationDraft(unsavedDraft, null, APP_VERSION)]');
  });
});
