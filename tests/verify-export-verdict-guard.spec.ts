import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/**
 * The offline verifier may only say SUCCESS when it verified a signature.
 *
 * `scripts/verify-export.ps1` checks a source-export ZIP: file hashes, the
 * manifest digest, and — if a key is supplied — the HMAC signature. Until
 * 16.09.2026 every path fell through to `Verification complete: SUCCESS.` with
 * exit code 0: an archive carrying no signature at all, and a signed archive
 * whose signature nobody had checked because no key was given, ended in the
 * same word as a fully verified one. Checksums that agree with each other say
 * the archive is consistent with itself; they say nothing about who produced it.
 *
 * Its sibling `scripts/verify-pack.mjs` had the rule right all along and writes
 * it down: "0 verified · 1 verification failed · 2 could not run the check …
 * A pack without an Ed25519 signature exits 2, not 0". Two verifiers of the same
 * product must not answer the same question differently.
 *
 * This is a source guard because CI runs on Linux and cannot execute PowerShell.
 * It therefore checks the shape rather than the behaviour: every branch that
 * does not verify a signature leaves with 2, and the SUCCESS line is reachable
 * only after the comparison. The behaviour itself was verified by running the
 * script against three fixtures on Windows (signed with the key: exit 0; signed
 * without the key: exit 2; unsigned: exit 2).
 */
test.describe('the offline export verifier', () => {
  const script = () => read('scripts/verify-export.ps1');

  test('there is one success verdict and nothing runs after it', () => {
    const s = script();
    // The verdict the reader sees, not every mention of the word — the comment
    // above the branch quotes the old one on purpose.
    const verdicts = [...s.matchAll(/Write-Output\s+"[^"]*SUCCESS[^"]*"/g)];
    expect(verdicts.length, 'there is not exactly one success verdict').toBe(1);

    // It is the last thing the script does, so "reached the end" and "said
    // SUCCESS" are the same event and the test below covers both.
    expect(s.slice(verdicts[0].index! + verdicts[0][0].length).trim(), 'something runs after the verdict').toBe('');

    // Deliberately NOT asserted here: that the verdict comes after the
    // signature comparison. It did in the broken version too — the branches
    // simply fell past it — so position proves nothing. What distinguishes the
    // two versions is the test below, and that is where the guard has to bite.
  });

  test('every path that verified no signature leaves with code 2', () => {
    const s = script();
    // The two branches that reach the end without a compared signature.
    for (const branch of [
      'the archive is signed and no -SigningKey',
      'This archive carries no signature',
    ]) {
      const at = s.indexOf(branch);
      expect(at, `the branch "${branch}" is gone`).toBeGreaterThan(-1);
      // `exit 2` has to follow within the same branch, before anything else exits.
      const after = s.slice(at, at + 400);
      expect(after, `"${branch}" does not leave with code 2`).toMatch(/exit 2/);
      expect(after.slice(0, after.indexOf('exit 2')), `"${branch}" leaves with another code first`)
        .not.toMatch(/exit [013]/);
    }
    // Two of them, no more: a third silent path would be the old defect again.
    expect(s.match(/exit 2/g)?.length, 'the number of "could not tell" exits changed').toBe(2);
  });

  test('it is plain ASCII, because it is read as ANSI', () => {
    // Windows PowerShell 5.1 reads a .ps1 without a byte-order mark as ANSI.
    // An em dash is three UTF-8 bytes, one of which is a curly quote in CP1252,
    // and the parser then reports an unterminated string — for a comment. This
    // file has no BOM, so it stays ASCII.
    const raw = fs.readFileSync(path.join(ROOT, 'scripts/verify-export.ps1'));
    expect(raw[0], 'the file gained a byte-order mark; then this rule can be dropped').not.toBe(0xef);
    const nonAscii = [...script()].filter((c) => c.charCodeAt(0) > 127);
    expect(nonAscii, `non-ASCII characters in a BOM-less .ps1: ${nonAscii.join(' ')}`).toEqual([]);
  });

  test('the two verifiers agree on what the exit codes mean', () => {
    // The rule is written down once, in the sibling, and this guard is what
    // keeps the PowerShell one from drifting away from it again.
    const sibling = read('scripts/verify-pack.mjs');
    expect(sibling).toContain('0 verified');
    expect(sibling).toContain('2 could not run the check');
    expect(script(), 'the PowerShell verifier does not name the shared convention').toContain('verify-pack.mjs');
  });
});
