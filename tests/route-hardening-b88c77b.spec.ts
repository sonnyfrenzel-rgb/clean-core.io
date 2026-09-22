/**
 * Seven findings of the b88c77b security audit, each verified at the line
 * before it was fixed, and each pinned here.
 *
 *   1. twelve `catch` blocks answered a 500 or a 502 with `error.message` —
 *      the cause, in the caller's hands. One of them added 200 characters of
 *      the token endpoint's own response body.
 *   2. the two outgoing metadata routes called no limiter at all, and
 *      `middleware.ts` excludes `/api` from its matcher, so one confirmed
 *      account could drive unlimited outbound fetch cycles from our address.
 *   3. `?deep=1` on the health probe cost one Firestore read per call, without
 *      a token and without a limit.
 *   4. four routes read on behalf of an account nobody had checked was still
 *      active — the worst of them handing out other people's e-mail addresses.
 *   5. `DELETE /api/projects/{id}` answered "already deleted" for a project
 *      that does not exist and 403 for one that does and is not yours, which
 *      together tell an outsider which ids exist.
 *   6. nothing capped the source the two quadratic analysis paths were asked
 *      to chew through, and neither of them was rate-limited.
 *   7. an `AUDIT_SIGNING_PRIVATE_KEY` that is set but unusable degraded to
 *      HMAC-only signing with one line in a log and nothing else — the silent
 *      failure of the one promise an outsider can check.
 *
 * Mostly source-level, because what each finding names is an *omission*: a gate
 * that is not called, a limit that is not asked for, a ceiling that is not
 * there. A guard that reads the file measures exactly that, and it measures it
 * without a suspended account, a megabyte of ABAP or a broken tenant to hand.
 * The seventh is different — a key can be made unusable in three lines — so it
 * is checked by running the route.
 */
import { test, expect } from '@playwright/test';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { GET as healthGET } from '../app/api/health/route';
import { resetSigningKeypairCache } from '../lib/audit-signing-keypair';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/**
 * The file with its comment lines removed, line by line.
 *
 * Every comment in those routes explains the shape it replaced and therefore
 * quotes it — `alreadyDeleted`, `Connection failed`, and the rest — so a search
 * over the whole text would find the explanation instead of the thing
 * explained. Line-based rather than a regex over block comments, for the reason
 * `tests/route-gates-guard.spec.ts` records: blanking them with a regex
 * swallows code in files whose string literals contain the closing delimiter.
 */
