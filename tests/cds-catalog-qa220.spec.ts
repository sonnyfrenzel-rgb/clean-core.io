import { test, expect } from '@playwright/test';
import { CDS_CATALOG } from '../lib/abap/cds-catalog';
import release from '../lib/abap/generated/cloudification-repo.latest.json';

/**
 * QA full review of v2.20.0, slice A (142387f5c501): the CDS seed list was
 * labelled "VERIFY before use" and returned as released-view candidates anyway —
 * and two of its six views (`I_PurchaseOrderItem`, `I_OperationalAcctgDocmtItem`)
 * are not in SAP's release file at all. Every view a match can name has to be
 * one SAP lists as released.
 */

const entries = (release as unknown as { entries: Record<string, { state?: string } | undefined> }).entries;

test('every view the CDS catalog can propose is listed as released by SAP', () => {
  for (const entry of CDS_CATALOG) {
    const state = entries[entry.view.toUpperCase()]?.state;
    expect(state, `${entry.view} for ${entry.tables.join('+')}`).toBe('released');
  }
});
