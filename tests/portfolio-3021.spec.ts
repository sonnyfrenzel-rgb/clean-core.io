import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import { readSourceBytes, type OwnCodeFile } from '../lib/own-code-import';
import { readUploadedFile } from '../lib/own-code-zip';
import { portfolioAccessOf, millisOfStored } from '../lib/portfolio/access';
import { abapGitNameOf, splitIntoPrograms } from '../lib/portfolio/batch-split';
import { isClaimable, nextClaims, outcomeOfRun, programsInWindow, progressOf } from '../lib/portfolio/batch-model';
import { checkBatchHeader, checkUploadedProgram, stepBatch, appendPrograms, BatchRefusal } from '../lib/portfolio/batch-store';
import { portfolioStepFor, runInPortfolioStep } from '../lib/portfolio/run-context';
import { aggregatePortfolio, type ProgramFacts } from '../lib/portfolio/aggregate';
import { portfolioCsv, portfolioWorkbook, PROGRAM_COLUMNS } from '../lib/portfolio/export';
import { programFactsOf } from '../lib/portfolio/program-facts';
import { checkSelectionBody, mayReadSelection } from '../lib/portfolio/selection-store';
import { buildPortfolioInvitationEmail, PORTFOLIO_SCOPE_SENTENCE_RECIPIENT } from '../lib/portfolio/invitation-email';
import { INVITATION_SCOPE_SENTENCE_RECIPIENT } from '../lib/invitations';
import { safeReturnPath } from '../lib/return-path';
import {
  PORTFOLIO_BATCH_MAX_PROGRAMS,
  PORTFOLIO_STALE_CLAIM_MS,
  PORTFOLIO_STEP_MAX_ITEMS,
} from '../lib/portfolio/limits';

/**
 * Roadmap 3.0.21 — Portfolio, step 1: many programs in one run, one
 * aggregated view. Server-free: the pure modules, the queue against an
 * in-memory stand-in for the Admin SDK, and the source facts the routes rest on.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const enc = (s: string) => new TextEncoder().encode(s);

function file(name: string, text: string, id = name): OwnCodeFile {
  const { source, issues } = readSourceBytes(name, enc(text));
  return { id, name, bytes: text.length, zip: false, sources: source ? [source] : [], issues };
}

/* ------------------------------------------------------------------ access */

test.describe('access: own key stored and tested', () => {
  const base = { byokAllowed: true, keyStored: true, testedAtMs: 2000, rotatedAtMs: 1000 };

  test('open only with a stored key tested after its last save', () => {
    expect(portfolioAccessOf(base)).toMatchObject({ open: true, reason: 'open' });
    expect(portfolioAccessOf({ ...base, byokAllowed: false })).toMatchObject({ open: false, reason: 'byok-not-available' });
    expect(portfolioAccessOf({ ...base, keyStored: false })).toMatchObject({ open: false, reason: 'no-own-key' });
    expect(portfolioAccessOf({ ...base, testedAtMs: null })).toMatchObject({ open: false, reason: 'key-not-tested' });
    // Saved again after the test: untested again.
    expect(portfolioAccessOf({ ...base, testedAtMs: 1000, rotatedAtMs: 2000 })).toMatchObject({ open: false, reason: 'key-not-tested' });
  });

  test('a closed entry says why and names Settings', () => {
    for (const reason of ['no-own-key', 'key-not-tested'] as const) {
      const access = portfolioAccessOf({ ...base, keyStored: reason !== 'no-own-key', testedAtMs: null });
      expect(access.reason).toBe(reason);
      expect(access.message).toMatch(/Settings/);
    }
  });

  test('stored times are read from timestamps, dates and strings', () => {
    expect(millisOfStored({ toMillis: () => 42 })).toBe(42);
    expect(millisOfStored(new Date(7))).toBe(7);
    expect(millisOfStored('1970-01-01T00:00:00.010Z')).toBe(10);
    expect(millisOfStored(undefined)).toBeNull();
    expect(millisOfStored({})).toBeNull();
  });

  test('every portfolio route an owner calls goes through the access gate', () => {
    const routes = [
      'app/api/portfolio/batches/route.ts',
      'app/api/portfolio/batches/[batchId]/route.ts',
      'app/api/portfolio/selections/route.ts',
      'app/api/portfolio/selections/[selectionId]/invitations/route.ts',
    ];
    for (const rel of routes) {
      const src = read(rel);
      expect(src, rel).toContain('openPortfolioRoute(req');
      // Only the take-back routes are open without the key.
      const manage = [...src.matchAll(/mode: '(\w+)'/g)].map((m) => m[1]);
      for (const m of manage) expect(['manage']).toContain(m);
    }
    const view = read('app/api/portfolio/view/route.ts');
    expect(view).toContain("openPortfolioRoute(req, { bucket: 'portfolio-view'");
    expect(view).toContain('readPortfolioAccess(db, decodedToken.uid');
  });
});

