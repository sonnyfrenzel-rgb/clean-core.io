/**
 * Roadmap 3.0.19 — key-user extensibility as an option for small changes.
 *
 * The engine names key-user candidates from the code, each with its limit and
 * the lines it replaces, and the parts that stay code, each with why
 * (`lib/abap/key-user-candidates.ts`). Key user is the fourth option of the
 * router and the design comparison, and a route a decision can choose
 * (`keyuser`). Its output is a step list, not code (`lib/key-user-steps.ts`).
 *
 * Gated on `KEY_USER_FROM`: every engine test asks 3.0.19 and the engine before
 * it, and the one before it answers what it signed. One test per candidate
 * kind, one per reason a part leaves the route, and the starter example of its
 * own (`Z_SD_DELIVERY_PRIORITY.abap`) pinned candidate by candidate.
 *
 * Server-free.
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { buildAbapEvidence } from '../lib/abap/evidence-model';
import { routeExtensibility } from '../lib/abap/extensibility-router';
import { KEY_USER_FROM, keyUserApplies } from '../lib/abap/key-user-gate';
import { KEY_USER_LOGIC_MAX_STATEMENTS, type KeyUserReading } from '../lib/abap/key-user-candidates';
import { buildKeyUserSteps, keyUserStepsMarkdown, KEY_USER_STEPS_NOTE } from '../lib/key-user-steps';
import { TARGET_ARCHITECTURES } from '../lib/project-commands';
import { optionOfArchitecture } from '../lib/decision-options';
import { ARCHITECTURE_OPTION } from '../lib/decision-draft';
import { offTrackRefusal } from '../lib/generation-direction';
import { declaredDeviation } from '../lib/contract-build';
import { REFERENCE_OF_TARGET } from '../lib/sap-reference-architectures';
import {
  COMPARED_OPTIONS,
  OPTION_COMPARISON_SCHEMA,
  circularReason,
  engineOptionFacts,
  readOptionComparison,
} from '../lib/design-option-comparison';
import { decisionWeighing } from '../lib/decision-weighing';
import { readExample } from './helpers/starter-example-files';

const NEW = 'v3.0.19';
const OLD = 'v3.0.18';
const EXAMPLE = 'Z_SD_DELIVERY_PRIORITY.abap';

const reading = (code: string, engine = NEW, file = 'ZTEST.abap'): KeyUserReading | undefined =>
  buildAbapEvidence(code, file, 'private', undefined, engine).keyUser;
const must = (code: string, file?: string): KeyUserReading => {
  const r = reading(code, NEW, file);
  expect(r, 'a 3.0.19 engine reads key-user candidates').toBeDefined();
  return r!;
};
const tools = (r: KeyUserReading) => r.candidates.map((c) => c.tool);

/* ------------------------------------------------------------- sources */

const SCREEN_EXIT = `FORM userexit_field_modification.
  LOOP AT SCREEN.
    IF screen-name = 'VBAK-AUGRU'.
      screen-required = 1.
    ELSEIF screen-name = 'VBAK-BSTDK' OR screen-name = 'VBAK-IHREZ'.
      screen-active = 0.
    ELSEIF screen-group1 = 'PRC'.
      screen-input = 0.
    ENDIF.
    MODIFY SCREEN.
  ENDLOOP.
ENDFORM.`;

const MASTER_DATA_LIST = `REPORT z_carrier_list.
PARAMETERS p_land TYPE land1.
START-OF-SELECTION.
  SELECT carrier_id, name, land1, phone
    FROM zcarrier_master
    WHERE land1 = @p_land
    INTO TABLE @DATA(lt_carriers).
  SELECT kunnr, name1, ort01
    FROM kna1
    WHERE land1 = @p_land
    INTO TABLE @DATA(lt_customers).
  LOOP AT lt_carriers INTO DATA(ls_carrier).
    WRITE: / ls_carrier-carrier_id, ls_carrier-name, ls_carrier-phone.
  ENDLOOP.
  LOOP AT lt_customers INTO DATA(ls_customer).
    WRITE: / ls_customer-kunnr, ls_customer-name1, ls_customer-ort01.
  ENDLOOP.`;

