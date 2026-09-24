import { test, expect, type APIRequestContext } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, type User } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { adminSetDoc, adminGetDoc, adminSetEmailVerified, adminSetCustomClaim } from './helpers/admin-seed';
import { PROJECT_READERS_FIELD, invitationCollectionPath } from '../lib/invitations';

/**
 * Roadmap 5.6 — the end-to-end read acceptance (CR-13).
 *
 * Five roles against **every** route under `app/api/projects`, both verbs:
 * owner · invited reader · never-invited stranger · revoked reader · an account
 * carrying the administrator claim and no membership at all.
 *
 * What this file is *not*: a second copy of the rules test.
 * `tests/firestore-rules-readers.spec.ts` asks the rules engine whether a
 * revocation bites, and `tests/project-readers.spec.ts` asks the pure function
 * and the rules *source*. Neither of them knocks on a route, and the routes are
 * the half that answers a browser. On 19.09.2026 the four process routes were
 * demanding the owner even for GET — a reader whom the rules would have let
 * read could not read through the server. That was repaired; this is the test
 * that would have caught it, and the test that catches the mirror image of it.
 *
 * Three properties, in the order they are checked below:
 *
 *   1. **Completeness.** The catalogue is compared with the file tree. A route
 *      or a verb this file does not know makes the suite red, so a route added
 *      in three weeks cannot quietly arrive ungated. Nothing here is typed from
 *      memory: `routeTreeMethods()` reads `app/api/projects/**‍/route.ts`.
 *   2. **Owner and reader get the same answer on a read**, byte-identical
 *      status. Not "the reader got something" — the same thing the owner got.
 *      A reader who is fobbed off with an empty 200 has not read the project.
 *   3. **Stranger, revoked reader and administrator get the refusal the route
 *      declares**, on every verb, and a write is refused for the reader too.
 *
 * Every expectation is unconditional. A route that answers something else —
 * 200 where 403 was declared, or 500 because it broke — fails here rather than
 * being skipped for "not applicable", which is the failure mode this acceptance
 * exists to rule out.
 */

const STAMP = Date.now();
const SIGN_IN = `spec-${process.pid}-${Math.random().toString(36).slice(2)}-Aa1!`;

const ROLES = ['owner', 'reader', 'stranger', 'revoked', 'admin'] as const;
type Role = (typeof ROLES)[number];

const EMAIL: Record<Role, string> = {
  owner: `matrix-owner-${STAMP}@cleancore-test.io`,
  reader: `matrix-reader-${STAMP}@cleancore-test.io`,
  stranger: `matrix-stranger-${STAMP}@cleancore-test.io`,
  revoked: `matrix-revoked-${STAMP}@cleancore-test.io`,
  admin: `matrix-admin-${STAMP}@cleancore-test.io`,
};

const PROJECT_ID = `matrix-project-${STAMP}`;
/** A second project of the owner's, so the destructive verb can be proven on something. */
const SACRIFICE_ID = `matrix-sacrifice-${STAMP}`;
const INVITATION: Record<'reader' | 'revoked', string> = {
  reader: `matrix-inv-reader-${STAMP}`,
  revoked: `matrix-inv-revoked-${STAMP}`,
};
/** An invitation id that never existed — the forwarded-link probe (C23-A14). */
const NO_SUCH_INVITATION = `matrix-inv-nowhere-${STAMP}`;

const accounts = {} as Record<Role, { uid: string; token: string; user: User }>;
const headers = (role: Role) => ({
  Authorization: `Bearer ${accounts[role].token}`,
  'Content-Type': 'application/json',
});

const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

test.describe.configure({ mode: 'serial' });

/* ------------------------------------------------------------------ */
/* The catalogue                                                       */
/* ------------------------------------------------------------------ */

type Method = 'GET' | 'POST' | 'DELETE' | 'PUT' | 'PATCH';

interface RouteCase {
  /** `<path relative to the repo, forward slashes>#<METHOD>` — the key the tree check compares against. */
  key: string;
  what: string;
  method: Method;
  path: (projectId: string) => string;
  body?: Record<string, unknown>;
  /**
   * What a role with no claim on this project is told. 404 everywhere under
   * `app/api/projects/[projectId]`: no route says whether the project exists.
   * The one 403 left is the accept route, which answers everyone — the owner
   * included — the same thing and therefore tells nobody anything.
   */
  refusal: number;
  /**
   * What the owner gets once past the gate. Never a success for its own sake:
   * a 400 for an empty body or a 409 for a state that does not exist proves
   * the gate let the caller through, and changes nothing on the way.
   */
  owner: number[] | 'sacrificial' | 'refused';
  /** Does an invited reader get through — and, on a read, the owner's own answer? */
  readerAdmitted: boolean;
}

