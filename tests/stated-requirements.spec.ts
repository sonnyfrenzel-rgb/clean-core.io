import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { buildAbapEvidence } from '../lib/abap/evidence-model';
import { routeExtensibility } from '../lib/abap/extensibility-router';
import {
  STATED_REQUIREMENTS_FROM,
  classifyStatement,
  readStatedRequirements,
  statedRequirementsApply,
  statedTargetOf,
} from '../lib/abap/stated-requirements';
import { STARTER_EXAMPLES } from '../lib/starter-examples';
import { IN_APP_ROUTE, SIDE_BY_SIDE_ROUTE } from '../lib/sap-naming';

/**
 * Roadmap 3.0.17 — requirements the owner states in the source (owner
 * decision 17.10.2026).
 *
 * The route was read from constructs only, so a program with no side-by-side
 * construct whose header binds SAP BTP / CAP as its target was recommended
 * RAP. From engine 3.0.17 (`STATED_REQUIREMENTS_FROM`) a binding stated target
 * sets the route where the code does not force the other one; the rationale
 * says it was stated in the source, not read from the code; a conflict with
 * the code keeps the code's route and is named; the score does not move.
 *
 * Every fixture here is synthetic, and several phrasings are used on purpose:
 * the reader must not be tuned to one file. Server-free.
 */

const NEW = `v${STATED_REQUIREMENTS_FROM}`;
const OLD = 'v3.0.16';

const routeOf = (source: string, engine: string, deployment: 'public' | 'private' = 'private') =>
  routeExtensibility(buildAbapEvidence(source, 'zprog.abap', deployment, undefined, engine), deployment, engine);

/** Code with no side-by-side construct and nothing left unassessed: one read. */
const READ_ONLY_CODE = `REPORT zsd_order_status.
DATA lt_vbak TYPE STANDARD TABLE OF vbak.
SELECT vbeln, erdat FROM vbak INTO TABLE @lt_vbak UP TO 100 ROWS.
DATA(lv_count) = lines( lt_vbak ).
`;

/** A header in the shape of the case that started this: operating requirements, labelled, binding. */
const OPERATING_HEADER = `*&---------------------------------------------------------------------*
*& Report ZSD_ORDER_STATUS
*&---------------------------------------------------------------------*
* OPERATING REQUIREMENTS
*----------------------------------------------------------------------*
* NFR-07: The solution must provide one externally accessible service
*         spanning several independent ERP systems.
* NFR-08: No single ERP may own the workflow state.
* NFR-09: No new ERP-side custom table or runtime is authorized.
* NFR-10: The customer's approved target is SAP BTP, CAP Node.js.
*----------------------------------------------------------------------*
`;