const DERIVATION_EXIT = `FORM userexit_move_field_to_vbak.
  IF vbak-auart = 'ZFD'.
    vbak-augru = 'Z01'.
    vbak-zzsample = 'X'.
  ENDIF.
ENDFORM.`;

// 4 writing parts: a BAdI that writes, calls another system and commits; an own table written; the list writing it.
const SPLIT = `REPORT z_order_fix.
PARAMETERS p_vbeln TYPE vbeln_va.

CLASS lcl_im_order DEFINITION FINAL.
  PUBLIC SECTION.
    INTERFACES if_ex_badi_sd_sales_x.
ENDCLASS.

CLASS lcl_im_order IMPLEMENTATION.
  METHOD if_ex_badi_sd_sales_x~save_document.
    UPDATE vbak SET zz_checked = 'X' WHERE vbeln = p_vbeln.
    CALL FUNCTION 'Z_NOTIFY_CRM' DESTINATION 'CRM_PROD'
      EXPORTING iv_vbeln = p_vbeln.
    COMMIT WORK.
  ENDMETHOD.
ENDCLASS.

START-OF-SELECTION.
  SELECT SINGLE vbeln, netwr FROM vbak WHERE vbeln = @p_vbeln INTO @DATA(ls_vbak).
  UPDATE zorder_log SET checked = 'X' WHERE vbeln = @p_vbeln.
  WRITE: / ls_vbak-vbeln, ls_vbak-netwr.`;

/* ---------------------------------------------------------------- gate */

test('the gate opens at 3.0.19 and not before', () => {
  expect(KEY_USER_FROM).toBe('3.0.19');
  expect(keyUserApplies(NEW)).toBe(true);
  expect(keyUserApplies(OLD)).toBe(false);
  expect(keyUserApplies(null)).toBe(false);
});

test('a run of an earlier engine rebuilds unchanged: no reading, a neutral checkpoint, no key-user basis', () => {
  const source = readExample(EXAMPLE);
  const old = buildAbapEvidence(source, EXAMPLE, 'private', undefined, OLD);
  expect(old.keyUser).toBeUndefined();
  const route = routeExtensibility(old, 'private', OLD);
  expect(route.keyUser).toBeUndefined();
  const cp = route.checkpoints.find((c) => c.checkpointName === 'Key User Extensibility')!;
  expect(cp.resultState).toBe('Neutral');
  expect(cp.evaluation).toMatch(/^Not indicated\. The code contains .*Whether the requirement could be re-expressed with them is not assessed by the engine\.$/);
  expect(route.targetArtifact).toBe('RAP Business Object');
  expect(route.rationale).not.toContain('Key-user');
  // The same source on the new engine: the findings and the score do not move, only the reading is added.
  const now = buildAbapEvidence(source, EXAMPLE, 'private', undefined, NEW);
  expect(now.findings.map((f) => f.kind)).toEqual(old.findings.map((f) => f.kind));
  expect(routeExtensibility(now, 'private', NEW).cleanCoreScore).toBe(route.cleanCoreScore);
});

/* ------------------------------------------------- one test per candidate kind */

