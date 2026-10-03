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
import { NextRequest } from 'next/server';
import { getPathMatch } from 'next/dist/shared/lib/router/utils/path-match';
import { middleware } from '../middleware';

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
    // report-uri only: a browser that knows report-to would ignore it (see CSP_REPORT_PATH).
    expect(directive(policy, 'report-to')).toBe('');
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

  test('the middleware sends the report-only header and owns the nonce request headers', () => {
    const src = read('middleware.ts');
    expect(src).toContain("response.headers.set('Content-Security-Policy-Report-Only', reportOnlyCsp);");
    expect(src).not.toContain('Reporting-Endpoints');
    // A client cannot choose the nonce Next renders, and a static page never gets one.
    expect(src).toContain("requestHeaders.delete('content-security-policy');");
    expect(src).toContain("requestHeaders.delete('content-security-policy-report-only');");
    expect(src).toContain("requestHeaders.delete('x-nonce');");
    expect(src).toMatch(/if \(nonce\) \{\s*requestHeaders\.set\('x-nonce', nonce\);\s*requestHeaders\.set\('content-security-policy-report-only', reportOnlyCsp\);/);
    expect(src).toContain('NextResponse.next({ request: { headers: requestHeaders } })');
    // On a nonce route the enforced policy comes from next.config.mjs (ADR-065).
    expect(src).toContain("if (!nonce) response.headers.set('Content-Security-Policy', csp);");
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

  test('every page gets the same enforced policy, whoever delivers it', async () => {
    // next.config.mjs delivers the enforced policy on the nonce routes, so Next
    // does not read it as the request's CSP. It must be the middleware's string,
    // in every build flavour, and it must cover exactly the nonce routes.
    const config = (await import('../next.config.mjs')) as unknown as {
      NONCE_ROUTE_SOURCES: string[];
      nonceRouteCspHeaders: (env: Record<string, string | undefined>) => { source: string; headers: { key: string; value: string }[] }[];
    };
    const saved = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR;
    try {
      for (const flag of ['true', undefined]) {
        if (flag === undefined) delete process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR;
        else process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR = flag;
        const fromMiddleware = middleware(new NextRequest('http://localhost/')).headers.get('content-security-policy');
        expect(fromMiddleware, 'the middleware set no enforced policy on the landing').toBeTruthy();
        const entries = config.nonceRouteCspHeaders({ NODE_ENV: 'production', NEXT_PUBLIC_USE_FIREBASE_EMULATOR: flag });
        expect(entries.map((e) => e.source)).toEqual(config.NONCE_ROUTE_SOURCES);
        for (const e of entries) {
          expect(e.headers).toEqual([{ key: 'Content-Security-Policy', value: fromMiddleware }]);
        }
        // A nonce route: the middleware leaves the enforced header to the config…
        const onNonceRoute = middleware(new NextRequest('http://localhost/project/p1/analyze'));
        expect(onNonceRoute.headers.get('content-security-policy')).toBeNull();
        expect(onNonceRoute.headers.get('content-security-policy-report-only')).toContain("'strict-dynamic'");
      }
    } finally {
      if (saved === undefined) delete process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR;
      else process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR = saved;
    }
    // …and not in development, where the middleware sends none either.
    expect(config.nonceRouteCspHeaders({ NODE_ENV: 'development' })).toEqual([]);

    // The config sources and isNonceRoute name the same pages.
    const sources = config.NONCE_ROUTE_SOURCES.map((src) => getPathMatch(src));
    const samples = [
      '/project/p1', '/project/p1/analyze', '/project/p1/delivery', '/project/p1/design', '/project/p1/documentation',
      '/project/p1/tco', '/project/p1/testing', '/project/p1/transformation', '/invitation/p1/i1', '/auth/action',
      '/survey/t1', '/unsubscribe', '/admin/design-system/first-render',
      '/', '/dashboard', '/verify-pack', '/catalog', '/catalog/acdoca', '/project/p1/other', '/demo/analyze', '/settings',
    ];
    for (const url of samples) {
      expect(sources.some((match) => match(url) !== false), `next.config sources vs isNonceRoute on ${url}`).toBe(isNonceRoute(url));
    }
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
    expect(a.headers()['reporting-endpoints']).toBeUndefined();

    await watchViolations(page);
    await page.goto('/');
    expect(await scriptViolations(page)).toEqual([]);
  });

  test('a per-request page gets a fresh nonce that Next puts on every script', async ({ request }) => {
    const first = await request.get(PER_REQUEST_PAGE);
    test.skip(!first.headers()['content-security-policy'], 'no CSP: a dev server');
    const second = await request.get(PER_REQUEST_PAGE);
    const n1 = nonceOf(first.headers()['content-security-policy-report-only']);
    const n2 = nonceOf(second.headers()['content-security-policy-report-only']);
    expect(n1, 'no nonce in the report-only header').toBeTruthy();
    expect(n2).toBeTruthy();
    expect(n1, 'the nonce repeated across two requests').not.toBe(n2);
    // The enforced policy is not the one carrying it, and it is the landing's.
    expect(first.headers()['content-security-policy']).not.toContain('nonce-');
    const landing = await request.get('/');
    expect(first.headers()['content-security-policy']).toBe(landing.headers()['content-security-policy']);
    // Every per-request route still gets the enforced policy, exactly once.
    for (const url of ['/project/p1', '/project/p1/tco', '/invitation/p1/i1', '/auth/action', '/survey/t1', '/unsubscribe', '/admin/design-system/first-render']) {
      const res = await request.get(url, { maxRedirects: 0 });
      expect(res.headers()['content-security-policy'], `${url}: enforced policy`).toBe(landing.headers()['content-security-policy']);
      expect(res.headersArray().filter((h) => h.name.toLowerCase() === 'content-security-policy'), url).toHaveLength(1);
      expect(nonceOf(res.headers()['content-security-policy-report-only']), `${url}: no nonce`).toBeTruthy();
    }
    expect(first.headers()['content-security-policy']).toContain("'unsafe-inline'");

    for (const [res, nonce] of [[first, n1], [second, n2]] as const) {
      const html = await res.text();
      const scripts = [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]);
      expect(scripts.length).toBeGreaterThan(3);
      const without = scripts.filter((s) => !s.includes(`nonce="${nonce}"`));
      expect(without, `scripts without the response's nonce:\n${without.join('\n')}`).toEqual([]);
    }

    // A nonce the client sends is ignored.
    const forged = await request.get(PER_REQUEST_PAGE, {
      headers: { 'content-security-policy-report-only': "script-src 'nonce-FORGED'", 'content-security-policy': "script-src 'nonce-FORGED'", 'x-nonce': 'FORGED' },
    });
    expect(await forged.text()).not.toContain('FORGED');
  });

  test('a static page never carries a nonce, whatever the request says', async ({ request }) => {
    const res = await request.get('/dashboard', {
      headers: { 'content-security-policy-report-only': "script-src 'nonce-FORGED'" },
    });
    test.skip(!res.headers()['content-security-policy'], 'no CSP: a dev server');
    expect(nonceOf(res.headers()['content-security-policy-report-only'])).toBeUndefined();
    const html = await res.text();
    expect(html).not.toContain('FORGED');
    expect(html).not.toMatch(/<script[^>]*\snonce=/);
  });

  test('the report endpoint answers 204 to both formats and refuses an oversized body', async ({ request }) => {
    // The endpoint allows 60 reports a minute per address, and in CI every
    // browser spec reports from the same one (the emulator hosts alone are
    // connect-src violations of the report-only policy). A 429 here is the
    // limiter doing its job; wait for the window, and accept nothing else.
    test.setTimeout(150_000);
    const until = Date.now() + 120_000;
    const post = async (contentType: string, data: string) => {
      for (;;) {
        const status = (await request.post(CSP_REPORT_PATH, { headers: { 'content-type': contentType }, data })).status();
        if (status !== 429 || Date.now() > until) return status;
        await new Promise((r) => setTimeout(r, 5_000));
      }
    };
    expect(await post('application/csp-report', JSON.stringify({ 'csp-report': { 'document-uri': 'http://localhost/x?t=1', 'effective-directive': 'script-src-elem', 'blocked-uri': 'inline' } }))).toBe(204);
    expect(await post('application/reports+json', JSON.stringify([{ type: 'csp-violation', body: { documentURL: 'http://localhost/', effectiveDirective: 'connect-src', blockedURL: 'https://x.example/a' } }]))).toBe(204);
    expect(await post('application/csp-report', JSON.stringify({ 'csp-report': { pad: 'x'.repeat(20 * 1024) } }))).toBe(413);
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

      // A project stage, loaded as a document: per request, with a nonce.
      const stage = await page.goto(`/project/${PROJECT_ID}/analyze`);
      const stageNonce = nonceOf(stage!.headers()['content-security-policy-report-only']);
      expect(stageNonce).toBeTruthy();
      await page.waitForSelector('[data-stage-title]', { timeout: 30_000 });
      // The nonce on the scripts in the live document is the header's. Scripts
      // inserted later by trusted code carry none and need none ('strict-dynamic').
      const scriptNonces = await page.evaluate(() =>
        [...document.querySelectorAll('script')].map((s) => s.nonce).filter(Boolean),
      );
      expect(scriptNonces.length).toBeGreaterThan(3);
      expect(new Set(scriptNonces)).toEqual(new Set([stageNonce]));
      expect(await scriptViolations(page), 'script-src violations on the analyze stage').toEqual([]);

      // The same stage, reloaded: a new nonce.
      const again = await page.reload();
      expect(nonceOf(again!.headers()['content-security-policy-report-only'])).not.toBe(stageNonce);
    });
  });
});