test.describe('the reader — what counts as a statement', () => {
  test('labelled items of an operating-requirements block, with their lines and words', () => {
    const items = readStatedRequirements(OPERATING_HEADER + READ_ONLY_CODE);
    expect(items.map((r) => r.label)).toEqual(['NFR-07', 'NFR-08', 'NFR-09', 'NFR-10']);
    const nfr07 = items[0];
    expect([nfr07.lineStart, nfr07.lineEnd]).toEqual([6, 7]);
    expect(nfr07.text).toBe('The solution must provide one externally accessible service spanning several independent ERP systems.');
    expect(nfr07.heading).toBe('OPERATING REQUIREMENTS');
    for (const r of items) {
      expect(r.target, r.label ?? '').toBe('side-by-side');
      expect(r.binding, r.label ?? '').toBe(true);
    }
  });

  test('several phrasings of a side-by-side target', () => {
    for (const text of [
      'The approved target is SAP BTP, CAP Node.js.',
      'Workflow state must be kept outside the ERP.',
      'The integration shall be built side-by-side on the Business Technology Platform.',
      'One externally exposed API serving multiple S/4HANA systems is mandatory.',
      'The service must run independently of any single ERP.',
      'No new custom tables in the ERP are authorized.',
      'Governance: the architecture board decided on a CAP Java service on Cloud Foundry.',
    ]) {
      const c = classifyStatement(text);
      expect(c.target, text).toBe('side-by-side');
      expect(c.binding, text).toBe(true);
    }
  });

  test('several phrasings of an on-stack target', () => {
    for (const text of [
      'The extension must be built in ABAP Cloud (RAP) on the S/4HANA stack.',
      'Approved target: on-stack developer extensibility.',
      'The logic shall remain in the ERP; no separate runtime is approved.',
      'The solution must not run on SAP BTP.',
    ]) {
      const c = classifyStatement(text);
      expect(c.target, text).toBe('on-stack');
      expect(c.binding, text).toBe(true);
    }
  });

  test('a hedged mention is soft; a binding one counts more', () => {
    const soft = classifyStatement('Could later move to SAP BTP if volumes grow.');
    expect(soft).toMatchObject({ target: 'side-by-side', binding: false });
    expect(classifyStatement('A CAP service is the preferred option.').binding).toBe(false);
    // One binding on-stack clause outweighs a soft side-by-side one.
    expect(classifyStatement('The logic must stay in ABAP Cloud (RAP); a BTP extension could follow later.').target).toBe('on-stack');
  });

  test('a mention in passing is no statement — inside an item or outside one', () => {
    for (const text of [
      'Errors are logged per item, unlike CAP.',
      'See the BTP docs for the destination setup.',
      'The service reads orders via the released RAP APIs.',
      'Error handling is similar to SAP BTP, e.g. retries.',
    ]) {
      expect(classifyStatement(text).target, text).toBe('neutral');
    }
    // Outside any requirement item nothing is read at all.
    const free = `* Unlike CAP services, this report runs in dialog.
* See the BTP docs before changing the destination.
* Approved by the team lead: must run nightly on SAP BTP is a joke from the old days.
${READ_ONLY_CODE}`;
    expect(readStatedRequirements(free)).toEqual([]);
  });

  test('labels and blocks in other spellings: REQ-3 without a colon, Requirement:, quote comments, ARCHITECTURE, bullets', () => {
    const src = `"REQ-3 The approved target is SAP BTP (CAP Node.js).
* Requirement: The data must be readable from several independent ERP systems.
*
* ARCHITECTURE
*   - Target: SAP BTP, Kyma runtime
*   - Logging follows the company standard.
${READ_ONLY_CODE}`;
    const items = readStatedRequirements(src);
    expect(items.map((r) => [r.label, r.lineStart, r.target, r.binding])).toEqual([
      ['REQ-3', 1, 'side-by-side', true],
      ['Requirement', 2, 'side-by-side', true],
      [null, 5, 'side-by-side', true],
      [null, 6, 'neutral', false],
    ]);
    expect(items[2].heading).toBe('ARCHITECTURE');
  });

  test('a range or a list of labels refers to items and is no label of its own', () => {
    // "NFR-01..06 require …" was read as the label NFR-01 with the words ".06 require …", and the route rationale
    // quoted them so.
    for (const ref of ['NFR-01..06', 'REQ-1–4', 'BR-2, 3', 'NFR-1/2', 'NFR-01 to 06']) {
      const src = `* ARCHITECTURE\n* ${ref} require an independent side-by-side application on SAP BTP.\n${READ_ONLY_CODE}`;
      const items = readStatedRequirements(src);
      expect(items.map((r) => r.label), ref).toEqual([null]);
      expect(items[0].text, ref).toContain(`${ref} require`);
    }
  });

  test('commented-out code is not a statement, not even inside a requirements block', () => {
    const src = `* REQUIREMENTS
* CALL FUNCTION 'Z_PUSH_TO_BTP' DESTINATION 'BTP_CAP'.
* lv_target = 'CAP'.
*   SELECT * FROM zbtp_queue INTO TABLE @DATA(lt_q).
${READ_ONLY_CODE}`;
    expect(readStatedRequirements(src)).toEqual([]);
  });

  test('a heading that is not a requirements heading ends the block', () => {
    const src = `* REQUIREMENTS
* - The report must finish within ten minutes.
* CHANGE HISTORY:
* - 2019: moved to SAP BTP? no, rejected.
${READ_ONLY_CODE}`;
    const items = readStatedRequirements(src);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ lineStart: 2, target: 'neutral' });
  });
});

