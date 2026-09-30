import { test, expect } from '@playwright/test';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { withPreviewPolicy } from '../lib/export-preview';
import { getPublishedKeyring, resetSigningKeypairCache } from '../lib/audit-signing-keypair';
import { buildAbapEvidence } from '../lib/abap/evidence-model';
import { readTableDependencies } from '../lib/abap/table-dependencies';
import { applyRunnerVerdicts, parseTapOutput } from '../lib/test-verdicts';
import { isUrlSafe } from '../lib/url-validation';

/**
 * Hardening that shipped with the v2.20 security steps C and F.
 *
 * Each block holds one fix to its behaviour. Where the fix is a call in a page
 * or a route that only runs signed in, the block also checks the call is there.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');

test.describe('an exported document previewed in the browser', () => {
  test('runs nothing and fetches nothing, whatever it contains', async ({ page }) => {
    // Whatever reaches the network is answered here, so a request that got past
    // the policy is counted rather than lost to a failed lookup.
    const requested: string[] = [];
    await page.route('**/*example.invalid*/**', (route) => {
      requested.push(route.request().url());
      return route.fulfill({ status: 200, contentType: 'image/png', body: '' });
    });
    const doc = withPreviewPolicy(
      '<!DOCTYPE html><html><head><title>Design</title><style>h1{color:#123}</style></head><body>' +
        '<h1>Design</h1><script>window.__ran = 1</script>' +
        '<img src="https://example.invalid/pixel.png" onerror="window.__ran = 2">' +
        '<form action="https://example.invalid/post"><input name="q"></form>' +
        '</body></html>',
    );
    await page.setContent(doc);
    expect(await page.evaluate(() => (window as unknown as { __ran?: number }).__ran)).toBeUndefined();
    expect(requested).toEqual([]);
    // Styling is what an exported page is; it still applies.
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('h1')!).color)).toBe('rgb(17, 34, 51)');
  });

  test('the design stage opens its preview under that policy', () => {
    const s = read('app/(app)/project/[projectId]/design/page.tsx');
    expect(s).toContain('new Blob([withPreviewPolicy(htmlContent)]');
  });
});

test.describe('the read paths of the process routes and the model settings', () => {
  // Limiting is switched off under the emulator, so what can be checked here is
  // that the call is on the path a GET takes — the shape of the existing guard
  // for `process-states` in tests/route-hardening-b88c77b.spec.ts.
  for (const name of ['process-revisions', 'process-naming', 'process-map']) {
    test(`${name} meters its read with a budget of its own`, () => {
      const src = read(`app/api/projects/[projectId]/${name}/route.ts`);
      const gate = src.slice(src.indexOf('async function openProject'), src.indexOf('const { projectId } = await params;'));
      const keys = [...gate.matchAll(/assertRateLimit\(\s*`([^`]+)`/g)].map((m) => m[1]);
      expect(keys.length, `${name}: the read path is unmetered`).toBe(2);
      expect(keys.some((k) => k.startsWith(`${name}-read:`)), `${name}: the read has no budget of its own`).toBe(true);
      const readBranch = gate.slice(gate.indexOf('} else {'));
      expect(readBranch, `${name}: the read budget is not on the read branch`).toContain(`assertRateLimit(\`${name}-read:`);
    });
  }

  test('model-stages meters its read before it decrypts a key', () => {
    const src = read('app/api/model-stages/route.ts');
    const get = src.slice(src.indexOf('export async function GET'), src.indexOf('export async function POST'));
    expect(get, 'the read is unmetered').toContain('assertRateLimit(`model_stages_read:');
    expect(get.indexOf('assertRateLimit('), 'the limit comes after the work').toBeLessThan(get.indexOf('answerFor('));
  });
});

test.describe('the list of retired signing keys', () => {
  test('takes public keys only — a private key there is refused, not converted', () => {
    const vars = ['AUDIT_SIGNING_PRIVATE_KEY', 'AUDIT_SIGNING_PUBLIC_KEYS_RETIRED'] as const;
    const previous = vars.map((v) => process.env[v]);
    const pem = () => crypto.generateKeyPairSync('ed25519').privateKey.export({ format: 'pem', type: 'pkcs8' }) as string;
    const retiredPrivate = pem();
    try {
      process.env.AUDIT_SIGNING_PRIVATE_KEY = Buffer.from(pem()).toString('base64');
      // As written, and with its newlines as the two characters \ and n.
      for (const shape of [retiredPrivate, retiredPrivate.split('\n').join(String.raw`\n`)]) {
        process.env.AUDIT_SIGNING_PUBLIC_KEYS_RETIRED = shape;
        resetSigningKeypairCache();
        const ring = getPublishedKeyring();
        expect(ring.map((k) => k.status), 'a private key was published as a retired one').toEqual(['active']);
      }
    } finally {
      vars.forEach((v, i) => {
        if (previous[i] === undefined) delete process.env[v];
        else process.env[v] = previous[i];
      });
      resetSigningKeypairCache();
    }
  });
});

test.describe('credentials quoted from the source', () => {
  test('are removed from every field of a finding that quotes the source', () => {
    const google = 'AIzaSyD4k3yF0rT3stPurp0s3s0nlyXYZ12345';
    const aws = 'AKIAIOSFODNN7EXAMPLE';
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
    const source = [
      'REPORT zdemo.',
      "DATA lv_url TYPE string VALUE 'HTTPS://svc:s3cr3tpass@host.example/x?password=hunter2'.",
      `CALL TRANSACTION '${google}'.`,
      `CALL TRANSACTION '${aws}'.`,
      `CALL FUNCTION 'Z_REMOTE' DESTINATION '${jwt}'.`,
    ].join('\n');
    const report = buildAbapEvidence(source, 'zdemo.abap');
    const kinds = report.findings.map((f) => f.kind);
    // Not vacuous: the statements that quote the secrets did produce findings.
    expect(kinds).toEqual(expect.arrayContaining(['bdc', 'rfc-call', 'hardcoded-value']));
    const printed = JSON.stringify(report.findings);
    for (const secret of ['s3cr3tpass', 'hunter2', google.slice(6), google.slice(6).toUpperCase(), aws.slice(4), jwt.split('.')[1]]) {
      expect(printed, `a credential survived in a finding: ${secret.slice(0, 6)}…`).not.toContain(secret);
    }
  });
});

test.describe('the reading of typed data objects', () => {
  test('stays linear in the size of the source', () => {
    // Many short declarations of a dictionary-looking structure type, and a
    // component selection for every tenth of them: the shape that made the old
    // reading run one full-source scan per declaration (1.8 s here, measured,
    // against 0.35 s for the single pass, at about 390 kB — above the 256 KB the
    // analysis routes accept, so that the two are far enough apart to tell).
    const lines = ['REPORT zdemo.'];
    const N = 12000;
    for (let i = 0; i < N; i += 1) lines.push(`DATA a${i} TYPE zcc_row_type${i % 50}.`);
    for (let i = 0; i < N; i += 10) lines.push(`WRITE a${i}-f.`);
    const source = lines.join('\n');
    const started = Date.now();
    const report = readTableDependencies(source);
    const took = Date.now() - started;
    // Not vacuous: a selected structure is still read as the type reference it is.
    expect(report.dependencies.some((d) => d.table === 'ZCC_ROW_TYPE0' && d.access === 'reference')).toBe(true);
    expect(took, `reading ${Math.round(source.length / 1024)} kB of declarations took ${took} ms`).toBeLessThan(1000);
  });
});

test.describe('the verdicts read from a test run', () => {
  test('keep a failure a failure, whatever the case is called', () => {
    const tap = [
      'TAP version 13',
      'not ok 1 - TC-001: totals add up',
      // Node's reporter writes a `#` inside a name as `\#`.
      String.raw`not ok 2 - TC.002: rounding \# todo later`,
      'ok 3 - TC_003: first attempt',
      'not ok 4 - TC_003: second attempt',
      'ok 5 - TC_004: needs a tenant # SKIP no tenant',
    ].join('\n');
    const cases = [{ id: 'TC-001' }, { id: 'TC.002' }, { id: 'TC_003' }, { id: 'TC_004' }];
    const byId = Object.fromEntries(applyRunnerVerdicts(cases, parseTapOutput(tap), 1).map((c) => [c.id, c.status]));
    expect(byId).toEqual({ 'TC-001': 'Failed', 'TC.002': 'Failed', TC_003: 'Failed', TC_004: 'Skipped' });
  });
});

test.describe('the outbound host allowlist', () => {
  test('matches an entry at a label boundary only', async () => {
    const previous = process.env.S4_HOST_ALLOWLIST;
    const NOT_LISTED = 'Host is not in the configured allowlist.';
    try {
      for (const entry of ['s4hana.cloud', '.s4hana.cloud']) {
        process.env.S4_HOST_ALLOWLIST = entry;
        expect((await isUrlSafe('https://evil-s4hana.cloud/x')).reason, `${entry}: a look-alike host passed`).toBe(NOT_LISTED);
        expect((await isUrlSafe('https://nots4hana.cloud/x')).reason, `${entry}: a look-alike host passed`).toBe(NOT_LISTED);
        // The listed domain and its subdomains are past the allowlist (whatever
        // DNS then says about them).
        expect((await isUrlSafe('https://my.s4hana.cloud/x')).reason).not.toBe(NOT_LISTED);
        expect((await isUrlSafe('https://s4hana.cloud/x')).reason).not.toBe(NOT_LISTED);
      }
    } finally {
      if (previous === undefined) delete process.env.S4_HOST_ALLOWLIST;
      else process.env.S4_HOST_ALLOWLIST = previous;
    }
  });
});

/**
 * `.gitleaks.toml` exempts `.gitleaksignore` from the secret scan as a whole
 * path, for the reason written next to that entry. What keeps the exemption
 * safe is that the file holds only two kinds of line; this is where that is
 * checked, since the scanner no longer looks.
 */
