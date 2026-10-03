import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  buildReportOnlyPolicy,
  emulatorRelaxationAllowed,
  isNonceRoute,
  CSP_REPORT_PATH,
} from '../lib/csp-report-only';
import {
  InstanceRateLimiter,
  ViolationAggregator,
  normalizeBlocked,
  normalizeDocumentPath,
  parseCspReports,
} from '../lib/csp-report';
import { seedStageProject, signInThroughForm } from './helpers/seed-project';
import { pageSettled } from './helpers/design-rendered';

/**
 * Stage 1 of the CSP rebuild (ADR-065): the strict policy is shipped as
 * Content-Security-Policy-Report-Only next to the unchanged enforced policy.
 *
 * Source guards hold the shape of both policies and the nonce plumbing; the
 * rendered half reads real responses from a production build and listens for
 * `securitypolicyviolation` events, because a policy string that looks right
 * says nothing about whether Next.js actually put the nonce on its scripts.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');

const directive = (policy: string, name: string) =>
  policy.split(';').map((d) => d.trim()).find((d) => d.split(/\s+/)[0] === name) ?? '';

test.describe('CSP report-only — source', () => {
  test('the enforced policy and its sign-in warning are unchanged', () => {
    const src = read('middleware.ts');
    // Verbatim. A change here is a change to what browsers enforce today and
    // belongs to the enforcement step, not to the report-only trial.
    for (const line of [
      "`default-src 'self'`,",
      "`script-src 'self' 'unsafe-inline' https://cleancore-491216.firebaseapp.com https://apis.google.com`,",
      "`style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,",
      "`img-src 'self' data: https: blob:`,",
      "`font-src 'self' data: https://fonts.gstatic.com`,",
      "`connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://identitytoolkit.googleapis.com https://firestore.googleapis.com https://generativelanguage.googleapis.com https://securetoken.googleapis.com https://accounts.google.com wss://*.firebaseio.com${emulatorConnectSrc}`,",
      "`frame-src 'self' https://cleancore-491216.firebaseapp.com https://accounts.google.com`,",
      "`frame-ancestors 'none'`,",
      "`base-uri 'self'`,",
      "`form-action 'self'`,",
      "`object-src 'none'`,",
      "...(useEmulator ? [] : [`upgrade-insecure-requests`]),",
      "const emulatorConnectSrc = useEmulator ? ' http://127.0.0.1:* http://localhost:*' : '';",
      "response.headers.set('Content-Security-Policy', csp);",
      'DO NOT tighten script-src or frame-src without testing Google login!',
    ]) {
      expect(src, `middleware.ts lost: ${line}`).toContain(line);
    }
  });

  test('the report-only script-src has a nonce and strict-dynamic and no unsafe-inline', () => {
    const policy = buildReportOnlyPolicy({ nonce: 'TESTNONCE123', nodeEnv: 'production', useEmulatorFlag: undefined });
    const scriptSrc = directive(policy, 'script-src');
    expect(scriptSrc).toContain("'nonce-TESTNONCE123'");
    expect(scriptSrc).toContain("'strict-dynamic'");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
    // The Google sign-in hosts the middleware comment explains, kept.
    expect(scriptSrc).toContain('https://cleancore-491216.firebaseapp.com');
    expect(scriptSrc).toContain('https://apis.google.com');
    expect(directive(policy, 'frame-src')).toContain('https://cleancore-491216.firebaseapp.com');
    expect(directive(policy, 'frame-src')).toContain('https://accounts.google.com');
    expect(directive(policy, 'connect-src')).toContain('https://accounts.google.com');
    // Named hosts instead of the Realtime Database wildcard.
    expect(directive(policy, 'connect-src')).not.toContain('firebaseio.com');
    expect(directive(policy, 'connect-src')).not.toContain('*');
    for (const host of ['identitytoolkit', 'securetoken', 'firestore']) {
      expect(directive(policy, 'connect-src')).toContain(`https://${host}.googleapis.com`);
    }
    expect(directive(policy, 'object-src')).toBe("object-src 'none'");
    expect(directive(policy, 'frame-ancestors')).toBe("frame-ancestors 'none'");
    expect(directive(policy, 'report-uri')).toBe(`report-uri ${CSP_REPORT_PATH}`);
    expect(directive(policy, 'report-to')).toBe('report-to csp-endpoint');
  });

  test('a static page gets no nonce, and every other directive is the strict one', () => {
    const withNonce = buildReportOnlyPolicy({ nonce: 'N', nodeEnv: 'production', useEmulatorFlag: undefined });
    const without = buildReportOnlyPolicy({ nodeEnv: 'production', useEmulatorFlag: undefined });
    expect(without).not.toContain('nonce-');
    expect(without).not.toContain("'strict-dynamic'");
    const strip = (p: string) => p.split('; ').filter((d) => !d.startsWith('script-src ')).join('; ');
    expect(strip(without)).toBe(strip(withNonce));
  });

  test('emulator hosts are allowed only outside production (SEC-2026-645, -580)', () => {
    expect(emulatorRelaxationAllowed('production', 'true')).toBe(false);
    expect(emulatorRelaxationAllowed('development', 'true')).toBe(true);
    expect(emulatorRelaxationAllowed('test', 'true')).toBe(true);
    expect(emulatorRelaxationAllowed('development', undefined)).toBe(false);
    expect(emulatorRelaxationAllowed('development', 'false')).toBe(false);

    const prod = buildReportOnlyPolicy({ nonce: 'N', nodeEnv: 'production', useEmulatorFlag: 'true' });
    expect(prod).not.toMatch(/127\.0\.0\.1|localhost/);
    const local = buildReportOnlyPolicy({ nonce: 'N', nodeEnv: 'test', useEmulatorFlag: 'true' });
    expect(directive(local, 'connect-src')).toContain('http://127.0.0.1:9099');
    expect(directive(local, 'connect-src')).not.toContain(':*');

    // The middleware hands the real environment to the builder.
    const src = read('middleware.ts');
    expect(src).toContain('nodeEnv: process.env.NODE_ENV');
    expect(src).toContain('useEmulatorFlag: process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR');
  });

  test('the middleware sends the report-only header and drops incoming CSP request headers', () => {
    const src = read('middleware.ts');
    expect(src).toContain("response.headers.set('Content-Security-Policy-Report-Only', reportOnlyCsp);");
    expect(src).toContain("response.headers.set('Reporting-Endpoints'");
    // A client cannot choose the nonce Next renders, and a static page never gets one.
    expect(src).toContain("requestHeaders.delete('content-security-policy');");
    expect(src).toContain("requestHeaders.delete('content-security-policy-report-only');");
    expect(src).toContain("requestHeaders.delete('x-nonce');");
    // Stage 1a: no nonce yet — the enforced header set here would hide it from
    // Next (ADR-065), so a nonce policy would only report Next's own scripts.
    expect(src).not.toContain('createNonce(');
    expect(src).toContain('NextResponse.next({ request: { headers: requestHeaders } })');
    // /api stays outside the matcher, so the report endpoint is never behind it.
    expect(src).toContain("source: '/((?!api|_next/static|_next/image|favicon.ico|icon.svg|screenshots|og-image).*)'");
  });

  test('the nonce goes to exactly the pages rendered per request', () => {
    // Every page.tsx, as the URL it serves. A nonce on a cached page would be
    // shared by every visitor; a per-request page without one loses the trial.
    const pages: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
          if (rel !== 'app/api') walk(rel);
        } else if (entry.name === 'page.tsx') {
          pages.push(rel);
        }
      }
    };
    walk('app');
    expect(pages.length).toBeGreaterThan(40);

    // Next's rules, as the build applies them (route table of 03.10.2026):
    // a page is rendered per request when it has a dynamic segment and no
    // generateStaticParams, reads `searchParams`, or is a server component that
    // declares force-dynamic or reads headers()/cookies(). In a 'use client'
    // page the force-dynamic export does nothing — /dashboard is static.
    const perRequest = (rel: string, src: string) => {
      if (/\bgenerateStaticParams\b/.test(src)) return false;
      if (/\[[^\]]+\]/.test(rel)) return true;
      // The page prop, not the client hook useSearchParams().
      if (/\bsearchParams\s*:\s*Promise</.test(src)) return true;
      const client = /^\s*['"]use client['"]/.test(src);
      return !client && (/export const dynamic = 'force-dynamic'/.test(src) || /\b(?:headers|cookies)\(\)/.test(src));
    };

    const drift: string[] = [];
    const nonced: string[] = [];
    for (const rel of pages) {
      const url = rel
        .replace(/^app/, '')
        .replace(/\/page\.tsx$/, '')
        .replace(/\/\([^)]+\)/g, '')
        .replace(/\[([^\]]+)\]/g, 'sample-$1') || '/';
      const dynamic = perRequest(rel, read(rel));
      if (isNonceRoute(url)) nonced.push(url);
      if (isNonceRoute(url) !== dynamic) {
        drift.push(`${rel} (${url}): per-request=${dynamic}, nonce=${isNonceRoute(url)}`);
      }
    }
    expect(drift, drift.join('\n')).toEqual([]);
    // The landing and the dashboard are static; a project stage is not.
    expect(isNonceRoute('/')).toBe(false);
    expect(isNonceRoute('/dashboard')).toBe(false);
    expect(isNonceRoute('/project/abc/analyze')).toBe(true);
    expect(nonced.length).toBe(13);
  });

  test('every inline <script in app/ and components/ carries a nonce or is JSON-LD through the helper', () => {
    // The one exception, with its reason: an API route's own HTML. `/api` is
    // outside the middleware and answered under next.config's API policy, not
    // the page policies this stage is about.
    const OUTSIDE_PAGE_POLICY = new Set(['app/api/auth/jira/callback/route.ts']);
    const offenders: string[] = [];
    let jsonLdBlocks = 0;
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(rel);
        else if (/\.(tsx|ts|jsx|js)$/.test(entry.name) && !OUTSIDE_PAGE_POLICY.has(rel)) {
          const src = read(rel);
          for (const m of src.matchAll(/<script\b[^>]*?(?:\/>|>)/g)) {
            const tag = m[0];
            const after = src.slice(m.index!, m.index! + 400);
            const jsonLd = /type="application\/ld\+json"/.test(tag) && /__html:\s*jsonLdHtml\(/.test(after);
            if (jsonLd) jsonLdBlocks += 1;
            if (!jsonLd && !/\bnonce=/.test(tag)) {
              offenders.push(`${rel}: ${tag.replace(/\s+/g, ' ').slice(0, 100)}`);
            }
          }
        }
      }
    };
    walk('app');
    walk('components');
    expect(offenders, offenders.join('\n')).toEqual([]);
    // Not vacuous: the JSON-LD blocks of the public pages were all seen.
    expect(jsonLdBlocks).toBeGreaterThanOrEqual(13);
  });

  test('the report endpoint bounds its input and stores nothing', () => {
    const src = read('app/api/csp-report/route.ts');
    expect(src).toContain('readBoundedBody(req, BODY_LIMITS)');
    expect(src).toContain('maxBytes: 16 * 1024');
    expect(src).toContain('limiter.allow(getClientIp(req))');
    expect(src).toContain('status: 204');
    // Logs only, by design.
    expect(src).not.toMatch(/firebase-admin|getAdminDb|assertRateLimit|resend|sendMail/i);
  });

  test('a report is reduced to directive, origin and path', () => {
    expect(normalizeBlocked('https://evil.example/x.js?token=abc')).toBe('https://evil.example');
    expect(normalizeBlocked('inline')).toBe('inline');
    expect(normalizeBlocked('eval')).toBe('eval');
    expect(normalizeBlocked('data:text/javascript,alert(1)')).toBe('data');
    expect(normalizeBlocked('')).toBe('none');
    expect(normalizeDocumentPath('https://clean-core.io/auth/action?mode=resetPassword&oobCode=SECRET')).toBe('/auth/action');
    expect(normalizeDocumentPath('https://clean-core.io/project/abc123/analyze#x')).toBe('/project/[projectId]/analyze');
    expect(normalizeDocumentPath('https://clean-core.io/survey/tok-123')).toBe('/survey/[token]');

    const legacy = parseCspReports({
      'csp-report': {
        'document-uri': 'https://clean-core.io/dashboard?x=1',
        'effective-directive': 'script-src-elem',
        'blocked-uri': 'https://cdn.example/a.js?k=1',
        'script-sample': 'alert(document.cookie)',
        disposition: 'report',
      },
    });
    expect(legacy).toEqual([{ directive: 'script-src-elem', blocked: 'https://cdn.example', path: '/dashboard', disposition: 'report' }]);

    const modern = parseCspReports([
      { type: 'csp-violation', body: { documentURL: 'https://clean-core.io/', effectiveDirective: 'connect-src', blockedURL: 'wss://x.firebaseio.com/.ws?ns=1', disposition: 'report' } },
      { type: 'deprecation', body: { id: 'x' } },
    ]);
    expect(modern).toEqual([{ directive: 'connect-src', blocked: 'wss://x.firebaseio.com', path: '/', disposition: 'report' }]);
    expect(parseCspReports('nope')).toEqual([]);
    expect(parseCspReports(Array.from({ length: 50 }, () => ({ type: 'csp-violation', body: {} })))).toHaveLength(20);
  });

  test('the limiter and the aggregator bound what one sender can cause', () => {
    const limiter = new InstanceRateLimiter(3, 1000, 2);
    expect([1, 2, 3, 4].map(() => limiter.allow('a', 0))).toEqual([true, true, true, false]);
    expect(limiter.allow('a', 1000)).toBe(true);

    const agg = new ViolationAggregator(1000);
    const v = { directive: 'script-src-elem', blocked: 'inline', path: '/', disposition: 'report' };
    expect(agg.record(v, 0)).toBe(1);
    expect(agg.record(v, 10)).toBe(0);
    expect(agg.record(v, 20)).toBe(0);
    expect(agg.record(v, 1500)).toBe(3);
  });
});


// ── Rendered: a production build (`NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true` set
// for the build, then `next start`). Under `next dev` the middleware sends no
// CSP, and these tests skip themselves.

type Violation = { directive: string; blocked: string; disposition: string; sample: string; source: string };

async function watchViolations(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __cspViolations: unknown[] };
    w.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      w.__cspViolations.push({
        directive: e.effectiveDirective,
        blocked: e.blockedURI,
        disposition: e.disposition,
        sample: e.sample,
        source: e.sourceFile,
      });
    });
  });
}

/** Report-only script violations seen by the current document. */
async function scriptViolations(page: Page): Promise<Violation[]> {
  // Let late chunks and the auth iframe load before reading. Not 'networkidle':
  // Firestore long polling keeps the network busy for as long as the page is open.
  await page.waitForLoadState('load');
  await page.waitForFunction(pageSettled, 750, { polling: 150, timeout: 60_000 }).catch(() => undefined);
  const all = await page.evaluate(() => (window as unknown as { __cspViolations: Violation[] }).__cspViolations);
  return all.filter((v) => v.disposition === 'report' && v.directive.startsWith('script-src'));
}

