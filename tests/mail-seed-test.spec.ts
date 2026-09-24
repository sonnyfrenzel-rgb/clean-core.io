import { test, expect } from '@playwright/test';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  parseRecipientFile,
  planSeed,
  placementCsv,
  seedIdempotencyKey,
  renderSourceTemplate,
  SEED_MAIL_TYPES,
  type SeedRecipient,
} from '../scripts/lib/mail-seed';

/**
 * The deliverability seed test of roadmap 3.0.9 (`scripts/mail-seed-test.ts`).
 *
 * What has to hold, because it sends real mail from the production domain:
 * nothing goes out without `--send` *and* a confirmation naming the run; what
 * does go out is the production mail and not a lookalike; nothing is written
 * anywhere but the local scratch folder; and no seed address ever lands in
 * this public repository.
 *
 * The CLI is run as a child process in a temporary directory, with `fetch`
 * replaced by a trap that records every call — so "nothing was sent" is an
 * observation, and a regression cannot reach Resend even with a key present
 * (the key handed to the child is a dummy, and the cwd has no `.env.local`).
 */
const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const RECIPIENTS: SeedRecipient[] = [
  { label: 'gmail', address: 'seed-gmail@example.com' },
  { label: 'gmx', address: 'seed-gmx@example.com' },
];

/* ------------------------------------------------------------ the parser */

test.describe('the recipient file', () => {
  test('reads label and address per line, skipping comments and blank lines', () => {
    const text = '\uFEFF# seed mailboxes\r\ngmail   Seed-Gmail@Example.com  # main\r\n\r\n  gmx seed-gmx@example.com\n# end\n';
    expect(parseRecipientFile(text)).toEqual([
      { label: 'gmail', address: 'seed-gmail@example.com' },
      { label: 'gmx', address: 'seed-gmx@example.com' },
    ]);
  });

  test('refuses a malformed line with its line number and without echoing the address', () => {
    const cases: [string, RegExp][] = [
      ['gmail', /line 1: expected/],
      ['gmail a@example.com extra', /line 1: expected/],
      ['gmail a@example.com, b@example.com', /line 1: expected/],
      ['gm@il a@example.com', /line 1: label/],
      ['gmail not-an-address', /line 1: the second field/],
      ['# only a comment\n', /names nobody/],
      ['a x@example.com\na y@example.com', /line 2: label "a" is used twice/],
      ['a x@example.com\nb X@example.com', /line 2: the same address/],
    ];
    for (const [text, message] of cases) {
      let error = '';
      try { parseRecipientFile(text); } catch (e) { error = (e as Error).message; }
      expect(error, text).toMatch(message);
      expect(error, 'the error repeats an address').not.toMatch(/@example\.com/);
    }
  });
});

/* -------------------------------------------------------- the templates */

