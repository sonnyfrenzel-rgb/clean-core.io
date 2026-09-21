/**
 * The judging half of the ABAP engine may not say more than it found.
 *
 * The full QA review of `b88c77b` raised thirty-five high findings against the
 * four modules that turn evidence into a verdict — the router, the code
 * assessment, the evidence model and the A–D level rule. Ten distinct defects
 * came out of them, and they share one shape: a sentence, a level or a score
 * that is stronger than the evidence behind it.
 *
 *   - a level C for a catalog state nobody mapped (469c688b0b0f, 17bfad473975);
 *   - a write to an SAP table rated one step lower because nobody had typed a
 *     successor for it into a 25-entry map (92e75580c745, 4862a73a2121,
 *     da845198acc9, 451f13d1c004, e955a181ba42);
 *   - an Integration Suite recommendation from a variable called `idoc` and an
 *     Event Mesh one from a variable called `publish` (d27e02241df3,
 *     9a4739b73b26, 423e06020a0e, 24a2ea35802c, 9a05d24b9cf0);
 *   - legacy constructs found inside quoted text (18e7f9c0a67e, 42f234fcae8d,
 *     8dcf89e31a32, 9b1698637a1d);
 *   - a direct write to an SAP table deleted from the report because the object
 *     is released for reading (ac5a65eb53ff, 79705bbe66be);
 *   - "Highly Compatible, excellent fit" for a core modification (4148377496a6,
 *     85fe8d3e915a, a160b494e1f3);
 *   - a side-by-side route explained by "only standard table reads and
 *     low-criticality patterns" (789e072a0f28, 6b8949b2e013, 9fca7145d0bf,
 *     8b1862e32291);
 *   - checkpoints naming constructs the source does not contain (134330d50e4e,
 *     3e102c51d7dc, 708c2f956b51, 725c5d80afc6, and CR-04 of the external
 *     counter-review);
 *   - a direct write to SAP's rows presented as wrappable (dbbc1bf8f01d,
 *     7d9778a8a847, 32ca5741aeb1, fbc8bdcaa983);
 *   - a clean core score that went *up* because less of the file was assessed
 *     (b2b85826caf3, f65525eb6d7c).
 *
 * Each block below fails on the behaviour as it was, and every block also
 * checks the finding the fix must not remove — a guard that only deletes output
 * is not a guard.
 *
 * Serverless: pure functions over text and over the two generated SAP
 * artifacts.
 */
import { test, expect } from '@playwright/test';
import { buildAbapEvidence, type AbapEvidenceReport } from '../lib/abap/evidence-model';
import { routeExtensibility } from '../lib/abap/extensibility-router';
import { extractCodeInventory, extractDataCoupling, recommendArchitecture } from '../lib/abap/code-assessment';
import { gradeFromSapStates, gradeFromSapStatesForUse } from '../lib/abap/abcd-classification';
import { getSapObjectStates } from '../lib/abap/catalog-service';
import {
  enumerateLevelRule,
  fingerprintLevelRule,
  RULE_UNMAPPED_STATE,
  type LevelGrader,
} from '../lib/abap/level-rule-version';

const evidence = (code: string, deployment: 'public' | 'private' = 'private') =>
  buildAbapEvidence(code, 'zcc_guard.abap', deployment);

const kinds = (code: string, deployment: 'public' | 'private' = 'private') =>
  evidence(code, deployment).findings.map((f) => f.kind);

const route = (code: string, deployment: 'public' | 'private' = 'private') =>
  routeExtensibility(evidence(code, deployment), deployment);

const architecture = (code: string) =>
  recommendArchitecture(code, extractCodeInventory(code), extractDataCoupling(code)).architecture;

const coupling = (code: string, table: string) =>
  extractDataCoupling(code).find((e) => e.tableName === table);

/** Every sentence a route report puts in front of a reader. */
const prose = (report: ReturnType<typeof routeExtensibility>) =>
  [
    report.rationale,
    ...report.checkpoints.flatMap((c) => [c.evaluation, c.cleanCoreImpact]),
    report.comparativeAnalysis.inAppABAPCloud.fitDetails,
    report.comparativeAnalysis.sideBySideBTP.fitDetails,
    ...report.assumptions,
  ].join('\n');

/* ------------------------------- 469c688b0b0f / 17bfad473975 — the level rule */

