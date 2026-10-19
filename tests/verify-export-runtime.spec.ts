import { test, expect } from '@playwright/test';
import { spawn, spawnSync } from 'child_process';
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

/**
 * `pwsh` on Linux and modern Windows, `powershell` on a Windows box without it.
 *
 * The probe asks for a distinctive exit code rather than zero, so it establishes
 * both halves of what the tests below need: the shell runs, and its exit code
 * reaches us. Deliberately probed with a trivial command and **not** with the
 * script under test — otherwise a verifier that exits wrongly and prints
 * nothing recognisable would be mistaken for a machine that cannot run
 * PowerShell, and the suite would skip the regression instead of reporting it
 * (QA review of 1f97a82c9787).
 */
function powershell(): string | null {
  for (const exe of ['pwsh', 'powershell']) {
    const probe = spawnSync(exe, ['-NoProfile', '-Command', 'exit 7'], { encoding: 'utf8' });
    if (!probe.error && probe.status === 7) return exe;
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

/**
 * A manifest whose entries were edited, made consistent again: `manifestHash` over the entries in the order the
 * verifier reads them (PowerShell's `Sort-Object -Property path`, a culture comparison — `localeCompare` here) and a
 * fresh signature. A refusal of such an archive comes from the check of the entries, not from a broken signature.
 */
function resign(manifest: { files: Array<{ path: string; sha256: string }>; manifestHash: string; signature: string; filesCount: number }, key: string): void {
  const sorted = [...manifest.files].sort((x, y) => x.path.localeCompare(y.path, 'en'));
  manifest.manifestHash = sha256(sorted.map((e) => `${e.path}:${e.sha256};`).join(''));
  manifest.signature = crypto.createHmac('sha256', key).update(manifest.manifestHash).digest('hex');
  manifest.filesCount = manifest.files.length;
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
    expect(r.code, `a changed file did not exit 1:\n${r.out}`).toBe(1);
    expect(r.out).not.toContain('SUCCESS');
  });

  test('SEC-c41f149-02', async () => {
    test.skip(!shell, 'No PowerShell on this machine — the runtime check cannot run here.');
    const zip = await buildArchive(dir, 'extra', { signed: true, key: KEY });
    const buf = await JSZip.loadAsync(fs.readFileSync(zip));
    buf.file('src/extra.ts', 'export const extra = 1;\n');
    const extra = path.join(dir, 'extra-edited.zip');
    fs.writeFileSync(extra, await buf.generateAsync({ type: 'nodebuffer' }));
    const r = run(extra, true);
    expect(r.code, r.out).toBe(1);
    expect(r.out).toContain('src/extra.ts');
    expect(r.out).not.toContain('SUCCESS');

    // The control for `resign`: the extra file listed and the manifest signed again is a verified archive — so a
    // re-signed manifest below is refused by the check of its entries alone (843d8d65d0bc).
    const control = await JSZip.loadAsync(fs.readFileSync(extra));
    const listed = JSON.parse(await control.file('manifest.json')!.async('string'));
    listed.files = [...listed.files, { path: 'src/extra.ts', sha256: sha256(Buffer.from('export const extra = 1;\n', 'utf8')) }];
    resign(listed, KEY);
    control.file('manifest.json', JSON.stringify(listed, null, 2));
    const controlZip = path.join(dir, 'extra-listed.zip');
    fs.writeFileSync(controlZip, await control.generateAsync({ type: 'nodebuffer' }));
    const c = run(controlZip, true);
    expect(c.code, c.out).toBe(0);
    expect(c.out).toContain('SUCCESS');

    // A manifest that names one file twice — signed again, so only the check of the entries can refuse it.
    const twice = await JSZip.loadAsync(fs.readFileSync(zip));
    const manifest = JSON.parse(await twice.file('manifest.json')!.async('string'));
    manifest.files = [...manifest.files, manifest.files[0]];
    resign(manifest, KEY);
    twice.file('manifest.json', JSON.stringify(manifest, null, 2));
    const twiceZip = path.join(dir, 'twice-edited.zip');
    fs.writeFileSync(twiceZip, await twice.generateAsync({ type: 'nodebuffer' }));
    const t = run(twiceZip, true);
    expect(t.code, t.out).toBe(1);
    expect(t.out).toContain('Manifest lists a file twice: a.txt');
    expect(t.out).not.toContain('SUCCESS');
  });

  test('SEC-c41f149-05', async () => {
    test.skip(!shell, 'No PowerShell on this machine — the runtime check cannot run here.');
    const outside = path.join(dir, 'outside.txt');
    fs.writeFileSync(outside, 'not part of any archive');
    const outsideHash = sha256(fs.readFileSync(outside));
    for (const [name, p] of [
      // From the extraction folder (scripts/tmp_verify_extract_<id>) to the file above.
      ['relative', `../${path.relative(path.join(ROOT, 'scripts'), outside).split(path.sep).join('/')}`],
      ['absolute', outside],
    ] as const) {
      const zip = await buildArchive(dir, `path-${name}`, { signed: true, key: KEY });
      const buf = await JSZip.loadAsync(fs.readFileSync(zip));
      const manifest = JSON.parse(await buf.file('manifest.json')!.async('string'));
      // The file's real hash and a fresh signature: only the path check can refuse it (843d8d65d0bc).
      manifest.files = [...manifest.files, { path: p, sha256: outsideHash }];
      resign(manifest, KEY);
      buf.file('manifest.json', JSON.stringify(manifest, null, 2));
      const edited = path.join(dir, `path-${name}-edited.zip`);
      fs.writeFileSync(edited, await buf.generateAsync({ type: 'nodebuffer' }));
      const r = run(edited, true);
      expect(r.code, `${name}:\n${r.out}`).toBe(1);
      expect(r.out, name).toContain('Manifest path is not a file of this archive');
      expect(r.out, name).not.toContain(outsideHash);
      expect(r.out, name).not.toContain('SUCCESS');
    }
  });

  test('checks started together each read their own archive', async () => {
    test.skip(!shell, 'No PowerShell on this machine — the runtime check cannot run here.');
    // The extraction folder was named after the clock, so two checks started in the same moment shared it: the
    // second removed and refilled the first one's files, and a signed archive failed on the other one's
    // "goodbye" (seen 16.10.2026 as a flaky run of the two tests above, which run in parallel).
    const good = await buildArchive(dir, 'together-good', { signed: true, key: KEY });
    const bad = await JSZip.loadAsync(fs.readFileSync(good));
    bad.file('a.txt', 'goodbye');
    const badZip = path.join(dir, 'together-bad.zip');
    fs.writeFileSync(badZip, await bad.generateAsync({ type: 'nodebuffer' }));
    const runAsync = (zip: string) =>
      new Promise<number | null>((resolve) => {
        const p = spawn(shell!, ['-NoProfile', '-File', SCRIPT, '-ZipPath', zip, '-SigningKey', KEY], { env: { ...process.env, AUDIT_SIGNING_KEY: '' } });
        p.on('close', (code) => resolve(code));
      });
    const zips = [good, badZip, good, badZip, good, badZip];
    const codes = await Promise.all(zips.map(runAsync));
    expect(codes).toEqual([0, 1, 0, 1, 0, 1]);
  });
});