test.describe('the test route records a passed test of the saved key', () => {
  test('the gate reads the one tested rule the quota and the switch read (ownKeyCounts)', () => {
    const src = read('lib/portfolio/access-server.ts');
    expect(src).toContain('ownKeyCounts(profile');
    expect(src).not.toContain('data?.testedAt');
  });
});

/* -------------------------------------------------------------- the split */

test.describe('batch split: one project per program', () => {
  test('two programs share an include; each gets it, each is ready', () => {
    const split = splitIntoPrograms([
      file('zrep_a.abap', "REPORT zrep_a.\nINCLUDE zshared_top.\nWRITE / gv_x.\n"),
      file('zrep_b.abap', "REPORT zrep_b.\nINCLUDE zshared_top.\nWRITE / gv_x.\n"),
      file('zshared_top.abap', 'DATA gv_x TYPE i.\n'),
    ]);
    expect(split.programs.map((p) => p.name)).toEqual(['ZREP_A', 'ZREP_B']);
    for (const p of split.programs) {
      expect(p.ready).toBe(true);
      expect(p.objects).toEqual([p.name, 'ZSHARED_TOP']);
      expect(p.source).toContain('DATA gv_x TYPE i.');
    }
  });

  test('an include nobody uploaded stays not read on that program only', () => {
    const split = splitIntoPrograms([
      file('zrep_a.abap', "REPORT zrep_a.\nINCLUDE zmissing_f01.\nWRITE / 'a'.\n"),
      file('zrep_b.abap', "REPORT zrep_b.\nWRITE / 'b'.\n"),
    ]);
    const a = split.programs.find((p) => p.name === 'ZREP_A')!;
    const b = split.programs.find((p) => p.name === 'ZREP_B')!;
    expect(a.missing).toEqual(['ZMISSING_F01']);
    expect(a.ready).toBe(true);
    expect(b.missing).toEqual([]);
  });

  test('an include loop makes that program not ready and leaves the others', () => {
    const split = splitIntoPrograms([
      file('zrep_ok.abap', "REPORT zrep_ok.\nWRITE / 'ok'.\n"),
      file('zrep_loop.abap', "REPORT zrep_loop.\nINCLUDE zinc_a.\n"),
      file('zinc_a.abap', "INCLUDE zinc_b.\nDATA a TYPE i.\n"),
      file('zinc_b.abap', "INCLUDE zinc_a.\nDATA b TYPE i.\n"),
    ]);
    expect(split.programs.find((p) => p.name === 'ZREP_OK')!.ready).toBe(true);
    const loop = split.programs.find((p) => p.name === 'ZREP_LOOP')!;
    expect(loop.ready).toBe(false);
    expect(loop.issues.some((i) => i.kind === 'include-cycle' || i.kind === 'include-repeated')).toBe(true);
    expect(split.ready.map((p) => p.name)).toEqual(['ZREP_OK']);
  });

  test('abapGit: a class and its local files are one program, a function group one program', () => {
    expect(abapGitNameOf('src/zcl_x.clas.locals_imp.abap')).toEqual({ type: 'clas', object: 'ZCL_X', sub: 'LOCALS_IMP' });
    expect(abapGitNameOf('src/#abc#prog.prog.abap')).toEqual({ type: 'prog', object: '/ABC/PROG', sub: null });
    expect(abapGitNameOf('zrep.abap')).toBeNull();
    const split = splitIntoPrograms([
      file('src/zcl_x.clas.abap', 'CLASS zcl_x DEFINITION PUBLIC CREATE PUBLIC.\nENDCLASS.\nCLASS zcl_x IMPLEMENTATION.\nENDCLASS.\n'),
      file('src/zcl_x.clas.locals_imp.abap', 'CLASS lcl_helper DEFINITION.\nENDCLASS.\nCLASS lcl_helper IMPLEMENTATION.\nENDCLASS.\n'),
      file('src/zfg.fugr.saplzfg.abap', 'INCLUDE lzfgtop.\nINCLUDE lzfguxx.\n'),
      file('src/zfg.fugr.lzfgtop.abap', 'FUNCTION-POOL zfg.\nDATA gv TYPE i.\n'),
      file('src/zfg.fugr.z_fg_read.abap', 'FUNCTION z_fg_read.\n  gv = 1.\nENDFUNCTION.\n'),
      file('src/zrep.prog.abap', 'REPORT zrep.\nINCLUDE zrep_top.\n'),
      file('src/zrep_top.prog.abap', 'DATA gv_top TYPE i.\n'),
    ]);
    expect(split.programs.map((p) => p.name)).toEqual(['ZCL_X', 'ZFG', 'ZREP']);
    const cls = split.programs.find((p) => p.name === 'ZCL_X')!;
    expect(cls.ready, JSON.stringify(cls.issues)).toBe(true);
    expect(cls.source).toContain('lcl_helper');
    const fg = split.programs.find((p) => p.name === 'ZFG')!;
    expect(fg.ready, JSON.stringify(fg.issues)).toBe(true);
    expect(fg.source).toContain('FUNCTION-POOL zfg.');
    expect(fg.source).toContain('FUNCTION z_fg_read.');
    expect(fg.missing).toEqual(['LZFGUXX']);
    const rep = split.programs.find((p) => p.name === 'ZREP')!;
    expect(rep.objects).toEqual(['ZREP', 'ZREP_TOP']);
    expect(rep.missing).toEqual([]);
  });

  test('a ZIP is cut the same way, and nothing beyond the batch limit is dropped in silence', async () => {
    const zip = new JSZip();
    const n = PORTFOLIO_BATCH_MAX_PROGRAMS + 3;
    for (let i = 0; i < n; i += 1) zip.file(`src/zr${String(i).padStart(3, '0')}.prog.abap`, `REPORT zr${String(i).padStart(3, '0')}.\nWRITE / 'x'.\n`);
    zip.file('src/package.devc.xml', '<asx/>');
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    const row = await readUploadedFile({ name: 'export.zip', size: bytes.length, arrayBuffer: async () => bytes.slice().buffer }, 'z1');
    const split = splitIntoPrograms([row]);
    expect(split.programs).toHaveLength(n);
    expect(split.ready).toHaveLength(PORTFOLIO_BATCH_MAX_PROGRAMS);
    expect(split.overLimit).toHaveLength(3);
    // The abapGit description file is named, not lost (counted as abapGit metadata since 3.0.21's include resolution).
    expect([...split.refused, ...split.programs].some((r) => (r.issues ?? []).some((i) => i.kind === 'zip-skipped' || i.kind === 'zip-abapgit-metadata'))).toBe(true);
  });
});