test.describe('a catalog state nobody mapped is not a level', () => {
  // `cloudification-repo.ts` keeps SAP's state verbatim and names `notReleased`
  // and `decommissioned` as forms that occur. Both matched no branch and fell
  // through to "listed nowhere → level C" — a letter derived from a sentence
  // this code cannot read.
  for (const state of ['notReleased', 'decommissioned', 'somethingSapInventsNextYear']) {
    test(`release state "${state}" is Unknown, not C`, () => {
      const graded = gradeFromSapStates({ releaseState: state, isSapObject: true });
      expect(graded.grade, `"${state}" published as a level`).toBe('Unknown');
      expect(graded.provenance).toBe('heuristic');
      expect(graded.cloudView, 'the file does mention it, so "Not listed" would be a second untruth').toBe(
        'unreadable',
      );
    });
  }

  test('an unmapped classification state is Unknown too', () => {
    expect(gradeFromSapStates({ classificationState: 'newKindOfApi', isSapObject: true })).toMatchObject({
      grade: 'Unknown',
      classicView: 'unreadable',
    });
  });

  test('the residual C stays for the case it was written for', () => {
    // An SAP object neither file mentions IS the level C definition. The guard
    // narrows the branch to its premise; it does not delete it.
    expect(gradeFromSapStates({ isSapObject: true })).toMatchObject({
      grade: 'C',
      provenance: 'catalog-residual',
    });
    expect(gradeFromSapStates({ releaseState: 'released' })).toMatchObject({ grade: 'A' });
    expect(gradeFromSapStates({ releaseState: 'notToBeReleased' })).toMatchObject({ grade: 'D' });
    expect(gradeFromSapStates({ classificationState: 'classicAPI' })).toMatchObject({ grade: 'B' });
  });
});

test.describe('the rule version can see the branch that was added', () => {
  // `level-rule-version.ts` promises that changing one branch of the rule moves
  // the fingerprint. It enumerated only the five mapped states, so the branch
  // for an unmapped one was invisible to it and the version would have stayed
  // put while the rule changed — the one thing that module exists to prevent.
  test('an unmapped state is part of the enumerated domain', () => {
    const domain = new Set(
      enumerateLevelRule().flatMap((d) => [d.releaseState, d.classificationState].filter(Boolean)),
    );
    expect(domain).toContain(RULE_UNMAPPED_STATE);
  });

  test('the fingerprint differs from the rule that answered C for an unmapped state', () => {
    const residualForUnmapped: LevelGrader = (states, use) => {
      const mapped = new Set(['released', 'deprecated', 'nottobereleased']);
      const release = (states.releaseState || '').toLowerCase();
      if (release && !mapped.has(release)) {
        return states.isSapObject
          ? { grade: 'C', provenance: 'catalog-residual' }
          : { grade: 'Unknown', provenance: 'heuristic' };
      }
      return gradeFromSapStatesForUse(states, use);
    };
    expect(fingerprintLevelRule(enumerateLevelRule({ grade: residualForUnmapped }))).not.toBe(
      fingerprintLevelRule(enumerateLevelRule()),
    );
  });
});

/* ----------- 92e75580c745 / 4862a73a2121 / da845198acc9 / 451f13d1c004 / e955a181ba42 */

test.describe('table ownership is not read off the replacement map', () => {
  const write = (table: string) => `REPORT zcc_w.\nUPDATE ${table} SET erdat = sy-datum WHERE belnr = lv_b.`;

  test('a write to an SAP table the map does not carry is High risk', () => {
    // ACDOCA is the S/4HANA universal journal and absent from
    // STANDARD_TABLE_MAP, which used to make this write Medium — one step below
    // the identical write to VBAK, for no reason a reader could see.
    expect(coupling(write('acdoca'), 'ACDOCA')?.riskLevel).toBe('High');
  });

  test('the mapped table is unchanged, and the two are rated the same', () => {
    const mapped = coupling(write('vbak'), 'VBAK');
    expect(mapped?.riskLevel).toBe('High');
    expect(mapped?.recommendation, 'the map still supplies the successor it knows').toMatch(/I_SalesOrder|API_SALES_ORDER_SRV/i);
    expect(coupling(write('acdoca'), 'ACDOCA')?.riskLevel).toBe(mapped?.riskLevel);
  });

  test('a reserved-namespace table is neither custom nor SAP standard', () => {
    // /ACME/ can belong to SAP, to a partner or to the customer. The engine may
    // not rate it as SAP's own table, and may not call it the customer's either.
    const entry = coupling('REPORT zcc_ns.\nINSERT /acme/t_order FROM ls_row.', '/ACME/T_ORDER');
    expect(entry?.isCustom).toBe(false);
    expect(entry?.riskLevel, 'unknown ownership is not the same as SAP ownership').toBe('Medium');
    expect(entry?.replacementConfidence).toBe('Needs Validation');
  });

  test('the customer\u2019s own table keeps its High write risk', () => {
    expect(coupling('REPORT zcc_z.\nINSERT zcust_log FROM ls_row.', 'ZCUST_LOG')).toMatchObject({
      isCustom: true,
      riskLevel: 'High',
    });
  });
});

