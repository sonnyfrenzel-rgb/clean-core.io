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
    select: () => ({ get: async () => ({ size: childDocs(c).length }) }),
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
    const held = [...store.entries()].filter(([k]) => k.startsWith(heldPrefix)).map(([k, v]) => [heldDocumentPath(k.slice(heldPrefix.length)), v]);
    expect(JSON.stringify(held.sort())).toBe(JSON.stringify(JSON.parse(before).sort()));
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
    expect(record.events.map((e: { kind: string }) => e.kind)).toEqual(['blocked', 'police-informed', 'retention-extended', 'authority-decision', 'deleted']);
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

test('the account reads why its project is gone, and that it cannot delete it while it is held', () => {
  const s = contentBlockSentence({ holdId: 'h', projectId: 'p1', blockedAt: '2026-11-10T00:00:00.000Z', status: 'blocked', deletedAt: null });
  expect(s).toContain('Project p1 is blocked since 2026-11-10');
  expect(s).toMatch(/nobody can open it, this account included/);
  expect(s).toMatch(/cannot be deleted from here while it is retained/);
  expect(read('app/(app)/dashboard/page.tsx')).toContain('<ContentBlockNotice profile={profile} />');
  expect(contentBlocksOfProfile({ contentBlocks: { x: { projectId: 1 } } })).toEqual([]);
});
