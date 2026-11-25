import { test, expect } from '@playwright/test';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { readCapped, relayTarget } from '../runner/relay';

/**
 * The live run's loopback relay forwards to the credential proxy under the run's capability. The capability
 * stays the first path segment whatever the child asks for, and an answer is read only up to the limit.
 */
const BASE = 'https://app.example/api/s4-proxy';
const CAP = 'c'.repeat(32);

test('a path stays under the capability; dot segments, encoded dots and backslashes are refused', () => {
  expect(relayTarget(BASE, CAP, '/sap/opu/odata/x/Entity?$top=1')).toBe(`${BASE}/${CAP}/sap/opu/odata/x/Entity?$top=1`);
  expect(relayTarget(BASE, CAP, "/sap/Entity('A%2FB')")).toBe(`${BASE}/${CAP}/sap/Entity('A%2FB')`);
  for (const bad of ['/../admin', '/sap/../../x', '/%2e%2e/x', '/%2E%2e/x', '/./x', '/sap\\..\\x', '//evil.example/x', 'x', `/${'a'.repeat(6001)}`]) {
    expect(relayTarget(BASE, CAP, bad), bad).toBeNull();
  }
  // A query may carry dots; it never moves the path.
  expect(relayTarget(BASE, CAP, '/sap/x?$filter=a eq \'../..\'')).not.toBeNull();
});

test('an answer is read up to the limit and no further', async () => {
  const server = http.createServer((_req, res) => {
    res.write(Buffer.alloc(1024, 1));
    res.end(Buffer.alloc(1024, 2));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  try {
    expect((await readCapped(await fetch(url), 4096))?.length).toBe(2048);
    expect(await readCapped(await fetch(url), 1500)).toBeNull();
  } finally {
    server.close();
  }
});