function nonceOf(policy: string | undefined): string | undefined {
  return policy?.match(/'nonce-([^']+)'/)?.[1];
}

/** A per-request page (`ƒ` in the build's route table); the shell renders without a session. */
const PER_REQUEST_PAGE = '/project/csp-probe/analyze';

test.describe('CSP report-only — rendered', () => {
  test('the landing sends the static report-only policy and reports no script violation', async ({ page, request }) => {
    const a = await request.get('/');
    test.skip(!a.headers()['content-security-policy'], 'no CSP: a dev server (middleware skips CSP in development)');
    const reportOnly = a.headers()['content-security-policy-report-only'];
    expect(reportOnly, 'no report-only header on the landing').toBeTruthy();
    // Static page: shared HTML, so no nonce (ADR-065).
    expect(nonceOf(reportOnly)).toBeUndefined();
    expect(await a.text()).not.toMatch(/<script[^>]*\snonce=/);
    expect(a.headers()['reporting-endpoints']).toBe(`csp-endpoint="${CSP_REPORT_PATH}"`);

    await watchViolations(page);
    await page.goto('/');
    expect(await scriptViolations(page)).toEqual([]);
  });

  test('no page carries a nonce yet, whatever the request says (stage 1a)', async ({ request }) => {
    for (const url of ['/dashboard', PER_REQUEST_PAGE]) {
      const res = await request.get(url, {
        headers: { 'content-security-policy-report-only': "script-src 'nonce-FORGED'", 'content-security-policy': "script-src 'nonce-FORGED'", 'x-nonce': 'FORGED' },
      });
      test.skip(!res.headers()['content-security-policy'], 'no CSP: a dev server');
      expect(res.headers()['content-security-policy-report-only'], `${url}: no report-only header`).toBeTruthy();
      expect(nonceOf(res.headers()['content-security-policy-report-only'])).toBeUndefined();
      const html = await res.text();
      expect(html, `${url}: a client-sent nonce reached the page`).not.toContain('FORGED');
      expect(html).not.toMatch(/<script[^>]*\snonce=/);
    }
  });

  test('the report endpoint answers 204 to both formats and refuses an oversized body', async ({ request }) => {
    const legacy = await request.post(CSP_REPORT_PATH, {
      headers: { 'content-type': 'application/csp-report' },
      data: JSON.stringify({ 'csp-report': { 'document-uri': 'http://localhost/x?t=1', 'effective-directive': 'script-src-elem', 'blocked-uri': 'inline' } }),
    });
    expect(legacy.status()).toBe(204);
    const modern = await request.post(CSP_REPORT_PATH, {
      headers: { 'content-type': 'application/reports+json' },
      data: JSON.stringify([{ type: 'csp-violation', body: { documentURL: 'http://localhost/', effectiveDirective: 'connect-src', blockedURL: 'https://x.example/a' } }]),
    });
    expect(modern.status()).toBe(204);
    const big = await request.post(CSP_REPORT_PATH, {
      headers: { 'content-type': 'application/csp-report' },
      data: JSON.stringify({ 'csp-report': { pad: 'x'.repeat(20 * 1024) } }),
    });
    expect(big.status()).toBe(413);
  });

  test.describe('signed in', () => {
    let EMAIL = '';
    let PASSWORD = '';
    let PROJECT_ID = '';

    test.beforeAll(async () => {
      const seeded = await seedStageProject({ prefix: 'cspro', acceptTerms: true });
      EMAIL = seeded.email;
      PASSWORD = seeded.password;
      PROJECT_ID = seeded.projectId;
    });

    test('the dashboard and a project stage report no script-src violation', async ({ page }) => {
      test.setTimeout(180_000);
      const probe = await page.request.get('/dashboard');
      test.skip(!probe.headers()['content-security-policy'], 'no CSP: a dev server');

      await watchViolations(page);
      await signInThroughForm(page, { email: EMAIL, password: PASSWORD });

      // The dashboard is a static page (ADR-065): report-only policy, no nonce.
      const dash = await page.goto('/dashboard');
      expect(dash!.headers()['content-security-policy-report-only']).toBeTruthy();
      expect(nonceOf(dash!.headers()['content-security-policy-report-only'])).toBeUndefined();
      await page.waitForSelector('main', { timeout: 30_000 });
      expect(await scriptViolations(page), 'script-src violations on /dashboard').toEqual([]);

      // A project stage, loaded as a document.
      const stage = await page.goto(`/project/${PROJECT_ID}/analyze`);
      expect(stage!.headers()['content-security-policy-report-only']).toBeTruthy();
      await page.waitForSelector('[data-stage-title]', { timeout: 30_000 });
      expect(await scriptViolations(page), 'script-src violations on the analyze stage').toEqual([]);
    });
  });
});
