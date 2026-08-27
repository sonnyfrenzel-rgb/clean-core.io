import { test, expect } from '@playwright/test';
import { buildAbapEvidence } from '../lib/abap/evidence-model';

test.describe('Evidence Engine v1.18 — Codex Improvements', () => {

  const SAMPLE_CODE = `
    REPORT ztest_credit.
    CONSTANTS c_tcode_va02 VALUE 'VA02'.

    SELECT * FROM vbak INTO TABLE @lt_orders WHERE vbeln = '123'.
    SELECT * FROM mard INTO TABLE @lt_stock WHERE matnr = '456'.
    INSERT INTO zsd_ord_risk VALUES @ls_risk.

    CALL FUNCTION 'Z_CREDIT_EXPOSURE_READ'
      EXPORTING iv_kunnr = lv_kunnr.

    CALL TRANSACTION c_tcode_va02 USING lt_bdcdata MODE 'N'.

    EXEC SQL.
      SELECT * FROM native_table
    ENDEXEC.

    SUBMIT rv_order_flow_information AND RETURN.

    CALL FUNCTION 'SO_NEW_DOCUMENT_SEND_API1'
      EXPORTING document_data = ls_doc.

    COMMIT WORK.
  `;

  test('a replacement says where its name came from', () => {
    // This test used to be called "should produce Catalog Match instead of
    // Verified for known SAP tables" and asserted exactly that, which is how the
    // two provenances came to be flattened into one label. VBAK resolves through
    // the curated layer in sap-api-catalog.ts (API_SALES_ORDER_SRV), while SAP's
    // own release data names I_SALESDOCUMENT. Both are defensible targets; only
    // one of them is a lookup, and the catalog version belongs to that one.
    const report = buildAbapEvidence(SAMPLE_CODE, 'test.abap', 'public');
    const vbak = report.findings.find(f => f.objectName === 'VBAK' && f.kind === 'standard-table-read');
    expect(vbak).toBeDefined();
    expect(vbak!.sapReplacement).toBeDefined();
    expect(vbak!.sapReplacement!.confidence).toBe('Verified');
    expect(
      vbak!.sapReplacement!.catalogVersion,
      'SAP’s catalog version must not be stamped on a curated mapping',
    ).toBeUndefined();
  });

  test('should differentiate severity based on deployment context', () => {
    const publicReport = buildAbapEvidence(SAMPLE_CODE, 'test.abap', 'public');
    const privateReport = buildAbapEvidence(SAMPLE_CODE, 'test.abap', 'private');

    const publicVbak = publicReport.findings.find(f => f.objectName === 'VBAK' && f.kind === 'standard-table-read');
    const privateVbak = privateReport.findings.find(f => f.objectName === 'VBAK' && f.kind === 'standard-table-read');

    expect(publicVbak!.severity).toBe('High');
    expect(privateVbak!.severity).toBe('Medium');
    expect(publicVbak!.technicalDetail).toContain('Public Cloud');
    expect(privateVbak!.technicalDetail).toContain('Private Cloud');
  });

  test('should detect Credit Management custom logic', () => {
    const report = buildAbapEvidence(SAMPLE_CODE, 'test.abap');
    const credit = report.findings.find(f => f.kind === 'credit-management');
    expect(credit).toBeDefined();
    expect(credit!.title).toContain('Credit Management');
    expect(credit!.recommendation).toContain('FSCM');
    expect(credit!.needsBusinessDecision).toBe(true);
  });

  test('should detect legacy mail service with correct kind', () => {
    const report = buildAbapEvidence(SAMPLE_CODE, 'test.abap');
    const mail = report.findings.find(f => f.kind === 'legacy-mail');
    expect(mail).toBeDefined();
    expect(mail!.title).toContain('SO_NEW_DOCUMENT_SEND_API1');
  });

  test('should detect EXEC SQL, SUBMIT, and COMMIT WORK', () => {
    const report = buildAbapEvidence(SAMPLE_CODE, 'test.abap');
    const execSql = report.findings.find(f => f.kind === 'native-sql');
    const submit = report.findings.find(f => f.kind === 'submit');
    const commit = report.findings.find(f => f.kind === 'commit-work');

    expect(execSql).toBeDefined();
    expect(execSql!.severity).toBe('Critical');
    expect(submit).toBeDefined();
    expect(commit).toBeDefined();
  });

  test('should use granular stock mapping for MARD', () => {
    const report = buildAbapEvidence(SAMPLE_CODE, 'test.abap');
    const mard = report.findings.find(f => f.objectName === 'MARD' && f.kind === 'standard-table-read');
    expect(mard).toBeDefined();
    expect(mard!.sapReplacement).toBeDefined();
    expect(mard!.sapReplacement!.objectName).toBe('I_MaterialStockInStorageLocation');
  });

  test('should produce sap-official Catalog Match for T005 via Cloudification Repository', () => {
    const code = `SELECT * FROM t005 INTO TABLE @lt_data.`;
    const report = buildAbapEvidence(code, 'test.abap');
    const t005 = report.findings.find(f => f.objectName === 'T005');
    expect(t005).toBeDefined();
    expect(t005!.sapReplacement).toBeDefined();
    expect(t005!.sapReplacement!.confidence).toBe('Catalog Match');
    expect(t005!.sapReplacement!.objectName).toBe('I_COUNTRY');
  });

  test('proposes no successor for standard tables not in any catalog layer', () => {
    // Changed in v2.4.0. This previously asserted `I_T888Z` at confidence
    // "Candidate" — a name derived by string concatenation, not a lookup.
    // SAP's released views are not mechanically named I_<TABLE>, so the value
    // was an object that does not exist, shown in the field reserved for
    // catalog results and next to a catalog version. The rest of the engine
    // already models this case honestly (NO_PATH_OBJECTS, "no released path"),
    // and the UI renders a missing replacement as an em dash.
    const code = `SELECT * FROM t888z INTO TABLE @lt_data.`;
    const report = buildAbapEvidence(code, 'test.abap');
    const t888z = report.findings.find(f => f.objectName === 'T888Z');
    expect(t888z).toBeDefined();
    expect(t888z!.sapReplacement).toBeUndefined();
    // The finding itself must still be raised — only the guessed name is gone.
    expect(t888z!.kind).toBe('standard-table-read');
  });

  test('golden 1000-LOC file should produce valid evidence report', () => {
    const fs = require('fs');
    const path = require('path');
    const abapFilePath = path.join(__dirname, '../abap-test-files/ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap');
    const abapCode = fs.readFileSync(abapFilePath, 'utf8');

    const report = buildAbapEvidence(abapCode, 'golden.abap', 'public');

    expect(report.findings.length).toBeGreaterThan(5);
    expect(report.summary.criticalCount + report.summary.highCount).toBeGreaterThan(0);

    // This block used to read "Verify no 'Verified' confidence" and assert its
    // absence, which is the other half of the same flattening: it made the
    // curated layer indistinguishable from a lookup in SAP's release data. The
    // invariant that actually matters is that nothing is inferred, and that the
    // catalog version only ever rides on a genuine lookup.
    const replacements = report.findings.map(f => f.sapReplacement).filter(Boolean);
    expect(replacements.length).toBeGreaterThan(0);
    for (const r of replacements) {
      expect(['Catalog Match', 'Verified']).toContain(r!.confidence);
      if (r!.confidence === 'Catalog Match') {
        expect(r!.catalogVersion).toBeTruthy();
      } else {
        expect(r!.catalogVersion).toBeUndefined();
      }
    }
  });
});
