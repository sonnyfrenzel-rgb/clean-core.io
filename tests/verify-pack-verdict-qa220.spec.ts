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

// 3.0.22: a check still running when another pack is chosen must not land under the new pack.
// Every state write after an await in the two handlers asks whether its selection is still the current one.
test('a pack or package check that finishes after a newer selection is dropped', () => {
  const page = readFileSync('app/(app)/verify-pack/page.tsx', 'utf8').replace(/\r\n/g, '\n');
  const body = (start: string, end: string) => {
    const from = page.indexOf(start);
    const to = page.indexOf(end, from);
    expect(from, start).toBeGreaterThan(-1);
    expect(to, end).toBeGreaterThan(from);
    return page.slice(from, to);
  };
  const pack = body('const handleFile = useCallback(', '\n  }, []);');
  const pkg = body('const handlePackage = useCallback(', '\n  }, [packFile, result]);');

  // Choosing a pack invalidates every package check still running.
  expect(pack).toMatch(/const selection = \+\+packSelection\.current;/);
  expect(pack).toContain('packageCheck.current++;');
  // After the verifier answers, the result is kept only for the pack still selected.
  const afterAwait = pack.slice(pack.indexOf('await verifyAuditPack(file)'));
  const guardedResultWrites = afterAwait.split('\n').filter((l) => /\bsetResult\(/.test(l)).length;
  expect(guardedResultWrites).toBe(2);
  expect(afterAwait.match(/if \(selection !== packSelection\.current\) return;/g)?.length).toBe(2);
  expect(afterAwait).toContain('if (selection === packSelection.current) setVerifying(false);');

  // A package check writes its outcome only while it is still the latest check.
  expect(pkg).toMatch(/const check = \+\+packageCheck\.current;/);
  const pkgAfterAwait = pkg.slice(pkg.indexOf('await '));
  const writes = pkgAfterAwait.split('\n').filter((l) => /\bset(?:Delivery|CheckingDelivery)\(/.test(l));
  expect(writes.length).toBe(3);
  for (const line of writes) expect(line, line.trim()).toMatch(/^\s*if \(current\(\)\) set(?:Delivery|CheckingDelivery)\(/);
});