const CASES: RouteCase[] = [
  {
    key: 'app/api/projects/[projectId]/route.ts#GET',
    what: 'the project and its active run — the reader\'s one door to the evidence',
    method: 'GET',
    path: (p) => `/api/projects/${p}`,
    refusal: 404,
    owner: [200],
    readerAdmitted: true,
  },
  {
    key: 'app/api/projects/[projectId]/route.ts#DELETE',
    what: 'erasing the project and its runs',
    method: 'DELETE',
    path: (p) => `/api/projects/${p}`,
    refusal: 404,
    owner: 'sacrificial',
    readerAdmitted: false,
  },
  {
    key: 'app/api/projects/[projectId]/commands/route.ts#POST',
    what: 'the architecture sign-off and the usage import',
    method: 'POST',
    path: (p) => `/api/projects/${p}/commands`,
    body: { command: 'revoke-architecture' },
    refusal: 404,
    // Nothing to withdraw on a project that was never signed off: `not-approved`.
    owner: [409],
    readerAdmitted: false,
  },
  {
    key: 'app/api/projects/[projectId]/process-map/route.ts#GET',
    what: 'the traceability quote of the process map',
    method: 'GET',
    path: (p) => `/api/projects/${p}/process-map`,
    refusal: 404,
    owner: [200],
    readerAdmitted: true,
  },
  {
    key: 'app/api/projects/[projectId]/process-map/route.ts#POST',
    what: 'measuring the map against the signed source',
    method: 'POST',
    path: (p) => `/api/projects/${p}/process-map`,
    body: {},
    // No active run on this fixture, so the owner is refused for a reason of state.
    refusal: 404,
    owner: [409],
    readerAdmitted: false,
  },
  {
    key: 'app/api/projects/[projectId]/process-naming/route.ts#GET',
    what: 'the business names of the process',
    method: 'GET',
    path: (p) => `/api/projects/${p}/process-naming`,
    refusal: 404,
    owner: [200],
    readerAdmitted: true,
  },
  {
    key: 'app/api/projects/[projectId]/process-naming/route.ts#POST',
    what: 'storing what a model named the process',
    method: 'POST',
    path: (p) => `/api/projects/${p}/process-naming`,
    body: {},
    refusal: 404,
    owner: [400],
    readerAdmitted: false,
  },
  {
    key: 'app/api/projects/[projectId]/process-revisions/route.ts#GET',
    what: 'the revision history of the process model',
    method: 'GET',
    path: (p) => `/api/projects/${p}/process-revisions`,
    refusal: 404,
    owner: [200],
    readerAdmitted: true,
  },
  {
    key: 'app/api/projects/[projectId]/process-revisions/route.ts#POST',
    what: 'reconstructing the Ist and saving a drawing on top of it',
    method: 'POST',
    path: (p) => `/api/projects/${p}/process-revisions`,
    body: {},
    refusal: 404,
    owner: [409],
    readerAdmitted: false,
  },
  {
    key: 'app/api/projects/[projectId]/process-states/route.ts#GET',
    what: 'what the business has confirmed, per element',
    method: 'GET',
    path: (p) => `/api/projects/${p}/process-states`,
    refusal: 404,
    // No revision 1 on this fixture: `no-baseline`. The owner and the reader
    // must be told the same thing, which is what the equality below checks.
    owner: [409],
    readerAdmitted: true,
  },
  {
    key: 'app/api/projects/[projectId]/process-states/route.ts#POST',
    what: 'recording an answer about an element',
    method: 'POST',
    path: (p) => `/api/projects/${p}/process-states`,
    body: { baseRevision: 0, choices: [] },
    refusal: 404,
    owner: [409],
    readerAdmitted: false,
  },
  {
    key: 'app/api/projects/[projectId]/findings/route.ts#GET',
    what: 'the IT view\'s findings — derived from the customer\'s source',
    method: 'GET',
    path: (p) => `/api/projects/${p}/findings`,
    refusal: 404,
    // The fixture stages source, so the findings are derived; owner and reader
    // read the same list.
    owner: [200],
    readerAdmitted: true,
  },
  {
    key: 'app/api/projects/[projectId]/contract/route.ts#GET',
    what: 'the architecture contract the generation follows',
    method: 'GET',
    path: (p) => `/api/projects/${p}/contract`,
    refusal: 404,
    // Source and no run: the contract is derived or refused in its own words,
    // either way an answer with 200. Owner and reader read the same one.
    owner: [200],
    readerAdmitted: true,
  },
  {
    key: 'app/api/projects/[projectId]/contract/route.ts#POST',
    what: 'recording which contract a generated stand was computed against',
    method: 'POST',
    path: (p) => `/api/projects/${p}/contract`,
    body: {},
    refusal: 404,
    // No generated package in the body: the owner is told there is nothing to
    // bind, and nothing is written.
    owner: [400],
    readerAdmitted: false,
  },
  {
    key: 'app/api/projects/[projectId]/repair-drafts/route.ts#POST',
    what: 'proposing or adopting a repair draft (roadmap 8.7)',
    method: 'POST',
    path: (p) => `/api/projects/${p}/repair-drafts`,
    body: { action: 'adopt', draftId: 'none', expectedDraftDigest: 'none' },
    refusal: 404,
    // The owner reaches the project and is told the draft does not exist —
    // the same status as a stranger's refusal, with its own sentence.
    owner: [404],
    readerAdmitted: false,
  },
  {
    key: 'app/api/projects/[projectId]/decision/route.ts#GET',
    what: 'the decision draft — what a confirmation would bind',
    method: 'GET',
    path: (p) => `/api/projects/${p}/decision`,
    refusal: 404,
    // The fixture has source and no run: the draft is derived and blocked,
    // which is an answer, not a failure. Owner and reader read the same one.
    owner: [200],
    readerAdmitted: true,
  },
  {
    key: 'app/api/projects/[projectId]/readers/route.ts#GET',
    what: 'who has Einsicht, and since when — other people\'s addresses',
    method: 'GET',
    path: (p) => `/api/projects/${p}/readers`,
    refusal: 404,
    owner: [200],
    readerAdmitted: false,
  },
  {
    key: 'app/api/projects/[projectId]/readers/route.ts#DELETE',
    what: 'the revocation',
    method: 'DELETE',
    path: (p) => `/api/projects/${p}/readers`,
    body: {},
    refusal: 404,
    // An empty body is refused before anything is revoked: `Missing uid`.
    owner: [400],
    readerAdmitted: false,
  },
  {
    key: 'app/api/projects/[projectId]/invitations/route.ts#POST',
    what: 'handing a third party the ABAP source',
    method: 'POST',
    path: (p) => `/api/projects/${p}/invitations`,
    // The owner's own address: refused as `self-invite` after the gate, so the
    // gate is proven and no mail is sent.
    body: { email: EMAIL.owner },
    refusal: 404,
    owner: [400],
    readerAdmitted: false,
  },
  {
    key: 'app/api/projects/[projectId]/invitations/[invitationId]/accept/route.ts#POST',
    what: 'opening an invitation that never existed — the forwarded link (C23-A14)',
    method: 'POST',
    path: (p) => `/api/projects/${p}/invitations/${NO_SUCH_INVITATION}/accept`,
    // One answer for everyone, the owner included: a link that opens nothing
    // must not tell anybody whether it could have.
    refusal: 403,
    owner: 'refused',
    readerAdmitted: false,
  },
  {
    key: 'app/api/projects/[projectId]/invitations/[invitationId]/accept/route.ts#GET',
    what: 'who sent an invitation and until when (UX-148) — the forwarded link again',
    method: 'GET',
    path: (p) => `/api/projects/${p}/invitations/${NO_SUCH_INVITATION}/accept`,
    // The same one answer as the POST beside it: only the invited, confirmed
    // account learns anything, and this invitation invites nobody.
    refusal: 403,
    owner: 'refused',
    readerAdmitted: false,
  },
];

