import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * The MCP beta through the real routes (`app/api/mcp/route.ts`,
 * `app/api/mcp/[key]/route.ts`) of a running build — docs/design/mcp-beta.md.
 *
 * Two modes, chosen by whether the test process has `MCP_BETA_KEY` (the server
 * the suite starts inherits the same environment):
 *   - without it, as in CI: the route does not exist to anybody — every verb,
 *     with or without a key in the path or the header, is 404;
 *   - with it: the whole stateless exchange a Claude custom connector makes —
 *     initialize, notifications/initialized, tools/list, tools/call on the PO
 *     starter example — over the path-key URL, and the Bearer form beside it.
 * The production refusal (404 with the key set) is covered server-free in
 * tests/mcp-beta.spec.ts, since one server cannot be both.
 */

const KEY = process.env.MCP_BETA_KEY || '';
const ON = KEY.length >= 32;
const PO = fs.readFileSync(path.join(__dirname, '..', 'public/starter-examples/Z_MM_PO_APPROVAL.abap'), 'utf8');
const JSON_HEADERS = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };

test.describe('MCP beta route — off', () => {
  test.skip(ON, 'MCP_BETA_KEY is set for this run; the on-mode tests below cover it');

  test('every verb and form answers 404 when no key is configured', async ({ request }) => {
    const body = { jsonrpc: '2.0', id: 1, method: 'tools/list' };
    const guess = 'x'.repeat(40);
    expect((await request.post('/api/mcp', { data: body, headers: JSON_HEADERS })).status()).toBe(404);
    expect((await request.post(`/api/mcp/${guess}`, { data: body, headers: JSON_HEADERS })).status()).toBe(404);
    expect((await request.post('/api/mcp', { data: body, headers: { ...JSON_HEADERS, authorization: `Bearer ${guess}` } })).status()).toBe(404);
    expect((await request.get(`/api/mcp/${guess}`)).status()).toBe(404);
  });
});

test.describe('MCP beta route — on', () => {
  test.skip(!ON, 'MCP_BETA_KEY is not set for this run; the off-mode test above covers it');

  const url = () => `/api/mcp/${KEY}`;

  test('the connector exchange: initialize, initialized, tools/list, tools/call', async ({ request }) => {
    const init = await request.post(url(), {
      headers: JSON_HEADERS,
      data: { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'spec', version: '1' } } },
    });
    expect(init.status()).toBe(200);
    expect(init.headers()['mcp-session-id']).toBeUndefined();
    expect(init.headers()['set-cookie']).toBeUndefined();
    expect(init.headers()['cache-control']).toBe('no-store');
    const initBody = await init.json();
    expect(initBody.result.protocolVersion).toBe('2025-11-25');

    const note = await request.post(url(), {
      headers: { ...JSON_HEADERS, 'mcp-protocol-version': '2025-11-25' },
      data: { jsonrpc: '2.0', method: 'notifications/initialized' },
    });
    expect(note.status()).toBe(202);

    const list = await request.post(url(), { headers: JSON_HEADERS, data: { jsonrpc: '2.0', id: 2, method: 'tools/list' } });
    expect((await list.json()).result.tools.map((t: { name: string }) => t.name)).toEqual(['analyze_abap', 'export_bpmn', 'lookup_sap_object_level']);

    const callRes = await request.post(url(), {
      headers: JSON_HEADERS,
      data: { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'analyze_abap', arguments: { source: PO } } },
    });
    expect(callRes.status()).toBe(200);
    const result = (await callRes.json()).result;
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ origin: 'engine', ai_generated: false, signed: false });
    expect(result.structuredContent.findings.length).toBeGreaterThan(0);

    const notAbap = await request.post(url(), {
      headers: JSON_HEADERS,
      data: { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'analyze_abap', arguments: { source: 'Hello team, please approve.' } } },
    });
    expect((await notAbap.json()).result.structuredContent.error.code).toBe('not-abap');
  });

  test('Bearer form, GET 405, wrong key 404, foreign origin 403', async ({ request }) => {
    const viaHeader = await request.post('/api/mcp', {
      headers: { ...JSON_HEADERS, authorization: `Bearer ${KEY}` },
      data: { jsonrpc: '2.0', id: 1, method: 'ping' },
    });
    expect(viaHeader.status()).toBe(200);
    const get = await request.get(url());
    expect(get.status()).toBe(405);
    expect(get.headers()['allow']).toBe('POST');
    expect((await request.post(`/api/mcp/${KEY}x`, { headers: JSON_HEADERS, data: { jsonrpc: '2.0', id: 1, method: 'ping' } })).status()).toBe(404);
    const foreign = await request.post(url(), {
      headers: { ...JSON_HEADERS, origin: 'https://evil.example' },
      data: { jsonrpc: '2.0', id: 1, method: 'ping' },
    });
    expect(foreign.status()).toBe(403);
  });
});