/* -------------------------------------------------------------- the queue */

test.describe('the queue as data', () => {
  test('progress counts what is done, running, failed; finished only when all arrived and settled', () => {
    const batch = { status: 'running' as const, total: 3 };
    expect(progressOf([{ status: 'done' }, { status: 'failed' }], batch).finished).toBe(false);
    expect(progressOf([{ status: 'done' }, { status: 'failed' }, { status: 'done' }], batch)).toMatchObject({ done: 2, failed: 1, finished: true });
    expect(progressOf([{ status: 'queued' }], { status: 'cancelled', total: 3 }).finished).toBe(true);
  });

  test('a step takes queued items in order, and running ones only once they are stale', () => {
    const now = 10_000_000;
    const items = [
      { id: 'c', seq: 2, status: 'queued' as const, claimedAt: null },
      { id: 'a', seq: 0, status: 'running' as const, claimedAt: now - 1000 },
      { id: 'b', seq: 1, status: 'running' as const, claimedAt: now - PORTFOLIO_STALE_CLAIM_MS - 1 },
      { id: 'd', seq: 3, status: 'done' as const, claimedAt: null },
    ];
    expect(isClaimable(items[1], now)).toBe(false);
    expect(nextClaims(items, now).map((i) => i.id)).toEqual(['b', 'c']);
    const many = Array.from({ length: 12 }, (_, i) => ({ seq: i, status: 'queued' as const, claimedAt: null }));
    expect(nextClaims(many, now)).toHaveLength(PORTFOLIO_STEP_MAX_ITEMS);
  });

  test('a run refusal becomes the item reason, in the route\'s own words', () => {
    expect(outcomeOfRun(200, { runId: 'r1' })).toEqual({ status: 'done', runId: 'r1' });
    expect(outcomeOfRun(400, { error: 'That does not look like ABAP.', code: 'not-abap' })).toEqual({
      status: 'failed',
      reason: 'That does not look like ABAP.',
      code: 'not-abap',
    });
    expect(outcomeOfRun(500, null)).toMatchObject({ status: 'failed', code: null });
  });

  test('the daily window counts programs of batches created in it', () => {
    expect(programsInWindow([{ createdAt: 100, total: 40 }, { createdAt: 5, total: 60 }], 110, 50)).toBe(40);
  });

  test('the upload is checked before any project exists', () => {
    expect(checkUploadedProgram({ name: 'ZREP', fileName: 'x/zrep.abap', source: "REPORT zrep.\nWRITE / 'x'.\n", missing: [] })).toMatchObject({
      ok: true,
      program: { name: 'ZREP', fileName: 'zrep.abap' },
    });
    expect(checkUploadedProgram({ name: 'ZREP', source: 'Dear team, please find attached.' })).toMatchObject({ ok: false });
    expect(checkUploadedProgram({ name: '', source: 'REPORT z.' })).toMatchObject({ ok: false });
    expect(checkUploadedProgram({ name: 'Z', source: `REPORT z.\n${'*'.repeat(300 * 1024)}` })).toMatchObject({ ok: false });
    expect(() => checkBatchHeader({ total: 0, edition: 'public' })).toThrow(BatchRefusal);
    expect(() => checkBatchHeader({ total: PORTFOLIO_BATCH_MAX_PROGRAMS + 1, edition: 'public' })).toThrow(BatchRefusal);
    expect(() => checkBatchHeader({ total: 1, edition: 'onprem' })).toThrow(BatchRefusal);
    expect(checkBatchHeader({ total: 2, edition: 'private', release: '2025' })).toMatchObject({ edition: 'private', release: '2025', total: 2 });
  });
});

