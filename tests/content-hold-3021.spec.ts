import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  CONTENT_HOLD_COLLECTION,
  HELD_DOCUMENTS,
  HOLD_RETENTION_DAYS,
  blockProjectContent,
  contentBlockSentence,
  contentBlocksOfProfile,
  deleteHeldContent,
  extendHoldRetention,
  heldDocumentId,
  heldDocumentPath,
  heldContentOf,
  HELD_FORMAT,
  HOLD_TTL_FALLBACK_DAYS,
  holdTtlFallbackAt,
  pathBlockedFromCopy,
  unreleasedHeldProjectIds,
  holdDeletionRefusal,
  holdDue,
  holdOfStored,
  holdRetainUntil,
  listContentHolds,
  recordAuthorityDecision,
  recordPoliceInformed,
  releaseHeldContent,
  type ContentHold,
} from '../lib/content-hold';

/**
 * Legal texts Fassung 1.1 — reported illegal content is blocked and kept
 * unchanged, never deleted at once (Terms section 7, /report, privacy policy
 * sections 2, 6 and 8). Server-free: `lib/content-hold.ts` against an
 * in-memory stand-in for the Admin SDK, plus source guards on the route, the
 * console and the erasure. The rendered half (dashboard notice, admin console)
 * is named in the merge report.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const DAY = 24 * 60 * 60 * 1000;

/* ------------------------------------------------ a small Firestore stand-in */

const DELETE = Symbol('delete');
const FieldValue = {
  arrayUnion: (...items: unknown[]) => ({ __union: items }),
  delete: () => DELETE,
};

function makeDb() {
  const store = new Map<string, Record<string, any>>();
  const clone = (v: unknown) => JSON.parse(JSON.stringify(v));
  let auto = 0;
  const reads: string[] = [];

  const docRef = (p: string): any => ({
    path: p,
    id: p.split('/').pop(),
    get: async () => {
      reads.push(p);
      return snap(p);
    },
    set: async (data: any) => void store.set(p, clone(data)),
    update: async (patch: Record<string, any>) => applyUpdate(p, patch),
    collection: (name: string) => colRef(`${p}/${name}`),
    listCollections: async () => {
      const names = new Set<string>();
      for (const k of store.keys()) {
        if (k.startsWith(`${p}/`)) names.add(k.slice(p.length + 1).split('/')[0]);
      }
      return [...names].map((n) => colRef(`${p}/${n}`));
    },
  });
  const snap = (p: string) => ({ exists: store.has(p), id: p.split('/').pop(), ref: docRef(p), data: () => (store.has(p) ? clone(store.get(p)) : undefined) });
  const childDocs = (c: string) => [...store.keys()].filter((k) => k.startsWith(`${c}/`) && !k.slice(c.length + 1).includes('/'));
  const colRef = (c: string): any => ({
    path: c,
    doc: (id?: string) => docRef(`${c}/${id ?? `auto${++auto}`}`),
    listDocuments: async () => childDocs(c).map((k) => docRef(k)),
    get: async () => ({ docs: childDocs(c).map((k) => snap(k)), size: childDocs(c).length }),
    // `select()` reads ids only: the stand-in hands out refs, never data.
    select: () => {
      const idsOnly = (keys: string[]) => ({ size: keys.length, empty: keys.length === 0, docs: keys.map((k) => ({ id: k.split('/').pop(), ref: docRef(k) })) });
      return { get: async () => idsOnly(childDocs(c)), limit: (n: number) => ({ get: async () => idsOnly(childDocs(c).slice(0, n)) }) };
    },
    orderBy: () => ({ limit: () => ({ get: async () => ({ docs: childDocs(c).map((k) => snap(k)) }) }) }),
  });
  const applyUpdate = (p: string, patch: Record<string, any>) => {
    if (!store.has(p)) throw new Error(`no document ${p}`);
    const d = store.get(p)!;
    for (const [key, value] of Object.entries(patch)) {
      const parts = key.split('.');
      let target = d;
      for (const part of parts.slice(0, -1)) target = target[part] ??= {};
      const last = parts[parts.length - 1];
      if (value === DELETE) delete target[last];
      else if (value && typeof value === 'object' && '__union' in value) target[last] = [...(target[last] ?? []), ...clone((value as any).__union)];
      else target[last] = value instanceof Date ? value.toISOString() : clone(value);
    }
  };
  const db = {
    collection: (name: string) => colRef(name),
    doc: (p: string) => docRef(p),
    getAll: async (...refs: any[]) => refs.map((r) => snap(r.path)),
    batch: () => {
      const ops: Array<() => void> = [];
      return {
        set: (ref: any, data: any) => ops.push(() => store.set(ref.path, clone(data))),
        update: (ref: any, patch: Record<string, any>) => ops.push(() => applyUpdate(ref.path, patch)),
        commit: async () => ops.forEach((o) => o()),
      };
    },
    recursiveDelete: async (ref: any) => {
      for (const k of [...store.keys()]) if (k === ref.path || k.startsWith(`${ref.path}/`)) store.delete(k);
    },
  };
  return { db, store, reads };
}

