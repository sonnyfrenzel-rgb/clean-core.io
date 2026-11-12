import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { signatureStateOf, verdictHeadline, type VerifyResult } from '../lib/audit-pack-verify';
import { newCheckCounters, runPackCheck, runPackageCheck } from '../lib/verify-pack-checks';

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

// 3.0.22: a check still running when another pack is chosen must not land under the new pack. The two handlers of
// the page run through `lib/verify-pack-checks.ts`; here they run with deferred answers, in the order that races.
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** What the page would show: the last value each setter received. */
function screen() {
  const log: string[] = [];
  return {
    log,
    pack: (name: string) => ({
      begin: () => log.push(`begin ${name}`),
      result: (r: string) => log.push(`result ${r}`),
      end: () => log.push(`end ${name}`),
    }),
    pkg: (name: string) => ({
      begin: () => log.push(`package begin ${name}`),
      outcome: (r: string) => log.push(`package ${r}`),
      error: (e: unknown) => log.push(`package error ${String(e)}`),
      end: () => log.push(`package end ${name}`),
    }),
  };
}

test('a pack check that finishes after another pack was chosen is dropped, also when it fails', async () => {
  const c = newCheckCounters();
  const ui = screen();
  const a = deferred<string>();
  const b = deferred<string>();
  const runA = runPackCheck(c, () => a.promise, () => 'A failed', ui.pack('A'));
  const runB = runPackCheck(c, () => b.promise, () => 'B failed', ui.pack('B'));
  a.resolve('A verified');
  await runA;
  expect(ui.log).toEqual(['begin A', 'begin B']);
  b.resolve('B verified');
  await runB;
  expect(ui.log).toEqual(['begin A', 'begin B', 'result B verified', 'end B']);

  const late = deferred<string>();
  const ui2 = screen();
  const runC = runPackCheck(c, () => late.promise, () => 'C failed', ui2.pack('C'));
  const runD = runPackCheck(c, async () => 'D verified', () => 'D failed', ui2.pack('D'));
  await runD;
  late.reject(new Error('zip broken'));
  await runC;
  expect(ui2.log).toEqual(['begin C', 'begin D', 'result D verified', 'end D']);
});

test('a package check started for pack A is dropped when pack B is chosen while it waits', async () => {
  const c = newCheckCounters();
  const ui = screen();
  await runPackCheck(c, async () => 'A verified', () => 'A failed', ui.pack('A'));
  // The package check waits for the signed facts of pack A ...
  const signedFactsOfA = deferred<string>();
  const pkg = runPackageCheck(c, async () => `checked against ${await signedFactsOfA.promise}`, ui.pkg('P'));
  // ... while pack B is chosen and verified.
  await runPackCheck(c, async () => 'B verified', () => 'B failed', ui.pack('B'));
  signedFactsOfA.resolve('run of A');
  await pkg;
  expect(ui.log).toEqual(['begin A', 'result A verified', 'end A', 'package begin P', 'begin B', 'result B verified', 'end B']);
});

test('a newer package check supersedes an older one, whichever answers first', async () => {
  const c = newCheckCounters();
  const ui = screen();
  const older = deferred<string>();
  const newer = deferred<string>();
  const p1 = runPackageCheck(c, () => older.promise, ui.pkg('1'));
  const p2 = runPackageCheck(c, () => newer.promise, ui.pkg('2'));
  newer.resolve('2 ok');
  await p2;
  older.reject(new Error('1 broken'));
  await p1;
  expect(ui.log).toEqual(['package begin 1', 'package begin 2', 'package 2 ok', 'package end 2']);
});

test('the verify page runs both handlers through these checks', () => {
  const page = readFileSync('app/(app)/verify-pack/page.tsx', 'utf8');
  expect(page).toMatch(/await runPackCheck\(\s*checks\.current,/);
  expect(page).toMatch(/await runPackageCheck\(\s*checks\.current,/);
  expect(page).not.toMatch(/packSelection|packageCheck\.current/);
});
