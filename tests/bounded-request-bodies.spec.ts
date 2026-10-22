import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { readBoundedRequestJson, SMALL_REQUEST_BODY_LIMITS } from '../lib/url-validation';
import { QuotaError, mfaRefusal } from '../lib/firebase-admin';

/**
 * Request bodies are read under a byte bound before they are parsed, and an MFA
 * gate that fails for a reason of ours answers with a generic sentence
 * (SEC-2026-909, SEC-2026-910).
 */
const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const request = (body: string, headers: Record<string, string> = {}) =>
  new Request('http://localhost/x', { method: 'POST', body, headers: { 'content-type': 'application/json', ...headers } });

test.describe('readBoundedRequestJson', () => {
  const LIMITS = { maxBytes: 64, timeoutMs: 5_000 };

  test('a body within the bound is parsed', async () => {
    expect(await readBoundedRequestJson(request('{"uid":"a"}'), LIMITS)).toEqual({ tooLarge: false, body: { uid: 'a' } });
  });

  test('a body over the bound is refused before it is parsed', async () => {
    expect(await readBoundedRequestJson(request(JSON.stringify({ x: 'y'.repeat(200) })), LIMITS)).toEqual({ tooLarge: true });
  });

  test('a declared length over the bound is refused without reading', async () => {
    const declared = { headers: new Headers({ 'content-length': '1000000' }), body: null };
    expect(await readBoundedRequestJson(declared, LIMITS)).toEqual({ tooLarge: true });
  });

  test('an empty body or one that is not JSON is null, as req.json().catch(() => null) was', async () => {
    expect(await readBoundedRequestJson(request(''), LIMITS)).toEqual({ tooLarge: false, body: null });
    expect(await readBoundedRequestJson(request('not json'), LIMITS)).toEqual({ tooLarge: false, body: null });
  });

  test('the small bound fits an invitation and refuses a megabyte', async () => {
    expect((await readBoundedRequestJson(request(JSON.stringify({ email: 'a@b.example', expiresInDays: 7 })), SMALL_REQUEST_BODY_LIMITS)).tooLarge).toBe(false);
    expect((await readBoundedRequestJson(request('"' + 'a'.repeat(1024 * 1024) + '"'), SMALL_REQUEST_BODY_LIMITS)).tooLarge).toBe(true);
  });
});

test('the named routes no longer parse a request body without a bound', () => {
  const routes = [
    'app/api/projects/[projectId]/statement-proposal/route.ts',
    'app/api/projects/[projectId]/requirement-wording/route.ts',
    'app/api/projects/[projectId]/process-naming/route.ts',
    'app/api/projects/[projectId]/invitations/route.ts',
    'app/api/projects/[projectId]/readers/route.ts',
    'app/api/projects/[projectId]/process-revisions/route.ts',
    'app/api/projects/[projectId]/requirements-spec/route.ts',
    'app/api/model-stages/route.ts',
    'app/api/fetch-odata-metadata/route.ts',
    'app/api/fetch-s4-metadata/route.ts',
  ];
  for (const rel of routes) {
    const src = read(rel);
    expect(src, `${rel} parses the whole body unbounded`).not.toMatch(/\breq(uest)?\.(json|text)\(\)/);
    expect(src, `${rel} reads no body through the bounded reader`).toMatch(/readBoundedRequestJson\(req|readBoundedBody\(req/);
  }
});

test.describe('the MFA gate passes on its own refusal and nothing else', () => {
  test('a refusal of the gate keeps its sentence and status', () => {
    expect(mfaRefusal(new QuotaError('Multi-factor authentication required.', 403))).toEqual({
      message: 'Multi-factor authentication required.',
      status: 403,
    });
  });

  test('any other error leaves no text for the caller', () => {
    const infra = Object.assign(new Error('13 INTERNAL: projects/x/databases/y backend unavailable'), { code: 13 });
    expect(mfaRefusal(infra)).toEqual({});
    expect(mfaRefusal('a string')).toEqual({});
  });

  test('no route hands a caught MFA error to the caller unchecked', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name === 'route.ts') {
          const src = fs.readFileSync(p, 'utf8');
          const rel = path.relative(ROOT, p).split(path.sep).join('/');
          if (/catch \(mfaErr: any\)/.test(src)) offenders.push(`${rel}: catch (mfaErr: any)`);
          if (/mfaErr as \{/.test(src)) offenders.push(`${rel}: mfaErr cast and passed on`);
          if (/mfaErr\??\.message/.test(src) && !/mfaErr instanceof QuotaError/.test(src)) offenders.push(`${rel}: mfaErr.message unchecked`);
        }
      }
    };
    walk(path.join(ROOT, 'app/api'));
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});
