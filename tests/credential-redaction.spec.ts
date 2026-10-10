/**
 * SEC-2026-754 — a credential carried as a parameter inside an ABAP literal
 * (a URL query, a form body, a connection string) or as an Authorization
 * header value is redacted from every text a report prints, like the shapes
 * `redactCredentials` already knew. Each case pairs the refusal with text that
 * must stay readable, so the patterns cannot pass by redacting everything.
 *
 * Serverless: pure functions over text.
 */
import { test, expect } from '@playwright/test';
import { buildAbapEvidence, redactCredentials } from '../lib/abap/evidence-model';

test('a token, key or signature in a URL query inside a literal is redacted', () => {
  const cases: Array<[string, string]> = [
    ["lv_url = 'https://api.example.com/v1/orders?access_token=Zt9xQ2wE7rT1'.", 'Zt9xQ2wE7rT1'],
    ["lv_url = 'https://api.example.com/v1?sap-client=100&token=tok-91a'.", 'tok-91a'],
    ["lv_url = 'https://maps.example.com/geo?key=Kx81mmQpz'.", 'Kx81mmQpz'],
    ["lv_url = 'https://blob.example.net/c/f.pdf?sv=2024&sig=AbC%2Bdef123'.", 'AbC%2Bdef123'],
    ["lv_url = 'https://api.example.com/x?apikey=k3y'.", 'k3y'],
    ["lv_url = 'https://api.example.com/x?api_key=k3y2&format=json'.", 'k3y2'],
    ["lv_body = 'grant_type=client_credentials&client_secret=s3cr3t-v4lue'.", 's3cr3t-v4lue'],
    ["lv_conn = 'Server=db;User=app;Password=pa55;'.", 'pa55'],
    ["lv_url = 'https://api.example.com/x?refresh_token=rt-1&id_token=it-2'.", 'rt-1'],
  ];
  for (const [line, secret] of cases) {
    expect(redactCredentials(line), line).not.toContain(secret);
    expect(redactCredentials(line), line).toContain('…<redacted>');
  }
  // The address and the harmless parameters stay readable.
  const kept = redactCredentials("lv_url = 'https://api.example.com/v1?sap-client=100&token=tok-91a&$format=json'.");
  expect(kept).toBe("lv_url = 'https://api.example.com/v1?sap-client=100&token=…<redacted>&$format=json'.");
  expect(redactCredentials("lv_url = 'https://x.example/y?id_token=it-2'.")).not.toContain('it-2');
});

test('an Authorization header value in a literal is redacted, prose is not', () => {
  expect(redactCredentials("lo_req->set_header_field( name = 'Authorization' value = 'Bearer 9f8e7d6c5b4a' ).")).toBe(
    "lo_req->set_header_field( name = 'Authorization' value = 'Bearer …<redacted>' ).",
  );
  expect(redactCredentials("value = 'Basic dXNlcjpwYXNzMTIz'.")).toBe("value = 'Basic …<redacted>'.");
  // The scheme word in prose, and a token built at run time, stay as written.
  expect(redactCredentials('" Bearer authentication against the gateway')).toBe('" Bearer authentication against the gateway');
  expect(redactCredentials("lv_auth = 'Bearer ' && lv_token.")).toBe("lv_auth = 'Bearer ' && lv_token.");
});

test('ABAP syntax that looks like name=value is left alone', () => {
  const untouched = [
    'lv_key = ls_row-key.',
    'zcl_api_key=>create( ).',
    'DATA(lv_token) = zcl_token=>get( ).',
    "lv_url = |https://api.example.com/x?token={ lv_token }|.",
    "CONCATENATE 'https://api.example.com/x?token=' lv_token INTO lv_url.",
    'READ TABLE lt_keys WITH KEY key = lv_key TRANSPORTING NO FIELDS.',
  ];
  for (const line of untouched) expect(redactCredentials(line), line).toBe(line);
});

test('the evidence report quotes the line without the query-string token', () => {
  const code = [
    'REPORT zsec754.',
    'START-OF-SELECTION.',
    "  cl_http_client=>create_by_url( EXPORTING url = 'https://api.example.com/v1?access_token=Zt9xQ2wE7rT1' IMPORTING client = DATA(lo_client) ).",
  ].join('\n');
  const report = buildAbapEvidence(code, 'zsec754.abap');
  expect(JSON.stringify(report)).not.toContain('Zt9xQ2wE7rT1');
});