function seed() {
  const env = makeDb();
  const { store } = env;
  store.set('users/owner1', { firstName: 'O', status: 'approved' });
  store.set('projects/p1', { userId: 'owner1', name: 'Z_REPORTED', legacyCode: 'REPORT z. WRITE 1.', readers: ['reader1'] });
  store.set('projects/p1/runs/r1', { userId: 'owner1', evidenceReport: [{ kind: 'x' }] });
  store.set('projects/p1/invitations/i1', { email: 'reader@example.test' });
  store.set('projects/other', { userId: 'owner1', name: 'untouched' });
  return env;
}

/* ------------------------------------------------------------------ tests */

test.describe('blocking moves the project out of everyone\'s reach, unchanged', () => {
  test('every document of the project is held byte for byte, and the original is gone', async () => {
    const { db, store } = seed();
    const before = JSON.stringify([...store.entries()].filter(([k]) => k.startsWith('projects/p1')));
    const hold = await blockProjectContent(db, FieldValue, 'admin1', { projectId: 'p1', criminalSuspicion: true, csamSuspicion: false });
    expect(hold.status).toBe('blocked');
    expect(hold.documentCount).toBe(3);
    // Nothing of the project is left where the owner, a reader, a portfolio or the delete route look.
    expect([...store.keys()].filter((k) => k.startsWith('projects/p1'))).toEqual([]);
    expect(store.has('projects/other')).toBe(true);
    // Held unchanged, each under its own path.
    const heldPrefix = `${CONTENT_HOLD_COLLECTION}/${hold.id}/${HELD_DOCUMENTS}/`;
    const held = [...store.entries()].filter(([k]) => k.startsWith(heldPrefix)).map(([k, v]) => [heldDocumentPath(k.slice(heldPrefix.length)), heldContentOf(v)]);
    expect(JSON.stringify(held.sort())).toBe(JSON.stringify(JSON.parse(before).sort()));
    // B7: the content sits unchanged under `heldDocument`, the TTL field beside it, unset until the police notice.
    for (const [k, v] of store.entries()) if (k.startsWith(heldPrefix)) expect(v).toMatchObject({ heldFormat: HELD_FORMAT, expiresAt: null });
    // The invitation keeps its own `expiresAt`-free shape: nothing was added to the content.
    expect(heldContentOf(store.get(`${heldPrefix}${heldDocumentId('projects/p1/invitations/i1')}`)!)).toEqual({ email: 'reader@example.test' });
    // The account is told, by id only — never the name, which can be the reported content.
    const profile = store.get('users/owner1');
    expect(contentBlocksOfProfile(profile)).toEqual([{ holdId: hold.id, projectId: 'p1', blockedAt: hold.blockedAt, status: 'blocked', deletedAt: null }]);
    expect(JSON.stringify(profile)).not.toContain('Z_REPORTED');
    // The evidence log starts with the block, dated.
    expect(store.get(`${CONTENT_HOLD_COLLECTION}/${hold.id}`)?.events[0]).toMatchObject({ kind: 'blocked', by: 'admin1', detail: 'criminal-suspicion' });
  });

  test('a CSAM suspicion is always a suspected offence', async () => {
    const { db } = seed();
    const hold = await blockProjectContent(db, FieldValue, 'admin1', { projectId: 'p1', criminalSuspicion: false, csamSuspicion: true });
    expect(hold.criminalSuspicion).toBe(true);
    expect(hold.csamSuspicion).toBe(true);
  });

  test('the held paths survive the account erasure: no subcollection the erasure sweeps by collection group', () => {
    expect(HELD_DOCUMENTS).not.toMatch(/^(runs|invitations)$/);
    const admin = read('lib/firebase-admin.ts');
    const erase = admin.slice(admin.indexOf('export async function deleteUserDataAndAccount'), admin.indexOf('export async function deleteUserDataAndAccount') + 20000);
    expect(erase).not.toContain(CONTENT_HOLD_COLLECTION);
    expect(erase).not.toContain(`collectionGroup('${HELD_DOCUMENTS}')`);
    expect(heldDocumentPath(heldDocumentId('projects/a/runs/b'))).toBe('projects/a/runs/b');
    expect(heldDocumentId('projects/a/runs/b')).not.toContain('/');
  });
});