/* -------- d27e02241df3 / 9a4739b73b26 / 423e06020a0e / 24a2ea35802c / 9a05d24b9cf0 */

test.describe('the architecture follows calls and statements, not words', () => {
  test('a variable named idoc does not route to Integration Suite', () => {
    expect(architecture('REPORT zcc_i.\nDATA idoc TYPE string.')).not.toBe('integration');
  });

  test('a variable named publish does not route to Event Mesh', () => {
    expect(architecture('REPORT zcc_p.\nDATA publish TYPE abap_bool.')).not.toBe('event');
  });

  test('a real IDoc function module still does route to Integration Suite', () => {
    expect(architecture("REPORT zcc_i2.\nCALL FUNCTION 'MASTER_IDOC_DISTRIBUTE' EXPORTING x = 1.")).toBe(
      'integration',
    );
  });

  test('a real RAISE EVENT still does route to Event Mesh', () => {
    expect(architecture('REPORT zcc_e.\nRAISE EVENT order_changed EXPORTING id = lv_id.')).toBe('event');
  });
});

/* ------------ 18e7f9c0a67e / 42f234fcae8d / 8dcf89e31a32 / 9b1698637a1d — literals */

test.describe('a legacy construct written inside a literal is not a construct', () => {
  const inLiteral: Array<[string, string, string]> = [
    ['bdc', "DATA message TYPE string VALUE 'CALL TRANSACTION VA01'.", 'CALL TRANSACTION'],
    ['native-sql', 'DATA(m) = |EXEC SQL SELECT 1 FROM DUAL|.', 'EXEC SQL'],
    ['dynpro', "DATA note TYPE string VALUE 'CALL SCREEN 100'.", 'CALL SCREEN'],
    ['update-task', "DATA note TYPE string VALUE 'called IN UPDATE TASK once'.", 'IN UPDATE TASK'],
    ['commit-work', "DATA note TYPE string VALUE 'ends with COMMIT WORK'.", 'COMMIT WORK'],
    ['authority-check', "DATA note TYPE string VALUE 'no AUTHORITY-CHECK here'.", 'AUTHORITY-CHECK'],
  ];

  for (const [kind, statement, construct] of inLiteral) {
    test(`${construct} in a literal produces no ${kind} finding`, () => {
      expect(kinds(['REPORT zcc_lit.', statement].join('\n'))).not.toContain(kind);
    });
  }

  test('the real statements are all still found', () => {
    const real = [
      'REPORT zcc_real.',
      "CALL TRANSACTION 'VA01'.",
      'EXEC SQL.',
      'SELECT 1 FROM DUAL',
      'ENDEXEC.',
      'CALL SCREEN 100.',
      'COMMIT WORK.',
      'AUTHORITY-CHECK OBJECT \'V_VBAK_VKO\' ID \'ACTVT\' FIELD \'03\'.',
    ].join('\n');
    const found = kinds(real);
    for (const kind of ['bdc', 'native-sql', 'dynpro', 'commit-work', 'authority-check']) {
      expect(found, `the fix removed the detector instead of the false positive: ${kind}`).toContain(kind);
    }
  });

  test('the transaction code is still read out of its literal', () => {
    // The operand lives inside the literal on purpose — the construct does not.
    const bdc = evidence("REPORT zcc_t.\nCALL TRANSACTION 'VA01'.").findings.find((f) => f.kind === 'bdc');
    expect(bdc?.objectName).toBe('VA01');
  });

  test('a function-module name in a literal is still the call target', () => {
    // The documented exception (`statement-reader.ts`): masking these flat would
    // delete the ALV, GUI and RFC detectors outright.
    expect(kinds("REPORT zcc_alv.\nCALL FUNCTION 'REUSE_ALV_GRID_DISPLAY' EXPORTING x = 1.")).toContain(
      'classic-alv',
    );
    expect(kinds("REPORT zcc_gui.\nCALL FUNCTION 'GUI_DOWNLOAD' EXPORTING filename = lv_f.")).toContain(
      'gui-download',
    );
    expect(kinds("REPORT zcc_rfc.\nCALL FUNCTION 'Z_REMOTE' DESTINATION 'SOMESYS'.")).toContain('rfc-call');
  });

  test('a hardcoded environment value is still read out of its literal', () => {
    expect(kinds("REPORT zcc_hc.\nDATA lv_path TYPE string VALUE 'C:\\\\temp\\\\out.txt'.")).toContain(
      'hardcoded-value',
    );
  });
});