test.describe('the secret-scan exception list', () => {
  test('holds exact fingerprints and prose, and nothing shaped like a value', () => {
    const lines = read('.gitleaksignore').split(/\r?\n/);
    const offenders: string[] = [];
    lines.forEach((line, i) => {
      const at = `.gitleaksignore:${i + 1}`;
      if (line.trim() === '') return;
      if (line.startsWith('#')) {
        // Prose may name a commit, a path or a variable, never carry a long
        // opaque token: 24+ key characters mixing letters and digits that are
        // not a plain hex commit id.
        for (const token of line.match(/[A-Za-z0-9_+=-]{24,}/g) ?? []) {
          const opaque = /[0-9]/.test(token) && /[A-Za-z]/.test(token) && !/^[0-9a-f]{7,40}$/.test(token);
          if (opaque) offenders.push(`${at}: a comment carries an opaque token`);
        }
        return;
      }
      // commit:path:rule:line — the exact form gitleaks writes, and no value in it.
      if (!/^[0-9a-f]{40}:[^:\s]+:[a-z0-9-]+:\d+$/.test(line)) offenders.push(`${at}: not a fingerprint or a comment`);
    });
    expect(offenders).toEqual([]);
    // Not vacuous: the file does hold fingerprints.
    expect(lines.filter((l) => /^[0-9a-f]{40}:/.test(l)).length).toBeGreaterThan(0);
  });
});