/* ---------------------------------------- the step against a stand-in Firestore */

const DELETE = Symbol('delete');
const fieldValue = { delete: () => DELETE, serverTimestamp: () => 'server-time', arrayUnion: (v: string) => v, arrayRemove: (v: string) => v };

class FakeDb {
  docs = new Map<string, Record<string, unknown>>();
  seq = 0;
  collection(p: string) {
    return new FakeCol(this, p);
  }
  async runTransaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
    const tx = {
      get: (r: { get: () => Promise<unknown> }) => r.get(),
      update: (r: FakeDoc, d: Record<string, unknown>) => r.applyUpdate(d),
      create: (r: FakeDoc, d: Record<string, unknown>) => r.applyCreate(d),
    };
    return fn(tx);
  }
  batch() {
    const ops: (() => void)[] = [];
    return {
      create: (r: FakeDoc, d: Record<string, unknown>) => ops.push(() => r.applyCreate(d)),
      update: (r: FakeDoc, d: Record<string, unknown>) => ops.push(() => r.applyUpdate(d)),
      commit: async () => ops.forEach((op) => op()),
    };
  }
}
class FakeCol {
  constructor(
    readonly db: FakeDb,
    readonly path: string,
    readonly filter: ((d: Record<string, unknown>) => boolean) | null = null,
  ) {}
  doc(id?: string) {
    return new FakeDoc(this.db, `${this.path}/${id ?? `auto${++this.db.seq}`}`);
  }
  where(field: string, op: string, value: unknown) {
    return new FakeCol(this.db, this.path, (d) => (op === 'in' ? (value as unknown[]).includes(d[field]) : d[field] === value));
  }
  select() {
    return this;
  }
  async get() {
    const docs = [...this.db.docs.entries()]
      .filter(([k]) => k.startsWith(`${this.path}/`) && !k.slice(this.path.length + 1).includes('/'))
      .filter(([, d]) => !this.filter || this.filter(d))
      .map(([k, d]) => ({ id: k.split('/').pop()!, data: () => ({ ...d }) }));
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
  collection(name: string) {
    return new FakeCol(this.db, `${this.path}/${name}`);
  }
  async get() {
    const d = this.db.docs.get(this.path);
    return { exists: Boolean(d), id: this.id, data: () => (d ? { ...d } : undefined) };
  }
  applyCreate(d: Record<string, unknown>) {
    if (this.db.docs.has(this.path)) throw new Error(`exists: ${this.path}`);
    this.db.docs.set(this.path, { ...d });
  }
  applyUpdate(d: Record<string, unknown>) {
    const cur = this.db.docs.get(this.path);
    if (!cur) throw new Error(`missing: ${this.path}`);
    for (const [k, v] of Object.entries(d)) {
      if (v === DELETE) delete cur[k];
      else cur[k] = v;
    }
  }
  async update(d: Record<string, unknown>) {
    this.applyUpdate(d);
  }
  async create(d: Record<string, unknown>) {
    this.applyCreate(d);
  }
}

test.describe('a step makes each project and signs it through the run route, engine only', () => {
  async function seeded() {
    const db = new FakeDb();
    db.docs.set('portfolio_batches/b1', { userId: 'u1', name: 'B', edition: 'private', release: '2025', total: 3, appended: 0, status: 'queued', createdAt: 1 });
    await appendPrograms(db as never, 'u1', 'b1', [
      { name: 'ZREP_A', fileName: 'zrep_a.abap', source: "REPORT zrep_a.\nWRITE / 'a'.\n", missing: [] },
      { name: 'ZREP_B', fileName: 'zrep_b.abap', source: "REPORT zrep_b.\nWRITE / 'b'.\n", missing: ['ZINC'] },
      { name: 'ZPROSE', fileName: 'note.txt', source: 'Please find attached the quarterly figures.', missing: [] },
    ]);
    return db;
  }

  test('queued programs become projects, signed with no narrative; a refusal is the reason; the source leaves the item', async () => {
    const db = await seeded();
    expect(db.docs.get('portfolio_batches/b1/items/p0002')).toMatchObject({ status: 'failed', projectId: null });
    const calls: Record<string, unknown>[] = [];
    const result = await stepBatch(db as never, fieldValue as never, 'u1', 'b1', async (body) => {
      calls.push(body);
      return body.uploadedFileName === 'zrep_b.abap'
        ? { status: 409, body: { error: 'The source on this project changed while this analysis was running.', code: 'source-moved' } }
        : { status: 200, body: { runId: `run-${calls.length}` } };
    });
    expect(calls).toHaveLength(2);
    for (const c of calls) {
      expect(c.analysis).toBe('');
      expect(c).not.toHaveProperty('modelReceipt');
      expect(c.s4Deployment).toBe('private');
      expect(c.targetProfile).toEqual({ release: '2025' });
    }
    const projects = [...db.docs.entries()].filter(([k]) => /^projects\/[^/]+$/.test(k)).map(([, d]) => d);
    expect(projects).toHaveLength(2);
    for (const p of projects) {
      expect(p).toMatchObject({ userId: 'u1', status: 'uploaded', s4Deployment: 'private', portfolioBatchId: 'b1' });
      expect(typeof p.legacyCode).toBe('string');
    }
    const a = db.docs.get('portfolio_batches/b1/items/p0000')!;
    const b = db.docs.get('portfolio_batches/b1/items/p0001')!;
    expect(a).toMatchObject({ status: 'done', runId: 'run-1' });
    expect(a).not.toHaveProperty('source');
    expect(b).toMatchObject({ status: 'failed', code: 'source-moved' });
    expect(String(b.reason)).toContain('changed while this analysis was running');
    expect(result.progress).toMatchObject({ done: 1, failed: 2, finished: true });
    expect(db.docs.get('portfolio_batches/b1')!.status).toBe('done');
  });

  test('another account gets "no such batch", and nothing is signed', async () => {
    const db = await seeded();
    let signed = 0;
    await expect(
      stepBatch(db as never, fieldValue as never, 'u2', 'b1', async () => {
        signed += 1;
        return { status: 200, body: { runId: 'x' } };
      }),
    ).rejects.toThrow(BatchRefusal);
    expect(signed).toBe(0);
  });

  test('an item taken again after a lost step whose project already holds a run is done, not signed twice', async () => {
    const db = await seeded();
    db.docs.set('projects/px', { userId: 'u1', activeRunId: 'run-earlier' });
    Object.assign(db.docs.get('portfolio_batches/b1/items/p0000')!, { status: 'running', claimedAt: 0, projectId: 'px' });
    delete db.docs.get('portfolio_batches/b1/items/p0000')!.source;
    const calls: unknown[] = [];
    await stepBatch(db as never, fieldValue as never, 'u1', 'b1', async (body) => {
      calls.push(body);
      return { status: 200, body: { runId: 'new' } };
    });
    expect(db.docs.get('portfolio_batches/b1/items/p0000')).toMatchObject({ status: 'done', runId: 'run-earlier' });
    expect(calls.every((c) => (c as { projectId: string }).projectId !== 'px')).toBe(true);
  });
});

test.describe('one signing path: the run route, its own limit replaced only inside a step', () => {
  test('the step context exists only inside the step, and only for its own account', async () => {
    expect(portfolioStepFor('u1')).toBeNull();
    await runInPortfolioStep({ uid: 'u1', batchId: 'b1' }, async () => {
      expect(portfolioStepFor('u1')).toEqual({ uid: 'u1', batchId: 'b1' });
      expect(portfolioStepFor('u2')).toBeNull();
      await new Promise((r) => setTimeout(r, 1));
      expect(portfolioStepFor('u1')).not.toBeNull();
    });
    expect(portfolioStepFor('u1')).toBeNull();
  });

  test('the run route skips its hourly limit only for a step of the same account', () => {
    const src = read('app/api/runs/create/route.ts');
    expect(src).toMatch(/if \(!portfolioStepFor\(decodedToken\.uid\)\) await assertRateLimit\(`runs-create:\$\{decodedToken\.uid\}`, 30,/);
    const step = read('app/api/portfolio/batches/[batchId]/route.ts');
    expect(step).toContain("import { POST as createSignedRun } from '@/app/api/runs/create/route';");
    expect(step).toMatch(/runInPortfolioStep\(\{ uid: gate\.uid, batchId \}, \(\) => createSignedRun\(inner\)\)/);
    // The step signs nothing of its own.
    expect(read('lib/portfolio/batch-store.ts')).not.toMatch(/createHmac|canonicalizeJson|buildAbapEvidence/);
  });
});

/* -------------------------------------------------------- the aggregated view */

function program(id: string, over: Partial<ProgramFacts> = {}): ProgramFacts {
  return { projectId: id, name: id.toUpperCase(), analysed: true, score: 95, includesNotRead: [], objects: [], kinds: [], ...over };
}

test.describe('aggregated view', () => {
  const facts: ProgramFacts[] = [
    program('a', {
      score: 40,
      includesNotRead: ['ZINC'],
      objects: [
        { name: 'BSEG', sap: true, level: 'D', use: 'write', bucket: 'rebuild', notAssigned: null },
        { name: 'ZTAB', sap: false, level: 'C', use: 'write', bucket: 'rebuild', notAssigned: null },
      ],
      kinds: [{ kind: 'standard-table-write', label: 'direct write to an SAP table', count: 2 }],
    }),
    program('b', {
      score: 85,
      objects: [
        { name: 'BSEG', sap: true, level: 'C', use: 'read', bucket: null, notAssigned: 'target-platform-not-set' },
        { name: 'MARA', sap: true, level: 'Unknown', use: 'read', bucket: null, notAssigned: 'level-not-determined' },
      ],
      kinds: [{ kind: 'standard-table-write', label: 'direct write to an SAP table', count: 1 }],
    }),
    program('c', { analysed: false, score: null }),
  ];
  const view = aggregatePortfolio(facts, 1);

  test('coverage names every part, including what is missing', () => {
    expect(view.coverage).toEqual({ projects: 4, analysed: 2, notAnalysed: 1, includesNotRead: 1, missingProjects: 1 });
  });

  test('never a portfolio score: bands only, and no average anywhere in the result', () => {
    expect(view.bands.find((b) => b.key === 'far')!.programs.map((p) => p.projectId)).toEqual(['a']);
    expect(view.bands.find((b) => b.key === 'some')!.programs.map((p) => p.projectId)).toEqual(['b']);
    expect(view.bands.flatMap((b) => b.programs).some((p) => p.projectId === 'c')).toBe(false);
    const keys = JSON.stringify(view, (k, v) => v).match(/"[A-Za-z]+":/g) ?? [];
    expect(keys.join(' ')).not.toMatch(/average|mean|portfolioScore|overallScore|percent/i);
    expect(read('lib/portfolio/aggregate.ts')).not.toMatch(/\/\s*(?:view\.)?programs\.length|reduce\([^)]*score/);
  });

  test('levels count SAP objects once per program; customer objects are not graded here', () => {
    const level = (g: string) => view.levels.find((l) => l.grade === g)!;
    expect(level('D').uses).toBe(1);
    expect(level('C').uses).toBe(1);
    expect(level('Unknown').uses).toBe(1);
    expect(view.levelUses).toBe(3);
  });

  test('buckets keep not assigned as its own area, with the reason counted under not determined', () => {
    expect(view.buckets.find((b) => b.bucket === 'rebuild')!.objects).toBe(2);
    expect(view.buckets.find((b) => b.bucket === 'not-assigned')!.objects).toBe(2);
    const nd = Object.fromEntries(view.notDetermined.map((f) => [f.key, f.programs.map((p) => p.projectId)]));
    expect(nd).toMatchObject({
      'not-analysed': ['c'],
      'includes-not-read': ['a'],
      'level-unknown': ['b'],
      'target-platform-not-set': ['b'],
      'level-not-determined': ['b'],
    });
  });

  test('recurring objects need two programs; written wins over read; kinds name their programs', () => {
    expect(view.recurring).toEqual([{ object: 'BSEG', use: 'written', programs: [{ projectId: 'a', name: 'A' }, { projectId: 'b', name: 'B' }] }]);
    expect(view.kinds).toEqual([
      { kind: 'standard-table-write', label: 'direct write to an SAP table', findings: 3, programs: [{ projectId: 'a', name: 'A' }, { projectId: 'b', name: 'B' }] },
    ]);
  });

  test('a program is read from its signed run: score, findings, levels and buckets', () => {
    const facts = programFactsOf(
      { id: 'p1', data: { name: 'ZFI', userId: 'u', s4Deployment: 'public', legacyCode: "REPORT zfi.\nINCLUDE zfi_top.\n" } },
      { status: 'completed', cleanCoreScore: 55, evidenceReport: [{ kind: 'standard-table-write', objectName: 'BSEG' }, { kind: 'standard-table-read', objectName: 'BKPF' }] },
    );
    expect(facts).toMatchObject({ projectId: 'p1', name: 'ZFI', analysed: true, score: 55, includesNotRead: ['ZFI_TOP'] });
    const bseg = facts.objects.find((o) => o.name === 'BSEG')!;
    expect(bseg).toMatchObject({ sap: true, use: 'write' });
    expect(['A', 'B', 'C', 'D', 'Unknown']).toContain(bseg.level);
    // A direct write to an SAP table is the project's own work (ADR-033).
    expect(bseg.bucket).toBe('rebuild');
    expect(facts.kinds.map((k) => k.kind).sort()).toEqual(['standard-table-read', 'standard-table-write']);
    const none = programFactsOf({ id: 'p2', data: { name: 'Z2', legacyCode: 'REPORT z2.' } }, null);
    expect(none).toMatchObject({ analysed: false, score: null, objects: [], kinds: [] });
  });
});

/* ---------------------------------------------------------------- exports */

test.describe('exports', () => {
  const view = aggregatePortfolio([
    program('a', { name: '=HYPERLINK("http://evil")', score: 92 }),
    program('b', { analysed: false, score: null }),
  ]);

  test('CSV: one row per program, every cell guarded against formulas', () => {
    const csv = portfolioCsv(view);
    const lines = csv.trim().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe(PROGRAM_COLUMNS.map((c) => `"${c}"`).join(','));
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"")"`);
  });

  test('XLSX with the libraries already in package.json, saying what it is', async () => {
    const ExcelJS = (await import('exceljs')).default;
    const buffer = await portfolioWorkbook(ExcelJS as never, view, 'Test');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Overview', 'Programs', 'Recurring SAP objects', 'Kinds of finding', 'Not determined']);
    expect(wb.description).toMatch(/Not signed, not an audit pack/);
    const programs = wb.getWorksheet('Programs')!;
    expect(String(programs.getRow(2).getCell(1).value)).toBe(`'=HYPERLINK("http://evil")`);
    const pkg = JSON.parse(read('package.json'));
    expect(Object.keys(pkg.dependencies)).toContain('exceljs');
  });

  test('nothing aggregated is signed or put into an audit pack', () => {
    for (const rel of ['lib/portfolio/aggregate.ts', 'lib/portfolio/export.ts', 'lib/portfolio/selection-store.ts', 'app/api/portfolio/view/route.ts']) {
      const src = read(rel);
      expect(src, rel).not.toMatch(/createHmac|createSign|getAuditSigningKey|audit-pack/);
    }
  });
});

/* ------------------------------------------------------- selections and sharing */

test.describe('selections and sharing', () => {
  test('a selection is a list of valid, distinct ids with a name', () => {
    expect(checkSelectionBody({ name: ' Finance ', projectIds: ['a1', 'a1', 'b2', '../x'] })).toEqual({ name: 'Finance', projectIds: ['a1', 'b2'] });
    expect(() => checkSelectionBody({ name: '', projectIds: ['a'] })).toThrow(BatchRefusal);
    expect(() => checkSelectionBody({ name: 'x', projectIds: [] })).toThrow(BatchRefusal);
  });

  test('the owner and accepted readers read it; nobody else', () => {
    const sel = { ownerId: 'o', readers: ['r'] };
    expect(mayReadSelection(sel, 'o')).toBe('owner');
    expect(mayReadSelection(sel, 'r')).toBe('reader');
    expect(mayReadSelection(sel, 'x')).toBeNull();
  });

  test('the invitation mail says it opens the overview, not the source code', () => {
    expect(PORTFOLIO_SCOPE_SENTENCE_RECIPIENT).not.toBe(INVITATION_SCOPE_SENTENCE_RECIPIENT);
    const html = buildPortfolioInvitationEmail({
      inviterName: 'A',
      recipient: 'r@example.com',
      link: 'https://clean-core.io/portfolio/invitation/s/i',
      expires: '1 Nov 2026',
      unsubscribeUrl: 'https://clean-core.io/unsubscribe/invitations#t=x',
    });
    // C12 (owner decision 23.10.2026): the overview only — no project, no source code.
    expect(html).toContain('No project and no source code is opened.');
    expect(html).toContain('that one portfolio overview');
    expect(html).not.toContain('including the ABAP source code');
    // One mail, no reminder, and the way out onto the list shared with project invitations.
    expect(html).toContain('You receive exactly this one e-mail; we send no reminder and no advertising.');
    expect(html).toContain('Unsubscribe: <a href="https://clean-core.io/unsubscribe/invitations#t=x"');
    // The inviting account is named as unchecked, as in the project mail (SEC-02).
    expect(html).toContain('whose holder entered the name A. Clean-Core.io has not checked that name.');
  });

  test('sign-in may return to the portfolio invitation and the shared overview only in their exact shape', () => {
    expect(safeReturnPath('/portfolio')).toBe('/portfolio');
    expect(safeReturnPath('/portfolio/invitation/abc123/def_456')).toBe('/portfolio/invitation/abc123/def_456');
    expect(safeReturnPath('/portfolio/shared/abc123')).toBe('/portfolio/shared/abc123');
    expect(safeReturnPath('/portfolio/invitation/abc')).toBeNull();
    expect(safeReturnPath('/portfolio/../admin')).toBeNull();
  });

  test('accepting reuses the project rules: confirmed address, one answer for every closed link', () => {
    const src = read('app/api/portfolio/selections/[selectionId]/invitations/[invitationId]/accept/route.ts');
    expect(src).toContain("decodedToken.email_verified !== true");
    expect(src).toContain('requireCurrentTerms: true');
    expect(src).not.toContain('readPortfolioAccess');
    const store = read('lib/portfolio/selection-invitations.ts');
    expect(store).toContain('INVITATION_MAX_OPEN');
    expect(store).toContain("crypto.randomBytes(24).toString('base64url')");
    expect(store).toContain('tx.create(ref');
  });
});

/* ------------------------------------------------------------ the entry */

test('My workspace carries the way into the portfolio, for every account', () => {
  const src = read('components/workspace/WorkspaceListReport.tsx');
  const at = src.indexOf('data-workspace-portfolio=""');
  expect(at).toBeGreaterThan(-1);
  expect(src.slice(Math.max(0, at - 200), at)).toContain('<CcLinkButton href="/portfolio"');
  // Outside the `hasOwn` branch: a new account with an own key starts here too.
  const actions = src.slice(src.indexOf('actions={', src.indexOf("title={t('workspace.projects')}")));
  expect(actions.indexOf('data-workspace-portfolio')).toBeLessThan(actions.indexOf('{hasOwn ?'));
});

test('account erasure takes the portfolio with it', () => {
  const admin = read('lib/firebase-admin.ts');
  expect(admin).toContain("await tryDelete('portfolio', () => erasePortfolioOf(db, FieldValue, uid));");
  const erasure = read('lib/portfolio/erasure.ts');
  expect(erasure).toContain("['portfolio_batches', 'userId']");
  expect(erasure).toContain("['portfolio_selections', 'ownerId']");
  expect(erasure).toContain("where('readers', 'array-contains', uid)");
  expect(read('lib/portfolio/selection-invitations.ts')).toContain("export const SELECTION_INVITATIONS = 'invitations';");
});
