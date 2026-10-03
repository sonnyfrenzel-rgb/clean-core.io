import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * With stored credentials the connection — URL and auth type alike — comes
 * from the vault (`resolveS4Connection`), not from the request body. The URL
 * candidates for the metadata document have to follow the same resolved
 * values; reading the auth type from the raw body tried the wrong candidate
 * order whenever the body and the stored connection disagreed.
 */
const ROUTE = path.join(__dirname, '..', 'app', 'api', 'fetch-odata-metadata', 'route.ts');

test('metadata URL candidates follow the resolved auth type, never the raw body', () => {
  const src = fs.readFileSync(ROUTE, 'utf8');
  expect(src).toContain("resolvedBody.authType === 'sap_hub'");
  expect(src.match(/(?<![\w.])body\.authType/g) ?? []).toEqual([]);
});