test.describe('retention: kept until the authority decides, at most 90 days after it was informed', () => {
  test('with a suspected offence: no deletion before the police were informed, then not before decision or day 90', async () => {
    const { db, store } = seed();
    const hold = await blockProjectContent(db, FieldValue, 'admin1', { projectId: 'p1', criminalSuspicion: true, csamSuspicion: false });
    const t0 = Date.parse('2026-11-10T00:00:00.000Z');
    await expect(deleteHeldContent(db, FieldValue, 'admin1', hold.id, new Date(t0))).rejects.toMatchObject({ code: 'content-hold-not-yet' });
    await recordPoliceInformed(db, FieldValue, 'admin1', hold.id, '2026-11-10');
    let h = holdOfStored(hold.id, store.get(`${CONTENT_HOLD_COLLECTION}/${hold.id}`)!);
    expect(holdRetainUntil(h)).toBe(new Date(t0 + HOLD_RETENTION_DAYS * DAY).toISOString());
    expect(holdDeletionRefusal(h, t0 + 89 * DAY)).not.toBeNull();
    expect(holdDue(h, t0 + 90 * DAY)).toBe(true);
    // The authority asks for longer: not due on day 90 any more.
    await extendHoldRetention(db, FieldValue, 'admin1', hold.id, '2027-03-01');
    h = holdOfStored(hold.id, store.get(`${CONTENT_HOLD_COLLECTION}/${hold.id}`)!);
    expect(holdDue(h, t0 + 90 * DAY)).toBe(false);
    // It decides: deletion is allowed at once, and recorded with its date.
    await recordAuthorityDecision(db, FieldValue, 'admin1', hold.id, 'secured', '2026-12-01');
    const deleted = await deleteHeldContent(db, FieldValue, 'admin1', hold.id, new Date('2026-12-02T00:00:00.000Z'));
    expect(deleted.status).toBe('deleted');
    expect([...store.keys()].some((k) => k.includes(`/${HELD_DOCUMENTS}/`))).toBe(false);
    const record = store.get(`${CONTENT_HOLD_COLLECTION}/${hold.id}`)!;
    // B7: the TTL fallback is logged when it is set (police notice) and when it moves (extension).
    expect(record.events.map((e: { kind: string }) => e.kind)).toEqual(['blocked', 'police-informed', 'ttl-fallback-set', 'retention-extended', 'ttl-fallback-set', 'authority-decision', 'deleted']);
    expect(record.events.find((e: { kind: string }) => e.kind === 'police-informed').at).toBe('2026-11-10T00:00:00.000Z');
    expect(record.deletedAt).toBe('2026-12-02T00:00:00.000Z');
    // The record of the block (no content) is kept six months after the deletion.
    expect(record.expiresAt).toBe('2027-06-02T00:00:00.000Z');
    expect(contentBlocksOfProfile(store.get('users/owner1'))[0]).toMatchObject({ status: 'deleted', deletedAt: '2026-12-02T00:00:00.000Z' });
  });

  test('content held on a suspected offence is never released; without suspicion it is put back unchanged', async () => {
    const a = seed();
    const criminal = await blockProjectContent(a.db, FieldValue, 'admin1', { projectId: 'p1', criminalSuspicion: true, csamSuspicion: false });
    await expect(releaseHeldContent(a.db, FieldValue, 'admin1', criminal.id)).rejects.toMatchObject({ code: 'content-hold-no-release' });

    const b = seed();
    const before = JSON.stringify([...b.store.entries()].filter(([k]) => k.startsWith('projects/p1')).sort());
    const plain = await blockProjectContent(b.db, FieldValue, 'admin1', { projectId: 'p1', criminalSuspicion: false, csamSuspicion: false });
    await releaseHeldContent(b.db, FieldValue, 'admin1', plain.id);
    expect(JSON.stringify([...b.store.entries()].filter(([k]) => k.startsWith('projects/p1')).sort())).toBe(before);
    expect(contentBlocksOfProfile(b.store.get('users/owner1'))).toEqual([]);
    expect(b.store.get(`${CONTENT_HOLD_COLLECTION}/${plain.id}`)?.status).toBe('released');
  });
});

