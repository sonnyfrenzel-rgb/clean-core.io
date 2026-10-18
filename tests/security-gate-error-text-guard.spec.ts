import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import type { DocumentReference, DocumentSnapshot } from 'firebase-admin/firestore';
import { readArtefactsForReader } from '../lib/project-artefact-store';

/**
 * Two rules of the gated project routes, checked without a server.
 *
 *   1. The artefact read asks for read access again inside its transaction,
 *      of the project document that transaction reads (SEC-2026-844).
 *   2. A gate check answers with an error's text only when the error is the
 *      check's own refusal (`QuotaError`); anything else is logged and
 *      answered with a fixed sentence (SEC-2026-846, as SEC-2026-831).
 */

const ROOT = path.join(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

function fakeTx(project: Record<string, unknown> | null) {
  let partsRead = 0;
  const tx = {
    get: async () => ({ exists: project !== null, data: () => project ?? undefined }) as unknown as DocumentSnapshot,
    getAll: async () => {
      partsRead += 1;
      return [] as DocumentSnapshot[];
    },
  };
  return { tx, partsRead: () => partsRead };
}
const projectRef = { id: 'p-1' } as unknown as DocumentReference;

test.describe('the artefact read asks for access of the document it reads (SEC-2026-844)', () => {
  test('a read that loses access mid-way answers not found', async () => {
    // The gate saw "reader" among the readers; by the time the transaction reads
    // the document, the invitation was revoked.
    const revoked = fakeTx({ userId: 'owner', readers: [] });
    expect(await readArtefactsForReader(revoked.tx, projectRef, 'reader')).toBeNull();
    expect(revoked.partsRead(), 'no part is read for a reader without access').toBe(0);
    // A project deleted in between: the same answer.
    expect(await readArtefactsForReader(fakeTx(null).tx, projectRef, 'reader')).toBeNull();
  });

  test('a reader who still has access reads as before', async () => {
    expect(await readArtefactsForReader(fakeTx({ userId: 'owner', readers: ['reader'] }).tx, projectRef, 'reader')).toEqual({});
    expect(await readArtefactsForReader(fakeTx({ userId: 'owner' }).tx, projectRef, 'owner')).toEqual({});
  });

  test('the route answers the transaction\'s refusal as "no such project"', () => {
    const src = read('app/api/projects/[projectId]/artefacts/route.ts');
    expect(src).toContain('async (tx: Transaction) => readArtefactsForReader(tx, projectRef, gate.uid)');
    expect(src).toMatch(/if \(artefacts === null\) return NextResponse\.json\(\{ error: 'Project not found\.' \}, \{ status: 404 \}\);/);
  });
});

/** Every `catch (name …) { … }` block of a source file, with its variable. */
function catchBlocks(src: string): Array<{ name: string; body: string }> {
  const out: Array<{ name: string; body: string }> = [];
  const re = /catch \((\w+)[^)]*\) \{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let depth = 1;
    let i = m.index + m[0].length;
    for (; i < src.length && depth > 0; i++) {
      if (src[i] === '{') depth += 1;
      else if (src[i] === '}') depth -= 1;
    }
    out.push({ name: m[1], body: src.slice(m.index + m[0].length, i - 1) });
  }
  return out;
}

test.describe('a gate check passes an error\'s text on only for its own refusal (SEC-2026-846)', () => {
  for (const route of ['app/api/run-tests/route.ts', 'app/api/projects/[projectId]/artefacts/route.ts']) {
    test(`an unexpected error answers a fixed sentence: ${route}`, () => {
      const blocks = catchBlocks(read(route));
      let answered = 0;
      for (const { name, body } of blocks) {
        // Only a message that goes into a response counts; one in a log line does
        // not. Any `.message` counts, so an alias of the error is caught too.
        const message = /\??\.message\b/;
        let at = -1;
        for (let from = body.indexOf('NextResponse.json('); from >= 0 && at < 0; from = body.indexOf('NextResponse.json(', from + 1)) {
          let depth = 0;
          let end = from + 'NextResponse.json'.length;
          for (; end < body.length; end++) {
            if (body[end] === '(') depth += 1;
            else if (body[end] === ')' && --depth === 0) break;
          }
          const inner = body.slice(from, end).search(message);
          if (inner >= 0) at = from + inner;
        }
        if (at < 0) continue;
        answered += 1;
        // Either every other error is answered by the fixed sentence first, or
        // the message is answered inside the branch of the refusal itself.
        const refused = body.indexOf(`if (!(${name} instanceof QuotaError)) return gateCheckFailed(${name}, `);
        const branch = body.indexOf(`if (${name} instanceof QuotaError) {`);
        const guard = refused >= 0 ? refused : branch;
        expect(guard, `catch (${name}) answers ${name}.message without first refusing every other error`).toBeGreaterThanOrEqual(0);
        expect(guard).toBeLessThan(at);
      }
      expect(answered, 'the guard found no gate check to look at').toBeGreaterThan(0);
      const src = read(route);
      const helper = src.slice(src.indexOf('function gateCheckFailed('));
      const helperBody = helper.slice(0, helper.indexOf('\n}\n'));
      expect(helperBody).toContain("'The check could not run. Please try again shortly.'");
      expect(helperBody).toContain('status: 503');
      expect(helperBody).not.toMatch(/err\??\.message/);
    });
  }
});