test.describe('each candidate kind, with its limit and its lines', () => {
  test('custom field: a ZZ component of an SAP table, its business context not determined', () => {
    const r = must(DERIVATION_EXIT);
    const field = r.candidates.find((c) => c.tool === 'custom-field')!;
    expect(field.app).toBe('Custom Fields');
    expect(field.object).toEqual({ name: 'VBAK', standardTable: 'VBAK', releasedViews: ['I_SALESDOCUMENT'] });
    expect(field.items.map((i) => [i.name, i.lines])).toEqual([['ZZSAMPLE', [4]]]);
    expect(field.limits.map((l) => l.kind)).toEqual(['context-not-determined', 'definition-not-in-source']);
    expect(field.limits[0].check).toContain('In Custom Fields, look up the business context for VBAK');
    // VBAK-AUGRU is SAP's own field: no custom field.
    expect(field.items.some((i) => i.name === 'AUGRU')).toBe(false);
  });

  test('custom logic: an exit that only derives values, the key-user BAdI not determined', () => {
    const r = must(DERIVATION_EXIT);
    const logic = r.candidates.find((c) => c.tool === 'custom-logic')!;
    expect(logic.part).toEqual({ kind: 'hook', name: 'USEREXIT_MOVE_FIELD_TO_VBAK' });
    expect(logic.anchors).toEqual([{ lineStart: 1, lineEnd: 6, role: 'replaced', what: 'exit USEREXIT_MOVE_FIELD_TO_VBAK' }]);
    expect(logic.items.filter((i) => i.kind === 'derivation').map((i) => [i.name, i.condition])).toEqual([
      ['VBAK-AUGRU', "vbak-auart = 'ZFD'"],
      ['VBAK-ZZSAMPLE', "vbak-auart = 'ZFD'"],
    ]);
    expect(logic.release.state).toBe('not-determined');
    expect(logic.release.text).toContain('USEREXIT_MOVE_FIELD_TO_VBAK is a user exit, which no key-user tool implements');
    expect(logic.limits[0].check).toContain('In Custom Logic, find the BAdI of the business context for VBAK (I_SALESDOCUMENT)');
    expect(r.scope).toBe('whole-program');
  });

  test('custom CDS view: a reading list on released views, no aggregation', () => {
    const r = must(MASTER_DATA_LIST);
    const view = r.candidates.find((c) => c.tool === 'custom-cds-view')!;
    expect(view.app).toBe('Custom CDS Views');
    expect(view.object.releasedViews).toEqual(['I_CUSTOMER']);
    expect(view.items.filter((i) => i.kind === 'data-source').map((i) => i.name)).toEqual(['ZCARRIER_MASTER', 'I_CUSTOMER']);
    expect(view.items.filter((i) => i.kind === 'filter').map((i) => i.name)).toEqual(['P_LAND']);
    expect(view.limits.map((l) => l.kind)).toEqual(['release-not-determined', 'data-source']);
    expect(view.release.state).toBe('released-abap-cloud');
    expect(tools(r)).not.toContain('custom-analytical-query');
  });

  test('custom analytical query: the same list, when it aggregates', () => {
    const r = must(readExample(EXAMPLE), EXAMPLE);
    const query = r.candidates.find((c) => c.tool === 'custom-analytical-query')!;
    expect(query.items.filter((i) => i.kind === 'aggregation').map((i) => i.lines)).toEqual([[117]]);
    expect(query.limits[0].check).toContain('find the released analytical (cube) view over I_SALESDOCUMENT');
  });

  test('adapt UI: an exit that only hides, locks or requires screen fields', () => {
    const r = must(SCREEN_EXIT);
    expect(tools(r)).toEqual(['adapt-ui']);
    const ui = r.candidates[0];
    expect(ui.app).toBe('Adapt UI');
    expect(ui.items.map((i) => i.detail)).toEqual(['Make mandatory VBAK-AUGRU.', 'Hide VBAK-BSTDK.', 'Hide VBAK-IHREZ.', 'Make read-only PRC.']);
    expect(ui.limits[0].check).toContain('confirm in Adapt UI');
  });

  test('custom business configuration: an own table read by key only', () => {
    const r = must(readExample(EXAMPLE), EXAMPLE);
    const cfg = r.candidates.find((c) => c.tool === 'custom-business-configuration')!;
    expect(cfg.object.name).toBe('ZSD_PRIO_RULES');
    expect(cfg.items.map((i) => i.name)).toEqual(['KVGR1_A', 'VALUE_A', 'VALUE_B', 'VKORG']);
    expect(cfg.release.state).toBe('own-object');
    expect(cfg.limits.map((l) => l.kind)).toEqual(['definition-not-in-source', 'own-rule']);
  });

  test('custom business object: an own table read as a list of records', () => {
    const r = must(MASTER_DATA_LIST);
    const bo = r.candidates.find((c) => c.tool === 'custom-business-object')!;
    expect(bo.app).toBe('Custom Business Objects');
    expect(bo.object.name).toBe('ZCARRIER_MASTER');
    expect(bo.limits[1].text).toContain('Read as a list of records (master data)');
    expect(r.scope).toBe('whole-program');
  });
});

