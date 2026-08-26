/**
 * Two traps that produce no error at all — which is what makes them expensive.
 *
 * 1. An OData service path appended to an allowlisted host. The SSRF check
 *    decides which HOST may be reached; nothing decided which PATH, so a request
 *    could read anything the tenant credentials can — and with
 *    useStoredCredentials those are the vault's. One sibling route validated,
 *    the other concatenated the raw body value.
 *
 * 2. A dotted field name inside `set(..., { merge: true })`. Firestore's `set`
 *    does not interpret dotted paths (only `update` does), so
 *    `{ 'auditMetadata.auditPackExportedAt': x }` created a literal top-level
 *    field with a dot in its name and left the intended one unset. No exception,
 *    no warning — the write "succeeds" and the value is simply not where anyone
 *    looks for it.
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { isSafeODataServicePath } from '../lib/url-validation';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test.describe('OData service paths are constrained, not just hosts', () => {
  test('accepts the shape SAP actually uses', () => {
    expect(isSafeODataServicePath('/sap/opu/odata/sap/API_BUSINESS_PARTNER')).toBe(true);
    expect(isSafeODataServicePath('/sap/opu/odata/SAP/ZMY_SRV')).toBe(true);
    expect(isSafeODataServicePath('/sap/opu/odata/sap/API_SALES_ORDER_SRV')).toBe(true);
  });

  test('rejects traversal, encoded traversal and off-service paths', () => {
    expect(isSafeODataServicePath('/sap/bc/any/path')).toBe(false);
    expect(isSafeODataServicePath('/sap/opu/odata/../../bc/gui')).toBe(false);
    expect(isSafeODataServicePath('/sap/opu/odata/%2e%2e/%2e%2e/bc')).toBe(false);
    expect(isSafeODataServicePath('/sap/opu/odata/sap/X%2fY')).toBe(false);
    expect(isSafeODataServicePath('/sap/opu/odata/sap/A?$filter=1')).toBe(false);
    expect(isSafeODataServicePath('')).toBe(false);
    // Not a string at all — the body is caller-controlled JSON.
    expect(isSafeODataServicePath(undefined as unknown as string)).toBe(false);
    expect(isSafeODataServicePath({} as unknown as string)).toBe(false);
  });

  for (const rel of ['app/api/fetch-s4-metadata/route.ts', 'app/api/test-s4-odata-read/route.ts']) {
    test(`${rel} validates before building the URL`, () => {
      const source = read(rel);
      expect(source, `${rel} must use the shared validator`).toContain('isSafeODataServicePath');
      // The raw body value must not reach the concatenation.
      expect(source).not.toContain('body.servicePath ||');
    });
  }
});

test.describe('Firestore writes land where they are read', () => {
  test('the audit pack export timestamp is written nested, not as a dotted key', () => {
    const source = read('app/api/audit-pack/create/route.ts');
    // `set` does not resolve dotted paths — this wrote a field literally named
    // "auditMetadata.auditPackExportedAt" and the real one stayed unset.
    expect(source).not.toContain("'auditMetadata.auditPackExportedAt'");
    expect(source).toContain('auditMetadata: { auditPackExportedAt');
  });

  test('dotted paths are only used with update(), which does resolve them', () => {
    const source = read('lib/firebase-admin.ts');
    const dotted = 'chargedInputs.${inputHash}';
    if (!source.includes(dotted)) return;
    const idx = source.indexOf(dotted);
    // Look back far enough to see which API the object is handed to.
    const before = source.slice(Math.max(0, idx - 400), idx + 400);
    expect(before, 'a dotted field path must go to update(), never set()').toContain('tx.update(');
  });
});
