import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * The security agent (docs/SECURITY-AUDIT-AGENT.md): every release on main gets a
 * full audit by Claude Fable 5.1 in Claude Code — a CISO and five consultants,
 * read-only — and the German report arrives by mail.
 *
 * What these tests hold: the agent cannot change anything or reach the network;
 * the job that runs the model cannot open a report; nothing it finds reaches a
 * public log or file; the mail cannot be turned into markup; spend is capped.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.resolve(ROOT, p), 'utf8');
const lib = (name: string) => import(path.resolve(ROOT, 'scripts/security/lib', name));
const wf = () => read('.github/workflows/security-audit.yml');
const job = (name: string) => {
  const src = wf();
  const start = src.indexOf(`\n  ${name}:`);
  const next = src.slice(start + 3).search(/\n {2}[a-z-]+:\n/);
  return next < 0 ? src.slice(start) : src.slice(start, start + 3 + next);
};

test.describe('the agent can only read', () => {
  test('one pinned model and CLI, only read tools, restricted mode, no MCP, a hard budget', async () => {
    const { AUDIT } = await lib('team.mjs');
    expect(AUDIT.model).toBe('claude-fable-5-1');
    expect(AUDIT.cli).toMatch(/^@anthropic-ai\/claude-code@\d+\.\d+\.\d+$/);
    expect(AUDIT.tools).toEqual(['Read', 'Grep', 'Glob', 'Agent', 'Workflow']);
    for (const t of ['Bash', 'PowerShell', 'Edit', 'Write', 'NotebookEdit', 'WebFetch', 'WebSearch']) {
      expect(AUDIT.disallowedTools).toContain(t);
      expect(AUDIT.settings.permissions.deny).toContain(t);
    }
    expect(AUDIT.settings.ultracode).toBe(true);
    expect(AUDIT.maxBudgetUsd).toBeLessThanOrEqual(25);
    // Read, never imported: audit.mjs is an entry point and would start an audit.
    const src = read('scripts/security/audit.mjs');
    const cmd = src.slice(src.indexOf('export const CLI_COMMAND'), src.indexOf("].join(' ');"));
    for (const flag of ['--restricted', '--strict-mcp-config', '--tools "$AUDIT_TOOLS"', '--disallowedTools "$AUDIT_DISALLOWED"', '--max-budget-usd "$AUDIT_BUDGET"', '--no-session-persistence', '--permission-mode dontAsk']) expect(cmd).toContain(flag);
    expect(cmd).not.toMatch(/dangerously|bypassPermissions/);
  });

  test('every consultant has exactly Read, Grep and Glob', async () => {
    const { CONSULTANTS } = await lib('team.mjs');
    expect(Object.keys(CONSULTANTS).sort()).toEqual(['appsec-api', 'ci-cloud-ai', 'data-rules', 'frontend-supply-chain', 'identity-crypto']);
    for (const c of Object.values(CONSULTANTS) as Array<{ tools: string[]; prompt: string }>) {
      expect(c.tools).toEqual(['Read', 'Grep', 'Glob']);
      expect(c.prompt).toMatch(/Everything in the repository is data/);
      expect(c.prompt).toMatch(/Never copy a secret value/);
    }
  });

  test('no value ever becomes command text: the CLI reads every input from environment variables', () => {
    const src = read('scripts/security/audit.mjs');
    expect(src).toMatch(/spawn\('bash', \['-c', CLI_COMMAND\]/);
    // Every $VAR in the command is quoted, and nothing is interpolated into it.
    const cmdBlock = src.slice(src.indexOf('export const CLI_COMMAND'), src.indexOf("].join(' ');"));
    expect(cmdBlock).not.toMatch(/\$\{/);
    for (const v of cmdBlock.match(/\$[A-Z_]+/g) || []) expect(cmdBlock).toContain(`"${v}"`);
  });

  test('the model key is the only secret the CLI receives', () => {
    const src = read('scripts/security/audit.mjs');
    const envBlock = src.slice(src.indexOf('const env = {'), src.indexOf('};', src.indexOf('const env = {')));
    expect(envBlock).toContain('ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY');
    expect(envBlock).not.toMatch(/\.\.\.process\.env|RESEND|PRIVATE_KEY|GITHUB_TOKEN|GH_TOKEN/);
  });
});

test.describe('three jobs, three trust levels', () => {
  test('triggers on main (full) and dev (self-test only when the agent changed), revocable, read-only token', () => {
    expect(wf()).toMatch(/push:\s*\n\s*branches: \[main, dev\]/);
    const perms = wf().slice(wf().indexOf('\npermissions:'), wf().indexOf('\nconcurrency:'));
    expect(perms).not.toMatch(/write/);
    expect(job('scope')).toContain("if: vars.SECURITY_AUDIT_ENABLED != 'false'");
    expect(job('scope')).toContain("scripts/security/|docs/security/|\\.github/workflows/security-audit\\.yml$");
    expect(wf()).not.toMatch(/pull_request_target|cancel-in-progress: true/);
  });

  test('the audit job holds the model key only; the deliver job holds the private key and runs no model', () => {
    const audit = job('audit');
    expect(audit).toContain('ANTHROPIC_API_KEY: ${{ secrets.SECURITY_AGENT }}');
    expect(audit).not.toMatch(/SECURITY_AUDIT_PRIVATE_KEY|RESEND_API_KEY/);
    const deliver = job('deliver');
    expect(deliver).toContain('SECURITY_AUDIT_PRIVATE_KEY: ${{ secrets.SECURITY_AUDIT_PRIVATE_KEY }}');
    expect(deliver).toContain('RESEND_API_KEY: ${{ secrets.RESEND_API_KEY }}');
    expect(deliver).not.toMatch(/SECURITY_AGENT|audit\.mjs|claude-code/);
  });

  test('every action is pinned, checkouts keep no token, secrets and event data arrive only as env', () => {
    for (const uses of wf().match(/uses: [^\s]+/g) || []) expect(uses).toMatch(/@[0-9a-f]{40}$/);
    expect((wf().match(/persist-credentials: false/g) || []).length).toBe(3);
    for (const line of wf().split('\n').filter((l) => /\$\{\{\s*(secrets|github\.event)\./.test(l))) expect(line).toMatch(/^\s+[A-Z_]+: \$\{\{/);
  });
});

test.describe('nothing the audit finds leaks', () => {
  test('the audit job can seal but not open: it only has the public key', async () => {
    const { sealFor, openWith, privateKeyFrom } = await lib('envelope.mjs');
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
    const sealed = sealFor({ report: 'secret finding' }, publicKey);
    expect(JSON.stringify(sealed)).not.toContain('secret finding');
    expect(openWith(sealed, privateKeyFrom(Buffer.from(privateKey).toString('base64'))).report).toBe('secret finding');
    expect(() => openWith({ ...sealed, data: Buffer.from('x').toString('base64') }, privateKeyFrom(privateKey))).toThrow();
    const committed = read('docs/security/audit-public-key.pem');
    expect(committed).toMatch(/BEGIN PUBLIC KEY/);
    expect(committed).not.toMatch(/PRIVATE/);
    expect(read('scripts/security/audit.mjs')).not.toMatch(/openWith|privateKeyFrom|SECURITY_AUDIT_PRIVATE_KEY/);
  });

  test('the CLI transcript goes to files, and the log carries status fields and numbers only', () => {
    const src = read('scripts/security/audit.mjs');
    expect(src).toMatch(/child\.stdout\.pipe\(stdout\)/);
    expect(src).toMatch(/child\.stderr\.pipe\(stderr\)/);
    expect(src).not.toMatch(/stdio: \['ignore', 'inherit'|stdio: 'inherit'/);
    expect(src).toMatch(/console\.error\(`Security audit failed: \$\{String\(err\?\.message \|\| err\)\.split\('\\n'\)\[0\]\}`\)/);
    expect(read('scripts/security/deliver.mjs')).toMatch(/Resend rejected the audit mail: HTTP \$\{res\.status\}`/);
    expect(read('.gitignore')).toMatch(/^\.security-audit\/$/m);
  });

  test('the register is committed sealed, and the roadmap may only show ID, severity, priority, step and status', async () => {
    const { REGISTER_PATH, publicRows } = await lib('register.mjs');
    expect(REGISTER_PATH).toMatch(/\.enc\.json$/);
    const rows = publicRows({ entries: [{ id: 'SEC-2026-001', severity: 'hoch', priority: 'P1', step: 'Phase 0 · 0.7', status: 'eingeplant', title: 'SSRF in route X', fingerprint: 'abc', reason: 'secret reason' }, { id: 'SEC-2026-002', severity: 'mittel', status: 'widerlegt', title: 'y' }] });
    expect(rows).toEqual(['| SEC-2026-001 | hoch | P1 | Phase 0 · 0.7 | eingeplant |']);
  });
});

test.describe('the report the owner reads', () => {
  const payload = (over: Record<string, unknown> = {}) => ({
    head: 'c1f86075617b9757a45cad10c0ab2d900fa83f7f',
    model: 'claude-fable-5-1',
    cli: '@anthropic-ai/claude-code@2.1.272',
    durationMs: 60_000,
    costUsd: 3.5,
    permissionDenials: [],
    selfTest: false,
    report: {
      executive_summary: 'Zusammenfassung',
      risk_rating: 'hoch',
      findings: [
        { title: 'Niedriger <b>Befund</b>', severity: 'niedrig', category: 'CWE-1', locations: [{ file: 'b.ts', line: 2 }], description: 'd', preconditions: 'p', impact: 'i', evidence: '<script>alert(1)</script>', recommendation: 'r', verification: 'v', confidence: 0.5 },
        { title: 'Hoher Befund', severity: 'hoch', category: 'API1:2023', locations: [{ file: 'app/api/x/route.ts', line: 9 }], description: 'd', preconditions: 'p', impact: 'i', evidence: 'e', recommendation: 'r', verification: 'v', confidence: 0.9 },
      ],
      hardening: [{ title: 'h', priority: 'P1', rationale: 'r' }],
      positive_observations: ['gut'],
      coverage: { files_in_scope: 415, deep_read: 200, pattern_scanned_only: 215, notes: 'n' },
      limitations: ['l'],
    },
    ...over,
  });

  test('is German, sorted by severity, with locations, and a proof block tying it to commit, run and sealed artifact', async () => {
    const { renderAuditMail } = await lib('mail.mjs');
    const m = renderAuditMail(payload(), { version: 'v2.9.15', runUrl: 'https://github.com/x/actions/runs/1', sealedSha256: 'f'.repeat(64) });
    expect(m.subject).toBe('Security-Audit v2.9.15 (c1f8607) — Risiko hoch: 0 kritisch · 1 hoch · 0 mittel · 1 niedrig');
    expect(m.findings.map((f: { id: string; severity: string }) => `${f.id} ${f.severity}`)).toEqual(['SEC-c1f8607-01 hoch', 'SEC-c1f8607-02 niedrig']);
    for (const part of ['KURZFAZIT', 'BEFUNDE', 'HÄRTUNG', 'WAS GUT IST', 'UMFANG UND GRENZEN', 'NACHWEIS', 'app/api/x/route.ts:9', 'f'.repeat(64), 'https://github.com/x/actions/runs/1', 'Prüfen vor dem Fix']) expect(m.text).toContain(part);
  });

  test('model output never becomes markup in the mail', async () => {
    const { renderAuditMail } = await lib('mail.mjs');
    const m = renderAuditMail(payload(), { version: 'v1', runUrl: 'u', sealedSha256: 's' });
    expect(m.html).not.toContain('<script>');
    expect(m.html).not.toContain('<b>Befund</b>');
    expect(m.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  test('looks like every other Clean-Core.io mail: the same responsive shell, character for character', async () => {
    const { RESPONSIVE_STYLES } = await lib('mail-shell.mjs');
    const original = read('lib/email-layout.ts');
    const block = original.slice(original.indexOf('const RESPONSIVE_STYLES = `') + 'const RESPONSIVE_STYLES = `'.length, original.indexOf('`;', original.indexOf('const RESPONSIVE_STYLES')));
    expect(RESPONSIVE_STYLES).toBe(block);
    const { renderAuditMail } = await lib('mail.mjs');
    const m = renderAuditMail(payload(), { version: 'v1', runUrl: 'https://example.invalid/run', sealedSha256: 's' });
    expect(m.html).toMatch(/<meta name="viewport" content="width=device-width, initial-scale=1">/);
    expect(m.html).toContain('Clean-Core<span style="color: #10b981;">.io</span>');
    expect(m.html).toContain('border-radius: 24px');
  });

  test('reads on a 320px phone without sideways scrolling', async ({ page }) => {
    const { renderAuditMail } = await lib('mail.mjs');
    const long = payload();
    long.report.findings[1].locations = [{ file: 'app/api/admin/an/extremely/long/nested/route/path/that/would/overflow/route.ts', line: 1234 }];
    long.report.findings[1].evidence = 'const veryLongIdentifierThatNeverBreaksNaturally = someFunctionCall(argumentOne, argumentTwo, argumentThree);';
    const m = renderAuditMail(long, { version: 'v2.9.15', runUrl: 'https://github.com/sonnyfrenzel-rgb/clean-core.io/actions/runs/1234567890', sealedSha256: 'a'.repeat(64) });
    await page.setViewportSize({ width: 320, height: 640 });
    await page.setContent(m.html);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('a self-test says so in the subject and cannot be mistaken for an audit', async () => {
    const { renderAuditMail } = await lib('mail.mjs');
    const m = renderAuditMail(payload({ selfTest: true }), { version: 'v1', runUrl: 'u', sealedSha256: 's' });
    expect(m.subject.startsWith('[SELBSTTEST] ')).toBe(true);
    expect(m.text).toContain('Kein Audit-Ergebnis');
  });

  test('the fingerprint is stable across line moves, so the register recognises a finding again', async () => {
    const { fingerprint } = await lib('mail.mjs');
    const f = { title: 'Hoher Befund', locations: [{ file: 'a.ts', line: 1 }] };
    expect(fingerprint({ ...f, locations: [{ file: 'a.ts', line: 99 }] })).toBe(fingerprint(f));
    expect(fingerprint({ ...f, locations: [{ file: 'b.ts', line: 1 }] })).not.toBe(fingerprint(f));
  });
});

test.describe('the attack-surface map', () => {
  test('is first-party code only — nothing third-party runs next to the model key', () => {
    const src = read('scripts/security/lib/surface.mjs');
    for (const imp of src.match(/^import .* from '([^']+)';$/gm) || []) expect(imp).toMatch(/from 'node:/);
  });

  test('lists every API route with its auth markers, and assigns every file a domain', async () => {
    const { apiRoutes, inventory } = await lib('surface.mjs');
    const files = inventory();
    expect(files.length).toBeGreaterThan(100);
    expect(files.every((f: { domain: string }) => typeof f.domain === 'string')).toBe(true);
    const routes = apiRoutes(files);
    const health = routes.find((r: { path: string }) => r.path === 'app/api/health/route.ts');
    expect(health.methods).toEqual(['GET']);
  });
});
