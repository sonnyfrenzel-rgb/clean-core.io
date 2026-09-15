import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { LIVE_TEST_EXECUTION } from '../lib/locked-paths';

/**
 * Roadmap step 0.1 (`G0:R0`): live test execution against a connected tenant is
 * a locked path — named, with its reason and the conditions that reopen it.
 *
 * Acceptance (docs/roadmap/SCHNITT-0-UMFANG.md §1): "Die Grenze steht in
 * SECURITY.md" and "Kein View, kein Text und kein Export stellt den gesperrten
 * Pfad als verfügbar dar."
 *
 * Reopening the path means changing this spec — on purpose.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.resolve(ROOT, p), 'utf8');

test.describe('the lock is named', () => {
  test('it is locked, with a boundary, a reason and all four reopening conditions', () => {
    expect(LIVE_TEST_EXECUTION.locked).toBe(true);
    expect(LIVE_TEST_EXECUTION.id).toBe('G0:R0');
    expect(LIVE_TEST_EXECUTION.reopenWhen).toHaveLength(4);
    expect(LIVE_TEST_EXECUTION.reason).toMatch(/not an isolation boundary/);
  });

  test('SECURITY.md §7.1 says exactly what the definition says', () => {
    const doc = read('SECURITY.md');
    const section = doc.slice(doc.indexOf('### 7.1 Locked path: live test execution'), doc.indexOf('\n## 8.'));
    expect(section.length).toBeGreaterThan(500);
    for (const text of [LIVE_TEST_EXECUTION.boundary.closed, LIVE_TEST_EXECUTION.boundary.open, LIVE_TEST_EXECUTION.reason, LIVE_TEST_EXECUTION.userNotice, ...LIVE_TEST_EXECUTION.reopenWhen]) {
      expect(section, text.slice(0, 60)).toContain(text);
    }
    // The executive summary no longer describes the path as merely conditional.
    expect(doc).not.toContain('Live runner egress stays disabled unless enforced at the infrastructure level');
    expect(doc).toMatch(/\*\*Live test execution against a connected S\/4HANA tenant is locked\*\*/);
  });
});

test.describe('the lock holds in code', () => {
  test('the route refuses a live run before it measures anything', () => {
    const src = read('app/api/run-tests/route.ts');
    const lock = src.indexOf('LIVE_TEST_EXECUTION.locked');
    const probe = src.indexOf('await liveRunnerPermitted()');
    expect(lock).toBeGreaterThan(0);
    expect(probe).toBeGreaterThan(lock);
    expect(src).toMatch(/reason: LIVE_TEST_EXECUTION\.userNotice/);
    // The refusal is a 403 — and credentials are loaded only after it.
    const refusal = src.indexOf('{ status: 403 }', lock);
    expect(refusal).toBeGreaterThan(probe);
    expect(src.indexOf('loadS4ConfigForUser(', lock)).toBeGreaterThan(refusal);
  });

  test('the test hook does not send a locked run and does not ask a model to explain a decision', () => {
    const src = read('hooks/useTestExecution.ts');
    const guard = src.indexOf("project?.s4Environment === 'live' && LIVE_TEST_EXECUTION.locked");
    expect(guard).toBeGreaterThan(0);
    expect(src.indexOf('await executeWithHealing(payload)')).toBeGreaterThan(guard);
    const branch = src.slice(guard, src.indexOf('return null;', guard));
    expect(branch).not.toMatch(/explainTestFailure|fetch\(/);
  });

  test('the testing page shows the lock and does not offer the run', () => {
    const src = read('app/(app)/project/[projectId]/testing/page.tsx');
    expect((src.match(/data-live-test-lock/g) || []).length).toBeGreaterThanOrEqual(3);
    expect(src).toContain('{LIVE_TEST_EXECUTION.userNotice}');
    expect(src).toMatch(/disabled=\{[^}]*activeEnvTab === 'live' && !isAbapCloud && LIVE_TEST_EXECUTION\.locked/);
    expect(src).not.toContain('>Admin-Gated</span>');
  });
});

test.describe('no text offers the locked path', () => {
  /** Everything a user or a mail recipient reads about testing against a tenant. */
  const SURFACES = [
    'app/page.tsx',
    'app/(app)/project/[projectId]/testing/page.tsx',
    'app/(app)/settings/page.tsx',
    'app/(app)/tenant-security/page.tsx',
    'app/(app)/knowledge/page.tsx',
    'app/(app)/how-to/page.tsx',
    'app/whitepaper/page.tsx',
    'app/api/send-tenant-approval-email/route.ts',
    'components/HowToClient.tsx',
    'hooks/useTestExecution.ts',
    'lib/chatbot-knowledge.ts',
    'lib/clean-core-capabilities.ts',
    'public/linkedin-whitepaper-template.html',
    'README.md',
  ];

  /** The claims that were there on 15.09.2026, each one presenting the path as available. */
  const CLAIMS = [
    /live test cases/i,
    /execute live tests/i,
    /live (?:S\/4HANA )?(?:tenant )?testing\b/i,
    /live OData tests?\b/i,
    /metadata reads? and test execution/i,
    /and test executions/i,
    /E2E unit tests on live/i,
    /test transformations directly against/i,
    /simulations against (?:live )?(?:connected )?S\/4HANA/i,
    /Connect a (?:Live )?Tenant for (?:a )?real/i,
    /run against your live tenant/i,
    /generated tests can run against a real OData/i,
    /executed in an isolated sandbox with per-case results/i,
    /badge: "Validated"/,
    // Security claims found in the same panels: credentials are encrypted on the server, not in the browser.
    /encrypted (?:locally )?in(?:-| the )browser/i,
    /Browser-side Encryption/,
  ];

  for (const file of SURFACES) {
    test(`${file}`, () => {
      const text = read(file);
      for (const claim of CLAIMS) expect(text, `${file} still says ${claim}`).not.toMatch(claim);
      // Any sentence about running or executing tests against a tenant has to say it is locked.
      for (const sentence of text.split(/(?<=[.!?])\s+|\n/)) {
        if (/\b(?:run|runs|running|execut\w*)\b[^.]{0,60}\btests?\b[^.]{0,50}\bagainst\b[^.]{0,40}\btenant/i.test(sentence)) {
          expect(sentence, `${file}: "${sentence.trim().slice(0, 120)}"`).toMatch(/locked/i);
        }
      }
    });
  }
});