/* ------------------------ ac5a65eb53ff / 79705bbe66be — the released-object exit */

test.describe('a release contract covers the read, not the write', () => {
  // ARCH_STAT is `released` in SAP's own release file, so the early exit for
  // released objects used to delete the Critical finding for a direct write.
  const RELEASED_TABLE = 'ARCH_STAT';

  test('the premise: SAP really does list this object as released', () => {
    expect(getSapObjectStates(RELEASED_TABLE).releaseState).toBe('released');
  });

  test('a direct write to a released SAP object is still Critical', () => {
    const found = evidence(`REPORT zcc_rw.\nUPDATE ${RELEASED_TABLE} SET x = 1 WHERE y = 2.`).findings;
    expect(found.map((f) => f.kind)).toContain('standard-table-write');
    expect(found.find((f) => f.kind === 'standard-table-write')?.severity).toBe('Critical');
  });

  test('the read of the same object stays silent — the exemption is kept', () => {
    expect(kinds(`REPORT zcc_rr.\nSELECT * FROM ${RELEASED_TABLE} INTO TABLE @DATA(lt).`)).toEqual([]);
  });
});

/* ------------------- 4148377496a6 / 85fe8d3e915a / a160b494e1f3 — the modification */

test.describe('a core modification is not a compatible route', () => {
  const MODIFICATION = [
    'REPORT zcc_mod.',
    '*{   INSERT         ABCK900001                                         1',
    'lv_total = lv_total + 1.',
    '*}   INSERT',
  ].join('\n');

  test('neither track is rated highly compatible while the modification stands', () => {
    const report = route(MODIFICATION);
    expect(report.comparativeAnalysis.inAppABAPCloud.technicalFeasibility).not.toBe('Highly Compatible');
    expect(report.comparativeAnalysis.sideBySideBTP.technicalFeasibility).not.toBe('Highly Compatible');
  });

  test('the report does not contradict its own rationale', () => {
    const report = route(MODIFICATION);
    expect(report.rationale, 'the premise of this block').toMatch(/before any cloud target is reachable/i);
    expect(report.comparativeAnalysis.inAppABAPCloud.fitDetails).not.toMatch(/excellent fit/i);
    expect(prose(report), 'what the route means while the modification stands is left unsaid').toMatch(
      /reset(?: to SAP standard)?|SPAU/i,
    );
  });

  test('a source without a modification is still rated as it was', () => {
    const report = route('REPORT zcc_ok.\nSELECT * FROM vbak INTO TABLE @DATA(lt).');
    expect(report.comparativeAnalysis.inAppABAPCloud.technicalFeasibility).toBe('Highly Compatible');
  });
});

/* -------- 789e072a0f28 / 6b8949b2e013 / 9fca7145d0bf / 8b1862e32291 — the rationale */