/** Every `export async function <METHOD>` under `app/api/projects`, read off disk. */
function routeTreeMethods(): string[] {
  const ROOT = path.resolve(__dirname, '..');
  const base = path.join(ROOT, 'app', 'api', 'projects');
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === 'route.ts') {
        const rel = path.relative(ROOT, full).split(path.sep).join('/');
        const source = fs.readFileSync(full, 'utf8');
        for (const m of source.matchAll(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\s*\(/g)) {
          found.push(`${rel}#${m[1]}`);
        }
      }
    }
  };
  walk(base);
  return found.sort();
}

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

async function makeAccount(role: Role): Promise<void> {
  const email = EMAIL[role];
  const cred = await createUserWithEmailAndPassword(getAuth(app), email, SIGN_IN);
  await adminSetDoc('users', cred.user.uid, {
    firstName: 'Matrix',
    lastName: role,
    email,
    tier: 'pilot',
    status: 'approved',
    activatedAt: new Date(),
    transformationsUsed: 0,
    transformationsLimit: 50,
    termsVersionAccepted: TERMS_VERSION,
    mfaEnabled: false,
    createdAt: new Date(),
  });
  await adminSetEmailVerified(cred.user.uid, true);
  // The administrator's claim, and no membership anywhere. `admin` travels
  // inside the ID token, so the token is minted after the claim is set.
  if (role === 'admin') await adminSetCustomClaim(cred.user.uid, { admin: true });
  accounts[role] = { uid: cred.user.uid, token: await cred.user.getIdToken(true), user: cred.user };
}