/* ------------------------------------------- the moment a part leaves the route */

test.describe('a part that needs a write, an external call or more logic leaves the route, and says why', () => {
  test('a write, a call to another system and a commit: the BAdI stays code; the program splits', () => {
    const r = must(SPLIT);
    expect(r.scope).toBe('partial');
    expect(r.parts).toEqual({ total: 4, keyUser: 1, code: 3, notDetermined: 0 });
    const badi = r.rejected.find((x) => x.part.kind === 'hook')!;
    expect(badi.verdict).toBe('code');
    expect(badi.blockers.map((b) => [b.code, b.line])).toEqual([['database-write', 11], ['external-call', 12], ['commit', 14]]);
    expect(badi.reason).toContain('writes an SAP table (VBAK) at line 11');
    // The own table the program writes is no candidate, and the list that writes it is no reading list.
    expect(r.rejected.find((x) => x.part.name === 'ZORDER_LOG')!.blockers[0].code).toBe('own-table-written');
    expect(r.rejected.find((x) => x.part.kind === 'list')!.blockers.map((b) => b.code)).toEqual(['database-write']);
    // The field itself is still a candidate — with the write said as its limit.
    const field = r.candidates[0];
    expect(field.tool).toBe('custom-field');
    expect(field.limits.find((l) => l.kind === 'value-written-by-code')!.text).toContain('line 11');
    expect(r.levelByConstruction).toBeNull();
  });

  test('more logic than custom logic holds (our rule, not SAP’s)', () => {
    const body = Array.from({ length: KEY_USER_LOGIC_MAX_STATEMENTS + 1 }, (_, i) => `  vbak-zzf${i} = 'X'.`).join('\n');
    const r = must(`FORM userexit_move_field_to_vbak.\n${body}\nENDFORM.`);
    const hook = r.rejected.find((x) => x.part.kind === 'hook')!;
    expect(hook.blockers.map((b) => b.code)).toEqual(['too-much-logic']);
    expect(hook.blockers[0].text).toContain("(our rule, not SAP's)");
  });

  test('logic handed to a class the source does not contain: not determined, never a candidate', () => {
    const r = must(`CLASS lcl_im DEFINITION FINAL.
  PUBLIC SECTION.
    INTERFACES if_ex_some_badi.
ENDCLASS.
CLASS lcl_im IMPLEMENTATION.
  METHOD if_ex_some_badi~check.
    zcl_order_rules=>check( ).
  ENDMETHOD.
ENDCLASS.`);
    expect(r.candidates).toEqual([]);
    expect(r.rejected[0].verdict).toBe('not-determined');
    expect(r.rejected[0].blockers.map((b) => b.code)).toEqual(['logic-not-in-source']);
    expect(r.parts.notDetermined).toBe(1);
  });

  test('a VOFM routine: not determined', () => {
    const r = must(`FORM kobed_901.\n  IF komk-vkorg = '1000'.\n    sy-subrc = 4.\n  ENDIF.\nENDFORM.`);
    expect(r.rejected.map((x) => [x.verdict, x.blockers[0].code])).toEqual([['not-determined', 'vofm-routine']]);
  });

  test('a list over a table with no released view stays code', () => {
    const r = must(`REPORT zt.\nSTART-OF-SELECTION.\n  SELECT belnr, buzei FROM cobk INTO TABLE @DATA(lt).\n  LOOP AT lt INTO DATA(ls).\n    WRITE: / ls-belnr.\n  ENDLOOP.`);
    const list = r.rejected.find((x) => x.part.kind === 'list')!;
    expect(list.blockers.map((b) => [b.code, b.line])).toEqual([['no-released-view', 3]]);
    expect(list.blockers[0].text).toContain("COBK, for which SAP's synced catalog names no released CDS view");
  });

  test('a function module call in an exit: key-user logic calls none', () => {
    const r = must(`FORM userexit_save_document.\n  CALL FUNCTION 'Z_PRICE_CHECK' EXPORTING iv = vbak-vbeln.\nENDFORM.`);
    expect(r.rejected[0].blockers.map((b) => b.code)).toEqual(['function-call']);
  });
});