test.describe('the rationale explains the route the report recommends', () => {
  const sources: Array<{ name: string; code: string; names: RegExp }> = [
    {
      name: 'native SQL',
      code: ['REPORT zcc_ns.', 'EXEC SQL.', 'SELECT 1 FROM DUAL', 'ENDEXEC.'].join('\n'),
      names: /native SQL/i,
    },
    {
      name: 'BDC',
      code: ['REPORT zcc_bdc.', "CALL TRANSACTION 'VA01'."].join('\n'),
      names: /BDC|CALL TRANSACTION/i,
    },
    {
      name: 'frontend file services',
      code: ['REPORT zcc_gui.', "CALL FUNCTION 'GUI_DOWNLOAD' EXPORTING filename = lv_f."].join('\n'),
      names: /file/i,
    },
    {
      name: 'RFC',
      code: ['REPORT zcc_rfc.', "CALL FUNCTION 'Z_REMOTE' DESTINATION 'SOMESYS'."].join('\n'),
      names: /RFC/i,
    },
  ];

  for (const s of sources) {
    test(`a ${s.name} route is explained by ${s.name}`, () => {
      const report = route(s.code);
      expect(report.recommendedRoute, 'the premise: this construct routes off-stack').toBe(
        'Side-by-Side (SAP BTP)',
      );
      expect(report.rationale).toMatch(s.names);
      expect(
        report.rationale,
        'a side-by-side route recommended on-stack RAP in the same sentence',
      ).not.toMatch(/On-Stack Developer Extensibility \(RAP\) is the recommended path/i);
    });
  }

  test('an on-stack sentence never explains an off-stack route', () => {
    // The enhancement branch recommends a released BAdI "which ABAP Cloud (RAP)
    // supports on-stack" and stood before the side-by-side triggers, so a source
    // with an enhancement and an EXEC SQL block was routed off-stack and told to
    // stay on it.
    const report = route(
      ['REPORT zcc_mix.', 'ENHANCEMENT 1 z_enh_impl.', 'ENDENHANCEMENT.', 'EXEC SQL.', 'SELECT 1 FROM DUAL', 'ENDEXEC.'].join('\n'),
    );
    expect(report.recommendedRoute).toBe('Side-by-Side (SAP BTP)');
    expect(report.rationale).toMatch(/native SQL/i);
  });

  test('the enhancement rationale survives where it belongs', () => {
    const report = route(['REPORT zcc_enh.', 'ENHANCEMENT 1 z_enh_impl.', 'ENDENHANCEMENT.'].join('\n'));
    expect(report.recommendedRoute).toBe('In-App (ABAP Cloud)');
    expect(report.rationale).toMatch(/enhancement/i);
  });

  test('the fallback keeps its own case', () => {
    const report = route('REPORT zcc_read.\nSELECT * FROM vbak INTO TABLE @DATA(lt).');
    expect(report.recommendedRoute).toBe('In-App (ABAP Cloud)');
    expect(report.rationale).toMatch(/RAP/);
  });
});

/* ---- 134330d50e4e / 3e102c51d7dc / 708c2f956b51 / 725c5d80afc6 + CR-04 — checkpoints */

test.describe('a checkpoint names only what was found', () => {
  const RFC_ONLY = ['REPORT zcc_rfc2.', "CALL FUNCTION 'Z_REMOTE' DESTINATION 'SOMESYS'."].join('\n');

  test('an RFC-only source is not told about BDC, native SQL or custom persistence', () => {
    const report = route(RFC_ONLY);
    const text = prose(report);
    for (const absent of [/BDC/i, /native SQL/i, /custom (data )?persisten/i, /file dependenc/i]) {
      expect(text, `a construct the source does not contain: ${absent}`).not.toMatch(absent);
    }
    expect(text, 'and the construct it does contain is named').toMatch(/RFC/);
  });

  test('a native-SQL source is told about native SQL', () => {
    const report = route(['REPORT zcc_ns2.', 'EXEC SQL.', 'SELECT 1 FROM DUAL', 'ENDEXEC.'].join('\n'));
    const inApp = report.checkpoints.find((c) => c.checkpointName.startsWith('In-App'));
    expect(inApp?.evaluation).toMatch(/native SQL/i);
    expect(inApp?.evaluation, 'and not about the fixed list').not.toMatch(/BDC/i);
  });

  test('Standard Process Fit reports what it measured and answers nothing else', () => {
    // The step read the absence of writes and answered a question about the
    // business requirement. That question belongs to the standard-coverage
    // analysis, which has evidence levels and a counter-check; this one has a
    // count of writes.
    for (const code of [RFC_ONLY, 'REPORT zcc_r.\nSELECT * FROM vbak INTO TABLE @DATA(lt).']) {
      const fit = route(code).checkpoints.find((c) => c.checkpointName === 'Standard Process Fit');
      expect(fit?.evaluation).not.toMatch(/^Yes/);
      expect(fit?.evaluation).toMatch(/not determined/i);
      expect(fit?.resultState, 'an unanswered question does not prefer a track').toBe('Neutral');
    }
  });
});