test.describe('every mail renders from its real template, with the prefix and nothing else changed', () => {
  const now = new Date('2026-09-24T10:00:00Z');
  const plan = planSeed(SEED_MAIL_TYPES, RECIPIENTS, 'spec-0001', now);

  test('one message per type and recipient, each subject prefixed and otherwise the production subject', () => {
    expect(plan).toHaveLength(SEED_MAIL_TYPES.length * RECIPIENTS.length);
    for (const t of SEED_MAIL_TYPES) {
      const bare = t.build({ runId: 'spec-0001', recipient: RECIPIENTS[0], now }).subject;
      for (const m of plan.filter((p) => p.type === t.type)) {
        expect(m.subject).toBe(`[Seed 3.0.9 ${t.type} spec-0001] ${bare}`);
        expect((m.payload.to as string[])).toEqual([RECIPIENTS.find((r) => r.label === m.label)!.address]);
        expect(String(m.payload.from)).toMatch(/<[a-z]+@clean-core\.io>$/);
        expect(m.html.length, `${t.type} rendered nothing`).toBeGreaterThan(500);
        expect(m.html, `${t.type} left a template hole open`).not.toContain('${');
        expect(m.html).toMatch(/^<!doctype html>/i);
      }
    }
  });

  test('the production differences are kept, not evened out', () => {
    const one = (type: string) => plan.find((m) => m.type === type && m.label === 'gmail')!;
    // RFC 8058 only on the bulk mail, pointing at the real unsubscribe route.
    expect(one('survey').payload.headers).toMatchObject({ 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' });
    expect(String((one('survey').payload.headers as Record<string, string>)['List-Unsubscribe'])).toMatch(/^<https:\/\/clean-core\.io\/api\/unsubscribe\?t=/);
    expect(one('welcome').payload.headers).toBeUndefined();
    // Text part where production sends one, none where it does not.
    expect(one('welcome').payload.text).toBeTruthy();
    for (const type of ['welcome-approval', 'tenant-pending', 'tenant-approval', 'tenant-revoke', 'tenant-request']) {
      expect(one(type).payload.text, `${type} grew a text part production does not send`).toBeUndefined();
    }
    // Senders exactly as the call sites write them.
    expect(one('survey').payload.from).toBe('Felix from Clean-Core.io <info@clean-core.io>');
    expect(one('admin-signup').payload.from).toBe('Clean-Core <system@clean-core.io>');
    expect(one('security-alert').payload.reply_to).toBeUndefined();
    // The two invitation routes take the default sender of lib/transactional-mail.ts.
    for (const t of SEED_MAIL_TYPES) {
      const from = String(one(t.type).payload.from);
      expect(read(t.source) + read('lib/transactional-mail.ts'), `${t.type}: ${t.source} no longer sends from ${from}`)
        .toContain(`'${from}'`);
    }
  });

  test('the welcome text part is built by the register route\'s own converter', () => {
    const w = plan.find((m) => m.type === 'welcome')!;
    // That copy lacks the German entities, so the imprint reads as production sends it.
    expect(String(w.payload.text)).toContain('Hellerstra e 9');
  });

  test('no link carries a token anybody signed', () => {
    let seen = 0;
    for (const m of plan) {
      const tokens = [...m.html.matchAll(/(?:survey\/|[?&](?:t|token|oobCode)=)([A-Za-z0-9_%.-]+)/g)].map((x) => decodeURIComponent(x[1]));
      for (const tok of tokens) {
        const b64 = tok.split('.')[0];
        const decoded = Buffer.from(b64, 'base64url').toString('utf8');
        expect(decoded, `${m.type}: a link token is not the seed's unsigned one`).toMatch(/^seed-3\.0\.9\./);
        seen++;
      }
    }
    // survey (4 options + unsubscribe), tenant-request (2), address-confirmation (1) per recipient
    expect(seen, 'the token scan found nothing to check').toBeGreaterThanOrEqual(3 * RECIPIENTS.length);
  });

  test('a template hole the reader does not know stops the render', () => {
    expect(() => renderSourceTemplate('const x = `a ${b} c`;', 'x', {})).toThrow(/no seed value for \$\{b\}/);
    expect(renderSourceTemplate('const x = `a ${b} \\` c`;', 'x', { b: 'B' })).toBe('a B ` c');
  });

  test('the idempotency key is stable per run, type and address, and never contains the address', () => {
    const k = seedIdempotencyKey('spec-0001', 'welcome', 'Seed-Gmail@example.com ');
    expect(k).toBe(seedIdempotencyKey('spec-0001', 'welcome', 'seed-gmail@example.com'));
    expect(k).not.toBe(seedIdempotencyKey('spec-0002', 'welcome', 'seed-gmail@example.com'));
    expect(k).not.toContain('example');
    expect(k.length).toBeLessThanOrEqual(256);
  });

  test('the placement sheet has the four columns and an empty verdict per type and provider', () => {
    const csv = placementCsv(SEED_MAIL_TYPES, RECIPIENTS).trim().split('\n');
    expect(csv[0]).toBe('typ,anbieter,ordner,notiz');
    expect(csv).toHaveLength(1 + SEED_MAIL_TYPES.length * RECIPIENTS.length);
    expect(csv[1]).toBe(`${SEED_MAIL_TYPES[0].type},gmail,,`);
  });

  test('every place the product posts to Resend is a type in the seed', () => {
    const covered = new Set(SEED_MAIL_TYPES.map((t) => t.source));
    // Not product mail: the sealed security-audit report the CI pipeline mails
    // to the operator, and this tool itself. lib/transactional-mail.ts is the
    // shared sender; its callers are what is covered.
    const notProduct = new Set(['scripts/security/deliver.mjs', 'scripts/mail-seed-test.ts', 'scripts/lib/mail-seed.ts', 'lib/transactional-mail.ts']);
    const files: string[] = [];
    const walk = (rel: string) => {
      for (const e of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
        const r = `${rel}/${e.name}`;
        if (e.isDirectory()) { if (e.name !== 'node_modules') walk(r); continue; }
        if (!/\.(ts|tsx|mjs)$/.test(e.name)) continue;
        const s = read(r);
        if (s.includes('api.resend.com/emails') || /sendTransactionalMail\(\{/.test(s)) files.push(r);
      }
    };
    ['app', 'lib', 'scripts'].forEach(walk);
    expect(files.length, 'the scan found no sender at all').toBeGreaterThan(5);
    const missing = files.filter((f) => !covered.has(f) && !notProduct.has(f));
    expect(missing, 'a mail the product sends is not in the seed test').toEqual([]);
  });

  test('the seed writes nothing: no Firestore, no send record, no signed token', () => {
    for (const rel of ['scripts/lib/mail-seed.ts', 'scripts/mail-seed-test.ts']) {
      const code = read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      for (const banned of ['firebase-admin', 'getAdminDb', 'recordEmailSent', 'recordEmailEvent', 'sendTransactionalMail', 'createUnsubscribeToken', 'createSurveyToken', 'createApprovalToken', 'claimSend', 'getFirestore']) {
        expect(code, `${rel} uses ${banned}`).not.toContain(banned);
      }
    }
  });
});

/* ----------------------------------------------------------- the CLI gate */

const TSX = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const CLI = path.join(ROOT, 'scripts', 'mail-seed-test.ts');

function runCli(args: string[], extraEnv: Record<string, string> = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mail-seed-'));
  fs.writeFileSync(path.join(dir, 'seeds.txt'), '# test\ngmail seed-gmail@example.com\n');
  const trapLog = path.join(dir, 'fetch-calls.jsonl');
  const trap = path.join(dir, 'trap.cjs');
  // Every fetch is recorded and answered locally — nothing leaves the machine.
  fs.writeFileSync(trap, `
    const fs = require('fs');
    globalThis.fetch = async (url, init) => {
      fs.appendFileSync(${JSON.stringify(trapLog)}, JSON.stringify({ url: String(url), headers: init && init.headers, body: init && init.body }) + '\\n');
      return new Response(JSON.stringify({ id: 'trap-' + Date.now() }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
  `);
  const env: NodeJS.ProcessEnv = { ...process.env, RESEND_API_KEY: 're_dummy_key_for_the_spec', NODE_OPTIONS: `--require ${JSON.stringify(trap)}`, ...extraEnv };
  delete env.CI;
  delete env.GITHUB_ACTIONS;
  delete env.MAIL_SEED_CONFIRM;
  delete env.NEXT_PUBLIC_APP_URL;
  if (extraEnv.CI) env.CI = extraEnv.CI;
  if (extraEnv.MAIL_SEED_CONFIRM) env.MAIL_SEED_CONFIRM = extraEnv.MAIL_SEED_CONFIRM;
  const r = spawnSync(process.execPath, [TSX, '--tsconfig', path.join(ROOT, 'tsconfig.json'), CLI, 'seeds.txt', ...args], {
    cwd: dir, env, encoding: 'utf8', timeout: 90_000,
  });
  const calls = fs.existsSync(trapLog) ? fs.readFileSync(trapLog, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  return { status: r.status, out: `${r.stdout}\n${r.stderr}`, calls, dir };
}

test.describe('the command line', () => {
  test.describe.configure({ timeout: 120_000 });

  test('without --send it renders, writes the sheet, and calls nobody', () => {
    const r = runCli(['--run-id', 'spec-dry', '--only', 'welcome,survey']);
    expect(r.status, r.out).toBe(0);
    expect(r.out).toContain('DRY RUN');
    expect(r.calls, 'a dry run called the network').toEqual([]);
    const out = path.join(r.dir, 'scratch', 'mail-seed-spec-dry');
    expect(fs.existsSync(path.join(out, 'welcome__gmail.html'))).toBe(true);
    expect(fs.readFileSync(path.join(out, 'placement.csv'), 'utf8')).toBe('typ,anbieter,ordner,notiz\nwelcome,gmail,,\nsurvey,gmail,,\n');
    expect(fs.existsSync(path.join(out, 'send-log.json'))).toBe(false);
    // The console names providers, never addresses.
    expect(r.out).not.toContain('seed-gmail@example.com');
  });

  test('--send without the confirmation stops before anything is sent', () => {
    for (const [args, env, message] of [
      [['--send', '--run-id', 'spec-send'], {}, /MAIL_SEED_CONFIRM=spec-send/],
      [['--send', '--run-id', 'spec-send'], { MAIL_SEED_CONFIRM: 'spec-other' }, /MAIL_SEED_CONFIRM=spec-send/],
      [['--send'], { MAIL_SEED_CONFIRM: 'spec-send' }, /explicit --run-id/],
    ] as [string[], Record<string, string>, RegExp][]) {
      const r = runCli(args, env);
      expect(r.status, r.out).toBe(1);
      expect(r.out).toMatch(message);
      expect(r.calls, `${args.join(' ')} reached the network`).toEqual([]);
    }
  });

  test('it refuses to run in CI at all — the Actions log is public', () => {
    const r = runCli(['--run-id', 'spec-ci'], { CI: 'true' });
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/never in CI/);
    expect(r.calls).toEqual([]);
  });

  test('with --send and the matching confirmation it posts the production payload, keyed and logged', () => {
    const r = runCli(['--send', '--run-id', 'spec-go', '--only', 'survey'], { MAIL_SEED_CONFIRM: 'spec-go' });
    expect(r.status, r.out).toBe(0);
    expect(r.calls).toHaveLength(1);
    const call = r.calls[0];
    expect(call.url).toBe('https://api.resend.com/emails');
    expect(call.headers['Idempotency-Key']).toMatch(/^seed-spec-go-survey-[0-9a-f]{24}$/);
    const body = JSON.parse(call.body);
    expect(body.subject).toMatch(/^\[Seed 3\.0\.9 survey spec-go\] /);
    expect(body.to).toEqual(['seed-gmail@example.com']);
    expect(body.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    const log = JSON.parse(fs.readFileSync(path.join(r.dir, 'scratch', 'mail-seed-spec-go', 'send-log.json'), 'utf8'));
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ type: 'survey', label: 'gmail', status: 'sent' });
    expect(log[0].messageId).toMatch(/^trap-/);
    expect(JSON.stringify(log), 'the send log holds an address').not.toContain('@');
  });
});

/* ------------------------------------------------- no address in the repo */

test('no seed address is written into the repository — only example domains', () => {
  // A seed file line: `<label> <address>`. Anything shaped like that in scripts/,
  // tests/ or the runbook must use an example domain; the real list lives in
  // scratch/ (gitignored) or outside the repository.
  const SEED_LINE = /^\s*[#*>-]?\s*[A-Za-z0-9][A-Za-z0-9._-]{0,39}\s+([^\s@<>"'`,;()]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,}))\s*(#.*)?$/;
  const ALLOWED = /(^|\.)example(\.(com|org|net))?$|^clean-core\.io$/i;
  const offenders: string[] = [];
  const scan = (rel: string) => {
    const abs = path.join(ROOT, rel);
    if (fs.statSync(abs).isDirectory()) {
      for (const e of fs.readdirSync(abs)) if (e !== 'node_modules') scan(`${rel}/${e}`);
      return;
    }
    if (!/\.(ts|tsx|mjs|js|md|txt|sh|ps1)$/.test(rel)) return;
    fs.readFileSync(abs, 'utf8').split('\n').forEach((line, i) => {
      const m = line.match(SEED_LINE);
      if (m && !ALLOWED.test(m[2])) offenders.push(`${rel}:${i + 1}`);
    });
  };
  ['scripts', 'tests', 'docs/MAIL-SEED-TEST.md'].forEach(scan);
  expect(offenders, 'a line shaped like a seed-file entry names a real mailbox').toEqual([]);

  // And the two seed sources hold no address outside example.com / clean-core.io at all.
  for (const rel of ['scripts/lib/mail-seed.ts', 'scripts/mail-seed-test.ts', 'tests/mail-seed-test.spec.ts', 'docs/MAIL-SEED-TEST.md']) {
    for (const hit of read(rel).match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? []) {
      expect(hit, `${rel} names an address`).toMatch(/@(example\.com|clean-core\.io)$/i);
    }
  }
  // The place the real list is meant to live is not tracked.
  expect(read('.gitignore')).toMatch(/^scratch\/$/m);
});