/**
 * The same rule, executed (QA c6d71cc211db): both routes bundled as they are,
 * with the gate checks as the only seam — a stand-in for `@/lib/firebase-admin`
 * and `@/lib/rate-limit` whose checks throw what a test hands them. A refusal
 * answers its own text and status; any other error answers the fixed sentence,
 * and its text appears nowhere in the response.
 */
test.describe('a gate check that throws, through the route itself (SEC-2026-846)', () => {
  const OUT = path.join(ROOT, 'tmp', 'security-gate-error', String(process.pid));
  const STAND_IN = `
const g = globalThis;
class QuotaError extends Error { constructor(message, status) { super(message); this.name = 'QuotaError'; this.status = status; } }
const check = (name) => async () => { const make = g.__gateThrows && g.__gateThrows[name]; if (make) throw make(QuotaError); };
module.exports = {
  QuotaError,
  verifyRequestAuth: async () => ({ uid: 'u-gate' }),
  assertMfaSatisfied: check('mfa'),
  assertAccountActive: check('account'),
  assertS4TenantAccess: check('s4'),
  assertRateLimit: check('rate'),
  refuseInactiveAccount: async () => null,
  getAdminDb: async () => { throw new Error('no database behind this test'); },
};
`;
  type Make = (Q: new (m: string, s: number) => Error) => Error;
  const throws = (name: string, make: Make | null) => {
    const g = globalThis as { __gateThrows?: Record<string, Make> };
    g.__gateThrows = make ? { [name]: make } : {};
  };
  type Handler = (req: unknown, ctx?: unknown) => Promise<Response>;
  let artefactsGet: Handler;
  let runTestsPost: Handler;
  let NextRequestCtor: new (url: string, init?: Record<string, unknown>) => unknown;
  const SECRET = 'projects/p-1 internal 10.0.0.7 credential-fragment';

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    const { build } = await import('esbuild');
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, 'gates.cjs'), STAND_IN);
    const seams = {
      name: 'gate-seams',
      setup(b: { onResolve: (o: { filter: RegExp }, f: () => { path: string }) => void }) {
        b.onResolve({ filter: /^@\/lib\/(firebase-admin|rate-limit|account-read-gate)$/ }, () => ({ path: path.join(OUT, 'gates.cjs') }));
      },
    };
    const bundle = async (entry: string, out: string) => {
      await build({ entryPoints: [path.join(ROOT, entry)], outfile: path.join(OUT, out), bundle: true, format: 'cjs', platform: 'node', packages: 'external', plugins: [seams], alias: { '@': ROOT }, logLevel: 'silent' });
      return require(path.join(OUT, out)) as Record<string, Handler>;
    };
    artefactsGet = (await bundle('app/api/projects/[projectId]/artefacts/route.ts', 'artefacts.cjs')).GET;
    runTestsPost = (await bundle('app/api/run-tests/route.ts', 'run-tests.cjs')).POST;
    NextRequestCtor = require('next/server').NextRequest;
  });
  test.afterAll(() => {
    throws('', null);
    fs.rmSync(OUT, { recursive: true, force: true });
  });

  const artefacts = () => artefactsGet(new NextRequestCtor('http://localhost/api/projects/p1/artefacts', { headers: { Authorization: 'Bearer t' } }), { params: Promise.resolve({ projectId: 'p1' }) });
  const runTests = () => runTestsPost(new Request('http://localhost/api/run-tests', { method: 'POST', headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' }, body: '{}' }));
  const FIXED = 'The check could not run. Please try again shortly.';

  for (const [route, call, steps] of [
    ['artefacts GET', artefacts, ['mfa', 'rate']],
    ['run-tests POST', runTests, ['mfa', 'account']],
  ] as const) {
    for (const step of steps) {
      test(`${route}: an unexpected error in the ${step} check answers 503 and the fixed sentence, never its text`, async () => {
        throws(step, () => Object.assign(new Error(SECRET), { code: 'internal' }));
        const res = await call();
        const text = await res.text();
        expect(res.status).toBe(503);
        expect(JSON.parse(text).error).toBe(FIXED);
        expect(text).not.toContain('credential-fragment');
      });
      test(`${route}: the ${step} check's own refusal answers its text and status`, async () => {
        const status = step === 'rate' ? 429 : 403;
        throws(step, (Q) => new Q(`refused by ${step}`, status));
        const res = await call();
        expect(res.status).toBe(status);
        expect((await res.json()).error).toBe(`refused by ${step}`);
      });
    }
  }
});