/* ------- dbbc1bf8f01d / 7d9778a8a847 / 32ca5741aeb1 / fbc8bdcaa983 — the Tier-2 claim */

test.describe('a direct write to SAP rows is never described as wrappable', () => {
  const WRITE_VBAK = 'REPORT zcc_sw.\nUPDATE vbak SET erdat = sy-datum WHERE vbeln = lv_v.';

  test('Private Edition is told to replace the write, not to wrap it', () => {
    const report = route(WRITE_VBAK, 'private');
    expect(report.rationale, 'the premise: the private route still keeps this on-stack').toMatch(/Private Edition/i);
    expect(prose(report)).not.toMatch(/writes? (to standard tables? )?can be wrapped/i);
    expect(prose(report)).not.toMatch(/Standard table writes can be wrapped/i);
    expect(report.rationale).toMatch(/released write API|BAPI|RAP action/i);
  });

  test('Tier-2 is still offered for what it actually covers', () => {
    // The wrapper is not removed from the product — only from the sentence
    // about writing to SAP's own rows.
    expect(route(WRITE_VBAK, 'private').assumptions.join('\n')).toMatch(/Tier-2/);
  });
});

/* --------------------------- b2b85826caf3 / f65525eb6d7c — the coverage adjustment */

test.describe('an incomplete reading never raises the score', () => {
  const LEGACY_WITH_GAP = [
    'REPORT zcc_legacy.',
    'EXEC SQL.',
    'SELECT 1 FROM DUAL',
    'ENDEXEC.',
    "CALL TRANSACTION 'VA01'.",
    "CALL FUNCTION 'Z_REMOTE' DESTINATION 'SYS'.",
    'UPDATE vbak SET erdat = sy-datum WHERE vbeln = lv_v.',
    'UPDATE bkpf SET budat = sy-datum WHERE belnr = lv_b.',
    "CALL FUNCTION 'GUI_DOWNLOAD' EXPORTING filename = lv_f.",
    'INSERT zlog FROM ls_row.',
    'CALL SCREEN 100.',
    'OPEN DATASET lv_path FOR INPUT IN TEXT MODE ENCODING DEFAULT.',
    "CALL FUNCTION 'Z_LOCAL_HELPER' EXPORTING x = 1.",
  ].join('\n');

  test('the same findings score no better for being read less completely', () => {
    const report = evidence(LEGACY_WITH_GAP);
    expect(report.coverage.complete, 'the premise: something was not assessed').toBe(false);
    expect(report.coverage.gaps.length).toBeGreaterThan(0);

    const asIfComplete: AbapEvidenceReport = {
      ...report,
      coverage: { ...report.coverage, complete: true, gaps: [], unassessed: [] },
    };
    const partial = routeExtensibility(report, 'private').cleanCoreScore;
    const complete = routeExtensibility(asIfComplete, 'private').cleanCoreScore;

    expect(partial, `knowing less about the file raised its score from ${complete} to ${partial}`).toBeLessThanOrEqual(
      complete,
    );
  });

  test('the penalty is still paid where the score was good', () => {
    // The point of the adjustment stands: an unread file does not come out at 100.
    const quiet = evidence(
      ['REPORT zcc_quiet.', 'OPEN DATASET lv_path FOR INPUT IN TEXT MODE ENCODING DEFAULT.'].join('\n'),
    );
    expect(quiet.coverage.complete).toBe(false);
    expect(routeExtensibility(quiet, 'private').cleanCoreScore).toBeLessThan(100);
  });
});

/* --------------------------------------------- CR-03 — what Public Edition can do */

test('the public-cloud rationale states no untruth about developer extensibility', () => {
  // S/4HANA Cloud Public Edition has held custom database tables on-stack since
  // ABAP Cloud developer extensibility (ADT, three-system landscape). The
  // rationale claimed the opposite as a fact and used it to justify the route.
  const report = route('REPORT zcc_cp.\nINSERT zcust_log FROM ls_row.', 'public');
  expect(report.recommendedRoute, 'the routing decision itself is unchanged').toBe('Side-by-Side (SAP BTP)');
  expect(report.rationale).not.toMatch(/does not offer on-stack custom persistence/i);
  expect(report.rationale, 'the alternative is named instead of denied').toMatch(/developer extensibility/i);
});
