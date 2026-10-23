import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  acceptSelectionInvitation,
  createSelectionInvitation,
  releaseSelectionProjects,
  selectionSharing,
  updateSelectionProjects,
  withdrawSelectionInvitation,
} from '../lib/portfolio/selection-invitations';
import { readSelection, readerProjectIds } from '../lib/portfolio/selection-store';
import { erasePortfolioOf } from '../lib/portfolio/erasure';

/**
 * Portfolio sharing never extends silently — owner decision 23.10.2026 after
 * the lawyer's feedback. An invitation binds to the selection's project ids at
 * the moment it is sent; a project the owner adds later stays invisible to
 * readers until the owner releases it; a project removed is gone for them at
 * once, and adding it back does not return it.
 *
 * Server-free: the store runs against a stand-in Firestore.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

const fieldValue = {
  arrayUnion: (v: string) => ({ op: 'union', v }),
  arrayRemove: (v: string) => ({ op: 'remove', v }),
  delete: () => ({ op: 'delete' }),
};

type Doc = Record<string, unknown>;

class FakeDb {
  docs = new Map<string, Doc>();
  seq = 0;
  collection(p: string) {
    return new FakeCol(this, p);
  }
  async getAll(...refs: (FakeDoc | { fieldMask: string[] })[]) {
    return Promise.all(refs.filter((r): r is FakeDoc => r instanceof FakeDoc).map((r) => r.get()));
  }
  async runTransaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
    const tx = {
      get: (r: { get: () => Promise<unknown> }) => r.get(),
      update: (r: FakeDoc, d: Doc) => r.applyUpdate(d),
      create: (r: FakeDoc, d: Doc) => r.applyCreate(d),
    };
    return fn(tx);
  }
  batch() {
    const ops: (() => void)[] = [];
    return {
      update: (r: FakeDoc, d: Doc) => ops.push(() => r.applyUpdate(d)),
      commit: async () => ops.forEach((op) => op()),
    };
  }
  async recursiveDelete(ref: FakeDoc) {
    for (const k of [...this.docs.keys()]) if (k === ref.path || k.startsWith(`${ref.path}/`)) this.docs.delete(k);
  }
}

class FakeCol {
  constructor(
    readonly db: FakeDb,
    readonly path: string,
    readonly filters: ((d: Doc) => boolean)[] = [],
    readonly max = Infinity,
  ) {}
  doc(id?: string) {
    return new FakeDoc(this.db, `${this.path}/${id ?? `auto${++this.db.seq}`}`);
  }
  where(field: string, op: string, value: unknown) {
    const f = (d: Doc) => {
      const v = d[field];
      if (op === '==') return v === value;
      if (op === '>') return String(v) > String(value);
      if (op === 'array-contains') return Array.isArray(v) && v.includes(value);
      throw new Error(`op ${op}`);
    };
    return new FakeCol(this.db, this.path, [...this.filters, f], this.max);
  }
  limit(n: number) {
    return new FakeCol(this.db, this.path, this.filters, n);
  }
  get parent() {
    return this;
  }
  async get() {
    const docs = [...this.db.docs.entries()]
      .filter(([k]) => k.startsWith(`${this.path}/`) && !k.slice(this.path.length + 1).includes('/'))
      .filter(([, d]) => this.filters.every((f) => f(d)))
      .slice(0, this.max)
      .map(([k, d]) => ({ id: k.split('/').pop()!, ref: new FakeDoc(this.db, k), data: () => structuredClone(d) }));
    return { docs, size: docs.length };
  }
}

class FakeDoc {
  constructor(
    readonly db: FakeDb,
    readonly path: string,
  ) {}
  get id() {
    return this.path.split('/').pop()!;
  }
  get parent() {
    return new FakeCol(this.db, this.path.split('/').slice(0, -1).join('/'));
  }
  collection(name: string) {
    return new FakeCol(this.db, `${this.path}/${name}`);
  }
  async get() {
    const d = this.db.docs.get(this.path);
    return { exists: Boolean(d), id: this.id, ref: this, data: () => (d ? structuredClone(d) : undefined) };
  }
  applyCreate(d: Doc) {
    if (this.db.docs.has(this.path)) throw new Error(`exists: ${this.path}`);
    this.db.docs.set(this.path, structuredClone(d));
  }
  applyUpdate(d: Doc) {
    const cur = this.db.docs.get(this.path);
    if (!cur) throw new Error(`missing: ${this.path}`);
    for (const [k, v] of Object.entries(d)) {
      const op = v as { op?: string; v?: string };
      const list = Array.isArray(cur[k]) ? (cur[k] as string[]) : [];
      if (op && op.op === 'union') cur[k] = [...new Set([...list, op.v!])];
      else if (op && op.op === 'remove') cur[k] = list.filter((x) => x !== op.v);
      else if (op && op.op === 'delete') delete cur[k];
      else cur[k] = structuredClone(v);
    }
  }
  async update(d: Doc) {
    this.applyUpdate(d);
  }
}

const OWNER = { uid: 'owner1', email: 'owner@example.com', name: 'Owner' };
const READER = { uid: 'reader1', email: 'reader@example.com' };
const LATER = { uid: 'reader2', email: 'later@example.com' };

function seeded() {
  const db = new FakeDb();
  for (const id of ['pA', 'pB', 'pC', 'pD']) db.docs.set(`projects/${id}`, { userId: OWNER.uid, name: `Z_${id}` });
  db.docs.set('projects/pForeign', { userId: 'someoneElse', name: 'Z_FOREIGN' });
  db.docs.set('portfolio_selections/sel1', {
    ownerId: OWNER.uid,
    name: 'Finance',
    projectIds: ['pA', 'pB'],
    createdAt: 1,
    readers: [],
    readerScopes: {},
  });
  return db;
}

async function invited(db: FakeDb, who: { uid: string; email: string }) {
  const inv = await createSelectionInvitation(db as never, OWNER, 'sel1', { email: who.email });
  const accepted = await acceptSelectionInvitation(db as never, fieldValue as never, who, 'sel1', inv.id);
  expect(accepted).toMatchObject({ already: false });
  return inv;
}

async function seenBy(db: FakeDb, uid: string) {
  const selection = (await readSelection(db as never, 'sel1'))!;
  return readerProjectIds(selection, uid);
}

test.describe('portfolio sharing never extends silently', () => {
  test('an invitation binds to the project ids at the moment it is sent, and accepting keeps that snapshot', async () => {
    const db = seeded();
    const inv = await createSelectionInvitation(db as never, OWNER, 'sel1', { email: READER.email });
    expect(db.docs.get(`portfolio_selections/sel1/invitations/${inv.id}`)!.projectIds).toEqual(['pA', 'pB']);
    // The owner adds a project while the invitation waits: the waiting invitation does not grow.
    await updateSelectionProjects(db as never, OWNER.uid, 'sel1', { projectIds: ['pA', 'pB', 'pC'] });
    await acceptSelectionInvitation(db as never, fieldValue as never, READER, 'sel1', inv.id);
    expect(await seenBy(db, READER.uid)).toEqual(['pA', 'pB']);
    expect(await seenBy(db, OWNER.uid)).toEqual(['pA', 'pB', 'pC']);
  });

  test('a project added later is invisible to existing readers until the owner releases it', async () => {
    const db = seeded();
    await invited(db, READER);
    await updateSelectionProjects(db as never, OWNER.uid, 'sel1', { projectIds: ['pA', 'pB', 'pC'] });
    expect(await seenBy(db, READER.uid)).toEqual(['pA', 'pB']);

    const sharing = await selectionSharing(db as never, OWNER.uid, 'sel1');
    expect(sharing.unreleased).toEqual(['pC']);
    expect(sharing.readers[0]).toMatchObject({ email: READER.email, projectIds: ['pA', 'pB'] });

    await releaseSelectionProjects(db as never, OWNER.uid, 'sel1');
    expect(await seenBy(db, READER.uid)).toEqual(['pA', 'pB', 'pC']);
    expect((await selectionSharing(db as never, OWNER.uid, 'sel1')).unreleased).toEqual([]);
  });

  test('a new invitation sees the list as it is when sent; the earlier reader still does not', async () => {
    const db = seeded();
    await invited(db, READER);
    await updateSelectionProjects(db as never, OWNER.uid, 'sel1', { projectIds: ['pA', 'pB', 'pD'] });
    await invited(db, LATER);
    expect(await seenBy(db, LATER.uid)).toEqual(['pA', 'pB', 'pD']);
    expect(await seenBy(db, READER.uid)).toEqual(['pA', 'pB']);
  });

  test('removing a project removes it for readers at once, and adding it back does not return it', async () => {
    const db = seeded();
    const waiting = await createSelectionInvitation(db as never, OWNER, 'sel1', { email: LATER.email });
    await invited(db, READER);
    await updateSelectionProjects(db as never, OWNER.uid, 'sel1', { projectIds: ['pA'] });
    expect(await seenBy(db, READER.uid)).toEqual(['pA']);
    expect(db.docs.get(`portfolio_selections/sel1/invitations/${waiting.id}`)!.projectIds).toEqual(['pA']);

    await updateSelectionProjects(db as never, OWNER.uid, 'sel1', { projectIds: ['pA', 'pB'] });
    expect(await seenBy(db, READER.uid)).toEqual(['pA']);
    await acceptSelectionInvitation(db as never, fieldValue as never, LATER, 'sel1', waiting.id);
    expect(await seenBy(db, LATER.uid)).toEqual(['pA']);
  });

  test("the reader's overview reads only the snapshot", async () => {
    const db = seeded();
    await invited(db, READER);
    await updateSelectionProjects(db as never, OWNER.uid, 'sel1', { projectIds: ['pA', 'pB', 'pC'] });
    const src = read('lib/portfolio/selection-store.ts');
    // The one place the overview of a selection takes its ids from.
    expect(src).toContain('const ids = readerProjectIds(selection, viewerUid).filter((id) => isFirestoreId(id));');
    expect(src).not.toMatch(/overviewOfSelection[\s\S]{0,300}selection\.projectIds\.filter/);
    expect(await seenBy(db, 'stranger')).toEqual([]);
  });

  test('the owner edits only their own projects; a foreign id is left out', async () => {
    const db = seeded();
    const answer = await updateSelectionProjects(db as never, OWNER.uid, 'sel1', { projectIds: ['pA', 'pForeign'] });
    expect(answer.projectIds).toEqual(['pA']);
    await expect(updateSelectionProjects(db as never, 'someoneElse', 'sel1', { projectIds: ['pForeign'] })).rejects.toThrow('No such selection.');
    await expect(releaseSelectionProjects(db as never, 'someoneElse', 'sel1')).rejects.toThrow('No such selection.');
  });

  test('a reader accepted before snapshots existed keeps the list as it stood when the owner edits it', async () => {
    const db = seeded();
    Object.assign(db.docs.get('portfolio_selections/sel1')!, { readers: [READER.uid] });
    delete db.docs.get('portfolio_selections/sel1')!.readerScopes;
    expect(await seenBy(db, READER.uid)).toEqual(['pA', 'pB']);
    await updateSelectionProjects(db as never, OWNER.uid, 'sel1', { projectIds: ['pA', 'pB', 'pC'] });
    expect(await seenBy(db, READER.uid)).toEqual(['pA', 'pB']);
  });

  test('withdrawing and erasing take the scope with the reader', async () => {
    const db = seeded();
    const inv = await invited(db, READER);
    await invited(db, LATER);
    await withdrawSelectionInvitation(db as never, fieldValue as never, OWNER.uid, 'sel1', inv.id);
    const after = db.docs.get('portfolio_selections/sel1')!;
    expect(after.readers).toEqual([LATER.uid]);
    expect(Object.keys(after.readerScopes as object)).toEqual([LATER.uid]);
    await erasePortfolioOf(db as never, fieldValue as never, LATER.uid);
    expect(db.docs.get('portfolio_selections/sel1')!.readerScopes).toEqual({});
  });

  test('the owner can change the list and release it through the selection route, behind the access gate', () => {
    const src = read('app/api/portfolio/selections/[selectionId]/route.ts');
    expect(src).toMatch(/export async function PATCH[\s\S]*openPortfolioRoute\(req, \{ bucket: 'portfolio-upload', perHour: 120 \}\)/);
    expect(src).toContain("body?.action === 'release'");
    const panel = read('components/portfolio/SharePanel.tsx');
    expect(panel).toContain('data-portfolio-share-unreleased');
    expect(panel).toContain("wt('portfolio.shareRelease')");
    expect(panel).toContain('portfolioReaderSees(');
  });
});