/* ----------------------------------------------------------- the example */

test.describe('the starter example of its own: Z_SD_DELIVERY_PRIORITY', () => {
  const source = readExample(EXAMPLE);

  test('every candidate, its tool and part — the whole program is key user', () => {
    const r = must(source, EXAMPLE);
    expect(r.candidates.map((c) => [c.id, c.tool, c.part.name])).toEqual([
      ['KU-1', 'custom-logic', 'LIF_SD_DELIV_PRIO (LCL_IM_SD_DELIV_PRIO)'],
      ['KU-2', 'custom-field', 'VBAK'],
      ['KU-3', 'custom-business-configuration', 'ZSD_PRIO_RULES'],
      ['KU-4', 'custom-analytical-query', 'Z_SD_DELIVERY_PRIORITY'],
    ]);
    expect(r.rejected).toEqual([]);
    expect(r.scope).toBe('whole-program');
    expect(r.parts).toEqual({ total: 4, keyUser: 4, code: 0, notDetermined: 0 });
    expect(r.levelByConstruction).toBe('A');
  });

  test('each limit: nothing named that the code and the catalog do not name', () => {
    const r = must(source, EXAMPLE);
    expect(Object.fromEntries(r.candidates.map((c) => [c.tool, c.limits.map((l) => l.kind)]))).toEqual({
      'custom-logic': ['release-not-determined', 'data-source'],
      'custom-field': ['context-not-determined', 'definition-not-in-source'],
      'custom-business-configuration': ['definition-not-in-source', 'own-rule'],
      'custom-analytical-query': ['release-not-determined', 'data-source'],
    });
    const logic = r.candidates[0];
    expect(logic.release).toEqual({
      state: 'not-determined',
      objects: ['LIF_SD_DELIV_PRIO'],
      text: "LIF_SD_DELIV_PRIO is the customer's own BAdI interface: the Custom Logic app offers SAP's key-user BAdIs only, and which of them is called at the same point for VBAK is not determined from the code.",
    });
    expect(logic.anchors.map((a) => [a.lineStart, a.lineEnd])).toEqual([[49, 72], [74, 81]]);
    expect(r.candidates[1].items.map((i) => i.name)).toEqual(['ZZ_PRIO_CLASS', 'ZZ_PRIO_NOTE']);
    expect(r.candidates[3].release.objects).toEqual(['I_SALESDOCUMENT']);
  });

  test('the route, the score and the key-user checkpoint', () => {
    const evidence = buildAbapEvidence(source, EXAMPLE, 'private', undefined, NEW);
    const route = routeExtensibility(evidence, 'private', NEW);
    expect(route.recommendedRoute).toBe('In-App (ABAP Cloud)');
    expect(route.cleanCoreScore).toBe(93);
    expect(route.targetArtifact).toBe('Key-user extensions (configured in the system, no code)');
    expect(route.keyUser).toMatchObject({ scope: 'whole-program', recommended: true, levelByConstruction: 'A' });
    expect(route.rationale).toMatch(/^Key-user extensibility covers the whole program: Every part of the program is a key-user candidate \(4: /);
    // The rationale is signed (`recommendationJustification`) and a level never is: it stands beside, as `levelByConstruction`
    // (QA review of 317d5f7a9c53, de1b549b12ba).
    // Nor does it claim a release the engine did not establish (QA review of 7fe620f4c919, 8e1e0bd17113).
    expect(route.rationale).toContain("the extension uses SAP's key-user extension points, and each candidate holds only where its limit");
    expect(route.rationale).not.toContain('released extension points only');
    expect(route.rationale).not.toMatch(/\blevel [A-D]\b/i);
    const cp = route.checkpoints.find((c) => c.checkpointName === 'Key User Extensibility')!;
    expect(cp.resultState).toBe('Key-User Preferred');
    expect(cp.evaluation).toMatch(/^Indicated for the whole program\./);
    expect(cp.cleanCoreImpact).toMatch(/^Upgrade-stable by construction where every candidate is released for key-user use/);
    expect(cp.cleanCoreImpact).not.toMatch(/level [A-D]/i);
    // The public edition reads the same parts.
    const pub = buildAbapEvidence(source, EXAMPLE, 'public', undefined, NEW).keyUser!;
    expect(pub.candidates.map((c) => c.tool)).toEqual(must(source, EXAMPLE).candidates.map((c) => c.tool));
  });

  test('the step list: build order, dependencies, acceptance checks, the delivery document', () => {
    const list = buildKeyUserSteps(must(source, EXAMPLE))!;
    expect(list.steps.map((s) => [s.id, s.app, s.candidateId, s.dependsOn])).toEqual([
      ['S1', 'Custom Fields', 'KU-2', []],
      ['S2', 'Custom Business Objects (configuration)', 'KU-3', []],
      ['S3', 'Custom Logic', 'KU-1', ['S1', 'S2']],
      ['S4', 'Custom Analytical Queries', 'KU-4', ['S1']],
    ]);
    expect(list.steps.map((s) => s.checks.length)).toEqual([2, 1, 5, 1]);
    // The ELSE arm is said as the negation of the arms before it, never as the last condition.
    const elseCheck = list.steps[2].checks.find((c) => c.then.endsWith("= 'C'") && c.given.startsWith('a record where none of'))!;
    expect(elseCheck.lines).toEqual([64, 67, 70]);
    expect(list.codeParts).toEqual([]);
    expect(list.effort).toEqual({ steps: 4, entries: 25, checks: 9, byTool: { 'custom-field': 1, 'custom-business-configuration': 1, 'custom-logic': 1, 'custom-analytical-query': 1 } });
    expect(list.note).toBe(KEY_USER_STEPS_NOTE);
    const doc = keyUserStepsMarkdown(list, EXAMPLE);
    expect(doc).toContain('## S3 · Custom Logic — Implement the rules of LIF_SD_DELIV_PRIO (LCL_IM_SD_DELIV_PRIO) in custom logic for VBAK');
    expect(doc).toContain('- Replaces or relies on: L49–72 (BAdI method LIF_SD_DELIV_PRIO~DERIVE_PRIORITY)');
    expect(doc).not.toContain('## What stays code');
    expect(buildKeyUserSteps(undefined)).toBeNull();
  });

  test('a split program lists its code parts — the only parts Transformation builds', () => {
    const list = buildKeyUserSteps(must(SPLIT))!;
    expect(list.steps.map((s) => s.tool)).toEqual(['custom-field']);
    expect(list.codeParts.map((p) => [p.id, p.part, p.verdict])).toEqual([
      ['KU-R1', 'IF_EX_BADI_SD_SALES_X (LCL_IM_ORDER)', 'code'],
      ['KU-R2', 'ZORDER_LOG', 'code'],
      ['KU-R3', 'Z_ORDER_FIX', 'code'],
    ]);
    expect(keyUserStepsMarkdown(list, 'Z_ORDER_FIX')).toContain('## What stays code');
  });
});

/* ------------------------------------------------- a route a decision can choose */

test.describe('key user as a decision and as the fourth option of the design comparison', () => {
  test('a sign-off may store keyuser: a Rebuild route that generates no code', () => {
    expect(TARGET_ARCHITECTURES).toContain('keyuser');
    expect(TARGET_ARCHITECTURES.slice(0, 7)).toEqual(['rap', 'cap', 'integration', 'event', 'retire', 'keep', 'standard']);
    expect(optionOfArchitecture('keyuser')).toBe('rebuild');
    // Its own cost kind since the owner decision of 19.10.2026; the decision option stays Rebuild.
    expect(ARCHITECTURE_OPTION.keyuser).toEqual({ label: 'Key-user extensibility (configured, no code)', kind: 'keyuser' });
    expect(REFERENCE_OF_TARGET.keyuser[0].fit).toBe('none');
    expect(declaredDeviation({ targetArchitecture: 'keyuser' }, 'in-app-rap')).toEqual({ kind: 'off-track', decided: 'keyuser' });
    const refusal = offTrackRefusal('keyuser');
    expect(refusal.code).toBe('decision-off-track');
    expect(refusal.sentence).toContain('No code is generated for it.');
    expect(offTrackRefusal('retire').sentence).toContain('neither of the two targets');
  });

  test('the comparison: standard · key user · RAP · CAP, key user grounded in the engine’s reading', () => {
    expect([...COMPARED_OPTIONS]).toEqual(['standard', 'keyuser', 'rap', 'cap']);
    expect(OPTION_COMPARISON_SCHEMA).toContain("'standard' | 'keyuser' | 'rap' | 'cap'");
    const base = { recommended: 'in-app-rap' as const, drivers: [], findings: [], requirements: null, deployment: 'private' as const };
    expect(engineOptionFacts(base).options.keyuser[0]).toContain('not determined');
    // QA review of 317d5f7a9c53, 1e2ede7f692b: that holds for an earlier engine's run too, so the release text
    // names the comparison as the one thing such a project sees change, instead of "no change" at all.
    const changelog = fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8');
    expect(changelog).not.toContain('Engine-version gated (3.0.19): projects analysed by an earlier engine see no change.');
    expect(changelog).toContain('a new design comparison names key user as its fourth option for every project');
    const route = routeExtensibility(buildAbapEvidence(readExample(EXAMPLE), EXAMPLE, 'private', undefined, NEW), 'private', NEW);
    const facts = engineOptionFacts({ ...base, keyUser: route.keyUser }).options.keyuser;
    expect(facts[0]).toBe(route.keyUser!.sentence);
    expect(facts.filter((f) => /^KU-\d /.test(f))).toHaveLength(4);
    expect(facts[facts.length - 1]).toContain('level A by construction');
  });

  test('a comparison stored with three options is not short of one: key user is said apart', () => {
    const three = {
      optionComparison: {
        options: ['standard', 'rap', 'cap'].map((option) => ({ option, targetRelease: 'S/4HANA 2023', fitGap: 'x', effort: 'Low', runningCost: 'Low', dataContract: 'n/a' })),
        recommended: 'rap',
        decisionReason: 'The priority rule per sales organisation needs a check no standard field offers.',
        requirementOthersMiss: 'A priority class per sales organisation.',
      },
    };
    const view = readOptionComparison(three);
    expect(view.state === 'ready' && view.missing).toEqual([]);
    expect(view.state === 'ready' && view.keyUserNotCompared).toBe(true);
    expect(circularReason('Because key user is the chosen target.')).toContain('restates the route');
  });

  test('the decision weighing gains a key-user row only where the caller reads the reading', () => {
    const src = { subject: 'Z_X', hasRun: true, decision: null, status: null, engineRoute: 'rap', engineReasoning: 'On-stack.', usage: null, design: null };
    expect(decisionWeighing(src).rows.map((r) => r.key)).toEqual(['keep', 'standard', 'rap', 'cap', 'retire']);
    const whole = decisionWeighing({ ...src, keyUser: { scope: 'whole-program', sentence: 'Every part is a key-user candidate.', parts: { total: 1, keyUser: 1, code: 0, notDetermined: 0 } } });
    expect(whole.rows.map((r) => r.key)).toEqual(['keep', 'standard', 'keyuser', 'rap', 'cap', 'retire']);
    expect(whole.rows[2].signal).toBe('for');
    expect(decisionWeighing({ ...src, keyUser: null }).rows[2].signal).toBe('not-determined');
  });
});