test.describe('the verdict over all items', () => {
  test('binding items on both sides set no target and say so', () => {
    const items = readStatedRequirements(`* NFR-1: The approved target is SAP BTP.
* NFR-2: The extension must be built in RAP.
${READ_ONLY_CODE}`);
    const v = statedTargetOf(items);
    expect(v.target).toBeNull();
    expect(v.contradictory).toBe(true);
  });

  test('soft items never set a target', () => {
    const v = statedTargetOf(readStatedRequirements(`* NFR-1: A move to SAP BTP could be evaluated in a future phase.
${READ_ONLY_CODE}`));
    expect(v.target).toBeNull();
    expect(v.soft).toHaveLength(1);
  });
});

test.describe('the route', () => {
  test('a binding side-by-side statement sets the route the code does not force — with provenance and lines', () => {
    const src = OPERATING_HEADER + READ_ONLY_CODE;
    const report = routeOf(src, NEW);
    expect(report.recommendedRoute).toBe(SIDE_BY_SIDE_ROUTE);
    expect(report.targetArtifact).toBe('CAP Node.js / Java Application');
    expect(report.rationale).toContain('stated in the source, not read from the code');
    expect(report.rationale).toContain('NFR-07 (lines 6–7)');
    expect(report.rationale).toContain('NFR-10 (line 10)');
    expect(report.rationale).toContain('Read from the code alone, the route would be on-stack');
    expect(report.statedRequirements).toMatchObject({ target: 'side-by-side', followed: true, conflict: false });
    // No finding stands behind it, and the checkpoint says what does.
    expect(report.evidenceCounts.supportingFindings).toBe(0);
    const sbs = report.checkpoints.find((c) => c.checkpointName.startsWith('Side-by-Side'))!;
    expect(sbs.resultState).toBe('Side-by-Side Preferred');
    expect(sbs.evaluation).toContain('stated in the source, not read from the code');
    expect(report.assumptions.some((a) => a.includes('taken as written'))).toBe(true);
    // Confidence: 70 for the first binding statement, +5 for a second, 75 at most.
    expect(report.confidenceScore).toBe(75);
  });

  test('the Clean Core score stays code-based', () => {
    const withHeader = routeOf(OPERATING_HEADER + READ_ONLY_CODE, NEW);
    const without = routeOf(READ_ONLY_CODE, NEW);
    expect(without.recommendedRoute).toBe(IN_APP_ROUTE);
    expect(withHeader.cleanCoreScore).toBe(without.cleanCoreScore);
  });

  test('one binding statement: confidence 70', () => {
    const report = routeOf(`* REQ-3: The approved target is SAP BTP (CAP Node.js).\n${READ_ONLY_CODE}`, NEW);
    expect(report.recommendedRoute).toBe(SIDE_BY_SIDE_ROUTE);
    expect(report.confidenceScore).toBe(70);
  });

  test('a stated on-stack target over an RFC call to another system: the code route stands and the conflict is named', () => {
    const code = `* NFR-1: The extension must be built in ABAP Cloud (RAP); no separate runtime is approved.
REPORT zfi_push.
DATA lv_bukrs TYPE bukrs VALUE '1000'.
CALL FUNCTION 'Z_CRM_PUSH' DESTINATION 'PRD_CRM'
  EXPORTING iv_bukrs = lv_bukrs.
`;
    const report = routeOf(code, NEW);
    const plain = routeOf(code.split('\n').slice(1).join('\n'), NEW);
    expect(report.recommendedRoute).toBe(SIDE_BY_SIDE_ROUTE);
    expect(report.rationale).toContain('The program\'s owner states on-stack as the target');
    expect(report.rationale).toContain('The code contradicts it');
    expect(report.statedRequirements).toMatchObject({ target: 'on-stack', followed: false, conflict: true });
    expect(report.confidenceScore).toBe(plain.confidenceScore - 15);
  });

  test('a stated side-by-side target over code that runs inside SAP processing: on-stack stands, conflict named', () => {
    const code = `* NFR-1: The approved target is SAP BTP, CAP Node.js.
ENHANCEMENT 1 ZEI_SD_SAVE.
  DATA lv_x TYPE i.
  lv_x = 1.
ENDENHANCEMENT.
`;
    const report = routeOf(code, NEW);
    expect(report.recommendedRoute).toBe(IN_APP_ROUTE);
    expect(report.rationale).toContain('run inside SAP\'s own processing');
    expect(report.statedRequirements).toMatchObject({ target: 'side-by-side', followed: false, conflict: true });
  });

  test('contradictory statements leave the code route and name both', () => {
    const report = routeOf(`* NFR-1: The approved target is SAP BTP.
* NFR-2: The extension must be built in RAP.
${READ_ONLY_CODE}`, NEW);
    expect(report.recommendedRoute).toBe(IN_APP_ROUTE);
    expect(report.rationale).toContain('contradict each other');
  });

  test('a passing mention or a soft one does not move the route', () => {
    const passing = routeOf(`* Unlike CAP services, this report runs in dialog.\n${READ_ONLY_CODE}`, NEW);
    expect(passing.recommendedRoute).toBe(IN_APP_ROUTE);
    expect(passing.statedRequirements).toBeUndefined();
    const soft = routeOf(`* NFR-1: A move to SAP BTP could be evaluated in a future phase.\n${READ_ONLY_CODE}`, NEW);
    expect(soft.recommendedRoute).toBe(IN_APP_ROUTE);
    expect(soft.rationale).toContain('without binding it');
  });
});

