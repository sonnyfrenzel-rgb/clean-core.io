import { test, expect } from '@playwright/test';
import { spawnSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import JSZip from 'jszip';

const ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'verify-export.ps1');

/**
 * The offline verifier, run rather than read.
 *
 * `tests/verify-export-verdict-guard.spec.ts` checks the shape of the script,
 * and shape is not behaviour: it can be right about every branch and still be
 * wrong about what the script does (QA review of 732d37007a68). GitHub's
 * ubuntu runners ship PowerShell Core, so the script can be executed with three
 * archives and asked for its verdict.
 *
 * What is being defended: an archive with no signature, and a signed archive
 * whose signature nobody checked, must not read like a verified one. Before
 * 16.09.2026 all three cases ended in `SUCCESS` with code 0.
 *
 * Exit codes, shared with `scripts/verify-pack.mjs`:
 *   0 verified · 1 verification failed · 2 could not run the check
 */

/** `pwsh` on Linux and modern Windows, `powershell` on a Windows box without it. */
function powershell(): string | null {
  for (const exe of ['pwsh', 'powershell']) {
    const probe = spawnSync(exe, ['-NoProfile', '-Command', 'exit 0'], { encoding: 'utf8' });
    if (!probe.error && probe.status === 0) return exe;
  }
  return null;
}

const sha256 = (b: Buffer | string) => crypto.createHash('sha256').update(b).digest('hex');

/**
 * An archive in exactly the shape `scripts/export-source.ps1` produces: the
 * canonical manifest is `path:sha256;` per file, sorted by path, and the
 * signature is an HMAC over the manifest digest — not over the files.
 */
async function buildArchive(
  dir: string,
  name: string,
  opts: { signed: boolean; key?: string },
): Promise<string> {
  const files = [
    { p: 'a.txt', body: 'hello' },
    { p: 'src/b.ts', body: 'export const b = 1;\n' },
  ];
  const entries = files
    .map((f) => ({ path: f.p, sha256: sha256(Buffer.from(f.body, 'utf8')) }))
    .sort((x, y) => (x.path < y.path ? -1 : 1));
  const canonical = entries.map((e) => `${e.path}:${e.sha256};`).join('');
  const manifestHash = sha256(canonical);

  const manifest = {
    exportTimestamp: '2026-09-16T00:00:00Z',
    platformVersion: 'spec-fixture',
    filesCount: entries.length,
    manifestHash,
    signature: opts.signed
      ? crypto.createHmac('sha256', opts.key!).update(manifestHash).digest('hex')
      : '',
    signed: opts.signed,
    files: entries,
  };

  const zip = new JSZip();
  for (const f of files) zip.file(f.p, f.body);
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  const out = path.join(dir, `${name}.zip`);
  fs.writeFileSync(out, await zip.generateAsync({ type: 'nodebuffer' }));
  return out;
}

test.describe('the offline export verifier, executed', () => {
  const KEY = 'spec-fixture-signing-key-0123456789';
  let shell: string | null = null;
  let dir = '';

  test.beforeAll(() => {
    shell = powershell();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-export-'));
  });

  const run = (zip: string, withKey: boolean) => {
    const args = ['-NoProfile', '-File', SCRIPT, '-ZipPath', zip];
    if (withKey) args.push('-SigningKey', KEY);
    const r = spawnSync(shell!, args, { encoding: 'utf8', env: { ...process.env, AUDIT_SIGNING_KEY: '' } });
    return { code: r.status, out: `${r.stdout ?? ''}\n${r.stderr ?? ''}` };
  };

  test('a signed archive checked against its key is the only SUCCESS', async () => {
    test.skip(!shell, 'No PowerShell on this machine — the runtime check cannot run here.');
    const zip = await buildArchive(dir, 'signed', { signed: true, key: KEY });
    const verified = run(zip, true);

    // If the baseline cannot even run, this platform cannot execute the script
    // and asserting anything about the other two would be asserting about noise.
    test.skip(
      verified.code !== 0 && !/Verification/.test(verified.out),
      `The script did not run under ${shell}: ${verified.out.trim().slice(0, 300)}`,
    );

    expect(verified.code, `verified archive did not exit 0:\n${verified.out}`).toBe(0);
    expect(verified.out).toContain('SUCCESS');

    // The same archive, without the key: integrity holds, authorship does not.
    const unchecked = run(zip, false);
    expect(unchecked.code, `a signature nobody checked exited ${unchecked.code}:\n${unchecked.out}`).toBe(2);
    expect(unchecked.out).toContain('INTEGRITY ONLY');
    expect(unchecked.out, 'an unchecked signature still reads as success').not.toContain('SUCCESS');

    // And an archive that carries no signature at all.
    const plainZip = await buildArchive(dir, 'plain', { signed: false });
    const plain = run(plainZip, false);
    expect(plain.code, `an unsigned archive exited ${plain.code}:\n${plain.out}`).toBe(2);
    expect(plain.out).toContain('INTEGRITY ONLY');
    expect(plain.out, 'an unsigned archive still reads as success').not.toContain('SUCCESS');
  });

  test('a tampered file is a failure, not an incomplete check', async () => {
    test.skip(!shell, 'No PowerShell on this machine — the runtime check cannot run here.');
    // The third code has to stay distinct from the second: "could not tell" and
    // "does not match" are different answers and lead to different actions.
    const zip = await buildArchive(dir, 'tampered', { signed: true, key: KEY });
    const buf = await JSZip.loadAsync(fs.readFileSync(zip));
    buf.file('a.txt', 'goodbye');
    const broken = path.join(dir, 'tampered-edited.zip');
    fs.writeFileSync(broken, await buf.generateAsync({ type: 'nodebuffer' }));

    const r = run(broken, true);
    test.skip(r.code !== 1 && !/Verification/.test(r.out), `The script did not run under ${shell}.`);
    expect(r.code, `a changed file did not exit 1:\n${r.out}`).toBe(1);
    expect(r.out).not.toContain('SUCCESS');
  });
});