test.describe('no viewing, no copy, no export', () => {
  test('the console lists hold records only — never a held document', async () => {
    const { db, reads } = seed();
    const hold = await blockProjectContent(db, FieldValue, 'admin1', { projectId: 'p1', criminalSuspicion: true, csamSuspicion: true });
    reads.length = 0;
    const list: ContentHold[] = await listContentHolds(db);
    expect(list.map((h) => h.id)).toEqual([hold.id]);
    expect(JSON.stringify(list)).not.toContain('REPORT z.');
    expect(JSON.stringify(list)).not.toContain('Z_REPORTED');
    expect(reads.filter((p) => p.includes(HELD_DOCUMENTS))).toEqual([]);
  });

  test('no route, page or component reads held documents except the module that moves them', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(rel);
        else if (/\.(ts|tsx)$/.test(e.name) && rel !== 'lib/content-hold.ts' && /collection\(\s*(HELD_DOCUMENTS|['"`]held_documents['"`])|collectionGroup\(\s*(HELD_DOCUMENTS|['"`]held_documents)/.test(read(rel))) offenders.push(rel);
      }
    };
    for (const d of ['app', 'components', 'lib', 'hooks']) walk(d);
    expect(offenders).toEqual([]);
    // The route answers with hold records, and has no action that returns content.
    const route = read('app/api/admin/content-holds/route.ts');
    expect(route).toContain('assertAdminStepUp(req, admin)');
    expect(route).not.toMatch(/case '(view|export|download|show)'/);
    // `content_holds` stays closed to every browser: no rule names it.
    expect(read('firestore.rules')).not.toContain(CONTENT_HOLD_COLLECTION);
  });
});

test.describe('B7 — the TTL fallback, about 7 days after the maximum period (legal review 06.11.2026)', () => {
  test('set on every held document as expiresAt when the police notice is recorded, moved by an extension, logged each time', async () => {
    const { db, store } = seed();
    const hold = await blockProjectContent(db, FieldValue, 'admin1', { projectId: 'p1', criminalSuspicion: true, csamSuspicion: false });
    const heldPrefix = `${CONTENT_HOLD_COLLECTION}/${hold.id}/${HELD_DOCUMENTS}/`;
    const heldDocs = () => [...store.entries()].filter(([k]) => k.startsWith(heldPrefix)).map(([, v]) => v);
    const t0 = Date.parse('2026-11-10T00:00:00.000Z');
    const set = await recordPoliceInformed(db, FieldValue, 'admin1', hold.id, '2026-11-10');
    const expected = new Date(t0 + (HOLD_RETENTION_DAYS + HOLD_TTL_FALLBACK_DAYS) * DAY).toISOString();
    expect(HOLD_TTL_FALLBACK_DAYS).toBe(7);
    expect(set.ttlFallbackAt).toBe(expected);
    expect(holdTtlFallbackAt(set)).toBe(expected);
    expect(heldDocs()).toHaveLength(3);
    for (const d of heldDocs()) expect(d.expiresAt).toBe(expected);
    const record = () => store.get(`${CONTENT_HOLD_COLLECTION}/${hold.id}`)!;
    expect(record().ttlFallbackAt).toBe(expected);
    expect(record().events.at(-1)).toMatchObject({ kind: 'ttl-fallback-set', by: 'admin1', detail: expected.slice(0, 10) });
    // The authority asks for longer: the fallback moves with it.
    await extendHoldRetention(db, FieldValue, 'admin1', hold.id, '2027-03-01');
    const moved = new Date(Date.parse('2027-03-01T00:00:00.000Z') + HOLD_TTL_FALLBACK_DAYS * DAY).toISOString();
    for (const d of heldDocs()) expect(d.expiresAt).toBe(moved);
    expect(record().events.filter((e: { kind: string }) => e.kind === 'ttl-fallback-set')).toHaveLength(2);
    // The content itself is untouched by it.
    for (const d of heldDocs()) expect(JSON.stringify(heldContentOf(d))).not.toContain('expiresAt');
  });

  test('none without a suspected offence, and none before the police notice', async () => {
    const { db, store } = seed();
    const hold = await blockProjectContent(db, FieldValue, 'admin1', { projectId: 'p1', criminalSuspicion: false, csamSuspicion: false });
    expect(hold.ttlFallbackAt).toBeNull();
    expect(holdTtlFallbackAt({ criminalSuspicion: true, policeInformedAt: null, extendedUntil: null })).toBeNull();
    expect(holdOfStored(hold.id, store.get(`${CONTENT_HOLD_COLLECTION}/${hold.id}`)!).ttlState).toBe('none');
  });

  test('the console shows "deleted by TTL fallback" when no held document is left after that time', async () => {
    const { db, store } = seed();
    const hold = await blockProjectContent(db, FieldValue, 'admin1', { projectId: 'p1', criminalSuspicion: true, csamSuspicion: false });
    const fallback = (await recordPoliceInformed(db, FieldValue, 'admin1', hold.id, '2026-11-10')).ttlFallbackAt!;
    const after = Date.parse(fallback) + DAY;
    expect((await listContentHolds(db, Date.parse(fallback) - DAY))[0].ttlState).toBe('set');
    // Documents still there after the time (TTL runs within about a day): still "set".
    expect((await listContentHolds(db, after))[0].ttlState).toBe('set');
    // Firestore's TTL removed them.
    for (const k of [...store.keys()]) if (k.includes(`/${HELD_DOCUMENTS}/`)) store.delete(k);
    expect((await listContentHolds(db, after))[0].ttlState).toBe('deleted-by-ttl');
    const panel = read('components/admin/ContentHoldPanel.tsx');
    expect(panel).toContain("r.ttlState === 'deleted-by-ttl'");
    expect(panel).toContain('Deleted by TTL fallback');
  });

  test('a released hold puts back the content alone, in either layout', () => {
    expect(heldContentOf({ heldFormat: HELD_FORMAT, heldDocument: { a: 1 }, expiresAt: null })).toEqual({ a: 1 });
    // A document held before B7 is the content itself.
    expect(heldContentOf({ a: 1, expiresAt: 'x' })).toEqual({ a: 1, expiresAt: 'x' });
  });
});

test.describe('B3 — held content never comes back from a copy', () => {
  test('the one path that copies between databases skips a held project and the holds', () => {
    const held = unreleasedHeldProjectIds([
      { projectId: 'p1', status: 'blocked' },
      { projectId: 'p2', status: 'deleted' },
      { projectId: 'p3', status: 'released' },
      { projectId: 'p4', status: 'moving' },
    ]);
    expect([...held].sort()).toEqual(['p1', 'p2', 'p4']);
    expect(pathBlockedFromCopy('projects/p1', held)).toBe(true);
    expect(pathBlockedFromCopy('projects/p1/runs/r1', held)).toBe(true);
    expect(pathBlockedFromCopy('projects/p2/invitations/i', held)).toBe(true);
    expect(pathBlockedFromCopy('projects/p3', held)).toBe(false);
    expect(pathBlockedFromCopy('projects/other', held)).toBe(false);
    expect(pathBlockedFromCopy(`${CONTENT_HOLD_COLLECTION}/h1`, held)).toBe(true);
    expect(pathBlockedFromCopy(`${CONTENT_HOLD_COLLECTION}/h1/${HELD_DOCUMENTS}/x`, held)).toBe(true);
    expect(pathBlockedFromCopy('users/u1', held)).toBe(false);
    const sync = read('scripts/firestore-delta-sync.ts');
    expect(sync).toContain('if (pathBlockedFromCopy(tgtRef.path, held)) {');
    // What is held is read from the target, never from the copy.
    expect(sync).toContain('const held = unreleasedHeldProjectIds((await tgtDb.collection(CONTENT_HOLD_COLLECTION).get())');
    expect(sync.indexOf('if (pathBlockedFromCopy(tgtRef.path, held)) {')).toBeLessThan(sync.indexOf('switch (reconcile('));
  });

  test('no route restores a project or a revision from a backup', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(rel);
        else if (/\.(ts|tsx)$/.test(e.name) && /\brestoreDatabase|\bimportDocuments\b|\bbackups\b.*\brestore\b|\brestoreProject|\brestoreRevision/.test(read(rel))) offenders.push(rel);
      }
    };
    for (const d of ['app', 'components', 'lib', 'hooks']) walk(d);
    expect(offenders).toEqual([]);
  });
});

test('the account reads why its project is gone, and that it cannot delete it while it is held', () => {
  const s = contentBlockSentence({ holdId: 'h', projectId: 'p1', blockedAt: '2026-11-10T00:00:00.000Z', status: 'blocked', deletedAt: null });
  expect(s).toContain('Project p1 is blocked since 2026-11-10');
  expect(s).toMatch(/nobody can open it, this account included/);
  expect(s).toMatch(/cannot be deleted from here while it is retained/);
  expect(read('app/(app)/dashboard/page.tsx')).toContain('<ContentBlockNotice profile={profile} />');
  expect(contentBlocksOfProfile({ contentBlocks: { x: { projectId: 1 } } })).toEqual([]);
});