test.describe('the engine-version gate', () => {
  test(`the gate opens at ${STATED_REQUIREMENTS_FROM}, not before`, () => {
    expect(statedRequirementsApply(OLD)).toBe(false);
    expect(statedRequirementsApply(null)).toBe(false);
    expect(statedRequirementsApply(NEW)).toBe(true);
  });

  test('a run of an earlier engine re-renders exactly as before — evidence and route', () => {
    const src = OPERATING_HEADER + READ_ONLY_CODE;
    const oldEvidence = buildAbapEvidence(src, 'zprog.abap', 'private', undefined, OLD);
    expect(oldEvidence.statedRequirements).toBeUndefined();
    const oldRoute = routeExtensibility(oldEvidence, 'private', OLD);
    expect(oldRoute.recommendedRoute).toBe(IN_APP_ROUTE);
    expect(oldRoute.statedRequirements).toBeUndefined();
    // The same report the earlier engine gives without the header's words.
    const bare = routeExtensibility(buildAbapEvidence(READ_ONLY_CODE, 'zprog.abap', 'private', undefined, OLD), 'private', OLD);
    expect(oldRoute.rationale).toBe(bare.rationale);
    expect(oldRoute.confidenceScore).toBe(bare.confidenceScore);
    // And new evidence handed to the old rule changes nothing either.
    const newEvidence = buildAbapEvidence(src, 'zprog.abap', 'private', undefined, NEW);
    expect(routeExtensibility(newEvidence, 'private', OLD)).toEqual(oldRoute);
  });
});

test.describe('the shipped starter examples', () => {
  for (const example of STARTER_EXAMPLES) {
    test(`${example.file} keeps its route, score and words under engine ${STATED_REQUIREMENTS_FROM}`, () => {
      const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'starter-examples', example.file), 'utf8');
      for (const deployment of ['private', 'public'] as const) {
        const before = routeOf(source, OLD, deployment);
        const after = routeOf(source, NEW, deployment);
        expect(after.recommendedRoute, deployment).toBe(before.recommendedRoute);
        expect(after.cleanCoreScore, deployment).toBe(before.cleanCoreScore);
        expect(after.rationale, deployment).toBe(before.rationale);
        expect(after.confidenceScore, deployment).toBe(before.confidenceScore);
        expect(after.statedRequirements, deployment).toBeUndefined();
      }
    });
  }
});
