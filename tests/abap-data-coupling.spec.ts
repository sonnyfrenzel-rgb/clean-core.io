import { test, expect } from '@playwright/test';
import { extractDataCoupling } from '../lib/abap/code-assessment';

test.describe('ABAP Data Coupling Analyzer Tests', () => {

  test('should extract simple table select and write operations with correct risk and metadata', () => {
    const abapCode = `
      * Simple Lese- und Schreibzugriffe
      SELECT * FROM vbak INTO TABLE @lt_vbak WHERE vbeln = '123'.
      
      INSERT INTO zsd_ord_risk VALUES @ls_risk.
      
      UPDATE vbap SET netwr = 100 WHERE vbeln = '123'.
    `;

    const coupling = extractDataCoupling(abapCode);
    
    // Expect 3 tables: VBAK (Read, Medium risk), ZSD_ORD_RISK (Write, High risk, Custom), VBAP (Write, High risk)
    expect(coupling.length).toBe(3);

    const vbak = coupling.find(c => c.tableName === 'VBAK');
    expect(vbak).toBeDefined();
    expect(vbak!.accessType).toBe('Read');
    expect(vbak!.isCustom).toBe(false);
    expect(vbak!.riskLevel).toBe('Medium'); // Standard table read is Medium risk
    expect(vbak!.occurrences).toBe(1);
    expect(vbak!.lineNumbers).toContain(3);
    expect(vbak!.snippets![0]).toContain("SELECT * FROM vbak");

    const zsd = coupling.find(c => c.tableName === 'ZSD_ORD_RISK');
    expect(zsd).toBeDefined();
    expect(zsd!.accessType).toBe('Write');
    expect(zsd!.isCustom).toBe(true);
    expect(zsd!.riskLevel).toBe('High'); // Write to custom is High risk
    expect(zsd!.occurrences).toBe(1);
    expect(zsd!.lineNumbers).toContain(5);

    const vbap = coupling.find(c => c.tableName === 'VBAP');
    expect(vbap).toBeDefined();
    expect(vbap!.accessType).toBe('Write');
    expect(vbap!.isCustom).toBe(false);
    expect(vbap!.riskLevel).toBe('High'); // Write to standard table is High risk
    expect(vbap!.occurrences).toBe(1);
    expect(vbap!.lineNumbers).toContain(7);
  });

  test('should support complex JOIN parsing and extract all participating tables', () => {
    const abapCode = `
      SELECT DISTINCT vbak~vbeln, vbap~posnr
        FROM vbak
        INNER JOIN vbap ON vbak~vbeln = vbap~vbeln
        LEFT OUTER JOIN kna1 AS cust ON vbak~kunnr = cust~kunnr
        INTO TABLE @lt_result
        WHERE vbak~erdat = '20260628'.
    `;

    const coupling = extractDataCoupling(abapCode);

    // Should detect: VBAK, VBAP, KNA1
    expect(coupling.length).toBe(3);
    const tables = coupling.map(c => c.tableName);
    expect(tables).toContain('VBAK');
    expect(tables).toContain('VBAP');
    expect(tables).toContain('KNA1');

    for (const c of coupling) {
      expect(c.accessType).toBe('Read');
      expect(c.occurrences).toBe(1);
      expect(c.lineNumbers).toContain(2); // The SELECT statement starts at line 2
    }
  });

  test('should filter out fake tables and keywords like MODE, RISK, SCREEN, LINE', () => {
    const abapCode = `
      * Fake tables and system keywords
      MODIFY SCREEN.
      MODIFY LINE 5.
      DELETE ADJACENT DUPLICATES FROM lt_table.
      
      SELECT * FROM kna1 INTO TABLE @lt_kna1.
    `;

    const coupling = extractDataCoupling(abapCode);

    // Should ONLY detect KNA1
    expect(coupling.length).toBe(1);
    expect(coupling[0].tableName).toBe('KNA1');
  });

  test('should properly combine multiple read/write access types for the same table', () => {
    const abapCode = `
      SELECT SINGLE * FROM mara INTO @ls_mara WHERE matnr = 'M1'.
      
      UPDATE mara SET mtart = 'ROH' WHERE matnr = 'M1'.
    `;

    const coupling = extractDataCoupling(abapCode);

    expect(coupling.length).toBe(1);
    expect(coupling[0].tableName).toBe('MARA');
    expect(coupling[0].accessType).toBe('Read/Write');
    expect(coupling[0].occurrences).toBe(2);
    expect(coupling[0].lineNumbers).toContain(2);
    expect(coupling[0].lineNumbers).toContain(4);
  });

  test('should analyze the 1000-LOC golden file and correctly identify tables and skip false positives', () => {
    const fs = require('fs');
    const path = require('path');
    const abapFilePath = path.join(__dirname, '../abap-test-files/ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap');
    const abapCode = fs.readFileSync(abapFilePath, 'utf8');

    const coupling = extractDataCoupling(abapCode);
    const tables = coupling.map(c => c.tableName);

    // Verify standard tables are detected
    expect(tables).toContain('VBAK');
    expect(tables).toContain('VBAP');
    expect(tables).toContain('KNA1');
    expect(tables).toContain('KNB1');
    expect(tables).toContain('MARA');
    expect(tables).toContain('MARC');
    expect(tables).toContain('MARD');

    // Verify custom tables are detected
    expect(tables).toContain('ZSD_ORD_RISK');
    expect(tables).toContain('ZSD_LEGACY_LOG');

    // Verify false positives are skipped
    expect(tables).not.toContain('MODE');
    expect(tables).not.toContain('RISK');
    expect(tables).not.toContain('TASK');
    expect(tables).not.toContain('SCREEN');
    expect(tables).not.toContain('LINE');
  });

});
