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

  test('should produce Catalog Match instead of Verified for known SAP tables', () => {
    const report = buildAbapEvidence(SAMPLE_CODE, 'test.abap', 'public');
    const vbak = report.findings.find(f => f.objectName === 'VBAK' && f.kind === 'standard-table-read');
    expect(vbak).toBeDefined();
    expect(vbak!.sapReplacement).toBeDefined();
    expect(vbak!.sapReplacement!.confidence).toBe('Catalog Match');
    expect(vbak!.sapReplacement!.catalogVersion).toBeDefined();
    expect(vbak!.sapReplacement!.catalogVersion).toContain('2024');
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

  test('should produce Candidate for standard tables not in any catalog layer', () => {
    const code = `SELECT * FROM t888z INTO TABLE @lt_data.`;
    const report = buildAbapEvidence(code, 'test.abap');
    const t888z = report.findings.find(f => f.objectName === 'T888Z');
    expect(t888z).toBeDefined();
    expect(t888z!.sapReplacement).toBeDefined();
    expect(t888z!.sapReplacement!.confidence).toBe('Candidate');
    expect(t888z!.sapReplacement!.objectName).toBe('I_T888Z');
  });

  test('golden 1000-LOC file should produce valid evidence report', () => {
    const fs = require('fs');
    const path = require('path');
    const abapFilePath = path.join(__dirname, '../abap-test-files/ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap');
    const abapCode = fs.readFileSync(abapFilePath, 'utf8');

    const report = buildAbapEvidence(abapCode, 'golden.abap', 'public');

    expect(report.findings.length).toBeGreaterThan(5);
    expect(report.summary.criticalCount + report.summary.highCount).toBeGreaterThan(0);

    // Verify no 'Verified' confidence — all should be 'Catalog Match' or 'Candidate'
    const allConfidences = report.findings
      .map(f => f.sapReplacement?.confidence)
      .filter(Boolean);
    expect(allConfidences).not.toContain('Verified');
    expect(allConfidences.some(c => c === 'Catalog Match')).toBe(true);
  });
});