async function seedInvitation(id: string, email: string): Promise<void> {
  await adminSetDoc(invitationCollectionPath(PROJECT_ID), id, {
    id,
    projectId: PROJECT_ID,
    email: email.toLowerCase(),
    invitedBy: { uid: accounts.owner.uid, name: 'Matrix Owner' },
    invitedAt: new Date().toISOString(),
    expiresAt: new Date(STAMP + 14 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'pending',
    acceptedBy: null,
    acceptedAt: null,
    revokedAt: null,
  });
}

async function readersOf(projectId = PROJECT_ID): Promise<string[]> {
  const project = await adminGetDoc('projects', projectId);
  const readers = project?.[PROJECT_READERS_FIELD];
  return Array.isArray(readers) ? readers : [];
}

async function ask(request: APIRequestContext, role: Role, routeCase: RouteCase, projectId: string) {
  const url = routeCase.path(projectId);
  const options = { headers: headers(role), ...(routeCase.body ? { data: routeCase.body } : {}) };
  return routeCase.method === 'GET'
    ? request.get(url, options)
    : routeCase.method === 'DELETE'
      ? request.delete(url, options)
      : request.post(url, options);
}

async function knock(
  request: APIRequestContext,
  role: Role,
  routeCase: RouteCase,
  projectId = PROJECT_ID,
): Promise<number> {
  return (await ask(request, role, routeCase, projectId)).status();
}

/** The refusal as the caller reads it: the code and the sentence under it. */
async function knockBody(
  request: APIRequestContext,
  role: Role,
  routeCase: RouteCase,
  projectId = PROJECT_ID,
): Promise<string> {
  const res = await ask(request, role, routeCase, projectId);
  return `${res.status()} ${await res.text()}`;
}

test.beforeAll(async () => {
  test.setTimeout(180 * 1000);
  try {
    connectAuthEmulator(getAuth(app), 'http://127.0.0.1:9099', { disableWarnings: true });
  } catch {
    /* already connected */
  }

  for (const role of ROLES) await makeAccount(role);

  for (const id of [PROJECT_ID, SACRIFICE_ID]) {
    await adminSetDoc('projects', id, {
      name: 'Requisition release',
      userId: accounts.owner.uid,
      createdAt: new Date(),
      status: 'analyzed',
      legacyCode: 'REPORT z_matrix_spec.\nWRITE / \'x\'.',
    });
  }

  await seedInvitation(INVITATION.reader, EMAIL.reader);
  await seedInvitation(INVITATION.revoked, EMAIL.revoked);

  // Warm-up, and nothing else: `npm run dev` compiles a route handler the first
  // time it is asked for, and the first request to a cold one can be reset
  // before it answers. That is the dev server, not the route, and it would make
  // this acceptance fail for a reason that is not in its subject. Each module is
  // therefore touched once, without a token, before anything is asserted.
  // Nothing is read from these answers — the assertion that every route refuses
  // an anonymous caller is the *next* test, and it runs against warm modules.
  for (const routeCase of CASES) {
    await fetch(`${BASE_URL}${routeCase.path(PROJECT_ID)}`, {
      method: routeCase.method,
      ...(routeCase.body ? { body: JSON.stringify(routeCase.body), headers: { 'Content-Type': 'application/json' } } : {}),
    }).catch(() => null);
  }
});

test('no token opens nothing, on any route or verb', async ({ request }) => {
  for (const routeCase of CASES) {
    const url = routeCase.path(PROJECT_ID);
    const res =
      routeCase.method === 'GET'
        ? await request.get(url)
        : routeCase.method === 'DELETE'
          ? await request.delete(url)
          : await request.post(url, routeCase.body ? { data: routeCase.body } : {});
    expect(res.status(), `${routeCase.method} ${routeCase.key} answered a caller with no token`).toBe(401);
  }
});

/* ------------------------------------------------------------------ */
/* 1. Completeness                                                     */
/* ------------------------------------------------------------------ */

test('every route and verb under app/api/projects is in this acceptance', () => {
  const onDisk = routeTreeMethods();
  const catalogued = CASES.map((c) => c.key).sort();

  // Derived from the tree, never typed from memory: a route added later is
  // red here on the day it is added, not on the day somebody notices.
  expect(onDisk.length, 'no route files were found — the walk is looking in the wrong place').toBeGreaterThan(5);
  expect(
    onDisk.filter((k) => !catalogued.includes(k)),
    'a route or verb exists that no role is knocked on: add it to CASES',
  ).toEqual([]);
  expect(
    catalogued.filter((k) => !onDisk.includes(k)),
    'this acceptance knocks on a route or verb that no longer exists',
  ).toEqual([]);
});

/* ------------------------------------------------------------------ */
/* 2. The grant                                                        */
/* ------------------------------------------------------------------ */

test('an accepted invitation puts the reader on the one list the rule believes', async ({ request }) => {
  for (const role of ['reader', 'revoked'] as const) {
    const res = await request.post(`/api/projects/${PROJECT_ID}/invitations/${INVITATION[role]}/accept`, {
      headers: headers(role),
    });
    expect(res.status(), `${role} could not accept their own invitation`).toBe(200);
    expect((await res.json()).accepted).toBe(true);
  }

  const readers = await readersOf();
  expect(readers).toContain(accounts.reader.uid);
  expect(readers).toContain(accounts.revoked.uid);
  expect(readers, 'nobody else got on the list').not.toContain(accounts.stranger.uid);
  expect(readers, 'the administrator claim grants no membership').not.toContain(accounts.admin.uid);
});

/* ------------------------------------------------------------------ */
/* 3. The matrix, before the revocation                                */
/* ------------------------------------------------------------------ */

for (const routeCase of CASES) {
  test(`${routeCase.method} ${routeCase.key.replace(/^app\/api|\/route\.ts.*$/g, '')} — ${routeCase.what}`, async ({
    request,
  }) => {
    // The owner, on whatever project the verb can safely be tried on.
    let ownerStatus: number | null = null;
    if (Array.isArray(routeCase.owner)) {
      ownerStatus = await knock(request, 'owner', routeCase);
      expect(ownerStatus, 'the owner was refused their own project').toBe(routeCase.owner[0]);
    } else if (routeCase.owner === 'refused') {
      ownerStatus = await knock(request, 'owner', routeCase);
      expect(ownerStatus, 'this route answers everyone the same, the owner included').toBe(routeCase.refusal);
    }

    // The invited reader: the owner's own answer on a read, the flat refusal on
    // a write. Equality, not "not a refusal" — a reader fobbed off with an
    // empty 200 where the owner got a record has not read the project.
    const readerStatus = await knock(request, 'reader', routeCase);
    if (routeCase.readerAdmitted) {
      expect(readerStatus, 'an invited reader must get exactly what the owner gets').toBe(ownerStatus);
    } else {
      expect(readerStatus, 'a reader reads; a reader does not write, delete, invite or revoke').toBe(
        routeCase.refusal,
      );
    }

    // Never invited, and an administrator who was never invited either. The
    // claim is not a membership: the operator's read of a project was taken
    // away on 16.09.2026 and 5.4 did not give it back.
    for (const role of ['stranger', 'admin'] as const) {
      expect(await knock(request, role, routeCase), `${role} got past the gate`).toBe(routeCase.refusal);
    }
  });
}

test('none of those knocks moved anything — the project and its access list are as they were', async () => {
  const project = await adminGetDoc('projects', PROJECT_ID);
  expect(project, 'the project survived every refused DELETE').not.toBeNull();
  expect(project?.approvedByArchitect, 'no command landed').toBeUndefined();
  expect((await readersOf()).sort()).toEqual([accounts.reader.uid, accounts.revoked.uid].sort());
});

/**
 * What a stranger can find out by asking — measured, not assumed.
 *
 * Nothing, now. Every route under `app/api/projects/[projectId]` refuses a
 * non-member with the same 404 it gives for a project id that was never used,
 * and says in a comment why: *"a 404 that only appears for projects that exist
 * is a way to ask whether one does"* (`app/api/projects/[projectId]/route.ts:56`,
 * `readers/route.ts:144`).
 *
 * Until 23.09.2026 only those two did. The other six answered 404 for a missing
 * project and 403 for one they had found and would not hand over, which is
 * exactly the difference those two routes were written to remove: one request
 * per guessed id told a stranger whether it named a real project. The earlier
 * version of this test held that split as a recorded finding rather than a
 * defect to fix, on the reasoning that closing it would change what the
 * workspace does with a refusal. It does not: no caller of the six compares a
 * status code — `lib/process-states-client.ts:140`, `process-revisions-client.ts:231`
 * and `process-naming-client.ts:84` carry `res.status` into a message and
 * nothing branches on it — so the six were brought in line and this test now
 * holds the result instead of the finding.
 *
 * The list below is therefore exhaustive and `oracle` must stay empty: a route
 * that starts answering 403 on a project it found makes this red on the day it
 * is written, which is the whole point of measuring it rather than trusting the
 * comment at the top of each file.
 */
test('403-vs-404: what a refusal tells a stranger about a project they cannot see', async ({ request }) => {
  const nowhere = `matrix-nowhere-${STAMP}`;
  expect(await adminGetDoc('projects', nowhere), 'the control id must not name a project').toBeNull();

  const uniform: string[] = [];
  const oracle: string[] = [];
  for (const routeCase of CASES) {
    // The accept route answers its own fixed refusal for everything, so it
    // cannot tell anyone anything and is not part of this question.
    if (routeCase.key.includes('/accept/')) continue;
    const existing = await knock(request, 'stranger', routeCase, PROJECT_ID);
    const missing = await knock(request, 'stranger', routeCase, nowhere);
    expect(missing, `${routeCase.key} on an id that names nothing`).toBe(404);
    (existing === missing ? uniform : oracle).push(`${routeCase.key} → ${existing} vs ${missing}`);
  }

  expect(uniform.sort(), 'these routes answer the same for "not there" and "not yours"').toEqual(
    [
      'app/api/projects/[projectId]/route.ts#GET → 404 vs 404',
      'app/api/projects/[projectId]/route.ts#DELETE → 404 vs 404',
      'app/api/projects/[projectId]/readers/route.ts#GET → 404 vs 404',
      'app/api/projects/[projectId]/readers/route.ts#DELETE → 404 vs 404',
      'app/api/projects/[projectId]/commands/route.ts#POST → 404 vs 404',
      'app/api/projects/[projectId]/invitations/route.ts#POST → 404 vs 404',
      'app/api/projects/[projectId]/process-map/route.ts#GET → 404 vs 404',
      'app/api/projects/[projectId]/process-map/route.ts#POST → 404 vs 404',
      'app/api/projects/[projectId]/process-naming/route.ts#GET → 404 vs 404',
      'app/api/projects/[projectId]/process-naming/route.ts#POST → 404 vs 404',
      'app/api/projects/[projectId]/process-revisions/route.ts#GET → 404 vs 404',
      'app/api/projects/[projectId]/process-revisions/route.ts#POST → 404 vs 404',
      'app/api/projects/[projectId]/process-states/route.ts#GET → 404 vs 404',
      'app/api/projects/[projectId]/process-states/route.ts#POST → 404 vs 404',
      'app/api/projects/[projectId]/findings/route.ts#GET → 404 vs 404',
      'app/api/projects/[projectId]/contract/route.ts#GET → 404 vs 404',
      'app/api/projects/[projectId]/contract/route.ts#POST → 404 vs 404',
      'app/api/projects/[projectId]/repair-drafts/route.ts#POST → 404 vs 404',
      'app/api/projects/[projectId]/decision/route.ts#GET → 404 vs 404',
    ].sort(),
  );
  expect(oracle.sort(), 'a route told a stranger whether the project exists').toEqual([]);

  // The status code is the loudest half, not the only one: a fixed code with
  // two different sentences under it is the same oracle read one line lower.
  for (const routeCase of CASES) {
    if (routeCase.key.includes('/accept/')) continue;
    const [existing, missing] = await Promise.all([
      knockBody(request, 'stranger', routeCase, PROJECT_ID),
      knockBody(request, 'stranger', routeCase, nowhere),
    ]);
    expect(existing, `${routeCase.key} words its refusal differently for a project that exists`).toEqual(missing);
  }
});

/* ------------------------------------------------------------------ */
/* 4. The revocation                                                   */
/* ------------------------------------------------------------------ */

test('the revocation is immediate, targeted, and closes every route at once', async ({ request }) => {
  const res = await request.delete(`/api/projects/${PROJECT_ID}/readers`, {
    headers: headers('owner'),
    data: { uid: accounts.revoked.uid },
  });
  expect(res.status()).toBe(200);
  expect(await readersOf()).toEqual([accounts.reader.uid]);

  // No new token, no sign-out, no cache to expire: the very next request is
  // refused, because every route answers off the same field.
  for (const routeCase of CASES) {
    expect(
      await knock(request, 'revoked', routeCase),
      `a revoked reader was still answered by ${routeCase.method} ${routeCase.key}`,
    ).toBe(routeCase.refusal);
  }

  // And it took away one access, not the feature: the other reader is untouched.
  for (const routeCase of CASES.filter((c) => c.readerAdmitted)) {
    expect(
      await knock(request, 'reader', routeCase),
      `revoking one reader closed ${routeCase.key} for the other`,
    ).not.toBe(routeCase.refusal);
  }
});

/**
 * "Generieren, Bestätigen, Signieren und Exportieren bleiben beim Besitzer" (5.4).
 *
 * Two of those four live outside `app/api/projects`, and the completeness check
 * above therefore cannot see them: minting a run and building the signed audit
 * pack both take a `projectId` in the body. A reader who could reach either
 * would be starting an analysis, or exporting somebody else's source under
 * their own name, on a project they were only shown. `/api/export/sign` is not
 * here because it signs bytes it is handed and knows nothing about a project.
 *
 * Only the refusals are knocked on: the owner's way through both is the subject
 * of `tests/full-pipeline.spec.ts` and the audit-pack specs, and running it
 * here would mint a run on the fixture the tests above read.
 */
test('a reader does not start a run and does not export — nor does an administrator', async ({ request }) => {
  const probes = [
    {
      what: 'POST /api/runs/create',
      url: '/api/runs/create',
      body: { projectId: PROJECT_ID, legacyCode: 'REPORT z_matrix_spec.', s4Deployment: 'public', analysis: '{}' },
    },
    { what: 'POST /api/audit-pack/create', url: '/api/audit-pack/create', body: { projectId: PROJECT_ID } },
  ];
  for (const probe of probes) {
    for (const role of ['reader', 'revoked', 'stranger', 'admin'] as const) {
      const res = await request.post(probe.url, { headers: headers(role), data: probe.body });
      expect(res.status(), `${role} got through ${probe.what}`).toBe(403);
    }
  }
});

/* ------------------------------------------------------------------ */
/* 5. The destructive verb                                             */
/* ------------------------------------------------------------------ */

test('the owner deletes their own project, and only that one', async ({ request }) => {
  // Everybody else has already been refused on the shared project above; this
  // is the other half — that the refusal is about them and not about a route
  // that refuses everyone.
  const deleteCase = CASES.find((c) => c.key === 'app/api/projects/[projectId]/route.ts#DELETE')!;
  for (const role of ['reader', 'stranger', 'admin', 'revoked'] as const) {
    expect(await knock(request, role, deleteCase, SACRIFICE_ID), `${role} deleted somebody else's project`).toBe(
      deleteCase.refusal,
    );
  }
  expect(await adminGetDoc('projects', SACRIFICE_ID), 'a refused DELETE still deleted it').not.toBeNull();

  expect(await knock(request, 'owner', deleteCase, SACRIFICE_ID)).toBe(200);
  expect(await adminGetDoc('projects', SACRIFICE_ID)).toBeNull();
  expect(await adminGetDoc('projects', PROJECT_ID), 'the other project went with it').not.toBeNull();
});