function code(rel: string): string {
  return read(rel)
    .split(/\r?\n/)
    .filter((line) => {
      const t = line.trim();
      return t.length > 0 && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');
}

/* ------------------------------------------------------------------ */
/* 1 — the cause of a failure is the server's, not the caller's        */
/* ------------------------------------------------------------------ */

/**
 * Each audited site: the shape it had, and what has to be there instead.
 *
 * The convention is the house's own, at
 * `app/api/secrets/gemini/test/route.ts:74-77` — a fixed sentence outward, the
 * reason into the structured logger the neighbouring routes use.
 */
const LEAKS: Array<{ file: string; gone: RegExp[]; present: string[] }> = [
  {
    file: 'app/api/fetch-odata-metadata/route.ts',
    gone: [/Internal server error: \$\{/, /Response: \$\{errorBody/],
    present: ["'Internal server error during metadata fetch.'", "logger.error('fetch-odata-metadata failed'", "logger.warn('oauth token exchange rejected'"],
  },
  {
    file: 'app/api/fetch-s4-metadata/route.ts',
    // The second shape is the site this file's own sweep found and the audit
    // had not listed: the bounded read's failure was forwarded verbatim too.
    gone: [/Connection failed: \$\{/, /could not be read: \$\{/],
    present: [
      "logger.error('s4 metadata fetch failed'",
      'Could not connect to the tenant.',
      "logger.error('s4 metadata response could not be read'",
    ],
  },
  {
    file: 'app/api/gemini/route.ts',
    gone: [/\{ error: message \}/],
    present: ["error: 'The AI request could not be completed. Please try again.'"],
  },
  {
    file: 'app/api/admin/approve-tenant/route.ts',
    gone: [/error\.message \|\|/],
    present: ["logger.error('approve-tenant failed'", "error: 'Internal Server Error'"],
  },
  {
    file: 'app/api/admin/console-action/route.ts',
    gone: [/error\.message \|\|/],
    present: ["logger.error('console-action failed'", "error: 'Internal Server Error'"],
  },
  {
    file: 'app/api/admin/set-admin-claim/route.ts',
    gone: [/e\?\.message \|\| 'Failed to set admin claim\.'/],
    present: ["logger.error('set-admin-claim failed'", "error: 'Failed to set admin claim.'"],
  },
  {
    file: 'app/api/projects/[projectId]/readers/route.ts',
    gone: [/err instanceof Error \? err\.message/],
    present: ["logger.error('project readers read failed'", "logger.error('project readers revoke failed'"],
  },
  {
    file: 'app/api/projects/[projectId]/route.ts',
    gone: [/err instanceof Error \? err\.message/, /err\?\.message \|\| 'Failed to delete project\.'/],
    present: ["logger.error('project read failed'", "logger.error('project delete failed'"],
  },
  {
    file: 'app/api/runs/create/route.ts',
    gone: [/error\.message \|\| 'Internal Server Error'/],
    present: ["error: 'Internal Server Error'"],
  },
  {
    file: 'app/api/secrets/gemini/status/route.ts',
    gone: [/err\?\.message \|\| 'Failed to fetch status\.'/],
    present: ["logger.error('gemini key status read failed'", "error: 'Failed to fetch status.'"],
  },
];

test('no audited route hands a caught error back to its caller', () => {
  for (const site of LEAKS) {
    const src = code(site.file);
    for (const shape of site.gone) {
      expect(src, `${site.file} still answers with the cause: ${shape}`).not.toMatch(shape);
    }
    for (const needle of site.present) {
      expect(src, `${site.file} lost the fixed answer or the log line: ${needle}`).toContain(needle);
    }
  }
});

test('and no 500 or 502 in those files carries one either', () => {
  // The table above names the twelve sites the audit found. This asks the same
  // question of every 5xx in the same files, so a thirteenth cannot be added
  // quietly: take each `{ status: 500 }` / `{ status: 502 }`, walk back to the
  // `NextResponse.json(` it belongs to, and look at what is being answered.
  for (const site of LEAKS) {
    const src = code(site.file);
    for (const hit of src.matchAll(/\{\s*status:\s*(500|502)\s*\}/g)) {
      const before = src.slice(Math.max(0, (hit.index ?? 0) - 600), hit.index);
      const call = before.lastIndexOf('return NextResponse.json(');
      const answered = call === -1 ? '' : before.slice(call);
      expect(
        answered,
        `${site.file} answers ${hit[1]} with a caught error's message: ${answered.slice(0, 140)}`,
      ).not.toMatch(/\w+\??\.message|\berror: message\b/);
    }
  }
});

/* ------------------------------------------------------------------ */
/* 2 — the outgoing metadata routes are metered per account            */
/* ------------------------------------------------------------------ */

test('both metadata routes bound how often one account may reach out', () => {
  for (const rel of ['app/api/fetch-odata-metadata/route.ts', 'app/api/fetch-s4-metadata/route.ts']) {
    const src = code(rel);
    expect(src, `${rel} does not import the limiter`).toContain("from '@/lib/rate-limit'");
    const call = src.match(/assertRateLimit\(\s*`([^`]+)`\s*,\s*(\d+)\s*,([^)]+)\)/);
    expect(call, `${rel} calls no limiter — nothing else does either, `
      + 'because middleware.ts excludes /api from its matcher').not.toBeNull();
    // Per account. Keying on the address as well would hand the same account a
    // fresh allowance per address, which is what `app/api/gemini/route.ts`
    // already records as the defect that made its own limiter a formality.
    expect(call![1], `${rel} does not key its limit on the account`).toContain('${decodedToken.uid}');
    expect(call![1], `${rel} keys its limit on something the caller can change`).not.toContain('getClientIp');
    expect(Number(call![2]), `${rel} allows an unbounded number of outbound cycles`).toBeLessThanOrEqual(60);
    // And it is asked for before the body is parsed and the tenant is called.
    expect(src.indexOf('assertRateLimit('), `${rel} limits after it has already reached out`)
      .toBeLessThan(src.indexOf('await req.json()'));
  }
});

/* ------------------------------------------------------------------ */
/* 3 — the unauthenticated deep probe                                   */
/* ------------------------------------------------------------------ */

test('the deep health probe reaches Firestore at most once per cooldown', () => {
  const src = code('app/api/health/route.ts');

  // One reach into Firestore in the whole file, and it is inside the deep
  // branch: the shallow probe stays free, which is what makes it safe to poll.
  const reaches = [...src.matchAll(/getAdminDb\(\)/g)];
  expect(reaches, 'the health route reaches Firestore more than once per request').toHaveLength(1);
  const deepBranch = src.indexOf('if (deep)');
  expect(deepBranch, 'the deep branch is gone').toBeGreaterThan(-1);
  expect(reaches[0].index, 'the shallow probe now costs a Firestore read as well').toBeGreaterThan(deepBranch);

  // The cooldown is consulted first, and the reach happens only on the far side
  // of it. Before this, every `?deep=1` — from anybody, without a token — was a
  // read.
  const cooldown = src.match(/const (DEEP_PROBE_COOLDOWN_MS) = ([\d_]+)/);
  expect(cooldown, 'the deep branch has no cooldown').not.toBeNull();
  expect(Number(cooldown![2].replace(/_/g, '')), 'a cooldown of nothing is not a cooldown').toBeGreaterThanOrEqual(1000);
  const consulted = src.indexOf('DEEP_PROBE_COOLDOWN_MS', deepBranch);
  expect(consulted, 'the cooldown is never consulted in the deep branch').toBeGreaterThan(-1);
  expect(consulted, 'Firestore is reached before the cooldown is consulted').toBeLessThan(reaches[0].index!);

  // The verdict of the last real probe is what the calls in between are
  // answered from — not a constant, and not `undefined`.
  expect(src, 'nothing remembers the last verdict').toMatch(/lastDeepProbe\s*=\s*\{\s*at:/);
  expect(src, 'the remembered verdict is never used').toContain('firestoreOk = lastDeepProbe.ok');

  // And the answer stays aggregated: no per-check boolean, which is the
  // deliberate half of the same finding (health/route.ts:11-13).
  const answer = src.slice(src.indexOf('return NextResponse.json('));
  for (const leak of ['signingKeyOk', 'geminiOk', 'firestoreOk', 'asymmetricOk']) {
    expect(answer, `the answer now says which check failed: ${leak}`).not.toContain(`${leak},`);
  }
});

/* ------------------------------------------------------------------ */
/* 4 — a suspended account is refused where its siblings refuse it      */
/* ------------------------------------------------------------------ */

test('the readers overview is gated and metered like the revocation beside it', () => {
  const src = code('app/api/projects/[projectId]/readers/route.ts');

  // The gates sat behind `if (mutating)` and GET passed `false`, so the read of
  // the access list — which carries the e-mail address of everyone who accepted
  // an invitation — skipped both. Neither verb may skip them now.
  expect(src, 'the gates are conditional again').not.toMatch(/if \(mutating\)/);
  expect(src, 'a caller can still ask for the ungated path').not.toMatch(/openAsOwner\([^)]*,\s*(true|false)\s*\)/);
  const opens = [...src.matchAll(/openAsOwner\(req, params\)/g)];
  expect(opens, 'both verbs must go through the same gate').toHaveLength(2);

  const gate = src.indexOf('async function openAsOwner');
  const body = src.slice(gate, src.indexOf('export async function GET'));
  expect(body, 'the overview is not metered').toContain('assertRateLimit(');
  expect(body, 'the overview does not check the account').toContain('assertAccountActive(');
  // Hard suspension only, deliberately: an owner asked to re-accept the Terms
  // must still be able to see and end somebody else's access to their code.
  expect(body, 'the gate now also refuses on approval or Terms').not.toMatch(
    /assertAccountActive\([^)]*require(Approved|CurrentTerms)/,
  );
});

test('the three other routes that read on an account check that it is still active', () => {
  // model-stages GET: the POST in the same file had the gate, the GET did not.
  const stages = code('app/api/model-stages/route.ts');
  const get = stages.slice(stages.indexOf('export async function GET'), stages.indexOf('export async function POST'));
  expect(get, 'the GET decrypts the account key without checking the account').toContain('assertAccountActive(');

  // The key-status read had a token and nothing else.
  const status = code('app/api/secrets/gemini/status/route.ts');
  expect(status, 'the key status is readable without the second factor').toContain('assertMfaSatisfied(');
  expect(status, 'the key status is readable by a suspended account').toContain('assertAccountActive(');

  // The key test spends the key; it had the factor and a limit but no account.
  const keyTest = code('app/api/secrets/gemini/test/route.ts');
  expect(keyTest, 'a suspended account can still have its key spent').toContain('assertAccountActive(');
});

test('deleting your own key stays possible while suspended, and says so', () => {
  // The one omission in this family that is deliberate and must not be
  // "fixed": a suspended account has to be able to take its key off the
  // server. The same intent `readers/route.ts` states about revoking.
  const rel = 'app/api/secrets/gemini/route.ts';
  const del = code(rel).slice(code(rel).indexOf('export async function DELETE'));
  expect(del, 'the DELETE grew an account gate — a suspended account can no longer withdraw its own key')
    .not.toContain('assertAccountActive(');
  // And the reason is written down, so the next reader closes the finding by
  // reading rather than by adding the gate.
  const withComments = read(rel);
  expect(withComments.slice(withComments.indexOf('export async function DELETE')), 'the omission is silent again')
    .toMatch(/No account-state gate, on purpose/);
});

/* ------------------------------------------------------------------ */
/* 5 — deleting tells nobody which projects exist                       */
/* ------------------------------------------------------------------ */

test('DELETE answers "not there" and "not yours" the same way GET does', () => {
  const src = code('app/api/projects/[projectId]/route.ts');
  const del = src.slice(src.indexOf('export async function DELETE'));

  // The early success is gone: it answered before anyone asked whose project
  // it was, so a 200 meant "no such id" and a 403 meant "somebody else's".
  expect(del, 'a missing project is still answered differently from a foreign one').not.toContain('alreadyDeleted');
  expect(del, 'the ownership check no longer covers a missing document').toMatch(/snap\.exists && snap\.data\(\)\?\.userId === decoded\.uid/);
  expect(del, 'a foreign project is still told apart by its status code').not.toContain('Unauthorized to delete this project.');

  // The same sentence and the same status the GET above answers with, so the
  // two halves of the file cannot drift apart.
  const getBlock = src.slice(src.indexOf('export async function GET'), src.indexOf('export async function DELETE'));
  expect(getBlock).toContain("{ error: 'Project not found.' }, { status: 404 }");
  expect(del, 'DELETE does not answer as GET does').toContain("{ error: 'Project not found.' }, { status: 404 }");
});

/* ------------------------------------------------------------------ */
/* 6 — the expensive analysis paths have a ceiling and a meter          */
/* ------------------------------------------------------------------ */

const DERIVING_ROUTES = [
  'app/api/runs/create/route.ts',
  'app/api/projects/[projectId]/process-states/route.ts',
];

test('both derivation routes refuse a source they would spend a minute on', () => {
  const caps: number[] = [];
  for (const rel of DERIVING_ROUTES) {
    const src = code(rel);
    const cap = src.match(/const MAX_ANALYSED_SOURCE_BYTES = (\d+) \* (\d+);/);
    expect(cap, `${rel} declares no ceiling on the source it derives rules from`).not.toBeNull();
    caps.push(Number(cap![1]) * Number(cap![2]));
    // Measured in bytes, not in characters: a source of ABAP comments in
    // German is a third longer on the wire than `String.length` claims.
    expect(src, `${rel} declares a ceiling and never measures against it`).toContain("Buffer.byteLength(");
    expect(src, `${rel} never compares anything to the ceiling`).toMatch(/>\s*MAX_ANALYSED_SOURCE_BYTES/);
    expect(src, `${rel} computes instead of refusing`).toContain("code: 'source-too-large'");
    expect(src, `${rel} refuses with the wrong status`).toContain('status: 413');
  }
  expect(caps[0], 'the two routes cap the same thing at two different sizes').toBe(caps[1]);

  // Well below what the rules allow a project to store. `deriveBusinessRules`
  // is quadratic: 2.5 s at 380 KB, 10.4 s at 780 KB, 67 s at 1.58 MB, measured
  // — so the megabyte the rules permit is about 17 s of CPU per request, and a
  // ceiling at the rules' own figure would be no ceiling at all.
  const stored = read('firestore.rules').match(/data\.legacyCode\.size\(\) < (\d+)/);
  expect(stored, 'firestore.rules no longer caps legacyCode').not.toBeNull();
  expect(caps[0], 'the route cap is not meaningfully below what a project may store')
    .toBeLessThan(Number(stored![1]) / 3);
  // And still far above the largest ABAP the product has ever been given: the
  // 37 KB starter example.
  expect(caps[0]).toBeGreaterThan(4 * fs.statSync(path.join(ROOT, 'public/starter-examples/ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap')).size);
});

test('and neither of them can be asked for without limit', () => {
  const runs = code('app/api/runs/create/route.ts');
  expect(runs, 'runs/create imports no limiter').toContain("from '@/lib/rate-limit'");
  // The community quota is not a bound here: re-analysing the same fingerprint
  // is free by design, so the same expensive source could be posted forever.
  expect(runs, 'runs/create still has no limit of its own').toMatch(/assertRateLimit\(\s*`runs-create:\$\{decodedToken\.uid\}`/);
  expect(runs.indexOf('assertRateLimit('), 'the limit comes after the work').toBeLessThan(runs.indexOf('buildAbapEvidence('));

  const states = code('app/api/projects/[projectId]/process-states/route.ts');
  // The limit was in the mutating branch only, and the read is the expensive
  // half — it derives the rules out of the source on every call.
  const gate = states.slice(states.indexOf('async function openProject'), states.indexOf('const { projectId } = await params;'));
  const limits = [...gate.matchAll(/assertRateLimit\(\s*`([^`]+)`/g)].map((m) => m[1]);
  expect(limits.length, 'the read path of process-states is still unmetered').toBe(2);
  expect(limits.some((k) => k.startsWith('process-states-read:')), 'the read has no budget of its own').toBe(true);
  // The account gate stays out of the read, where CR-13 put it
  // (tests/route-gates-guard.spec.ts): an invited reader may be less than
  // active in their own right.
  expect(gate.slice(0, gate.indexOf('if (mutating)')), 'the read now checks the account too')
    .not.toContain('assertAccountActive(');
});

/* ------------------------------------------------------------------ */
/* 7 — a signing key that is set but unusable is a visible failure      */
/* ------------------------------------------------------------------ */

async function probe(): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await healthGET(new Request('http://localhost:3000/api/health'));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

const pkcs8 = (type: 'ed25519' | 'rsa'): string => {
  const { privateKey } = type === 'ed25519'
    ? crypto.generateKeyPairSync('ed25519')
    : crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  return Buffer.from(privateKey.export({ format: 'pem', type: 'pkcs8' }) as string).toString('base64');
};

test('the probe goes red when the Ed25519 key is set but unusable', async () => {
  const savedKey = process.env.AUDIT_SIGNING_PRIVATE_KEY;
  const savedGemini = process.env.GEMINI_API_KEY;
  // The shallow probe also asks for these two; they are not this test's
  // subject, so they are made true and put back afterwards.
  process.env.GEMINI_API_KEY = savedGemini || 'health-spec-placeholder';
  try {
    // No key at all is a supported state — packs carry the HMAC signature only
    // — and must stay green, or every environment without the secret would go
    // red on the day this shipped.
    delete process.env.AUDIT_SIGNING_PRIVATE_KEY;
    resetSigningKeypairCache();
    expect((await probe()).status, 'an absent asymmetric key is not a fault').toBe(200);

    // Set but unusable. `lib/audit-signing-keypair.ts` never throws on import,
    // so this degraded to HMAC-only signing with one line in the log — and the
    // probe stayed green, which is the finding.
    process.env.AUDIT_SIGNING_PRIVATE_KEY = 'this-is-not-a-key';
    resetSigningKeypairCache();
    const broken = await probe();
    expect(broken.status, 'a malformed signing key is invisible to the probe').toBe(503);
    expect(broken.body.status).toBe('degraded');
    // Still aggregated. The route says *that* something is wrong and never
    // which secret it is — the deliberate half of finding 3.
    expect(Object.keys(broken.body).sort(), 'the answer now names the failing check')
      .toEqual(['commit', 'status', 'time', 'version']);

    // The other unusable shape: a working key of the wrong algorithm, which
    // would sign packs the published verifier cannot check.
    process.env.AUDIT_SIGNING_PRIVATE_KEY = pkcs8('rsa');
    resetSigningKeypairCache();
    expect((await probe()).status, 'an RSA key where Ed25519 belongs is invisible too').toBe(503);

    // And a real key is healthy again, so the check cannot pass by always
    // failing.
    process.env.AUDIT_SIGNING_PRIVATE_KEY = pkcs8('ed25519');
    resetSigningKeypairCache();
    expect((await probe()).status, 'a usable Ed25519 key is refused').toBe(200);
  } finally {
    if (savedKey === undefined) delete process.env.AUDIT_SIGNING_PRIVATE_KEY;
    else process.env.AUDIT_SIGNING_PRIVATE_KEY = savedKey;
    if (savedGemini === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = savedGemini;
    resetSigningKeypairCache();
  }
});
