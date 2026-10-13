import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { CONCEPT_SUCCESSORS, CONCEPT_SUCCESSOR_SOURCE, conceptSuccessorsOf } from '../lib/concept-successors';

/**
 * DSAG guideline review B2 (owner 13.10.2026): a curated list of concept
 * successors, labelled as the guideline's and not SAP's catalog. Owner rule
 * the same day: a row stays only where the repo's own SAP data backs it, and
 * its `backing` says how far — held here against the generated catalog files.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
type Entry = { state?: string; successors?: { name: string }[] };
const entries = (file: string): Record<string, Entry> =>
  JSON.parse(read(`lib/abap/generated/${file}`)).entries as Record<string, Entry>;
const RELEASE = entries('cloudification-repo.latest.json');
const RELEASE_PCE = entries('cloudification-repo.pce-latest.json');
const CLASSIC = entries('cloudification-repo.classifications-sap.json');

test.describe('concept successors — every claim backed by the repo\'s SAP data', () => {
  test('every successor object a row names is released, in the public and the private edition data', () => {
    for (const row of CONCEPT_SUCCESSORS) {
      for (const o of row.successorObjects) {
        expect(RELEASE[o]?.state, `${row.key}: ${o}`).toBe('released');
        expect(RELEASE_PCE[o]?.state, `${row.key}: ${o} (PCE)`).toBe('released');
      }
      if (row.backing !== 'unconfirmed') expect(row.successorObjects.length, row.key).toBeGreaterThan(0);
    }
  });

  test('"SAP names this successor" holds only where SAP\'s data names it', () => {
    const mail = CONCEPT_SUCCESSORS.find((r) => r.key === 'mail')!;
    expect(mail.backing).toBe('sap-successor');
    expect(RELEASE.CL_BCS.state).toBe('notToBeReleased');
    expect(RELEASE.CL_BCS.successors?.map((s) => s.name)).toContain('CL_BCS_MAIL_MESSAGE');
    for (const fm of ['SO_NEW_DOCUMENT_SEND_API1', 'SO_NEW_DOCUMENT_ATT_SEND_API1', 'SO_DOCUMENT_SEND_API1']) {
      expect(CLASSIC[fm]?.successors?.map((s) => s.name), fm).toContain('CL_BCS_MAIL_MESSAGE');
    }
  });

  test('"level B today" is what SAP\'s classification file says about the old objects', () => {
    for (const name of ['BAL_LOG_CREATE', 'BAL_LOG_MSG_ADD', 'BAL_DB_SAVE', 'JOB_OPEN', 'JOB_SUBMIT', 'JOB_CLOSE', 'VIEW_MAINTENANCE_CALL', '/BOBF/IF_TRA_SERVICE_MANAGER']) {
      expect(CLASSIC[name]?.state, name).toBe('classicAPI');
    }
    // BOPF has no successor in SAP's data: the row is marked unconfirmed, never as SAP's.
    expect(CLASSIC['/BOBF/IF_TRA_SERVICE_MANAGER'].successors).toBeUndefined();
    expect(CONCEPT_SUCCESSORS.find((r) => r.key === 'bopf')!.backing).toBe('unconfirmed');
  });

  test('every row cites the guideline section it comes from, which exists in the guide', () => {
    for (const row of CONCEPT_SUCCESSORS) {
      expect(row.guide).toEqual({ file: 'clean-core/solution-approach.md', heading: 'Neue Konzepte' });
    }
    expect(CONCEPT_SUCCESSOR_SOURCE).toBe("DSAG ABAP guideline, not SAP's catalog");
    // Not taken over: transactions a user starts, with app IDs none of the repo's SAP sources has.
    expect(CONCEPT_SUCCESSORS.map((r) => r.successor).join(' ')).not.toMatch(/F4950|F5442/);
  });
});

test.describe('concept successors — detection from the source', () => {
  const CODE = [
    'REPORT zcc_concepts.',
    '* CALL FUNCTION \'JOB_OPEN\' in a comment is no use',
    'DATA lo_send TYPE REF TO cl_bcs.',
    'DATA lo_mail TYPE REF TO cl_bcs_mail_message. "the successor itself',
    "CALL FUNCTION 'BAL_LOG_CREATE' EXPORTING i_s_log = ls_log.",
    'SUBMIT zcc_worker',
    '  VIA JOB lv_job NUMBER lv_count',
    '  AND RETURN.',
    "CALL TRANSACTION 'SM30'.",
    'DATA lo_bo TYPE REF TO /bobf/if_tra_service_manager.',
  ].join('\n');

  test('finds each classic concept at its line, ignores comments and the successor itself', () => {
    const hits = conceptSuccessorsOf(CODE);
    const byKey = Object.fromEntries(hits.map((h) => [h.row.key, h.found]));
    expect(Object.keys(byKey)).toEqual(['application-log', 'application-job', 'mail', 'bopf', 'table-maintenance']);
    expect(byKey.mail).toEqual([{ name: 'CL_BCS', line: 3 }]);
    expect(byKey['application-log']).toEqual([{ name: 'BAL_LOG_CREATE', line: 5 }]);
    expect(byKey['application-job']).toEqual([{ name: 'VIA JOB', line: 6 }]);
    expect(byKey['table-maintenance']).toEqual([{ name: 'SM30', line: 9 }]);
    expect(byKey.bopf).toEqual([{ name: '/BOBF/IF_TRA_SERVICE_MANAGER', line: 10 }]);
  });

  test('code on the successors shows nothing', () => {
    expect(conceptSuccessorsOf('DATA lo_log TYPE REF TO if_bali_log.\nlo_log = cl_bali_log=>create( ).\nDATA m TYPE REF TO cl_bcs_mail_message.')).toEqual([]);
    expect(conceptSuccessorsOf('')).toEqual([]);
  });

  test('shown in Design and in Transformation\'s quality tips, kept out of the signed run', () => {
    expect(read('app/(app)/project/[projectId]/design/page.tsx')).toContain('<ConceptSuccessors');
    expect(read('components/transformation/QualityTips.tsx')).toContain('<ConceptSuccessors');
    expect(read('app/(app)/project/[projectId]/transformation/page.tsx')).toContain('conceptSource={legacySource}');
    expect(read('components/ConceptSuccessors.tsx')).toContain('CONCEPT_SUCCESSOR_SOURCE');
    for (const rel of ['app/api/runs/create/route.ts', 'lib/audit-pack.ts', 'lib/audit-pack-build.ts', 'lib/abap/evidence-model.ts', 'lib/abap/extensibility-router.ts']) {
      expect(read(rel), rel).not.toContain('concept-successors');
    }
  });
});
