import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { signatureStateOf, verdictHeadline, type VerifyResult } from '../lib/audit-pack-verify';

// QA full review of fc787674705f, 5214f900855a: a signed pack whose signature
// could not be checked (verification service down) was headlined "Unsigned".
const signedManifest = { signed: true } as unknown as VerifyResult['manifest'];
const unsignedManifest = { signed: false } as unknown as VerifyResult['manifest'];

test('a signed pack whose signature was not checked is not called unsigned', () => {
  const r = { status: 'integrity-only' as const, success: false, signatureValid: null, manifest: signedManifest };
  expect(signatureStateOf(r)).toBe('unchecked');
  expect(verdictHeadline(r)).toBe('Integrity Verified (Signature Not Checked)');
});

test('an unsigned pack is still called unsigned, and the other verdicts are unchanged', () => {
  expect(verdictHeadline({ status: 'integrity-only', success: false, signatureValid: null, manifest: unsignedManifest })).toBe('Integrity Verified (Unsigned)');
  expect(verdictHeadline({ status: 'authentic', success: true, signatureValid: true, manifest: signedManifest })).toBe('Authenticity & Integrity Verified');
  expect(verdictHeadline({ status: 'failed', success: false, signatureValid: false, manifest: signedManifest })).toBe('Verification Failed');
  expect(signatureStateOf({ signatureValid: false, manifest: signedManifest })).toBe('invalid');
});

test('the verify page names the verdict and the signature through these helpers', () => {
  const page = readFileSync('app/(app)/verify-pack/page.tsx', 'utf8');
  expect(page).toContain('{verdictHeadline(result)}');
  expect(page).toContain('state={verdictState(result)}');
  expect(page).toContain('signatureBadge(signatureStateOf(result))');
  expect(page).not.toContain("? 'Integrity Verified (Unsigned)'");
});
